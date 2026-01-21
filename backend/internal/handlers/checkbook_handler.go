package handlers

import (
	"errors"
	"fmt"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/utils"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"log"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// getDefaultTokenDecimals returns default decimals for known tokens
// TRON USDT/USDC: 6 decimals, others: 18 decimals
func getDefaultTokenDecimals(tokenKey string, chainID uint32) uint8 {
	// TRON tokens (chain_id = 195)
	if chainID == 195 {
		switch strings.ToUpper(tokenKey) {
		case "USDT", "USDC":
			return 6
		case "TRX":
			return 6
		default:
			return 18
		}
	}

	// EVM chains - common tokens
	switch strings.ToUpper(tokenKey) {
	case "USDT":
		// USDT on most chains is 6 decimals, but BSC uses 18
		if chainID == 714 { // BSC
			return 18
		}
		return 6
	case "USDC":
		// USDC on most chains is 6 decimals, but BSC uses 18
		if chainID == 714 { // BSC
			return 18
		}
		return 6
	case "WETH", "ETH":
		return 18
	default:
		return 18 // Default to 18 decimals
	}
}

// getDefaultTokenName returns default token name based on symbol
func getDefaultTokenName(symbol string) string {
	switch strings.ToUpper(symbol) {
	case "USDT":
		return "Tether USD"
	case "USDC":
		return "USD Coin"
	case "WETH":
		return "Wrapped Ether"
	case "ETH":
		return "Ethereum"
	case "TRX":
		return "TRON"
	case "BNB":
		return "Binance Coin"
	case "MATIC":
		return "Polygon"
	default:
		return strings.ToUpper(symbol) + " Token"
	}
}

// autoCreateTokenRecord automatically creates a token record in IntentRawToken table
// Returns the created token if successful, nil otherwise
func autoCreateTokenRecord(db *gorm.DB, tokenAddress string, chainID uint32, tokenKey string) *models.IntentRawToken {
	if tokenAddress == "" {
		return nil
	}

	// Get chain name
	chainName := utils.GlobalChainIDMapping.GetChainName(chainID)
	if chainName == "" {
		chainName = fmt.Sprintf("Chain%d", chainID)
	}

	// Get token info
	symbol := strings.ToUpper(tokenKey)
	decimals := getDefaultTokenDecimals(tokenKey, chainID)
	name := getDefaultTokenName(symbol)

	// Normalize address for storage (TRON addresses are case-sensitive, EVM addresses should be lowercase)
	var normalizedAddress string
	if chainID == 195 {
		// TRON: keep original case
		normalizedAddress = tokenAddress
	} else {
		// EVM: normalize to lowercase
		normalizedAddress = strings.ToLower(tokenAddress)
		if !strings.HasPrefix(normalizedAddress, "0x") {
			normalizedAddress = "0x" + normalizedAddress
		}
	}

	// Create token record
	token := &models.IntentRawToken{
		TokenAddress: normalizedAddress,
		ChainID:      chainID,
		ChainName:    chainName,
		Symbol:       symbol,
		Name:         name,
		Decimals:     decimals,
		IsActive:     true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Try to create (ignore if already exists)
	if err := db.Create(token).Error; err != nil {
		// If record already exists, try to fetch it
		var existing models.IntentRawToken
		if err := db.Where("token_address = ? AND chain_id = ?", normalizedAddress, chainID).First(&existing).Error; err == nil {
			return &existing
		}
		log.Printf("⚠️ Failed to auto-create token record: %v", err)
		return nil
	}

	log.Printf("✅ Auto-created token record: %s (%s) on %s (chain_id=%d, decimals=%d)", symbol, normalizedAddress, chainName, chainID, decimals)
	return token
}

// buildAddressQuery build address query condition based on chain ID
// For Checkbook, UserAddress is embedded with prefix "user_", so we need to query user_data and user_chain_id
func buildAddressQuery(db *gorm.DB, fieldName, address string, chainID int) *gorm.DB {
	// Checkbook uses embedded UniversalAddress with prefix "user_"
	// UniversalAddress has: SLIP44ChainID (gorm:"column:chain_id") and Data
	// So the actual columns are: user_chain_id and user_data
	if fieldName == "user_address" {
		// For Checkbook model, query using embedded fields
		if chainID == 195 {
			// TRON: exact match, case sensitive
			return db.Where("user_chain_id = ? AND user_data = ?", chainID, address)
		} else {
			// EVM: case insensitive query
			return db.Where("user_chain_id = ? AND LOWER(user_data) = LOWER(?)", chainID, address)
		}
	}

	// For other models (legacy support)
	if chainID == 195 {
		// TRON: exact match, case sensitive
		return db.Where(fieldName+" = ?", address)
	} else {
		// EVM: case insensitive query
		return db.Where("LOWER("+fieldName+") = LOWER(?)", address)
	}
}

// CreateCheckbookHandler handles POST /api/checkbook
func CreateCheckbookHandler(c *gin.Context) {
	var requestData models.Checkbook
	if err := c.ShouldBindJSON(&requestData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Checkwhetheralreadyexistschain_id + local_deposit_idrecord
	if requestData.LocalDepositID > 0 {
		log.Printf("🔍 Checkchain_id=%d, local_deposit_id=%dwhetheralreadyexistsrecord", requestData.SLIP44ChainID, requestData.LocalDepositID)

		var existingCheckbook models.Checkbook
		result := db.DB.Where("chain_id = ? AND local_deposit_id = ?", requestData.SLIP44ChainID, requestData.LocalDepositID).First(&existingCheckbook)

		if result.Error == nil {
			// record exists, update status and other fields
			log.Printf("📝 record，Update:")
			log.Printf("   ID: %s", existingCheckbook.ID)
			log.Printf("   currentstatus: %s", existingCheckbook.Status)
			log.Printf("   useraddress: {SLIP44ChainID:%d, Data:%s}", existingCheckbook.UserAddress.SLIP44ChainID, existingCheckbook.UserAddress.Data)
			log.Printf("   amount: %s", existingCheckbook.Amount)
			var commitmentStr1 string
			if existingCheckbook.Commitment != nil {
				commitmentStr1 = *existingCheckbook.Commitment
			}
			log.Printf("   Commitment: %s", commitmentStr1)

			// statusempty
			newStatus := requestData.Status
			if newStatus == "" {
				newStatus = models.CheckbookStatusUnsigned
				log.Printf("   ⚠️ statusempty，status: %s", newStatus)
			}

			updates := map[string]interface{}{
				"status":     newStatus,
				"updated_at": time.Now(),
			}

			// If provided，Update
			if requestData.Commitment != nil && *requestData.Commitment != "" {
				updates["commitment"] = *requestData.Commitment
				log.Printf("   UpdateCommitment: %s", *requestData.Commitment)
			}
			if requestData.ProofSignature != "" {
				updates["proof_signature"] = requestData.ProofSignature
				log.Printf("   UpdateProofSignature")
			}
			if requestData.DepositTransactionHash != "" {
				updates["deposit_transaction_hash"] = requestData.DepositTransactionHash
				log.Printf("   UpdateDepositTransactionHash: %s", requestData.DepositTransactionHash)
			}

			log.Printf("   status %s Update %s", existingCheckbook.Status, newStatus)

			// Update
			log.Printf("   📝 Update:")
			for key, value := range updates {
				log.Printf("      %s: %v", key, value)
			}

			if err := db.DB.Model(&existingCheckbook).Updates(updates).Error; err != nil {
				log.Printf("❌ Updaterecordfailed: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			// queryUpdaterecord
			if err := db.DB.Where("chain_id = ? AND local_deposit_id = ?", requestData.SLIP44ChainID, requestData.LocalDepositID).First(&existingCheckbook).Error; err != nil {
				log.Printf("❌ queryUpdaterecordfailed: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			log.Printf("✅ recordUpdatesuccess:")
			log.Printf("   ID: %s", existingCheckbook.ID)
			log.Printf("   status: %s", existingCheckbook.Status)
			log.Printf("   useraddress: {SLIP44ChainID:%d, Data:%s}", existingCheckbook.UserAddress.SLIP44ChainID, existingCheckbook.UserAddress.Data)
			log.Printf("   amount: %s", existingCheckbook.Amount)
			var commitmentStr string
			if existingCheckbook.Commitment != nil {
				commitmentStr = *existingCheckbook.Commitment
			}
			log.Printf("   Commitment: %s", commitmentStr)

			c.JSON(http.StatusOK, existingCheckbook)
			return
		} else if result.Error != gorm.ErrRecordNotFound {
			// query
			log.Printf("❌ querychain_id=%d, local_deposit_id=%d: %v", requestData.SLIP44ChainID, requestData.LocalDepositID, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		} else {
			log.Printf("📋 chain_id=%d, local_deposit_id=%dexists，Createrecord", requestData.SLIP44ChainID, requestData.LocalDepositID)
		}
	}

	// recordexists，Createrecord
	requestData.ID = uuid.New().String()
	if requestData.Status == "" {
		requestData.Status = models.CheckbookStatusPending
	}
	requestData.CreatedAt = time.Now()
	requestData.UpdatedAt = time.Now()

	log.Printf("🆕 Createcheckbookrecord:")
	log.Printf("   ID: %s", requestData.ID)
	log.Printf("   useraddress: %s", requestData.UserAddress.Data)
	log.Printf("   amount: %s", requestData.Amount)
	log.Printf("   status: %s", requestData.Status)
	if requestData.LocalDepositID > 0 {
		log.Printf("   LocalDepositID: %d", requestData.LocalDepositID)
	}
	log.Printf("   TokenKey: %s", requestData.TokenKey)
	commitmentStr := ""
	if requestData.Commitment != nil {
		commitmentStr = *requestData.Commitment
	}
	log.Printf("   Commitment: %s", commitmentStr)

	if result := db.DB.Create(&requestData); result.Error != nil {
		log.Printf("❌ Createrecordfailed: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	log.Printf("✅ recordCreatesuccess:")
	log.Printf("   ID: %s", requestData.ID)
	log.Printf("   useraddress: {SLIP44ChainID:%d, Data:%s}", requestData.UserAddress.SLIP44ChainID, requestData.UserAddress.Data)
	log.Printf("   status: %s", requestData.Status)

	c.JSON(http.StatusCreated, requestData)
}

// GetCheckbookByIDHandler query check directly by IDbook
func GetCheckbookByIDHandler(c *gin.Context) {
	checkbookID := c.Param("id")
	if checkbookID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Missing checkbook ID",
			"message": "Please provide checkbook ID in URL path",
		})
		return
	}

	var checkbook models.Checkbook
	err := db.DB.Where("id = ?", checkbookID).First(&checkbook).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Checkbook not found",
				"message": fmt.Sprintf("Checkbook with ID %s does not exist", checkbookID),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Database error",
			"message": err.Error(),
		})
		return
	}

	// Getcheckbookchecks
	var checks []models.Check
	err = db.DB.Where("checkbook_id = ?", checkbookID).Find(&checks).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get checks",
			"message": err.Error(),
		})
		return
	}

	// Calculate remaining amount: allocatableAmount - sum of allocated amounts
	// remainingAmount = allocatableAmount - (sum of all allocation amounts)
	var remainingAmount string
	if checkbook.AllocatableAmount != "" && checkbook.AllocatableAmount != "0" {
		allocatableBig, ok := new(big.Int).SetString(checkbook.AllocatableAmount, 10)
		if ok {
			// Sum all allocation amounts
			totalAllocated := big.NewInt(0)
			for _, check := range checks {
				if check.Amount != "" && check.Amount != "0" {
					amountBig, ok := new(big.Int).SetString(check.Amount, 10)
					if ok {
						totalAllocated.Add(totalAllocated, amountBig)
					}
				}
			}
			// remainingAmount = allocatableAmount - totalAllocated
			remainingBig := new(big.Int).Sub(allocatableBig, totalAllocated)
			if remainingBig.Sign() < 0 {
				remainingBig.SetInt64(0) // Cannot be negative
			}
			remainingAmount = remainingBig.String()
		} else {
			remainingAmount = checkbook.AllocatableAmount // Fallback to allocatableAmount if parsing fails
		}
	} else {
		remainingAmount = "0" // No allocatable amount, remaining is 0
	}

	// Get token information from IntentRawToken if TokenAddress is available
	var tokenInfo gin.H
	if checkbook.TokenAddress != "" {
		var rawToken models.IntentRawToken

		// Build query based on chain type
		// TRON addresses (chain_id = 195) are Base58 format and case-sensitive
		// EVM addresses should be normalized to lowercase for query
		var query *gorm.DB
		if checkbook.SLIP44ChainID == 195 {
			// TRON: exact match, case-sensitive (Base58 address)
			query = db.DB.Where("token_address = ? AND chain_id = ? AND is_active = ?",
				checkbook.TokenAddress,
				checkbook.SLIP44ChainID,
				true)
		} else {
			// EVM: normalize to lowercase for query
			query = db.DB.Where("LOWER(token_address) = LOWER(?) AND chain_id = ? AND is_active = ?",
				checkbook.TokenAddress,
				checkbook.SLIP44ChainID,
				true)
		}

		err = query.First(&rawToken).Error
		if err == nil {
			tokenInfo = gin.H{
				"symbol":     rawToken.Symbol,
				"name":       rawToken.Name,
				"decimals":   rawToken.Decimals,
				"address":    rawToken.TokenAddress,
				"chain_id":   rawToken.ChainID,
				"chain_name": rawToken.ChainName,
				"is_active":  rawToken.IsActive, // Include is_active field from backend
			}
		} else {
			// If token not found, try to auto-create it based on TokenKey and known token info
			log.Printf("⚠️ Token not found in IntentRawToken table: address=%s, chain_id=%d, error=%v", checkbook.TokenAddress, checkbook.SLIP44ChainID, err)

			// Try to auto-create token record
			if createdToken := autoCreateTokenRecord(db.DB, checkbook.TokenAddress, checkbook.SLIP44ChainID, checkbook.TokenKey); createdToken != nil {
				log.Printf("✅ Auto-created token record: %s (%s) on chain %d", createdToken.Symbol, createdToken.TokenAddress, createdToken.ChainID)
				tokenInfo = gin.H{
					"symbol":     createdToken.Symbol,
					"name":       createdToken.Name,
					"decimals":   createdToken.Decimals,
					"address":    createdToken.TokenAddress,
					"chain_id":   createdToken.ChainID,
					"chain_name": createdToken.ChainName,
					"is_active":  createdToken.IsActive,
				}
			} else {
				// Fallback: create minimal token info with symbol from TokenKey
				decimals := getDefaultTokenDecimals(checkbook.TokenKey, checkbook.SLIP44ChainID)
				tokenInfo = gin.H{
					"symbol":    checkbook.TokenKey, // Use TokenKey as fallback symbol
					"address":   checkbook.TokenAddress,
					"chain_id":  checkbook.SLIP44ChainID,
					"decimals":  decimals, // Use appropriate decimals based on token and chain
					"is_active": false,    // Fallback: token not found, mark as inactive
				}
			}
		}
	} else {
		// No token address, create minimal token info
		log.Printf("⚠️ Checkbook has no TokenAddress, using fallback token info")
		tokenInfo = gin.H{
			"symbol":    checkbook.TokenKey, // Use TokenKey as fallback symbol
			"chain_id":  checkbook.SLIP44ChainID,
			"decimals":  18,    // Default decimals
			"is_active": false, // Fallback: no token address, mark as inactive
		}
	}

	// Build response with token info and calculated remaining amount
	responseData := gin.H{
		"checkbook":        checkbook,
		"checks":           checks,
		"checks_count":     len(checks),
		"token":            tokenInfo,
		"remaining_amount": remainingAmount, // Calculated: allocatableAmount - sum of allocations
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    responseData,
	})
}

