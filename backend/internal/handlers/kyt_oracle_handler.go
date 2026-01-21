package handlers

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// KYTOracleHandler handles KYT Oracle related requests
type KYTOracleHandler struct {
	db           *gorm.DB
	oracleClient *clients.KYTOracleClient
	logger       *logrus.Logger
}

// NewKYTOracleHandler creates a new KYT Oracle handler
func NewKYTOracleHandler(db *gorm.DB, oracleClient *clients.KYTOracleClient) *KYTOracleHandler {
	return &KYTOracleHandler{
		db:           db,
		oracleClient: oracleClient,
		logger:       logrus.New(),
	}
}

// GetFeeInfoByAddressRequest request to get fee info by address
// Supports both JSON (POST) and query params (GET)
type GetFeeInfoByAddressRequest struct {
	Address  string `json:"address" form:"address" binding:"required"`
	Chain    string `json:"chain" form:"chain" binding:"required"`
	TokenKey string `json:"token_key,omitempty" form:"token_key"`
}

// GetFeeInfoByAddressResponse response for fee info query
type GetFeeInfoByAddressResponse struct {
	Success         bool       `json:"success"`
	Data            *FeeInfo   `json:"data,omitempty"`
	LastQueryTime   time.Time  `json:"last_query_time,omitempty"`
	NextAllowedTime *time.Time `json:"next_allowed_time,omitempty"` // Next allowed query time (when rate limited)
	Error           string     `json:"error,omitempty"`
	Memo            string     `json:"memo,omitempty"` // Message: "更新成功" or "每个地址每5分钟只能查询一次，请稍后再试"
	// Risk assessment from last query (included even when rate limited)
	RiskScore *int   `json:"risk_score,omitempty"` // Address risk score (0-100)
	RiskLevel string `json:"risk_level,omitempty"` // Risk level (low, medium, high, critical)
	// Detailed information from last query (included even when rate limited)
	Metadata map[string]interface{} `json:"metadata,omitempty"` // Complete detailed information from last query
}

// FeeInfo fee information
type FeeInfo struct {
	BaseFee             string  `json:"baseFee"`
	FeeRateBps          int     `json:"feeRateBps"`
	Chain               string  `json:"chain"`
	Address             string  `json:"address"`
	TokenKey            string  `json:"tokenKey"`
	RiskLevel           string  `json:"riskLevel"`
	RiskScore           int     `json:"riskScore"`
	BaseFeeRatePercent  float64 `json:"baseFeeRatePercent"`
	RiskBasedFeePercent float64 `json:"riskBasedFeePercent"`
	FinalFeeRatePercent float64 `json:"finalFeeRatePercent"`
	InvitationCode      string  `json:"invitationCode"`
	InvitationSource    string  `json:"invitationSource"`
	// Detailed information (from KYT Oracle response)
	Details map[string]interface{} `json:"details,omitempty"` // Additional detailed information
}

// AssociateAddressRequest request to associate address with invitation code
type AssociateAddressRequest struct {
	Address  string `json:"address" binding:"required"`
	Code     string `json:"code" binding:"required"`
	Chain    string `json:"chain,omitempty"`
	TokenKey string `json:"token_key,omitempty"` // Optional token key for fee info
}

// AssociateAddressResponse response for address association
type AssociateAddressResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
	// Fee information (included if code changed and fee info was fetched)
	Data          *FeeInfo  `json:"data,omitempty"`
	LastQueryTime time.Time `json:"last_query_time,omitempty"`
	RiskScore     *int      `json:"risk_score,omitempty"`
	RiskLevel     string    `json:"risk_level,omitempty"`
}

