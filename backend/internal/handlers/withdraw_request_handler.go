// Withdraw Request Handlers - User-facing queries (authentication required)
//
//	WithdrawRequest （need）
package handlers

import (
	"context"
	"fmt"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/repository"
	"go-backend/internal/services"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// convertChainIDToUint32 safely converts chainID from interface{} to uint32
// Handles both int and float64 types (JSON unmarshaling can produce either)
func convertChainIDToUint32(chainID interface{}) (uint32, error) {
	switch v := chainID.(type) {
	case int:
		return uint32(v), nil
	case int32:
		return uint32(v), nil
	case int64:
		return uint32(v), nil
	case uint32:
		return v, nil
	case uint64:
		return uint32(v), nil
	case float32:
		return uint32(v), nil
	case float64:
		return uint32(v), nil
	default:
		return 0, fmt.Errorf("unsupported chainID type: %T", chainID)
	}
}

// WithdrawRequestHandler handles user withdraw request queries
type WithdrawRequestHandler struct {
	db              *gorm.DB
	repo            repository.WithdrawRequestRepository
	withdrawService *services.WithdrawRequestService // Intent system service
}

// NewWithdrawRequestHandler creates a new WithdrawRequestHandler instance
func NewWithdrawRequestHandler(repo repository.WithdrawRequestRepository, service *services.WithdrawRequestService) *WithdrawRequestHandler {
	return &WithdrawRequestHandler{
		db:              db.DB,
		repo:            repo,
		withdrawService: service,
	}
}

// ============================================================================
// User Withdraw Request Queries ()
// ============================================================================

// ListMyWithdrawRequestsHandler lists withdraw requests created by the authenticated user
// GET /api/v2/my/withdraw-requests
func (h *WithdrawRequestHandler) ListMyWithdrawRequestsHandler(c *gin.Context) {
	// Get authenticated user from context (set by auth middleware)
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chain ID not found in auth context"})
		return
	}

	// Query parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status") // pending, verified, executed

	// use Repository
	ctx := context.Background()
	chainIDUint, err := convertChainIDToUint32(chainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID", "details": err.Error()})
		return
	}

	// Use universal_address from JWT if available (32-byte format), otherwise convert user_address
	// WithdrawRequest stores owner_data as 32-byte Universal Address, so we need to match that format
	var ownerData string
	universalAddress, hasUniversal := c.Get("universal_address")
	if hasUniversal {
		// Middleware already parsed universal_address to pure address format (0x...)
		if universalAddrStr, ok := universalAddress.(string); ok && universalAddrStr != "" {
			ownerData = strings.ToLower(universalAddrStr)
		}
	}

	// Fallback: convert 20-byte EVM address to 32-byte Universal Address format
	if ownerData == "" {
		userAddrStr := userAddress.(string)
		// Convert 20-byte address to 32-byte Universal Address format
		// Format: 0x + 12 zeros + 20-byte address = 0x000000000000000000000000 + address[2:]
		if strings.HasPrefix(userAddrStr, "0x") && len(userAddrStr) == 42 {
			// 20-byte address: pad with 12 zeros (24 hex chars) to make 32-byte
			ownerData = "0x000000000000000000000000" + userAddrStr[2:]
		} else {
			// Use as-is if format is unexpected
			ownerData = strings.ToLower(userAddrStr)
		}
	}

	requests, total, err := h.repo.FindByOwner(ctx, chainIDUint, ownerData, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch withdraw requests", "details": err.Error()})
		return
	}

	//  status，need（ Repository  status ）
	//  Repository ，
	if status != "" {
		// Initialize as empty slice to ensure JSON serializes as [] instead of null
		filtered := make([]models.WithdrawRequest, 0)
		if requests != nil {
			for _, req := range requests {
				if req != nil && req.Status == status {
					filtered = append(filtered, *req)
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    filtered,
			"pagination": gin.H{
				"page":        page,
				"page_size":   pageSize,
				"total":       int64(len(filtered)),
				"total_pages": (int64(len(filtered)) + int64(pageSize) - 1) / int64(pageSize),
			},
		})
		return
	}

	//  WithdrawRequest
	// Initialize as empty slice to ensure JSON serializes as [] instead of null
	results := make([]models.WithdrawRequest, 0)
	if requests != nil {
		for _, req := range requests {
			if req != nil {
				results = append(results, *req)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    results,
		"pagination": gin.H{
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
		},
	})
}

// GetMyWithdrawRequestHandler gets a single withdraw request by ID
// GET /api/v2/my/withdraw-requests/:id
func (h *WithdrawRequestHandler) GetMyWithdrawRequestHandler(c *gin.Context) {
	// Get authenticated user from context
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Try to get universal_address from context (preferred for comparison)
	universalAddress, hasUniversal := c.Get("universal_address")

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chain ID not found in auth context"})
		return
	}

	requestID := c.Param("id")

	// use Repository
	ctx := context.Background()
	request, err := h.repo.GetByID(ctx, requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	chainIDUint, err := convertChainIDToUint32(chainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID", "details": err.Error()})
		return
	}

	// Compare chain ID
	if request.OwnerAddress.SLIP44ChainID != chainIDUint {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	// Compare address: prefer universal_address if available, otherwise use user_address
	// request.OwnerAddress.Data is 32-byte Universal Address (from checkbook.UserAddress)
	// universalAddress from context is already parsed by middleware (pure address without chainId prefix)
	// userAddress from JWT is 20-byte EVM address (needs conversion)
	var addressMatch bool
	if hasUniversal {
		// Use universal_address for comparison (both are 32-byte Universal Address)
		// Middleware already extracted the pure address part, so we can use it directly
		universalAddrStr := universalAddress.(string)

		// Normalize: remove 0x prefix and compare lowercase
		normalizedUniversal := strings.ToLower(strings.TrimPrefix(universalAddrStr, "0x"))
		normalizedOwnerData := strings.ToLower(strings.TrimPrefix(request.OwnerAddress.Data, "0x"))

		// Debug logging
		log.Printf("🔍 [GetMyWithdrawRequest] Address comparison:")
		log.Printf("   JWT universal_address (from context): %s", universalAddrStr)
		log.Printf("   Request OwnerAddress.Data: %s", request.OwnerAddress.Data)
		log.Printf("   Normalized JWT: %s", normalizedUniversal)
		log.Printf("   Normalized Owner: %s", normalizedOwnerData)

		addressMatch = normalizedUniversal == normalizedOwnerData
		log.Printf("   Match result: %v", addressMatch)
	} else {
		// Fallback: convert user_address to Universal Address format for comparison
		// This should not happen in normal flow, but handle it for backward compatibility
		userAddrStr := userAddress.(string)
		normalizedUserAddr := strings.ToLower(strings.TrimPrefix(userAddrStr, "0x"))
		normalizedOwnerData := strings.ToLower(strings.TrimPrefix(request.OwnerAddress.Data, "0x"))

		// Debug logging
		log.Printf("🔍 [GetMyWithdrawRequest] Address comparison (fallback):")
		log.Printf("   JWT user_address: %s", userAddrStr)
		log.Printf("   Request OwnerAddress.Data: %s", request.OwnerAddress.Data)
		log.Printf("   Normalized JWT: %s", normalizedUserAddr)
		log.Printf("   Normalized Owner: %s", normalizedOwnerData)

		// Check if owner data ends with user address (32-byte Universal Address has 20-byte EVM address at the end)
		addressMatch = strings.HasSuffix(normalizedOwnerData, normalizedUserAddr)
		log.Printf("   Match result (suffix check): %v", addressMatch)
	}

	if !addressMatch {
		log.Printf("❌ [GetMyWithdrawRequest] Address mismatch - request not found or access denied")
		log.Printf("   Request ID: %s", requestID)
		log.Printf("   Owner Chain ID: %d, JWT Chain ID: %d", request.OwnerAddress.SLIP44ChainID, chainIDUint)
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	log.Printf("✅ [GetMyWithdrawRequest] Address match - returning request: %s", requestID)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    request,
	})
}

// GetMyWithdrawRequestByNullifierHandler gets a withdraw request by nullifier
// GET /api/v2/my/withdraw-requests/by-nullifier/:nullifier
func (h *WithdrawRequestHandler) GetMyWithdrawRequestByNullifierHandler(c *gin.Context) {
	// Get authenticated user from context
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chain ID not found in auth context"})
		return
	}

	nullifier := c.Param("nullifier")

	// use Repository
	ctx := context.Background()
	request, err := h.repo.GetByNullifier(ctx, nullifier)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	chainIDUint, err := convertChainIDToUint32(chainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID", "details": err.Error()})
		return
	}
	if request.OwnerAddress.SLIP44ChainID != chainIDUint || request.OwnerAddress.Data != userAddress.(string) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    request,
	})
}

