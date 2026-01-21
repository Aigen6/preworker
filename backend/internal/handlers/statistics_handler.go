package handlers

import (
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/utils"
	"log"
	"math/big"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// StatisticsHandler handles statistics-related requests
type StatisticsHandler struct {
	db *gorm.DB
}

// NewStatisticsHandler creates a new StatisticsHandler
func NewStatisticsHandler() *StatisticsHandler {
	return &StatisticsHandler{
		db: db.DB,
	}
}

// StatisticsResponse represents the statistics response
type StatisticsResponse struct {
	TotalLockedValue   string `json:"total_locked_value"`   // Total locked value in USD (formatted as string for precision)
	TotalVolume        string `json:"total_volume"`          // Total transaction volume in USD
	PrivateTxCount     int64  `json:"private_tx_count"`      // Number of private transactions (executed withdraws)
	ActiveUsers        int64  `json:"active_users"`          // Number of active users (users with checkbooks)
	TotalLockedAmount  string `json:"total_locked_amount"`  // Total locked amount in wei (raw, not converted to USD)
	TotalVolumeAmount  string `json:"total_volume_amount"`    // Total volume amount in wei (raw, not converted to USD)
}

// GetStatisticsHandler handles GET /api/statistics/overview
// Returns global statistics including total locked value, total volume, private transaction count, and active users
func (h *StatisticsHandler) GetStatisticsHandler(c *gin.Context) {
	stats := StatisticsResponse{}

	// 1. Calculate total locked value (sum of all idle allocations)
	// Note: This is the raw amount in wei, not converted to USD
	// The frontend will need to convert using price data
	var totalLockedAmount big.Int
	var idleAllocations []models.Check
	if err := h.db.Where("status = ?", models.AllocationStatusIdle).Find(&idleAllocations).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch idle allocations", "details": err.Error()})
		return
	}

	for _, alloc := range idleAllocations {
		amount, ok := new(big.Int).SetString(alloc.Amount, 10)
		if !ok {
			continue // Skip invalid amounts
		}
		totalLockedAmount.Add(&totalLockedAmount, amount)
	}
	stats.TotalLockedAmount = totalLockedAmount.String()
	// For now, set total_locked_value to 0 (frontend will calculate using prices)
	// Or we could fetch prices here and calculate, but that would require price service
	stats.TotalLockedValue = "0"

	// 2. Calculate total volume (sum of all executed withdraw requests)
	var totalVolumeAmount big.Int
	var executedWithdraws []models.WithdrawRequest
	if err := h.db.Where("execute_status = ?", models.ExecuteStatusSuccess).Find(&executedWithdraws).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch executed withdraws", "details": err.Error()})
		return
	}

	for _, withdraw := range executedWithdraws {
		amount, ok := new(big.Int).SetString(withdraw.Amount, 10)
		if !ok {
			continue // Skip invalid amounts
		}
		totalVolumeAmount.Add(&totalVolumeAmount, amount)
	}
	stats.TotalVolumeAmount = totalVolumeAmount.String()
	// For now, set total_volume to 0 (frontend will calculate using prices)
	stats.TotalVolume = "0"

	// 3. Count private transactions (executed withdraw requests)
	stats.PrivateTxCount = int64(len(executedWithdraws))

	// 4. Count active users (unique users with checkbooks)
	// 暂时返回0
	stats.ActiveUsers = 0

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
	})
}

// DailyCheckbookStats represents daily checkbook statistics
type DailyCheckbookStats struct {
	Date                string `json:"date"`                  // YYYY-MM-DD
	DepositCount       int64  `json:"deposit_count"`         // Number of deposits
	TotalGrossAmount   string `json:"total_gross_amount"`    // Total gross amount (wei)
	TotalAllocatableAmount string `json:"total_allocatable_amount"` // Total allocatable amount (wei)
	TotalFee           string `json:"total_fee"`             // Total fee (wei)
}

