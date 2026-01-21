package services

import (
	"fmt"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"time"

	"gorm.io/gorm"
)

// MetricsService handles dynamic metrics for Pools and Asset Tokens
type MetricsService struct {
	db *gorm.DB
}

// NewMetricsService creates a new MetricsService
func NewMetricsService() *MetricsService {
	return &MetricsService{
		db: db.DB,
	}
}

// ============================================================================
// Adapter (Pool) Metrics
// ============================================================================

// UpdateAdapterMetric updates or creates a metric for an Adapter
// This will set previous metrics of the same type to is_active=false
func (s *MetricsService) UpdateAdapterMetric(metric *models.IntentAdapterMetrics) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Set all previous metrics of this type to inactive
		if err := tx.Model(&models.IntentAdapterMetrics{}).
			Where("adapter_id = ? AND chain_id = ? AND metric_type = ?", metric.AdapterID, metric.ChainID, metric.MetricType).
			Update("is_active", false).Error; err != nil {
			return fmt.Errorf("failed to deactivate old metrics: %w", err)
		}

		// Create new metric
		if err := tx.Create(metric).Error; err != nil {
			return fmt.Errorf("failed to create metric: %w", err)
		}

		return nil
	})
}

// GetAdapterMetrics retrieves metrics history for an Adapter
func (s *MetricsService) GetAdapterMetrics(adapterID uint64, metricType string, limit int) ([]models.IntentAdapterMetrics, error) {
	var metrics []models.IntentAdapterMetrics

	query := s.db.Where("adapter_id = ?", adapterID)

	if metricType != "" {
		query = query.Where("metric_type = ?", metricType)
	}

	if limit <= 0 {
		limit = 30
	}

	err := query.Order("recorded_at DESC").Limit(limit).Find(&metrics).Error
	return metrics, err
}

// GetCurrentAdapterMetrics retrieves current (active) metrics for an Adapter
func (s *MetricsService) GetCurrentAdapterMetrics(adapterID uint64) ([]models.IntentAdapterMetrics, error) {
	var metrics []models.IntentAdapterMetrics

	err := s.db.Where("adapter_id = ? AND is_active = ?", adapterID, true).
		Order("metric_type ASC").
		Find(&metrics).Error

	return metrics, err
}

// GetCurrentAdapterMetricByType retrieves a specific current metric for an Adapter
func (s *MetricsService) GetCurrentAdapterMetricByType(adapterID uint64, chainID uint32, metricType string) (*models.IntentAdapterMetrics, error) {
	var metric models.IntentAdapterMetrics

	err := s.db.Where("adapter_id = ? AND chain_id = ? AND metric_type = ? AND is_active = ?",
		adapterID, chainID, metricType, true).
		First(&metric).Error

	if err != nil {
		return nil, err
	}

	return &metric, nil
}

// ============================================================================
// Asset Token Metrics
// ============================================================================

// UpdateAssetTokenMetric updates or creates a metric for an Asset Token
// This will set previous metrics of the same type to is_active=false
func (s *MetricsService) UpdateAssetTokenMetric(metric *models.IntentAssetTokenMetrics) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Set all previous metrics of this type to inactive
		if err := tx.Model(&models.IntentAssetTokenMetrics{}).
			Where("asset_id = ? AND chain_id = ? AND metric_type = ?", metric.AssetID, metric.ChainID, metric.MetricType).
			Update("is_active", false).Error; err != nil {
			return fmt.Errorf("failed to deactivate old metrics: %w", err)
		}

		// Create new metric
		if err := tx.Create(metric).Error; err != nil {
			return fmt.Errorf("failed to create metric: %w", err)
		}

		return nil
	})
}

// GetAssetTokenMetrics retrieves metrics history for an Asset Token
func (s *MetricsService) GetAssetTokenMetrics(assetID string, metricType string, limit int) ([]models.IntentAssetTokenMetrics, error) {
	var metrics []models.IntentAssetTokenMetrics

	query := s.db.Where("asset_id = ?", assetID)

	if metricType != "" {
		query = query.Where("metric_type = ?", metricType)
	}

	if limit <= 0 {
		limit = 30
	}

	err := query.Order("recorded_at DESC").Limit(limit).Find(&metrics).Error
	return metrics, err
}

// GetCurrentAssetTokenMetrics retrieves current (active) metrics for an Asset Token
func (s *MetricsService) GetCurrentAssetTokenMetrics(assetID string) ([]models.IntentAssetTokenMetrics, error) {
	var metrics []models.IntentAssetTokenMetrics

	err := s.db.Where("asset_id = ? AND is_active = ?", assetID, true).
		Order("metric_type ASC").
		Find(&metrics).Error

	return metrics, err
}

// GetCurrentAssetTokenMetricByType retrieves a specific current metric for an Asset Token
func (s *MetricsService) GetCurrentAssetTokenMetricByType(assetID string, chainID uint32, metricType string) (*models.IntentAssetTokenMetrics, error) {
	var metric models.IntentAssetTokenMetrics

	err := s.db.Where("asset_id = ? AND chain_id = ? AND metric_type = ? AND is_active = ?",
		assetID, chainID, metricType, true).
		First(&metric).Error

	if err != nil {
		return nil, err
	}

	return &metric, nil
}

// ============================================================================
// Batch Operations
// ============================================================================

// BatchUpdateMetrics updates multiple metrics at once
func (s *MetricsService) BatchUpdateMetrics(poolMetrics []models.IntentAdapterMetrics, tokenMetrics []models.IntentAssetTokenMetrics) (map[string]interface{}, error) {
	results := make(map[string]interface{})
	var poolSuccess, tokenSuccess int
	var poolErrors, tokenErrors []string

	// Update pool metrics
	for _, metric := range poolMetrics {
		if err := s.UpdateAdapterMetric(&metric); err != nil {
			poolErrors = append(poolErrors, fmt.Sprintf("Adapter %d: %v", metric.AdapterID, err))
		} else {
			poolSuccess++
		}
	}

	// Update token metrics
	for _, metric := range tokenMetrics {
		if err := s.UpdateAssetTokenMetric(&metric); err != nil {
			tokenErrors = append(tokenErrors, fmt.Sprintf("Asset %s: %v", metric.AssetID, err))
		} else {
			tokenSuccess++
		}
	}

	results["pool_metrics_updated"] = poolSuccess
	results["token_metrics_updated"] = tokenSuccess
	results["pool_errors"] = poolErrors
	results["token_errors"] = tokenErrors

	return results, nil
}

// ============================================================================
// Cleanup & Maintenance
// ============================================================================

// CleanupOldMetrics removes metrics older than the specified duration
func (s *MetricsService) CleanupOldMetrics(olderThan time.Duration) error {
	cutoffTime := time.Now().Add(-olderThan)

	return s.db.Transaction(func(tx *gorm.DB) error {
		// Delete old adapter metrics
		if err := tx.Where("recorded_at < ? AND is_active = ?", cutoffTime, false).
			Delete(&models.IntentAdapterMetrics{}).Error; err != nil {
			return fmt.Errorf("failed to cleanup adapter metrics: %w", err)
		}

		// Delete old token metrics
		if err := tx.Where("recorded_at < ? AND is_active = ?", cutoffTime, false).
			Delete(&models.IntentAssetTokenMetrics{}).Error; err != nil {
			return fmt.Errorf("failed to cleanup token metrics: %w", err)
		}

		return nil
	})
}