// ============================================================================
// Retry Operations (retry)
// ============================================================================

// RetryWithdrawRequestHandler retries a failed/pending withdraw request
// POST /api/v2/my/withdraw-requests/:id/retry
func (h *WithdrawRequestHandler) RetryWithdrawRequestHandler(c *gin.Context) {
	// Get authenticated user from context
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chain ID not found in auth context"})
		return
	}

	requestID := c.Param("id")

	// use Repository
	ctx := context.Background()
	request, err := h.repo.GetByID(ctx, requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	chainIDUint, err := convertChainIDToUint32(chainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID", "details": err.Error()})
		return
	}
	if request.OwnerAddress.SLIP44ChainID != chainIDUint || request.OwnerAddress.Data != userAddress.(string) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	// Check if the request can be retried
	if request.Status != "pending" && request.Status != "failed" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Withdraw request cannot be retried",
			"details": "Only pending or failed requests can be retried",
			"status":  request.Status,
		})
		return
	}

	// TODO: Implement actual retry logic
	// This would typically involve:
	// 1. Re-submitting the transaction to the blockchain
	// 2. Updating the status to "retrying" or "pending"
	// 3. Triggering the blockchain service to process it again

	// use Repository
	err = h.repo.UpdateStatus(ctx, requestID, "pending")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retry withdraw request", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Withdraw request retry initiated",
		"data": gin.H{
			"request_id": requestID,
			"status":     "pending",
		},
	})
}

