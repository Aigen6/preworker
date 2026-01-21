// Admin Pool Handlers - Admin-only operations (authentication required)
//
//	Pool  Token （need）
package handlers

import (
	"go-backend/internal/models"
	"go-backend/internal/services"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// AdminPoolHandler handles admin pool and token management operations
type AdminPoolHandler struct {
	intentService *services.IntentService
}

// NewAdminPoolHandler creates a new AdminPoolHandler instance
func NewAdminPoolHandler() *AdminPoolHandler {
	return &AdminPoolHandler{
		intentService: services.NewIntentService(),
	}
}

// ============================================================================
// Pool Management ( Pool CRUD)
// ============================================================================

// ListAllPoolsHandler lists all active pools (excluding soft-deleted ones)
// GET /api/admin/pools
func (h *AdminPoolHandler) ListAllPoolsHandler(c *gin.Context) {
	var pools []models.IntentAdapter

	db := h.intentService.DB()
	// Only return active pools (is_active = true)
	if err := db.Where("is_active = ?", true).Order("id ASC").Find(&pools).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch pools", "details": err.Error()})
		return
	}

	// Count tokens for each adapter
	type PoolWithCount struct {
		models.IntentAdapter
		TokenCount int `json:"token_count"`
	}

	result := make([]PoolWithCount, len(pools))
	for i, adapter := range pools {
		var count int64
		db.Model(&models.IntentAssetToken{}).
			Where("adapter_id = ?", adapter.ID).
			Count(&count)

		result[i] = PoolWithCount{
			IntentAdapter: adapter,
			TokenCount:    int(count),
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"pools": result,
		"total": len(result),
	})
}

// GetPoolHandler gets a single active pool by ID
// GET /api/admin/pools/:id
func (h *AdminPoolHandler) GetPoolHandler(c *gin.Context) {
	poolID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pool ID"})
		return
	}

	db := h.intentService.DB()
	var pool models.IntentAdapter

	// Only return active pools
	if err := db.Where("id = ? AND is_active = ?", poolID, true).First(&pool).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"pool": pool})
}

// CreatePoolHandler creates a new adapter
// POST /api/admin/pools
func (h *AdminPoolHandler) CreatePoolHandler(c *gin.Context) {
	var req struct {
		AdapterID   uint32 `json:"adapter_id" binding:"required,min=1,max=65535"`
		ChainID     uint32 `json:"chain_id" binding:"required"`
		Address     string `json:"address" binding:"required"`
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Protocol    string `json:"protocol"`
		Version     string `json:"version"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Check if adapter already exists (by chain_id + adapter_id)
	var existing models.IntentAdapter
	db := h.intentService.DB()
	if err := db.Where("chain_id = ? AND adapter_id = ?", req.ChainID, req.AdapterID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Adapter ID already exists on this chain"})
		return
	}

	// Check if address already exists
	if err := db.Where("chain_id = ? AND address = ?", req.ChainID, req.Address).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Pool address already exists on this chain"})
		return
	}

	adapter := models.IntentAdapter{
		AdapterID:   req.AdapterID,
		ChainID:     req.ChainID,
		Address:     req.Address,
		Name:        req.Name,
		Description: req.Description,
		Protocol:    req.Protocol,
		Version:     req.Version,
		IsActive:    true,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := db.Create(&adapter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create pool", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Pool created successfully",
		"pool":    adapter,
	})
}

// UpdatePoolHandler updates an existing adapter
// PUT /api/admin/pools/:id
func (h *AdminPoolHandler) UpdatePoolHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Protocol    *string `json:"protocol"`
		Version     *string `json:"version"`
		IsActive    *bool   `json:"is_active"`
		IsPaused    *bool   `json:"is_paused"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	db := h.intentService.DB()
	var adapter models.IntentAdapter

	if err := db.Where("id = ?", adapterID).First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	// Update only provided fields
	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Protocol != nil {
		updates["protocol"] = *req.Protocol
	}
	if req.Version != nil {
		updates["version"] = *req.Version
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.IsPaused != nil {
		updates["is_paused"] = *req.IsPaused
	}
	updates["updated_at"] = time.Now()

	if err := db.Model(&adapter).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update pool", "details": err.Error()})
		return
	}

	// Reload to get updated values
	db.Where("id = ?", adapterID).First(&adapter)

	c.JSON(http.StatusOK, gin.H{
		"message": "Pool updated successfully",
		"pool":    adapter,
	})
}

// DeletePoolHandler deletes an adapter
// DELETE /api/admin/pools/:id
func (h *AdminPoolHandler) DeletePoolHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	db := h.intentService.DB()
	var adapter models.IntentAdapter

	if err := db.Where("id = ?", adapterID).First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	// Check if adapter has tokens
	var tokenCount int64
	var tokens []models.IntentAssetToken
	db.Where("adapter_id = ?", adapter.ID).Find(&tokens)
	tokenCount = int64(len(tokens))

	// Debug log
	logrus.WithFields(logrus.Fields{
		"adapter_id":  adapter.ID,
		"token_count": tokenCount,
		"tokens":      tokens,
	}).Info("Checking tokens before deleting adapter")

	// Support force delete query parameter
	forceDelete := c.Query("force") == "true"

	if tokenCount > 0 {
		if !forceDelete {
			c.JSON(http.StatusConflict, gin.H{
				"error":       "Cannot delete adapter with existing tokens",
				"token_count": tokenCount,
				"hint":        "Use ?force=true to delete adapter and all its tokens",
			})
			return
		}

		// Force delete: Delete all associated tokens first
		if err := db.Where("adapter_id = ?", adapter.ID).Delete(&models.IntentAssetToken{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Failed to delete associated tokens",
				"details": err.Error(),
			})
			return
		}
	}

	// Soft delete (set is_active = false, keeps data for audit/recovery)
	if err := db.Model(&adapter).Updates(map[string]interface{}{
		"is_active":  false,
		"updated_at": time.Now(),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete pool", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Pool deleted successfully",
	})
}

