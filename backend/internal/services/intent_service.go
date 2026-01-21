package services

import (
	"encoding/hex"
	"errors"
	"fmt"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/utils"
	"log"
	"strings"

	"gorm.io/gorm"
)

// IntentService Intent configuration management service
type IntentService struct {
	db *gorm.DB
}

// NewIntentService create new IntentService instance
func NewIntentService() *IntentService {
	return &IntentService{
		db: db.DB,
	}
}

// DB returns the database instance (for handlers to perform custom queries)
func (s *IntentService) DB() *gorm.DB {
	return s.db
}

// ============ Asset Token ID Encoding/Decoding ============

// EncodeAssetID encodes adapter_id and token_id into a bytes32 hex string
// Format: [adapter_id (4 bytes)] [token_id (2 bytes)] [reserved (26 bytes)]
// Example: adapter_id=1, token_id=1 => 0x0000000100010000000000000000000000000000000000000000000000000000
func EncodeAssetID(adapterID uint32, tokenID uint16) string {
	// Create 32-byte array
	assetID := make([]byte, 32)

	// Bytes 0-3: Adapter ID (big-endian)
	assetID[0] = byte(adapterID >> 24)
	assetID[1] = byte(adapterID >> 16)
	assetID[2] = byte(adapterID >> 8)
	assetID[3] = byte(adapterID)

	// Bytes 4-5: Token ID (big-endian)
	assetID[4] = byte(tokenID >> 8)
	assetID[5] = byte(tokenID)

	// Bytes 6-31: Reserved (already zero)

	return "0x" + hex.EncodeToString(assetID)
}

// DecodeAssetID decodes a bytes32 hex string into adapter_id and token_id
// Returns: (adapterID, tokenID, error)
func DecodeAssetID(assetID string) (uint32, uint16, error) {
	// Remove 0x prefix if present
	assetID = strings.TrimPrefix(assetID, "0x")

	// Decode hex string
	bytes, err := hex.DecodeString(assetID)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid hex string: %w", err)
	}

	if len(bytes) != 32 {
		return 0, 0, fmt.Errorf("asset_id must be 32 bytes, got %d", len(bytes))
	}

	// Extract Adapter ID (bytes 0-3)
	adapterID := uint32(bytes[0])<<24 | uint32(bytes[1])<<16 | uint32(bytes[2])<<8 | uint32(bytes[3])

	// Extract Token ID (bytes 4-5)
	tokenID := uint16(bytes[4])<<8 | uint16(bytes[5])

	return adapterID, tokenID, nil
}

// ============ Raw Token Management ============

