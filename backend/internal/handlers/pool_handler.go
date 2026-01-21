// Pool Handlers - User-facing (no authentication required)
//
//	Pool （）
package handlers

import (
	"go-backend/internal/models"
	"go-backend/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// PoolHandler handles user-facing pool and token queries
type PoolHandler struct {
	intentService  *services.IntentService
	metricsService *services.MetricsService
}

// NewPoolHandler creates a new PoolHandler instance
func NewPoolHandler() *PoolHandler {
	return &PoolHandler{
		intentService:  services.NewIntentService(),
		metricsService: services.NewMetricsService(),
	}
}

// ============================================================================
// Pool Queries ( Pool)
// ============================================================================

// ListPoolsHandler lists pools with optional isActive filter
// GET /api/pools?isActive=true
func (h *PoolHandler) ListPoolsHandler(c *gin.Context) {
	var pools []models.IntentAdapter

	// Handle isActive query parameter
	isActiveParam := c.Query("isActive")
	db := h.intentService.DB()
	query := db.Model(&models.IntentAdapter{})
	
	// Apply isActive filter if provided
	if isActiveParam == "true" {
		query = query.Where("is_active = ?", true)
	} else if isActiveParam == "false" {
		query = query.Where("is_active = ?", false)
	} else {
		// Default: only active pools (backward compatibility)
		query = query.Where("is_active = ?", true)
	}
	
	if err := query.Order("is_featured DESC, id ASC").Find(&pools).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch pools", "details": err.Error()})
		return
	}

	// Count tokens for each adapter
	type PoolWithCount struct {
		models.IntentAdapter
		TokenCount int `json:"token_count"`
	}

	// Build result with metrics
	type PoolWithMetrics struct {
		models.IntentAdapter
		TokenCount int                    `json:"token_count"`
		Metrics    map[string]interface{} `json:"metrics,omitempty"`
	}

	result := make([]PoolWithMetrics, len(pools))
	for i, adapter := range pools {
		var count int64
		db.Model(&models.IntentAssetToken{}).
			Where("adapter_id = ? AND is_active = ?", adapter.ID, true).
			Count(&count)

		result[i] = PoolWithMetrics{
			IntentAdapter: adapter,
			TokenCount:    int(count),
		}

		// Include metrics
		metrics, err := h.metricsService.GetCurrentAdapterMetrics(adapter.ID)
		if err == nil && len(metrics) > 0 {
			metricsMap := make(map[string]interface{})
			for _, m := range metrics {
				metricsMap[m.MetricType] = gin.H{
					"name":  m.MetricName,
					"value": m.Value,
					"unit":  m.Unit,
				}
			}
			result[i].Metrics = metricsMap
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"pools": result,
		"total": len(result),
	})
}

// GetPoolHandler gets a single adapter by ID
// GET /api/pools/:id
func (h *PoolHandler) GetPoolHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	var adapter models.IntentAdapter
	db := h.intentService.DB()

	if err := db.Where("id = ? AND is_active = ?", adapterID, true).
		First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	// Get all tokens for this adapter
	var tokens []models.IntentAssetToken
	db.Where("adapter_id = ? AND is_active = ?", adapterID, true).
		Order("token_id ASC").
		Find(&tokens)

	// Get pool metrics
	poolMetrics := make(map[string]interface{})
	metrics, err := h.metricsService.GetCurrentAdapterMetrics(adapterID)
	if err == nil && len(metrics) > 0 {
		for _, m := range metrics {
			poolMetrics[m.MetricType] = gin.H{
				"name":  m.MetricName,
				"value": m.Value,
				"unit":  m.Unit,
			}
		}
	}

	// Get metrics for each token
	type TokenWithMetrics struct {
		models.IntentAssetToken
		Metrics map[string]interface{} `json:"metrics,omitempty"`
	}

	tokensWithMetrics := make([]TokenWithMetrics, len(tokens))
	for i, token := range tokens {
		tokensWithMetrics[i] = TokenWithMetrics{
			IntentAssetToken: token,
		}

		tokenMetrics, err := h.metricsService.GetCurrentAssetTokenMetrics(token.AssetID)
		if err == nil && len(tokenMetrics) > 0 {
			metricsMap := make(map[string]interface{})
			for _, m := range tokenMetrics {
				metricsMap[m.MetricType] = gin.H{
					"name":  m.MetricName,
					"value": m.Value,
					"unit":  m.Unit,
				}
			}
			tokensWithMetrics[i].Metrics = metricsMap
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"pool":    adapter,
		"metrics": poolMetrics,
		"tokens":  tokensWithMetrics,
	})
}