// GetCheckbookHandler handles GET /api/checkbook/:id
func GetCheckbookHandler(c *gin.Context) {
	depositIDStr := c.Param("id")

	// Convertint64
	depositID, err := strconv.ParseInt(depositIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid deposit_id format"})
		return
	}

	var checkbook models.Checkbook

	// V2needchain_idandlocal_deposit_id
	// ifchain_id，DefaultUseBSC (714)
	chainIDStr := c.DefaultQuery("chain_id", "714")
	chainID, err := strconv.Atoi(chainIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain_id format"})
		return
	}

	if result := db.DB.Where("chain_id = ? AND local_deposit_id = ?", chainID, depositID).First(&checkbook); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Checkbook not found"})
		return
	}

	// query checks
	var checks []models.Check
	if err := db.DB.Where("checkbook_id = ?", checkbook.ID).Find(&checks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve checks"})
		return
	}

	// response， checkbook and checks
	response := gin.H{
		"checkbook": checkbook,
		"checks":    checks,
	}

	c.JSON(http.StatusOK, response)
}

// DeleteCheckbookHandler handles DELETE /api/checkbooks/:id
func DeleteCheckbookHandler(c *gin.Context) {
	checkbookID := c.Param("id")

	log.Printf("🗑️ deleteCheckbookrequest: ID=%s", checkbookID)

	// 1. Checkbook
	var checkbook models.Checkbook
	if result := db.DB.Where("id = ?", checkbookID).First(&checkbook); result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Checkbook not found"})
			return
		}
		log.Printf("❌ queryCheckbookfailed: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database query failed"})
		return
	}

	// 2. Verifystatus： with_checkbook checkcompleteddelete
	if checkbook.Status != models.CheckbookStatusWithCheckbook {
		log.Printf("❌ Checkbookstatusallowdelete: current=%s, =with_checkbook", checkbook.Status)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":           "Invalid checkbook status for deletion",
			"current_status":  string(checkbook.Status),
			"required_status": "with_checkbook",
		})
		return
	}

	// 3. Check all checks (allocations) - all must be "used" status
	// Only allow deletion when all allocations have been used (withdrawn)
	var checks []models.Check
	if err := db.DB.Where("checkbook_id = ?", checkbookID).Find(&checks).Error; err != nil {
		log.Printf("❌ queryCheckfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query associated checks"})
		return
	}

	if len(checks) == 0 {
		log.Printf("❌ Checkrecord，delete")
		c.JSON(http.StatusBadRequest, gin.H{"error": "No associated checks found"})
		return
	}

	// Verify all checks (allocations) are in "used" status
	// "used" means the nullifier has been consumed on-chain (irreversible)
	// Only when all allocations are used can we safely delete the checkbook
	for _, check := range checks {
		if check.Status != models.AllocationStatusUsed {
			log.Printf("❌ Checkstatusallowdelete: CheckID=%s, status=%s, required=used", check.ID, check.Status)
			c.JSON(http.StatusBadRequest, gin.H{
				"error":           "All checks (allocations) must be used before deletion",
				"check_id":        check.ID,
				"check_status":    check.Status,
				"required_status": "used",
			})
			return
		}
	}

	log.Printf("✅ Verify，startdelete")
	log.Printf("   Checkbookstatus: %s", checkbook.Status)
	log.Printf("   Check: %d", len(checks))

	// 4. transactiondelete
	tx := db.DB.Begin()
	if tx.Error != nil {
		log.Printf("❌ transactionfailed: %v", tx.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to begin transaction"})
		return
	}

	// 5. deleteCheckrecord
	if err := tx.Where("checkbook_id = ?", checkbookID).Delete(&models.Check{}).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ deleteCheckrecordfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete check records"})
		return
	}

	log.Printf("✅ alreadydelete %d Checkrecord", len(checks))

	// 6. Createrecord（）
	preservedData := models.Checkbook{
		ID:             checkbook.ID,
		SLIP44ChainID:  checkbook.SLIP44ChainID,
		LocalDepositID: checkbook.LocalDepositID,
		UserAddress:    checkbook.UserAddress,
		Commitment:     checkbook.Commitment,
		GrossAmount:    checkbook.GrossAmount,
		Status:         models.CheckbookStatusDeleted,
		CreatedAt:      checkbook.CreatedAt,
		UpdatedAt:      time.Now(),
	}

	// deleterecord
	if err := tx.Delete(&checkbook).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ deleteCheckbookrecordfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete original checkbook"})
		return
	}

	// Createrecord
	if err := tx.Create(&preservedData).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ CreateCheckbookrecordfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create simplified checkbook"})
		return
	}

	log.Printf("✅ alreadyCreateCheckbookrecord")

	// 7. transaction
	if err := tx.Commit().Error; err != nil {
		log.Printf("❌ transactionfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	log.Printf("✅ Checkbookdeletesuccess")

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"message":        "Checkbook deleted successfully",
		"checkbook_id":   checkbookID,
		"deleted_checks": len(checks),
		"status":         "DELETED",
		"timestamp":      time.Now().Format(time.RFC3339),
	})
}

