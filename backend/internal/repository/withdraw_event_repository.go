package repository

import (
	"context"
	"go-backend/internal/models"

	"gorm.io/gorm"
)

// WithdrawEventRepository defines the interface for withdraw event data access
type WithdrawEventRepository interface {
	// WithdrawRequested operations
	CreateWithdrawRequested(ctx context.Context, event *models.EventWithdrawRequested) error
	GetWithdrawRequestedByID(ctx context.Context, id uint64) (*models.EventWithdrawRequested, error)
	FindWithdrawRequestedByRecipient(ctx context.Context, recipientChainID uint32, recipientData string, page, limit int) ([]*models.EventWithdrawRequested, int64, error)
	FindWithdrawRequestedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventWithdrawRequested, error)

	// WithdrawExecuted operations
	CreateWithdrawExecuted(ctx context.Context, event *models.EventWithdrawExecuted) error
	GetWithdrawExecutedByID(ctx context.Context, id uint64) (*models.EventWithdrawExecuted, error)
	FindWithdrawExecutedByNullifier(ctx context.Context, nullifier string) (*models.EventWithdrawExecuted, error)
	FindWithdrawExecutedByRecipient(ctx context.Context, recipientChainID uint32, recipientData string, page, limit int) ([]*models.EventWithdrawExecuted, int64, error)
	FindWithdrawExecutedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventWithdrawExecuted, error)
}

// withdrawEventRepository implements WithdrawEventRepository
type withdrawEventRepository struct {
	db *gorm.DB
}

// NewWithdrawEventRepository creates a new WithdrawEventRepository instance
func NewWithdrawEventRepository(db *gorm.DB) WithdrawEventRepository {
	return &withdrawEventRepository{db: db}
}

// WithdrawRequested implementations
func (r *withdrawEventRepository) CreateWithdrawRequested(ctx context.Context, event *models.EventWithdrawRequested) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *withdrawEventRepository) GetWithdrawRequestedByID(ctx context.Context, id uint64) (*models.EventWithdrawRequested, error) {
	var event models.EventWithdrawRequested
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *withdrawEventRepository) FindWithdrawRequestedByRecipient(ctx context.Context, recipientChainID uint32, recipientData string, page, limit int) ([]*models.EventWithdrawRequested, int64, error) {
	var events []*models.EventWithdrawRequested
	var total int64

	query := r.db.WithContext(ctx).Model(&models.EventWithdrawRequested{}).
		Where("recipient_chain_id = ? AND recipient_data = ?", recipientChainID, recipientData)
	query.Count(&total)

	offset := (page - 1) * limit
	err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	return events, total, nil
}

func (r *withdrawEventRepository) FindWithdrawRequestedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventWithdrawRequested, error) {
	var events []*models.EventWithdrawRequested
	err := r.db.WithContext(ctx).
		Where("chain_id = ? AND transaction_hash = ?", chainID, txHash).
		Find(&events).Error
	if err != nil {
		return nil, err
	}
	return events, nil
}

// WithdrawExecuted implementations
func (r *withdrawEventRepository) CreateWithdrawExecuted(ctx context.Context, event *models.EventWithdrawExecuted) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *withdrawEventRepository) GetWithdrawExecutedByID(ctx context.Context, id uint64) (*models.EventWithdrawExecuted, error) {
	var event models.EventWithdrawExecuted
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *withdrawEventRepository) FindWithdrawExecutedByNullifier(ctx context.Context, nullifier string) (*models.EventWithdrawExecuted, error) {
	var event models.EventWithdrawExecuted
	err := r.db.WithContext(ctx).Where("nullifier = ?", nullifier).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *withdrawEventRepository) FindWithdrawExecutedByRecipient(ctx context.Context, recipientChainID uint32, recipientData string, page, limit int) ([]*models.EventWithdrawExecuted, int64, error) {
	var events []*models.EventWithdrawExecuted
	var total int64

	query := r.db.WithContext(ctx).Model(&models.EventWithdrawExecuted{}).
		Where("recipient_chain_id = ? AND recipient_data = ?", recipientChainID, recipientData)
	query.Count(&total)

	offset := (page - 1) * limit
	err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	return events, total, nil
}

func (r *withdrawEventRepository) FindWithdrawExecutedByTxHash(ctx context.Context, chainID int64, txHash string) ([]*models.EventWithdrawExecuted, error) {
	var events []*models.EventWithdrawExecuted
	err := r.db.WithContext(ctx).
		Where("chain_id = ? AND transaction_hash = ?", chainID, txHash).
		Find(&events).Error
	if err != nil {
		return nil, err
	}
	return events, nil
}

