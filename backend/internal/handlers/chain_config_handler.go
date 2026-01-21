// Chain Config Handlers - Admin-only operations
// Manages contract addresses for each chain (IntentManager, Treasury, Adapter)
package handlers

import (
	"go-backend/internal/config"
	"go-backend/internal/models"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ChainConfigHandler handles chain configuration operations
type ChainConfigHandler struct {
	db *gorm.DB
}

// NewChainConfigHandler creates a new ChainConfigHandler instance
func NewChainConfigHandler(db *gorm.DB) *ChainConfigHandler {
	return &ChainConfigHandler{
		db: db,
	}
}

// ============================================================================
// Chain Config Management
// ============================================================================

// ListChainsHandler lists all chain configurations
// GET /api/admin/chains
func (h *ChainConfigHandler) ListChainsHandler(c *gin.Context) {
	var chains []models.ChainConfig

	if err := h.db.Order("chain_id ASC").Find(&chains).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch chains", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"chains": chains,
		"total":  len(chains),
	})
}

// GetChainHandler gets a single chain configuration
// GET /api/admin/chains/:chain_id
func (h *ChainConfigHandler) GetChainHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	var chain models.ChainConfig
	if err := h.db.Where("chain_id = ?", chainID).First(&chain).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chain not found"})
		return
	}

	// Also get all adapters for this chain
	var adapters []models.IntentAdapter
	h.db.Where("chain_id = ?", chainID).Order("adapter_id ASC").Find(&adapters)

	c.JSON(http.StatusOK, gin.H{
		"chain":    chain,
		"adapters": adapters,
	})
}

// CreateChainHandler creates a new chain configuration
// POST /api/admin/chains
// Note: ZKPayAddress is global and not chain-specific, so it's not included here
func (h *ChainConfigHandler) CreateChainHandler(c *gin.Context) {
	var req struct {
		ChainID              uint32 `json:"chain_id" binding:"required"`
		ChainName            string `json:"chain_name" binding:"required"`
		TreasuryAddress      string `json:"treasury_address" binding:"required"`
		IntentManagerAddress string `json:"intent_manager_address" binding:"required"`
		RpcEndpoint          string `json:"rpc_endpoint" binding:"required"`
		ExplorerURL          string `json:"explorer_url"`
		SyncEnabled          *bool  `json:"sync_enabled"` // Optional, defaults to true
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Check if chain already exists
	var existing models.ChainConfig
	if err := h.db.Where("chain_id = ?", req.ChainID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Chain configuration already exists"})
		return
	}

	syncEnabled := true
	if req.SyncEnabled != nil {
		syncEnabled = *req.SyncEnabled
	}

	// Get ZKPayAddress from database (global config)
	// Priority: Database > Environment Variable > Config File > Network-specific Config
	zkpayAddress := ""
	
	// 1. Try database first (highest priority for runtime config)
	var globalConfig models.GlobalConfig
	if err := h.db.Where("config_key = ?", "zkpay_proxy").First(&globalConfig).Error; err == nil {
		zkpayAddress = globalConfig.ConfigValue
	} else if envZKPay := os.Getenv("ZKPAY_PROXY"); envZKPay != "" {
		// 2. Try environment variable
		zkpayAddress = envZKPay
	} else if config.AppConfig != nil && config.AppConfig.Blockchain.ZKPayProxy != "" {
		// 3. Try global blockchain config
		zkpayAddress = config.AppConfig.Blockchain.ZKPayProxy
	} else if config.AppConfig != nil && config.AppConfig.Blockchain.Networks != nil {
		// 4. Fallback to any network's config (for backward compatibility)
		for _, networkConfig := range config.AppConfig.Blockchain.Networks {
			if networkConfig.ContractAddresses != nil {
				if zkpayProxy, exists := networkConfig.ContractAddresses["zkpay_proxy"]; exists && zkpayProxy != "" {
					zkpayAddress = zkpayProxy
					break
				}
			}
		}
	}
	
	// If still empty, use placeholder (database field is NOT NULL)
	if zkpayAddress == "" {
		zkpayAddress = "0x0000000000000000000000000000000000000000" // Placeholder, should be set via Admin API
	}

	chain := models.ChainConfig{
		ChainID:              req.ChainID,
		ChainName:            req.ChainName,
		TreasuryAddress:      req.TreasuryAddress,
		IntentManagerAddress: req.IntentManagerAddress,
		ZKPayAddress:         zkpayAddress, // Set from global config, not from request
		RpcEndpoint:          req.RpcEndpoint,
		ExplorerURL:          req.ExplorerURL,
		SyncEnabled:          syncEnabled,
		SyncBlockNumber:      0,
		IsActive:             true,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	if err := h.db.Create(&chain).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create chain", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Chain created successfully",
		"chain":   chain,
	})
}