// normalizeRootValue root，different fromDatabasestorage
func normalizeRootValue(root string) string {
	if root == "" {
		return ""
	}
	// Convert0x
	normalized := strings.ToLower(root)
	if !strings.HasPrefix(normalized, "0x") {
		normalized = "0x" + normalized
	}
	return normalized
}

// GetCheckbooksListHandler handles GET /api/checkbooks - List user's checkbooks
func GetCheckbooksListHandler(c *gin.Context) {
	// Extract from JWT middleware (set by RequireAuth())
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing authentication"})
		return
	}

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing chain ID"})
		return
	}

	userAddressStr, ok := userAddress.(string)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user address"})
		return
	}

	// Handle different possible types for chain_id
	var chainIDInt int
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

	// JWT now stores SLIP-44 chain ID, but convert if needed for backward compatibility
	// Use SmartToSlip44 to handle both EVM and SLIP-44 chain IDs
	slip44ChainID := utils.SmartToSlip44(chainIDInt)
	if chainIDInt != slip44ChainID {
		log.Printf("📋 Chain ID conversion: %d -> SLIP-44=%d", chainIDInt, slip44ChainID)
	}

	// Get universal_address from JWT for consistent querying
	// Middleware already parsed universal_address to pure address format (0x...)
	// Database stores Universal Address (32 bytes), so we should use it directly from JWT
	universalAddress, exists := c.Get("universal_address")
	var queryAddress string

	if exists {
		// Middleware already extracted pure address (without chainId: prefix)
		universalAddrStr, ok := universalAddress.(string)
		if ok && universalAddrStr != "" {
			// Already pure 32-byte Universal Address (0x + 64 chars)
			if len(universalAddrStr) == 66 && strings.HasPrefix(universalAddrStr, "0x") {
				// Use the full 32-byte Universal Address directly
				queryAddress = strings.ToLower(universalAddrStr)
				log.Printf("📋 Using Universal Address from JWT: %s", queryAddress)
			} else {
				// Fallback: use as-is if format is unexpected
				queryAddress = strings.ToLower(universalAddrStr)
			}
		}
	}

	// Fallback: normalize user_address and convert to Universal Address if universal_address extraction failed
	if queryAddress == "" {
		normalizedAddr := utils.NormalizeAddressForChain(userAddressStr, chainIDInt)
		// Convert 20-byte address to 32-byte Universal Address format
		if len(normalizedAddr) == 42 { // 20-byte address (0x + 40 hex chars)
			universalAddr, err := utils.EvmToUniversalAddress(normalizedAddr)
			if err == nil {
				queryAddress = universalAddr
				log.Printf("📋 Converted 20-byte address to Universal Address: %s", queryAddress)
			} else {
				log.Printf("⚠️ Failed to convert address to Universal format: %v", err)
				queryAddress = normalizedAddr // Fallback to normalized address
			}
		} else {
			queryAddress = normalizedAddr
		}
	}

	log.Printf("📋 List checkbooks for user: %s (query: %s), chain_id: %d (SLIP-44: %d)", userAddressStr, queryAddress, chainIDInt, slip44ChainID)

	// Parse pagination parameters
	page := 1
	if p := c.DefaultQuery("page", "1"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 {
			page = val
		}
	}

	size := 20 // Default to 20 instead of 10
	// Support both "limit" and "size" parameters (limit takes precedence)
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			// Cap size at 5000
			if val > 5000 {
				val = 5000
			}
			size = val
		}
	} else if s := c.DefaultQuery("size", "20"); s != "" {
		if val, err := strconv.Atoi(s); err == nil && val > 0 {
			// Cap size at 5000
			if val > 5000 {
				val = 5000
			}
			size = val
		}
	}

	// Parse deleted parameter
	includeDeleted := false
	if d := c.DefaultQuery("deleted", "false"); d == "true" {
		includeDeleted = true
	}

	log.Printf("   Pagination: page=%d, size=%d", page, size)
	log.Printf("   Include deleted: %v", includeDeleted)

	// Build query - use SLIP-44 chain ID to match database format (database stores SLIP-44 chain ID)
	query := db.DB.Where("chain_id = ?", slip44ChainID)
	query = buildAddressQuery(query, "user_address", queryAddress, int(slip44ChainID))

	// Filter by deleted status if needed
	if !includeDeleted {
		query = query.Where("status != ?", models.CheckbookStatusDeleted)
	}

	// Get total count
	var total int64
	countQuery := query
	if err := countQuery.Model(&models.Checkbook{}).Count(&total).Error; err != nil {
		log.Printf("❌ Failed to count checkbooks: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count checkbooks"})
		return
	}

	// Get paginated results - order by local_deposit_id DESC (newest deposit ID first)
	// Preload allocations for each checkbook
	var checkbooks []models.Checkbook
	offset := (page - 1) * size
	if err := query.Preload("Allocations", func(db *gorm.DB) *gorm.DB {
		return db.Order("seq ASC") // Order allocations by sequence number
	}).Order("local_deposit_id DESC").Offset(offset).Limit(size).Find(&checkbooks).Error; err != nil {
		log.Printf("❌ Failed to list checkbooks: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list checkbooks"})
		return
	}

	log.Printf("✅ Retrieved %d checkbooks (total: %d) with allocations", len(checkbooks), total)

	// Log first few checkbook IDs for debugging
	if len(checkbooks) > 0 {
		log.Printf("📋 Sample checkbook IDs: %s (local_deposit_id: %d)",
			checkbooks[0].ID, checkbooks[0].LocalDepositID)
		if len(checkbooks) > 1 {
			log.Printf("📋 Sample checkbook IDs: %s (local_deposit_id: %d)",
				checkbooks[1].ID, checkbooks[1].LocalDepositID)
		}
	}

	// Prepare response
	response := gin.H{
		"data": checkbooks,
		"pagination": gin.H{
			"page":  page,
			"size":  size,
			"total": total,
			"pages": (total + int64(size) - 1) / int64(size),
		},
	}

	c.JSON(http.StatusOK, response)
}

