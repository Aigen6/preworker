package models

import (
	"time"
)

// PayoutRetryRecord represents a retry record for failed payout execution
// This is stored in the database to track retry attempts
// The actual chain record is stored on-chain in Treasury contract
type PayoutRetryRecord struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	RecordID  string    `json:"record_id" gorm:"size:66;uniqueIndex;not null"` // Chain record ID (keccak256(requestId, "payout"))
	RequestID string    `json:"request_id" gorm:"size:66;index;not null"`       // WithdrawRequest ID (withdraw_nullifier)
	
	// Retry data (from chain record)
	Recipient   string `json:"recipient" gorm:"size:66;not null"`   // Beneficiary address
	TokenKey    string `json:"token_key" gorm:"size:50;not null"`   // Token identifier
	Amount      string `json:"amount" gorm:"not null"`              // Amount (wei)
	WorkerType  uint8  `json:"worker_type" gorm:"not null"`        // Worker type: 0=DirectTransfer, 1=UniswapSwap, 2=DeBridgeCrossChain
	WorkerParams string `json:"worker_params" gorm:"type:text"`    // Worker parameters (JSON encoded)
	
	// Retry tracking
	RetryCount  int        `json:"retry_count" gorm:"default:0"`     // Current retry count
	LastRetryAt *time.Time `json:"last_retry_at"`                     // Last retry time
	ErrorReason string     `json:"error_reason" gorm:"type:text"`      // Error reason
	
	// Chain tracking
	ChainID         int64  `json:"chain_id" gorm:"not null"`          // Chain ID where the record is stored
	ContractAddress string `json:"contract_address" gorm:"size:66"`   // Treasury contract address
	
	// GORM standard fields
	CreatedAt time.Time `json:"created_at"`                        // Record creation time
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName specifies the table name for PayoutRetryRecord
func (PayoutRetryRecord) TableName() string {
	return "payout_retry_records"
}

// FallbackRetryRecord represents a retry record for failed fallback transfer
// This is stored in the database to track retry attempts
// The actual chain record is stored on-chain in Treasury contract
type FallbackRetryRecord struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	RecordID  string    `json:"record_id" gorm:"size:66;uniqueIndex;not null"` // Chain record ID (keccak256(requestId, "fallback"))
	RequestID string    `json:"request_id" gorm:"size:66;index;not null"`       // WithdrawRequest ID (withdraw_nullifier)
	
	// Retry data (from chain record)
	IntentManagerAddress string `json:"intent_manager_address" gorm:"size:66;not null"` // IntentManager contract address
	Token                 string `json:"token" gorm:"size:66;not null"`                  // Token address
	Beneficiary           string `json:"beneficiary" gorm:"size:66;not null"`            // Beneficiary address
	Amount                 string `json:"amount" gorm:"not null"`                        // Amount (wei)
	
	// Retry tracking
	RetryCount  int        `json:"retry_count" gorm:"default:0"`     // Current retry count
	LastRetryAt *time.Time `json:"last_retry_at"`                     // Last retry time
	ErrorReason string     `json:"error_reason" gorm:"type:text"`      // Error reason
	
	// Chain tracking
	ChainID         int64  `json:"chain_id" gorm:"not null"`          // Chain ID where the record is stored
	ContractAddress string `json:"contract_address" gorm:"size:66"`   // Treasury contract address
	
	// GORM standard fields
	CreatedAt time.Time `json:"created_at"`                        // Record creation time
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName specifies the table name for FallbackRetryRecord
func (FallbackRetryRecord) TableName() string {
	return "fallback_retry_records"
}