// ============================================================================
// Delete Operations ()
// ============================================================================

// DeleteMyWithdrawRequestHandler deletes a withdraw request (hard delete from database)
// DELETE /api/v2/my/withdraw-requests/:id
func (h *WithdrawRequestHandler) DeleteMyWithdrawRequestHandler(c *gin.Context) {
	// Get authenticated user from context
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chain ID not found in auth context"})
		return
	}

	requestID := c.Param("id")

	// Fetch the withdraw request to verify ownership
	var request models.WithdrawRequest
	err := h.db.Where("id = ? AND owner_chain_id = ? AND owner_data = ?",
		requestID, chainID, userAddress).First(&request).Error

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	// Check if the request can be deleted
	// Allow deletion of:
	// - pending: pending requests
	// - failed: failed requests
	// - completed: completed requests (all stages completed)
	// - completed_with_hook_failed: completed but hook failed requests
	allowedStatuses := []string{"pending", "failed", "completed", "completed_with_hook_failed"}
	isAllowed := false
	for _, status := range allowedStatuses {
		if request.Status == status {
			isAllowed = true
			break
		}
	}
	if !isAllowed {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Withdraw request cannot be deleted",
			"details": "Only pending, failed, completed, or completed_with_hook_failed requests can be deleted",
			"status":  request.Status,
		})
		return
	}

	ctx := context.Background()

	// For completed requests, delete directly without affecting Allocation status
	// Allocation status should remain as "used" since the withdrawal was successful
	completedStatuses := []string{"completed", "completed_with_hook_failed"}
	isCompleted := false
	for _, status := range completedStatuses {
		if request.Status == status {
			isCompleted = true
			break
		}
	}

	if isCompleted {
		// Delete completed requests directly - Allocation status should not change (remains "used")
		err = h.repo.Delete(ctx, requestID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete withdraw request", "details": err.Error()})
			return
		}
	} else {
		// For pending/failed requests, use CancelWithdrawRequest service to properly release allocations
		// This ensures Allocation status is correctly updated (pending -> idle)
		if err := h.withdrawService.CancelWithdrawRequest(ctx, requestID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// After cancelling, delete the request
		err = h.repo.Delete(ctx, requestID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete withdraw request", "details": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Withdraw request deleted successfully",
		"data": gin.H{
			"request_id": requestID,
		},
	})
}

