// Package repository provides data access interfaces and implementations
package repository

import (
	"context"
	"go-backend/internal/models"

	"gorm.io/gorm"
)

// CheckbookRepository defines the interface for Checkbook data access
type CheckbookRepository interface {
	// Basic CRUD operations
	Create(ctx context.Context, checkbook *models.Checkbook) error
	GetByID(ctx context.Context, id string) (*models.Checkbook, error)
	GetByDepositID(ctx context.Context, chainID uint32, depositID uint64) (*models.Checkbook, error)
	Update(ctx context.Context, checkbook *models.Checkbook) error
	Delete(ctx context.Context, id string) error

	// Query methods
	FindByOwner(ctx context.Context, ownerChainID uint32, ownerData string) ([]*models.Checkbook, error)
	FindByStatus(ctx context.Context, status string) ([]*models.Checkbook, error)
	List(ctx context.Context, page, pageSize int) ([]*models.Checkbook, int64, error)

	// Complex queries
	FindWithAllocations(ctx context.Context, id string) (*models.Checkbook, error)
	CountByOwner(ctx context.Context, ownerChainID uint32, ownerData string) (int64, error)
}

// checkbookRepository implements CheckbookRepository
type checkbookRepository struct {
	db *gorm.DB
}

// NewCheckbookRepository creates a new CheckbookRepository instance
func NewCheckbookRepository(db *gorm.DB) CheckbookRepository {
	return &checkbookRepository{db: db}
}

// Create creates a new checkbook
func (r *checkbookRepository) Create(ctx context.Context, checkbook *models.Checkbook) error {
	return r.db.WithContext(ctx).Create(checkbook).Error
}

// GetByID retrieves a checkbook by ID
func (r *checkbookRepository) GetByID(ctx context.Context, id string) (*models.Checkbook, error) {
	var checkbook models.Checkbook
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&checkbook).Error
	if err != nil {
		return nil, err
	}
	return &checkbook, nil
}

// GetByDepositID retrieves a checkbook by chain ID and deposit ID
func (r *checkbookRepository) GetByDepositID(ctx context.Context, chainID uint32, depositID uint64) (*models.Checkbook, error) {
	var checkbook models.Checkbook
	err := r.db.WithContext(ctx).
		Where("chain_id = ? AND local_deposit_id = ?", chainID, depositID).
		First(&checkbook).Error
	if err != nil {
		return nil, err
	}
	return &checkbook, nil
}

// Update updates a checkbook
func (r *checkbookRepository) Update(ctx context.Context, checkbook *models.Checkbook) error {
	return r.db.WithContext(ctx).Save(checkbook).Error
}

// Delete deletes a checkbook
func (r *checkbookRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&models.Checkbook{}).Error
}

// FindByOwner finds checkbooks by owner
func (r *checkbookRepository) FindByOwner(ctx context.Context, ownerChainID uint32, ownerData string) ([]*models.Checkbook, error) {
	var checkbooks []*models.Checkbook
	err := r.db.WithContext(ctx).
		Where("owner_chain_id = ? AND owner_data = ?", ownerChainID, ownerData).
		Order("created_at DESC").
		Find(&checkbooks).Error
	return checkbooks, err
}

// FindByStatus finds checkbooks by status
func (r *checkbookRepository) FindByStatus(ctx context.Context, status string) ([]*models.Checkbook, error) {
	var checkbooks []*models.Checkbook
	err := r.db.WithContext(ctx).
		Where("status = ?", status).
		Find(&checkbooks).Error
	return checkbooks, err
}

// List retrieves paginated checkbooks
func (r *checkbookRepository) List(ctx context.Context, page, pageSize int) ([]*models.Checkbook, int64, error) {
	var checkbooks []*models.Checkbook
	var total int64

	// Count total
	if err := r.db.WithContext(ctx).Model(&models.Checkbook{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	offset := (page - 1) * pageSize
	err := r.db.WithContext(ctx).
		Offset(offset).
		Limit(pageSize).
		Order("created_at DESC").
		Find(&checkbooks).Error

	return checkbooks, total, err
}

// FindWithAllocations retrieves a checkbook with its allocations
func (r *checkbookRepository) FindWithAllocations(ctx context.Context, id string) (*models.Checkbook, error) {
	var checkbook models.Checkbook
	err := r.db.WithContext(ctx).
		Preload("Allocations").
		Where("id = ?", id).
		First(&checkbook).Error
	if err != nil {
		return nil, err
	}
	return &checkbook, nil
}

// CountByOwner counts checkbooks by owner
func (r *checkbookRepository) CountByOwner(ctx context.Context, ownerChainID uint32, ownerData string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Checkbook{}).
		Where("owner_chain_id = ? AND owner_data = ?", ownerChainID, ownerData).
		Count(&count).Error
	return count, err
}