// GetFeeInfoByAddressHandler handles GET /api/kyt-oracle/fee-info
// Returns cached data only (no MistTrack API call)
func (h *KYTOracleHandler) GetFeeInfoByAddressHandler(c *gin.Context) {
	var req GetFeeInfoByAddressRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	// Normalize address based on chain type
	addressForOracle, err := h.normalizeAddressForOracle(req.Address, req.Chain)
	if err != nil {
		h.logger.WithError(err).Error("Failed to normalize address")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Query fee info from KYT Oracle (rate limiting is handled by KYT Oracle)
	oracleFeeInfo, err := h.oracleClient.GetFeeInfo(req.Chain, addressForOracle, req.TokenKey)
	if err != nil {
		h.logger.WithError(err).Error("Failed to query fee info from oracle")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to query fee info: " + err.Error(),
		})
		return
	}

	// Convert to response format
	feeInfo := FeeInfo{
		BaseFee:             oracleFeeInfo.Data.BaseFee,
		FeeRateBps:          oracleFeeInfo.Data.FeeRateBps,
		Chain:               oracleFeeInfo.Data.Chain,
		Address:             oracleFeeInfo.Data.Address,
		TokenKey:            oracleFeeInfo.Data.TokenKey,
		RiskLevel:           oracleFeeInfo.Data.RiskLevel,
		RiskScore:           oracleFeeInfo.Data.RiskScore,
		BaseFeeRatePercent:  oracleFeeInfo.Data.BaseFeeRatePercent,
		RiskBasedFeePercent: oracleFeeInfo.Data.RiskBasedFeePercent,
		FinalFeeRatePercent: oracleFeeInfo.Data.FinalFeeRatePercent,
		InvitationCode:      oracleFeeInfo.Data.InvitationCode,
		InvitationSource:    oracleFeeInfo.Data.InvitationSource,
		Details:             make(map[string]interface{}), // Initialize Details map
	}

	// Build metadata with MistTrack details for frontend
	metadata := make(map[string]interface{})
	queryTime := time.Now()

	// Include MistTrack details in metadata
	if oracleFeeInfo.Data.MistTrackDetails != nil {
		mistTrackDetails := make(map[string]interface{})
		// Always include score
		mistTrackDetails["score"] = oracleFeeInfo.Data.MistTrackDetails.Score
		// Always include these fields, even if empty
		mistTrackDetails["hacking_event"] = oracleFeeInfo.Data.MistTrackDetails.HackingEvent
		mistTrackDetails["detail_list"] = oracleFeeInfo.Data.MistTrackDetails.DetailList
		if len(oracleFeeInfo.Data.MistTrackDetails.DetailList) == 0 {
			mistTrackDetails["detail_list"] = []string{}
		}
		mistTrackDetails["risk_level"] = oracleFeeInfo.Data.MistTrackDetails.RiskLevel
		mistTrackDetails["risk_detail"] = oracleFeeInfo.Data.MistTrackDetails.RiskDetail
		if len(oracleFeeInfo.Data.MistTrackDetails.RiskDetail) == 0 {
			mistTrackDetails["risk_detail"] = []interface{}{}
		}
		mistTrackDetails["risk_report_url"] = oracleFeeInfo.Data.MistTrackDetails.RiskReportURL
		// Always include labels (even if empty)
		mistTrackDetails["labels"] = oracleFeeInfo.Data.MistTrackDetails.Labels
		if len(oracleFeeInfo.Data.MistTrackDetails.Labels) == 0 {
			mistTrackDetails["labels"] = []string{}
		}
		mistTrackDetails["label_type"] = oracleFeeInfo.Data.MistTrackDetails.LabelType
		// Always include malicious events (even if nil, create empty structure)
		if oracleFeeInfo.Data.MistTrackDetails.MaliciousEvents != nil {
			mistTrackDetails["malicious_events"] = oracleFeeInfo.Data.MistTrackDetails.MaliciousEvents
		} else {
			mistTrackDetails["malicious_events"] = map[string]interface{}{
				"phishing":        0,
				"ransom":          0,
				"stealing":        0,
				"laundering":      0,
				"phishing_list":   []string{},
				"ransom_list":     []string{},
				"stealing_list":   []string{},
				"laundering_list": []string{},
			}
		}
		// Always include used platforms (even if nil, create empty structure)
		if oracleFeeInfo.Data.MistTrackDetails.UsedPlatforms != nil {
			mistTrackDetails["used_platforms"] = oracleFeeInfo.Data.MistTrackDetails.UsedPlatforms
		} else {
			mistTrackDetails["used_platforms"] = map[string]interface{}{
				"exchange": map[string]interface{}{"count": 0, "list": []string{}},
				"dex":      map[string]interface{}{"count": 0, "list": []string{}},
				"mixer":    map[string]interface{}{"count": 0, "list": []string{}},
				"nft":      map[string]interface{}{"count": 0, "list": []string{}},
			}
		}
		// Always include relation info (even if nil, create empty structure)
		if oracleFeeInfo.Data.MistTrackDetails.RelationInfo != nil {
			mistTrackDetails["relation_info"] = oracleFeeInfo.Data.MistTrackDetails.RelationInfo
		} else {
			mistTrackDetails["relation_info"] = map[string]interface{}{
				"wallet":  map[string]interface{}{"count": 0, "list": []string{}},
				"ens":     map[string]interface{}{"count": 0, "list": []string{}},
				"twitter": map[string]interface{}{"count": 0, "list": []string{}},
			}
		}
		// Include counterparty information if present (from AdditionalData)
		if oracleFeeInfo.Data.MistTrackDetails.AdditionalData != nil {
			if counterparty, ok := oracleFeeInfo.Data.MistTrackDetails.AdditionalData["counterparty"]; ok {
				mistTrackDetails["counterparty"] = counterparty
			}
		}
		metadata["mistTrackDetails"] = mistTrackDetails
	}

	metadata["queryTime"] = queryTime.Format(time.RFC3339)

	response := GetFeeInfoByAddressResponse{
		Success:       true,
		Data:          &feeInfo,
		LastQueryTime: queryTime,
		RiskScore:     &oracleFeeInfo.Data.RiskScore,
		RiskLevel:     oracleFeeInfo.Data.RiskLevel,
		Metadata:      metadata,
		Memo:          "更新成功",
	}

	c.JSON(http.StatusOK, response)
}