// isIPWhitelisted checks if an IP address is in the statistics whitelist
func isIPWhitelisted(ip string) bool {
	if config.AppConfig == nil {
		return false
	}
	
	whitelist := config.AppConfig.Statistics.WhitelistIPs
	if len(whitelist) == 0 {
		return false
	}
	
	// Always allow localhost
	if isLocalhostIP(ip) {
		return true
	}
	
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		// If unable to parse, check string format
		for _, allowed := range whitelist {
			if ip == strings.TrimSpace(allowed) {
				return true
			}
		}
		return false
	}
	
	// Check each allowed IP or CIDR
	for _, allowed := range whitelist {
		allowed = strings.TrimSpace(allowed)
		
		// Check if it's a CIDR range
		if strings.Contains(allowed, "/") {
			_, ipNet, err := net.ParseCIDR(allowed)
			if err != nil {
				log.Printf("⚠️ Invalid CIDR in statistics whitelist: %s", allowed)
				continue
			}
			if ipNet.Contains(parsedIP) {
				return true
			}
		} else {
			// Check exact IP match
			allowedIP := net.ParseIP(allowed)
			if allowedIP != nil && allowedIP.Equal(parsedIP) {
				return true
			}
		}
	}
	
	return false
}

// isLocalhostIP checks if IP is localhost
func isLocalhostIP(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return ip == "localhost" || ip == "::1"
	}
	
	if parsedIP.To4() != nil {
		return parsedIP.IsLoopback()
	}
	
	return parsedIP.IsLoopback()
}

// GetCheckbooksDailyStatisticsHandler handles GET /api/statistics/checkbooks/daily
// Returns daily statistics for the authenticated user's checkbooks
// Supports JWT authentication OR whitelist address (via query parameter)
func (h *StatisticsHandler) GetCheckbooksDailyStatisticsHandler(c *gin.Context) {
	var userAddressStr string
	var chainIDInt int
	var slip44ChainID uint32
	
	// Try to get from JWT first (if authenticated)
	userAddress, jwtExists := c.Get("user_address")
	chainID, chainIDExists := c.Get("chain_id")
	
	if jwtExists && chainIDExists {
		// Use JWT authentication
		userAddressStr, _ = userAddress.(string)
		
		// Handle different possible types for chain_id
		switch v := chainID.(type) {
		case int:
			chainIDInt = v
		case int32:
			chainIDInt = int(v)
		case int64:
			chainIDInt = int(v)
		case float64:
			chainIDInt = int(v)
		default:
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Invalid chain ID type: %T", chainID)})
			return
		}
		
		slip44ChainID = uint32(utils.SmartToSlip44(chainIDInt))
	} else {
		// No JWT, try whitelist address from query parameter
		queryAddress := c.Query("address")
		queryChainIDStr := c.Query("chain_id")
		
		if queryAddress == "" || queryChainIDStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Missing authentication. Provide JWT token or whitelisted address via query parameters (address, chain_id)",
			})
			return
		}
		
		// Check if IP is whitelisted (for address-based access)
		clientIP := c.ClientIP()
		if !isIPWhitelisted(clientIP) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "IP address not in whitelist. JWT authentication required.",
			})
			return
		}
		
		// Parse chain ID
		var err error
		chainIDInt, err = strconv.Atoi(queryChainIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain_id format"})
			return
		}
		
		userAddressStr = queryAddress
		slip44ChainID = uint32(utils.SmartToSlip44(chainIDInt))
		
		log.Printf("📊 Statistics access via whitelist: address=%s, chain_id=%d", queryAddress, chainIDInt)
	}

	// Chain ID conversion logging
	if chainIDInt != int(slip44ChainID) {
		log.Printf("📊 Chain ID conversion: %d -> SLIP-44=%d", chainIDInt, slip44ChainID)
	}

	// Get universal_address from JWT for consistent querying
	universalAddress, exists := c.Get("universal_address")
	var queryAddress string

	if exists {
		universalAddrStr, ok := universalAddress.(string)
		if ok && universalAddrStr != "" {
			if len(universalAddrStr) == 66 && strings.HasPrefix(universalAddrStr, "0x") {
				queryAddress = strings.ToLower(universalAddrStr)
			} else {
				queryAddress = strings.ToLower(universalAddrStr)
			}
		}
	}

	// Fallback: normalize user_address and convert to Universal Address if needed
	if queryAddress == "" {
		normalizedAddr := utils.NormalizeAddressForChain(userAddressStr, chainIDInt)
		if len(normalizedAddr) == 42 {
			universalAddr, err := utils.EvmToUniversalAddress(normalizedAddr)
			if err == nil {
				queryAddress = universalAddr
			} else {
				queryAddress = normalizedAddr
			}
		} else {
			queryAddress = normalizedAddr
		}
	}

	// Parse time range parameters (optional)
	startDate := c.Query("start_date") // YYYY-MM-DD
	endDate := c.Query("end_date")     // YYYY-MM-DD

	// Build query - filter by user and chain
	query := h.db.Model(&models.Checkbook{}).Where("chain_id = ?", slip44ChainID)
	// Checkbook uses embedded UniversalAddress with prefix "user_"
	// So the actual columns are: user_chain_id and user_data
	if int(slip44ChainID) == 195 {
		// TRON: exact match, case sensitive
		query = query.Where("user_chain_id = ? AND user_data = ?", slip44ChainID, queryAddress)
	} else {
		// EVM: case insensitive query
		query = query.Where("user_chain_id = ? AND LOWER(user_data) = LOWER(?)", slip44ChainID, queryAddress)
	}

	// Exclude deleted checkbooks
	query = query.Where("status != ?", models.CheckbookStatusDeleted)

	// Apply time range filter if provided
	if startDate != "" {
		query = query.Where("DATE(created_at) >= ?", startDate)
	}
	if endDate != "" {
		query = query.Where("DATE(created_at) <= ?", endDate)
	}

	// Group by date and calculate statistics
	type DailyResult struct {
		Date                string
		DepositCount        int64
		TotalGrossAmount    string
		TotalAllocatableAmount string
		TotalFee            string
	}

	var results []DailyResult
	err := query.Select(
		"DATE(created_at) as date",
		"COUNT(*) as deposit_count",
		"SUM(CAST(gross_amount AS NUMERIC)) as total_gross_amount",
		"SUM(CAST(allocatable_amount AS NUMERIC)) as total_allocatable_amount",
		"SUM(CAST(fee_total_locked AS NUMERIC)) as total_fee",
	).
		Group("DATE(created_at)").
		Order("date DESC").
		Scan(&results).Error

	if err != nil {
		log.Printf("❌ Failed to query daily statistics: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query statistics", "details": err.Error()})
		return
	}

	// Convert to response format
	dailyStats := make([]DailyCheckbookStats, len(results))
	for i, r := range results {
		dailyStats[i] = DailyCheckbookStats{
			Date:                r.Date,
			DepositCount:        r.DepositCount,
			TotalGrossAmount:    r.TotalGrossAmount,
			TotalAllocatableAmount: r.TotalAllocatableAmount,
			TotalFee:            r.TotalFee,
		}
	}

	// Calculate summary
	var totalDeposits int64
	totalGross := new(big.Int)
	totalAllocatable := new(big.Int)
	totalFee := new(big.Int)

	for _, stat := range dailyStats {
		totalDeposits += stat.DepositCount
		if gross, ok := new(big.Int).SetString(stat.TotalGrossAmount, 10); ok {
			totalGross.Add(totalGross, gross)
		}
		if allocatable, ok := new(big.Int).SetString(stat.TotalAllocatableAmount, 10); ok {
			totalAllocatable.Add(totalAllocatable, allocatable)
		}
		if fee, ok := new(big.Int).SetString(stat.TotalFee, 10); ok {
			totalFee.Add(totalFee, fee)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    dailyStats,
		"summary": gin.H{
			"total_days":            len(dailyStats),
			"total_deposits":         totalDeposits,
			"total_gross_amount":     totalGross.String(),
			"total_allocatable_amount": totalAllocatable.String(),
			"total_fee":              totalFee.String(),
		},
	})
}