// GetRawToken get RawToken by token_identifier
func (s *IntentService) GetRawToken(tokenIdentifier string) (*models.IntentRawToken, error) {
	var token models.IntentRawToken
	tokenIdentifier = strings.ToLower(tokenIdentifier)

	err := s.db.Where("token_identifier = ?", tokenIdentifier).First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// ============ Raw Token Chain Management ============

// GetRawTokenChains get all chains for a RawToken
func (s *IntentService) GetRawTokenChains(tokenIdentifier string, isActive *bool) ([]models.IntentRawTokenChain, error) {
	var chains []models.IntentRawTokenChain
	tokenIdentifier = strings.ToLower(tokenIdentifier)

	query := s.db.Where("token_identifier = ?", tokenIdentifier)
	if isActive != nil {
		query = query.Where("is_active = ?", *isActive)
	}

	err := query.Order("chain_id ASC").Find(&chains).Error
	return chains, err
}

// GetRawTokenChain get specific chain configuration for RawToken
func (s *IntentService) GetRawTokenChain(tokenIdentifier string, chainID uint32) (*models.IntentRawTokenChain, error) {
	var chain models.IntentRawTokenChain
	tokenIdentifier = strings.ToLower(tokenIdentifier)

	err := s.db.Where("token_identifier = ? AND chain_id = ?", tokenIdentifier, chainID).First(&chain).Error
	if err != nil {
		return nil, err
	}
	return &chain, nil
}

// UpdateRawTokenChain update RawTokenChain configuration
func (s *IntentService) UpdateRawTokenChain(tokenIdentifier string, chainID uint32, updates map[string]interface{}) error {
	tokenIdentifier = strings.ToLower(tokenIdentifier)

	return s.db.Model(&models.IntentRawTokenChain{}).
		Where("token_identifier = ? AND chain_id = ?", tokenIdentifier, chainID).
		Updates(updates).Error
}

// DeleteRawTokenChain delete RawTokenChain configuration
func (s *IntentService) DeleteRawTokenChain(tokenIdentifier string, chainID uint32) error {
	tokenIdentifier = strings.ToLower(tokenIdentifier)

	return s.db.Where("token_identifier = ? AND chain_id = ?", tokenIdentifier, chainID).
		Delete(&models.IntentRawTokenChain{}).Error
}

// ============ Asset Token Management ============

// CreateAssetToken create a new AssetToken
func (s *IntentService) CreateAssetToken(token *models.IntentAssetToken) error {
	if token.Symbol == "" {
		return errors.New("symbol is required")
	}

	// Get Pool to obtain Chain ID
	var pool models.IntentAdapter
	if err := s.db.Where("id = ?", token.AdapterID).First(&pool).Error; err != nil {
		return fmt.Errorf("pool not found: %w", err)
	}

	// Set ChainID from pool
	token.ChainID = pool.ChainID

	// If AssetID is provided, decode it to extract ChainID, AdapterID and TokenID (for validation)
	if token.AssetID != "" {
		token.AssetID = strings.ToLower(token.AssetID)
		chainID, adapterID, tokenID, err := utils.DecodeAssetID(token.AssetID)
		if err != nil {
			return fmt.Errorf("invalid asset_id: %w", err)
		}

		// Validate decoded values match pool and provided values
		if chainID != pool.ChainID {
			return fmt.Errorf("asset_id chain_id (%d) must match pool chain_id (%d)", chainID, pool.ChainID)
		}
		if adapterID != pool.AdapterID {
			return fmt.Errorf("asset_id adapter_id (%d) must match pool adapter_id (%d)", adapterID, pool.AdapterID)
		}

		// Set values from decoded asset_id
		token.ChainID = chainID
		token.AdapterID = adapterID
		token.TokenID = tokenID
	} else {
		// If AssetID is not provided, TokenID must be provided
		if token.TokenID == 0 {
			return errors.New("token_id must be provided")
		}
		// Set ChainID and AdapterID from pool
		token.ChainID = pool.ChainID
		token.AdapterID = pool.AdapterID
		// TokenID is already set
		
		// Generate AssetID from ChainID, AdapterID and TokenID (for backward compatibility)
		token.AssetID = utils.EncodeAssetID(token.ChainID, token.AdapterID, token.TokenID)
	}

	return s.db.Create(token).Error
}

// GetAssetToken get AssetToken by asset_id (backward compatible)
func (s *IntentService) GetAssetToken(assetID string) (*models.IntentAssetToken, error) {
	var token models.IntentAssetToken
	assetID = strings.ToLower(assetID)

	// Try to find by asset_id first (backward compatible)
	err := s.db.Where("asset_id = ?", assetID).First(&token).Error
	if err == nil {
		// If found, ensure chain_id is set (for old records)
		if token.ChainID == 0 && token.AssetID != "" {
			chainID, _, _, decodeErr := utils.DecodeAssetID(token.AssetID)
			if decodeErr == nil {
				token.ChainID = chainID
			}
		}
		return &token, nil
	}

	// If not found by asset_id, try to decode and find by three fields
	chainID, adapterID, tokenID, decodeErr := utils.DecodeAssetID(assetID)
	if decodeErr != nil {
		return nil, err // Return original error
	}

	// Find by three fields
	err = s.db.Where("chain_id = ? AND adapter_id = ? AND token_id = ?", chainID, adapterID, tokenID).First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// GetAssetTokenByFields get AssetToken by chain_id, adapter_id, and token_id
func (s *IntentService) GetAssetTokenByFields(chainID uint32, adapterID uint32, tokenID uint16) (*models.IntentAssetToken, error) {
	var token models.IntentAssetToken

	err := s.db.Where("chain_id = ? AND adapter_id = ? AND token_id = ?", chainID, adapterID, tokenID).First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// ListAssetTokens list all AssetTokens (with optional filter by protocol or is_active)
func (s *IntentService) ListAssetTokens(protocol string, isActive *bool) ([]models.IntentAssetToken, error) {
	var tokens []models.IntentAssetToken
	query := s.db.Model(&models.IntentAssetToken{})

	if protocol != "" {
		query = query.Where("protocol = ?", protocol)
	}
	if isActive != nil {
		query = query.Where("is_active = ?", *isActive)
	}

	err := query.Order("symbol ASC").Find(&tokens).Error
	return tokens, err
}

// UpdateAssetToken update AssetToken
func (s *IntentService) UpdateAssetToken(assetID string, updates map[string]interface{}) error {
	assetID = strings.ToLower(assetID)

	return s.db.Model(&models.IntentAssetToken{}).
		Where("asset_id = ?", assetID).
		Updates(updates).Error
}

// DeleteAssetToken delete AssetToken (cascade delete related chains)
func (s *IntentService) DeleteAssetToken(assetID string) error {
	assetID = strings.ToLower(assetID)

	return s.db.Where("asset_id = ?", assetID).Delete(&models.IntentAssetToken{}).Error
}

// ============ Asset Token Chain Management ============

// AddAssetTokenChain add a chain configuration for AssetToken
func (s *IntentService) AddAssetTokenChain(chain *models.IntentAssetTokenChain) error {
	if chain.AssetID == "" || chain.ChainID == 0 || chain.AdapterAddress == "" || chain.AssetTokenAddress == "" {
		return errors.New("asset_id, chain_id, adapter_address, and asset_token_address are required")
	}

	chain.AssetID = strings.ToLower(chain.AssetID)
	chain.AdapterAddress = strings.ToLower(chain.AdapterAddress)
	chain.AssetTokenAddress = strings.ToLower(chain.AssetTokenAddress)

	// Check if parent AssetToken exists
	var token models.IntentAssetToken
	if err := s.db.Where("asset_id = ?", chain.AssetID).First(&token).Error; err != nil {
		return fmt.Errorf("parent asset token not found: %w", err)
	}

	return s.db.Create(chain).Error
}

// GetAssetTokenChains get all chains for an AssetToken
func (s *IntentService) GetAssetTokenChains(assetID string, isActive *bool) ([]models.IntentAssetTokenChain, error) {
	var chains []models.IntentAssetTokenChain
	assetID = strings.ToLower(assetID)

	query := s.db.Where("asset_id = ?", assetID)
	if isActive != nil {
		query = query.Where("is_active = ?", *isActive)
	}

	err := query.Order("chain_id ASC").Find(&chains).Error
	return chains, err
}

// GetAssetTokenChain get specific chain configuration for AssetToken
func (s *IntentService) GetAssetTokenChain(assetID string, chainID uint32) (*models.IntentAssetTokenChain, error) {
	var chain models.IntentAssetTokenChain
	assetID = strings.ToLower(assetID)

	err := s.db.Where("asset_id = ? AND chain_id = ?", assetID, chainID).First(&chain).Error
	if err != nil {
		return nil, err
	}
	return &chain, nil
}

// UpdateAssetTokenChain update AssetTokenChain configuration
func (s *IntentService) UpdateAssetTokenChain(assetID string, chainID uint32, updates map[string]interface{}) error {
	assetID = strings.ToLower(assetID)

	return s.db.Model(&models.IntentAssetTokenChain{}).
		Where("asset_id = ? AND chain_id = ?", assetID, chainID).
		Updates(updates).Error
}

// DeleteAssetTokenChain delete AssetTokenChain configuration
func (s *IntentService) DeleteAssetTokenChain(assetID string, chainID uint32) error {
	assetID = strings.ToLower(assetID)

	return s.db.Where("asset_id = ? AND chain_id = ?", assetID, chainID).
		Delete(&models.IntentAssetTokenChain{}).Error
}

// ============ Adapter Management ============

// CreateAdapter create a new Adapter
func (s *IntentService) CreateAdapter(adapter *models.IntentAdapter) error {
	if adapter.ChainID == 0 || adapter.Address == "" {
		return errors.New("chain_id and address are required")
	}

	adapter.Address = strings.ToLower(adapter.Address)
	if adapter.AssetTokenAddress != "" {
		adapter.AssetTokenAddress = strings.ToLower(adapter.AssetTokenAddress)
	}
	if adapter.BaseTokenAddress != "" {
		adapter.BaseTokenAddress = strings.ToLower(adapter.BaseTokenAddress)
	}
	if adapter.ImplementationAddr != "" {
		adapter.ImplementationAddr = strings.ToLower(adapter.ImplementationAddr)
	}
	if adapter.AdminAddress != "" {
		adapter.AdminAddress = strings.ToLower(adapter.AdminAddress)
	}

	return s.db.Create(adapter).Error
}

// GetAdapter get Adapter by chain_id and address
func (s *IntentService) GetAdapter(chainID uint32, address string) (*models.IntentAdapter, error) {
	var adapter models.IntentAdapter
	address = strings.ToLower(address)

	err := s.db.Where("chain_id = ? AND address = ?", chainID, address).First(&adapter).Error
	if err != nil {
		return nil, err
	}
	return &adapter, nil
}

// ListAdapters list all Adapters (with optional filters)
func (s *IntentService) ListAdapters(chainID *uint32, protocol string, isActive *bool) ([]models.IntentAdapter, error) {
	var adapters []models.IntentAdapter
	query := s.db.Model(&models.IntentAdapter{})

	if chainID != nil {
		query = query.Where("chain_id = ?", *chainID)
	}
	if protocol != "" {
		query = query.Where("protocol = ?", protocol)
	}
	if isActive != nil {
		query = query.Where("is_active = ?", *isActive)
	}

	err := query.Order("chain_id ASC, name ASC").Find(&adapters).Error
	return adapters, err
}

// UpdateAdapter update Adapter
func (s *IntentService) UpdateAdapter(chainID uint32, address string, updates map[string]interface{}) error {
	address = strings.ToLower(address)

	// Normalize addresses in updates
	if addr, ok := updates["asset_token_address"]; ok {
		if addrStr, ok := addr.(string); ok && addrStr != "" {
			updates["asset_token_address"] = strings.ToLower(addrStr)
		}
	}
	if addr, ok := updates["base_token_address"]; ok {
		if addrStr, ok := addr.(string); ok && addrStr != "" {
			updates["base_token_address"] = strings.ToLower(addrStr)
		}
	}
	if addr, ok := updates["implementation_address"]; ok {
		if addrStr, ok := addr.(string); ok && addrStr != "" {
			updates["implementation_address"] = strings.ToLower(addrStr)
		}
	}
	if addr, ok := updates["admin_address"]; ok {
		if addrStr, ok := addr.(string); ok && addrStr != "" {
			updates["admin_address"] = strings.ToLower(addrStr)
		}
	}

	return s.db.Model(&models.IntentAdapter{}).
		Where("chain_id = ? AND address = ?", chainID, address).
		Updates(updates).Error
}

// DeleteAdapter delete Adapter
func (s *IntentService) DeleteAdapter(chainID uint32, address string) error {
	address = strings.ToLower(address)

	return s.db.Where("chain_id = ? AND address = ?", chainID, address).
		Delete(&models.IntentAdapter{}).Error
}

// PauseAdapter pause an Adapter
func (s *IntentService) PauseAdapter(chainID uint32, address string) error {
	return s.UpdateAdapter(chainID, address, map[string]interface{}{"is_paused": true})
}

// ResumeAdapter resume an Adapter
func (s *IntentService) ResumeAdapter(chainID uint32, address string) error {
	return s.UpdateAdapter(chainID, address, map[string]interface{}{"is_paused": false})
}

// ============ Adapter Stats Management ============

// GetAdapterStats get statistics for an Adapter
func (s *IntentService) GetAdapterStats(adapterID uint64) (*models.IntentAdapterStats, error) {
	var stats models.IntentAdapterStats

	err := s.db.Where("adapter_id = ?", adapterID).First(&stats).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Create initial stats record
			stats = models.IntentAdapterStats{
				AdapterID:        adapterID,
				TotalConversions: 0,
				TotalVolume:      "0",
			}
			if err := s.db.Create(&stats).Error; err != nil {
				return nil, err
			}
			return &stats, nil
		}
		return nil, err
	}
	return &stats, nil
}

// UpdateAdapterStats update Adapter statistics
func (s *IntentService) UpdateAdapterStats(adapterID uint64, updates map[string]interface{}) error {
	return s.db.Model(&models.IntentAdapterStats{}).
		Where("adapter_id = ?", adapterID).
		Updates(updates).Error
}

// ============ Query Helpers (User-facing) ============

// GetRawTokenWithChains get RawToken with all its chain configurations
func (s *IntentService) GetRawTokenWithChains(tokenIdentifier string) (map[string]interface{}, error) {
	token, err := s.GetRawToken(tokenIdentifier)
	if err != nil {
		return nil, err
	}

	chains, err := s.GetRawTokenChains(tokenIdentifier, nil)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"token":  token,
		"chains": chains,
	}, nil
}

