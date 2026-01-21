package repository

import (
	"context"
	"fmt"
	"log"

	"go-backend/internal/models"

	"gorm.io/gorm"
)

// WithdrawRequestRepository defines the interface for WithdrawRequest data access
type WithdrawRequestRepository interface {
	// Basic CRUD operations
	Create(ctx context.Context, request *models.WithdrawRequest) error
	GetByID(ctx context.Context, id string) (*models.WithdrawRequest, error)
	GetByNullifier(ctx context.Context, nullifier string) (*models.WithdrawRequest, error)
	GetByPayoutTxHash(ctx context.Context, txHash string) (*models.WithdrawRequest, error)
	Update(ctx context.Context, request *models.WithdrawRequest) error
	Delete(ctx context.Context, id string) error

	// Query methods
	FindByOwner(ctx context.Context, ownerChainID uint32, ownerData string, page, pageSize int) ([]*models.WithdrawRequest, int64, error)
	FindByBeneficiary(ctx context.Context, beneficiaryChainID uint32, beneficiaryData string, page, pageSize int) ([]*models.WithdrawRequest, int64, error)
	FindByStatus(ctx context.Context, status string) ([]*models.WithdrawRequest, error)
	FindByProofStatus(ctx context.Context, status models.ProofStatus) ([]*models.WithdrawRequest, error)
	FindByExecuteStatus(ctx context.Context, status models.ExecuteStatus) ([]*models.WithdrawRequest, error)
	FindByPayoutStatus(ctx context.Context, status models.PayoutStatus) ([]*models.WithdrawRequest, error)
	FindByHookStatus(ctx context.Context, status models.HookStatus) ([]*models.WithdrawRequest, error)
	CountByOwner(ctx context.Context, ownerChainID uint32, ownerData string) (int64, error)
	CountByBeneficiary(ctx context.Context, beneficiaryChainID uint32, beneficiaryData string) (int64, error)
	CountByStatus(ctx context.Context, ownerChainID uint32, ownerData string, status string) (int64, error)

	// Status updates (Intent system)
	UpdateProofStatus(ctx context.Context, id string, status models.ProofStatus, proof string, publicValues string, err string) error
	UpdateExecuteStatus(ctx context.Context, id string, status models.ExecuteStatus, txHash string, blockNumber *uint64, err string) error
	UpdatePayoutStatus(ctx context.Context, id string, status models.PayoutStatus, txHash string, blockNumber *uint64, err string) error
	UpdateHookStatus(ctx context.Context, id string, status models.HookStatus, txHash string, err string) error
	UpdateFallbackStatus(ctx context.Context, id string, transferred bool, err string, retryCount int) error

	// Legacy status updates (for backward compatibility)
	UpdateStatus(ctx context.Context, id, status string) error
	UpdateStatusByNullifier(ctx context.Context, nullifier, status string) error

	// Update withdraw nullifier (used when proof is generated and public_values first nullifier differs)
	UpdateWithdrawNullifier(ctx context.Context, id string, nullifier string) error
}

// withdrawRequestRepository implements WithdrawRequestRepository
type withdrawRequestRepository struct {
	db *gorm.DB
}

// NewWithdrawRequestRepository creates a new WithdrawRequestRepository instance
func NewWithdrawRequestRepository(db *gorm.DB) WithdrawRequestRepository {
	return &withdrawRequestRepository{db: db}
}

// Create creates a new withdraw request
func (r *withdrawRequestRepository) Create(ctx context.Context, request *models.WithdrawRequest) error {
	return r.db.WithContext(ctx).Create(request).Error
}

// GetByID retrieves a withdraw request by ID
func (r *withdrawRequestRepository) GetByID(ctx context.Context, id string) (*models.WithdrawRequest, error) {
	var request models.WithdrawRequest
	// Use GORM First to load all fields including proof and public_values
	err := r.db.WithContext(ctx).
		Where("id = ?", id).
		First(&request).Error
	if err != nil {
		return nil, err
	}

	return &request, nil
}

// GetByNullifier retrieves a withdraw request by nullifier
func (r *withdrawRequestRepository) GetByNullifier(ctx context.Context, nullifier string) (*models.WithdrawRequest, error) {
	var request models.WithdrawRequest
	err := r.db.WithContext(ctx).Where("withdraw_nullifier = ?", nullifier).First(&request).Error
	if err != nil {
		return nil, err
	}
	return &request, nil
}

