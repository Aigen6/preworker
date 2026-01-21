package models

import (
	"time"
)

// Polling task
type PollingTaskType string

const (
	// Checkbook Polling task
	PollingDepositBusinessChain   PollingTaskType = "deposit_business_chain"   // pending → unsigned
	PollingDepositManagementChain PollingTaskType = "deposit_management_chain" // unsigned → ready_for_commitment
	PollingCommitmentSubmission   PollingTaskType = "commitment_submission"    // submitting_commitment → commitment_pending
	PollingCommitmentConfirmation PollingTaskType = "commitment_confirmation"  // commitment_pending → with_checkbook

	// Check Polling task
	PollingWithdrawSubmission PollingTaskType = "withdraw_submission"  // submitting_to_management → management_pending
	PollingWithdrawManagement PollingTaskType = "withdraw_management"  // management_pending → cross_chain_processing
	PollingWithdrawCrossChain PollingTaskType = "withdraw_cross_chain" // cross_chain_processing → completed

	// WithdrawRequest Polling task
	PollingWithdrawExecute PollingTaskType = "withdraw_execute" // submitted → success (for withdraw_request execute_status)
)

// Polling taskstatus
type PollingTaskStatus string

const (
	PollingTaskStatusPending   PollingTaskStatus = "pending"   // wait
	PollingTaskStatusRunning   PollingTaskStatus = "running"   // in progress
	PollingTaskStatusCompleted PollingTaskStatus = "completed" // completed
	PollingTaskStatusFailed    PollingTaskStatus = "failed"    // failed
	PollingTaskStatusCancelled PollingTaskStatus = "cancelled" // already
)

// Polling taskdata - data
type PollingTask struct {
	ID         string            `json:"id" gorm:"primaryKey"`                     // UUID
	EntityType string            `json:"entity_type" gorm:"not null"`              // 'checkbook' | 'check' | 'withdraw_request'
	EntityID   string            `json:"entity_id" gorm:"not null"`                // checkbook_id  check_id
	TaskType   PollingTaskType   `json:"task_type" gorm:"not null"`                // polling
	Status     PollingTaskStatus `json:"status" gorm:"not null;default:'pending'"` // status

	// pollingconfiguration
	ChainID       uint32 `json:"chain_id" gorm:"not null"`       // targetchain ID
	TxHash        string `json:"tx_hash"`                        // check
	TargetStatus  string `json:"target_status" gorm:"not null"`  // status
	CurrentStatus string `json:"current_status" gorm:"not null"` // currentstatus

	// polling
	RetryCount   int       `json:"retry_count" gorm:"default:0"`    // currentretry
	MaxRetries   int       `json:"max_retries" gorm:"default:180"`  // Max retry count (30 / 10)
	NextPollAt   time.Time `json:"next_poll_at" gorm:"not null"`    // next timepolling
	PollInterval int       `json:"poll_interval" gorm:"default:10"` // Polling interval()

	// record
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`

	// error
	LastError string `json:"last_error" gorm:"type:text"`

	// data
	// INDEX idx_polling_next_poll (status, next_poll_at)
	// INDEX idx_polling_entity (entity_type, entity_id)
	// INDEX idx_polling_type (task_type)
}

// status - status
var CheckbookStatusPriority = map[CheckbookStatus]int{
	CheckbookStatusPending:              1,
	CheckbookStatusUnsigned:             2,
	CheckbookStatusReadyForCommitment:   3,
	CheckbookStatusGeneratingProof:      4,
	CheckbookStatusSubmittingCommitment: 5,
	CheckbookStatusCommitmentPending:    6,
	CheckbookStatusWithCheckbook:        7,
}

var CheckStatusPriority = map[CheckStatus]int{
	CheckStatusIdle:                   0,
	CheckStatusPendingProof:           1,
	CheckStatusSubmittingToManagement: 2,
	CheckStatusManagementPending:      3,
	CheckStatusCrossChainProcessing:   4,
	CheckStatusCompleted:              5,
}

// Polling taskconfiguration
type PollingTaskConfig struct {
	EntityType    string          `json:"entity_type"`
	EntityID      string          `json:"entity_id"`
	TaskType      PollingTaskType `json:"task_type"`
	ChainID       uint32          `json:"chain_id"`
	TxHash        string          `json:"tx_hash"`
	TargetStatus  string          `json:"target_status"`
	CurrentStatus string          `json:"current_status"`
	MaxRetries    int             `json:"max_retries"`
	PollInterval  int             `json:"poll_interval"`
}

// Blockchain client interface - different from
type BlockchainClientInterface interface {
	// checkstatus
	CheckTransactionStatus(txHash string) (*TransactionStatus, error)

	// checkcommitmentwhetherexists
	CheckCommitmentExists(commitment string) (*CommitmentStatus, error)

	// checknullifierwhetheruse
	CheckNullifierUsed(nullifier string) (*NullifierStatus, error)

	// getchain ID
	GetChainID() uint32
}

// status
type TransactionStatus struct {
	Exists      bool   `json:"exists"`
	Confirmed   bool   `json:"confirmed"`
	Success     bool   `json:"success"`
	BlockNumber uint64 `json:"block_number"`
	ErrorReason string `json:"error_reason,omitempty"`
}

// Commitmentstatus
type CommitmentStatus struct {
	Exists      bool   `json:"exists"`
	Confirmed   bool   `json:"confirmed"`
	BlockNumber uint64 `json:"block_number"`
	TxHash      string `json:"tx_hash"`
}

// Nullifierstatus
type NullifierStatus struct {
	Used        bool   `json:"used"`
	BlockNumber uint64 `json:"block_number"`
	TxHash      string `json:"tx_hash"`
}
