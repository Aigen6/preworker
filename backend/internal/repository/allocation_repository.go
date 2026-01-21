package repository

import (
	"context"
	"go-backend/internal/models"

	"gorm.io/gorm"
)

// AllocationRepository defines the interface for Allocation (Check) data access
type AllocationRepository interface {
	// Basic CRUD operations
	Create(ctx context.Context, allocation *models.Check) error
	CreateBatch(ctx context.Context, allocations []*models.Check) error
	GetByID(ctx context.Context, id string) (*models.Check, error)
	GetByNullifier(ctx context.Context, nullifier string) (*models.Check, error)
	Update(ctx context.Context, allocation *models.Check) error

	// Query methods
	FindByCheckbook(ctx context.Context, checkbookID string) ([]*models.Check, error)
	FindByStatus(ctx context.Context, checkbookID string, status models.AllocationStatus) ([]*models.Check, error)
	FindAvailable(ctx context.Context, checkbookID string) ([]*models.Check, error)  // status = idle
	FindByWithdrawRequest(ctx context.Context, withdrawRequestID string) ([]*models.Check, error)

	// Batch operations
	UpdateStatusBatch(ctx context.Context, ids []string, status models.AllocationStatus) error
	LockForWithdrawal(ctx context.Context, ids []string, withdrawRequestID string) error   // idle -> pending
	MarkAsUsed(ctx context.Context, ids []string) error                                     // pending -> used
	ReleaseAllocations(ctx context.Context, ids []string) error                             // pending -> idle (only if execute_status != success)
	
	// Legacy methods (for backward compatibility)
	MarkAsCommitted(ctx context.Context, ids []string) error
	MarkAsWithdrawing(ctx context.Context, ids []string, withdrawRequestID string) error
	MarkAsWithdrawn(ctx context.Context, ids []string) error
	MarkAsFailed(ctx context.Context, ids []string, reason string) error
	ResetFailed(ctx context.Context, ids []string) error
}

// allocationRepository implements AllocationRepository
type allocationRepository struct {
	db *gorm.DB
}

// NewAllocationRepository creates a new AllocationRepository instance
func NewAllocationRepository(db *gorm.DB) AllocationRepository {
	return &allocationRepository{db: db}
}

// Create creates a new allocation
func (r *allocationRepository) Create(ctx context.Context, allocation *models.Check) error {
	return r.db.WithContext(ctx).Create(allocation).Error
}

// CreateBatch creates multiple allocations in a batch
func (r *allocationRepository) CreateBatch(ctx context.Context, allocations []*models.Check) error {
	return r.db.WithContext(ctx).CreateInBatches(allocations, 100).Error
}

// GetByID retrieves an allocation by ID
func (r *allocationRepository) GetByID(ctx context.Context, id string) (*models.Check, error) {
	var allocation models.Check
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&allocation).Error
	if err != nil {
		return nil, err
	}
	return &allocation, nil
}

// GetByNullifier retrieves an allocation by nullifier
func (r *allocationRepository) GetByNullifier(ctx context.Context, nullifier string) (*models.Check, error) {
	var allocation models.Check
	err := r.db.WithContext(ctx).Where("nullifier = ?", nullifier).First(&allocation).Error
	if err != nil {
		return nil, err
	}
	return &allocation, nil
}

// Update updates an allocation
func (r *allocationRepository) Update(ctx context.Context, allocation *models.Check) error {
	return r.db.WithContext(ctx).Save(allocation).Error
}

// FindByCheckbook finds all allocations for a checkbook
func (r *allocationRepository) FindByCheckbook(ctx context.Context, checkbookID string) ([]*models.Check, error) {
	var allocations []*models.Check
	err := r.db.WithContext(ctx).
		Where("checkbook_id = ?", checkbookID).
		Order("seq ASC"). // Use seq instead of index (seq is the correct field name)
		Find(&allocations).Error
	return allocations, err
}

// FindByStatus finds allocations by checkbook and status
func (r *allocationRepository) FindByStatus(ctx context.Context, checkbookID string, status models.AllocationStatus) ([]*models.Check, error) {
	var allocations []*models.Check
	err := r.db.WithContext(ctx).
		Where("checkbook_id = ? AND status = ?", checkbookID, status).
		Order("seq ASC").
		Find(&allocations).Error
	return allocations, err
}