// ============================================================================
// Statistics ()
// ============================================================================

// GetMyWithdrawStatsHandler gets withdraw statistics for the authenticated user
// GET /api/v2/my/withdraw-requests/stats
func (h *WithdrawRequestHandler) GetMyWithdrawStatsHandler(c *gin.Context) {
	// Get authenticated user from context
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chain ID not found in auth context"})
		return
	}

	// Count by status
	type StatusCount struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
	}

	var statusCounts []StatusCount
	h.db.Model(&models.WithdrawRequest{}).
		Select("status, COUNT(*) as count").
		Where("owner_chain_id = ? AND owner_data = ?", chainID, userAddress).
		Group("status").
		Find(&statusCounts)

	// Calculate total amount
	var totalAmount struct {
		Total string `json:"total"`
	}
	h.db.Model(&models.WithdrawRequest{}).
		Select("COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total").
		Where("owner_chain_id = ? AND owner_data = ? AND status = ?", chainID, userAddress, "executed").
		Scan(&totalAmount)

	// Total count
	var totalCount int64
	h.db.Model(&models.WithdrawRequest{}).
		Where("owner_chain_id = ? AND owner_data = ?", chainID, userAddress).
		Count(&totalCount)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"total_requests":         totalCount,
			"total_amount_withdrawn": totalAmount.Total,
			"status_breakdown":       statusCounts,
		},
	})
}

// ============================================================================
// Intent System API Endpoints
// ============================================================================

// CreateWithdrawRequestIntent represents the intent part of CreateWithdrawRequestRequest
// Extracted as separate type to fix Gin binding validation for nested structs
// Updated to match new Intent definition:
// - RawToken: { beneficiary, token_symbol } - removed token_contract
// - AssetToken: { asset_id, beneficiary, asset_token_symbol } - removed preferred_chain
type CreateWithdrawRequestIntent struct {
	Type               uint8  `json:"type"` // 0=RawToken, 1=AssetToken (validate manually to allow 0 value)
	BeneficiaryChainID uint32 `json:"beneficiaryChainId" binding:"required"`
	BeneficiaryAddress string `json:"beneficiaryAddress" binding:"required"` // 32-byte Universal Address (hex without 0x prefix)

	// For RawToken (type = 0):
	// token_contract removed - no longer part of Intent

	// For AssetToken (type = 1):
	AssetID string `json:"assetId"` // 32-byte Asset ID (required for AssetToken)
	// preferred_chain removed - no longer part of Intent

	// Common field (used for both RawToken and AssetToken):
	TokenSymbol string `json:"tokenSymbol" binding:"required"` // Token symbol (RawToken: e.g., "USDT", AssetToken: e.g., "aUSDT")
}