// GetCheckbookByDepositHandler handles GET /api/checkbooks/by-deposit/:chain_id/:tx_hash
// Looks up a checkbook by Chain SLIP44 ID and Deposit Transaction Hash
// Used by backend services (IP whitelist required)
func GetCheckbookByDepositHandler(c *gin.Context) {
	chainIDStr := c.Param("chain_id")
	txHash := c.Param("tx_hash")

	if chainIDStr == "" || txHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Missing chain_id or tx_hash",
		})
		return
	}

	// Parse chain ID
	chainID, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid chain_id format",
		})
		return
	}

	// Normalize tx hash (lowercase, ensure 0x prefix)
	txHash = strings.ToLower(txHash)
	if !strings.HasPrefix(txHash, "0x") {
		txHash = "0x" + txHash
	}

	var checkbook models.Checkbook
	// Query by chain_id and deposit_transaction_hash
	if err := db.DB.Where("chain_id = ? AND deposit_transaction_hash = ?", chainID, txHash).
		Preload("Allocations"). // Include allocations
		First(&checkbook).Error; err != nil {

		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Checkbook not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Database error",
			"message": err.Error(),
		})
		return
	}

	// Enrich with token info if available (similar to other handlers)
	var tokenInfo gin.H
	if checkbook.TokenAddress != "" {
		var rawToken models.IntentRawToken
		err := db.DB.Where("token_address = ? AND chain_id = ? AND is_active = ?",
			strings.ToLower(checkbook.TokenAddress),
			checkbook.SLIP44ChainID,
			true).First(&rawToken).Error
		if err == nil {
			tokenInfo = gin.H{
				"id":         checkbook.TokenKey,
				"symbol":     rawToken.Symbol,
				"name":       rawToken.Name,
				"decimals":   rawToken.Decimals,
				"address":    rawToken.TokenAddress,
				"chain_id":   rawToken.ChainID,
				"chain_name": rawToken.ChainName,
				"is_active":  rawToken.IsActive,
			}
		} else {
			// Fallback
			tokenInfo = gin.H{
				"id":       checkbook.TokenKey,
				"symbol":   checkbook.TokenKey,
				"decimals": 18, // Default
				"address":  checkbook.TokenAddress,
				"chain_id": checkbook.SLIP44ChainID,
			}
		}
	}

	// Respond
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"checkbook": checkbook,
		"token":     tokenInfo,
	})
}
