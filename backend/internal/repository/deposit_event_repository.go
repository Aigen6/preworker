package repository

import (
	"context"
	"go-backend/internal/models"

	"gorm.io/gorm"
)

// DepositEventRepository defines the interface for deposit event data access
type DepositEventRepository interface {
	// DepositReceived operations
	CreateDepositReceived(ctx context.Context, event *models.EventDepositReceived) error
	GetDepositReceivedByID(ctx context.Context, id uint64) (*models.EventDepositReceived, error)
	FindDepositReceivedByChain(ctx context.Context, chainID int64, page, limit int) ([]*models.EventDepositReceived, int64, error)
	FindDepositReceivedByDepositor(ctx context.Context, chainID int64, depositor string, page, limit int) ([]*models.EventDepositReceived, int64, error)
	FindDepositReceivedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventDepositReceived, error)

	// DepositRecorded operations
	CreateDepositRecorded(ctx context.Context, event *models.EventDepositRecorded) error
	GetDepositRecordedByID(ctx context.Context, id uint64) (*models.EventDepositRecorded, error)
	FindDepositRecordedByChain(ctx context.Context, chainID int64, page, limit int) ([]*models.EventDepositRecorded, int64, error)
	FindDepositRecordedByLocalID(ctx context.Context, chainID int64, localDepositID uint64) (*models.EventDepositRecorded, error)
	FindDepositRecordedByOwner(ctx context.Context, ownerChainID uint32, ownerData string, page, limit int) ([]*models.EventDepositRecorded, int64, error)

	// DepositUsed operations
	CreateDepositUsed(ctx context.Context, event *models.EventDepositUsed) error
	GetDepositUsedByID(ctx context.Context, id uint64) (*models.EventDepositUsed, error)
	FindDepositUsedByLocalID(ctx context.Context, chainID int64, localDepositID uint64) (*models.EventDepositUsed, error)
	FindDepositUsedByCommitment(ctx context.Context, chainID int64, commitment string) ([]*models.EventDepositUsed, error)
}

// depositEventRepository implements DepositEventRepository
type depositEventRepository struct {
	db *gorm.DB
}

// NewDepositEventRepository creates a new DepositEventRepository instance
func NewDepositEventRepository(db *gorm.DB) DepositEventRepository {
	return &depositEventRepository{db: db}
}

// DepositReceived implementations
func (r *depositEventRepository) CreateDepositReceived(ctx context.Context, event *models.EventDepositReceived) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *depositEventRepository) GetDepositReceivedByID(ctx context.Context, id uint64) (*models.EventDepositReceived, error) {
	var event models.EventDepositReceived
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *depositEventRepository) FindDepositReceivedByChain(ctx context.Context, chainID int64, page, limit int) ([]*models.EventDepositReceived, int64, error) {
	var events []*models.EventDepositReceived
	var total int64

	query := r.db.WithContext(ctx).Model(&models.EventDepositReceived{}).Where("chain_id = ?", chainID)
	query.Count(&total)

	offset := (page - 1) * limit
	err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	return events, total, nil
}

func (r *depositEventRepository) FindDepositReceivedByDepositor(ctx context.Context, chainID int64, depositor string, page, limit int) ([]*models.EventDepositReceived, int64, error) {
	var events []*models.EventDepositReceived
	var total int64

	query := r.db.WithContext(ctx).Model(&models.EventDepositReceived{}).
		Where("chain_id = ? AND depositor = ?", chainID, depositor)
	query.Count(&total)

	offset := (page - 1) * limit
	err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	return events, total, nil
}

func (r *depositEventRepository) FindDepositReceivedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventDepositReceived, error) {
	var events []*models.EventDepositReceived
	err := r.db.WithContext(ctx).Where("chain_id = ? AND transaction_hash = ?", chainID, txHash).Find(&events).Error
	if err != nil {
		return nil, err
	}
	return events, nil
}

// DepositRecorded implementations
func (r *depositEventRepository) CreateDepositRecorded(ctx context.Context, event *models.EventDepositRecorded) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *depositEventRepository) GetDepositRecordedByID(ctx context.Context, id uint64) (*models.EventDepositRecorded, error) {
	var event models.EventDepositRecorded
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *depositEventRepository) FindDepositRecordedByChain(ctx context.Context, chainID int64, page, limit int) ([]*models.EventDepositRecorded, int64, error) {
	var events []*models.EventDepositRecorded
	var total int64

	query := r.db.WithContext(ctx).Model(&models.EventDepositRecorded{}).Where("chain_id = ?", chainID)
	query.Count(&total)

	offset := (page - 1) * limit
	err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	return events, total, nil
}

func (r *depositEventRepository) FindDepositRecordedByLocalID(ctx context.Context, chainID int64, localDepositID uint64) (*models.EventDepositRecorded, error) {
	var event models.EventDepositRecorded
	err := r.db.WithContext(ctx).
		Where("chain_id = ? AND local_deposit_id = ?", chainID, localDepositID).
		First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *depositEventRepository) FindDepositRecordedByOwner(ctx context.Context, ownerChainID uint32, ownerData string, page, limit int) ([]*models.EventDepositRecorded, int64, error) {
	var events []*models.EventDepositRecorded
	var total int64

	// Note: This query assumes owner is stored in a way that can be queried
	// Adjust based on actual schema
	query := r.db.WithContext(ctx).Model(&models.EventDepositRecorded{}).
		Where("owner_chain_id = ? AND owner_data = ?", ownerChainID, ownerData)
	query.Count(&total)

	offset := (page - 1) * limit
	err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	return events, total, nil
}

// DepositUsed implementations
func (r *depositEventRepository) CreateDepositUsed(ctx context.Context, event *models.EventDepositUsed) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *depositEventRepository) GetDepositUsedByID(ctx context.Context, id uint64) (*models.EventDepositUsed, error) {
	var event models.EventDepositUsed
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *depositEventRepository) FindDepositUsedByLocalID(ctx context.Context, chainID int64, localDepositID uint64) (*models.EventDepositUsed, error) {
	var event models.EventDepositUsed
	err := r.db.WithContext(ctx).
		Where("chain_id = ? AND local_deposit_id = ?", chainID, localDepositID).
		First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *depositEventRepository) FindDepositUsedByCommitment(ctx context.Context, chainID int64, commitment string) ([]*models.EventDepositUsed, error) {
	var events []*models.EventDepositUsed
	err := r.db.WithContext(ctx).
		Where("chain_id = ? AND commitment = ?", chainID, commitment).
		Find(&events).Error
	if err != nil {
		return nil, err
	}
	return events, nil
}