// PostFeeInfoByAddressHandler handles POST /api/kyt-oracle/fee-info
// Queries MistTrack API if rate limit allows (force refresh)
func (h *KYTOracleHandler) PostFeeInfoByAddressHandler(c *gin.Context) {
	var req GetFeeInfoByAddressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	// Normalize address based on chain type
	addressForOracle, err := h.normalizeAddressForOracle(req.Address, req.Chain)
	if err != nil {
		h.logger.WithError(err).Error("Failed to normalize address")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Query fee info from KYT Oracle with refresh (POST: may query MistTrack if rate limit allows)
	oracleFeeInfo, err := h.oracleClient.GetFeeInfoWithRefresh(req.Chain, addressForOracle, req.TokenKey)
	if err != nil {
		h.logger.WithError(err).Error("Failed to query fee info from oracle")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to query fee info: " + err.Error(),
		})
		return
	}

	// Convert to response format
	feeInfo := FeeInfo{
		BaseFee:             oracleFeeInfo.Data.BaseFee,
		FeeRateBps:          oracleFeeInfo.Data.FeeRateBps,
		Chain:               oracleFeeInfo.Data.Chain,
		Address:             oracleFeeInfo.Data.Address,
		TokenKey:            oracleFeeInfo.Data.TokenKey,
		RiskLevel:           oracleFeeInfo.Data.RiskLevel,
		RiskScore:           oracleFeeInfo.Data.RiskScore,
		BaseFeeRatePercent:  oracleFeeInfo.Data.BaseFeeRatePercent,
		RiskBasedFeePercent: oracleFeeInfo.Data.RiskBasedFeePercent,
		FinalFeeRatePercent: oracleFeeInfo.Data.FinalFeeRatePercent,
		InvitationCode:      oracleFeeInfo.Data.InvitationCode,
		InvitationSource:    oracleFeeInfo.Data.InvitationSource,
		Details:             make(map[string]interface{}), // Initialize Details map
	}

	// Build metadata with MistTrack details for frontend
	metadata := make(map[string]interface{})
	queryTime := time.Now()

	// Include MistTrack details in metadata
	if oracleFeeInfo.Data.MistTrackDetails != nil {
		mistTrackDetails := make(map[string]interface{})
		// Always include score
		mistTrackDetails["score"] = oracleFeeInfo.Data.MistTrackDetails.Score
		// Always include these fields, even if empty
		mistTrackDetails["hacking_event"] = oracleFeeInfo.Data.MistTrackDetails.HackingEvent
		mistTrackDetails["detail_list"] = oracleFeeInfo.Data.MistTrackDetails.DetailList
		if len(oracleFeeInfo.Data.MistTrackDetails.DetailList) == 0 {
			mistTrackDetails["detail_list"] = []string{}
		}
		mistTrackDetails["risk_level"] = oracleFeeInfo.Data.MistTrackDetails.RiskLevel
		mistTrackDetails["risk_detail"] = oracleFeeInfo.Data.MistTrackDetails.RiskDetail
		if len(oracleFeeInfo.Data.MistTrackDetails.RiskDetail) == 0 {
			mistTrackDetails["risk_detail"] = []interface{}{}
		}
		mistTrackDetails["risk_report_url"] = oracleFeeInfo.Data.MistTrackDetails.RiskReportURL
		// Always include labels (even if empty)
		mistTrackDetails["labels"] = oracleFeeInfo.Data.MistTrackDetails.Labels
		if len(oracleFeeInfo.Data.MistTrackDetails.Labels) == 0 {
			mistTrackDetails["labels"] = []string{}
		}
		mistTrackDetails["label_type"] = oracleFeeInfo.Data.MistTrackDetails.LabelType
		// Always include malicious events (even if nil, create empty structure)
		if oracleFeeInfo.Data.MistTrackDetails.MaliciousEvents != nil {
			mistTrackDetails["malicious_events"] = oracleFeeInfo.Data.MistTrackDetails.MaliciousEvents
		} else {
			mistTrackDetails["malicious_events"] = map[string]interface{}{
				"phishing":        0,
				"ransom":          0,
				"stealing":        0,
				"laundering":      0,
				"phishing_list":   []string{},
				"ransom_list":     []string{},
				"stealing_list":   []string{},
				"laundering_list": []string{},
			}
		}
		// Always include used platforms (even if nil, create empty structure)
		if oracleFeeInfo.Data.MistTrackDetails.UsedPlatforms != nil {
			mistTrackDetails["used_platforms"] = oracleFeeInfo.Data.MistTrackDetails.UsedPlatforms
		} else {
			mistTrackDetails["used_platforms"] = map[string]interface{}{
				"exchange": map[string]interface{}{"count": 0, "list": []string{}},
				"dex":      map[string]interface{}{"count": 0, "list": []string{}},
				"mixer":    map[string]interface{}{"count": 0, "list": []string{}},
				"nft":      map[string]interface{}{"count": 0, "list": []string{}},
			}
		}
		// Always include relation info (even if nil, create empty structure)
		if oracleFeeInfo.Data.MistTrackDetails.RelationInfo != nil {
			mistTrackDetails["relation_info"] = oracleFeeInfo.Data.MistTrackDetails.RelationInfo
		} else {
			mistTrackDetails["relation_info"] = map[string]interface{}{
				"wallet":  map[string]interface{}{"count": 0, "list": []string{}},
				"ens":     map[string]interface{}{"count": 0, "list": []string{}},
				"twitter": map[string]interface{}{"count": 0, "list": []string{}},
			}
		}
		// Include counterparty information if present (from AdditionalData)
		if oracleFeeInfo.Data.MistTrackDetails.AdditionalData != nil {
			if counterparty, ok := oracleFeeInfo.Data.MistTrackDetails.AdditionalData["counterparty"]; ok {
				mistTrackDetails["counterparty"] = counterparty
			}
		}
		metadata["mistTrackDetails"] = mistTrackDetails
	}

	metadata["queryTime"] = queryTime.Format(time.RFC3339)

	response := GetFeeInfoByAddressResponse{
		Success:       true,
		Data:          &feeInfo,
		LastQueryTime: queryTime,
		RiskScore:     &oracleFeeInfo.Data.RiskScore,
		RiskLevel:     oracleFeeInfo.Data.RiskLevel,
		Metadata:      metadata,
		Memo:          "更新成功",
	}

	c.JSON(http.StatusOK, response)
}