// UpdateChainHandler updates a chain configuration
// PUT /api/admin/chains/:chain_id
func (h *ChainConfigHandler) UpdateChainHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	var req struct {
		ChainName            *string `json:"chain_name"`
		TreasuryAddress      *string `json:"treasury_address"`
		IntentManagerAddress *string `json:"intent_manager_address"`
		// ZKPayAddress is global, not chain-specific, so it's not included here
		RpcEndpoint          *string `json:"rpc_endpoint"`
		ExplorerURL          *string `json:"explorer_url"`
		SyncEnabled          *bool   `json:"sync_enabled"`
		IsActive             *bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	var chain models.ChainConfig
	if err := h.db.Where("chain_id = ?", chainID).First(&chain).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chain not found"})
		return
	}

	// Update only provided fields
	updates := make(map[string]interface{})
	if req.ChainName != nil {
		updates["chain_name"] = *req.ChainName
	}
	if req.TreasuryAddress != nil {
		updates["treasury_address"] = *req.TreasuryAddress
	}
	if req.IntentManagerAddress != nil {
		updates["intent_manager_address"] = *req.IntentManagerAddress
	}
	// ZKPayAddress is global, not chain-specific, so it's not updated here
	if req.RpcEndpoint != nil {
		updates["rpc_endpoint"] = *req.RpcEndpoint
	}
	if req.ExplorerURL != nil {
		updates["explorer_url"] = *req.ExplorerURL
	}
	if req.SyncEnabled != nil {
		updates["sync_enabled"] = *req.SyncEnabled
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	updates["updated_at"] = time.Now()

	if err := h.db.Model(&chain).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update chain", "details": err.Error()})
		return
	}

	// Reload to get updated values
	h.db.Where("chain_id = ?", chainID).First(&chain)

	c.JSON(http.StatusOK, gin.H{
		"message": "Chain updated successfully",
		"chain":   chain,
	})
}

// DeleteChainHandler soft-deletes a chain configuration
// DELETE /api/admin/chains/:chain_id
func (h *ChainConfigHandler) DeleteChainHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	var chain models.ChainConfig
	if err := h.db.Where("chain_id = ?", chainID).First(&chain).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chain not found"})
		return
	}

	// Soft delete (set is_active = false)
	if err := h.db.Model(&chain).Updates(map[string]interface{}{
		"is_active":  false,
		"updated_at": time.Now(),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete chain", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Chain deleted successfully",
	})
}

// ============================================================================
// Chain Adapter Config Management
// ============================================================================

// ListChainAdaptersHandler lists all adapters for a chain
// GET /api/admin/chains/:chain_id/adapters
func (h *ChainConfigHandler) ListChainAdaptersHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	var adapters []models.IntentAdapter
	if err := h.db.Where("chain_id = ?", chainID).Order("adapter_id ASC").Find(&adapters).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch adapters", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"chain_id": chainID,
		"adapters": adapters,
		"total":    len(adapters),
	})
}

