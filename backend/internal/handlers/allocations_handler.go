package handlers

import (
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

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ListAllocationsHandler handles GET /api/allocations
// Supports filtering by: checkbookId, tokenId, tokenKeys, status, owner (via checkbook)
func ListAllocationsHandler(c *gin.Context) {
	// Extract query parameters
	checkbookID := c.Query("checkbookId")
	tokenIDStr := c.Query("tokenId")
	tokenKeysStr := c.Query("tokenKeys") // Comma-separated token keys (e.g., "USDT,USDC")
	status := c.Query("status")
	owner := c.Query("owner") // User address (optional, requires JWT if provided)

	// Pagination
	page := 1
	if p := c.DefaultQuery("page", "1"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 {
			page = val
		}
	}

	limit := 20
	if l := c.DefaultQuery("limit", "20"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			if val > 100 {
				val = 100 // Cap at 100
			}
			limit = val
		}
	}

	log.Printf("📋 List allocations request: checkbookId=%s, tokenId=%s, tokenKeys=%s, status=%s, owner=%s, page=%d, limit=%d",
		checkbookID, tokenIDStr, tokenKeysStr, status, owner, page, limit)

	// Build query - allocations (checks) are directly from checks table
	// They belong to checkbooks, but we query them directly for flexibility
	query := db.DB.Model(&models.Check{})

	// Filter by checkbook_id (direct field in checks table)
	if checkbookID != "" {
		query = query.Where("checkbook_id = ?", checkbookID)
	}

	// Filter by status (direct field in checks table)
	if status != "" {
		// Validate status
		validStatuses := map[string]bool{
			"idle":    true,
			"pending": true,
			"used":    true,
		}
		if !validStatuses[status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status. Must be: idle, pending, or used"})
			return
		}
		query = query.Where("checks.status = ?", status)
	}

	// Filter by owner - ALWAYS use JWT address if authenticated, ignore query parameter for security
	// Get user address and chain_id from JWT (if authenticated)
	userAddress, hasUserAddress := c.Get("user_address")
	chainID, hasChainID := c.Get("chain_id")

	// Parse token_keys (comma-separated string)
	var tokenKeys []string
	if tokenKeysStr != "" {
		// Split by comma and trim whitespace
		parts := strings.Split(tokenKeysStr, ",")
		for _, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				tokenKeys = append(tokenKeys, trimmed)
			}
		}
	}

	// Determine if we need to join checkbooks table
	// Need join if: filtering by token_id, token_keys, owner parameter provided, JWT authenticated user, or status is "idle" (need to check checkbook status)
	needsJoin := tokenIDStr != "" || len(tokenKeys) > 0 || owner != "" || (hasUserAddress && hasChainID) || status == "idle"
	if needsJoin {
		query = query.Joins("JOIN checkbooks ON checks.checkbook_id = checkbooks.id")
	}

	// For idle allocations, only return those from checkbooks with status "with_checkbook"
	// This ensures allocations are only returned after CommitmentRootUpdated event is received
	if status == "idle" {
		query = query.Where("checkbooks.status = ?", models.CheckbookStatusWithCheckbook)
	}

	// Filter by token_key (from checkbook) - replaced token_id
	// Support both single tokenId and multiple tokenKeys
	if tokenIDStr != "" {
		// tokenIDStr is now treated as tokenKey (e.g., "USDT", "USDC")
		query = query.Where("checkbooks.token_key = ?", tokenIDStr)
	} else if len(tokenKeys) > 0 {
		// Filter by multiple token_keys (e.g., ["USDT", "USDC"])
		query = query.Where("checkbooks.token_key IN ?", tokenKeys)
	}

	if hasUserAddress && hasChainID {
		// User is authenticated - use JWT address (ignore owner query parameter for security)
		userAddressStr, ok := userAddress.(string)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user address"})
			return
		}

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
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid chain ID type"})
			return
		}

		// JWT now stores SLIP-44 chain ID, but convert if needed for backward compatibility
		// Use SmartToSlip44 to handle both EVM and SLIP-44 chain IDs
		slip44ChainID := utils.SmartToSlip44(chainIDInt)

		// Get universal_address from JWT for consistent querying
		// Middleware already parsed universal_address to pure address format (0x...)
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
				} else {
					queryAddress = normalizedAddr // Fallback to normalized address
				}
			} else {
				queryAddress = normalizedAddr
			}
		} else {
			// If we got universal_address from JWT, make sure it's in the right format
			// Middleware already provided pure address (0x...), but if it's not 66 chars, it might need conversion
			if len(queryAddress) == 42 { // 20-byte address, convert to Universal
				universalAddr, err := utils.EvmToUniversalAddress(queryAddress)
				if err == nil {
					queryAddress = universalAddr
				}
			}
		}

		// Query using embedded UniversalAddress fields in checkbook
		// Database uses SLIP-44 chain ID for user_chain_id
		if slip44ChainID == 195 {
			// TRON: exact match, case sensitive
			query = query.Where("checkbooks.user_chain_id = ? AND checkbooks.user_data = ?", slip44ChainID, queryAddress)
		} else {
			// EVM: case insensitive query
			query = query.Where("checkbooks.user_chain_id = ? AND LOWER(checkbooks.user_data) = LOWER(?)", slip44ChainID, queryAddress)
		}
		query = query.Where("checkbooks.chain_id = ?", slip44ChainID)
	} else if owner != "" {
		// Owner parameter provided but no JWT - reject for security
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Owner filtering requires authentication. Please provide JWT token."})
		return
	}

	// Get total count
	var total int64
	if err := query.Count(&total).Error; err != nil {
		log.Printf("❌ Failed to count allocations: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count allocations"})
		return
	}

	// Get paginated results
	var allocations []models.Check
	offset := (page - 1) * limit

	if err := query.
		Offset(offset).
		Limit(limit).
		Order("created_at DESC").
		Find(&allocations).Error; err != nil {
		log.Printf("❌ Failed to list allocations: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list allocations"})
		return
	}

	log.Printf("✅ Retrieved %d allocations (total: %d)", len(allocations), total)

	// Enrich allocations with checkbook and token information
	allocationData := make([]gin.H, 0, len(allocations))
	checkbookCache := make(map[string]*models.Checkbook) // Cache checkbooks to avoid repeated queries
	tokenCache := make(map[string]gin.H)                 // Cache token info by key: tokenAddress_chainId

	// Pre-fetch all unique checkbooks
	checkbookIDs := make(map[string]bool)
	for _, allocation := range allocations {
		checkbookIDs[allocation.CheckbookID] = true
	}

	// Batch load checkbooks
	var checkbooks []models.Checkbook
	if len(checkbookIDs) > 0 {
		ids := make([]string, 0, len(checkbookIDs))
		for id := range checkbookIDs {
			ids = append(ids, id)
		}
		if err := db.DB.Where("id IN ?", ids).Find(&checkbooks).Error; err == nil {
			for i := range checkbooks {
				checkbookCache[checkbooks[i].ID] = &checkbooks[i]
			}
		}
	}

	for _, allocation := range allocations {
		// Get checkbook from cache
		checkbook := checkbookCache[allocation.CheckbookID]

		// Convert Check to JSON
		allocationJSON := gin.H{
			"id":           allocation.ID,
			"checkbook_id": allocation.CheckbookID,
			"seq":          allocation.Seq,
			"amount":       allocation.Amount,
			"status":       allocation.Status,
			"nullifier":    allocation.Nullifier,
			"created_at":   allocation.CreatedAt,
			"updated_at":   allocation.UpdatedAt,
		}

		// Add commitment if available
		if checkbook != nil && checkbook.Commitment != nil {
			allocationJSON["commitment"] = *checkbook.Commitment
		}

		// Add checkbook information (especially local_deposit_id and user address)
		if checkbook != nil {
			checkbookInfo := gin.H{
				"id":               checkbook.ID,
				"local_deposit_id": checkbook.LocalDepositID,
				"slip44_chain_id":  checkbook.SLIP44ChainID,
				"token_key":        checkbook.TokenKey,
				"token_address":    checkbook.TokenAddress,
			}
			// Add user address (depositor address) from checkbook
			if checkbook.UserAddress.Data != "" {
				checkbookInfo["user_address"] = gin.H{
					"slip44_chain_id": checkbook.UserAddress.SLIP44ChainID,
					"data":            checkbook.UserAddress.Data, // 32-byte Universal Address
				}
			}
			allocationJSON["checkbook"] = checkbookInfo
		}

		// Get token information
		var tokenInfo gin.H
		if checkbook != nil && checkbook.TokenAddress != "" {
			// Check cache first
			tokenKey := fmt.Sprintf("%s_%d", strings.ToLower(checkbook.TokenAddress), checkbook.SLIP44ChainID)
			if cached, exists := tokenCache[tokenKey]; exists {
				tokenInfo = cached
			} else {
				// Query IntentRawToken table
				var rawToken models.IntentRawToken
				err := db.DB.Where("token_address = ? AND chain_id = ? AND is_active = ?",
					strings.ToLower(checkbook.TokenAddress),
					checkbook.SLIP44ChainID,
					true).First(&rawToken).Error
				if err == nil {
					tokenInfo = gin.H{
						"id":         checkbook.TokenKey, // Use TokenKey as ID
						"symbol":     rawToken.Symbol,
						"name":       rawToken.Name,
						"decimals":   rawToken.Decimals,
						"address":    rawToken.TokenAddress,
						"chain_id":   rawToken.ChainID,
						"chain_name": rawToken.ChainName,
						"is_active":  rawToken.IsActive,
					}
				} else {
					// Fallback token info
					tokenInfo = gin.H{
						"id":        checkbook.TokenKey, // Use TokenKey as ID
						"symbol":    checkbook.TokenKey,
						"name":      checkbook.TokenKey,
						"decimals":  18,
						"address":   checkbook.TokenAddress,
						"chain_id":  checkbook.SLIP44ChainID,
						"is_active": false,
					}
				}
				tokenCache[tokenKey] = tokenInfo
			}
		} else if checkbook != nil {
			// No token address, create minimal token info
			tokenInfo = gin.H{
				"id":        checkbook.TokenKey, // Use TokenKey as ID
				"symbol":    checkbook.TokenKey,
				"name":      checkbook.TokenKey,
				"decimals":  18,
				"chain_id":  checkbook.SLIP44ChainID,
				"is_active": false,
			}
		}

		if tokenInfo != nil {
			allocationJSON["token"] = tokenInfo
		}

		// Add recipient if available (legacy field)
		if allocation.Recipient.Data != "" {
			allocationJSON["recipient"] = gin.H{
				"chain_id": allocation.Recipient.SLIP44ChainID,
				"address":  allocation.Recipient.Data,
			}
		}

		// Add token_id if available (legacy field)
		if allocation.TokenID > 0 {
			allocationJSON["token_id"] = allocation.TokenID
		}

		allocationData = append(allocationData, allocationJSON)
	}

	// Prepare response
	// Backend uses snake_case (Go standard), frontend will convert to camelCase
	response := gin.H{
		"data": allocationData,
		"pagination": gin.H{
			"page":  page,
			"limit": limit,
			"total": total,
			"pages": (total + int64(limit) - 1) / int64(limit),
		},
	}

	c.JSON(http.StatusOK, response)
}