// FindAvailable finds available allocations for a checkbook (status = idle)
func (r *allocationRepository) FindAvailable(ctx context.Context, checkbookID string) ([]*models.Check, error) {
	return r.FindByStatus(ctx, checkbookID, models.AllocationStatusIdle)
}

// FindByWithdrawRequest finds allocations by withdraw request ID
func (r *allocationRepository) FindByWithdrawRequest(ctx context.Context, withdrawRequestID string) ([]*models.Check, error) {
	var allocations []*models.Check
	err := r.db.WithContext(ctx).
		Where("withdraw_request_id = ?", withdrawRequestID).
		Order("seq ASC").
		Find(&allocations).Error
	return allocations, err
}

// UpdateStatusBatch updates the status of multiple allocations
func (r *allocationRepository) UpdateStatusBatch(ctx context.Context, ids []string, status models.AllocationStatus) error {
	return r.db.WithContext(ctx).
		Model(&models.Check{}).
		Where("id IN ?", ids).
		Update("status", status).Error
}

// LockForWithdrawal locks allocations for a withdrawal request (idle -> pending)
func (r *allocationRepository) LockForWithdrawal(ctx context.Context, ids []string, withdrawRequestID string) error {
	return r.db.WithContext(ctx).
		Model(&models.Check{}).
		Where("id IN ? AND status = ?", ids, models.AllocationStatusIdle).
		Updates(map[string]interface{}{
			"status":              models.AllocationStatusPending,
			"withdraw_request_id": withdrawRequestID,
		}).Error
}

// MarkAsUsed marks allocations as used (pending -> used, nullifier consumed on-chain)
func (r *allocationRepository) MarkAsUsed(ctx context.Context, ids []string) error {
	return r.db.WithContext(ctx).
		Model(&models.Check{}).
		Where("id IN ? AND status = ?", ids, models.AllocationStatusPending).
		Update("status", models.AllocationStatusUsed).Error
}

// ReleaseAllocations releases locked allocations back to idle (pending -> idle)
// This should only be called if execute_status != success (Stage 1 failed)
func (r *allocationRepository) ReleaseAllocations(ctx context.Context, ids []string) error {
	return r.db.WithContext(ctx).
		Model(&models.Check{}).
		Where("id IN ? AND status = ?", ids, models.AllocationStatusPending).
		Updates(map[string]interface{}{
			"status":              models.AllocationStatusIdle,
			"withdraw_request_id": nil,
		}).Error
}

// MarkAsCommitted marks allocations as committed
func (r *allocationRepository) MarkAsCommitted(ctx context.Context, ids []string) error {
	return r.UpdateStatusBatch(ctx, ids, "committed")
}

// MarkAsWithdrawing marks allocations as withdrawing
func (r *allocationRepository) MarkAsWithdrawing(ctx context.Context, ids []string, withdrawRequestID string) error {
	return r.db.WithContext(ctx).
		Model(&models.Check{}).
		Where("id IN ?", ids).
		Updates(map[string]interface{}{
			"status":              "withdrawing",
			"withdraw_request_id": withdrawRequestID,
		}).Error
}

// MarkAsWithdrawn marks allocations as withdrawn
func (r *allocationRepository) MarkAsWithdrawn(ctx context.Context, ids []string) error {
	return r.UpdateStatusBatch(ctx, ids, "withdrawn")
}

// MarkAsFailed marks allocations as failed with a reason
func (r *allocationRepository) MarkAsFailed(ctx context.Context, ids []string, reason string) error {
	return r.db.WithContext(ctx).
		Model(&models.Check{}).
		Where("id IN ?", ids).
		Updates(map[string]interface{}{
			"status":         "failed",
			"failure_reason": reason,
		}).Error
}

// ResetFailed resets failed allocations back to available
func (r *allocationRepository) ResetFailed(ctx context.Context, ids []string) error {
	return r.db.WithContext(ctx).
		Model(&models.Check{}).
		Where("id IN ? AND status = ?", ids, "failed").
		Updates(map[string]interface{}{
			"status":         "available",
			"failure_reason": nil,
		}).Error
}
