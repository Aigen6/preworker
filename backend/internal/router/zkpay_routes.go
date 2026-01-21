// ZKPay API configuration -  ZKPay.sol contract
package router

import (
	"go-backend/internal/app"
	"go-backend/internal/clients"
	"go-backend/internal/config"
	"go-backend/internal/handlers"
	"go-backend/internal/middleware"
	"go-backend/internal/repository"
	"go-backend/internal/services"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// SetupZKPayRoutes  ZKPay API routes
func SetupZKPayRoutes(r *gin.Engine, db *gorm.DB, kmsHandler *handlers.KMSHandler, wsHandler *handlers.WebSocketHandler, pushService *services.WebSocketPushService, localhostOnly *middleware.LocalhostOnly) {
	// create
	authMiddleware := middleware.NewAuthMiddleware(logrus.New())
	// API routes group
	api := r.Group("/api")
	{
		// ============  ============
		authHandler := handlers.NewAuthHandler()
		auth := api.Group("/auth")
		{
			// getnonce
			auth.GET("/nonce", authHandler.GenerateNonceHandler)

			// user（wallet signature）
			auth.POST("/login", authHandler.AuthenticateHandler)
		}
		// ============ deposit ============
		deposits := api.Group("/deposits")
		{
			// getdeposit
			deposits.GET("/:chainId/:localDepositId", handlers.GetDepositHandler)
		}

		// ============ needdepositquery ============
		secureDeposits := api.Group("/deposits")
		secureDeposits.Use(authMiddleware.RequireAuth()) // addJWT
		{
			// addressquerydeposit (addressquery) - needJWTverifymatch
			secureDeposits.GET("/by-owner", handlers.GetDepositsByOwnerHandler)
		}

		// ============  ============
		commitments := api.Group("/commitments")
		commitments.Use(authMiddleware.RequireAuth())
		{
			//  commitment proof
			commitments.POST("/submit", handlers.BuildCommitmentHandler)
		}

		// ============ Checkbook ============
		checkbooks := api.Group("/checkbooks")
		{
			// Create checkbook (for testing - allows direct API creation)
			// In production, checkbooks are created automatically from DepositReceived events
			// DEPRECATED: Disabled for security reasons in production
			// checkbooks.POST("", handlers.CreateCheckbookHandler)

			// List my checkbooks with pagination (need JWT)
			checkbooks.GET("", authMiddleware.RequireAuth(), handlers.GetCheckbooksListHandler)

			// IDquerycheckbook (need)
			checkbooks.GET("/id/:id", authMiddleware.RequireAuth(), handlers.GetCheckbookByIDHandler)

			// TODO: Phase 5 - ，
			// checkbooks.GET("/:chain_id/:local_deposit_id", handlers.GetCheckbookWithChecksHandler)

			// deleteCheckbookrecord (need，，statusDELETED)
			checkbooks.DELETE("/:id", authMiddleware.RequireAuth(), handlers.DeleteCheckbookHandler)

			// Lookup Checkbook by Deposit (IP Whitelisted)
			// Used by backend services
			if localhostOnly != nil {
				checkbooks.GET("/by-deposit/:chain_id/:tx_hash", localhostOnly.Restrict(), handlers.GetCheckbookByDepositHandler)
			}
		}

		// ============ Retry ============
		retryCheckbookRepo := repository.NewCheckbookRepository(db)
		// Use service container's BlockchainTxService for consistency
		retryCheckbookService := services.NewCheckbookService(retryCheckbookRepo, db, app.Container.UnifiedPollingService, pushService, app.Container.ZKVMClient, app.Container.BlockchainTxService)
		retryHandler := handlers.NewRetryHandler(db, app.Container.UnifiedPollingService, pushService, retryCheckbookService)
		retry := api.Group("/retry")
		retry.Use(authMiddleware.RequireAuth()) // need JWT
		{
			// Retry checkbook (重新生成证明或重新提交)
			retry.POST("/checkbook/:id", func(c *gin.Context) {
				// Pass Gin context to handler so it can use c.Param("id")
				retryHandler.HandleCheckbookRetryWithContext(c)
			})
		}

		// ============ Allocations (Checks) ============
		// Allocations are checks that belong to checkbooks
		// This endpoint allows querying allocations across multiple checkbooks
		allocations := api.Group("/allocations")
		// Use OptionalAuth: if JWT is provided, validate it; if not, allow access but owner filter won't work
		allocations.Use(authMiddleware.OptionalAuth())
		{
			// List allocations with filters (checkbookId, tokenId, status, owner)
			// Owner filter requires JWT authentication (checked in handler)
			allocations.GET("", handlers.ListAllocationsHandler)

			// Search allocations (Batch query) - Secured by IP Whitelist
			// Supports querying by chain_id and list of addresses
			if localhostOnly != nil {
				allocations.POST("/search", localhostOnly.Restrict(), handlers.SearchAllocationsHandler)
			}

			// Get single allocation by ID
			allocations.GET("/:id", handlers.GetAllocationByIDHandler)
		}

		// ============ Create Allocations (requires auth) ============
		// NOTE: POST /api/allocations has been removed
		// Use POST /api/commitments/submit instead, which handles:
		// 1. Creating allocations
		// 2. Calling ZKVM service to generate proof
		// 3. Submitting commitment to blockchain
		// 4. Updating allocations status to 'idle'

		// ============ Check ============
		// TODO: Phase 5 - ，
		// checks := v2.Group("/checks")
		// checks.Use(authMiddleware.RequireAuth())
		// {
		// 	checks.GET("/id/:id", handlers.GetCheckByIDHandler)
		// 	checks.POST("/generate-proof", handlers.GenerateWithdrawProofHandler)
		// }

		// ============ withdraw (moved to WithdrawRequestHandler below) ============
		// Old handler removed: handlers.BuildWithdrawHandler (uses credentials format)
		// New handler: withdrawRequestHandler.CreateWithdrawRequestHandler (uses Intent format) - see below

		// ============ check ============
		// GET /api/health
		api.GET("/health", handlers.HealthCheckHandler)

		// ============ Pool  ( - ) ============
		// :  22 -> 13 ( 41%)
		// : Pool ， Tokens
		// Asset Token ID = Pool ID (4 bytes) + Token ID (2 bytes)
		poolHandler := handlers.NewPoolHandler()
		{
			// Pool  (4)
			api.GET("/pools", poolHandler.ListPoolsHandler)                 //  Pool
			api.GET("/pools/featured", poolHandler.GetFeaturedPoolsHandler) //  Pool
			api.GET("/pools/:id", poolHandler.GetPoolHandler)               //  Pool ( tokens)
			api.GET("/pools/:id/tokens", poolHandler.GetPoolTokensHandler)  //  Pool  Token

			// Token  (2)
			api.GET("/pools/:id/tokens/:token_id", poolHandler.GetTokenHandler) //  Token

			//  (1)
			api.GET("/tokens", poolHandler.ListTokensHandler)          // List all tokens (supports ?isActive=true)
			api.GET("/tokens/search", poolHandler.SearchTokensHandler) //  Token (keyword)
		}

		// ============ Token Prices ============
		priceHandler := handlers.NewPriceHandler()
		{
			// SDK-compatible endpoint: GET /api/prices?symbols=USDT,USDC
			api.GET("/prices", priceHandler.GetPricesHandler) // Get token prices by symbols (SDK compatible)

			// Get price for a single token
			api.GET("/tokens/:asset_id/price", priceHandler.GetTokenPriceHandler) // Get current price and 24h change

			// Get prices for multiple tokens
			api.POST("/tokens/prices", priceHandler.GetMultipleTokenPricesHandler) // Get prices for multiple tokens

			// Get historical price data
			api.GET("/tokens/:asset_id/price-history", priceHandler.GetTokenPriceHistoryHandler) // Get price history
		}

		// ============ Statistics ============
		statisticsHandler := handlers.NewStatisticsHandler()
		{
			// Get global statistics (total locked value, total volume, private tx count, active users)
			api.GET("/statistics/overview", statisticsHandler.GetStatisticsHandler) // Get global statistics
		}

		// ============ User Statistics (JWT 认证 或 IP 白名单) ============
		userStatistics := api.Group("/statistics")
		userStatistics.Use(authMiddleware.OptionalAuth()) // 🔓 可选 JWT 认证（支持 IP 白名单）
		{
			// 存款统计
			// 支持两种方式：
			// 1. JWT 认证：Authorization: Bearer <token>
			// 2. IP 白名单：?address=0x...&chain_id=714（IP 需在配置的白名单中）
			userStatistics.GET("/checkbooks/daily", statisticsHandler.GetCheckbooksDailyStatisticsHandler) // 按天统计存款
			// 提款统计
			userStatistics.GET("/withdraws/daily", statisticsHandler.GetWithdrawsDailyStatisticsHandler) // 按天统计提款
		}

		// ============ Quote & Preview (Public - SDK Support) ============
		quoteHandler := handlers.NewQuoteHandler()
		quote := api.Group("/quote")
		{
			// 路由与费用查询
			quote.POST("/route-and-fees", quoteHandler.GetRouteAndFeesHandler) // Query optimal route, bridge fees, gas estimates

			// Hook 资产信息查询
			quote.POST("/hook-asset", quoteHandler.GetHookAssetHandler) // Query Hook asset APY, fees, conversion
		}

		// ============ Dynamic Metrics (Public - 用户端只读) ============
		metricsQueryHandler := handlers.NewMetricsQueryHandler()
		{
			// Pool Metrics (Public)
			api.GET("/pools/:id/metrics", metricsQueryHandler.GetPoolMetricsHandler)                // 获取 Pool 当前指标
			api.GET("/pools/:id/metrics/history", metricsQueryHandler.GetPoolMetricsHistoryHandler) // 获取 Pool 历史指标
			api.POST("/pools/metrics", metricsQueryHandler.GetMultiplePoolMetricsHandler)           // 批量获取多个 Pool 指标

			// Token Metrics (Public)
			api.GET("/tokens/:asset_id/metrics", metricsQueryHandler.GetTokenMetricsHandler)                // 获取 Token 当前指标
			api.GET("/tokens/:asset_id/metrics/history", metricsQueryHandler.GetTokenMetricsHistoryHandler) // 获取 Token 历史指标
			api.POST("/tokens/metrics", metricsQueryHandler.GetMultipleTokenMetricsHandler)                 // 批量获取多个 Token 指标
		}

		// ============ Dynamic Metrics Management ( - localhost) ============
		adminMetricsHandler := handlers.NewAdminMetricsHandler()
		adminMetrics := api.Group("/admin")
		adminMetrics.Use(localhostOnly.Restrict())
		{
			// Pool Metrics
			adminMetrics.POST("/pools/:id/metrics", adminMetricsHandler.UpdatePoolMetricsHandler)
			adminMetrics.GET("/pools/:id/metrics", adminMetricsHandler.GetPoolMetricsHandler)
			adminMetrics.GET("/pools/:id/metrics/current", adminMetricsHandler.GetPoolCurrentMetricsHandler)

			// Asset Token Metrics
			adminMetrics.POST("/tokens/:asset_id/metrics", adminMetricsHandler.UpdateTokenMetricsHandler)
			adminMetrics.GET("/tokens/:asset_id/metrics", adminMetricsHandler.GetTokenMetricsHandler)
			adminMetrics.GET("/tokens/:asset_id/metrics/current", adminMetricsHandler.GetTokenCurrentMetricsHandler)

			// Batch Operations
			adminMetrics.POST("/metrics/batch", adminMetricsHandler.BatchUpdateMetricsHandler)
		}

		// ============ Pool  ( -  localhost) ============
		adminPoolHandler := handlers.NewAdminPoolHandler()
		adminPools := api.Group("/admin/pools")
		adminPools.Use(localhostOnly.Restrict()) // allow ()
		{
			// Pool  (5)
			adminPools.GET("", adminPoolHandler.ListAllPoolsHandler)      //  Pool ()
			adminPools.GET("/:id", adminPoolHandler.GetPoolHandler)       //  Pool
			adminPools.POST("", adminPoolHandler.CreatePoolHandler)       //  Pool ( featured)
			adminPools.PUT("/:id", adminPoolHandler.UpdatePoolHandler)    //  Pool ( featured)
			adminPools.DELETE("/:id", adminPoolHandler.DeletePoolHandler) //  Pool

			// Token  (5)
			adminPools.GET("/:id/tokens/:token_id", adminPoolHandler.GetTokenHandler)       //  Token
			adminPools.POST("/:id/tokens", adminPoolHandler.CreateTokenHandler)             //  Token
			adminPools.PUT("/:id/tokens/:token_id", adminPoolHandler.UpdateTokenHandler)    //  Token
			adminPools.DELETE("/:id/tokens/:token_id", adminPoolHandler.DeleteTokenHandler) //  Token

			// Token Chain Configuration (Token Address Configuration)
			adminPools.GET("/:id/tokens/:token_id/chain-config", adminPoolHandler.GetTokenChainConfigHandler)             // Get token chain config
			adminPools.POST("/:id/tokens/:token_id/chain-config", adminPoolHandler.CreateOrUpdateTokenChainConfigHandler) // Create or update token chain config
			adminPools.DELETE("/:id/tokens/:token_id/chain-config", adminPoolHandler.DeleteTokenChainConfigHandler)       // Delete token chain config
		}

		// ============ RawToken 管理 ( - 仅 localhost) ============
		// Refactored: Each chain's token is a separate Raw Token record
		adminRawTokenHandler := handlers.NewAdminRawTokenHandler()
		adminRawTokens := api.Group("/admin/rawtokens")
		adminRawTokens.Use(localhostOnly.Restrict()) // 仅允许本地访问
		{
			// Raw Token 管理 (简化为 5 个核心接口)
			adminRawTokens.GET("", adminRawTokenHandler.ListAllRawTokensHandler)      // 列出所有 Raw Token
			adminRawTokens.GET("/:id", adminRawTokenHandler.GetRawTokenHandler)       // 获取单个 Raw Token (by ID)
			adminRawTokens.POST("", adminRawTokenHandler.CreateRawTokenHandler)       // 创建 Raw Token
			adminRawTokens.PUT("/:id", adminRawTokenHandler.UpdateRawTokenHandler)    // 更新 Raw Token
			adminRawTokens.DELETE("/:id", adminRawTokenHandler.DeleteRawTokenHandler) // 删除 Raw Token
		}

		// ============ 文件上传管理 ( - 仅 localhost) ============
		fileUploadHandler := handlers.NewFileUploadHandler("./uploads", "http://localhost:3001")
		adminUpload := api.Group("/admin/upload")
		adminUpload.Use(localhostOnly.Restrict()) // 仅允许本地访问
		{
			adminUpload.POST("/image", fileUploadHandler.UploadImageHandler)             // 上传图片
			adminUpload.DELETE("/image/:filename", fileUploadHandler.DeleteImageHandler) // 删除图片
			adminUpload.GET("/images", fileUploadHandler.ListImagesHandler)              // 列出所有图片
		}

		// ============ 合约信息读取 ( - 仅 localhost) ============
		contractReaderHandler := handlers.NewContractReaderHandler()
		adminTokens := api.Group("/admin/tokens")
		adminTokens.Use(localhostOnly.Restrict()) // 仅允许本地访问
		{
			adminTokens.POST("/read-contract", contractReaderHandler.ReadERC20ContractHandler)         // 读取 ERC20 合约信息 (通过 pool_id)
			adminTokens.POST("/read-contract-by-chain", contractReaderHandler.ReadERC20ByChainHandler) // 读取 ERC20 合约信息 (通过 chain_id)
		}

		// ============  WithdrawRequest  (need) ============
		withdrawRequestRepo := repository.NewWithdrawRequestRepository(db)
		allocationRepo := repository.NewAllocationRepository(db)
		checkbookRepo := repository.NewCheckbookRepository(db)
		queueRootRepo := repository.NewQueueRootRepository(db)
		withdrawRequestService := services.NewWithdrawRequestService(withdrawRequestRepo, allocationRepo, checkbookRepo, queueRootRepo)

		// Set up auto-triggering for proof generation (if services are available)
		// Note: These are optional - if not set, auto-triggering will be disabled
		if config.AppConfig != nil && config.AppConfig.ZKVM.BaseURL != "" {
			zkvmClient := clients.NewZKVMClient(config.AppConfig.ZKVM.BaseURL)
			withdrawRequestService.SetZKVMClient(zkvmClient)
			logrus.Info("✅ [WithdrawRequest] ZKVM client set for auto-triggering proof generation")
		} else {
			logrus.Warn("⚠️ [WithdrawRequest] ZKVM not configured, auto-triggering will be disabled")
		}

		// Set up blockchain service for auto-submitting transactions
		// Use the shared BlockchainService from ServiceContainer (same instance used by CheckbookService)
		logrus.Infof("🔍 [WithdrawRequest] Checking ServiceContainer...")
		logrus.Infof("   app.Container: %p", app.Container)
		if app.Container != nil {
			logrus.Infof("   app.Container.BlockchainTxService: %p", app.Container.BlockchainTxService)
		}

		if app.Container != nil && app.Container.BlockchainTxService != nil {
			blockchainService := app.Container.BlockchainTxService
			logrus.Infof("✅ [WithdrawRequest] Using shared BlockchainService from ServiceContainer: %p", blockchainService)

			// Verify clients are initialized
			clientCount := blockchainService.GetClientCount()
			if clientCount == 0 {
				logrus.Warn("⚠️ [WithdrawRequest] BlockchainService has no initialized clients, attempting to initialize...")
				if err := blockchainService.InitializeClients(); err != nil {
					logrus.Warnf("⚠️ [WithdrawRequest] Failed to initialize blockchain clients: %v", err)
					logrus.Warn("   → Auto-submission will be disabled until blockchain service is properly configured")
					logrus.Warn("   → Check blockchain network configuration in config.yaml")
				} else {
					clientCount = blockchainService.GetClientCount()
					logrus.Infof("✅ [WithdrawRequest] Blockchain clients initialized: %d client(s)", clientCount)
				}
			} else {
				logrus.Infof("✅ [WithdrawRequest] BlockchainService already has %d initialized client(s)", clientCount)
			}

			withdrawRequestService.SetBlockchainService(blockchainService)
			logrus.Info("✅ [WithdrawRequest] Blockchain service set for auto-submitting transactions")

			// Set IntentService from ServiceContainer (shared instance)
			if app.Container.IntentService != nil {
				withdrawRequestService.SetIntentService(app.Container.IntentService)
				logrus.Info("✅ [WithdrawRequest] Intent service set from ServiceContainer")
			} else {
				// Fallback: create new instance if not in container
				intentService := services.NewIntentService()
				withdrawRequestService.SetIntentService(intentService)
				logrus.Info("✅ [WithdrawRequest] Intent service created (not in ServiceContainer)")
			}

			// Set ProofGenerationService from ServiceContainer (shared instance)
			if app.Container.ProofGenerationService != nil {
				withdrawRequestService.SetProofGenerationService(app.Container.ProofGenerationService)
				logrus.Info("✅ [WithdrawRequest] Proof generation service set from ServiceContainer")
			} else {
				logrus.Warn("⚠️ [WithdrawRequest] Proof generation service not available in ServiceContainer")
				logrus.Warn("   → Async proof generation will be disabled")
			}

			// Set PollingService from ServiceContainer (shared instance)
			if app.Container.UnifiedPollingService != nil {
				withdrawRequestService.SetPollingService(app.Container.UnifiedPollingService)
				logrus.Info("✅ [WithdrawRequest] Polling service set from ServiceContainer")
			} else {
				logrus.Warn("⚠️ [WithdrawRequest] UnifiedPollingService not available in ServiceContainer")
				logrus.Warn("   → Transaction polling will be disabled, relying on event listener only")
			}
		} else {
			logrus.Warn("⚠️ [WithdrawRequest] ServiceContainer or BlockchainService not available")
			logrus.Warn("   → Make sure InitializeContainer() is called before SetupZKPayRoutes()")
			logrus.Warn("   → Auto-submission will be disabled")
		}

		withdrawRequestHandler := handlers.NewWithdrawRequestHandler(withdrawRequestRepo, withdrawRequestService)

		// Intent System: Create withdraw request
		// POST /api/withdraws/submit (updated to use Intent system)
		withdraws := api.Group("/withdraws")
		withdraws.Use(authMiddleware.RequireAuth()) // need JWT
		{
			withdraws.POST("/submit", withdrawRequestHandler.CreateWithdrawRequestHandler)
		}

		myWithdrawRequests := api.Group("/my/withdraw-requests")
		myWithdrawRequests.Use(authMiddleware.RequireAuth()) // need JWT
		{

			myWithdrawRequests.GET("", withdrawRequestHandler.ListMyWithdrawRequestsHandler)
			myWithdrawRequests.GET("/stats", withdrawRequestHandler.GetMyWithdrawStatsHandler)
			myWithdrawRequests.GET("/:id", withdrawRequestHandler.GetMyWithdrawRequestHandler)
			myWithdrawRequests.GET("/by-nullifier/:nullifier", withdrawRequestHandler.GetMyWithdrawRequestByNullifierHandler) //  nullifier

			// retry
			myWithdrawRequests.POST("/:id/retry", withdrawRequestHandler.RetryWithdrawRequestHandler)   // retry
			myWithdrawRequests.POST("/:id/retry-payout", withdrawRequestHandler.RetryPayoutHandler)     // retry payout
			myWithdrawRequests.POST("/:id/retry-fallback", withdrawRequestHandler.RetryFallbackHandler) // retry fallback

			myWithdrawRequests.DELETE("/:id", withdrawRequestHandler.CancelWithdrawRequestHandler)
		}

		// ============  Beneficiary WithdrawRequest  (need) ============
		myBeneficiaryRequests := api.Group("/my/beneficiary-withdraw-requests")
		myBeneficiaryRequests.Use(authMiddleware.RequireAuth()) // need JWT
		{
			// 查询受益地址是自己的 WithdrawRequest
			myBeneficiaryRequests.GET("", withdrawRequestHandler.ListMyBeneficiaryWithdrawRequestsHandler)

			// 请求执行 payout（多签执行）
			myBeneficiaryRequests.POST("/:id/request-payout", withdrawRequestHandler.RequestPayoutExecutionHandler)

			// Claim Timeout（超时领取）
			myBeneficiaryRequests.POST("/:id/claim-timeout", withdrawRequestHandler.ClaimTimeoutHandler)

			// ⚠️ 以下 API 已移除（简化设计）：
			// - POST /:id/request-hook - Hook 自动执行，不需要手动请求
			// - POST /:id/withdraw-original-tokens - Hook 失败后自动转账原始代币
		}

		// ============ Chain Configuration ============
		chainConfigHandler := handlers.NewChainConfigHandler(db)
		{
			// Public endpoints (no auth required)
			api.GET("/chains", chainConfigHandler.ListActiveChainsHandler)         // List all active chains
			api.GET("/chains/:chain_id", chainConfigHandler.GetActiveChainHandler) // Get active chain configuration

			// Admin endpoints (localhost only)
			if localhostOnly != nil {
				adminChains := api.Group("/admin/chains")
				adminChains.Use(localhostOnly.Restrict())
				{
					adminChains.GET("", chainConfigHandler.ListChainsHandler)                             // List all chain configs
					adminChains.GET("/:chain_id", chainConfigHandler.GetChainHandler)                     // Get single chain config
					adminChains.POST("", chainConfigHandler.CreateChainHandler)                           // Create chain config
					adminChains.PUT("/:chain_id", chainConfigHandler.UpdateChainHandler)                  // Update chain config
					adminChains.DELETE("/:chain_id", chainConfigHandler.DeleteChainHandler)               // Delete chain config
					adminChains.GET("/:chain_id/adapters", chainConfigHandler.ListChainAdaptersHandler)   // List adapters
					adminChains.POST("/:chain_id/adapters", chainConfigHandler.CreateChainAdapterHandler) // Create adapter
				}

				// Global configuration endpoints
				adminConfig := api.Group("/admin/config")
				adminConfig.Use(localhostOnly.Restrict())
				{
					adminConfig.GET("/zkpay-proxy", chainConfigHandler.GetGlobalZKPayProxyHandler)    // Get global ZKPay Proxy address
					adminConfig.PUT("/zkpay-proxy", chainConfigHandler.UpdateGlobalZKPayProxyHandler) // Update global ZKPay Proxy address
				}
			}
		}

		// ============ Token Routing Rules ============
		tokenRoutingRepo := repository.NewTokenRoutingRuleRepository(db)
		tokenRoutingService := services.NewTokenRoutingService(tokenRoutingRepo)
		tokenRoutingHandler := handlers.NewTokenRoutingHandler(tokenRoutingService)
		{
			// Public endpoint (no auth required)
			api.GET("/token-routing/allowed-targets", tokenRoutingHandler.GetAllowedTargetsHandler) // Get allowed targets for source chain+token

			// Admin endpoints (localhost only)
			if localhostOnly != nil {
				adminRouting := api.Group("/admin/token-routing")
				adminRouting.Use(localhostOnly.Restrict())
				{
					adminRouting.POST("/rules", tokenRoutingHandler.CreateRoutingRuleHandler)       // Create routing rule
					adminRouting.GET("/rules", tokenRoutingHandler.ListRoutingRulesHandler)         // List routing rules
					adminRouting.GET("/rules/:id", tokenRoutingHandler.GetRoutingRuleHandler)       // Get routing rule by ID
					adminRouting.PUT("/rules/:id", tokenRoutingHandler.UpdateRoutingRuleHandler)    // Update routing rule
					adminRouting.DELETE("/rules/:id", tokenRoutingHandler.DeleteRoutingRuleHandler) // Delete routing rule
				}
			}
		}
	}

	// ============ Admin Authentication ============
	adminAuthHandler := handlers.NewAdminAuthHandler()
	adminAuth := api.Group("/admin/auth")
	{
		// Admin login (username + password + TOTP)
		adminAuth.POST("/login", adminAuthHandler.AdminLoginHandler)
		// Generate TOTP secret (for initial setup)
		adminAuth.GET("/totp/secret", adminAuthHandler.GenerateTOTPSecretHandler)
	}

	// ============ Multisig Management ============
	// Require admin authentication for multisig endpoints
	adminAuthMiddleware := middleware.NewAdminAuthMiddleware(logrus.New())
	multisigHandler := handlers.NewMultisigHandler(db)
	multisig := api.Group("/multisig")
	multisig.Use(adminAuthMiddleware.RequireAdminAuth())
	{
		// Get proposals list
		multisig.GET("/proposals", multisigHandler.GetProposals)
		// Get single proposal
		multisig.GET("/proposals/:proposalId", multisigHandler.GetProposal)
		// Get proposal status from chain
		multisig.GET("/proposals/:proposalId/status", multisigHandler.GetProposalStatus)
		// Retry failed proposal
		multisig.POST("/proposals/:proposalId/retry", multisigHandler.RetryProposal)
		// Get system status
		multisig.GET("/status", multisigHandler.GetSystemStatus)
	}

	// ============ WebSocket ============
	// WebSocketconnection
	// api.GET("/ws", ...) registers /api/ws (since api = r.Group("/api"))
	api.GET("/ws", gin.WrapH(http.HandlerFunc(wsHandler.HandleWebSocket)))
	// Also support /ws for backward compatibility (root path)
	r.GET("/ws", gin.WrapH(http.HandlerFunc(wsHandler.HandleWebSocket)))

	// Server-Sent Events (SSE) status
	api.GET("/status-stream", gin.WrapH(http.HandlerFunc(wsHandler.HandleSSE)))

	// WebSocketconnectionstatusquery
	api.GET("/ws/status", gin.WrapH(http.HandlerFunc(wsHandler.GetConnectionStatus)))

	// ============ KMS ============
	if kmsHandler != nil {
		kms := api.Group("/kms")
		{
			// KMS - allow
			kms.POST("/keys", kmsHandler.StorePrivateKey)        // storageKMS ()
			kms.GET("/keys", kmsHandler.GetKeyMappings)          // get
			kms.DELETE("/keys/:id", kmsHandler.DeleteKeyMapping) // delete
			kms.GET("/address", kmsHandler.GetPublicAddress)     // getaddress
			kms.POST("/sync", kmsHandler.SyncWithKMS)            // KMSstatus
		}

		// 🔒 initializeAPI - localhost
		if localhostOnly != nil {
			kmsAdmin := api.Group("/kms/admin")
			kmsAdmin.Use(localhostOnly.Restrict()) // addlocalhost
			{
				kmsAdmin.POST("/initialize", kmsHandler.InitializeNetworkKeys)               // 🔒 initializenetwork
				kmsAdmin.POST("/networks/:network/store", kmsHandler.StoreNetworkPrivateKey) // 🔒 storagenetwork
			}
		}
	}

	// ============ KYT Oracle ============
	// Initialize KYT Oracle client and handler
	// Priority: Environment variable > Config file > Default
	oracleURL := os.Getenv("KYT_ORACLE_URL")
	if oracleURL == "" && config.AppConfig != nil && config.AppConfig.KYTOracle.BaseURL != "" {
		oracleURL = config.AppConfig.KYTOracle.BaseURL
	}
	if oracleURL == "" {
		oracleURL = "http://localhost:8090" // Default
	}

	// Initialize KYT Oracle client with logging
	// Use standard log for visibility (logrus may have level restrictions)
	log.Printf("🔗 [KYT Oracle] Initializing client: %s", oracleURL)
	logrus.Infof("🔗 [KYT Oracle] Initializing client: %s", oracleURL)

	oracleClient := clients.NewKYTOracleClient(oracleURL)

	// Test connection to KYT Oracle and log result
	if err := oracleClient.TestConnection(); err != nil {
		log.Printf("❌ [KYT Oracle] Connection failed: %v (will retry on first request)", err)
		logrus.Errorf("❌ [KYT Oracle] Connection failed: %v (will retry on first request)", err)
	} else {
		log.Printf("✅ [KYT Oracle] Connected successfully: %s", oracleURL)
		logrus.Infof("✅ [KYT Oracle] Connected successfully: %s", oracleURL)
	}

	oracleHandler := handlers.NewKYTOracleHandler(db, oracleClient)
	kytOracle := api.Group("/kyt-oracle")
	{
		// Get invitation code by address
		// Get fee info by address (with rate limiting)
		kytOracle.GET("/fee-info", oracleHandler.GetFeeInfoByAddressHandler)
		kytOracle.POST("/fee-info", oracleHandler.PostFeeInfoByAddressHandler)
		// Associate address with invitation code
		kytOracle.POST("/associate-address", oracleHandler.AssociateAddressWithCodeHandler)
	}
}
