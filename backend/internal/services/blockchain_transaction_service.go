package services

import (
	"context"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/utils"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"

	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/google/uuid"
)

// mustType is a helper function to create an abi.Type from a string
func mustType(t string) abi.Type {
	typ, err := abi.NewType(t, "", nil)
	if err != nil {
		panic(fmt.Sprintf("invalid type: %s: %v", t, err))
	}
	return typ
}

// ===== （Strategy ）=====

// SigningStrategy
type SigningStrategy interface {
	Sign(networkConfig *config.NetworkConfig, txHash []byte, txHashHex string) ([]byte, error)
	Name() string
}

// PrivateKeySigningStrategy
type PrivateKeySigningStrategy struct {
	keyMgmt *KeyManagementService
}

func (s *PrivateKeySigningStrategy) Sign(networkConfig *config.NetworkConfig, txHash []byte, txHashHex string) ([]byte, error) {
	return s.keyMgmt.SignWithPrivateKey(networkConfig, txHash, txHashHex)
}

func (s *PrivateKeySigningStrategy) Name() string {
	return "PrivateKey"
}

// KMSSigningStrategy KMS
type KMSSigningStrategy struct {
	keyMgmt *KeyManagementService
}

func (s *KMSSigningStrategy) Sign(networkConfig *config.NetworkConfig, txHash []byte, txHashHex string) ([]byte, error) {
	return s.keyMgmt.SignWithKMS(networkConfig, txHash, txHashHex)
}

func (s *KMSSigningStrategy) Name() string {
	return "KMS"
}

// ===== Service  =====

// BlockchainTransactionService blockchain transaction service
type BlockchainTransactionService struct {
	clients        map[int]*ethclient.Client // chainID -> client
	keyMgmtService *KeyManagementService     // key management service
	queueService   *TransactionQueueService  // transaction queue service (optional)
}

// getZKPayContractAddress gets ZKPay contract address with priority: Database > networkConfig
// This ensures we always use the latest configuration from the database if available
// Returns error if the address is empty or zero address
func getZKPayContractAddress(networkConfig *config.NetworkConfig) (string, error) {
	zkpayContract := networkConfig.ZKPayContract

	// Try to get from database first
	var globalConfig models.GlobalConfig
	if err := db.DB.Where("config_key = ?", "zkpay_proxy").First(&globalConfig).Error; err == nil && globalConfig.ConfigValue != "" {
		// Validate the address is not zero
		if globalConfig.ConfigValue == "0x0000000000000000000000000000000000000000" || strings.TrimSpace(globalConfig.ConfigValue) == "" {
			log.Printf("   ❌ ZKPay contract address in database is zero or empty")
			return "", fmt.Errorf("ZKPay contract address is not configured in database (found zero or empty address)")
		}
		// Use database value if available
		zkpayContract = globalConfig.ConfigValue
		log.Printf("   ✅ Using ZKPay contract address from database: %s", zkpayContract)
		return zkpayContract, nil
	}

	// Fallback to networkConfig
	if zkpayContract == "" || zkpayContract == "0x0000000000000000000000000000000000000000" {
		log.Printf("   ⚠️  ZKPay contract address is empty or zero in networkConfig, checking database...")
		// Try database one more time (in case of race condition)
		if err := db.DB.Where("config_key = ?", "zkpay_proxy").First(&globalConfig).Error; err == nil && globalConfig.ConfigValue != "" {
			// Validate the address is not zero
			if globalConfig.ConfigValue == "0x0000000000000000000000000000000000000000" || strings.TrimSpace(globalConfig.ConfigValue) == "" {
				log.Printf("   ❌ ZKPay contract address in database is zero or empty")
				return "", fmt.Errorf("ZKPay contract address is not configured in database (found zero or empty address)")
			}
			zkpayContract = globalConfig.ConfigValue
			log.Printf("   ✅ Found ZKPay contract address in database: %s", zkpayContract)
			return zkpayContract, nil
		}
		log.Printf("   ❌ ZKPay contract address not found in database either")
		return "", fmt.Errorf("ZKPay contract address is not configured: not found in database and networkConfig has zero or empty address")
	}

	// Validate networkConfig address is not zero (safety check)
	if zkpayContract == "0x0000000000000000000000000000000000000000" || strings.TrimSpace(zkpayContract) == "" {
		log.Printf("   ❌ ZKPay contract address from networkConfig is zero or empty")
		return "", fmt.Errorf("ZKPay contract address is not configured: networkConfig has zero or empty address")
	}

	log.Printf("   Using ZKPay contract address from networkConfig: %s", zkpayContract)
	return zkpayContract, nil
}

// CommitmentRequest commitment request parameters - corresponding to executeCommitment contract
type CommitmentRequest struct {
	ChainID           int      `json:"chain_id"`
	LocalDepositID    uint64   `json:"local_deposit_id"`
	TokenKey          string   `json:"token_key"`           // TokenKey (e.g., "USDT")
	CheckbookTokenKey string   `json:"checkbook_token_key"` // 🔧 newly added：correct TokenKey from checkbook record
	AllocatableAmount string   `json:"allocatable_amount"`
	Commitment        string   `json:"commitment"`
	SP1Proof          string   `json:"sp1_proof"`
	PublicValues      []string `json:"public_values"` // ZKVM
	// Failed
	CheckbookID string `json:"checkbook_id"` // checkbook ID
}

// WithdrawRequest withdraw request - Updated for new executeWithdraw signature
type WithdrawRequest struct {
	ChainID           int    `json:"chain_id"`
	NullifierHash     string `json:"nullifier_hash"`      // contractVerify
	Recipient         string `json:"recipient"`           // address
	Amount            string `json:"amount"`              // amount
	QueueRoot         string `json:"queue_root"`          // Commitment Root (queue root)
	OriginalProofHash string `json:"original_proof_hash"` // hash()
	SP1Proof          string `json:"sp1_proof"`           // SP1 proof data
	PublicValues      string `json:"public_values"`       // ZKVM encoded public values (hex string, optional - if provided, will be used directly)
	Token             string `json:"token"`               // token contract address
	TokenKey          string `json:"token_key"`           // tokenKey (e.g., "USDT")
	// Failed
	CheckbookID string `json:"checkbook_id"` // checkbook ID
	CheckID     string `json:"check_id"`     // check ID
}

// CommitmentTxResponse commitment transaction response ( BlockScanner API  CommitmentTxResponse)
type CommitmentTxResponse struct {
	TxHash    string `json:"tx_hash"`
	GasUsed   uint64 `json:"gas_used"`
	GasPrice  string `json:"gas_price"`
	Timestamp int64  `json:"timestamp"`
	QueueID   string `json:"queue_id,omitempty"` // 队列ID（如果使用队列）
}

// WithdrawResponse withdrawresponse
type WithdrawResponse struct {
	TxHash    string `json:"tx_hash"`
	GasUsed   uint64 `json:"gas_used"`
	GasPrice  string `json:"gas_price"`
	Timestamp int64  `json:"timestamp"`
	QueueID   string `json:"queue_id,omitempty"` // 队列ID（如果使用队列）
}

// NewBlockchainTransactionService Createblockchain transaction service
func NewBlockchainTransactionService(keyMgmtService *KeyManagementService) *BlockchainTransactionService {
	service := &BlockchainTransactionService{
		clients:        make(map[int]*ethclient.Client),
		keyMgmtService: keyMgmtService,
		queueService:   nil, // Will be set via SetQueueService
	}

	// addCreate，address
	log.Printf("🆕 [NewBlockchainTransactionService] Create: %p", service)
	log.Printf("   clients mapaddress: %p", service.clients)

	return service
}

// SetQueueService 设置交易队列服务
func (b *BlockchainTransactionService) SetQueueService(queueService *TransactionQueueService) {
	b.queueService = queueService
	log.Printf("✅ [BlockchainTransactionService] Queue service set")
}

// InitializeClients InitializeRPCclient
func (b *BlockchainTransactionService) InitializeClients() error {
	if config.AppConfig == nil {
		log.Printf("❌ [InitializeClients] config.AppConfig is nil")
		return fmt.Errorf("config not loaded")
	}

	if config.AppConfig.Blockchain.Networks == nil {
		log.Printf("❌ [InitializeClients] config.AppConfig.Blockchain.Networks is nil")
		return fmt.Errorf("blockchain networks not configured")
	}

	log.Printf("🔍 [InitializeClients] startnetworkconfiguration，: %d", len(config.AppConfig.Blockchain.Networks))

	for networkName, networkConfig := range config.AppConfig.Blockchain.Networks {
		log.Printf("🔍 [InitializeClients] Checknetwork: %s", networkName)
		log.Printf("   chainID: %d", networkConfig.ChainID)
		log.Printf("   enabled: %v", networkConfig.Enabled)
		log.Printf("   rpcEndpoints: %v", networkConfig.RPCEndpoints)

		if !networkConfig.Enabled {
			log.Printf("⏭️  [InitializeClients] notnetwork: %s", networkName)
			continue
		}

		// attemptconnectionRPC
		var client *ethclient.Client
		var err error
		var connectedEndpoint string

		log.Printf("   🔗 [InitializeClients] Attempting to connect to RPC endpoints...")
		for i, rpcEndpoint := range networkConfig.RPCEndpoints {
			log.Printf("      Trying endpoint %d/%d: %s", i+1, len(networkConfig.RPCEndpoints), rpcEndpoint)
			client, err = ethclient.Dial(rpcEndpoint)
			if err == nil {
				log.Printf("      ✅ Dial successful, testing connection...")
				// connection
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				networkID, err := client.NetworkID(ctx)
				cancel()
				if err == nil {
					log.Printf("      ✅ Connection verified! Network ID: %s", networkID.String())
					connectedEndpoint = rpcEndpoint
					break
				}
				log.Printf("      ❌ NetworkID check failed: %v", err)
				client.Close()
			} else {
				log.Printf("      ❌ Dial failed: %v", err)
			}
		}

		if err != nil {
			log.Printf("❌ [InitializeClients] All RPC endpoints failed for network %s", networkName)
			return fmt.Errorf("failed to connect to %s network: %w", networkName, err)
		}
		log.Printf("   ✅ [InitializeClients] Successfully connected to: %s", connectedEndpoint)

		// UseSLIP-44 Coin Typestorageclient（）
		log.Printf("✅ [InitializeClients] successconnectionRPC: %s (SLIP-44: %d)", networkName, networkConfig.ChainID)
		log.Printf("🔍 [InitializeClients] storageclient，currentclients: %d", len(b.clients))
		b.clients[networkConfig.ChainID] = client
		log.Printf("🔍 [InitializeClients] storageclient，currentclients: %d", len(b.clients))
		log.Printf("✅ [InitializeClients] clientstoragecompleted: chainID=%d", networkConfig.ChainID)
	}

	log.Printf("🎉 [InitializeClients] ========================================")
	log.Printf("🎉 [InitializeClients] Initialization completed successfully!")
	log.Printf("🎉 [InitializeClients] Total clients initialized: %d", len(b.clients))
	for chainID, client := range b.clients {
		log.Printf("   ✅ Chain ID %d: client=%p", chainID, client)
	}
	log.Printf("🎉 [InitializeClients] ========================================")
	return nil
}

