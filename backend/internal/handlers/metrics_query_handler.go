package handlers

import (
	"go-backend/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// MetricsQueryHandler handles public queries for metrics (user-facing, read-only)
type MetricsQueryHandler struct {
	metricsService *services.MetricsService
}

// NewMetricsQueryHandler creates a new MetricsQueryHandler
func NewMetricsQueryHandler() *MetricsQueryHandler {
	return &MetricsQueryHandler{
		metricsService: services.NewMetricsService(),
	}
}

// ============================================================================
// Public Query Endpoints (No Authentication Required)
// ============================================================================

// GetPoolMetricsHandler gets current metrics for a Pool (public endpoint)
// GET /api/v2/pools/:id/metrics
func (h *MetricsQueryHandler) GetPoolMetricsHandler(c *gin.Context) {
	poolID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pool ID"})
		return
	}

	metrics, err := h.metricsService.GetCurrentAdapterMetrics(poolID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metrics", "details": err.Error()})
		return
	}

	// Format metrics as key-value map for easier frontend consumption
	metricsMap := make(map[string]interface{})
	for _, m := range metrics {
		metricsMap[m.MetricType] = gin.H{
			"name":        m.MetricName,
			"value":       m.Value,
			"unit":        m.Unit,
			"recorded_at": m.RecordedAt,
			"source":      m.Source,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"pool_id": poolID,
		"metrics": metricsMap,
	})
}

// GetTokenMetricsHandler gets current metrics for an Asset Token (public endpoint)
// GET /api/v2/tokens/:asset_id/metrics
func (h *MetricsQueryHandler) GetTokenMetricsHandler(c *gin.Context) {
	assetID := c.Param("asset_id")

	metrics, err := h.metricsService.GetCurrentAssetTokenMetrics(assetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metrics", "details": err.Error()})
		return
	}

	// Format metrics as key-value map for easier frontend consumption
	metricsMap := make(map[string]interface{})
	for _, m := range metrics {
		metricsMap[m.MetricType] = gin.H{
			"name":        m.MetricName,
			"value":       m.Value,
			"unit":        m.Unit,
			"recorded_at": m.RecordedAt,
			"source":      m.Source,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"asset_id": assetID,
		"metrics":  metricsMap,
	})
}

// GetPoolMetricsHistoryHandler gets metrics history for a Pool (public endpoint)
// GET /api/v2/pools/:id/metrics/history?metric_type=apy&days=7
func (h *MetricsQueryHandler) GetPoolMetricsHistoryHandler(c *gin.Context) {
	poolID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pool ID"})
		return
	}

	metricType := c.Query("metric_type")
	if metricType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "metric_type is required"})
		return
	}

	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	limit := days * 2 // Assume at most 2 updates per day

	metrics, err := h.metricsService.GetAdapterMetrics(poolID, metricType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metrics history", "details": err.Error()})
		return
	}

	// Format for chart display
	dataPoints := make([]gin.H, 0, len(metrics))
	for _, m := range metrics {
		dataPoints = append(dataPoints, gin.H{
			"timestamp": m.RecordedAt,
			"value":     m.Value,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"pool_id":     poolID,
		"metric_type": metricType,
		"metric_name": metrics[0].MetricName,
		"unit":        metrics[0].Unit,
		"data":        dataPoints,
	})
}

// GetTokenMetricsHistoryHandler gets metrics history for an Asset Token (public endpoint)
// GET /api/v2/tokens/:asset_id/metrics/history?metric_type=yield&days=7
func (h *MetricsQueryHandler) GetTokenMetricsHistoryHandler(c *gin.Context) {
	assetID := c.Param("asset_id")

	metricType := c.Query("metric_type")
	if metricType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "metric_type is required"})
		return
	}

	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	limit := days * 2 // Assume at most 2 updates per day

	metrics, err := h.metricsService.GetAssetTokenMetrics(assetID, metricType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metrics history", "details": err.Error()})
		return
	}

	// Format for chart display
	dataPoints := make([]gin.H, 0, len(metrics))
	for _, m := range metrics {
		dataPoints = append(dataPoints, gin.H{
			"timestamp": m.RecordedAt,
			"value":     m.Value,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"asset_id":    assetID,
		"metric_type": metricType,
		"metric_name": metrics[0].MetricName,
		"unit":        metrics[0].Unit,
		"data":        dataPoints,
	})
}

// GetMultiplePoolMetricsHandler gets metrics for multiple pools at once
// POST /api/v2/pools/metrics
// Body: {"pool_ids": [1, 2, 3]}
func (h *MetricsQueryHandler) GetMultiplePoolMetricsHandler(c *gin.Context) {
	var req struct {
		PoolIDs []uint64 `json:"pool_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	results := make(map[uint64]map[string]interface{})

	for _, poolID := range req.PoolIDs {
		metrics, err := h.metricsService.GetCurrentAdapterMetrics(poolID)
		if err != nil {
			continue // Skip failed queries
		}

		metricsMap := make(map[string]interface{})
		for _, m := range metrics {
			metricsMap[m.MetricType] = gin.H{
				"name":  m.MetricName,
				"value": m.Value,
				"unit":  m.Unit,
			}
		}
		results[poolID] = metricsMap
	}

	c.JSON(http.StatusOK, gin.H{
		"metrics": results,
	})
}

// GetMultipleTokenMetricsHandler gets metrics for multiple tokens at once
// POST /api/v2/tokens/metrics
// Body: {"asset_ids": ["0x...", "0x..."]}
func (h *MetricsQueryHandler) GetMultipleTokenMetricsHandler(c *gin.Context) {
	var req struct {
		AssetIDs []string `json:"asset_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	results := make(map[string]map[string]interface{})

	for _, assetID := range req.AssetIDs {
		metrics, err := h.metricsService.GetCurrentAssetTokenMetrics(assetID)
		if err != nil {
			continue // Skip failed queries
		}

		metricsMap := make(map[string]interface{})
		for _, m := range metrics {
			metricsMap[m.MetricType] = gin.H{
				"name":  m.MetricName,
				"value": m.Value,
				"unit":  m.Unit,
			}
		}
		results[assetID] = metricsMap
	}

	c.JSON(http.StatusOK, gin.H{
		"metrics": results,
	})
}