// GetAllocationByIDHandler handles GET /api/allocations/:id
func GetAllocationByIDHandler(c *gin.Context) {
	allocationID := c.Param("id")
	if allocationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Missing allocation ID",
		})
		return
	}

	var allocation models.Check
	err := db.DB.Where("id = ?", allocationID).First(&allocation).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Allocation not found",
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

	// Get commitment from checkbook
	var checkbook models.Checkbook
	var commitment *string
	if err := db.DB.Select("commitment").Where("id = ?", allocation.CheckbookID).First(&checkbook).Error; err == nil {
		commitment = checkbook.Commitment
	}

	// Convert Check to JSON with commitment field added
	allocationJSON := gin.H{
		"id":           allocation.ID,
		"checkbook_id": allocation.CheckbookID,
		"seq":          allocation.Seq,
		"amount":       allocation.Amount,
		"status":       allocation.Status,
		"nullifier":    allocation.Nullifier,
		"created_at":   allocation.CreatedAt,
		"updated_at":   allocation.UpdatedAt,
	}

	// Add commitment if available
	if commitment != nil {
		allocationJSON["commitment"] = *commitment
	}

	// Add recipient if available (legacy field)
	if allocation.Recipient.Data != "" {
		allocationJSON["recipient"] = gin.H{
			"chain_id": allocation.Recipient.SLIP44ChainID,
			"address":  allocation.Recipient.Data,
		}
	}

	// Add token_id if available (legacy field)
	if allocation.TokenID > 0 {
		allocationJSON["token_id"] = allocation.TokenID
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"allocation": allocationJSON,
		},
	})
}

