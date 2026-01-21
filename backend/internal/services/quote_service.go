package services

import (
	"context"
	"errors"
	"fmt"
	"go-backend/internal/clients"
	"go-backend/internal/db"
	"log"
	"math/big"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// QuoteService provides route, fees, and asset information for SDK
type QuoteService struct {
	db             *gorm.DB
	lifiClient     *clients.LiFiClient
	debridgeClient *clients.DeBridgeClient
	gasPriceClient *clients.GasPriceClient
	defiClient     *clients.DeFiClient
}

// NewQuoteService creates a new QuoteService instance
func NewQuoteService() *QuoteService {
	return &QuoteService{
		db:             db.DB,
		lifiClient:     clients.NewLiFiClient(),
		debridgeClient: clients.NewDeBridgeClient(),
		gasPriceClient: clients.NewGasPriceClient(),
		defiClient:     clients.NewDeFiClient(),
	}
}

// ============================================================================
// Route & Fees Query
// ============================================================================

// RouteAndFeesRequest represents the request structure
type RouteAndFeesRequest struct {
	OwnerData struct {
		ChainID uint32 `json:"chainId" binding:"required"`
		Data    string `json:"data" binding:"required"`
	} `json:"ownerData" binding:"required"`
	DepositToken string                 `json:"depositToken" binding:"required"`
	Intent       map[string]interface{} `json:"intent" binding:"required"`
	Amount       string                 `json:"amount" binding:"required"`
	IncludeHook  bool                   `json:"includeHook"`
}

// RouteStep represents a step in the cross-chain route
type RouteStep struct {
	Step          int    `json:"step"`
	Chain         string `json:"chain"`
	Action        string `json:"action"`
	EstimatedTime string `json:"estimatedTime"`
}

// GasFee represents gas cost information
type GasFee struct {
	Chain           string `json:"chain"`
	EstimatedGas    string `json:"estimatedGas"`
	CurrentGasPrice string `json:"currentGasPrice"`
	GasCostInNative string `json:"gasCostInNative"`
	GasCostInUSD    string `json:"gasCostInUSD"`
	Recommendation  string `json:"recommendation,omitempty"`
}

// BridgeFee represents bridge fee information
type BridgeFee struct {
	BridgeName       string `json:"bridgeName"`
	FeeType          string `json:"feeType"`
	FeeInSourceToken string `json:"feeInSourceToken"`
	FeeInUSD         string `json:"feeInUSD"`
	Slippage         string `json:"slippage"`
	MinReceived      string `json:"minReceived"`
}

// FeeSummary represents total fee summary
type FeeSummary struct {
	TotalGasCostUSD      string `json:"totalGasCostUSD"`
	TotalBridgeFeeUSD    string `json:"totalBridgeFeeUSD"`
	TotalCostUSD         string `json:"totalCostUSD"`
	EstimatedReceived    string `json:"estimatedReceived"`
	ProtocolFeeRate      string `json:"protocolFeeRate"`      // 协议手续费费率（如 "0.003" 表示 0.3%）
	ProtocolFeeAmount    string `json:"protocolFeeAmount"`    // 协议手续费金额（Wei格式）
	ProtocolFeeUnit      string `json:"protocolFeeUnit"`      // 协议手续费单位（如 "USDT"）
	GasEstimateUnit      string `json:"gasEstimateUnit"`      // Gas费用单位（如 "USDT"）
}

// TimelineStep represents a timeline step
type TimelineStep struct {
	Stage string `json:"stage"`
	Time  string `json:"time"`
}

// Warning represents a warning message
type Warning struct {
	Level      string `json:"level"`
	Message    string `json:"message"`
	Suggestion string `json:"suggestion,omitempty"`
}

// QuoteMeta represents quote metadata
type QuoteMeta struct {
	QuoteID    string `json:"quoteId"`
	ValidUntil string `json:"validUntil"`
	Timestamp  string `json:"timestamp"`
}

// RouteQuoteResponse represents the complete response
type RouteQuoteResponse struct {
	Route struct {
		Bridge         string      `json:"bridge"`
		BridgeProtocol string      `json:"bridgeProtocol"`
		EstimatedTime  string      `json:"estimatedTime"`
		Steps          []RouteStep `json:"steps"`
	} `json:"route"`
	Fees struct {
		ProofGeneration GasFee     `json:"proofGeneration"`
		ExecuteWithdraw GasFee     `json:"executeWithdraw"`
		Bridge          BridgeFee  `json:"bridge"`
		HookExecution   *GasFee    `json:"hookExecution,omitempty"`
		Summary         FeeSummary `json:"summary"`
	} `json:"fees"`
	Timeline struct {
		Total     string         `json:"total"`
		Breakdown []TimelineStep `json:"breakdown"`
	} `json:"timeline"`
	Warnings []Warning `json:"warnings"`
	Meta     QuoteMeta `json:"meta"`
}

// isHookSupportedOnChain checks if Hook is supported on the target chain
func isHookSupportedOnChain(chainID uint32) bool {
	// Hook is only supported on major EVM chains with Aave/Compound
	switch chainID {
	case 1: // Ethereum
		return true
	case 137: // Polygon
		return true
	case 42161: // Arbitrum
		return true
	case 10: // Optimism
		return true
	case 56: // BSC
		return false
	case 195: // TRON - Hook not supported
		return false
	default:
		return false
	}
}

// isTronSupportedToken checks if token is supported when TRON is destination
func isTronSupportedToken(tokenSymbol string) bool {
	// TRON currently only supports USDT
	// USDC support is not yet available on TRON
	switch tokenSymbol {
	case "USDT":
		return true
	default:
		return false
	}
}

// GetRouteAndFees queries the optimal route, bridge fees, and gas estimates
func (s *QuoteService) GetRouteAndFees(ctx context.Context, req *RouteAndFeesRequest) (*RouteQuoteResponse, error) {
	// 1. Validate ownerData and depositToken
	sourceChainID := req.OwnerData.ChainID
	depositToken := req.DepositToken

	// 2. Extract target chain from intent
	targetChainID, err := s.extractTargetChainFromIntent(req.Intent)
	if err != nil {
		return nil, fmt.Errorf("invalid intent: %w", err)
	}

	// 3. Get chain names
	sourceChainName := s.getChainName(sourceChainID)
	targetChainName := s.getChainName(targetChainID)

	// 4. Extract target token from intent
	targetToken, err := s.extractTargetTokenFromIntent(req.Intent)
	if err != nil {
		return nil, fmt.Errorf("failed to extract target token: %w", err)
	}

	// 4.5. Fast path: 如果 tokenSymbol == depositToken 且 chainId 相同，直接返回结果
	targetTokenSymbol := ""
	if tokenSymbol, ok := req.Intent["tokenSymbol"]; ok {
		if tokenStr, ok := tokenSymbol.(string); ok && len(tokenStr) > 0 {
			targetTokenSymbol = tokenStr
		}
	}

	if targetTokenSymbol == depositToken && sourceChainID == targetChainID {
		log.Printf("[QuoteService] Fast path: same token and chain (tokenSymbol=%s, depositToken=%s, chainId=%d)",
			targetTokenSymbol, depositToken, sourceChainID)
		return s.getFastPathResponse(ctx, sourceChainID, req.Amount, targetTokenSymbol)
	}

	// 5. TRON-specific validation
	if targetChainID == 195 {
		log.Printf("[QuoteService] TRON destination detected, includeHook=%v", req.IncludeHook)

		// Extract target token symbol from intent for validation
		targetTokenSymbol := ""

		// Try to get tokenSymbol from intent map (token_contract removed from Intent)
		if tokenSymbol, ok := req.Intent["tokenSymbol"]; ok {
			if tokenStr, ok := tokenSymbol.(string); ok && len(tokenStr) > 0 {
				targetTokenSymbol = tokenStr
			}
		}

		// If we found a token symbol, validate it's supported on TRON
		if targetTokenSymbol != "" && !isTronSupportedToken(targetTokenSymbol) {
			return nil, fmt.Errorf("unsupported token on TRON: %s (only USDT is supported)", targetTokenSymbol)
		}

		// Disable Hook on TRON
		if req.IncludeHook {
			log.Printf("[QuoteService] ERROR: Hook requested on TRON - not allowed")
			return nil, fmt.Errorf("Hook is not supported when destination is TRON")
		}
	}

	// 6. Validate Hook support on target chain
	if req.IncludeHook && !isHookSupportedOnChain(targetChainID) {
		return nil, fmt.Errorf("Hook is not supported on destination chain %d", targetChainID)
	}

	// 7. Query bridge for route (smart routing: LiFi for EVM, deBridge for TRON)
	route := s.queryBridgeRoute(ctx, sourceChainID, targetChainID, depositToken, targetToken, req.Amount)

	// 5. Get gas prices
	gasPrice := s.getGasPrice(ctx, sourceChainID)
	targetGasPrice := s.getGasPrice(ctx, targetChainID)

	// 6. Calculate fees
	response := &RouteQuoteResponse{}

	// Route information
	response.Route.Bridge = route.Bridge
	response.Route.BridgeProtocol = route.Protocol
	response.Route.EstimatedTime = route.EstimatedTime
	response.Route.Steps = []RouteStep{
		{
			Step:          1,
			Chain:         fmt.Sprintf("%s (%d)", sourceChainName, sourceChainID),
			Action:        "Redeem from Treasury",
			EstimatedTime: "30s",
		},
		{
			Step:          2,
			Chain:         "Bridge",
			Action:        fmt.Sprintf("%s %s Bridge", strings.Title(route.Bridge), route.Protocol),
			EstimatedTime: route.EstimatedTime,
		},
		{
			Step:          3,
			Chain:         fmt.Sprintf("%s (%d)", targetChainName, targetChainID),
			Action:        "Receive at IntentManager",
			EstimatedTime: "30s",
		},
	}

	// Fees
	response.Fees.ProofGeneration = GasFee{
		Chain:           sourceChainName,
		EstimatedGas:    "150000",
		CurrentGasPrice: gasPrice,
		GasCostInNative: "0.00075 BNB", // TODO: calculate based on chain
		GasCostInUSD:    "0.45",
		Recommendation:  "normal",
	}

	response.Fees.ExecuteWithdraw = GasFee{
		Chain:           sourceChainName,
		EstimatedGas:    "300000",
		CurrentGasPrice: gasPrice,
		GasCostInNative: "0.0015 BNB",
		GasCostInUSD:    "0.90",
	}

	response.Fees.Bridge = BridgeFee{
		BridgeName:       fmt.Sprintf("%s %s", strings.Title(route.Bridge), route.Protocol),
		FeeType:          "dynamic",
		FeeInSourceToken: route.Fee,
		FeeInUSD:         route.FeeUSD,
		Slippage:         "0.3%",
		MinReceived:      route.ToAmountMin,
	}

	// Hook execution (if requested)
	if req.IncludeHook {
		response.Fees.HookExecution = &GasFee{
			Chain:           targetChainName,
			EstimatedGas:    "200000",
			CurrentGasPrice: targetGasPrice,
			GasCostInNative: "0.006 ETH",
			GasCostInUSD:    "15.0",
		}
	}

	// Summary
	totalGasCost := 0.45 + 0.90
	if req.IncludeHook {
		totalGasCost += 15.0
	}
	totalBridgeFee := 10.0
	totalCost := totalGasCost + totalBridgeFee
	
	// Parse amount to calculate protocol fee
	amountFloat := parseAmount(req.Amount)
	
	// Calculate protocol fee rate (bridge fee / amount)
	protocolFeeRate := 0.0
	if amountFloat > 0 {
		protocolFeeRate = totalBridgeFee / amountFloat
	}
	
	// 实际到账 = amount - 协议费用（不是 totalCost）
	estimatedReceivedFloat := amountFloat - totalBridgeFee
	if estimatedReceivedFloat < 0 {
		estimatedReceivedFloat = 0
	}
	
	// Convert estimatedReceived to Wei format (multiply by 10^18)
	estimatedReceivedWei := big.NewFloat(estimatedReceivedFloat)
	weiMultiplier := big.NewFloat(1e18)
	estimatedReceivedWei.Mul(estimatedReceivedWei, weiMultiplier)
	estimatedReceivedWeiStr, _ := estimatedReceivedWei.Int(nil)
	
	// Convert protocol fee to Wei format
	protocolFeeWei := big.NewFloat(totalBridgeFee)
	protocolFeeWei.Mul(protocolFeeWei, weiMultiplier)
	protocolFeeWeiStr, _ := protocolFeeWei.Int(nil)
	
	// Get token symbol for units
	tokenUnit := targetTokenSymbol
	if tokenUnit == "" {
		tokenUnit = depositToken
	}
	
	response.Fees.Summary = FeeSummary{
		TotalGasCostUSD:   fmt.Sprintf("%.2f", totalGasCost),
		TotalBridgeFeeUSD: fmt.Sprintf("%.2f", totalBridgeFee),
		TotalCostUSD:      fmt.Sprintf("%.2f", totalCost),
		EstimatedReceived: estimatedReceivedWeiStr.String(), // Wei 格式
		ProtocolFeeRate:   fmt.Sprintf("%.6f", protocolFeeRate),
		ProtocolFeeAmount: protocolFeeWeiStr.String(), // Wei 格式
		ProtocolFeeUnit:   tokenUnit,
		GasEstimateUnit:   tokenUnit,
	}

	// Timeline
	response.Timeline.Total = "3-6min"
	response.Timeline.Breakdown = []TimelineStep{
		{Stage: "Proof Generation", Time: "30s"},
		{Stage: "Execute Withdraw", Time: "15s"},
		{Stage: "Cross-chain Bridge", Time: route.EstimatedTime},
	}
	if req.IncludeHook {
		response.Timeline.Breakdown = append(response.Timeline.Breakdown, TimelineStep{
			Stage: "Hook Execution",
			Time:  "30s",
		})
	}

	// Warnings
	response.Warnings = s.generateWarnings(gasPrice, targetGasPrice)

	// Meta
	now := time.Now()
	response.Meta = QuoteMeta{
		QuoteID:    fmt.Sprintf("quote_%d", now.Unix()),
		ValidUntil: now.Add(5 * time.Minute).Format(time.RFC3339),
		Timestamp:  now.Format(time.RFC3339),
	}

	return response, nil
}

// ============================================================================
// Hook Asset Query
// ============================================================================

// HookAssetRequest represents the request structure
type HookAssetRequest struct {
	Chain     uint32 `json:"chain" binding:"required"`
	Protocol  string `json:"protocol" binding:"required"`
	BaseToken string `json:"baseToken" binding:"required"`
	Amount    string `json:"amount" binding:"required"`
}

// HookAssetResponse represents the complete asset information
type HookAssetResponse struct {
	Asset struct {
		Protocol     string `json:"protocol"`
		BaseToken    string `json:"baseToken"`
		YieldToken   string `json:"yieldToken"`
		TokenAddress string `json:"tokenAddress"`
		Yield        struct {
			CurrentAPY  string `json:"currentAPY"`
			APY7d       string `json:"apy7d"`
			APY30d      string `json:"apy30d"`
			Source      string `json:"source"`
			LastUpdated string `json:"lastUpdated"`
		} `json:"yield"`
		Price struct {
			BaseTokenPrice  string `json:"baseTokenPrice"`
			YieldTokenPrice string `json:"yieldTokenPrice"`
			ExchangeRate    string `json:"exchangeRate"`
			PriceImpact     string `json:"priceImpact"`
		} `json:"price"`
		Fees struct {
			DepositFee     string `json:"depositFee"`
			WithdrawalFee  string `json:"withdrawalFee"`
			PerformanceFee string `json:"performanceFee"`
			EstimatedFees  struct {
				InputAmount string `json:"inputAmount"`
				Fees        string `json:"fees"`
				NetReceived string `json:"netReceived"`
			} `json:"estimatedFees"`
		} `json:"fees"`
		Conversion struct {
			Input struct {
				Token  string `json:"token"`
				Amount string `json:"amount"`
			} `json:"input"`
			Output struct {
				Token          string `json:"token"`
				ExpectedAmount string `json:"expectedAmount"`
				MinAmount      string `json:"minAmount"`
				ValueInUSD     string `json:"valueInUSD"`
			} `json:"output"`
		} `json:"conversion"`
		ProtocolHealth struct {
			Status          string `json:"status"`
			TVL             string `json:"tvl"`
			UtilizationRate string `json:"utilizationRate"`
			Available       string `json:"available"`
		} `json:"protocolHealth"`
		Risks []struct {
			Type        string `json:"type"`
			Level       string `json:"level"`
			Description string `json:"description"`
		} `json:"risks"`
	} `json:"asset"`
	Alternatives []struct {
		Protocol   string `json:"protocol"`
		YieldToken string `json:"yieldToken"`
		CurrentAPY string `json:"currentAPY"`
		Reason     string `json:"reason"`
	} `json:"alternatives,omitempty"`
	Meta struct {
		DataSource      string `json:"dataSource"`
		LastUpdated     string `json:"lastUpdated"`
		CacheValidUntil string `json:"cacheValidUntil"`
	} `json:"meta"`
}

// GetHookAsset queries Hook asset information (APY, fees, conversion)
func (s *QuoteService) GetHookAsset(ctx context.Context, req *HookAssetRequest) (*HookAssetResponse, error) {
	// Check if Hook is supported on the chain
	if !isHookSupportedOnChain(req.Chain) {
		return nil, fmt.Errorf("Hook is not supported on chain %d (only Ethereum, Polygon, Arbitrum, Optimism supported)", req.Chain)
	}

	// Validate protocol
	supportedProtocols := map[string]bool{
		"aave":     true,
		"compound": true,
		"yearn":    true,
		"lido":     true,
	}

	if !supportedProtocols[req.Protocol] {
		return nil, fmt.Errorf("unsupported protocol: %s", req.Protocol)
	}

	// Query protocol data (TODO: implement actual API calls to Aave, Compound, etc.)
	// For now, return mock data
	response := s.getProtocolData(ctx, req.Chain, req.Protocol, req.BaseToken, req.Amount)

	return response, nil
}

// ============================================================================
// Helper Methods
// ============================================================================

// LiFiRouteResult represents bridge route query result (LiFi or deBridge)
type LiFiRouteResult struct {
	Bridge        string // "lifi" or "debridge"
	Protocol      string
	EstimatedTime string
	Fee           string
	FeeUSD        string
	ToAmount      string
	ToAmountMin   string
}

// queryBridgeRoute queries bridge for optimal route (smart routing)
func (s *QuoteService) queryBridgeRoute(ctx context.Context, sourceChain, targetChain uint32, sourceToken, targetToken, amount string) LiFiRouteResult {
	// Smart routing: check if TRON is involved
	isTronInvolved := clients.IsTronChain(sourceChain) || clients.IsTronChain(targetChain)

	if isTronInvolved {
		// Use deBridge for TRON
		log.Printf("[QuoteService] Using deBridge for TRON route: %d -> %d", sourceChain, targetChain)
		return s.queryDeBridgeRoute(ctx, sourceChain, targetChain, sourceToken, targetToken, amount)
	} else {
		// Use LiFi for EVM chains
		log.Printf("[QuoteService] Using LiFi for EVM route: %d -> %d", sourceChain, targetChain)
		return s.queryLiFiRoute(ctx, sourceChain, targetChain, sourceToken, targetToken, amount)
	}
}

// queryLiFiRoute queries LiFi for EVM chains
func (s *QuoteService) queryLiFiRoute(ctx context.Context, sourceChain, targetChain uint32, sourceToken, targetToken, amount string) LiFiRouteResult {
	// Call LiFi API
	quote, err := s.lifiClient.GetQuote(ctx, &clients.LiFiQuoteRequest{
		FromChain:  clients.GetLiFiChainId(sourceChain),
		ToChain:    clients.GetLiFiChainId(targetChain),
		FromToken:  sourceToken,
		ToToken:    targetToken,
		FromAmount: amount,
	})

	if err != nil {
		log.Printf("[QuoteService] LiFi API error: %v, using fallback", err)
		// Fallback to default values
		return LiFiRouteResult{
			Bridge:        "lifi",
			Protocol:      "Stargate",
			EstimatedTime: "2-5min",
			Fee:           "10 USDT",
			FeeUSD:        "10.0",
		}
	}

	// Extract data from LiFi response
	tool := quote.Tool
	if tool == "" && quote.Estimate.Tool != "" {
		tool = quote.Estimate.Tool
	}

	// Calculate estimated time
	estimatedTime := clients.FormatDuration(quote.Estimate.ExecutionDuration)
	if estimatedTime == "" {
		estimatedTime = "2-5min"
	}

	// Calculate total fees in USD
	totalFeeUSD := 0.0
	for _, fee := range quote.Estimate.FeeCosts {
		if feeUSD, err := strconv.ParseFloat(fee.AmountUSD, 64); err == nil {
			totalFeeUSD += feeUSD
		}
	}

	// Get fee amount in source token
	feeAmount := "0"
	feeSymbol := "USDT"
	if len(quote.Estimate.FeeCosts) > 0 {
		feeAmount = quote.Estimate.FeeCosts[0].Amount
		feeSymbol = quote.Estimate.FeeCosts[0].Token.Symbol
	}

	return LiFiRouteResult{
		Bridge:        "lifi",
		Protocol:      tool,
		EstimatedTime: estimatedTime,
		Fee:           fmt.Sprintf("%s %s", formatAmount(feeAmount), feeSymbol),
		FeeUSD:        fmt.Sprintf("%.2f", totalFeeUSD),
		ToAmount:      quote.Estimate.ToAmount,
		ToAmountMin:   quote.Estimate.ToAmountMin,
	}
}

// queryDeBridgeRoute queries deBridge for TRON and cross-chain routes
// Now supports TRON through deBridge DLN with Internal Chain ID 100000026
func (s *QuoteService) queryDeBridgeRoute(ctx context.Context, sourceChain, targetChain uint32, sourceToken, targetToken, amount string) LiFiRouteResult {
	// Handle TRON token addresses - convert to TVM format if needed
	if clients.IsTronChain(sourceChain) {
		sourceToken = clients.GetTronTokenAddress(sourceToken)
		log.Printf("[QuoteService] Converted TRON source token to TVM format: %s", sourceToken)
	}
	if clients.IsTronChain(targetChain) {
		targetToken = clients.GetTronTokenAddress(targetToken)
		log.Printf("[QuoteService] Converted TRON target token to TVM format: %s", targetToken)
	}

	// Get deBridge internal chain IDs (100000026 for TRON, not 728126428)
	srcChainId := clients.GetDeBridgeChainId(sourceChain)
	dstChainId := clients.GetDeBridgeChainId(targetChain)

	log.Printf("[QuoteService] Calling deBridge DLN with chainIds - src: %s, dst: %s", srcChainId, dstChainId)

	// Call deBridge API
	quote, err := s.debridgeClient.GetQuote(ctx, &clients.DeBridgeQuoteRequest{
		SrcChainId:            srcChainId,
		SrcChainTokenIn:       sourceToken,
		SrcChainTokenInAmount: amount,
		DstChainId:            dstChainId,
		DstChainTokenOut:      targetToken,
	})

	if err != nil {
		log.Printf("[QuoteService] deBridge API error: %v, using fallback", err)
		// Fallback to default values
		return LiFiRouteResult{
			Bridge:        "debridge",
			Protocol:      "deBridge",
			EstimatedTime: "5-10min",
			Fee:           "15 USDT",
			FeeUSD:        "15.0",
		}
	}

	// Calculate estimated time from approximateFulfillmentDelay
	estimatedTime := clients.FormatDeBridgeDuration(quote.Order.ApproximateFulfillmentDelay)
	if estimatedTime == "" {
		estimatedTime = "5-10min"
	}

	// Calculate total fees in USD from costsDetails
	totalFeeUSD := 0.0
	for _, cost := range quote.Estimation.CostsDetails {
		if usdAmount, err := strconv.ParseFloat(cost.Payload.USDAmount, 64); err == nil {
			totalFeeUSD += usdAmount
		}
	}

	// Get output token info
	outputAmount := quote.Estimation.DstChainTokenOut.Amount
	outputMinAmount := quote.Estimation.DstChainTokenOutMin.Amount
	if outputMinAmount == "" {
		outputMinAmount = outputAmount // If not provided, use estimated amount
	}

	log.Printf("[QuoteService] deBridge quote successful - output: %s %s, fee: $%.2f",
		outputAmount, quote.Estimation.DstChainTokenOut.Symbol, totalFeeUSD)

	return LiFiRouteResult{
		Bridge:        "debridge",
		Protocol:      "deBridge",
		EstimatedTime: estimatedTime,
		Fee:           fmt.Sprintf("%.2f %s", totalFeeUSD, quote.Estimation.SrcChainTokenIn.Symbol),
		FeeUSD:        fmt.Sprintf("%.2f", totalFeeUSD),
		ToAmount:      outputAmount,
		ToAmountMin:   outputMinAmount,
	}
}

// getGasPrice gets current gas price for a chain
func (s *QuoteService) getGasPrice(ctx context.Context, chainID uint32) string {
	gasPrice, err := s.gasPriceClient.GetGasPrice(ctx, chainID)
	if err != nil {
		log.Printf("[QuoteService] Failed to get gas price for chain %d: %v, using fallback", chainID, err)
		// Fallback values
		switch chainID {
		case 56:
			return "5 gwei"
		case 1:
			return "30 gwei"
		default:
			return "10 gwei"
		}
	}
	return gasPrice
}

// getChainName gets chain name from chain ID
func (s *QuoteService) getChainName(chainID uint32) string {
	chainNames := map[uint32]string{
		1:     "Ethereum",
		56:    "BSC",
		137:   "Polygon",
		42161: "Arbitrum",
		10:    "Optimism",
	}

	if name, ok := chainNames[chainID]; ok {
		return name
	}
	return fmt.Sprintf("Chain %d", chainID)
}

// extractTargetChainFromIntent extracts target chain ID from intent
func (s *QuoteService) extractTargetChainFromIntent(intent map[string]interface{}) (uint32, error) {
	intentType, ok := intent["type"].(string)
	if !ok {
		return 0, errors.New("missing intent type")
	}

	switch intentType {
	case "RawToken":
		// Extract beneficiary.chainId
		beneficiary, ok := intent["beneficiary"].(map[string]interface{})
		if !ok {
			return 0, errors.New("missing beneficiary in RawToken intent")
		}
		chainID, ok := beneficiary["chainId"].(float64)
		if !ok {
			return 0, errors.New("missing chainId in beneficiary")
		}
		return uint32(chainID), nil

	case "AssetToken":
		// preferredChain removed from Intent definition
		// Extract chain_id from assetId or beneficiary
		// For AssetToken, chain_id is encoded in assetId (first 4 bytes)
		if assetID, ok := intent["assetId"].(string); ok && len(assetID) >= 8 {
			// Decode assetId to get chain_id (first 4 bytes = 8 hex chars)
			// assetId format: [ChainID (4 bytes)] [AdapterID (4 bytes)] [TokenID (2 bytes)] [Reserved (22 bytes)]
			chainIDHex := assetID[:8] // First 8 hex chars = 4 bytes
			if chainID, err := strconv.ParseUint(chainIDHex, 16, 32); err == nil {
				return uint32(chainID), nil
			}
		}
		// Fallback: use beneficiary chain_id
		if beneficiary, ok := intent["beneficiary"].(map[string]interface{}); ok {
			if chainID, ok := beneficiary["chainId"].(float64); ok {
				return uint32(chainID), nil
			}
		}
		return 0, errors.New("AssetToken: unable to determine chain_id from assetId or beneficiary")

	default:
		return 0, fmt.Errorf("unsupported intent type: %s", intentType)
	}
}

// generateWarnings generates warnings based on current conditions
func (s *QuoteService) generateWarnings(sourceGasPrice, targetGasPrice string) []Warning {
	warnings := []Warning{}

	// Example: check if gas price is high
	// TODO: Implement actual threshold checking

	return warnings
}

// getProtocolData queries protocol data from DeFi APIs
func (s *QuoteService) getProtocolData(ctx context.Context, chain uint32, protocol, baseToken, amount string) *HookAssetResponse {
	log.Printf("[QuoteService] Querying protocol data: chain=%d, protocol=%s, token=%s", chain, protocol, baseToken)

	response := &HookAssetResponse{}
	var protocolData *clients.ProtocolData
	var err error

	// Query protocol data based on protocol type
	switch strings.ToLower(protocol) {
	case "aave":
		protocolData, err = s.defiClient.GetAaveData(ctx, chain, baseToken)
	case "compound":
		protocolData, err = s.defiClient.GetCompoundData(ctx, chain, baseToken)
	default:
		err = fmt.Errorf("unsupported protocol: %s", protocol)
	}

	// Handle error with fallback
	if err != nil {
		log.Printf("[QuoteService] Failed to get protocol data: %v, using fallback", err)
		return s.getFallbackProtocolData(chain, protocol, baseToken, amount)
	}

	// Populate response from real data
	response.Asset.Protocol = protocolData.Protocol
	response.Asset.BaseToken = baseToken
	response.Asset.YieldToken = protocolData.YieldToken
	response.Asset.TokenAddress = protocolData.TokenAddress

	// Yield info
	response.Asset.Yield.CurrentAPY = protocolData.CurrentAPY
	response.Asset.Yield.APY7d = protocolData.APY7d
	response.Asset.Yield.APY30d = protocolData.APY30d
	response.Asset.Yield.Source = "DeFiLlama"
	response.Asset.Yield.LastUpdated = time.Now().Format(time.RFC3339)

	// Get token price for price info
	tokenPrice, err := s.defiClient.GetTokenPrice(ctx, baseToken)
	if err != nil {
		tokenPrice = 1.0 // Fallback for stablecoins
	}

	response.Asset.Price.BaseTokenPrice = fmt.Sprintf("%.2f USD", tokenPrice)
	response.Asset.Price.YieldTokenPrice = fmt.Sprintf("%.2f USD", tokenPrice*1.02) // Estimate
	response.Asset.Price.ExchangeRate = "1.02"                                      // Estimate
	response.Asset.Price.PriceImpact = "0.01%"

	// Fees (Aave/Compound typically have no fees)
	response.Asset.Fees.DepositFee = "0%"
	response.Asset.Fees.WithdrawalFee = "0%"
	response.Asset.Fees.PerformanceFee = "0%"

	// Calculate estimated fees based on amount
	amountFloat := parseAmount(amount)
	response.Asset.Fees.EstimatedFees.InputAmount = fmt.Sprintf("%.2f %s", amountFloat, baseToken)
	response.Asset.Fees.EstimatedFees.Fees = fmt.Sprintf("0 %s", baseToken)
	response.Asset.Fees.EstimatedFees.NetReceived = fmt.Sprintf("%.2f %s", amountFloat, baseToken)

	// Conversion (aToken/cToken rate ~ 1.02 typically)
	response.Asset.Conversion.Input.Token = baseToken
	response.Asset.Conversion.Input.Amount = fmt.Sprintf("%.0f", amountFloat)
	response.Asset.Conversion.Output.Token = protocolData.YieldToken
	response.Asset.Conversion.Output.ExpectedAmount = fmt.Sprintf("%.2f", amountFloat/1.02)
	response.Asset.Conversion.Output.MinAmount = fmt.Sprintf("%.2f", amountFloat/1.03)
	response.Asset.Conversion.Output.ValueInUSD = fmt.Sprintf("%.2f", amountFloat*tokenPrice)

	// Protocol health
	response.Asset.ProtocolHealth.Status = "healthy"
	response.Asset.ProtocolHealth.TVL = protocolData.TVL
	response.Asset.ProtocolHealth.UtilizationRate = "45%" // Estimate
	response.Asset.ProtocolHealth.Available = protocolData.Available

	// Risks
	response.Asset.Risks = []struct {
		Type        string `json:"type"`
		Level       string `json:"level"`
		Description string `json:"description"`
	}{
		{
			Type:        "smart_contract",
			Level:       "low",
			Description: fmt.Sprintf("%s audited by multiple firms", protocolData.Protocol),
		},
		{
			Type:        "liquidity",
			Level:       "low",
			Description: fmt.Sprintf("High TVL: %s", protocolData.TVL),
		},
	}

	// Alternatives (query alternative protocol)
	response.Alternatives = []struct {
		Protocol   string `json:"protocol"`
		YieldToken string `json:"yieldToken"`
		CurrentAPY string `json:"currentAPY"`
		Reason     string `json:"reason"`
	}{
		{
			Protocol:   "Compound V3",
			YieldToken: "c" + baseToken,
			CurrentAPY: "4.28%",
			Reason:     "Alternative protocol",
		},
	}

	// Meta
	now := time.Now()
	response.Meta.DataSource = "DeFiLlama + CoinGecko"
	response.Meta.LastUpdated = now.Format(time.RFC3339)
	response.Meta.CacheValidUntil = now.Add(1 * time.Hour).Format(time.RFC3339)

	return response
}

// getFallbackProtocolData returns fallback data when API fails
func (s *QuoteService) getFallbackProtocolData(chain uint32, protocol, baseToken, amount string) *HookAssetResponse {
	response := &HookAssetResponse{}

	yieldTokenPrefix := "a"
	if strings.ToLower(protocol) == "compound" {
		yieldTokenPrefix = "c"
	}

	response.Asset.Protocol = strings.Title(protocol) + " V3"
	response.Asset.BaseToken = baseToken
	response.Asset.YieldToken = yieldTokenPrefix + baseToken
	response.Asset.TokenAddress = "0x0000000000000000000000000000000000000000"

	// Fallback yield info
	response.Asset.Yield.CurrentAPY = "4.5%"
	response.Asset.Yield.APY7d = "4.4%"
	response.Asset.Yield.APY30d = "4.3%"
	response.Asset.Yield.Source = "Cached/Estimated"
	response.Asset.Yield.LastUpdated = time.Now().Format(time.RFC3339)

	// Fallback price info
	response.Asset.Price.BaseTokenPrice = "1.00 USD"
	response.Asset.Price.YieldTokenPrice = "1.02 USD"
	response.Asset.Price.ExchangeRate = "1.02"
	response.Asset.Price.PriceImpact = "0.01%"

	// Fees
	response.Asset.Fees.DepositFee = "0%"
	response.Asset.Fees.WithdrawalFee = "0%"
	response.Asset.Fees.PerformanceFee = "0%"
	response.Asset.Fees.EstimatedFees.InputAmount = "100000 " + baseToken
	response.Asset.Fees.EstimatedFees.Fees = "0 " + baseToken
	response.Asset.Fees.EstimatedFees.NetReceived = "100000 " + baseToken

	// Conversion
	response.Asset.Conversion.Input.Token = baseToken
	response.Asset.Conversion.Input.Amount = "100000"
	response.Asset.Conversion.Output.Token = yieldTokenPrefix + baseToken
	response.Asset.Conversion.Output.ExpectedAmount = "98039"
	response.Asset.Conversion.Output.MinAmount = "98000"
	response.Asset.Conversion.Output.ValueInUSD = "100000"

	// Protocol health
	response.Asset.ProtocolHealth.Status = "unknown"
	response.Asset.ProtocolHealth.TVL = "N/A"
	response.Asset.ProtocolHealth.UtilizationRate = "N/A"
	response.Asset.ProtocolHealth.Available = "N/A"

	// Risks
	response.Asset.Risks = []struct {
		Type        string `json:"type"`
		Level       string `json:"level"`
		Description string `json:"description"`
	}{
		{
			Type:        "data_unavailable",
			Level:       "medium",
			Description: "Using cached/estimated data",
		},
	}

	// Meta
	now := time.Now()
	response.Meta.DataSource = "Fallback/Cache"
	response.Meta.LastUpdated = now.Format(time.RFC3339)
	response.Meta.CacheValidUntil = now.Add(5 * time.Minute).Format(time.RFC3339)

	return response
}

// extractTargetTokenFromIntent extracts target token address from intent
func (s *QuoteService) extractTargetTokenFromIntent(intent map[string]interface{}) (string, error) {
	intentType, ok := intent["type"].(string)
	if !ok {
		return "", errors.New("missing intent type")
	}

	switch intentType {
	case "RawToken":
		// tokenContract removed from Intent definition
		// Return empty string or use tokenSymbol to identify token
		// In a real implementation, would query token registry based on tokenSymbol
		if tokenSymbol, ok := intent["tokenSymbol"].(string); ok && len(tokenSymbol) > 0 {
			// For now, return tokenSymbol as identifier
			// TODO: Map tokenSymbol to actual token contract address from token registry
			return tokenSymbol, nil
		}
		return "", errors.New("missing tokenSymbol in RawToken intent")

	case "AssetToken":
		// For AssetToken, we need to resolve assetId to actual token
		// For now, return a placeholder
		return "", errors.New("AssetToken not yet implemented for route query")

	default:
		return "", fmt.Errorf("unsupported intent type: %s", intentType)
	}
}

// formatAmount formats amount string for display
func formatAmount(amount string) string {
	// Parse and format amount
	if amount == "" {
		return "0"
	}

	// Remove trailing zeros and decimal point if not needed
	parts := strings.Split(amount, ".")
	if len(parts) == 2 {
		// Remove trailing zeros
		decimals := strings.TrimRight(parts[1], "0")
		if decimals == "" {
			return parts[0]
		}
		return parts[0] + "." + decimals
	}
	return amount
}

// parseAmount parses amount string to float64
// Amount is always in wei (18 decimals), so we divide by 10^18 to get the readable format
func parseAmount(amount string) float64 {
	if amount == "" {
		return 0
	}

	// Parse as big integer to handle large numbers accurately
	amountBig, ok := new(big.Int).SetString(amount, 10)
	if !ok {
		return 0
	}

	// Convert to float64 and divide by 10^18 (wei to token units)
	// Use big.Float for precision
	amountFloat := new(big.Float).SetInt(amountBig)
	weiDivisor := new(big.Float).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))
	result := new(big.Float).Quo(amountFloat, weiDivisor)
	
	// Convert to float64
	resultFloat, _ := result.Float64()
	return resultFloat
}

