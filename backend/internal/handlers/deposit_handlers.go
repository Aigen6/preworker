package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"go-backend/internal/db"
	handlersinternal "go-backend/internal/handlers/internal"
	"go-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================================
// Deposit Handlers -
// ============================================================================
// :
// - CreateDepositHandler:  BlockScanner  NATS
// - ListDepositsHandler:
// - UpdateDepositStatusHandler:
// ============================================================================

// GetDepositHandler retrieves a specific deposit info (V2)
// GET /api/deposits/:chainId/:localDepositId
func GetDepositHandler(c *gin.Context) {
	chainIDStr := c.Param("chainId")
	localDepositIDStr := c.Param("localDepositId")

	// Parse chain ID
	chainID, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":    "Invalid chain ID format",
			"received": chainIDStr,
		})
		return
	}

	// Parse local deposit ID
	localDepositID, err := strconv.ParseInt(localDepositIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":    "Invalid deposit ID format",
			"received": localDepositIDStr,
		})
		return
	}

	// Query from database
	var deposit models.EventDepositReceived
	result := db.DB.Where("chain_id = ? AND local_deposit_id = ?", chainID, localDepositID).First(&deposit)

	if result.Error == gorm.ErrRecordNotFound {
		c.JSON(http.StatusNotFound, gin.H{
			"error":            "Deposit not found",
			"chain_id":         chainID,
			"local_deposit_id": localDepositID,
		})
		return
	}

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to query deposit",
			"details": result.Error.Error(),
		})
		return
	}

	// Return deposit info
	c.JSON(http.StatusOK, gin.H{
		"deposit": gin.H{
			"id":               deposit.ID,
			"chain_id":         deposit.ChainID,
			"local_deposit_id": deposit.LocalDepositId,
			"amount":           deposit.Amount,
			"depositor":        deposit.Depositor,
			"block_number":     deposit.BlockNumber,
			"transaction_hash": deposit.TransactionHash,
			"created_at":       deposit.CreatedAt,
			"updated_at":       deposit.UpdatedAt,
		},
	})
}