// CreateAllocationsRequest represents the request body for POST /api/allocations
type CreateAllocationsRequest struct {
	CheckbookID string   `json:"checkbookId" binding:"required"`
	Amounts     []string `json:"amounts" binding:"required"`
	TokenKey    string   `json:"tokenKey" binding:"required"` // Token key (e.g., "USDT", "USDC") - replaces tokenId
	Signature   string   `json:"signature" binding:"required"`
	Message     string   `json:"message" binding:"required"`
	Commitments []string `json:"commitments,omitempty"` // Optional commitment hashes
}

// CreateAllocationsHandler handles POST /api/allocations
// This endpoint creates allocations in the database and updates checkbook status to 'signaturing'
// NOTE: This handler does NOT call ZKVM service. ZKVM proof generation should be handled separately
// via /api/commitments/submit endpoint or a background job
func CreateAllocationsHandler(c *gin.Context) {
	log.Printf("📦 [CreateAllocationsHandler] Received request to create allocations")
	var req CreateAllocationsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("❌ [CreateAllocationsHandler] Validation error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "ValidationError",
			"message": err.Error(),
		})
		return
	}
	log.Printf("📦 [CreateAllocationsHandler] Request validated: checkbookId=%s, amountCount=%d, tokenKey=%s",
		req.CheckbookID, len(req.Amounts), req.TokenKey)

	log.Printf("📦 Create allocations request: checkbookId=%s, tokenKey=%s, amountCount=%d",
		req.CheckbookID, req.TokenKey, len(req.Amounts))

	// Get checkbook to extract necessary information
	var checkbook models.Checkbook
	if err := db.DB.Where("id = ?", req.CheckbookID).First(&checkbook).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "CheckbookNotFound",
				"message": "Checkbook not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DatabaseError",
			"message": err.Error(),
		})
		return
	}

	// Get user address from JWT
	userAddress, hasUserAddress := c.Get("user_address")
	chainID, hasChainID := c.Get("chain_id")
	if !hasUserAddress || !hasChainID {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Unauthorized",
			"message": "JWT authentication required",
		})
		return
	}

	userAddressStr, ok := userAddress.(string)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "InvalidUserAddress",
			"message": "Invalid user address in JWT",
		})
		return
	}

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
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "InvalidChainID",
			"message": "Invalid chain ID in JWT",
		})
		return
	}

	// Get universal address from JWT
	universalAddress, exists := c.Get("universal_address")
	var ownerAddress string
	if exists {
		universalAddrStr, ok := universalAddress.(string)
		if ok && universalAddrStr != "" {
			parts := strings.Split(universalAddrStr, ":")
			if len(parts) == 2 {
				ownerAddress = parts[1] // Extract the address part
			}
		}
	}
	if ownerAddress == "" {
		// Fallback to user_address
		normalizedAddr := utils.NormalizeAddressForChain(userAddressStr, chainIDInt)
		if len(normalizedAddr) == 42 {
			universalAddr, err := utils.EvmToUniversalAddress(normalizedAddr)
			if err == nil {
				ownerAddress = universalAddr
			} else {
				ownerAddress = normalizedAddr
			}
		} else {
			ownerAddress = normalizedAddr
		}
	}

	// Check checkbook status - allow ready_for_commitment, proof_failed, and submission_failed
	// Note: ready_for_commitment is set by DepositRecorded event after deposit is recorded
	// proof_failed and submission_failed allow retry by creating new allocations and commitment
	// with_checkbook means commitment is already confirmed on-chain, cannot create new allocations
	// unsigned status means DepositRecorded event hasn't been processed yet
	if checkbook.Status != models.CheckbookStatusReadyForCommitment &&
		checkbook.Status != models.CheckbookStatusProofFailed &&
		checkbook.Status != models.CheckbookStatusSubmissionFailed {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "InvalidStatus",
			"message": fmt.Sprintf("Invalid status '%s'. Only checkbooks with 'ready_for_commitment', 'proof_failed', or 'submission_failed' status can create allocations. Current status: '%s'. If status is 'with_checkbook', commitment is already confirmed on-chain and cannot be modified.", checkbook.Status, checkbook.Status),
		})
		return
	}

	// Start database transaction
	tx := db.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Delete existing checks (if any)
	log.Printf("🗑️ Deleting existing checks for checkbook_id=%s", checkbook.ID)
	if err := tx.Where("checkbook_id = ?", checkbook.ID).Delete(&models.Check{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DatabaseError",
			"message": "Failed to delete existing checks: " + err.Error(),
		})
		return
	}

	// Generate nullifier for each allocation if commitment is provided
	// Nullifier = keccak256(commitment || seq || amount)
	// Matching SDK logic: CommitmentCore.generateNullifier
	// IMPORTANT: Use Checkbook's commitment first, fallback to request if checkbook doesn't have one yet
	var commitmentHash common.Hash
	hasCommitment := false

	// Priority 1: Use Checkbook's commitment (from database, set after ZKVM proof generation)
	// ⚠️ WARNING: This commitment may be based on OLD allocations. If allocations have changed,
	// the commitment will be different when ZKVM generates the proof, causing nullifier mismatch.
	if checkbook.Commitment != nil && *checkbook.Commitment != "" {
		commitmentHash = common.HexToHash(*checkbook.Commitment)
		hasCommitment = commitmentHash != (common.Hash{})
		if hasCommitment {
			log.Printf("🔑 Using Checkbook's commitment from database: %s", commitmentHash.Hex())
			log.Printf("⚠️  WARNING: This commitment may be based on OLD allocations. If allocations have changed,")
			log.Printf("   the commitment calculated by ZKVM will be different, causing nullifier mismatch.")
			log.Printf("   Solution: Use /api/commitments/submit endpoint which will recalculate commitment with current allocations.")
		}
	}

	// Priority 2: Fallback to request commitment (for backward compatibility or when checkbook doesn't have commitment yet)
	if !hasCommitment && len(req.Commitments) > 0 && req.Commitments[0] != "" {
		commitmentHash = common.HexToHash(req.Commitments[0])
		hasCommitment = commitmentHash != (common.Hash{})
		if hasCommitment {
			log.Printf("🔑 Using commitment from request (checkbook has no commitment yet): %s", commitmentHash.Hex())
		} else {
			log.Printf("⚠️ Invalid commitment hash in request, nullifier will be NULL")
		}
	}

	if !hasCommitment {
		log.Printf("⚠️ No commitment available (neither from checkbook nor request), nullifier will be NULL")
		log.Printf("   Note: Nullifier will be set after ZKVM proof generation")
	}

	// Create new checks (allocations)
	log.Printf("📝 Creating %d checks (allocations)", len(req.Amounts))
	var checks []models.Check
	for i, amount := range req.Amounts {
		recipient := models.UniversalAddress{
			SLIP44ChainID: checkbook.UserAddress.SLIP44ChainID,
			Data:          ownerAddress,
		}

		// Generate nullifier if commitment is available
		// Matching lib.rs: generate_nullifier(commitment, allocation)
		// Formula: keccak256(commitment[32 bytes] || seq[1 byte] || amount[32 bytes])
		var nullifier string
		if hasCommitment {
			// Convert amount to big.Int and then to 32 bytes (U256 big-endian)
			amountBig, ok := new(big.Int).SetString(amount, 10)
			if !ok {
				log.Printf("⚠️ Failed to parse amount %s, nullifier will be NULL", amount)
				nullifier = "" // Will be NULL in database
			} else {
				// Prepare data exactly as lib.rs does:
				// 1. commitment (32 bytes)
				// 2. seq (1 byte, u8)
				// 3. amount (32 bytes, U256 big-endian)
				seqByte := byte(i) // seq is u8 (0-255)
				amountBytes := make([]byte, 32)
				amountBig.FillBytes(amountBytes) // Big-endian encoding (U256)

				// Build data: commitment || seq || amount
				// This matches lib.rs: hasher.update(commitment); hasher.update(&[seq]); hasher.update(&amount);
				data := make([]byte, 0, 65) // 32 + 1 + 32 = 65 bytes
				data = append(data, commitmentHash.Bytes()...)
				data = append(data, seqByte)
				data = append(data, amountBytes...)

				// Compute keccak256 hash (matches Rust Keccak256::finalize())
				hash := crypto.Keccak256(data)
				nullifier = "0x" + common.Bytes2Hex(hash)
				log.Printf("   [%d] Generated nullifier - Commitment: %s, Seq: %d, Amount: %s, Nullifier: %s",
					i+1, commitmentHash.Hex(), i, amount, nullifier)
			}
		}

		check := models.Check{
			ID:          uuid.New().String(),
			CheckbookID: checkbook.ID,
			Seq:         uint8(i), // Sequence number (0-255), required field
			Amount:      amount,
			Recipient:   recipient,
			Nullifier:   nullifier, // Generated from commitment if available, otherwise empty (NULL in DB)
			RequestID:   nil,
			Status:      models.AllocationStatusPending, // Will be updated after ZKVM proof
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		checks = append(checks, check)
		log.Printf("   [%d] ID=%s, Seq=%d, Amount=%s, Recipient=%s, Nullifier=%s", i+1, check.ID, check.Seq, amount, ownerAddress, nullifier)
	}

	// Save checks to database
	// If nullifier is empty string, it will be NULL in database (due to unique constraint)
	if err := tx.Create(&checks).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to create checks: %v", err)
		log.Printf("   Attempted to create %d checks", len(checks))
		for i, check := range checks {
			log.Printf("   Check[%d]: ID=%s, Seq=%d, CheckbookID=%s, Amount=%s, Status=%s",
				i, check.ID, check.Seq, check.CheckbookID, check.Amount, check.Status)
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DatabaseError",
			"message": "Failed to create checks: " + err.Error(),
		})
		return
	}
	if hasCommitment {
		log.Printf("✅ Successfully created %d checks in database (nullifier generated from commitment)", len(checks))
	} else {
		log.Printf("✅ Successfully created %d checks in database (nullifier set to NULL)", len(checks))
	}

	// Update checkbook status to signaturing (proving)
	log.Printf("🔄 Updating checkbook status to 'signaturing'")
	if err := tx.Model(&checkbook).Update("status", models.CheckbookStatusSignaturing).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to update checkbook status: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DatabaseError",
			"message": "Failed to update checkbook status: " + err.Error(),
		})
		return
	}
	log.Printf("✅ Checkbook status updated to 'signaturing'")

	// Commit transaction
	log.Printf("💾 Committing transaction...")
	if err := tx.Commit().Error; err != nil {
		log.Printf("❌ Failed to commit transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DatabaseError",
			"message": "Failed to commit transaction: " + err.Error(),
		})
		return
	}
	log.Printf("✅ Transaction committed successfully")

	// Reload checkbook to get updated status
	if err := db.DB.First(&checkbook, "id = ?", checkbook.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DatabaseError",
			"message": "Failed to reload checkbook: " + err.Error(),
		})
		return
	}

	log.Printf("✅ Successfully created %d allocations for checkbook %s", len(checks), checkbook.ID)

	// ⚠️ NOTE: This handler only creates allocations and updates checkbook status to 'signaturing'
	// It does NOT call ZKVM service to generate proof or submit commitment to blockchain
	// The ZKVM proof generation should be handled by a separate endpoint (/api/commitments/submit)
	// or by a background job that processes checkbooks with 'signaturing' status
	log.Printf("⚠️  [CreateAllocationsHandler] Allocations created, but ZKVM proof generation NOT triggered")
	log.Printf("   → Allocations are in 'pending' status")
	log.Printf("   → Checkbook status is 'signaturing'")
	log.Printf("   → ZKVM proof generation should be handled separately")
	log.Printf("   → Allocations status will change to 'idle' after ZKVM proof is generated")

	// Return response in the format expected by frontend SDK
	// Backend uses snake_case (Go standard), frontend will convert to camelCase
	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"allocations": checks,
		"checkbook":   checkbook,
	})
}

