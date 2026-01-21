package repository

import (
	"context"
	"go-backend/internal/models"

	"gorm.io/gorm"
)

// CommitmentRepository defines the interface for Commitment data access
type CommitmentRepository interface {
	// Basic CRUD operations
	Create(ctx context.Context, commitment *models.Commitment) error
	GetByID(ctx context.Context, id string) (*models.Commitment, error)
	GetByCommitmentHash(ctx context.Context, commitmentHash string) (*models.Commitment, error)
	Update(ctx context.Context, commitment *models.Commitment) error

	// Query methods
	FindByCheckbook(ctx context.Context, checkbookID string) ([]*models.Commitment, error)
	FindByOwner(ctx context.Context, ownerChainID uint32, ownerData string) ([]*models.Commitment, error)
	FindByStatus(ctx context.Context, status string) ([]*models.Commitment, error)
	List(ctx context.Context, page, pageSize int) ([]*models.Commitment, int64, error)

	// Status updates
	UpdateStatus(ctx context.Context, id, status string) error
}

// commitmentRepository implements CommitmentRepository
type commitmentRepository struct {
	db *gorm.DB
}

// NewCommitmentRepository creates a new CommitmentRepository instance
func NewCommitmentRepository(db *gorm.DB) CommitmentRepository {
	return &commitmentRepository{db: db}
}

// Create creates a new commitment
func (r *commitmentRepository) Create(ctx context.Context, commitment *models.Commitment) error {
	return r.db.WithContext(ctx).Create(commitment).Error
}

// GetByID retrieves a commitment by ID
func (r *commitmentRepository) GetByID(ctx context.Context, id string) (*models.Commitment, error) {
	var commitment models.Commitment
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&commitment).Error
	if err != nil {
		return nil, err
	}
	return &commitment, nil
}

// GetByCommitmentHash retrieves a commitment by commitment hash
func (r *commitmentRepository) GetByCommitmentHash(ctx context.Context, commitmentHash string) (*models.Commitment, error) {
	var commitment models.Commitment
	err := r.db.WithContext(ctx).Where("commitment_hash = ?", commitmentHash).First(&commitment).Error
	if err != nil {
		return nil, err
	}
	return &commitment, nil
}

// Update updates a commitment
func (r *commitmentRepository) Update(ctx context.Context, commitment *models.Commitment) error {
	return r.db.WithContext(ctx).Save(commitment).Error
}

// FindByCheckbook finds commitments by checkbook ID
func (r *commitmentRepository) FindByCheckbook(ctx context.Context, checkbookID string) ([]*models.Commitment, error) {
	var commitments []*models.Commitment
	err := r.db.WithContext(ctx).
		Where("checkbook_id = ?", checkbookID).
		Order("created_at DESC").
		Find(&commitments).Error
	return commitments, err
}

// FindByOwner finds commitments by owner
func (r *commitmentRepository) FindByOwner(ctx context.Context, ownerChainID uint32, ownerData string) ([]*models.Commitment, error) {
	var commitments []*models.Commitment
	err := r.db.WithContext(ctx).
		Where("owner_chain_id = ? AND owner_data = ?", ownerChainID, ownerData).
		Order("created_at DESC").
		Find(&commitments).Error
	return commitments, err
}

// FindByStatus finds commitments by status
func (r *commitmentRepository) FindByStatus(ctx context.Context, status string) ([]*models.Commitment, error) {
	var commitments []*models.Commitment
	err := r.db.WithContext(ctx).
		Where("status = ?", status).
		Order("created_at DESC").
		Find(&commitments).Error
	return commitments, err
}

// List retrieves paginated commitments
func (r *commitmentRepository) List(ctx context.Context, page, pageSize int) ([]*models.Commitment, int64, error) {
	var commitments []*models.Commitment
	var total int64

	// Count total
	if err := r.db.WithContext(ctx).Model(&models.Commitment{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	offset := (page - 1) * pageSize
	err := r.db.WithContext(ctx).
		Offset(offset).
		Limit(pageSize).
		Order("created_at DESC").
		Find(&commitments).Error

	return commitments, total, err
}

// UpdateStatus updates the status of a commitment
func (r *commitmentRepository) UpdateStatus(ctx context.Context, id, status string) error {
	return r.db.WithContext(ctx).
		Model(&models.Commitment{}).
		Where("id = ?", id).
		Update("status", status).Error
}