// DailyWithdrawStats represents daily withdraw statistics
type DailyWithdrawStats struct {
	Date        string `json:"date"`         // YYYY-MM-DD
	WithdrawCount int64  `json:"withdraw_count"` // Number of withdraws
	TotalAmount string `json:"total_amount"` // Total amount (wei)
}

// GetWithdrawsDailyStatisticsHandler handles GET /api/statistics/withdraws/daily
// Returns daily statistics for the authenticated user's withdraw requests
// Supports JWT authentication OR IP whitelist (with address query parameter)
func (h *StatisticsHandler) GetWithdrawsDailyStatisticsHandler(c *gin.Context) {
	var userAddressStr string
	var chainIDInt int
	var slip44ChainID uint32
	
	// Try to get from JWT first (if authenticated)
	userAddress, jwtExists := c.Get("user_address")
	chainID, chainIDExists := c.Get("chain_id")
	
	if jwtExists && chainIDExists {
		// Use JWT authentication
		userAddressStr, _ = userAddress.(string)
		
		// Handle different possible types for chain_id
		switch v := chainID.(type) {
		case int:
			chainIDInt = v
		case int32:
			chainIDInt = int(v)
		case int64:
			chainIDInt = int(v)
		case float64:
			chainIDInt = int(v)
		default:
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Invalid chain ID type: %T", chainID)})
			return
		}
		
		slip44ChainID = uint32(utils.SmartToSlip44(chainIDInt))
	} else {
		// No JWT, check if IP is whitelisted
		clientIP := c.ClientIP()
		
		if !isIPWhitelisted(clientIP) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "IP address not in whitelist. JWT authentication required.",
			})
			return
		}
		
		// IP is whitelisted, get address and chain_id from query parameters
		queryAddress := c.Query("address")
		queryChainIDStr := c.Query("chain_id")
		
		if queryAddress == "" || queryChainIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Missing required parameters. Provide address and chain_id via query parameters.",
			})
			return
		}
		
		// Parse chain ID
		var err error
		chainIDInt, err = strconv.Atoi(queryChainIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain_id format"})
			return
		}
		
		userAddressStr = queryAddress
		slip44ChainID = uint32(utils.SmartToSlip44(chainIDInt))
		
		log.Printf("📊 Statistics access via IP whitelist: IP=%s, address=%s, chain_id=%d", clientIP, queryAddress, chainIDInt)
	}

	// Get universal_address from JWT
	universalAddress, exists := c.Get("universal_address")
	var queryAddress string

	if exists {
		universalAddrStr, ok := universalAddress.(string)
		if ok && universalAddrStr != "" {
			if len(universalAddrStr) == 66 && strings.HasPrefix(universalAddrStr, "0x") {
				queryAddress = strings.ToLower(universalAddrStr)
			} else {
				queryAddress = strings.ToLower(universalAddrStr)
			}
		}
	}

	// Fallback: normalize user_address
	if queryAddress == "" {
		normalizedAddr := utils.NormalizeAddressForChain(userAddressStr, chainIDInt)
		if len(normalizedAddr) == 42 {
			universalAddr, err := utils.EvmToUniversalAddress(normalizedAddr)
			if err == nil {
				queryAddress = universalAddr
			} else {
				queryAddress = normalizedAddr
			}
		} else {
			queryAddress = normalizedAddr
		}
	}

	// Parse time range parameters (optional)
	startDate := c.Query("start_date") // YYYY-MM-DD
	endDate := c.Query("end_date")     // YYYY-MM-DD

	// Build query - filter by owner address and chain
	// WithdrawRequest uses OwnerAddress which is embedded UniversalAddress
	query := h.db.Model(&models.WithdrawRequest{}).Where("owner_chain_id = ?", slip44ChainID)
	
	// Query owner_data (embedded field)
	if chainIDInt == 195 {
		// TRON: exact match
		query = query.Where("owner_data = ?", queryAddress)
	} else {
		// EVM: case insensitive
		query = query.Where("LOWER(owner_data) = LOWER(?)", queryAddress)
	}

	// Only count successful withdraws
	query = query.Where("execute_status = ?", models.ExecuteStatusSuccess)

	// Apply time range filter if provided
	if startDate != "" {
		query = query.Where("DATE(created_at) >= ?", startDate)
	}
	if endDate != "" {
		query = query.Where("DATE(created_at) <= ?", endDate)
	}

	// Group by date and calculate statistics
	type DailyResult struct {
		Date         string
		WithdrawCount int64
		TotalAmount  string
	}

	var results []DailyResult
	err := query.Select(
		"DATE(created_at) as date",
		"COUNT(*) as withdraw_count",
		"SUM(CAST(amount AS NUMERIC)) as total_amount",
	).
		Group("DATE(created_at)").
		Order("date DESC").
		Scan(&results).Error

	if err != nil {
		log.Printf("❌ Failed to query daily withdraw statistics: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query statistics", "details": err.Error()})
		return
	}

	// Convert to response format
	dailyStats := make([]DailyWithdrawStats, len(results))
	for i, r := range results {
		dailyStats[i] = DailyWithdrawStats{
			Date:         r.Date,
			WithdrawCount: r.WithdrawCount,
			TotalAmount:  r.TotalAmount,
		}
	}

	// Calculate summary
	var totalWithdraws int64
	totalAmount := new(big.Int)

	for _, stat := range dailyStats {
		totalWithdraws += stat.WithdrawCount
		if amount, ok := new(big.Int).SetString(stat.TotalAmount, 10); ok {
			totalAmount.Add(totalAmount, amount)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    dailyStats,
		"summary": gin.H{
			"total_days":     len(dailyStats),
			"total_withdraws": totalWithdraws,
			"total_amount":    totalAmount.String(),
		},
	})
}