// SearchAllocationsRequest represents the request body for POST /api/allocations/search
type SearchAllocationsRequest struct {
	ChainSLIP44ID uint32   `json:"chain_slip44_id" binding:"required"`
	Addresses     []string `json:"addresses" binding:"required"`
	Status        string   `json:"status"`     // Optional: idle, pending, used
	TokenKeys     []string `json:"token_keys"` // Optional: filter by token keys (e.g., ["USDT", "USDC"])
}

// SearchAllocationsHandler handles POST /api/allocations/search
// Allows querying allocations by chain_id and list of depositor addresses
// Finds checkbooks by depositor addresses, then returns all allocations from those checkbooks
// Secured by IP whitelist (configured in router)
func SearchAllocationsHandler(c *gin.Context) {
	var req SearchAllocationsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body",
			"message": err.Error(),
		})
		return
	}

	if len(req.Addresses) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    []gin.H{},
		})
		return
	}

	// Validate status if provided
	if req.Status != "" {
		validStatuses := map[string]bool{
			"idle":    true,
			"pending": true,
			"used":    true,
		}
		if !validStatuses[req.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status. Must be: idle, pending, or used"})
			return
		}
	}

	// Convert addresses to Universal Address Data format (32-byte hex)
	// We need to match what is stored in user_data column (depositor address in checkbooks)
	var targetData []string
	for _, addr := range req.Addresses {
		// Normalize (add 0x, lowercase, etc.)
		normalized := utils.NormalizeAddressForChain(addr, int(req.ChainSLIP44ID))

		// Check if already in 32-byte Universal Address format
		var universalData string
		var err error

		if utils.IsUniversalAddress(normalized) {
			// Already 32-byte Universal Address format - use directly
			universalData = normalized
		} else if req.ChainSLIP44ID == 195 { // TRON
			// TRON address conversion
			if utils.IsTronAddress(normalized) {
				universalData, err = utils.TronToUniversalAddress(normalized)
			} else if utils.IsEvmAddress(normalized) {
				// EVM format on TRON chain - convert to Universal Address
				universalData, err = utils.EvmToUniversalAddress(normalized)
			} else {
				err = fmt.Errorf("unsupported address format for TRON chain")
			}
		} else {
			// EVM chains - convert 20-byte to 32-byte
			if utils.IsEvmAddress(normalized) {
				universalData, err = utils.EvmToUniversalAddress(normalized)
			} else {
				err = fmt.Errorf("unsupported address format for EVM chain")
			}
		}

		if err == nil && universalData != "" {
			targetData = append(targetData, universalData)
		} else {
			log.Printf("⚠️ [SearchAllocations] Failed to convert address %s for chain %d: %v", addr, req.ChainSLIP44ID, err)
		}
	}

	if len(targetData) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    []gin.H{},
		})
		return
	}

	// Step 1: Find checkbooks by depositor addresses (user_data and user_chain_id)
	var checkbookIDs []string
	checkbookQuery := db.DB.Model(&models.Checkbook{}).
		Where("user_chain_id = ?", req.ChainSLIP44ID)

	// Build address filter - use LOWER for case-insensitive matching
	if req.ChainSLIP44ID == 195 {
		// TRON: exact match, case sensitive
		checkbookQuery = checkbookQuery.Where("user_data IN ?", targetData)
	} else {
		// EVM: case insensitive query - convert targetData to lowercase for comparison
		lowerTargetData := make([]string, len(targetData))
		for i, addr := range targetData {
			lowerTargetData[i] = strings.ToLower(addr)
		}
		// Use OR conditions for case-insensitive matching
		checkbookQuery = checkbookQuery.Where("LOWER(user_data) IN ?", lowerTargetData)
	}

	// Filter by token_keys if provided
	if len(req.TokenKeys) > 0 {
		checkbookQuery = checkbookQuery.Where("token_key IN ?", req.TokenKeys)
		log.Printf("🔍 [SearchAllocations] Filtering by token_keys: %v", req.TokenKeys)
	}

	var checkbooks []models.Checkbook
	if err := checkbookQuery.Select("id").Find(&checkbooks).Error; err != nil {
		log.Printf("❌ Failed to find checkbooks: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Database error",
			"message": err.Error(),
		})
		return
	}

	for _, cb := range checkbooks {
		checkbookIDs = append(checkbookIDs, cb.ID)
	}

	if len(checkbookIDs) == 0 {
		log.Printf("ℹ️ [SearchAllocations] No checkbooks found for addresses: %v", req.Addresses)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    []gin.H{},
			"count":   0,
		})
		return
	}

	log.Printf("✅ [SearchAllocations] Found %d checkbooks for addresses", len(checkbookIDs))

	// Step 2: Find all allocations from these checkbooks
	// For idle allocations, we need to join checkbooks to verify status is "with_checkbook"
	needsJoin := req.Status == "idle"
	query := db.DB.Model(&models.Check{}).
		Where("checkbook_id IN ?", checkbookIDs)

	if needsJoin {
		query = query.Joins("JOIN checkbooks ON checks.checkbook_id = checkbooks.id")
	}

	// Filter by status if provided
	if req.Status != "" {
		// Use table prefix when JOIN is present, otherwise use field name directly
		if needsJoin {
			query = query.Where("checks.status = ?", req.Status)
		} else {
			query = query.Where("status = ?", req.Status)
		}
	}

	// For idle allocations, only return those from checkbooks with status "with_checkbook"
	// This ensures allocations are only returned after CommitmentRootUpdated event is received
	if req.Status == "idle" {
		query = query.Where("checkbooks.status = ?", models.CheckbookStatusWithCheckbook)
	}

	// Execute query
	var allocations []models.Check
	if err := query.Order("created_at DESC").Find(&allocations).Error; err != nil {
		log.Printf("❌ Failed to search allocations: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Database error",
			"message": err.Error(),
		})
		return
	}

	// Prepare response (similar to ListAllocationsHandler but simplified structure if needed)
	// We'll reuse the enrichment logic from ListAllocationsHandler to provide useful info like token, checkbook, etc.

	allocationData := make([]gin.H, 0, len(allocations))
	checkbookCache := make(map[string]*models.Checkbook) // Cache checkbooks to avoid repeated queries
	tokenCache := make(map[string]gin.H)                 // Cache token info by key: tokenAddress_chainId

	// Pre-fetch checkbooks (we already have checkbookIDs from above, but we need to fetch full checkbook data)
	if len(checkbookIDs) > 0 {
		var checkbooks []models.Checkbook
		if err := db.DB.Where("id IN ?", checkbookIDs).Find(&checkbooks).Error; err == nil {
			for i := range checkbooks {
				checkbookCache[checkbooks[i].ID] = &checkbooks[i]
			}
		}
	}

	for _, allocation := range allocations {
		checkbook := checkbookCache[allocation.CheckbookID]

		allocationJSON := gin.H{
			"id":           allocation.ID,
			"checkbook_id": allocation.CheckbookID,
			"seq":          allocation.Seq,
			"amount":       allocation.Amount,
			"status":       allocation.Status,
			"nullifier":    allocation.Nullifier,
			"created_at":   allocation.CreatedAt,
			"updated_at":   allocation.UpdatedAt,
		}

		// Add commitment if available
		if checkbook != nil && checkbook.Commitment != nil {
			allocationJSON["commitment"] = *checkbook.Commitment
		}

		// Add checkbook information (especially local_deposit_id and user address)
		if checkbook != nil {
			checkbookInfo := gin.H{
				"id":               checkbook.ID,
				"local_deposit_id": checkbook.LocalDepositID,
				"slip44_chain_id":  checkbook.SLIP44ChainID,
				"token_key":        checkbook.TokenKey,
				"token_address":    checkbook.TokenAddress,
			}
			// Add user address (depositor address) from checkbook
			if checkbook.UserAddress.Data != "" {
				checkbookInfo["user_address"] = gin.H{
					"slip44_chain_id": checkbook.UserAddress.SLIP44ChainID,
					"data":            checkbook.UserAddress.Data, // 32-byte Universal Address
				}
			}
			allocationJSON["checkbook"] = checkbookInfo
		}

		// Get token information
		var tokenInfo gin.H
		if checkbook != nil && checkbook.TokenAddress != "" {
			// Check cache first
			tokenKey := fmt.Sprintf("%s_%d", strings.ToLower(checkbook.TokenAddress), checkbook.SLIP44ChainID)
			if cached, exists := tokenCache[tokenKey]; exists {
				tokenInfo = cached
			} else {
				// Query IntentRawToken table
				var rawToken models.IntentRawToken
				err := db.DB.Where("token_address = ? AND chain_id = ? AND is_active = ?",
					strings.ToLower(checkbook.TokenAddress),
					checkbook.SLIP44ChainID,
					true).First(&rawToken).Error
				if err == nil {
					tokenInfo = gin.H{
						"id":         checkbook.TokenKey, // Use TokenKey as ID
						"symbol":     rawToken.Symbol,
						"name":       rawToken.Name,
						"decimals":   rawToken.Decimals,
						"address":    rawToken.TokenAddress,
						"chain_id":   rawToken.ChainID,
						"chain_name": rawToken.ChainName,
						"is_active":  rawToken.IsActive,
					}
				} else {
					// Fallback token info
					tokenInfo = gin.H{
						"id":        checkbook.TokenKey, // Use TokenKey as ID
						"symbol":    checkbook.TokenKey,
						"name":      checkbook.TokenKey,
						"decimals":  18,
						"address":   checkbook.TokenAddress,
						"chain_id":  checkbook.SLIP44ChainID,
						"is_active": false,
					}
				}
				tokenCache[tokenKey] = tokenInfo
			}
		} else if checkbook != nil {
			// No token address, create minimal token info
			tokenInfo = gin.H{
				"id":        checkbook.TokenKey, // Use TokenKey as ID
				"symbol":    checkbook.TokenKey,
				"name":      checkbook.TokenKey,
				"decimals":  18,
				"chain_id":  checkbook.SLIP44ChainID,
				"is_active": false,
			}
		}

		if tokenInfo != nil {
			allocationJSON["token"] = tokenInfo
		}

		// Add recipient if available (legacy field)
		if allocation.Recipient.Data != "" {
			allocationJSON["recipient"] = gin.H{
				"chain_id": allocation.Recipient.SLIP44ChainID,
				"address":  allocation.Recipient.Data,
			}
		}

		// Add token_id if available (legacy field)
		if allocation.TokenID > 0 {
			allocationJSON["token_id"] = allocation.TokenID
		}

		allocationData = append(allocationData, allocationJSON)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    allocationData,
		"count":   len(allocationData),
	})
}