// GetAssetTokenWithChains get AssetToken with all its chain configurations
func (s *IntentService) GetAssetTokenWithChains(assetID string) (map[string]interface{}, error) {
	token, err := s.GetAssetToken(assetID)
	if err != nil {
		return nil, err
	}

	chains, err := s.GetAssetTokenChains(assetID, nil)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"token":  token,
		"chains": chains,
	}, nil
}

// GetAdapterWithStats get Adapter with its statistics
func (s *IntentService) GetAdapterWithStats(chainID uint32, address string) (map[string]interface{}, error) {
	adapter, err := s.GetAdapter(chainID, address)
	if err != nil {
		return nil, err
	}

	stats, err := s.GetAdapterStats(adapter.ID)
	if err != nil {
		log.Printf("Failed to get adapter stats: %v", err)
		stats = nil // Continue without stats
	}

	return map[string]interface{}{
		"adapter": adapter,
		"stats":   stats,
	}, nil
}

// ValidateRawTokenIntent validate if RawToken intent is valid
func (s *IntentService) ValidateRawTokenIntent(tokenIdentifier string, chainID uint32) error {
	chain, err := s.GetRawTokenChain(tokenIdentifier, chainID)
	if err != nil {
		return fmt.Errorf("raw token chain not found: %w", err)
	}

	if !chain.IsActive {
		return errors.New("raw token chain is not active")
	}

	// Check parent token is active
	token, err := s.GetRawToken(tokenIdentifier)
	if err != nil {
		return fmt.Errorf("raw token not found: %w", err)
	}

	if !token.IsActive {
		return errors.New("raw token is not active")
	}

	return nil
}

// ValidateAssetTokenIntent validate if AssetToken intent is valid
func (s *IntentService) ValidateAssetTokenIntent(assetID string, chainID uint32) error {
	chain, err := s.GetAssetTokenChain(assetID, chainID)
	if err != nil {
		return fmt.Errorf("asset token chain not found: %w", err)
	}

	if !chain.IsActive {
		return errors.New("asset token chain is not active")
	}

	// Check parent token is active
	token, err := s.GetAssetToken(assetID)
	if err != nil {
		return fmt.Errorf("asset token not found: %w", err)
	}

	if !token.IsActive {
		return errors.New("asset token is not active")
	}

	// Check adapter is active and not paused
	adapter, err := s.GetAdapter(chainID, chain.AdapterAddress)
	if err != nil {
		return fmt.Errorf("adapter not found: %w", err)
	}

	if !adapter.IsActive {
		return errors.New("adapter is not active")
	}

	if adapter.IsPaused {
		return errors.New("adapter is paused")
	}

	return nil
}
