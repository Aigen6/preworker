package handlers

import (
	"net/http"
	"strconv"

	"go-backend/internal/dto"
	"go-backend/internal/services"

	"github.com/gin-gonic/gin"
)

// KMSHandler KMS key management handler
type KMSHandler struct {
	keyManagementService *services.KeyManagementService
}

// NewKMSHandler CreateKMSprocess
func NewKMSHandler(keyManagementService *services.KeyManagementService) *KMSHandler {
	return &KMSHandler{
		keyManagementService: keyManagementService,
	}
}

// use dto 
type StorePrivateKeyRequest = dto.StorePrivateKeyRequest
type StorePrivateKeyResponse = dto.StorePrivateKeyResponse

// StorePrivateKey store private key to KMS
func (h *KMSHandler) StorePrivateKey(c *gin.Context) {
	var req StorePrivateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, StorePrivateKeyResponse{
			Success: false,
			Error:   "request: " + err.Error(),
		})
		return
	}

	kmsKeyService := h.keyManagementService.GetKMSKeyService()
	if kmsKeyService == nil {
		c.JSON(http.StatusServiceUnavailable, StorePrivateKeyResponse{
			Success: false,
			Error:   "KMSservicenot",
		})
		return
	}

	keyMapping, err := kmsKeyService.StorePrivateKey(req.NetworkName, req.ChainID, req.KeyAlias, req.PrivateKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, StorePrivateKeyResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, StorePrivateKeyResponse{
		Success:       true,
		ID:            keyMapping.ID,
		PublicAddress: keyMapping.PublicAddress,
		Message:       "alreadysuccessstorageKMS",
	})
}

// GetKeyMappings Getkey
func (h *KMSHandler) GetKeyMappings(c *gin.Context) {
	kmsKeyService := h.keyManagementService.GetKMSKeyService()
	if kmsKeyService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "KMSservicenot",
		})
		return
	}

	keyMappings, err := kmsKeyService.ListKeyMappings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"count":   len(keyMappings),
		"data":    keyMappings,
	})
}

// DeleteKeyMapping deletekey
func (h *KMSHandler) DeleteKeyMapping(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "keyIDcannotempty",
		})
		return
	}

	kmsKeyService := h.keyManagementService.GetKMSKeyService()
	if kmsKeyService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "KMSservicenot",
		})
		return
	}

	err := kmsKeyService.DeleteKeyMapping(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "keyalreadydelete",
	})
}

// GetPublicAddress keyGetaddress
func (h *KMSHandler) GetPublicAddress(c *gin.Context) {
	networkName := c.Query("network_name")
	keyAlias := c.Query("key_alias")
	chainIDStr := c.Query("chain_id")

	if networkName == "" || keyAlias == "" || chainIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "network_name, key_alias  chain_id ",
		})
		return
	}

	chainID, err := strconv.Atoi(chainIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "chain_id ",
		})
		return
	}

	kmsKeyService := h.keyManagementService.GetKMSKeyService()
	if kmsKeyService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "KMSservicenot",
		})
		return
	}

	publicAddress, err := kmsKeyService.GetPublicAddress(networkName, keyAlias, chainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"public_address": publicAddress,
		"network_name":   networkName,
		"key_alias":      keyAlias,
		"chain_id":       chainID,
	})
}

// SyncWithKMS different fromKMSkeystatus
func (h *KMSHandler) SyncWithKMS(c *gin.Context) {
	kmsKeyService := h.keyManagementService.GetKMSKeyService()
	if kmsKeyService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "KMSservicenot",
		})
		return
	}

	err := kmsKeyService.SyncWithKMS()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "KMSkeystatuscompleted",
	})
}

// InitializeNetworkKeys InitializenetworkKMS
func (h *KMSHandler) InitializeNetworkKeys(c *gin.Context) {
	kmsKeyService := h.keyManagementService.GetKMSKeyService()
	if kmsKeyService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "KMSservicenot",
		})
		return
	}

	// configurationGetnetworkstorage
	results := make(map[string]interface{})

	// needAccessconfiguration，KeyManagementServiceGet
	networkConfigs := h.keyManagementService.GetNetworkConfigs()

	for networkName, networkConfig := range networkConfigs {
		if !networkConfig.KMSEnabled {
			results[networkName] = map[string]interface{}{
				"status": "skipped",
				"reason": "KMSnot",
			}
			continue
		}

		// API，Checkconfiguration file

		if networkConfig.KMSKeyAlias == "" {
			results[networkName] = map[string]interface{}{
				"status": "skipped",
				"reason": "KMSkeynotconfiguration",
			}
			continue
		}

		// Checkwhetheralreadyexists
		existingKey, err := kmsKeyService.GetPublicAddress(networkName, networkConfig.KMSKeyAlias, networkConfig.ChainID)
		if err == nil && existingKey != "" {
			results[networkName] = map[string]interface{}{
				"status":         "exists",
				"key_alias":      networkConfig.KMSKeyAlias,
				"public_address": existingKey,
			}
			continue
		}

		// Initialize，API
		results[networkName] = map[string]interface{}{
			"status": "skipped",
			"reason": "useAPIinitialize",
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "networkkeyinitializecompleted",
		"results": results,
	})
}

// StoreNetworkPrivateKey storagenetworkKMS
func (h *KMSHandler) StoreNetworkPrivateKey(c *gin.Context) {
	networkName := c.Param("network")
	if networkName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "networkcannotempty",
		})
		return
	}

	kmsKeyService := h.keyManagementService.GetKMSKeyService()
	if kmsKeyService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "KMSservicenot",
		})
		return
	}

	// Getnetworkconfiguration
	networkConfigs := h.keyManagementService.GetNetworkConfigs()
	networkConfig, exists := networkConfigs[networkName]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "networkconfigurationexists: " + networkName,
		})
		return
	}

	if !networkConfig.KMSEnabled {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "networknotKMS",
		})
		return
	}

	// Parserequest
	var req struct {
		PrivateKey string `json:"private_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "requesterror: " + err.Error(),
		})
		return
	}

	if networkConfig.KMSKeyAlias == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "KMSkeynotconfiguration",
		})
		return
	}

	// store private key to KMS（Userequest，configuration file）
	keyMapping, err := kmsKeyService.StorePrivateKey(
		networkName,
		networkConfig.ChainID,
		networkConfig.KMSKeyAlias,
		req.PrivateKey, // Userequest
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"message":        "networkalreadystorageKMS",
		"id":             keyMapping.ID,
		"key_alias":      keyMapping.KeyAlias,
		"public_address": keyMapping.PublicAddress,
	})
}
