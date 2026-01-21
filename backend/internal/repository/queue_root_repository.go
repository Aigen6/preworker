package repository

import (
	"context"
	"go-backend/internal/models"

	"gorm.io/gorm"
)

// QueueRootRepository defines the interface for QueueRoot data access
type QueueRootRepository interface {
	// Basic CRUD operations
	Create(ctx context.Context, queueRoot *models.QueueRoot) error
	GetByID(ctx context.Context, id string) (*models.QueueRoot, error)
	GetByRoot(ctx context.Context, root string) (*models.QueueRoot, error)
	Update(ctx context.Context, queueRoot *models.QueueRoot) error
	Delete(ctx context.Context, id string) error

	// Query methods
	FindRecentRoots(ctx context.Context, chainID int64, limit int) ([]*models.QueueRoot, error)
	FindByChain(ctx context.Context, chainID int64, page, pageSize int) ([]*models.QueueRoot, int64, error)
	IsRecentRoot(ctx context.Context, root string) (bool, error)
	GetByCommitment(ctx context.Context, commitment string) (*models.QueueRoot, error) // Get queue root by created_by_commitment
	FindByPreviousRoot(ctx context.Context, previousRoot string) (*models.QueueRoot, error) // Find queue root by previous_root

	// CommitmentRootUpdated event operations
	CreateCommitmentRootUpdatedEvent(ctx context.Context, event *models.EventCommitmentRootUpdated) error
	GetCommitmentRootUpdatedEventByID(ctx context.Context, id uint64) (*models.EventCommitmentRootUpdated, error)
	FindCommitmentRootUpdatedByRoot(ctx context.Context, newRoot string) (*models.EventCommitmentRootUpdated, error)
	FindCommitmentRootUpdatedByChain(ctx context.Context, chainID int64, page, limit int) ([]*models.EventCommitmentRootUpdated, int64, error)
	FindCommitmentRootUpdatedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventCommitmentRootUpdated, error)
}

// queueRootRepository implements QueueRootRepository
type queueRootRepository struct {
	db *gorm.DB
}

// NewQueueRootRepository creates a new QueueRootRepository instance
func NewQueueRootRepository(db *gorm.DB) QueueRootRepository {
	return &queueRootRepository{db: db}
}

// Basic CRUD operations
func (r *queueRootRepository) Create(ctx context.Context, queueRoot *models.QueueRoot) error {
	return r.db.WithContext(ctx).Create(queueRoot).Error
}

func (r *queueRootRepository) GetByID(ctx context.Context, id string) (*models.QueueRoot, error) {
	var queueRoot models.QueueRoot
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&queueRoot).Error
	if err != nil {
		return nil, err
	}
	return &queueRoot, nil
}

func (r *queueRootRepository) GetByRoot(ctx context.Context, root string) (*models.QueueRoot, error) {
	var queueRoot models.QueueRoot
	err := r.db.WithContext(ctx).Where("root = ?", root).First(&queueRoot).Error
	if err != nil {
		return nil, err
	}
	return &queueRoot, nil
}

func (r *queueRootRepository) Update(ctx context.Context, queueRoot *models.QueueRoot) error {
	return r.db.WithContext(ctx).Save(queueRoot).Error
}

func (r *queueRootRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&models.QueueRoot{}).Error
}

// Query methods
func (r *queueRootRepository) FindRecentRoots(ctx context.Context, chainID int64, limit int) ([]*models.QueueRoot, error) {
	var queueRoots []*models.QueueRoot
	err := r.db.WithContext(ctx).
		Where("chain_id = ?", chainID).
		Order("created_at DESC").
		Limit(limit).
		Find(&queueRoots).Error
	if err != nil {
		return nil, err
	}
	return queueRoots, nil
}

func (r *queueRootRepository) FindByChain(ctx context.Context, chainID int64, page, pageSize int) ([]*models.QueueRoot, int64, error) {
	var queueRoots []*models.QueueRoot
	var total int64

	query := r.db.WithContext(ctx).Model(&models.QueueRoot{}).Where("chain_id = ?", chainID)
	query.Count(&total)

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&queueRoots).Error
	if err != nil {
		return nil, 0, err
	}

	return queueRoots, total, nil
}

func (r *queueRootRepository) IsRecentRoot(ctx context.Context, root string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.QueueRoot{}).
		Where("root = ?", root).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *queueRootRepository) GetByCommitment(ctx context.Context, commitment string) (*models.QueueRoot, error) {
	var queueRoot models.QueueRoot
	err := r.db.WithContext(ctx).Where("created_by_commitment = ?", commitment).First(&queueRoot).Error
	if err != nil {
		return nil, err
	}
	return &queueRoot, nil
}

func (r *queueRootRepository) FindByPreviousRoot(ctx context.Context, previousRoot string) (*models.QueueRoot, error) {
	var queueRoot models.QueueRoot
	err := r.db.WithContext(ctx).Where("previous_root = ?", previousRoot).First(&queueRoot).Error
	if err != nil {
		return nil, err
	}
	return &queueRoot, nil
}

// CommitmentRootUpdated event operations
func (r *queueRootRepository) CreateCommitmentRootUpdatedEvent(ctx context.Context, event *models.EventCommitmentRootUpdated) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *queueRootRepository) GetCommitmentRootUpdatedEventByID(ctx context.Context, id uint64) (*models.EventCommitmentRootUpdated, error) {
	var event models.EventCommitmentRootUpdated
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *queueRootRepository) FindCommitmentRootUpdatedByRoot(ctx context.Context, newRoot string) (*models.EventCommitmentRootUpdated, error) {
	var event models.EventCommitmentRootUpdated
	err := r.db.WithContext(ctx).Where("new_root = ?", newRoot).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *queueRootRepository) FindCommitmentRootUpdatedByChain(ctx context.Context, chainID int64, page, limit int) ([]*models.EventCommitmentRootUpdated, int64, error) {
	var events []*models.EventCommitmentRootUpdated
	var total int64

	query := r.db.WithContext(ctx).Model(&models.EventCommitmentRootUpdated{}).Where("chain_id = ?", chainID)
	query.Count(&total)

	offset := (page - 1) * limit
	err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	return events, total, nil
}

func (r *queueRootRepository) FindCommitmentRootUpdatedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventCommitmentRootUpdated, error) {
	var events []*models.EventCommitmentRootUpdated
	err := r.db.WithContext(ctx).
		Where("chain_id = ? AND transaction_hash = ?", chainID, txHash).
		Find(&events).Error
	if err != nil {
		return nil, err
	}
	return events, nil
}