// AssociateAddressWithCodeHandler handles POST /api/kyt-oracle/associate-address
// Associate address with invitation code
func (h *KYTOracleHandler) AssociateAddressWithCodeHandler(c *gin.Context) {
	// IP Whitelist check
	// Only allow requests from whitelisted IPs (e.g. internal services, admin tools)
	// This replaces the signature verification requirement
	allowedIPsStr := os.Getenv("ASSOCIATE_CODE_IP_WHITELIST")
	if allowedIPsStr != "" {
		clientIP := c.ClientIP()
		allowedIPs := strings.Split(allowedIPsStr, ",")
		allowed := false
		for _, ip := range allowedIPs {
			if strings.TrimSpace(ip) == clientIP {
				allowed = true
				break
			}
		}
		if !allowed {
			h.logger.WithFields(logrus.Fields{
				"client_ip": clientIP,
				"path":      c.Request.URL.Path,
			}).Warn("Rejected non-whitelisted IP for address association")
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Access denied: IP not whitelisted",
			})
			return
		}
	} else {
		// If no whitelist is configured, warn but allow (or default to localhost only if strict security is needed)
		// For now, we'll log a warning as this interface is sensitive
		h.logger.Warn("Security Warning: ASSOCIATE_CODE_IP_WHITELIST not set, allowing all IPs")
	}

	var req AssociateAddressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	// Normalize address based on chain type
	addressForOracle, err := h.normalizeAddressForOracle(req.Address, req.Chain)
	if err != nil {
		h.logger.WithError(err).Error("Failed to normalize address")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Default token key if not provided
	tokenKey := req.TokenKey
	if tokenKey == "" {
		tokenKey = "USDT"
	}

	// Associate address with code (use normalized address for KYT Oracle)
	err = h.oracleClient.AssociateAddressWithCode(addressForOracle, req.Code, req.Chain)
	if err != nil {
		h.logger.WithError(err).Error("Failed to associate address with code")
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to associate address: " + err.Error(),
		})
		return
	}

	response := AssociateAddressResponse{
		Success: true,
		Message: "Address associated with invitation code successfully",
	}

	// Automatically fetch and return fee information after code association
	oracleFeeInfo, err := h.oracleClient.GetFeeInfo(req.Chain, addressForOracle, tokenKey)
	if err != nil {
		h.logger.WithError(err).Warn("Failed to fetch fee info after code association")
		// Still return success, but without fee info
		c.JSON(http.StatusOK, response)
		return
	}

	// Convert oracle response to FeeInfo
	feeInfo := FeeInfo{
		BaseFee:             oracleFeeInfo.Data.BaseFee,
		FeeRateBps:          oracleFeeInfo.Data.FeeRateBps,
		Chain:               req.Chain,
		Address:             req.Address, // Use original address from request
		TokenKey:            tokenKey,
		RiskLevel:           oracleFeeInfo.Data.RiskLevel,
		RiskScore:           oracleFeeInfo.Data.RiskScore,
		BaseFeeRatePercent:  oracleFeeInfo.Data.BaseFeeRatePercent,
		RiskBasedFeePercent: oracleFeeInfo.Data.RiskBasedFeePercent,
		FinalFeeRatePercent: oracleFeeInfo.Data.FinalFeeRatePercent,
		InvitationCode:      oracleFeeInfo.Data.InvitationCode,
		InvitationSource:    oracleFeeInfo.Data.InvitationSource,
	}

	// Include fee information in response
	response.Data = &feeInfo
	response.RiskScore = &oracleFeeInfo.Data.RiskScore
	response.RiskLevel = oracleFeeInfo.Data.RiskLevel

	c.JSON(http.StatusOK, response)
}