// CreateChainAdapterHandler creates a new adapter configuration for a chain
// POST /api/admin/chains/:chain_id/adapters
func (h *ChainConfigHandler) CreateChainAdapterHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	var req struct {
		AdapterID      uint32 `json:"adapter_id" binding:"required"`
		AdapterAddress string `json:"adapter_address" binding:"required"`
		Protocol       string `json:"protocol"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Check if chain exists
	var chain models.ChainConfig
	if err := h.db.Where("chain_id = ?", chainID).First(&chain).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chain not found"})
		return
	}

	// Check if adapter already exists for this chain
	var existing models.IntentAdapter
	if err := h.db.Where("chain_id = ? AND adapter_id = ?", chainID, req.AdapterID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Adapter already configured for this chain"})
		return
	}

	adapter := models.IntentAdapter{
		ChainID:   uint32(chainID),
		AdapterID: req.AdapterID,
		Address:   req.AdapterAddress,
		Protocol:   req.Protocol,
		Name:      req.Protocol + " Adapter", // Default name
		IsActive:  true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.db.Create(&adapter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create adapter", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Adapter created successfully",
		"adapter": adapter,
	})
}

// UpdateChainAdapterHandler updates an adapter configuration
// PUT /api/admin/chains/:chain_id/adapters/:adapter_id
func (h *ChainConfigHandler) UpdateChainAdapterHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	adapterID, err := strconv.ParseUint(c.Param("adapter_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	var req struct {
		AdapterAddress *string `json:"adapter_address"`
		Protocol       *string `json:"protocol"`
		IsActive       *bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	var adapter models.IntentAdapter
	if err := h.db.Where("chain_id = ? AND adapter_id = ?", chainID, adapterID).First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Adapter not found"})
		return
	}

	// Update only provided fields
	updates := make(map[string]interface{})
	if req.AdapterAddress != nil {
		updates["address"] = *req.AdapterAddress
	}
	if req.Protocol != nil {
		updates["protocol"] = *req.Protocol
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	updates["updated_at"] = time.Now()

	if err := h.db.Model(&adapter).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update adapter", "details": err.Error()})
		return
	}

	// Reload to get updated values
	h.db.Where("chain_id = ? AND adapter_id = ?", chainID, adapterID).First(&adapter)

	c.JSON(http.StatusOK, gin.H{
		"message": "Adapter updated successfully",
		"adapter": adapter,
	})
}

// DeleteChainAdapterHandler soft-deletes an adapter configuration
// DELETE /api/admin/chains/:chain_id/adapters/:adapter_id
func (h *ChainConfigHandler) DeleteChainAdapterHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	adapterID, err := strconv.ParseUint(c.Param("adapter_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	var adapter models.IntentAdapter
	if err := h.db.Where("chain_id = ? AND adapter_id = ?", chainID, adapterID).First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Adapter not found"})
		return
	}

	// Soft delete (set is_active = false)
	if err := h.db.Model(&adapter).Updates(map[string]interface{}{
		"is_active":  false,
		"updated_at": time.Now(),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete adapter", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Adapter deleted successfully",
	})
}

// ============================================================================
// Public Query Endpoints (No Authentication Required)
// ============================================================================

// GetActiveChainHandler gets an active chain configuration (public)
// GET /api/chains/:chain_id
func (h *ChainConfigHandler) GetActiveChainHandler(c *gin.Context) {
	chainID, err := strconv.ParseUint(c.Param("chain_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chain ID"})
		return
	}

	var chain models.ChainConfig
	if err := h.db.Where("chain_id = ? AND is_active = ?", chainID, true).First(&chain).Error; err != nil {
		// Return 200 with empty data instead of 404
		// This indicates the chain ID is valid but configuration is not initialized
		c.JSON(http.StatusOK, gin.H{
			"chain":    nil,
			"adapters": []models.IntentAdapter{},
		})
		return
	}

	// Also get all active adapters for this chain
	var adapters []models.IntentAdapter
	h.db.Where("chain_id = ? AND is_active = ?", chainID, true).Order("adapter_id ASC").Find(&adapters)

	c.JSON(http.StatusOK, gin.H{
		"chain":    chain,
		"adapters": adapters,
	})
}

// ListActiveChainsHandler lists all active chains (public)
// GET /api/chains
func (h *ChainConfigHandler) ListActiveChainsHandler(c *gin.Context) {
	var chains []models.ChainConfig

	if err := h.db.Where("is_active = ?", true).Order("chain_id ASC").Find(&chains).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch chains", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"chains": chains,
		"total":  len(chains),
	})
}

// ============================================================================
// Global Configuration Management
// ============================================================================

// GetGlobalZKPayProxyHandler gets the global ZKPay Proxy address from database
// GET /api/admin/config/zkpay-proxy
func (h *ChainConfigHandler) GetGlobalZKPayProxyHandler(c *gin.Context) {
	var globalConfig models.GlobalConfig
	
	// Get from database
	if err := h.db.Where("config_key = ?", "zkpay_proxy").First(&globalConfig).Error; err != nil {
		// If not found in database, try to get from config file or environment
		zkpayProxy := ""
		source := "not_configured"
		
		if envZKPay := os.Getenv("ZKPAY_PROXY"); envZKPay != "" {
			zkpayProxy = envZKPay
			source = "environment_variable"
		} else if config.AppConfig != nil && config.AppConfig.Blockchain.ZKPayProxy != "" {
			zkpayProxy = config.AppConfig.Blockchain.ZKPayProxy
			source = "config_file"
		}
		
		c.JSON(http.StatusOK, gin.H{
			"zkpay_proxy": zkpayProxy,
			"source":      source,
			"note":        "Not found in database, using config file or environment variable",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"zkpay_proxy": globalConfig.ConfigValue,
		"source":      "database",
		"description":  globalConfig.Description,
		"updated_by":   globalConfig.UpdatedBy,
		"updated_at":   globalConfig.UpdatedAt,
	})
}

// UpdateGlobalZKPayProxyHandler updates the global ZKPay Proxy address in database
// PUT /api/admin/config/zkpay-proxy
func (h *ChainConfigHandler) UpdateGlobalZKPayProxyHandler(c *gin.Context) {
	var req struct {
		ZKPayProxy string `json:"zkpay_proxy" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}
	
	// Validate address format (basic check)
	if len(req.ZKPayProxy) < 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ZKPay Proxy address format"})
		return
	}
	
	// Get or create global config
	var globalConfig models.GlobalConfig
	if err := h.db.Where("config_key = ?", "zkpay_proxy").First(&globalConfig).Error; err != nil {
		// Create new config
		globalConfig = models.GlobalConfig{
			ConfigKey:   "zkpay_proxy",
			ConfigValue: req.ZKPayProxy,
			Description: "Global ZKPay Proxy contract address (same for all chains)",
			UpdatedBy:   c.GetString("user"), // If you have user info in context
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if err := h.db.Create(&globalConfig).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create global config", "details": err.Error()})
			return
		}
	} else {
		// Update existing config
		globalConfig.ConfigValue = req.ZKPayProxy
		globalConfig.UpdatedAt = time.Now()
		if c.GetString("user") != "" {
			globalConfig.UpdatedBy = c.GetString("user")
		}
		if err := h.db.Save(&globalConfig).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update global config", "details": err.Error()})
			return
		}
	}
	
	// Also update in-memory config for immediate effect
	if config.AppConfig != nil {
		config.AppConfig.Blockchain.ZKPayProxy = req.ZKPayProxy
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":     "Global ZKPay Proxy address updated successfully",
		"zkpay_proxy": req.ZKPayProxy,
		"updated_at":  globalConfig.UpdatedAt,
	})
}

// getZKPayProxySource returns the source of the current ZKPay Proxy address
func (h *ChainConfigHandler) getZKPayProxySource() string {
	// Check database first
	var globalConfig models.GlobalConfig
	if err := h.db.Where("config_key = ?", "zkpay_proxy").First(&globalConfig).Error; err == nil && globalConfig.ConfigValue != "" {
		return "database"
	}
	
	// Then check other sources
	if os.Getenv("ZKPAY_PROXY") != "" {
		return "environment_variable"
	}
	if config.AppConfig != nil && config.AppConfig.Blockchain.ZKPayProxy != "" {
		return "config_file"
	}
	if config.AppConfig != nil && config.AppConfig.Blockchain.Networks != nil {
		for _, networkConfig := range config.AppConfig.Blockchain.Networks {
			if networkConfig.ContractAddresses != nil {
				if _, exists := networkConfig.ContractAddresses["zkpay_proxy"]; exists {
					return "network_config"
				}
			}
		}
	}
	return "not_configured"
}