// GetClient Getchain IDRPCclient
func (b *BlockchainTransactionService) GetClient(chainID int) (*ethclient.Client, bool) {
	log.Printf("🔍 [GetClient] client:")
	log.Printf("   Serviceaddress: %p", b)
	log.Printf("   clients mapaddress: %p", b.clients)
	log.Printf("   clients map: %d", len(b.clients))
	log.Printf("   requestChainID: %d", chainID)

	// existsclient
	if len(b.clients) > 0 {
		log.Printf("   client:")
		for id, client := range b.clients {
			log.Printf("     ChainID %d: %p", id, client)
		}
	} else {
		log.Printf("   ❌ clients mapempty!")
	}

	client, exists := b.clients[chainID]
	log.Printf("   : exists=%v, client=%p", exists, client)
	return client, exists
}

// GetClientCount GetalreadyInitializeRPCclient
func (b *BlockchainTransactionService) GetClientCount() int {
	return len(b.clients)
}

// GetAllClientIDs GetalreadyInitializechain ID
func (b *BlockchainTransactionService) GetAllClientIDs() []int {
	ids := make([]int, 0, len(b.clients))
	for chainID := range b.clients {
		ids = append(ids, chainID)
	}
	return ids
}

// SubmitCommitment commitment
func (b *BlockchainTransactionService) SubmitCommitment(req *CommitmentRequest) (*CommitmentTxResponse, error) {
	// 如果队列服务已设置，使用队列；否则直接提交（向后兼容）
	if b.queueService != nil {
		return b.submitCommitmentViaQueue(req)
	}

	// 直接提交（原有逻辑，向后兼容）
	return b.submitCommitmentDirect(req)
}

// submitCommitmentViaQueue 通过队列提交 commitment
func (b *BlockchainTransactionService) submitCommitmentViaQueue(req *CommitmentRequest) (*CommitmentTxResponse, error) {
	log.Printf("🚀 [SubmitCommitment] Enqueuing commitment transaction...")

	// 获取签名地址（Commitment 也提交到 BSC，使用 MANAGEMENT_CHAIN_ID）
	const MANAGEMENT_CHAIN_ID = 714 // BSC
	networkConfig, err := config.GetNetworkConfigByChainID(MANAGEMENT_CHAIN_ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get network config: %w", err)
	}

	signingAddress, err := b.keyMgmtService.GetSigningAddress(networkConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to get signing address: %w", err)
	}

	// 入队（使用 MANAGEMENT_CHAIN_ID 而不是 req.ChainID，因为实际提交到 BSC）
	queueID, err := b.queueService.EnqueueCommitment(
		signingAddress,
		uint32(MANAGEMENT_CHAIN_ID), // 使用 BSC 的 chainID
		req.CheckbookID,
		req,
		100, // 默认优先级
	)
	if err != nil {
		return nil, fmt.Errorf("failed to enqueue commitment: %w", err)
	}

	log.Printf("✅ [SubmitCommitment] Commitment enqueued: QueueID=%s, CheckbookID=%s", queueID, req.CheckbookID)

	// 返回一个响应，表示已入队（实际交易会在队列中异步处理）
	return &CommitmentTxResponse{
		TxHash:    "", // 将在队列处理时生成
		GasUsed:   0,
		GasPrice:  "0",
		Timestamp: time.Now().Unix(),
		QueueID:   queueID, // 添加队列ID用于跟踪
	}, nil
}

// submitCommitmentDirect 直接提交 commitment（原有逻辑）
func (b *BlockchainTransactionService) submitCommitmentDirect(req *CommitmentRequest) (*CommitmentTxResponse, error) {
	// chain ID
	const MANAGEMENT_CHAIN_ID = 714 // BSCID
	log.Printf("🚨🚨🚨 [PROOF DEBUG] SubmitCommitment ！🚨🚨🚨")
	log.Printf("🚀 [SubmitCommitment] startprocesscommitment:")
	log.Printf("   Serviceaddress: %p", b)
	log.Printf("   clients mapaddress: %p", b.clients)
	log.Printf("   clients map: %d", len(b.clients))
	log.Printf("📋 [Commitmentrequest]:")
	log.Printf("   ChainID: %d", req.ChainID)
	log.Printf("   LocalDepositID: %d", req.LocalDepositID)
	log.Printf("   TokenKey: %s", req.TokenKey)
	log.Printf("   AllocatableAmount: %s", req.AllocatableAmount)
	log.Printf("   CheckbookID: %s", req.CheckbookID)
	log.Printf("   Commitment: %s", req.Commitment)
	log.Printf("   SP1Proof: %s", func() string {
		if len(req.SP1Proof) > 50 {
			return req.SP1Proof[:50] + "..."
		}
		return req.SP1Proof
	}())

	// Getnetworkconfiguration
	networkConfig, err := config.GetNetworkConfigByChainID(req.ChainID)
	if err != nil {
		log.Printf("❌ Getnetworkconfigurationfailed: %v", err)
		return nil, fmt.Errorf("failed to get network config: %w", err)
	}

	// Checkconfiguration（configuration）
	useKMS := false
	if networkConfig.UsePrivateKey && networkConfig.PrivateKey != "" && networkConfig.PrivateKey != "test_private_key_placeholder" {
		log.Printf("🔑 configurationuse (usePrivateKey=true)")
		useKMS = false
	} else if b.keyMgmtService.IsKMSEnabled(networkConfig) && networkConfig.KMSKeyAlias != "" {
		log.Printf("🔐 useKMS: keyAlias=%s", networkConfig.KMSKeyAlias)
		useKMS = true
	} else if networkConfig.PrivateKey != "" && networkConfig.PrivateKey != "test_private_key_placeholder" {
		log.Printf("🔑  (KMSnotconfiguration)")
		useKMS = false
	} else {
		log.Printf("❌ configuration: chainID=%d (KMS)", MANAGEMENT_CHAIN_ID)
		return nil, fmt.Errorf("no signing method configured for management chainID %d", MANAGEMENT_CHAIN_ID)
	}

	// Getclient
	client, exists := b.clients[MANAGEMENT_CHAIN_ID]
	if !exists {
		log.Printf("❌ RPCclientnotinitialize: chainID=%d", MANAGEMENT_CHAIN_ID)
		return nil, fmt.Errorf("management chain client not initialized for chainID %d", MANAGEMENT_CHAIN_ID)
	}

	// 🔍 RPCconnectionstatus
	log.Printf("🔗 RPCconnectionstatus...")
	blockNumber, err := client.BlockNumber(context.Background())
	if err != nil {
		log.Printf("❌ RPCconnectionfailed: %v", err)
		return nil, fmt.Errorf("failed to test RPC connection: %w", err)
	}
	log.Printf("✅ RPCconnection，currentblock number: %d", blockNumber)

	// Getaddress
	signingAddress, err := b.keyMgmtService.GetSigningAddress(networkConfig)
	if err != nil {
		log.Printf("❌ Getaddressfailed: %v", err)
		return nil, fmt.Errorf("failed to get signing address: %w", err)
	}
	fromAddress := common.HexToAddress(signingAddress)
	log.Printf("📍 useaddress: %s", fromAddress.Hex())

	// 🔍 queryaddress
	log.Printf("💰 queryaddress...")
	balance, err := client.BalanceAt(context.Background(), fromAddress, nil)
	if err != nil {
		log.Printf("❌ queryfailed: %v", err)
		return nil, fmt.Errorf("failed to query balance: %w", err)
	}

	// Convert
	balanceEth := new(big.Float).Quo(new(big.Float).SetInt(balance), new(big.Float).SetInt64(1e18))
	log.Printf("💰 address: %s wei ( %.6f BNB)", balance.String(), balanceEth)

	// GetRPCnetworkchain IDVerify
	actualChainID, err := client.NetworkID(context.Background())
	if err != nil {
		log.Printf("❌ Getchain IDfailed: %v", err)
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}

	// Verify chain ID: We're connecting to MANAGEMENT_CHAIN_ID (BSC 714), so verify BSC's EVM Chain ID (56)
	// req.ChainID is the source chain (where commitment is created), but we always submit to BSC
	expectedEvmChainID := utils.Slip44ToEvm(MANAGEMENT_CHAIN_ID) // BSC SLIP-44 714 -> EVM 56
	actualEvmChainID := actualChainID.Uint64()

	log.Printf("🔗 chain ID:")
	log.Printf("   managementSLIP-44: %d (BSC)", MANAGEMENT_CHAIN_ID)
	log.Printf("   sourceSLIP-44: %d (commitment source)", req.ChainID)
	log.Printf("   expectedEVM Chain ID: %d (BSC)", expectedEvmChainID)
	log.Printf("   actualEVM Chain ID: %d (from RPC)", actualEvmChainID)

	if actualEvmChainID != uint64(expectedEvmChainID) {
		log.Printf("⚠️  Chain ID mismatch! Expected EVM %d (BSC), got EVM %d", expectedEvmChainID, actualEvmChainID)
		return nil, fmt.Errorf("chain ID mismatch: expected EVM %d (BSC SLIP-44 %d), got EVM %d", expectedEvmChainID, MANAGEMENT_CHAIN_ID, actualEvmChainID)
	}

	// Usechain ID（EVM Chain ID）
	chainID := actualChainID

	// configuration
	var strategy SigningStrategy
	if useKMS {
		strategy = &KMSSigningStrategy{keyMgmt: b.keyMgmtService}
	} else {
		strategy = &PrivateKeySigningStrategy{keyMgmt: b.keyMgmtService}
	}

	return b.submitCommitmentWithSigner(client, networkConfig, req, fromAddress, chainID, strategy)
}

