package interfaces

import "go-backend/internal/models"

// IntentServiceInterface defines the interface for IntentService
// This interface is used to break circular dependencies between clients and services packages
type IntentServiceInterface interface {
	// GetAssetToken retrieves an AssetToken by asset_id
	GetAssetToken(assetID string) (*models.IntentAssetToken, error)
}