// CreateWithdrawRequestRequest request body for creating a withdraw request
// Note: Intent format matches ZKVM program input requirements
type CreateWithdrawRequestRequest struct {
	AllocationIDs []string                    `json:"allocations" binding:"required"`
	Intent        CreateWithdrawRequestIntent `json:"intent" binding:"required"`
	Signature     string                      `json:"signature" binding:"required"` // User signature for ZKVM proof generation
	ChainID       uint32                      `json:"chainId" binding:"required"`   // Chain ID for signature (SLIP-44)
}

// CreateWithdrawRequestHandler creates a new withdraw request (Intent system)
// POST /api/v1/withdrawals
func (h *WithdrawRequestHandler) CreateWithdrawRequestHandler(c *gin.Context) {
	var req CreateWithdrawRequestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Log detailed error for debugging
		log.Printf("❌ [DEBUG] Binding error: %v", err)
		log.Printf("🔍 [DEBUG] Request Intent after binding: Type=%d, TokenSymbol=%s, AssetID=%s",
			req.Intent.Type, req.Intent.TokenSymbol, req.Intent.AssetID)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Manual validation for Type field (Gin binding has issues with 0 values for uint8)
	// Check if type field was actually provided by checking if it's in the valid range
	// Note: uint8 default is 0, so we can't distinguish between "not provided" and "provided as 0"
	// We'll rely on the fact that if other required fields are present, type should be too
	if req.Intent.Type != 0 && req.Intent.Type != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "intent.type must be 0 (RawToken) or 1 (AssetToken)"})
		return
	}

	intentTypeValue := req.Intent.Type
	log.Printf("✅ [DEBUG] Request parsed successfully: Intent.Type=%d, Intent.TokenSymbol=%s", intentTypeValue, req.Intent.TokenSymbol)

	// Build Intent object
	intent := models.Intent{
		Type: models.IntentType(intentTypeValue),
		Beneficiary: models.UniversalAddress{
			SLIP44ChainID: req.Intent.BeneficiaryChainID,
			Data:          req.Intent.BeneficiaryAddress,
		},
		TokenSymbol: req.Intent.TokenSymbol, // Common: token symbol (RawToken: "USDT", AssetToken: "aUSDT")
		AssetID:     req.Intent.AssetID,     // For AssetToken
	}

	// Create withdraw request
	request, err := h.withdrawService.CreateWithdrawRequest(c.Request.Context(), &services.CreateWithdrawRequestInput{
		AllocationIDs: req.AllocationIDs,
		Intent:        intent,
		Signature:     req.Signature,
		ChainID:       req.ChainID,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    request,
	})
}

// SubmitProofRequest request body for submitting proof
type SubmitProofRequest struct {
	Proof        string `json:"proof" binding:"required"`
	PublicValues string `json:"publicValues" binding:"required"`
}

// SubmitProofHandler submits ZK proof for a withdraw request
// POST /api/v1/withdrawals/:id/proof
//
// This is the ONLY API call the frontend needs to make after creating a withdraw request.
// The backend will automatically:
// 1. Save the ZK proof (Stage 1)
// 2. Execute on-chain verification (Stage 2)
// 3. Process payout (Stage 3 - triggered by event listener)
// 4. Process hook if needed (Stage 4 - triggered by event listener)
func (h *WithdrawRequestHandler) SubmitProofHandler(c *gin.Context) {
	requestID := c.Param("id")

	var req SubmitProofRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.withdrawService.SubmitProof(c.Request.Context(), requestID, req.Proof, req.PublicValues); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Proof submitted and on-chain verification initiated",
	})
}

// ExecuteWithdrawHandler executes on-chain verification
// POST /api/v1/withdrawals/:id/execute
//
// Use cases:
// 1. **Manual retry**: When auto-execution after SubmitProof fails with execute_status = 'submit_failed'
// 2. **RPC/Network errors**: Can retry when submission failed due to network issues
// 3. **Testing/debugging**: For internal use
//
// Important:
// - Only execute_status = 'submit_failed' can be retried (RPC/network errors)
// - execute_status = 'verify_failed' CANNOT be retried (proof invalid, must cancel request)
// - ExecuteWithdraw is automatically triggered after SubmitProof succeeds
//
// Error types:
// - submit_failed: RPC/network errors → Can retry with this endpoint
// - verify_failed: Proof invalid or nullifier already used → Must call DELETE /withdrawals/:id to cancel
func (h *WithdrawRequestHandler) ExecuteWithdrawHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.ExecuteWithdraw(c.Request.Context(), requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Execute withdraw submitted successfully",
	})
}