// GetByPayoutTxHash retrieves a withdraw request by payout transaction hash
// Note: There might be multiple requests with the same payout_tx_hash, so this returns the first one found
// In practice, each payout should have a unique txHash
func (r *withdrawRequestRepository) GetByPayoutTxHash(ctx context.Context, txHash string) (*models.WithdrawRequest, error) {
	var request models.WithdrawRequest
	err := r.db.WithContext(ctx).Where("payout_tx_hash = ?", txHash).First(&request).Error
	if err != nil {
		return nil, err
	}
	return &request, nil
}

// Update updates a withdraw request
func (r *withdrawRequestRepository) Update(ctx context.Context, request *models.WithdrawRequest) error {
	return r.db.WithContext(ctx).Save(request).Error
}

// Delete deletes a withdraw request
func (r *withdrawRequestRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&models.WithdrawRequest{}).Error
}

// FindByOwner finds withdraw requests by owner with pagination
func (r *withdrawRequestRepository) FindByOwner(ctx context.Context, ownerChainID uint32, ownerData string, page, pageSize int) ([]*models.WithdrawRequest, int64, error) {
	var requests []*models.WithdrawRequest
	var total int64

	query := r.db.WithContext(ctx).
		Where("owner_chain_id = ? AND owner_data = ?", ownerChainID, ownerData)

	// Count total
	if err := query.Model(&models.WithdrawRequest{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	offset := (page - 1) * pageSize
	err := query.
		Offset(offset).
		Limit(pageSize).
		Order("created_at DESC").
		Find(&requests).Error

	return requests, total, err
}

// FindByBeneficiary finds withdraw requests by beneficiary address with pagination
func (r *withdrawRequestRepository) FindByBeneficiary(ctx context.Context, beneficiaryChainID uint32, beneficiaryData string, page, pageSize int) ([]*models.WithdrawRequest, int64, error) {
	var requests []*models.WithdrawRequest
	var total int64

	query := r.db.WithContext(ctx).
		Where("recipient_slip44_chain_id = ? AND recipient_data = ?", beneficiaryChainID, beneficiaryData)

	// Count total
	if err := query.Model(&models.WithdrawRequest{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	offset := (page - 1) * pageSize
	err := query.
		Offset(offset).
		Limit(pageSize).
		Order("created_at DESC").
		Find(&requests).Error

	return requests, total, err
}

// FindByStatus finds withdraw requests by status
func (r *withdrawRequestRepository) FindByStatus(ctx context.Context, status string) ([]*models.WithdrawRequest, error) {
	var requests []*models.WithdrawRequest
	err := r.db.WithContext(ctx).
		Where("status = ?", status).
		Order("created_at DESC").
		Find(&requests).Error
	return requests, err
}

// CountByOwner counts withdraw requests by owner
func (r *withdrawRequestRepository) CountByOwner(ctx context.Context, ownerChainID uint32, ownerData string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("owner_chain_id = ? AND owner_data = ?", ownerChainID, ownerData).
		Count(&count).Error
	return count, err
}

// CountByBeneficiary counts withdraw requests by beneficiary address
func (r *withdrawRequestRepository) CountByBeneficiary(ctx context.Context, beneficiaryChainID uint32, beneficiaryData string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("recipient_slip44_chain_id = ? AND recipient_data = ?", beneficiaryChainID, beneficiaryData).
		Count(&count).Error
	return count, err
}

// CountByStatus counts withdraw requests by owner and status
func (r *withdrawRequestRepository) CountByStatus(ctx context.Context, ownerChainID uint32, ownerData string, status string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("owner_chain_id = ? AND owner_data = ? AND status = ?", ownerChainID, ownerData, status).
		Count(&count).Error
	return count, err
}

// UpdateStatus updates the status of a withdraw request by ID
func (r *withdrawRequestRepository) UpdateStatus(ctx context.Context, id, status string) error {
	return r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("id = ?", id).
		Update("status", status).Error
}

// UpdateStatusByNullifier updates the status of a withdraw request by nullifier
func (r *withdrawRequestRepository) UpdateStatusByNullifier(ctx context.Context, nullifier, status string) error {
	return r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("withdraw_nullifier = ?", nullifier).
		Update("status", status).Error
}

// UpdateWithdrawNullifier updates the withdraw_nullifier field (used when proof is generated and public_values first nullifier differs)
func (r *withdrawRequestRepository) UpdateWithdrawNullifier(ctx context.Context, id string, nullifier string) error {
	result := r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("id = ?", id).
		Update("withdraw_nullifier", nullifier)

	if result.Error != nil {
		log.Printf("❌ [UpdateWithdrawNullifier] Database error for request %s: %v", id, result.Error)
		return fmt.Errorf("failed to update withdraw nullifier: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		log.Printf("⚠️ [UpdateWithdrawNullifier] No rows updated for request %s", id)
		return fmt.Errorf("no rows updated for request %s", id)
	}

	log.Printf("✅ [UpdateWithdrawNullifier] Updated request %s: withdraw_nullifier=%s, rowsAffected=%d", id, nullifier, result.RowsAffected)
	return nil
}

// ============ Intent System Status Update Methods ============

// FindByProofStatus finds withdraw requests by proof status
func (r *withdrawRequestRepository) FindByProofStatus(ctx context.Context, status models.ProofStatus) ([]*models.WithdrawRequest, error) {
	var requests []*models.WithdrawRequest
	err := r.db.WithContext(ctx).
		Where("proof_status = ?", status).
		Order("created_at DESC").
		Find(&requests).Error
	return requests, err
}

// FindByExecuteStatus finds withdraw requests by execute status
func (r *withdrawRequestRepository) FindByExecuteStatus(ctx context.Context, status models.ExecuteStatus) ([]*models.WithdrawRequest, error) {
	var requests []*models.WithdrawRequest
	err := r.db.WithContext(ctx).
		Where("execute_status = ?", status).
		Order("created_at DESC").
		Find(&requests).Error
	return requests, err
}

// FindByPayoutStatus finds withdraw requests by payout status
func (r *withdrawRequestRepository) FindByPayoutStatus(ctx context.Context, status models.PayoutStatus) ([]*models.WithdrawRequest, error) {
	var requests []*models.WithdrawRequest
	err := r.db.WithContext(ctx).
		Where("payout_status = ?", status).
		Order("created_at DESC").
		Find(&requests).Error
	return requests, err
}

// FindByHookStatus finds withdraw requests by hook status
func (r *withdrawRequestRepository) FindByHookStatus(ctx context.Context, status models.HookStatus) ([]*models.WithdrawRequest, error) {
	var requests []*models.WithdrawRequest
	err := r.db.WithContext(ctx).
		Where("hook_status = ?", status).
		Order("created_at DESC").
		Find(&requests).Error
	return requests, err
}

// UpdateProofStatus updates proof generation status (Stage 1)
// Uses GORM Updates method to update only specified fields
func (r *withdrawRequestRepository) UpdateProofStatus(ctx context.Context, id string, status models.ProofStatus, proof string, publicValues string, err string) error {
	updates := map[string]interface{}{
		"proof_status": status,
	}

	if status == models.ProofStatusCompleted {
		updates["proof"] = proof
		updates["public_values"] = publicValues
		updates["proof_generated_at"] = gorm.Expr("NOW()")
	} else if status == models.ProofStatusFailed {
		updates["proof_error"] = err
	}

	result := r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("id = ?", id).
		Updates(updates)

	if result.Error != nil {
		log.Printf("❌ [UpdateProofStatus] Database error for request %s: %v", id, result.Error)
		return fmt.Errorf("failed to update proof status: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		log.Printf("⚠️ [UpdateProofStatus] No rows updated for request %s (status: %s). Request may not exist or already has this status.", id, status)
		return fmt.Errorf("no rows updated for request %s", id)
	}

	log.Printf("✅ [UpdateProofStatus] Updated request %s: proof_status=%s, rowsAffected=%d", id, status, result.RowsAffected)
	return nil
}

// UpdateExecuteStatus updates on-chain verification status (Stage 2)
// Note: This method is used by services that don't need row-level locking.
// For concurrent-safe updates, use transaction with FOR UPDATE in the service layer.
func (r *withdrawRequestRepository) UpdateExecuteStatus(ctx context.Context, id string, status models.ExecuteStatus, txHash string, blockNumber *uint64, err string) error {
	// First check if already in final status to avoid unnecessary updates
	var existing models.WithdrawRequest
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&existing).Error; err == nil {
		// Check if already in a final status
		if existing.ExecuteStatus == models.ExecuteStatusSuccess ||
			existing.ExecuteStatus == models.ExecuteStatusVerifyFailed ||
			existing.ExecuteStatus == models.ExecuteStatusSubmitFailed {
			// Already in final status, skip update to avoid conflicts
			log.Printf("⚠️ [UpdateExecuteStatus] Request %s already in final status: %s, skipping update", id, existing.ExecuteStatus)
			return nil
		}
	}

	updates := map[string]interface{}{
		"execute_status": status,
	}

	if txHash != "" {
		updates["execute_tx_hash"] = txHash
	}

	if status == models.ExecuteStatusSuccess {
		updates["executed_at"] = gorm.Expr("NOW()")
		if blockNumber != nil {
			updates["execute_block_number"] = *blockNumber
		}
	} else if status == models.ExecuteStatusSubmitFailed {
		updates["execute_error"] = err
	}

	// Use WHERE clause to only update if not already in final status (optimistic locking)
	result := r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("id = ? AND execute_status NOT IN ?", id, []models.ExecuteStatus{
			models.ExecuteStatusSuccess,
			models.ExecuteStatusVerifyFailed,
			models.ExecuteStatusSubmitFailed,
		}).
		Updates(updates)

	if result.Error != nil {
		return fmt.Errorf("failed to update execute status: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		// No rows updated - likely already in final status or doesn't exist
		log.Printf("⚠️ [UpdateExecuteStatus] No rows updated for request %s (may already be in final status)", id)
		return nil // Don't return error - this is expected if already updated
	}

	log.Printf("✅ [UpdateExecuteStatus] Updated request %s: execute_status=%s, txHash=%s, rowsAffected=%d", id, status, txHash, result.RowsAffected)
	return nil
}

// UpdatePayoutStatus updates Intent execution status (Stage 3)
func (r *withdrawRequestRepository) UpdatePayoutStatus(ctx context.Context, id string, status models.PayoutStatus, txHash string, blockNumber *uint64, err string) error {
	updates := map[string]interface{}{
		"payout_status": status,
	}

	if txHash != "" {
		updates["payout_tx_hash"] = txHash
	}

	if status == models.PayoutStatusCompleted {
		updates["payout_completed_at"] = gorm.Expr("NOW()")
		if blockNumber != nil {
			updates["payout_block_number"] = *blockNumber
		}
	} else if status == models.PayoutStatusFailed {
		updates["payout_error"] = err
		updates["payout_last_retry_at"] = gorm.Expr("NOW()")
		// Increment retry count
		r.db.WithContext(ctx).
			Model(&models.WithdrawRequest{}).
			Where("id = ?", id).
			UpdateColumn("payout_retry_count", gorm.Expr("payout_retry_count + 1"))
	}

	return r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("id = ?", id).
		Updates(updates).Error
}

// UpdateHookStatus updates Hook purchase status (Stage 4)
func (r *withdrawRequestRepository) UpdateHookStatus(ctx context.Context, id string, status models.HookStatus, txHash string, err string) error {
	updates := map[string]interface{}{
		"hook_status": status,
	}

	if txHash != "" {
		updates["hook_tx_hash"] = txHash
	}

	if status == models.HookStatusCompleted {
		updates["hook_completed_at"] = gorm.Expr("NOW()")
	} else if status == models.HookStatusFailed {
		updates["hook_error"] = err
		updates["hook_last_retry_at"] = gorm.Expr("NOW()")
		// Increment retry count
		r.db.WithContext(ctx).
			Model(&models.WithdrawRequest{}).
			Where("id = ?", id).
			UpdateColumn("hook_retry_count", gorm.Expr("hook_retry_count + 1"))
	}

	return r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("id = ?", id).
		Updates(updates).Error
}

// UpdateFallbackStatus updates fallback transfer status
func (r *withdrawRequestRepository) UpdateFallbackStatus(ctx context.Context, id string, transferred bool, err string, retryCount int) error {
	updates := map[string]interface{}{
		"fallback_transferred":   transferred,
		"fallback_retry_count":   retryCount,
		"fallback_last_retry_at": gorm.Expr("NOW()"),
	}

	if err != "" {
		updates["fallback_error"] = err
	} else {
		updates["fallback_error"] = "" // Clear error on success
	}

	return r.db.WithContext(ctx).
		Model(&models.WithdrawRequest{}).
		Where("id = ?", id).
		Updates(updates).Error
}