// GetPoolTokensHandler gets all tokens for an adapter
// GET /api/pools/:id/tokens
func (h *PoolHandler) GetPoolTokensHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	var tokens []models.IntentAssetToken
	db := h.intentService.DB()

	if err := db.Where("adapter_id = ? AND is_active = ?", adapterID, true).
		Order("token_id ASC").
		Find(&tokens).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tokens", "details": err.Error()})
		return
	}

	// Get metrics for each token
	type TokenWithMetrics struct {
		models.IntentAssetToken
		Metrics map[string]interface{} `json:"metrics,omitempty"`
	}

	tokensWithMetrics := make([]TokenWithMetrics, len(tokens))
	for i, token := range tokens {
		tokensWithMetrics[i] = TokenWithMetrics{
			IntentAssetToken: token,
		}

		tokenMetrics, err := h.metricsService.GetCurrentAssetTokenMetrics(token.AssetID)
		if err == nil && len(tokenMetrics) > 0 {
			metricsMap := make(map[string]interface{})
			for _, m := range tokenMetrics {
				metricsMap[m.MetricType] = gin.H{
					"name":  m.MetricName,
					"value": m.Value,
					"unit":  m.Unit,
				}
			}
			tokensWithMetrics[i].Metrics = metricsMap
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"adapter_id": adapterID,
		"tokens":     tokensWithMetrics,
		"total":      len(tokens),
	})
}

// ============================================================================
// Token Queries ( Token)
// ============================================================================

// GetTokenHandler gets a single token by adapter ID and token ID
// GET /api/pools/:adapter_id/tokens/:token_id
func (h *PoolHandler) GetTokenHandler(c *gin.Context) {
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

	var token models.IntentAssetToken
	db := h.intentService.DB()

	if err := db.Where("adapter_id = ? AND token_id = ? AND is_active = ?", adapterID, tokenID, true).
		First(&token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	// Also get the adapter info
	var adapter models.IntentAdapter
	db.Where("id = ?", adapterID).First(&adapter)

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"pool":  adapter,
	})
}

// ListTokensHandler lists all tokens with optional filters
// GET /api/tokens?isActive=true
func (h *PoolHandler) ListTokensHandler(c *gin.Context) {
	isActiveParam := c.Query("isActive")
	
	db := h.intentService.DB()
	
	type TokenWithPool struct {
		models.IntentAssetToken
		PoolName string `json:"adapter_name"`
	}
	
	var results []TokenWithPool
	query := db.Table("intent_asset_tokens as t").
		Select("t.*, a.name as adapter_name").
		Joins("LEFT JOIN intent_adapters as a ON t.adapter_id = a.id")
	
	// Apply isActive filter if provided
	if isActiveParam == "true" {
		query = query.Where("t.is_active = ? AND a.is_active = ?", true, true)
	} else if isActiveParam == "false" {
		query = query.Where("t.is_active = ?", false)
	}
	
	if err := query.Order("t.adapter_id ASC, t.token_id ASC").
		Find(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tokens", "details": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"tokens": results,
		"total":  len(results),
	})
}

// SearchTokensHandler searches tokens by keyword
// GET /api/tokens/search?keyword=usdt
func (h *PoolHandler) SearchTokensHandler(c *gin.Context) {
	keyword := c.Query("keyword")
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "keyword parameter is required"})
		return
	}

	db := h.intentService.DB()

	type TokenWithPool struct {
		models.IntentAssetToken
		PoolName string `json:"adapter_name"`
	}

	var results []TokenWithPool

	// Search in token symbol and name
	if err := db.Table("intent_asset_tokens as t").
		Select("t.*, a.name as adapter_name").
		Joins("LEFT JOIN intent_adapters as a ON t.adapter_id = a.id").
		Where("t.is_active = ? AND a.is_active = ?", true, true).
		Where("t.symbol LIKE ? OR t.name LIKE ?", "%"+keyword+"%", "%"+keyword+"%").
		Order("t.adapter_id ASC, t.token_id ASC").
		Find(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"keyword": keyword,
		"tokens":  results,
		"total":   len(results),
	})
}

// GetFeaturedPoolsHandler gets all featured pools
// GET /api/pools/featured
func (h *PoolHandler) GetFeaturedPoolsHandler(c *gin.Context) {
	var pools []models.IntentAdapter

	db := h.intentService.DB()
	if err := db.Where("is_active = ? AND is_featured = ?", true, true).
		Order("id ASC").
		Find(&pools).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch featured pools", "details": err.Error()})
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
			Where("adapter_id = ? AND is_active = ?", adapter.ID, true).
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