// RetryPayoutHandler manually retries payout
// POST /api/v1/withdrawals/:id/retry-payout
func (h *WithdrawRequestHandler) RetryPayoutHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.RetryPayout(c.Request.Context(), requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Payout retry initiated",
	})
}

// RetryHookHandler manually retries Hook purchase
// POST /api/v1/withdrawals/:id/retry-hook
func (h *WithdrawRequestHandler) RetryHookHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.RetryHook(c.Request.Context(), requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Hook retry initiated",
	})
}

// RetryFallbackHandler retries a failed fallback transfer
// POST /api/v2/my/withdraw-requests/:id/retry-fallback
func (h *WithdrawRequestHandler) RetryFallbackHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.RetryFallback(c.Request.Context(), requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Fallback retry requested successfully",
	})
}

// CancelWithdrawRequestHandler cancels a withdraw request
// DELETE /api/my/withdraw-requests/:id
func (h *WithdrawRequestHandler) CancelWithdrawRequestHandler(c *gin.Context) {
	// Get authenticated user from context
	userAddress, exists := c.Get("user_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Try to get universal_address from context (preferred for comparison)
	universalAddress, hasUniversal := c.Get("universal_address")

	chainID, exists := c.Get("chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chain ID not found in auth context"})
		return
	}

	requestID := c.Param("id")

	// Get the request to verify ownership
	ctx := context.Background()
	request, err := h.repo.GetByID(ctx, requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	chainIDUint, err := convertChainIDToUint32(chainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID", "details": err.Error()})
		return
	}

	// Compare chain ID
	if request.OwnerAddress.SLIP44ChainID != chainIDUint {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	// Compare address: prefer universal_address if available, otherwise use user_address
	var addressMatch bool
	if hasUniversal {
		// Use universal_address for comparison (both are 32-byte Universal Address)
		universalAddrStr := universalAddress.(string)

		// Normalize: remove 0x prefix and compare lowercase
		normalizedUniversal := strings.ToLower(strings.TrimPrefix(universalAddrStr, "0x"))
		normalizedOwnerData := strings.ToLower(strings.TrimPrefix(request.OwnerAddress.Data, "0x"))

		addressMatch = normalizedUniversal == normalizedOwnerData
	} else {
		// Fallback: convert user_address to Universal Address format for comparison
		userAddrStr := userAddress.(string)
		normalizedUserAddr := strings.ToLower(strings.TrimPrefix(userAddrStr, "0x"))
		normalizedOwnerData := strings.ToLower(strings.TrimPrefix(request.OwnerAddress.Data, "0x"))

		// Check if owner data ends with user address (32-byte Universal Address has 20-byte EVM address at the end)
		addressMatch = strings.HasSuffix(normalizedOwnerData, normalizedUserAddr)
	}

	if !addressMatch {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found or access denied"})
		return
	}

	// Check if the request can be cancelled or should be deleted
	// For completed requests, delete directly instead of cancelling
	// Note: Deleting completed requests does NOT affect Allocation (Check) status
	// Allocations remain as "used" since the withdrawal was successful
	allowedDeleteStatuses := []string{"completed", "completed_with_hook_failed"}
	shouldDelete := false
	for _, status := range allowedDeleteStatuses {
		if request.Status == status {
			shouldDelete = true
			break
		}
	}

	if shouldDelete {
		// Delete completed requests directly - Allocation status should NOT change (remains "used")
		// This is safe because:
		// 1. Completed withdrawals have already consumed the allocations (status = "used")
		// 2. Deleting the record is just removing history, not reversing the withdrawal
		if err := h.repo.Delete(ctx, requestID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete withdraw request", "details": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Withdraw request deleted successfully",
			"data": gin.H{
				"request_id": requestID,
			},
		})
		return
	}

	// Cancel the request (for pending/failed requests)
	if err := h.withdrawService.CancelWithdrawRequest(ctx, requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the updated request
	updatedRequest, err := h.repo.GetByID(ctx, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve cancelled request", "details": err.Error()})
		return
	}

	// Return in format expected by SDK
	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"message":         "Withdraw request cancelled",
		"withdrawRequest": updatedRequest,
		"data":            updatedRequest, // Also include for backward compatibility
	})
}