// ============================================================================
// Token Management ( Token CRUD)
// ============================================================================

// GetTokenHandler gets a single token by pool ID and token ID
// GET /api/admin/pools/:id/tokens/:token_id
func (h *AdminPoolHandler) GetTokenHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	tokenID, err := strconv.ParseUint(c.Param("token_id"), 10, 16)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token ID"})
		return
	}

	db := h.intentService.DB()
	var token models.IntentAssetToken

	if err := db.Where("adapter_id = ? AND token_id = ?", adapterID, tokenID).First(&token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

// CreateTokenHandler creates a new token under an adapter
// POST /api/admin/pools/:id/tokens
func (h *AdminPoolHandler) CreateTokenHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	var req struct {
		TokenID     uint16  `json:"token_id" binding:"required"`
		Symbol      string  `json:"symbol" binding:"required"`
		Name        string  `json:"name" binding:"required"`
		Decimals    uint8   `json:"decimals" binding:"required"`
		BaseToken   string  `json:"base_token"`
		Description string  `json:"description"`
		LogoURL     *string `json:"logo_url"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	db := h.intentService.DB()

	// Check if adapter exists
	var adapter models.IntentAdapter
	if err := db.Where("id = ?", adapterID).First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	// Check if token_id already exists for this adapter
	var existing models.IntentAssetToken
	if err := db.Where("adapter_id = ? AND token_id = ?", adapter.ID, req.TokenID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Token ID already exists for this pool"})
		return
	}

	// Generate asset_id
	assetID := services.EncodeAssetID(uint32(adapter.ID), req.TokenID)

	logoURL := ""
	if req.LogoURL != nil {
		logoURL = *req.LogoURL
	}

	token := models.IntentAssetToken{
		AssetID:     assetID,
		AdapterID:   uint32(adapter.ID),
		TokenID:     req.TokenID,
		Symbol:      req.Symbol,
		Name:        req.Name,
		Decimals:    req.Decimals,
		BaseToken:   req.BaseToken,
		Description: req.Description,
		IconURL:     logoURL,
		Protocol:    adapter.Protocol,
		IsActive:    true,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := db.Create(&token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create token", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Token created successfully",
		"token":   token,
	})
}

// UpdateTokenHandler updates an existing token
// PUT /api/admin/pools/:id/tokens/:token_id
func (h *AdminPoolHandler) UpdateTokenHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	tokenID, err := strconv.ParseUint(c.Param("token_id"), 10, 16)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token ID"})
		return
	}

	var req struct {
		Symbol      *string `json:"symbol"`
		Name        *string `json:"name"`
		Decimals    *uint8  `json:"decimals"`
		BaseToken   *string `json:"base_token"`
		Description *string `json:"description"`
		LogoURL     *string `json:"logo_url"`
		IsActive    *bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	db := h.intentService.DB()
	var token models.IntentAssetToken

	// Find adapter first
	var adapterForToken models.IntentAdapter
	if err := db.Where("id = ?", adapterID).First(&adapterForToken).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	if err := db.Where("adapter_id = ? AND token_id = ?", adapterForToken.ID, tokenID).First(&token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	// Update only provided fields
	updates := make(map[string]interface{})
	if req.Symbol != nil {
		updates["symbol"] = *req.Symbol
	}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Decimals != nil {
		updates["decimals"] = *req.Decimals
	}
	if req.BaseToken != nil {
		updates["base_token"] = *req.BaseToken
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.LogoURL != nil {
		updates["logo_url"] = *req.LogoURL
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	updates["updated_at"] = time.Now()

	if err := db.Model(&token).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update token", "details": err.Error()})
		return
	}

	// Reload to get updated values
	var adapterReload models.IntentAdapter
	db.Where("id = ?", adapterID).First(&adapterReload)
	db.Where("adapter_id = ? AND token_id = ?", adapterReload.ID, tokenID).First(&token)

	c.JSON(http.StatusOK, gin.H{
		"message": "Token updated successfully",
		"token":   token,
	})
}

// DeleteTokenHandler deletes a token
// DELETE /api/admin/pools/:id/tokens/:token_id
func (h *AdminPoolHandler) DeleteTokenHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	tokenID, err := strconv.ParseUint(c.Param("token_id"), 10, 16)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token ID"})
		return
	}

	db := h.intentService.DB()

	// Find adapter first
	var adapterForDelete models.IntentAdapter
	if err := db.Where("id = ?", adapterID).First(&adapterForDelete).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	var token models.IntentAssetToken
	if err := db.Where("adapter_id = ? AND token_id = ?", adapterForDelete.ID, tokenID).First(&token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	// Soft delete (set is_active = false)
	if err := db.Model(&token).Updates(map[string]interface{}{
		"is_active":  false,
		"updated_at": time.Now(),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete token", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Token deleted successfully",
	})
}

// ============================================================================
// Token Chain Configuration (Token Address Configuration)
// ============================================================================

// GetTokenChainConfigHandler gets chain configuration for a token (including token_address)
// GET /api/admin/pools/:id/tokens/:token_id/chain-config?chain_id=714
func (h *AdminPoolHandler) GetTokenChainConfigHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	tokenID, err := strconv.ParseUint(c.Param("token_id"), 10, 16)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token ID"})
		return
	}

	chainIDStr := c.Query("chain_id")
	if chainIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chain_id query parameter is required"})
		return
	}

	chainID, err := strconv.ParseUint(chainIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain_id"})
		return
	}

	db := h.intentService.DB()

	// Find token
	var token models.IntentAssetToken
	if err := db.Where("adapter_id = ? AND token_id = ?", adapterID, tokenID).First(&token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	// Get chain configuration
	chainConfig, err := h.intentService.GetAssetTokenChain(token.AssetID, uint32(chainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chain configuration not found for this token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":        token,
		"chain_config": chainConfig,
	})
}

// CreateOrUpdateTokenChainConfigHandler creates or updates chain configuration for a token
// POST /api/admin/pools/:id/tokens/:token_id/chain-config
func (h *AdminPoolHandler) CreateOrUpdateTokenChainConfigHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	tokenID, err := strconv.ParseUint(c.Param("token_id"), 10, 16)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token ID"})
		return
	}

	var req struct {
		ChainID            uint32  `json:"chain_id" binding:"required"`
		ChainName          string  `json:"chain_name"`
		AdapterAddress     string  `json:"adapter_address" binding:"required"`
		AdapterName        string  `json:"adapter_name"`
		AssetTokenAddress  string  `json:"asset_token_address" binding:"required"` // Token address on this chain
		Description        *string `json:"description"`
		APY                *string `json:"apy"`
		TVL                *string `json:"tvl"`
		IsActive           *bool   `json:"is_active"`
		SupportsCrossChain *bool   `json:"supports_cross_chain"`
		MinWithdraw        *string `json:"min_withdraw"`
		MaxWithdraw        *string `json:"max_withdraw"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	db := h.intentService.DB()

	// Find token and adapter
	var token models.IntentAssetToken
	if err := db.Where("adapter_id = ? AND token_id = ?", adapterID, tokenID).First(&token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	var adapter models.IntentAdapter
	if err := db.Where("id = ?", adapterID).First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	// Check if chain config already exists
	existing, err := h.intentService.GetAssetTokenChain(token.AssetID, req.ChainID)
	isUpdate := err == nil && existing != nil

	if isUpdate {
		// Update existing configuration
		updates := make(map[string]interface{})
		updates["adapter_address"] = strings.ToLower(req.AdapterAddress)
		updates["asset_token_address"] = strings.ToLower(req.AssetTokenAddress)
		if req.ChainName != "" {
			updates["chain_name"] = req.ChainName
		}
		if req.AdapterName != "" {
			updates["adapter_name"] = req.AdapterName
		}
		if req.Description != nil {
			updates["description"] = *req.Description
		}
		if req.APY != nil {
			updates["apy"] = *req.APY
		}
		if req.TVL != nil {
			updates["tvl"] = *req.TVL
		}
		if req.IsActive != nil {
			updates["is_active"] = *req.IsActive
		}
		if req.SupportsCrossChain != nil {
			updates["supports_cross_chain"] = *req.SupportsCrossChain
		}
		if req.MinWithdraw != nil {
			updates["min_withdraw"] = *req.MinWithdraw
		}
		if req.MaxWithdraw != nil {
			updates["max_withdraw"] = *req.MaxWithdraw
		}
		updates["updated_at"] = time.Now()

		if err := h.intentService.UpdateAssetTokenChain(token.AssetID, req.ChainID, updates); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update chain configuration", "details": err.Error()})
			return
		}

		// Reload
		updated, _ := h.intentService.GetAssetTokenChain(token.AssetID, req.ChainID)
		c.JSON(http.StatusOK, gin.H{
			"message":      "Token chain configuration updated successfully",
			"chain_config": updated,
		})
	} else {
		// Create new configuration
		chainConfig := models.IntentAssetTokenChain{
			AssetID:           token.AssetID,
			ChainID:           req.ChainID,
			ChainName:         req.ChainName,
			AdapterAddress:    strings.ToLower(req.AdapterAddress),
			AdapterName:       req.AdapterName,
			AssetTokenAddress: strings.ToLower(req.AssetTokenAddress),
			IsActive:          true,
			CreatedAt:         time.Now(),
			UpdatedAt:         time.Now(),
		}

		if req.Description != nil {
			chainConfig.Description = *req.Description
		}
		if req.APY != nil {
			chainConfig.APY = *req.APY
		}
		if req.TVL != nil {
			chainConfig.TVL = *req.TVL
		}
		if req.IsActive != nil {
			chainConfig.IsActive = *req.IsActive
		}
		if req.SupportsCrossChain != nil {
			chainConfig.SupportsCrossChain = *req.SupportsCrossChain
		}
		if req.MinWithdraw != nil {
			chainConfig.MinWithdraw = *req.MinWithdraw
		}
		if req.MaxWithdraw != nil {
			chainConfig.MaxWithdraw = *req.MaxWithdraw
		}

		if err := h.intentService.AddAssetTokenChain(&chainConfig); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create chain configuration", "details": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"message":      "Token chain configuration created successfully",
			"chain_config": chainConfig,
		})
	}
}

// DeleteTokenChainConfigHandler deletes chain configuration for a token
// DELETE /api/admin/pools/:id/tokens/:token_id/chain-config?chain_id=714
func (h *AdminPoolHandler) DeleteTokenChainConfigHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	tokenID, err := strconv.ParseUint(c.Param("token_id"), 10, 16)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token ID"})
		return
	}

	chainIDStr := c.Query("chain_id")
	if chainIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chain_id query parameter is required"})
		return
	}

	chainID, err := strconv.ParseUint(chainIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain_id"})
		return
	}

	db := h.intentService.DB()

	// Find token
	var token models.IntentAssetToken
	if err := db.Where("adapter_id = ? AND token_id = ?", adapterID, tokenID).First(&token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	// Delete chain configuration
	if err := h.intentService.DeleteAssetTokenChain(token.AssetID, uint32(chainID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete chain configuration", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Token chain configuration deleted successfully",
	})
}