// SubmitWithdraw withdraw
func (b *BlockchainTransactionService) SubmitWithdraw(req *WithdrawRequest) (*WithdrawResponse, error) {
	// 如果队列服务已设置，使用队列；否则直接提交（向后兼容）
	if b.queueService != nil {
		return b.submitWithdrawViaQueue(req)
	}

	// 直接提交（原有逻辑，向后兼容）
	return b.submitWithdrawDirect(req)
}

// submitWithdrawViaQueue 通过队列提交 withdraw
func (b *BlockchainTransactionService) submitWithdrawViaQueue(req *WithdrawRequest) (*WithdrawResponse, error) {
	log.Printf("🚀 [SubmitWithdraw] Enqueuing withdraw transaction...")

	// 获取签名地址
	const MANAGEMENT_CHAIN_ID = 714 // BSC
	networkConfig, err := config.GetNetworkConfigByChainID(MANAGEMENT_CHAIN_ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get network config: %w", err)
	}

	signingAddress, err := b.keyMgmtService.GetSigningAddress(networkConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to get signing address: %w", err)
	}

	// 入队（使用 MANAGEMENT_CHAIN_ID，因为 Withdraw 提交到 BSC）
	queueID, err := b.queueService.EnqueueWithdraw(
		signingAddress,
		uint32(MANAGEMENT_CHAIN_ID), // 使用 BSC 的 chainID (714)
		req.CheckID,                 // 使用 CheckID 作为 RequestID
		req.CheckbookID,
		req.CheckID,
		req,
		100, // 默认优先级
	)
	if err != nil {
		return nil, fmt.Errorf("failed to enqueue withdraw: %w", err)
	}

	log.Printf("✅ [SubmitWithdraw] Withdraw enqueued: QueueID=%s, CheckID=%s", queueID, req.CheckID)

	// 返回一个响应，表示已入队
	return &WithdrawResponse{
		TxHash:    "", // 将在队列处理时生成
		GasUsed:   0,
		GasPrice:  "0",
		Timestamp: time.Now().Unix(),
		QueueID:   queueID, // 添加队列ID用于跟踪
	}, nil
}

// submitWithdrawDirect 直接提交 withdraw（原有逻辑）
func (b *BlockchainTransactionService) submitWithdrawDirect(req *WithdrawRequest) (*WithdrawResponse, error) {
	log.Printf("🚀 [SubmitWithdraw] startprocesswithdraw:")
	log.Printf("   Serviceaddress: %p", b)
	log.Printf("   clients mapaddress: %p", b.clients)
	log.Printf("   clients map: %d", len(b.clients))
	log.Printf("📋 [Withdrawrequest]:")
	log.Printf("   ChainID: %d", req.ChainID)
	log.Printf("   CheckbookID: %s", req.CheckbookID)
	log.Printf("   CheckID: %s", req.CheckID)
	log.Printf("   Recipient: %s", req.Recipient)
	log.Printf("   Amount: %s", req.Amount)
	log.Printf("   NullifierHash: %s", req.NullifierHash)
	log.Printf("   QueueRoot: %s", req.QueueRoot)
	log.Printf("   OriginalProofHash: %s", req.OriginalProofHash)
	log.Printf("   SP1Proof: %s", func() string {
		if len(req.SP1Proof) > 50 {
			return req.SP1Proof[:50] + "..."
		}
		return req.SP1Proof
	}())

	// Getnetworkconfiguration - withdrawBSC
	const MANAGEMENT_CHAIN_ID = 714 // BSCID
	log.Printf("🏗️ [SubmitWithdraw] : BSC(714)，target(%d)recordcontract", req.ChainID)
	networkConfig, err := config.GetNetworkConfigByChainID(MANAGEMENT_CHAIN_ID)
	if err != nil {
		log.Printf("❌ Getnetworkconfigurationfailed: %v", err)
		return nil, fmt.Errorf("failed to get network config: %w", err)
	}

	// Checkconfiguration（configuration）
	useKMS := false
	if networkConfig.UsePrivateKey && networkConfig.PrivateKey != "" && networkConfig.PrivateKey != "test_private_key_placeholder" {
		log.Printf("🔑 configurationuse (usePrivateKey=true)")
		useKMS = false
	} else if b.keyMgmtService.IsKMSEnabled(networkConfig) && networkConfig.KMSKeyAlias != "" {
		log.Printf("🔐 useKMS: keyAlias=%s", networkConfig.KMSKeyAlias)
		useKMS = true
	} else if networkConfig.PrivateKey != "" && networkConfig.PrivateKey != "test_private_key_placeholder" {
		log.Printf("🔑  (KMSnotconfiguration)")
		useKMS = false
	} else {
		log.Printf("❌ configuration: chainID=%d (KMS)", MANAGEMENT_CHAIN_ID)
		return nil, fmt.Errorf("no signing method configured for management chainID %d", MANAGEMENT_CHAIN_ID)
	}

	// Getclient
	client, exists := b.clients[MANAGEMENT_CHAIN_ID]
	if !exists {
		log.Printf("❌ RPCclientnotinitialize: chainID=%d", MANAGEMENT_CHAIN_ID)
		return nil, fmt.Errorf("management chain client not initialized for chainID %d", MANAGEMENT_CHAIN_ID)
	}

	// 🔍 RPCconnectionstatus
	log.Printf("🔗 RPCconnectionstatus...")
	blockNumber, err := client.BlockNumber(context.Background())
	if err != nil {
		log.Printf("❌ RPCconnectionfailed: %v", err)
		return nil, fmt.Errorf("failed to test RPC connection: %w", err)
	}
	log.Printf("✅ RPCconnection，currentblock number: %d", blockNumber)

	// Getaddress
	signingAddress, err := b.keyMgmtService.GetSigningAddress(networkConfig)
	if err != nil {
		log.Printf("❌ Getaddressfailed: %v", err)
		return nil, fmt.Errorf("failed to get signing address: %w", err)
	}
	fromAddress := common.HexToAddress(signingAddress)
	log.Printf("📍 useaddress: %s", fromAddress.Hex())

	// 🔍 queryaddress
	log.Printf("💰 queryaddress...")
	balance, err := client.BalanceAt(context.Background(), fromAddress, nil)
	if err != nil {
		log.Printf("❌ queryfailed: %v", err)
		return nil, fmt.Errorf("failed to query balance: %w", err)
	}

	// Convert
	balanceEth := new(big.Float).Quo(new(big.Float).SetInt(balance), new(big.Float).SetInt64(1e18))
	log.Printf("💰 address: %s wei ( %.6f BNB)", balance.String(), balanceEth)

	// GetRPCnetworkchain IDVerify
	actualChainID, err := client.NetworkID(context.Background())
	if err != nil {
		log.Printf("❌ Getchain IDfailed: %v", err)
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}

	// Verify chain ID: We're connecting to MANAGEMENT_CHAIN_ID (BSC 714), so verify BSC's EVM Chain ID (56)
	// req.ChainID is the target chain (beneficiary chain), not the chain we're submitting to
	expectedEvmChainID := utils.Slip44ToEvm(MANAGEMENT_CHAIN_ID) // BSC SLIP-44 714 -> EVM 56
	actualEvmChainID := actualChainID.Uint64()

	log.Printf("🔗 chain ID:")
	log.Printf("   managementSLIP-44: %d (BSC)", MANAGEMENT_CHAIN_ID)
	log.Printf("   targetSLIP-44: %d (beneficiary)", req.ChainID)
	log.Printf("   expectedEVM Chain ID: %d (BSC)", expectedEvmChainID)
	log.Printf("   actualEVM Chain ID: %d (from RPC)", actualEvmChainID)

	if actualEvmChainID != uint64(expectedEvmChainID) {
		log.Printf("⚠️  Chain ID mismatch! Expected EVM %d (BSC), got EVM %d", expectedEvmChainID, actualEvmChainID)
		return nil, fmt.Errorf("chain ID mismatch: expected EVM %d (BSC SLIP-44 %d), got EVM %d", expectedEvmChainID, MANAGEMENT_CHAIN_ID, actualEvmChainID)
	}

	// Usechain ID（EVM Chain ID）
	chainID := actualChainID

	// configuration
	var strategy SigningStrategy
	if useKMS {
		strategy = &KMSSigningStrategy{keyMgmt: b.keyMgmtService}
	} else {
		strategy = &PrivateKeySigningStrategy{keyMgmt: b.keyMgmtService}
	}

	return b.submitWithdrawWithSigner(client, networkConfig, req, fromAddress, chainID, strategy)
}

