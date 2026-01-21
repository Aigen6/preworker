package models

import (
	"time"
)

// PendingTransaction 待处理的交易（队列）
type PendingTransactionStatus string

const (
	PendingTransactionStatusPending    PendingTransactionStatus = "pending"    // 等待处理
	PendingTransactionStatusProcessing PendingTransactionStatus = "processing" // 正在处理
	PendingTransactionStatusSubmitted  PendingTransactionStatus = "submitted"  // 已提交到链上
	PendingTransactionStatusConfirmed  PendingTransactionStatus = "confirmed"  // 已确认
	PendingTransactionStatusFailed     PendingTransactionStatus = "failed"     // 失败
)

type PendingTransactionType string

const (
	PendingTransactionTypeCommitment PendingTransactionType = "commitment"
	PendingTransactionTypeWithdraw   PendingTransactionType = "withdraw"
)

// PendingTransaction 待处理的交易队列
type PendingTransaction struct {
	ID      string                   `json:"id" gorm:"primaryKey"` // UUID
	Type    PendingTransactionType   `json:"type" gorm:"not null"`
	Status  PendingTransactionStatus `json:"status" gorm:"not null;default:pending;index"`
	Address string                   `json:"address" gorm:"not null;index:idx_address_chain;size:42"`
	ChainID uint32                   `json:"chain_id" gorm:"not null;index:idx_address_chain"`
	Nonce   uint64                   `json:"nonce" gorm:"not null;index"` // 分配的 nonce

	// 交易信息
	TxHash      string  `json:"tx_hash"`                  // 交易哈希（提交后）
	TxData      string  `json:"tx_data" gorm:"type:text"` // 交易数据（JSON 序列化）
	BlockNumber *uint64 `json:"block_number"`             // 确认的区块号

	// 关联信息
	CheckbookID string `json:"checkbook_id" gorm:"index"`
	CheckID     string `json:"check_id"`
	RequestID   string `json:"request_id"` // WithdrawRequest ID 或 Checkbook ID

	// 重试信息
	RetryCount  int        `json:"retry_count" gorm:"default:0"`
	MaxRetries  int        `json:"max_retries" gorm:"default:3"`
	NextRetryAt *time.Time `json:"next_retry_at"`

	// 错误信息
	LastError string `json:"last_error" gorm:"type:text"`

	// 优先级（数字越小优先级越高）
	Priority int `json:"priority" gorm:"default:100"`

	// 时间戳
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	SubmittedAt *time.Time `json:"submitted_at"`
	ConfirmedAt *time.Time `json:"confirmed_at"`
}

// TableName 指定表名
func (PendingTransaction) TableName() string {
	return "pending_transactions"
}