// OnDepositRecorded is deprecated - fee query records are no longer maintained in backend
// This function is kept for backward compatibility but does nothing
func (h *KYTOracleHandler) OnDepositRecorded(address string, chain string, depositID uint64) error {
	// Fee query records are now managed by KYT Oracle service
	// No action needed in backend
	return nil
}

// normalizeAddressForOracle normalizes address based on chain type for KYT Oracle
// Returns the address in the format expected by KYT Oracle for the given chain
func (h *KYTOracleHandler) normalizeAddressForOracle(address, chain string) (string, error) {
	chainLower := strings.ToLower(chain)
	isTronChain := chainLower == "tron" || chainLower == "trx"
	
	// Handle TRON chain first (TRON addresses are case-sensitive)
	if isTronChain {
		// If it's already a TRON Base58 address, use it directly (preserve case)
		if utils.IsTronAddress(address) {
			return address, nil
		}
		
		// Normalize address for checking (handle 0x prefix for hex addresses)
		normalizedAddress := address
		if len(normalizedAddress) >= 2 && normalizedAddress[:2] == "0x" {
			normalizedAddress = "0x" + strings.ToLower(normalizedAddress[2:])
		}
		
		// If it's a Universal Address, extract EVM address and convert to TRON
		if utils.IsUniversalAddress(normalizedAddress) {
			evmAddr, err := utils.ExtractEvmAddressFromUniversal(normalizedAddress)
			if err != nil {
				return "", fmt.Errorf("failed to extract EVM address from Universal Address: %w", err)
			}
			tronAddr, err := utils.EvmToTronAddress(evmAddr)
			if err != nil {
				return "", fmt.Errorf("failed to convert EVM address to TRON address: %w", err)
			}
			h.logger.Debugf("Converted Universal Address to TRON address: %s -> %s", normalizedAddress, tronAddr)
			return tronAddr, nil
		}
		
		// If it's an EVM address, convert to TRON
		if utils.IsEvmAddress(normalizedAddress) {
			tronAddr, err := utils.EvmToTronAddress(normalizedAddress)
			if err != nil {
				return "", fmt.Errorf("failed to convert EVM address to TRON address: %w", err)
			}
			h.logger.Debugf("Converted EVM address to TRON address: %s -> %s", normalizedAddress, tronAddr)
			return tronAddr, nil
		}
		
		return "", fmt.Errorf("unsupported address format for TRON chain: expected TRON Base58 address, Universal Address, or EVM address")
	}
	
	// Handle EVM chains (BSC, Ethereum, Polygon, etc.)
	// Normalize address (handle 0x prefix for hex addresses)
	normalizedAddress := address
	if len(normalizedAddress) >= 2 && normalizedAddress[:2] == "0x" {
		normalizedAddress = "0x" + strings.ToLower(normalizedAddress[2:])
	} else {
		// For non-TRON chains, lowercase hex addresses
		normalizedAddress = strings.ToLower(normalizedAddress)
	}
	
	// If it's a Universal Address, extract EVM address
	if utils.IsUniversalAddress(normalizedAddress) {
		evmAddr, err := utils.ExtractEvmAddressFromUniversal(normalizedAddress)
		if err != nil {
			return "", fmt.Errorf("failed to extract EVM address from Universal Address: %w", err)
		}
		h.logger.Debugf("Extracted EVM address from Universal Address: %s -> %s", normalizedAddress, evmAddr)
		return evmAddr, nil
	}
	
	// If it's already an EVM address, use it directly
	if utils.IsEvmAddress(normalizedAddress) {
		return normalizedAddress, nil
	}
	
	// If it's a TRON address but chain is not TRON, return error
	if utils.IsTronAddress(normalizedAddress) {
		return "", fmt.Errorf("TRON address format not supported for chain %s: expected EVM address or Universal Address", chain)
	}
	
	return "", fmt.Errorf("unsupported address format for chain %s: expected Universal Address, EVM address, or TRON address (for TRON chain)", chain)
}

// getChainIDFromName converts chain name to SLIP-44 Chain ID
func (h *KYTOracleHandler) getChainIDFromName(chainName string) int {
	chainName = strings.ToLower(chainName)
	switch chainName {
	case "bsc":
		return 714
	case "ethereum", "eth":
		return 60
	case "polygon", "matic":
		return 966
	case "tron", "trx":
		return 195
	default:
		// Default to BSC
		return 714
	}
}