// submitWithdrawWithSigner  Withdraw （use）
func (b *BlockchainTransactionService) submitWithdrawWithSigner(client *ethclient.Client, networkConfig *config.NetworkConfig, req *WithdrawRequest, fromAddress common.Address, chainID *big.Int, strategy SigningStrategy) (*WithdrawResponse, error) {
	log.Printf("🔑 use %s ", strategy.Name())

	// GetVerify
	balance, err := client.BalanceAt(context.Background(), fromAddress, nil)
	if err != nil {
		log.Printf("❌ queryfailed: %v", err)
		return nil, fmt.Errorf("failed to query balance: %w", err)
	}

	// not
	tx, err := b.buildUnsignedTransaction(client, networkConfig, req, fromAddress, chainID)
	if err != nil {
		log.Printf("❌ notfailed: %v", err)
		return nil, fmt.Errorf("failed to build unsigned transaction: %w", err)
	}

	// Verifygas
	if err := b.validateGasBalance(client, networkConfig, tx, balance, fromAddress); err != nil {
		return nil, err
	}

	// GetEIP155hash
	signer := types.NewEIP155Signer(chainID)
	sigHash := signer.Hash(tx)
	log.Printf("📝 hash: %s", tx.Hash().Hex())
	log.Printf("📝 EIP155hash: %s", sigHash.Hex())

	// use
	signature, err := strategy.Sign(networkConfig, sigHash.Bytes(), sigHash.Hex())
	if err != nil {
		log.Printf("❌ %s failed: %v", strategy.Name(), err)
		return nil, fmt.Errorf("failed to sign with %s: %w", strategy.Name(), err)
	}

	signedTx, err := b.applySignatureToTransaction(tx, signature, chainID)
	if err != nil {
		log.Printf("❌ failed: %v", err)
		return nil, fmt.Errorf("failed to apply signature: %w", err)
	}

	// Verifyaddress
	actualSender, err := types.Sender(signer, signedTx)
	if err != nil {
		log.Printf("❌ address: %v", err)
	} else {
		log.Printf("✅ Verifysuccess，address: %s", actualSender.Hex())
		if actualSender != fromAddress {
			log.Printf("⚠️  ：addressdifferent from: expected=%s, actual=%s", fromAddress.Hex(), actualSender.Hex())
		}
	}

	log.Printf("🚀 startblockchain...")
	err = client.SendTransaction(context.Background(), signedTx)
	if err != nil {
		log.Printf("❌ failed: %v", err)
		return nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	log.Printf("✅ success！")
	log.Printf("   hash: %s", signedTx.Hash().Hex())
	log.Printf("   Gas: %s wei", signedTx.GasPrice().String())
	log.Printf("   GasRestrict: %d", signedTx.Gas())

	// response
	response := &WithdrawResponse{
		TxHash:    signedTx.Hash().Hex(),
		GasUsed:   signedTx.Gas(), // gasUseneedreceiptGet
		GasPrice:  signedTx.GasPrice().String(),
		Timestamp: time.Now().Unix(),
	}

	return response, nil
}

// waitForTransactionWithRetry Waitconfirm
func (b *BlockchainTransactionService) waitForTransactionWithRetry(client *ethclient.Client, tx *types.Transaction, maxDuration time.Duration) (*types.Receipt, error) {
	txHash := tx.Hash()
	log.Printf("🔄 [waitForTransactionWithRetry] Starting transaction confirmation process...")
	log.Printf("   Transaction Hash: %s", txHash.Hex())
	log.Printf("   Max Duration: %v", maxDuration)

	startTime := time.Now()
	maxEndTime := startTime.Add(maxDuration)
	log.Printf("   Start Time: %s", startTime.Format(time.RFC3339))
	log.Printf("   Max End Time: %s", maxEndTime.Format(time.RFC3339))

	// 1: WaitMined (30seconds)
	log.Printf("📋 [waitForTransactionWithRetry] Step 1: Waiting for transaction to be mined (30 seconds timeout)...")
	ctx1, cancel1 := context.WithTimeout(context.Background(), 30*time.Second)
	receipt, err := bind.WaitMined(ctx1, client, tx)
	cancel1()

	if err == nil && receipt != nil {
		elapsed := time.Since(startTime)
		log.Printf("✅ [waitForTransactionWithRetry] Step 1 success: Transaction confirmed within 30 seconds!")
		log.Printf("   Elapsed Time: %v", elapsed)
		log.Printf("   Block Number: %d", receipt.BlockNumber.Uint64())
		log.Printf("   Status: %d", receipt.Status)
		log.Printf("   Gas Used: %d", receipt.GasUsed)
		return receipt, nil
	}
	log.Printf("⚠️  [waitForTransactionWithRetry] Step 1 timeout or error: %v", err)
	log.Printf("   Proceeding to Step 2: Polling mode...")

	// 2: pollingquerystatus (10secondsquery)
	log.Printf("📋 [waitForTransactionWithRetry] Step 2: Starting polling mode (query every 10 seconds)...")
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	pollCount := 0
	for time.Now().Before(maxEndTime) {
		select {
		case <-ticker.C:
			pollCount++
			elapsed := time.Since(startTime)
			remaining := maxEndTime.Sub(time.Now())
			log.Printf("🔍 [waitForTransactionWithRetry] Poll #%d - Querying transaction status...", pollCount)
			log.Printf("   Elapsed: %v, Remaining: %v", elapsed, remaining)
			log.Printf("   Transaction Hash: %s", txHash.Hex())

			// queryreceipt
			ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
			receipt, err := client.TransactionReceipt(ctx2, txHash)
			cancel2()

			if err == nil && receipt != nil {
				elapsedTotal := time.Since(startTime)
				log.Printf("✅ [waitForTransactionWithRetry] Step 2 success: Transaction confirmed via polling!")
				log.Printf("   Total Elapsed Time: %v", elapsedTotal)
				log.Printf("   Poll Count: %d", pollCount)
				log.Printf("   Block Number: %d", receipt.BlockNumber.Uint64())
				log.Printf("   Status: %d", receipt.Status)
				log.Printf("   Gas Used: %d", receipt.GasUsed)
				return receipt, nil
			}

			if err != nil && err.Error() != "not found" {
				log.Printf("⚠️  [waitForTransactionWithRetry] Error querying receipt: %v", err)
			} else if err != nil {
				log.Printf("   Transaction receipt not found yet (transaction may still be pending)")
			}

			// Checkwhetherpending
			ctx3, cancel3 := context.WithTimeout(context.Background(), 10*time.Second)
			pending, isPending, err := client.TransactionByHash(ctx3, txHash)
			cancel3()

			if err == nil && pending != nil {
				if isPending {
					log.Printf("⏳ [waitForTransactionWithRetry] Transaction is still pending, continuing to wait...")
				} else {
					log.Printf("📦 [waitForTransactionWithRetry] Transaction exists but receipt query failed, will retry...")
				}
			} else if err != nil {
				log.Printf("⚠️  [waitForTransactionWithRetry] Error checking transaction status: %v", err)
			}

		case <-time.After(maxDuration):
			break
		}
	}

	// 3: forcequery
	elapsedTotal := time.Since(startTime)
	log.Printf("📋 [waitForTransactionWithRetry] Step 3: Final force query (30 seconds timeout)...")
	log.Printf("   Elapsed Time: %v", elapsedTotal)
	log.Printf("   Transaction Hash: %s", txHash.Hex())
	ctx4, cancel4 := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel4()

	receipt, err = client.TransactionReceipt(ctx4, txHash)
	if err == nil && receipt != nil {
		elapsedFinal := time.Since(startTime)
		log.Printf("✅ [waitForTransactionWithRetry] Step 3 success: Transaction confirmed via final force query!")
		log.Printf("   Total Elapsed Time: %v", elapsedFinal)
		log.Printf("   Block Number: %d", receipt.BlockNumber.Uint64())
		log.Printf("   Status: %d", receipt.Status)
		log.Printf("   Gas Used: %d", receipt.GasUsed)
		return receipt, nil
	}

	// Failed
	elapsedFinal := time.Since(startTime)
	log.Printf("❌ [waitForTransactionWithRetry] ========================================")
	log.Printf("❌ [waitForTransactionWithRetry] Transaction confirmation failed!")
	log.Printf("❌ [waitForTransactionWithRetry] ========================================")
	log.Printf("   Transaction Hash: %s", txHash.Hex())
	log.Printf("   Total Elapsed Time: %v", elapsedFinal)
	log.Printf("   Max Duration: %v", maxDuration)
	log.Printf("   Poll Count: %d", pollCount)
	if err != nil {
		log.Printf("   Error: %v", err)
	} else {
		log.Printf("   Error: Receipt not found (transaction may still be pending or failed)")
	}
	log.Printf("⚠️  [waitForTransactionWithRetry] Note: Transaction may have succeeded but confirmation timed out.")
	log.Printf("   Please check blockchain explorer for transaction status: %s", txHash.Hex())

	return nil, fmt.Errorf("transaction confirmation timeout after %v, last error: %w", time.Since(startTime), err)
}

// GetTransactionStatus Getstatus

// EstimateGas Gas
func (b *BlockchainTransactionService) EstimateGas(chainID int, from, to common.Address, data []byte) (uint64, error) {
	client, exists := b.clients[chainID]
	if !exists {
		return 0, fmt.Errorf("client not initialized for chainID %d", chainID)
	}

	msg := ethereum.CallMsg{
		From: from,
		To:   &to,
		Data: data,
	}

	gasLimit, err := client.EstimateGas(context.Background(), msg)
	if err != nil {
		return 0, fmt.Errorf("failed to estimate gas: %w", err)
	}

	return gasLimit * 2, nil
}

// recordFailedTransaction recordFailedretry
func (b *BlockchainTransactionService) recordFailedTransaction(req *WithdrawRequest, txHash, errorMsg string) error {
	log.Printf("📝 recordfailedretry: %s", txHash)

	failedTx := &models.FailedTransaction{
		ID:            uuid.New().String(),
		TxType:        models.FailedTransactionTypeWithdraw,
		Status:        models.FailedTransactionStatusPending,
		CheckbookID:   req.CheckbookID,
		CheckID:       req.CheckID,
		TxHash:        txHash,
		Nullifier:     req.NullifierHash,
		Recipient:     req.Recipient,
		Amount:        req.Amount,
		RetryCount:    0,
		MaxRetries:    10,
		NextRetryAt:   time.Now().Add(10 * time.Second), // 10secondsstartretry
		LastError:     "",
		OriginalError: errorMsg,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := db.DB.Create(failedTx).Error; err != nil {
		return fmt.Errorf("failed to record failed transaction: %w", err)
	}

	log.Printf("✅ failedalreadyrecord，ID: %s", failedTx.ID)
	return nil
}

// setupGasAndValidateBalance SetgasandVerify
func (b *BlockchainTransactionService) setupGasAndValidateBalance(client *ethclient.Client, networkConfig *config.NetworkConfig, auth *bind.TransactOpts, balance *big.Int, fromAddress common.Address) error {
	// Setgas
	if networkConfig.GasPrice != "" && networkConfig.GasPrice != "auto" {
		// ifconfigurationgas price，Useconfiguration
		gasPrice, ok := new(big.Int).SetString(networkConfig.GasPrice, 10)
		if ok {
			auth.GasPrice = gasPrice
			log.Printf("⛽ useconfigurationGas Price: %s wei", networkConfig.GasPrice)
		}
	} else {
		// Getcurrentnetworkgas price
		suggestedGasPrice, err := client.SuggestGasPrice(context.Background())
		if err != nil {
			log.Printf("⚠️ Getgas pricefailed，use: %v", err)
			auth.GasPrice = big.NewInt(5000000000) // 5 Gwei
		} else {
			// 20%
			multiplier := big.NewInt(120)
			hundred := big.NewInt(100)
			adjustedGasPrice := new(big.Int).Mul(suggestedGasPrice, multiplier)
			adjustedGasPrice = adjustedGasPrice.Div(adjustedGasPrice, hundred)
			auth.GasPrice = adjustedGasPrice
			log.Printf("⛽ GetGas Price: %s wei (: %s wei + 20%%)",
				adjustedGasPrice.String(), suggestedGasPrice.String())
		}
	}

	if networkConfig.GasLimit > 0 {
		auth.GasLimit = networkConfig.GasLimit
		log.Printf("⛽ useconfigurationGas Limit: %d", networkConfig.GasLimit)
	}

	// Verify
	return b.validateGasBalance(client, networkConfig, nil, balance, fromAddress)
}

// validateGasBalance Verifygaswhether
func (b *BlockchainTransactionService) validateGasBalance(client *ethclient.Client, networkConfig *config.NetworkConfig, tx *types.Transaction, balance *big.Int, fromAddress common.Address) error {
	var gasPrice *big.Int
	var gasLimit uint64

	if tx != nil {
		gasPrice = tx.GasPrice()
		gasLimit = tx.Gas()
	} else {
		// networkconfigurationGetorUseDefault
		if networkConfig.GasPrice != "" && networkConfig.GasPrice != "auto" {
			gasPrice, _ = new(big.Int).SetString(networkConfig.GasPrice, 10)
		} else {
			suggestedGasPrice, err := client.SuggestGasPrice(context.Background())
			if err != nil {
				gasPrice = big.NewInt(5000000000) // 5 Gwei
			} else {
				multiplier := big.NewInt(120)
				hundred := big.NewInt(100)
				gasPrice = new(big.Int).Mul(suggestedGasPrice, multiplier)
				gasPrice = gasPrice.Div(gasPrice, hundred)
			}
		}

		if networkConfig.GasLimit > 0 {
			gasLimit = networkConfig.GasLimit
		} else {
			gasLimit = 600000 // withdraw proofneed60gas
		}
	}

	totalGasCost := new(big.Int).Mul(gasPrice, big.NewInt(int64(gasLimit)))
	balanceEth := new(big.Float).Quo(new(big.Float).SetInt(balance), new(big.Float).SetInt64(1e18))
	totalGasCostEth := new(big.Float).Quo(new(big.Float).SetInt(totalGasCost), new(big.Float).SetInt64(1e18))

	log.Printf("💸 gas:")
	log.Printf("   Gas Price: %s wei", gasPrice.String())
	log.Printf("   Gas Limit: %d", gasLimit)
	log.Printf("   gas: %s wei ( %.6f BNB)", totalGasCost.String(), totalGasCostEth)

	// Checkwhether
	if balance.Cmp(totalGasCost) < 0 {
		log.Printf("❌ :")
		log.Printf("   current: %s wei (%.6f BNB)", balance.String(), balanceEth)
		log.Printf("   need: %s wei (%.6f BNB)", totalGasCost.String(), totalGasCostEth)
		shortfall := new(big.Int).Sub(totalGasCost, balance)
		shortfallEth := new(big.Float).Quo(new(big.Float).SetInt(shortfall), new(big.Float).SetInt64(1e18))
		log.Printf("   amount: %s wei (%.6f BNB)", shortfall.String(), shortfallEth)
		return fmt.Errorf("insufficient funds for gas: balance %s wei, required %s wei", balance.String(), totalGasCost.String())
	}

	log.Printf("✅ ，cangas")
	return nil
}

// buildUnsignedTransaction not
func (b *BlockchainTransactionService) buildUnsignedTransaction(client *ethclient.Client, networkConfig *config.NetworkConfig, req *WithdrawRequest, fromAddress common.Address, chainID *big.Int) (*types.Transaction, error) {
	// Getnonce
	nonce, err := client.PendingNonceAt(context.Background(), fromAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to get nonce: %w", err)
	}

	// Setgas
	var gasPrice *big.Int
	if networkConfig.GasPrice != "" && networkConfig.GasPrice != "auto" {
		gasPrice, _ = new(big.Int).SetString(networkConfig.GasPrice, 10)
	} else {
		suggestedGasPrice, err := client.SuggestGasPrice(context.Background())
		if err != nil {
			gasPrice = big.NewInt(5000000000) // 5 Gwei
		} else {
			multiplier := big.NewInt(120)
			hundred := big.NewInt(100)
			gasPrice = new(big.Int).Mul(suggestedGasPrice, multiplier)
			gasPrice = gasPrice.Div(gasPrice, hundred)
		}
	}

	// SetgasRestrict
	var gasLimit uint64
	if networkConfig.GasLimit > 0 {
		gasLimit = networkConfig.GasLimit
	} else {
		gasLimit = 600000 // withdraw proofneed60gas
	}

	// data
	txData, err := b.buildWithdrawCallData(networkConfig, req)
	if err != nil {
		return nil, fmt.Errorf("failed to build call data: %w", err)
	}

	// CreateEIP155
	// Get ZKPay contract address - priority: Database > networkConfig
	zkpayContract, err := getZKPayContractAddress(networkConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to get ZKPay contract address: %w", err)
	}
	contractAddress := common.HexToAddress(zkpayContract)

	// UseNewTxCreateEIP155Legacy
	legacyTx := &types.LegacyTx{
		Nonce:    nonce,
		To:       &contractAddress,
		Value:    big.NewInt(0),
		Gas:      gasLimit,
		GasPrice: gasPrice,
		Data:     txData,
	}
	tx := types.NewTx(legacyTx)

	log.Printf("🔧 EIP155:")
	log.Printf("   Nonce: %d", nonce)
	log.Printf("   To: %s", contractAddress.Hex())
	log.Printf("   Value: %s", big.NewInt(0).String())
	log.Printf("   GasLimit: %d", gasLimit)
	log.Printf("   GasPrice: %s", gasPrice.String())
	log.Printf("   Data: %d", len(txData))
	log.Printf("   ChainID: %s", chainID.String())

	return tx, nil
}

// WithdrawPublicValues matches the Solidity struct in ZKPay.sol
type WithdrawPublicValues struct {
	CommitmentRoot  [32]byte   // bytes32 commitmentRoot
	Nullifiers      [][32]byte // bytes32[] nullifiers
	Amount          *big.Int   // uint256 amount
	IntentType      uint8      // uint8 intentType (0=RawToken, 1=AssetToken)
	Slip44ChainID   uint32     // uint32 slip44chainID
	AdapterId       uint32     // uint32 adapterId (only for AssetToken)
	TokenKey        string     // string tokenKey (only for AssetToken, same as tokenSymbol)
	BeneficiaryData [32]byte   // bytes32 beneficiaryData
	MinOutput       [32]byte   // bytes32 minOutput
	SourceChainId   uint32     // uint32 sourceChainId
	SourceTokenKey  string     // string sourceTokenKey
}

// buildWithdrawCallData builds the call data for executeWithdraw function
// New signature: executeWithdraw(bytes calldata proof, bytes calldata encodedPublicValues)
func (b *BlockchainTransactionService) buildWithdrawCallData(networkConfig *config.NetworkConfig, req *WithdrawRequest) ([]byte, error) {
	// ZKPay contract ABI - new executeWithdraw signature
	zkPayABI := `[
		{
			"inputs": [
				{"name": "proof", "type": "bytes"},
				{"name": "encodedPublicValues", "type": "bytes"}
			],
			"name": "executeWithdraw",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		}
	]`

	// Parse ABI
	parsedABI, err := abi.JSON(strings.NewReader(zkPayABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %w", err)
	}

	// Verify recipient format
	if len(req.Recipient) != 66 { // 0x + 64 hex chars = 66
		return nil, fmt.Errorf("invalid recipient format: expected 32-byte hex string (66 chars), got %d chars: %s", len(req.Recipient), req.Recipient)
	}

	// Parse proof
	proof := common.FromHex(req.SP1Proof)

	var encodedPublicValues []byte

	// If PublicValues is provided (from ZKVM), use it directly
	// Otherwise, build from individual fields (backward compatibility)
	if req.PublicValues != "" {
		// Use ZKVM-provided encoded public values directly
		encodedPublicValues = common.FromHex(req.PublicValues)
		log.Printf("🔧 [executeWithdraw] Using ZKVM-provided PublicValues: %d bytes", len(encodedPublicValues))
	} else {
		// Build from individual fields (backward compatibility)
		// Parse amount
		var amount *big.Int
		var ok bool
		amount, ok = new(big.Int).SetString(req.Amount, 10)
		if !ok {
			amountHex := strings.TrimPrefix(req.Amount, "0x")
			amount, ok = new(big.Int).SetString(amountHex, 16)
			if !ok {
				return nil, fmt.Errorf("invalid amount format: %s", req.Amount)
			}
		}

		// Build WithdrawPublicValues struct
		commitmentRoot := common.HexToHash(req.QueueRoot)
		nullifiers := []common.Hash{common.HexToHash(req.NullifierHash)}
		beneficiaryData := common.HexToHash(req.Recipient)

		// Convert nullifiers to [][32]byte format
		nullifiersBytes := make([][32]byte, len(nullifiers))
		for i, n := range nullifiers {
			copy(nullifiersBytes[i][:], n[:])
		}

		// Build public values struct
		publicValues := WithdrawPublicValues{
			CommitmentRoot:  commitmentRoot,
			Nullifiers:      nullifiersBytes,
			Amount:          amount,
			IntentType:      0, // Default to 0 (RawToken)
			Slip44ChainID:   uint32(req.ChainID),
			AdapterId:       0,            // Not used for RawToken
			TokenKey:        req.TokenKey, // Token key (same as tokenSymbol)
			BeneficiaryData: beneficiaryData,
			MinOutput:       [32]byte{}, // No minimum output constraint
			SourceChainId:   0,          // No source chain for withdraw
			SourceTokenKey:  "",         // No source token for withdraw
		}

		// Encode WithdrawPublicValues struct to bytes using abi.Arguments
		// This matches the Solidity struct encoding (abi.encode)
		arguments := abi.Arguments{
			{Type: mustType("bytes32")},   // commitmentRoot
			{Type: mustType("bytes32[]")}, // nullifiers
			{Type: mustType("uint256")},   // amount
			{Type: mustType("uint8")},     // intentType
			{Type: mustType("uint32")},    // slip44chainID
			{Type: mustType("uint32")},    // adapterId
			{Type: mustType("string")},    // tokenKey
			{Type: mustType("bytes32")},   // beneficiaryData
			{Type: mustType("bytes32")},   // minOutput
			{Type: mustType("uint32")},    // sourceChainId
			{Type: mustType("string")},    // sourceTokenKey
		}

		// Encode the struct values
		encodedPublicValues, err = arguments.Pack(
			publicValues.CommitmentRoot,
			publicValues.Nullifiers,
			publicValues.Amount,
			publicValues.IntentType,
			publicValues.Slip44ChainID,
			publicValues.AdapterId,
			publicValues.TokenKey,
			publicValues.BeneficiaryData,
			publicValues.MinOutput,
			publicValues.SourceChainId,
			publicValues.SourceTokenKey,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to encode public values: %w", err)
		}

		log.Printf("🔧 [executeWithdraw] Built PublicValues from individual fields: %d bytes", len(encodedPublicValues))
	}

	// Log parameters
	log.Printf("🔧 [executeWithdraw parameters]:")
	log.Printf("   proof: %d bytes", len(proof))
	log.Printf("   encodedPublicValues: %d bytes", len(encodedPublicValues))
	if req.PublicValues == "" {
		// Only log detailed fields if we built from individual fields
		commitmentRoot := common.HexToHash(req.QueueRoot)
		nullifiers := []common.Hash{common.HexToHash(req.NullifierHash)}
		log.Printf("   commitmentRoot: %s", commitmentRoot.Hex())
		log.Printf("   nullifiers: %d", len(nullifiers))
		for i, n := range nullifiers {
			log.Printf("     nullifier[%d]: %s", i, n.Hex())
		}
		log.Printf("   amount: %s", req.Amount)
		log.Printf("   recipient: %s", req.Recipient)
		log.Printf("   tokenKey: %s", req.TokenKey)
	}

	// Pack with new signature: executeWithdraw(bytes proof, bytes encodedPublicValues)
	data, err := parsedABI.Pack("executeWithdraw", proof, encodedPublicValues)
	if err != nil {
		return nil, fmt.Errorf("failed to pack withdraw function: %w", err)
	}

	log.Printf("✅ [withdraw] data success, data: %d bytes", len(data))
	return data, nil
}

// applySignatureToTransaction
func (b *BlockchainTransactionService) applySignatureToTransaction(tx *types.Transaction, signature []byte, chainID *big.Int) (*types.Transaction, error) {
	// Create
	signer := types.NewEIP155Signer(chainID)

	signedTx, err := tx.WithSignature(signer, signature)
	if err != nil {
		return nil, fmt.Errorf("failed to apply signature: %w", err)
	}

	return signedTx, nil
}

// processTransaction process（Waitconfirmreturn）
func (b *BlockchainTransactionService) processTransaction(client *ethclient.Client, tx *types.Transaction, req *WithdrawRequest) (*WithdrawResponse, error) {
	log.Printf("✅ success:")
	log.Printf("   hash: %s", tx.Hash().Hex())
	log.Printf("   Gas Price: %s wei", tx.GasPrice().String())
	log.Printf("   Gas Limit: %d", tx.Gas())
	log.Printf("   Nonce: %d", tx.Nonce())

	// Wait
	log.Printf("⏳ wait...")
	receipt, err := b.waitForTransactionWithRetry(client, tx, 3*time.Minute)
	if err != nil {
		log.Printf("❌ retryconfirm: %v", err)

		// recordFailedretry
		if err := b.recordFailedTransaction(req, tx.Hash().Hex(), err.Error()); err != nil {
			log.Printf("⚠️ recordfailedfailed: %v", err)
		}

		return nil, fmt.Errorf("failed to confirm transaction after retries: %w", err)
	}

	// Checkstatus
	if receipt.Status == 0 {
		log.Printf("❌ failed")
		return nil, fmt.Errorf("transaction failed")
	}

	log.Printf("✅ success:")
	log.Printf("   : %d", receipt.BlockNumber.Uint64())
	log.Printf("   gas: %d", receipt.GasUsed)
	log.Printf("   status: %d", receipt.Status)

	return &WithdrawResponse{
		TxHash:    tx.Hash().Hex(),
		GasUsed:   receipt.GasUsed,
		GasPrice:  tx.GasPrice().String(),
		Timestamp: time.Now().Unix(),
	}, nil
}

// submitCommitmentWithSigner  Commitment （use）
func (b *BlockchainTransactionService) submitCommitmentWithSigner(client *ethclient.Client, networkConfig *config.NetworkConfig, req *CommitmentRequest, fromAddress common.Address, chainID *big.Int, strategy SigningStrategy) (*CommitmentTxResponse, error) {
	log.Printf("🚀 [submitCommitmentWithSigner] ========================================")
	log.Printf("🚀 [submitCommitmentWithSigner] Starting commitment submission process...")
	log.Printf("🚀 [submitCommitmentWithSigner] ========================================")
	log.Printf("🔑 [submitCommitmentWithSigner] Using signing strategy: %s", strategy.Name())
	log.Printf("   From Address: %s", fromAddress.Hex())
	log.Printf("   Chain ID: %s", chainID.String())

	// GetVerify
	log.Printf("💰 [submitCommitmentWithSigner] Querying account balance...")
	balance, err := client.BalanceAt(context.Background(), fromAddress, nil)
	if err != nil {
		log.Printf("❌ [submitCommitmentWithSigner] Failed to query balance: %v", err)
		return nil, fmt.Errorf("failed to query balance: %w", err)
	}
	balanceEth := new(big.Float).Quo(new(big.Float).SetInt(balance), new(big.Float).SetInt64(1e18))
	log.Printf("✅ [submitCommitmentWithSigner] Balance: %s wei (%.6f BNB)", balance.String(), balanceEth)

	// not
	log.Printf("🔧 [submitCommitmentWithSigner] Building unsigned transaction...")
	tx, err := b.buildUnsignedCommitmentTransaction(client, networkConfig, req, fromAddress, chainID)
	if err != nil {
		log.Printf("❌ [submitCommitmentWithSigner] Failed to build unsigned transaction: %v", err)
		return nil, fmt.Errorf("failed to build unsigned transaction: %w", err)
	}
	log.Printf("✅ [submitCommitmentWithSigner] Unsigned transaction built successfully")
	log.Printf("   Transaction Hash (unsigned): %s", tx.Hash().Hex())

	// Verifygas
	log.Printf("⛽ [submitCommitmentWithSigner] Validating gas balance...")
	if err := b.validateGasBalance(client, networkConfig, tx, balance, fromAddress); err != nil {
		log.Printf("❌ [submitCommitmentWithSigner] Gas balance validation failed: %v", err)
		return nil, err
	}
	log.Printf("✅ [submitCommitmentWithSigner] Gas balance validation passed")

	// GetEIP155hash
	log.Printf("📝 [submitCommitmentWithSigner] Computing EIP-155 signature hash...")
	signer := types.NewEIP155Signer(chainID)
	sigHash := signer.Hash(tx)
	log.Printf("   Transaction Hash (unsigned): %s", tx.Hash().Hex())
	log.Printf("   EIP-155 Signature Hash: %s", sigHash.Hex())

	// use
	log.Printf("✍️  [submitCommitmentWithSigner] Signing transaction with %s...", strategy.Name())
	signature, err := strategy.Sign(networkConfig, sigHash.Bytes(), sigHash.Hex())
	if err != nil {
		log.Printf("❌ [submitCommitmentWithSigner] Signing failed with %s: %v", strategy.Name(), err)
		return nil, fmt.Errorf("failed to sign with %s: %w", strategy.Name(), err)
	}
	log.Printf("✅ [submitCommitmentWithSigner] Transaction signed successfully")
	log.Printf("   Signature length: %d bytes", len(signature))

	log.Printf("🔧 [submitCommitmentWithSigner] Applying signature to transaction...")
	signedTx, err := b.applySignatureToTransaction(tx, signature, chainID)
	if err != nil {
		log.Printf("❌ [submitCommitmentWithSigner] Failed to apply signature: %v", err)
		return nil, fmt.Errorf("failed to apply signature: %w", err)
	}
	log.Printf("✅ [submitCommitmentWithSigner] Signature applied successfully")

	// Verifyaddress
	log.Printf("🔍 [submitCommitmentWithSigner] Verifying sender address from signature...")
	actualSender, err := types.Sender(signer, signedTx)
	if err != nil {
		log.Printf("❌ [submitCommitmentWithSigner] Failed to recover sender address: %v", err)
	} else {
		log.Printf("✅ [submitCommitmentWithSigner] Sender address verified: %s", actualSender.Hex())
		if actualSender != fromAddress {
			log.Printf("⚠️  [submitCommitmentWithSigner] Warning: sender address mismatch!")
			log.Printf("   Expected: %s", fromAddress.Hex())
			log.Printf("   Actual: %s", actualSender.Hex())
		} else {
			log.Printf("✅ [submitCommitmentWithSigner] Sender address matches expected address")
		}
	}

	log.Printf("📤 [submitCommitmentWithSigner] ========================================")
	log.Printf("📤 [submitCommitmentWithSigner] Sending transaction to blockchain...")
	log.Printf("📤 [submitCommitmentWithSigner] ========================================")
	log.Printf("   Transaction Hash: %s", signedTx.Hash().Hex())
	log.Printf("   Gas Price: %s wei", signedTx.GasPrice().String())
	log.Printf("   Gas Limit: %d", signedTx.Gas())
	log.Printf("   Nonce: %d", signedTx.Nonce())
	err = client.SendTransaction(context.Background(), signedTx)
	if err != nil {
		log.Printf("❌ [submitCommitmentWithSigner] Failed to send transaction: %v", err)
		return nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	log.Printf("✅ [submitCommitmentWithSigner] ========================================")
	log.Printf("✅ [submitCommitmentWithSigner] Transaction sent to blockchain successfully!")
	log.Printf("✅ [submitCommitmentWithSigner] ========================================")
	log.Printf("   Transaction Hash: %s", signedTx.Hash().Hex())
	log.Printf("   Gas Price: %s wei", signedTx.GasPrice().String())
	log.Printf("   Gas Limit: %d", signedTx.Gas())
	log.Printf("   Nonce: %d", signedTx.Nonce())

	// 如果使用队列服务，立即返回（不等待确认）
	// 队列服务会通过 polling 服务异步确认交易
	if b.queueService != nil {
		log.Printf("📤 [submitCommitmentWithSigner] Using queue service, returning immediately without waiting for confirmation")
		log.Printf("   Transaction will be confirmed asynchronously via polling service")
		return &CommitmentTxResponse{
			TxHash:    signedTx.Hash().Hex(),
			GasUsed:   0, // Will be updated after confirmation
			GasPrice:  signedTx.GasPrice().String(),
			Timestamp: time.Now().Unix(),
		}, nil
	}

	// 直接模式：等待交易确认
	return b.processCommitmentTransaction(client, signedTx, req)
}

// buildUnsignedCommitmentTransaction notcommitment
func (b *BlockchainTransactionService) buildUnsignedCommitmentTransaction(client *ethclient.Client, networkConfig *config.NetworkConfig, req *CommitmentRequest, fromAddress common.Address, chainID *big.Int) (*types.Transaction, error) {
	log.Printf("🔧 [buildUnsignedCommitmentTransaction] Building unsigned commitment transaction...")
	log.Printf("   From Address: %s", fromAddress.Hex())
	log.Printf("   Chain ID: %s", chainID.String())

	// Getnonce
	log.Printf("🔢 [buildUnsignedCommitmentTransaction] Getting pending nonce...")
	nonce, err := client.PendingNonceAt(context.Background(), fromAddress)
	if err != nil {
		log.Printf("❌ [buildUnsignedCommitmentTransaction] Failed to get nonce: %v", err)
		return nil, fmt.Errorf("failed to get nonce: %w", err)
	}
	log.Printf("✅ [buildUnsignedCommitmentTransaction] Nonce: %d", nonce)

	// Setgas
	log.Printf("⛽ [buildUnsignedCommitmentTransaction] Setting gas price...")
	var gasPrice *big.Int
	if networkConfig.GasPrice != "" && networkConfig.GasPrice != "auto" {
		gasPrice, _ = new(big.Int).SetString(networkConfig.GasPrice, 10)
		log.Printf("   Using configured gas price: %s wei", gasPrice.String())
	} else {
		log.Printf("   Getting suggested gas price from network...")
		suggestedGasPrice, err := client.SuggestGasPrice(context.Background())
		if err != nil {
			gasPrice = big.NewInt(5000000000) // 5 Gwei
			log.Printf("   ⚠️  Failed to get suggested gas price, using default: %s wei (5 Gwei)", gasPrice.String())
		} else {
			multiplier := big.NewInt(120)
			hundred := big.NewInt(100)
			gasPrice = new(big.Int).Mul(suggestedGasPrice, multiplier)
			gasPrice = gasPrice.Div(gasPrice, hundred)
			log.Printf("   ✅ Suggested gas price: %s wei, using 120%%: %s wei", suggestedGasPrice.String(), gasPrice.String())
		}
	}

	// SetgasRestrict
	var gasLimit uint64
	if networkConfig.GasLimit > 0 {
		gasLimit = networkConfig.GasLimit
		log.Printf("🔧 [GasLimit] useconfiguration fileGas Limit: %d", gasLimit)
	} else {
		gasLimit = 1000000 // executeCommitment  withdraw needgas，SP1Verifyneedgas
		log.Printf("🔧 [GasLimit] configuration filenotGas Limit，use: %d", gasLimit)
	}

	// data
	log.Printf("📦 [buildUnsignedCommitmentTransaction] Building call data...")
	txData, err := b.buildCommitmentCallData(networkConfig, req)
	if err != nil {
		log.Printf("❌ [buildUnsignedCommitmentTransaction] Failed to build call data: %v", err)
		return nil, fmt.Errorf("failed to build call data: %w", err)
	}
	log.Printf("✅ [buildUnsignedCommitmentTransaction] Call data built: %d bytes", len(txData))

	// CreateEIP155
	log.Printf("📝 [buildUnsignedCommitmentTransaction] Creating EIP-155 transaction...")

	// Get ZKPay contract address - priority: Database > networkConfig
	zkpayContract, err := getZKPayContractAddress(networkConfig)
	if err != nil {
		log.Printf("❌ [buildUnsignedCommitmentTransaction] Failed to get ZKPay contract address: %v", err)
		return nil, fmt.Errorf("failed to get ZKPay contract address: %w", err)
	}
	contractAddress := common.HexToAddress(zkpayContract)
	log.Printf("   Contract Address: %s", contractAddress.Hex())

	// UseNewTxCreateEIP155Legacy
	legacyTx := &types.LegacyTx{
		Nonce:    nonce,
		To:       &contractAddress,
		Value:    big.NewInt(0),
		Gas:      gasLimit,
		GasPrice: gasPrice,
		Data:     txData,
	}
	tx := types.NewTx(legacyTx)

	log.Printf("🔧 EIP155 commitment:")
	log.Printf("   Nonce: %d", nonce)
	log.Printf("   To: %s", contractAddress.Hex())
	log.Printf("   Value: %s", big.NewInt(0).String())
	log.Printf("   GasLimit: %d", gasLimit)
	log.Printf("   GasPrice: %s", gasPrice.String())
	log.Printf("   Data: %d", len(txData))
	log.Printf("   ChainID: %s", chainID.String())

	return tx, nil
}

// buildCommitmentCallData executeCommitmentdata
func (b *BlockchainTransactionService) buildCommitmentCallData(networkConfig *config.NetworkConfig, req *CommitmentRequest) ([]byte, error) {
	log.Printf("🚨🚨🚨 [PROOF DEBUG] buildCommitmentCallData ！🚨🚨🚨")
	log.Printf("🔧 [buildCommitmentCallData] SP1Proof: %d", len(req.SP1Proof))
	log.Printf("🔧 [buildCommitmentCallData] SP1Proof100: %s", func() string {
		if len(req.SP1Proof) > 100 {
			return req.SP1Proof[:100] + "..."
		}
		return req.SP1Proof
	}())
	// ZKPay contract ABI - new executeCommitment signature
	zkPayABI := `[
		{
			"inputs": [
				{"name": "proof", "type": "bytes"},
				{"name": "encodedPublicValues", "type": "bytes"}
			],
			"name": "executeCommitment",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		}
	]`

	// ParseABI
	parsedABI, err := abi.JSON(strings.NewReader(zkPayABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %w", err)
	}

	// Parseproof - ZKVM servicereturnhexproof.bytes()
	if req.SP1Proof == "" {
		log.Printf("❌ [CRITICAL] SP1Proofempty！proofempty")
		return nil, fmt.Errorf("SP1Proofcannotempty")
	}

	log.Printf("🔍 [SP1ProofParse] data: %d", len(req.SP1Proof))

	// ZKVM servicereturnhexproof.bytes()，Parse
	var proof []byte
	if strings.HasPrefix(req.SP1Proof, "0x") {
		// Hex：ZKVM servicereturn
		proof = common.FromHex(req.SP1Proof)
		log.Printf("✅ [SP1ProofParse] usehexproof.bytes(): %d", len(proof))
	} else if strings.HasPrefix(req.SP1Proof, "{") {
		// JSON：data（）
		log.Printf("⚠️ [SP1ProofParse] JSON，ZKVM service")
		proof = []byte(req.SP1Proof)
		log.Printf("🔄 [SP1ProofParse] processJSON: %d", len(proof))
	} else {
		// hex
		hexStr := req.SP1Proof
		if decoded, err := hex.DecodeString(hexStr); err == nil {
			proof = decoded
			log.Printf("✅ [SP1ProofParse] Parsehex: %d", len(proof))
		} else {
			// 50ErrorMessage
			maxLen := 50
			if len(req.SP1Proof) < maxLen {
				maxLen = len(req.SP1Proof)
			}
			return nil, fmt.Errorf("ParseSP1Proof: %s", req.SP1Proof[:maxLen])
		}
	}

	// Verifyproofempty
	if len(proof) == 0 {
		log.Printf("❌ [CRITICAL] Parseproofempty！contractfailed")
		return nil, fmt.Errorf("Parseproofdataempty")
	}

	// 3. checkbookpublic_valuesParseZKVM
	log.Printf("🔍 [PublicValuesParse] startParsecheckbookZKVM public_values...")

	// corresponding tocheckbookrecord，Getpublic_values
	var checkbook models.Checkbook

	// UseCheckbookID，ifthenUsechain_idandlocal_deposit_id
	if req.CheckbookID != "" {
		err = db.DB.Where("id = ?", req.CheckbookID).First(&checkbook).Error
		if err != nil {
			log.Printf("❌ [CRITICAL] corresponding tocheckbookrecord: checkbookId=%s", req.CheckbookID)
			return nil, fmt.Errorf("corresponding tocheckbookrecord: %s", req.CheckbookID)
		}
		log.Printf("✅ [PublicValues] CheckbookIDrecord: %s", req.CheckbookID)
	} else {
		err = db.DB.Where("chain_id = ? AND local_deposit_id = ?", req.ChainID, req.LocalDepositID).First(&checkbook).Error
		if err != nil {
			log.Printf("❌ [CRITICAL] corresponding tocheckbookrecord: chainId=%d, localDepositId=%d", req.ChainID, req.LocalDepositID)
			return nil, fmt.Errorf("corresponding tocheckbookrecord")
		}
		log.Printf("✅ [PublicValues] ChainID+LocalDepositIDrecord: %d/%d", req.ChainID, req.LocalDepositID)
	}

	if checkbook.PublicValues == "" {
		log.Printf("❌ [CRITICAL] checkbookPublicValuesempty，GetZKVM")
		return nil, fmt.Errorf("checkbookPublicValuesempty")
	}

	log.Printf("✅ [PublicValues] checkbook record, PublicValues: %d bytes", len(checkbook.PublicValues))

	// Use ZKVM-provided encoded public values directly
	encodedPublicValues := common.FromHex(checkbook.PublicValues)
	log.Printf("🔧 [executeCommitment] Using ZKVM-provided PublicValues: %d bytes", len(encodedPublicValues))

	// Log parameters
	log.Printf("🔧 [executeCommitment parameters]:")
	log.Printf("   proof: %d bytes", len(proof))
	log.Printf("   encodedPublicValues: %d bytes", len(encodedPublicValues))

	// Pack with new signature: executeCommitment(bytes proof, bytes encodedPublicValues)
	data, err := parsedABI.Pack("executeCommitment", proof, encodedPublicValues)
	if err != nil {
		return nil, fmt.Errorf("failed to pack executeCommitment function: %w", err)
	}

	log.Printf("✅ [executeCommitment] datasuccess，data: %d bytes", len(data))
	return data, nil
}

// processCommitmentTransaction processcommitment（Waitconfirmreturn）
func (b *BlockchainTransactionService) processCommitmentTransaction(client *ethclient.Client, tx *types.Transaction, req *CommitmentRequest) (*CommitmentTxResponse, error) {
	log.Printf("⏳ [processCommitmentTransaction] ========================================")
	log.Printf("⏳ [processCommitmentTransaction] Waiting for transaction confirmation...")
	log.Printf("⏳ [processCommitmentTransaction] ========================================")
	log.Printf("   Transaction Hash: %s", tx.Hash().Hex())
	log.Printf("   Gas Price: %s wei", tx.GasPrice().String())
	log.Printf("   Gas Limit: %d", tx.Gas())
	log.Printf("   Nonce: %d", tx.Nonce())
	log.Printf("   Checkbook ID: %s", req.CheckbookID)
	log.Printf("   Commitment: %s", req.Commitment)
	log.Printf("   Timeout: 3 minutes")

	// Wait
	log.Printf("⏳ [processCommitmentTransaction] Polling for transaction receipt...")
	receipt, err := b.waitForTransactionWithRetry(client, tx, 3*time.Minute)
	if err != nil {
		log.Printf("❌ [processCommitmentTransaction] ========================================")
		log.Printf("❌ [processCommitmentTransaction] Failed to confirm transaction after retries")
		log.Printf("❌ [processCommitmentTransaction] ========================================")
		log.Printf("   Transaction Hash: %s", tx.Hash().Hex())
		log.Printf("   Error: %v", err)

		// recordFailedretry
		log.Printf("📝 [processCommitmentTransaction] Recording failed transaction for retry...")
		if err := b.recordFailedCommitmentTransaction(req, tx.Hash().Hex(), err.Error()); err != nil {
			log.Printf("⚠️ [processCommitmentTransaction] Failed to record failed transaction: %v", err)
		} else {
			log.Printf("✅ [processCommitmentTransaction] Failed transaction recorded for retry")
		}

		return nil, fmt.Errorf("failed to confirm transaction after retries: %w", err)
	}

	// Checkstatus
	log.Printf("🔍 [processCommitmentTransaction] Checking transaction status...")
	if receipt.Status == 0 {
		log.Printf("❌ [processCommitmentTransaction] ========================================")
		log.Printf("❌ [processCommitmentTransaction] Transaction failed on blockchain!")
		log.Printf("❌ [processCommitmentTransaction] ========================================")
		log.Printf("   Transaction Hash: %s", tx.Hash().Hex())
		log.Printf("   Block Number: %d", receipt.BlockNumber.Uint64())
		log.Printf("   Gas Used: %d", receipt.GasUsed)
		log.Printf("   Status: 0 (Failed)")
		return nil, fmt.Errorf("commitment transaction failed")
	}

	log.Printf("✅ [processCommitmentTransaction] ========================================")
	log.Printf("✅ [processCommitmentTransaction] Transaction confirmed successfully!")
	log.Printf("✅ [processCommitmentTransaction] ========================================")
	log.Printf("   Transaction Hash: %s", tx.Hash().Hex())
	log.Printf("   Block Number: %d", receipt.BlockNumber.Uint64())
	log.Printf("   Gas Used: %d", receipt.GasUsed)
	log.Printf("   Status: %d (Success)", receipt.Status)
	log.Printf("   Checkbook ID: %s", req.CheckbookID)
	log.Printf("   Commitment: %s", req.Commitment)

	return &CommitmentTxResponse{
		TxHash:    tx.Hash().Hex(),
		GasUsed:   receipt.GasUsed,
		GasPrice:  tx.GasPrice().String(),
		Timestamp: time.Now().Unix(),
	}, nil
}

// recordFailedCommitmentTransaction recordFailedcommitmentretry
func (b *BlockchainTransactionService) recordFailedCommitmentTransaction(req *CommitmentRequest, txHash, errorMsg string) error {
	log.Printf("📝 recordfailedcommitmentretry: %s", txHash)

	failedTx := &models.FailedTransaction{
		ID:            uuid.New().String(),
		TxType:        models.FailedTransactionTypeCommitment,
		Status:        models.FailedTransactionStatusPending,
		CheckbookID:   req.CheckbookID,
		CheckID:       "", // commitmentCheckID
		TxHash:        txHash,
		Nullifier:     "", // commitmentnullifier
		Recipient:     "", // commitmentrecipient
		Amount:        req.AllocatableAmount,
		RetryCount:    0,
		MaxRetries:    10,
		NextRetryAt:   time.Now().Add(10 * time.Second),
		LastError:     "",
		OriginalError: errorMsg,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := db.DB.Create(failedTx).Error; err != nil {
		return fmt.Errorf("failed to record failed commitment transaction: %w", err)
	}

	log.Printf("✅ failedcommitmentalreadyrecord，ID: %s", failedTx.ID)
	return nil
}

// Close clientconnection
func (b *BlockchainTransactionService) Close() {
	for _, client := range b.clients {
		client.Close()
	}
}
