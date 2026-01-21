package handlers

import (
	"go-backend/internal/models"
	"go-backend/internal/services"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// AdminMetricsHandler handles dynamic metrics management for Pools and Tokens
type AdminMetricsHandler struct {
	metricsService *services.MetricsService
}

// NewAdminMetricsHandler creates a new AdminMetricsHandler
func NewAdminMetricsHandler() *AdminMetricsHandler {
	return &AdminMetricsHandler{
		metricsService: services.NewMetricsService(),
	}
}

// ============================================================================
// Pool (Adapter) Metrics
// ============================================================================

// UpdatePoolMetricsHandler updates metrics for a Pool
// POST /api/admin/pools/:id/metrics
func (h *AdminMetricsHandler) UpdatePoolMetricsHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	var req struct {
		ChainID    uint32    `json:"chain_id" binding:"required"`
		MetricType string    `json:"metric_type" binding:"required"` // apy, tvl, volume_24h
		MetricName string    `json:"metric_name" binding:"required"` // "年化收益率", "APY", "TVL"
		Value      string    `json:"value" binding:"required"`
		Unit       string    `json:"unit"`        // "%", "USD"
		RecordedAt time.Time `json:"recorded_at"` // Optional, defaults to now
		Source     string    `json:"source"`      // "manual", "api", "contract"
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Default values
	if req.RecordedAt.IsZero() {
		req.RecordedAt = time.Now()
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	metric := &models.IntentAdapterMetrics{
		AdapterID:  adapterID,
		ChainID:    req.ChainID,
		MetricType: req.MetricType,
		MetricName: req.MetricName,
		Value:      req.Value,
		Unit:       req.Unit,
		RecordedAt: req.RecordedAt,
		Source:     req.Source,
		IsActive:   true,
	}

	if err := h.metricsService.UpdateAdapterMetric(metric); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update metric", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Pool metric updated successfully",
		"metric":  metric,
	})
}

// GetPoolMetricsHandler gets metrics history for a Pool
// GET /api/admin/pools/:id/metrics?metric_type=apy&limit=30
func (h *AdminMetricsHandler) GetPoolMetricsHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	metricType := c.DefaultQuery("metric_type", "")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))

	metrics, err := h.metricsService.GetAdapterMetrics(adapterID, metricType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metrics", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"adapter_id": adapterID,
		"metrics":    metrics,
		"count":      len(metrics),
	})
}

// GetPoolCurrentMetricsHandler gets current (active) metrics for a Pool
// GET /api/admin/pools/:id/metrics/current
func (h *AdminMetricsHandler) GetPoolCurrentMetricsHandler(c *gin.Context) {
	adapterID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid adapter ID"})
		return
	}

	metrics, err := h.metricsService.GetCurrentAdapterMetrics(adapterID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get current metrics", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"adapter_id": adapterID,
		"metrics":    metrics,
	})
}

// ============================================================================
// Asset Token Metrics
// ============================================================================

// UpdateTokenMetricsHandler updates metrics for an Asset Token
// POST /api/admin/tokens/:asset_id/metrics
func (h *AdminMetricsHandler) UpdateTokenMetricsHandler(c *gin.Context) {
	assetID := c.Param("asset_id")

	var req struct {
		ChainID    uint32    `json:"chain_id" binding:"required"`
		MetricType string    `json:"metric_type" binding:"required"` // yield, price_change, apy, volume
		MetricName string    `json:"metric_name" binding:"required"` // "收益率", "涨跌幅", "24h Volume"
		Value      string    `json:"value" binding:"required"`
		Unit       string    `json:"unit"`        // "%", "USD", "ETH"
		RecordedAt time.Time `json:"recorded_at"` // Optional, defaults to now
		Source     string    `json:"source"`      // "manual", "api", "oracle"
		Metadata   string    `json:"metadata"`    // Optional JSON metadata
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Default values
	if req.RecordedAt.IsZero() {
		req.RecordedAt = time.Now()
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	metric := &models.IntentAssetTokenMetrics{
		AssetID:    assetID,
		ChainID:    req.ChainID,
		MetricType: req.MetricType,
		MetricName: req.MetricName,
		Value:      req.Value,
		Unit:       req.Unit,
		RecordedAt: req.RecordedAt,
		Source:     req.Source,
		IsActive:   true,
		Metadata:   req.Metadata,
	}

	if err := h.metricsService.UpdateAssetTokenMetric(metric); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update metric", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Token metric updated successfully",
		"metric":  metric,
	})
}

// GetTokenMetricsHandler gets metrics history for an Asset Token
// GET /api/admin/tokens/:asset_id/metrics?metric_type=yield&limit=30
func (h *AdminMetricsHandler) GetTokenMetricsHandler(c *gin.Context) {
	assetID := c.Param("asset_id")
	metricType := c.DefaultQuery("metric_type", "")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))

	metrics, err := h.metricsService.GetAssetTokenMetrics(assetID, metricType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metrics", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"asset_id": assetID,
		"metrics":  metrics,
		"count":    len(metrics),
	})
}

// GetTokenCurrentMetricsHandler gets current (active) metrics for an Asset Token
// GET /api/admin/tokens/:asset_id/metrics/current
func (h *AdminMetricsHandler) GetTokenCurrentMetricsHandler(c *gin.Context) {
	assetID := c.Param("asset_id")

	metrics, err := h.metricsService.GetCurrentAssetTokenMetrics(assetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get current metrics", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"asset_id": assetID,
		"metrics":  metrics,
	})
}

// ============================================================================
// Batch Operations
// ============================================================================

// BatchUpdateMetricsHandler updates multiple metrics at once
// POST /api/admin/metrics/batch
func (h *AdminMetricsHandler) BatchUpdateMetricsHandler(c *gin.Context) {
	var req struct {
		PoolMetrics  []models.IntentAdapterMetrics    `json:"pool_metrics"`
		TokenMetrics []models.IntentAssetTokenMetrics `json:"token_metrics"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	results, err := h.metricsService.BatchUpdateMetrics(req.PoolMetrics, req.TokenMetrics)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to batch update metrics", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Batch update completed",
		"results": results,
	})
}
