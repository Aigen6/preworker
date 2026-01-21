package services

import (
	"fmt"
	"time"

	"go-backend/internal/models"
)

// CheckAdapterExists checks if an adapter already exists with the given chain_id and adapter_id
func (s *IntentService) CheckAdapterExists(chainID uint32, adapterID uint32) (bool, error) {
	var count int64
	err := s.db.Model(&models.IntentAdapter{}).
		Where("chain_id = ? AND adapter_id = ?", chainID, adapterID).
		Count(&count).Error

	if err != nil {
		return false, fmt.Errorf("failed to check adapter existence: %w", err)
	}

	return count > 0, nil
}

// CreateAdapterFromChain creates a new adapter record from chain data
func (s *IntentService) CreateAdapterFromChain(chainID uint32, info interface{}) error {
	// Convert info to the right type
	var adapterID uint32
	var address string
	var isActive bool

	switch v := info.(type) {
	case AdapterInfo:
		adapterID = v.AdapterID
		address = v.Address
		isActive = v.IsActive
	case map[string]interface{}:
		adapterID = uint32(v["adapter_id"].(float64))
		address = v["address"].(string)
		isActive = v["is_active"].(bool)
	default:
		return fmt.Errorf("unsupported info type")
	}
	adapter := models.IntentAdapter{
		AdapterID:   adapterID,
		ChainID:     chainID,
		Address:     address,
		Name:        fmt.Sprintf("Adapter #%d", adapterID), // Default name
		Protocol:    "Unknown",                             // Default protocol
		Description: fmt.Sprintf("Imported from chain (Chain ID: %d)", chainID),
		IsActive:    isActive,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := s.db.Create(&adapter).Error
	if err != nil {
		return fmt.Errorf("failed to create adapter: %w", err)
	}

	return nil
}

// AdapterInfo represents basic adapter information from chain
type AdapterInfo struct {
	AdapterID uint32 `json:"adapter_id"`
	Address   string `json:"address"`
	IsActive  bool   `json:"is_active"`
}
