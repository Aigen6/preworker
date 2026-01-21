package models

import (
	"time"
)

// privacy transfer credential status enum - strictly following WebSocket design documentation
type CheckbookStatus string

const (
	CheckbookStatusPending              CheckbookStatus = "pending"               // deposit submitted, processing
	CheckbookStatusUnsigned             CheckbookStatus = "unsigned"              // deposit confirmed, encrypting securely
	CheckbookStatusReadyForCommitment   CheckbookStatus = "ready_for_commitment"  // already，SetInfo
	CheckbookStatusGeneratingProof      CheckbookStatus = "generating_proof"      // generating exclusive privacy transfer credential
	CheckbookStatusSubmittingCommitment CheckbookStatus = "submitting_commitment" // transferalready，in progresssaveblockchain
	CheckbookStatusCommitmentPending    CheckbookStatus = "commitment_pending"    // transferalready，Waitblockchainconfirm
	CheckbookStatusWithCheckbook        CheckbookStatus = "with_checkbook"        // transferalreadycompleted，can

	// status
	CheckbookStatusProofFailed      CheckbookStatus = "proof_failed"      // Failed
	CheckbookStatusSubmissionFailed CheckbookStatus = "submission_failed" // Failed
	CheckbookStatusDeleted          CheckbookStatus = "DELETED"            // recordalreadydelete，
)

// Checkbookalreadydelete，Usezkpay_v2_models.go

// status - strictly following WebSocket design documentation
type CheckStatus string

const (
	CheckStatusIdle                   CheckStatus = "idle"                     // withdrawalready，Waituser
	CheckStatusPendingProof           CheckStatus = "pending_proof"            // in progresswithdraw
	CheckStatusSubmittingToManagement CheckStatus = "submitting_to_management" // withdrawalready，in progressprocess
	CheckStatusManagementPending      CheckStatus = "management_pending"       // withdrawrequestalready，in progressprocess
	CheckStatusCrossChainProcessing   CheckStatus = "cross_chain_processing"   // in progresstransfertargetnetwork，
	CheckStatusCompleted              CheckStatus = "completed"                // withdrawSuccess！already

	// status
	CheckStatusProofFailed      CheckStatus = "proof_failed"       // withdrawFailed，retry
	CheckStatusSubmissionFailed CheckStatus = "submission_failed"  // processFailed，retry
	CheckStatusCrossChainFailed CheckStatus = "cross_chain_failed" // process，retrying

	// alreadystatus（）
	CheckStatusUnavailable CheckStatus = "unavailable" // already：
	CheckStatusExtracted   CheckStatus = "extracted"   // already：already
	CheckStatusClaimed     CheckStatus = "claimed"     // already：already
	CheckStatusProving     CheckStatus = "proving"     // already：in progressrequest
	CheckStatusProved      CheckStatus = "proved"      // already：already
	CheckStatusWithdrawing CheckStatus = "withdrawing" // already：in progressrequest
	CheckStatusWithdrawn   CheckStatus = "withdrawn"   // already：alreadycompleted

	// alreadyCheckbookStatusstatus（，status）
	CheckbookStatusSignaturing = CheckbookStatusGeneratingProof      // already：generating_proof
	CheckbookStatusSignatured  = CheckbookStatusReadyForCommitment   // already：ready_for_commitment
	CheckbookStatusIssuing     = CheckbookStatusSubmittingCommitment // already：submitting_commitment
	CheckbookStatusIssued      = CheckbookStatusWithCheckbook        // already：with_checkbook
	CheckbookStatusRProved     = CheckbookStatusGeneratingProof      // already：generating_proof
	CheckbookStatusRIssuing    = CheckbookStatusSubmittingCommitment // already：submitting_commitment
	CheckbookStatusRIssued     = CheckbookStatusWithCheckbook        // already：with_checkbook
)

// Checkalreadydelete，Usezkpay_v2_models.go

// EventLogalreadydelete，Usezkpay_v2_models.go

// status
type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusCancelled TaskStatus = "cancelled"
)


type TaskType string

const (
	TaskTypeProofGeneration       TaskType = "proof_generation"
	TaskTypeTransactionSubmission TaskType = "transaction_submission"
	TaskTypeChainScan             TaskType = "chain_scan"
	TaskTypeTaskMonitor           TaskType = "task_monitor"
	TaskTypeProofTimeout          TaskType = "proof_timeout"
)

// data
type TaskQueue struct {
	ID          string     `json:"id" gorm:"primaryKey"`                 // UUID
	TaskType    TaskType   `json:"task_type" gorm:"not null"`            
	TargetID    string     `json:"target_id" gorm:"not null"`            // checkbook_idorcheck_id
	TaskData    string     `json:"task_data" gorm:"type:jsonb;not null"` //  - storageJSONB
	Status      TaskStatus `json:"status" gorm:"not null"`               // status
	Priority    int        `json:"priority" gorm:"default:10"`           //  (1-20)
	MaxRetries  int        `json:"max_retries" gorm:"default:3"`         // retry
	RetryCount  int        `json:"retry_count" gorm:"default:0"`         // currentretry
	ScheduledAt time.Time  `json:"scheduled_at"`                         
	StartedAt   *time.Time `json:"started_at"`                           // start
	CompletedAt *time.Time `json:"completed_at"`                         // completed
	ErrorMsg    string     `json:"error_message" gorm:"type:text"`       // ErrorMessage
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// KMSkeydata
type KMSKeyMapping struct {
	ID            string    `json:"id" gorm:"primaryKey"`             // UUID
	NetworkName   string    `json:"network_name" gorm:"not null"`     // network (: bsc, ethereum)
	ChainID       int       `json:"chain_id" gorm:"not null"`         // chain ID
	KeyAlias      string    `json:"key_alias" gorm:"not null"`        // key alias in KMS
	K1Key         string    `json:"k1_key" gorm:"type:text;not null"` // K1transport key(Backend)
	PublicAddress string    `json:"public_address" gorm:"not null"`   // corresponding toaddress
	Status        string    `json:"status" gorm:"default:'active'"`   // status: active, inactive
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// KMSkey：
// - idx_network_alias (network_name, key_alias) - 
// - idx_chain_alias (chain_id, key_alias) - 
// - idx_public_address (public_address)

// Database（GORM）
// transfer：
// - idx_user_status (user_address, status)
// - idx_commitment (commitment)
// - idx_deposit_id (deposit_id)
// - idx_coin_type (coin_type)

// ：
// - idx_commitment (commitment)
// - idx_nullifier (nullifier) - 
// - idx_checkbook_status (checkbook_id, status)
// - idx_deleted_at (deleted_at)

// event：
// - idx_target_type (target_id, event_type)
// - idx_processed_at (processed_at)

// ：
// - idx_status_priority (status, priority)
// - idx_target_type (target_id, task_type)
// - idx_scheduled (scheduled_at)