// GetDepositsByOwnerHandler queries deposits by owner address with JWT authentication (V2)
// This is a complex handler (~300 lines) that handles authentication, pagination, and check data
func GetDepositsByOwnerHandler(c *gin.Context) {
	// JWT authentication
	_, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "",
			"code":  "MISSING_USER_INFO",
		})
		return
	}

	universalAddress, exists := c.Get("universal_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "",
			"code":  "MISSING_UNIVERSAL_ADDRESS",
		})
		return
	}

	jwtChainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "",
			"code":  "MISSING_CHAIN_ID",
		})
		return
	}

	// Use JWT address directly - ignore query parameters for security
	// Parse pagination parameters only
	deleted := c.DefaultQuery("deleted", "false")
	pageStr := c.DefaultQuery("page", "1")
	sizeStr := c.DefaultQuery("size", "10")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	size, err := strconv.Atoi(sizeStr)
	if err != nil || size < 1 {
		size = 10
	}
	if size > 100 {
		size = 100
	}

	// Use JWT chain ID and address directly
	jwtChainIDInt, ok := jwtChainID.(int)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid JWT chain ID",
			"code":  "INVALID_JWT_CHAIN_ID",
		})
		return
	}

	jwtUniversalAddr, ok := universalAddress.(string)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid JWT address",
			"code":  "INVALID_JWT_ADDRESS",
		})
		return
	}

	// Middleware already parsed universal_address to pure address format (0x...)
	// No need to parse chainId: prefix - it's already removed by middleware
	jwtOwnerData := jwtUniversalAddr // Already pure 32-byte Universal Address (0x + 64 hex chars)

	if len(jwtOwnerData) != 66 || !strings.HasPrefix(jwtOwnerData, "0x") {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":    "JWT universal address must be 32-byte hex string (0x + 64 hex chars)",
			"received": jwtOwnerData,
		})
		return
	}

	// Extract normalized address (last 20 bytes) from Universal Address for database query
	// Database stores normalized address (20 bytes), not Universal Address (32 bytes)
	normalizedAddr := "0x" + jwtOwnerData[len(jwtOwnerData)-40:] // Extract last 40 hex chars
	normalizedAddr = strings.ToLower(normalizedAddr)

	chainIDInt := jwtChainIDInt

	// Query checkbooks using normalized address (20 bytes) to match database format
	var checkbooks []models.Checkbook
	var query *gorm.DB
	if chainIDInt == 195 {
		// TRON: exact match, case sensitive
		query = db.DB.Where("user_chain_id = ? AND user_data = ?", chainIDInt, normalizedAddr)
	} else {
		// EVM: case insensitive query
		query = db.DB.Where("user_chain_id = ? AND LOWER(user_data) = LOWER(?)", chainIDInt, normalizedAddr)
	}

	if deleted == "true" {
		query = query.Where("status = ?", models.CheckbookStatusDeleted)
	} else {
		query = query.Where("status != ?", models.CheckbookStatusDeleted)
	}

	var totalCount int64
	if err := query.Model(&models.Checkbook{}).Count(&totalCount).Error; err != nil {
		log.Printf("❌ Count query failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count records",
			"debug": err.Error(),
		})
		return
	}

	offset := (page - 1) * size
	totalPages := int((totalCount + int64(size) - 1) / int64(size))

	query = query.Order("local_deposit_id DESC").Limit(size).Offset(offset)
	if err := query.Find(&checkbooks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Database query failed",
		})
		return
	}

	// Convert checkbooks to deposits format with check info
	deposits := []gin.H{}
	for _, checkbook := range checkbooks {
		deposit := gin.H{
			"checkbook_id":       checkbook.ID,
			"chain_id":           chainIDInt,
			"local_deposit_id":   checkbook.LocalDepositID,
			"token_key":           checkbook.TokenKey,
			"owner":              gin.H{"chain_id": checkbook.UserAddress.SLIP44ChainID, "data": checkbook.UserAddress.Data},
			"gross_amount":       checkbook.GrossAmount,
			"fee_total_locked":   checkbook.FeeTotalLocked,
			"allocatable_amount": checkbook.AllocatableAmount,
			"promote_code":       checkbook.PromoteCode,
			"address_rank":       1,
			"deposit_tx_hash":    checkbook.DepositTransactionHash,
			"block_number":       0,
			"used":               false,
			"contract_timestamp": 0,
			"created_at":         checkbook.CreatedAt,
			"updated_at":         checkbook.UpdatedAt,
			"status":             checkbook.Status,
			"commitment":         checkbook.Commitment,
		}

		if handlersinternal.ShouldIncludeChecksForStatus(string(checkbook.Status)) {
			var checks []models.Check
			if err := db.DB.Where("checkbook_id = ?", checkbook.ID).Find(&checks).Error; err == nil && len(checks) > 0 {
				checksData := make([]gin.H, 0, len(checks))
				statusCounts := make(map[string]int)

				for _, check := range checks {
					statusCounts[string(check.Status)]++

					recipientInfo := gin.H{
						"chain_id": check.Recipient.SLIP44ChainID,
						"address":  check.Recipient.Data,
						"amount":   check.Amount,
						// token_id is deprecated, removed
					}

					var nullifierVal interface{}
					if check.Nullifier != "" {
						nullifierVal = check.Nullifier
					}

					checkData := gin.H{
						"id":           check.ID,
						"checkbook_id": check.CheckbookID,
						"commitment":   checkbook.Commitment,
						"nullifier":    nullifierVal,
						"status":       check.Status,
						"proof_ready":  check.Status == "proved" || check.Status == "completed",
						"created_at":   check.CreatedAt,
						"updated_at":   check.UpdatedAt,
						"recipient":    recipientInfo,
					}

					if check.Status == "proved" || check.Status == "completed" {
						checkData["proved_at"] = check.UpdatedAt
					}

					checksData = append(checksData, checkData)
				}

				withdrawalStatus := handlersinternal.CalculateWithdrawalStatus(statusCounts)
				deposit["checks"] = checksData
				deposit["checks_count"] = len(checksData)
				deposit["check_status_summary"] = statusCounts
				deposit["withdrawal_status"] = withdrawalStatus
			} else {
				deposit["checks"] = []gin.H{}
				deposit["checks_count"] = 0
			}
		} else {
			deposit["checks"] = []gin.H{}
			deposit["checks_count"] = 0
		}

		deposits = append(deposits, deposit)
	}

	c.JSON(http.StatusOK, gin.H{
		"data": deposits,
		"pagination": gin.H{
			"page":        page,
			"size":        len(deposits),
			"total":       totalCount,
			"total_pages": totalPages,
		},
		"version": "v2",
	})
}
