package models

import (
	"time"
)

// Failedstatus
type FailedTransactionStatus string

const (
	FailedTransactionStatusPending   FailedTransactionStatus = "pending"   // Waitretry
	FailedTransactionStatusRetrying  FailedTransactionStatus = "retrying"  // retrying
	FailedTransactionStatusRecovered FailedTransactionStatus = "recovered" // recovered（Success）
	FailedTransactionStatusAbandoned FailedTransactionStatus = "abandoned" // abandoned（reached maximum retry attempts）
)

// Failed
type FailedTransactionType string

const (
	FailedTransactionTypeWithdraw   FailedTransactionType = "withdraw"   // withdraw
	FailedTransactionTypeCommitment FailedTransactionType = "commitment" 
)

// Failedrecord
type FailedTransaction struct {
	ID     string                  `json:"id" gorm:"primaryKey"`                   // UUID
	TxType FailedTransactionType   `json:"tx_type" gorm:"not null"`                
	Status FailedTransactionStatus `json:"status" gorm:"not null;default:pending"` // status

	
	CheckbookID string `json:"checkbook_id" gorm:"not null;index"` // checkbook ID
	CheckID     string `json:"check_id"`                           // check ID（withdrawneed）

	// Info
	TxHash    string `json:"tx_hash"`                // hash
	Nullifier string `json:"nullifier" gorm:"index"` // nullifier（querystatus）
	Recipient string `json:"recipient"`              // address
	Amount    string `json:"amount"`                 // amount

	// retry
	RetryCount  int       `json:"retry_count" gorm:"default:0"`  // retry
	MaxRetries  int       `json:"max_retries" gorm:"default:10"` // retry
	NextRetryAt time.Time `json:"next_retry_at"`                 // next timeretry

	// ErrorInfo
	LastError     string `json:"last_error" gorm:"type:text"`     // ErrorInfo
	OriginalError string `json:"original_error" gorm:"type:text"` // ErrorInfo

	// timestamp
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	ResolvedAt *time.Time `json:"resolved_at"` // （Successor）
}

// next timeretry（）
func (ft *FailedTransaction) CalculateNextRetryTime() time.Time {
	// ：10seconds
	baseDelay := 10 * time.Second

	// ：10seconds、20seconds、40seconds、80seconds...10minutes
	delay := baseDelay * time.Duration(1<<uint(ft.RetryCount))
	maxDelay := 10 * time.Minute

	if delay > maxDelay {
		delay = maxDelay
	}

	return time.Now().Add(delay)
}

// Checkwhetherretry
func (ft *FailedTransaction) ShouldRetry() bool {
	return ft.Status == FailedTransactionStatusPending &&
		ft.RetryCount < ft.MaxRetries &&
		time.Now().After(ft.NextRetryAt)
}

// retryUpdatenext timeretry
func (ft *FailedTransaction) IncrementRetry(errorMsg string) {
	ft.RetryCount++
	ft.LastError = errorMsg
	ft.NextRetryAt = ft.CalculateNextRetryTime()

	if ft.RetryCount >= ft.MaxRetries {
		ft.Status = FailedTransactionStatusAbandoned
		now := time.Now()
		ft.ResolvedAt = &now
	}
}

// recovered
func (ft *FailedTransaction) MarkAsRecovered(actualTxHash string) {
	ft.Status = FailedTransactionStatusRecovered
	ft.TxHash = actualTxHash
	now := time.Now()
	ft.ResolvedAt = &now
}