// getFastPathResponse returns a fast path response for same token and chain transfers
// This is used when tokenSymbol == depositToken and sourceChainID == targetChainID
func (s *QuoteService) getFastPathResponse(ctx context.Context, chainID uint32, amount string, tokenSymbol string) (*RouteQuoteResponse, error) {
	// Determine chain-specific values
	var estimatedTime string
	var chainName string
	var nativeSymbol string
	var gasPriceStr string
	var feeInNative float64
	
	gasLimit := 21000.0
	
	switch chainID {
	case 60: // Ethereum (SLIP-44)
		estimatedTime = "15-30秒"
		chainName = "Ethereum"
		nativeSymbol = "ETH"
		// Get gas price (in gwei)
		gasPriceStr = s.getGasPrice(ctx, 1) // Use EVM chain ID 1 for Ethereum
		gasPriceGwei := 0.0
		if strings.Contains(gasPriceStr, "gwei") {
			parts := strings.Fields(gasPriceStr)
			if len(parts) > 0 {
				if val, err := strconv.ParseFloat(parts[0], 64); err == nil {
					gasPriceGwei = val
				}
			}
		}
		// Calculate fee: gasPrice * 21000 ETH (1 gwei = 1e-9 ETH)
		feeInNative = (gasPriceGwei * 1e-9) * gasLimit
		
	case 714: // BSC (SLIP-44)
		estimatedTime = "1-3秒"
		chainName = "BNB Chain"
		nativeSymbol = "BNB"
		// Get gas price (in gwei)
		gasPriceStr = s.getGasPrice(ctx, 56) // Use EVM chain ID 56 for BSC
		gasPriceGwei := 0.0
		if strings.Contains(gasPriceStr, "gwei") {
			parts := strings.Fields(gasPriceStr)
			if len(parts) > 0 {
				if val, err := strconv.ParseFloat(parts[0], 64); err == nil {
					gasPriceGwei = val
				}
			}
		}
		// Calculate fee: gasPrice * 21000 BNB (1 gwei = 1e-9 BNB)
		feeInNative = (gasPriceGwei * 1e-9) * gasLimit
		
	case 195: // TRON (SLIP-44)
		estimatedTime = "15-30秒"
		chainName = "TRON"
		nativeSymbol = "TRX"
		// TRON gas price is typically in sun (1e-6 TRX)
		// For TRON, we use a default gas price or fetch from API
		// Default: 1000 sun per unit (typical TRON gas price)
		gasPriceSun := 1000.0 // Default TRON gas price in sun
		gasPriceStr = fmt.Sprintf("%.0f sun", gasPriceSun)
		// Calculate fee: gasPrice * 21000 TRX (1 sun = 1e-6 TRX)
		feeInNative = (gasPriceSun * 1e-6) * gasLimit
		
	default:
		estimatedTime = "15-30秒"
		chainName = s.getChainName(chainID)
		nativeSymbol = "ETH" // Default
		// Get gas price (in gwei)
		gasPriceStr = s.getGasPrice(ctx, chainID)
		gasPriceGwei := 0.0
		if strings.Contains(gasPriceStr, "gwei") {
			parts := strings.Fields(gasPriceStr)
			if len(parts) > 0 {
				if val, err := strconv.ParseFloat(parts[0], 64); err == nil {
					gasPriceGwei = val
				}
			}
		}
		// Calculate fee: gasPrice * 21000 (1 gwei = 1e-9 native token)
		feeInNative = (gasPriceGwei * 1e-9) * gasLimit
	}
	
	// Convert fee to USD (simplified, should use price oracle)
	var feeInUSD float64
	switch chainID {
	case 60: // Ethereum
		feeInUSD = feeInNative * 2000.0 // Rough estimate: 1 ETH ≈ $2000
	case 714: // BSC
		feeInUSD = feeInNative * 600.0 // Rough estimate: 1 BNB ≈ $600
	case 195: // TRON
		feeInUSD = feeInNative * 0.1 // Rough estimate: 1 TRX ≈ $0.1
	default:
		feeInUSD = feeInNative * 2000.0 // Default: assume ETH price
	}
	
	// Parse amount to calculate estimated received
	// 实际到账 = amount - 协议费用（快速路径协议费用为0）
	amountFloat := parseAmount(amount)
	protocolFeeFloat := 0.0 // 快速路径协议费用为0
	estimatedReceivedFloat := amountFloat - protocolFeeFloat
	
	if estimatedReceivedFloat < 0 {
		estimatedReceivedFloat = 0
	}
	
	// Convert estimatedReceived to Wei format (multiply by 10^18)
	estimatedReceivedWei := big.NewFloat(estimatedReceivedFloat)
	weiMultiplier := big.NewFloat(1e18)
	estimatedReceivedWei.Mul(estimatedReceivedWei, weiMultiplier)
	estimatedReceivedWeiStr, _ := estimatedReceivedWei.Int(nil)
	
	// Build response
	response := &RouteQuoteResponse{}
	
	// Route information
	response.Route.Bridge = "native"
	response.Route.BridgeProtocol = "Direct Transfer"
	response.Route.EstimatedTime = estimatedTime
	response.Route.Steps = []RouteStep{
		{
			Step:          1,
			Chain:         fmt.Sprintf("%s (%d)", chainName, chainID),
			Action:        "Direct Transfer",
			EstimatedTime: estimatedTime,
		},
	}
	
	// Fees
	response.Fees.ProofGeneration = GasFee{
		Chain:           chainName,
		EstimatedGas:    fmt.Sprintf("%.0f", gasLimit),
		CurrentGasPrice: gasPriceStr,
		GasCostInNative: fmt.Sprintf("%.8f %s", feeInNative, nativeSymbol),
		GasCostInUSD:    fmt.Sprintf("%.2f", feeInUSD),
		Recommendation:  "normal",
	}
	
	// No bridge fee for same chain
	response.Fees.Bridge = BridgeFee{
		BridgeName:       "Direct Transfer",
		FeeType:          "gas_only",
		FeeInSourceToken: "0",
		FeeInUSD:         "0",
		Slippage:         "0%",
		MinReceived:      estimatedReceivedWeiStr.String(), // Wei 格式
	}
	
	// Summary
	// 对于快速路径（Token和链都一样），协议手续费为0
	protocolFeeRate := "0"
	protocolFeeAmount := "0"
	protocolFeeUnit := tokenSymbol
	gasEstimateUnit := tokenSymbol
	
	response.Fees.Summary = FeeSummary{
		TotalGasCostUSD:   fmt.Sprintf("%.2f", feeInUSD),
		TotalBridgeFeeUSD: "0.00",
		TotalCostUSD:      fmt.Sprintf("%.2f", feeInUSD),
		EstimatedReceived: estimatedReceivedWeiStr.String(), // Wei 格式
		ProtocolFeeRate:   protocolFeeRate,
		ProtocolFeeAmount: protocolFeeAmount, // Wei 格式，快速路径为0
		ProtocolFeeUnit:   protocolFeeUnit,
		GasEstimateUnit:   gasEstimateUnit,
	}
	
	// Timeline
	response.Timeline.Total = estimatedTime
	response.Timeline.Breakdown = []TimelineStep{
		{Stage: "Direct Transfer", Time: estimatedTime},
	}
	
	// Meta
	now := time.Now()
	response.Meta = QuoteMeta{
		QuoteID:    fmt.Sprintf("fastpath_%d", now.Unix()),
		ValidUntil: now.Add(5 * time.Minute).Format(time.RFC3339),
		Timestamp:  now.Format(time.RFC3339),
	}
	
	log.Printf("[QuoteService] Fast path response generated for chain %d: fee=%.8f %s, time=%s",
		chainID, feeInNative, nativeSymbol, estimatedTime)
	
	return response, nil
}