// ListMyBeneficiaryWithdrawRequestsHandler lists withdraw requests where the authenticated user is the beneficiary
// GET /api/v2/my/beneficiary-withdraw-requests
func (h *WithdrawRequestHandler) ListMyBeneficiaryWithdrawRequestsHandler(c *gin.Context) {
	// Get user info from JWT
	userChainID, exists := c.Get("user_chain_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user chain ID not found"})
		return
	}

	userData, exists := c.Get("user_data")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user data not found"})
		return
	}

	// Parse pagination params
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Get withdraw requests where user is beneficiary
	requests, total, err := h.withdrawService.GetBeneficiaryWithdrawRequests(
		c.Request.Context(),
		userChainID.(uint32),
		userData.(string),
		page,
		pageSize,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    requests,
		"pagination": gin.H{
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
		},
	})
}

// RequestPayoutExecutionHandler requests backend multisig to execute payout
// POST /api/v1/withdrawals/:id/request-payout
func (h *WithdrawRequestHandler) RequestPayoutExecutionHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.RequestPayoutExecution(c.Request.Context(), requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Payout execution requested successfully",
	})
}

// ClaimTimeoutHandler allows user to claim funds on source chain after timeout
// POST /api/v1/withdrawals/:id/claim-timeout
func (h *WithdrawRequestHandler) ClaimTimeoutHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.ClaimTimeout(c.Request.Context(), requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Timeout claimed successfully",
	})
}

// RequestHookPurchaseHandler requests direct asset purchase via Hook
// POST /api/v1/withdrawals/:id/request-hook
func (h *WithdrawRequestHandler) RequestHookPurchaseHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.RequestHookPurchase(c.Request.Context(), requestID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Hook purchase requested successfully",
	})
}

// WithdrawOriginalTokensHandler allows beneficiary to withdraw original tokens from IntentManager
// POST /api/v2/my/beneficiary-withdraw-requests/:id/withdraw-original-tokens
func (h *WithdrawRequestHandler) WithdrawOriginalTokensHandler(c *gin.Context) {
	requestID := c.Param("id")

	if err := h.withdrawService.WithdrawOriginalTokens(c.Request.Context(), requestID); err != nil {
		statusCode := http.StatusBadRequest
		if err.Error() == "only beneficiary can withdraw original tokens" {
			statusCode = http.StatusForbidden
		}
		c.JSON(statusCode, gin.H{"error": err.Error()})
		return
	}

	// Get updated request to return details
	request, err := h.withdrawService.GetWithdrawRequest(c.Request.Context(), requestID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Original tokens withdrawal requested successfully",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Original tokens withdrawal requested successfully",
		"data": gin.H{
			"status":      request.Status,
			"hook_status": request.HookStatus,
		},
	})
}

// GetWithdrawRequestHandler gets a withdraw request by ID
// GET /api/v1/withdrawals/:id
func (h *WithdrawRequestHandler) GetWithdrawRequestHandler(c *gin.Context) {
	requestID := c.Param("id")

	request, err := h.withdrawService.GetWithdrawRequest(c.Request.Context(), requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Withdraw request not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    request,
	})
}
