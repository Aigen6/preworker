// ZKPay database model -  ZKPay.sol contract
package models

import (
	"log"
	"time"

	"go-backend/internal/utils"
)

// ============ blockchain event table ============

// EventDepositReceived deposit received event table (Treasury.DepositReceived)
type EventDepositReceived struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID         int64     `json:"chain_id" gorm:"column:chain_id;index;not null;default:714"`      // unified Chain ID field
	SLIP44ChainID   int64     `json:"slip44_chain_id" gorm:"column:slip44_chain_id;index;default:714"` // SLIP-44 Chain ID (compatible with legacy code)
	EVMChainID      *int64    `json:"evm_chain_id,omitempty" gorm:"index"`                             // EVM Chain ID -
	ContractAddress string    `json:"contract_address" gorm:"not null"`
	EventName       string    `json:"event_name" gorm:"not null"`
	BlockNumber     uint64    `json:"block_number" gorm:"index;not null"`
	TransactionHash string    `json:"transaction_hash" gorm:"index;not null"`
	LogIndex        uint      `json:"log_index" gorm:"not null"`
	BlockTimestamp  time.Time `json:"block_timestamp" gorm:"not null"`

	// Event Data
	Depositor      string `json:"depositor" gorm:"index;not null"`        // address indexed depositor
	Token          string `json:"token" gorm:"index;not null"`            // address indexed token
	Amount         string `json:"amount" gorm:"not null"`                 // uint256 amount
	LocalDepositId uint64 `json:"local_deposit_id" gorm:"index;not null"` // uint64 indexed localDepositId
	EventChainId   uint32 `json:"event_chain_id" gorm:"default:714"`      // uint32 chainId (from event, EVM)
	PromoteCode    string `json:"promote_code" gorm:"not null"`           // bytes6 promoteCode

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// EventDepositRecorded depositrecordevent (ZKPayProxy.DepositRecorded)
type EventDepositRecorded struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID         int64     `json:"chain_id" gorm:"column:chain_id;index;not null;default:714"`      // unified Chain ID field
	SLIP44ChainID   int64     `json:"slip44_chain_id" gorm:"column:slip44_chain_id;index;default:714"` // SLIP-44 Chain ID (compatible with legacy code)
	EVMChainID      *int64    `json:"evm_chain_id,omitempty" gorm:"index"`                             // EVM Chain ID -
	ContractAddress string    `json:"contract_address" gorm:"not null"`
	EventName       string    `json:"event_name" gorm:"not null"`
	BlockNumber     uint64    `json:"block_number" gorm:"index;not null"`
	TransactionHash string    `json:"transaction_hash" gorm:"index;not null"`
	LogIndex        uint      `json:"log_index" gorm:"not null"`
	BlockTimestamp  time.Time `json:"block_timestamp" gorm:"not null"`

	// Event Data
	LocalDepositId    uint64 `json:"local_deposit_id" gorm:"index;not null"` // uint64 indexed localDepositId
	TokenId           uint16 `json:"token_id" gorm:"not null"`               // uint16 tokenId
	OwnerChainId      uint16 `json:"owner_chain_id" gorm:"not null"`         // UniversalAddress.chainId
	OwnerData         string `json:"owner_data" gorm:"not null"`             // UniversalAddress.data
	GrossAmount       string `json:"gross_amount" gorm:"not null"`           // uint256 grossAmount
	FeeTotalLocked    string `json:"fee_total_locked" gorm:"not null"`       // uint256 feeTotalLocked
	AllocatableAmount string `json:"allocatable_amount" gorm:"not null"`     // uint256 allocatableAmount
	PromoteCode       string `json:"promote_code" gorm:"not null"`           // bytes6 promoteCode
	AddressRank       uint8  `json:"address_rank" gorm:"not null"`           // uint8 addressRank
	DepositTxHash     string `json:"deposit_tx_hash" gorm:"index;not null"`  // bytes32 depositTxHash
	EventBlockNumber  uint64 `json:"event_block_number" gorm:"not null"`     // uint64 blockNumber (from event)
	EventTimestamp    uint64 `json:"event_timestamp" gorm:"not null"`        // uint256 timestamp (from event)

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// EventDepositUsed depositUseevent (ZKPayProxy.DepositUsed)
type EventDepositUsed struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID         int64     `json:"chain_id" gorm:"column:chain_id;index;not null;default:714"`      // unified Chain ID field
	SLIP44ChainID   int64     `json:"slip44_chain_id" gorm:"column:slip44_chain_id;index;default:714"` // SLIP-44 Chain ID (compatible with legacy code)
	EVMChainID      *int64    `json:"evm_chain_id,omitempty" gorm:"index"`                             // EVM Chain ID -
	ContractAddress string    `json:"contract_address" gorm:"not null"`
	EventName       string    `json:"event_name" gorm:"not null"`
	BlockNumber     uint64    `json:"block_number" gorm:"index;not null"`
	TransactionHash string    `json:"transaction_hash" gorm:"index;not null"`
	LogIndex        uint      `json:"log_index" gorm:"not null"`
	BlockTimestamp  time.Time `json:"block_timestamp" gorm:"not null"`

	// Event Data
	EventChainId   uint32 `json:"event_chain_id" gorm:"index;default:714"` // uint32 indexed chainId
	LocalDepositId uint64 `json:"local_deposit_id" gorm:"index;not null"`  // uint64 indexed localDepositId
	Commitment     string `json:"commitment" gorm:"index;not null"`        // bytes32 indexed commitment
	PromoteCode    string `json:"promote_code" gorm:"not null"`            // bytes6 promoteCode

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// EventCommitmentRootUpdated Updateevent (ZKPayProxy.CommitmentRootUpdated)
type EventCommitmentRootUpdated struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID         int64     `json:"chain_id" gorm:"column:chain_id;index;not null;default:714"`      // unified Chain ID field
	SLIP44ChainID   int64     `json:"slip44_chain_id" gorm:"column:slip44_chain_id;index;default:714"` // SLIP-44 Chain ID (compatible with legacy code)
	EVMChainID      *int64    `json:"evm_chain_id,omitempty" gorm:"index"`                             // EVM Chain ID -
	ContractAddress string    `json:"contract_address" gorm:"not null"`
	EventName       string    `json:"event_name" gorm:"not null"`
	BlockNumber     uint64    `json:"block_number" gorm:"index;not null"`
	TransactionHash string    `json:"transaction_hash" gorm:"index;not null"`
	LogIndex        uint      `json:"log_index" gorm:"not null"`
	BlockTimestamp  time.Time `json:"block_timestamp" gorm:"not null"`

	// Event Data
	OldRoot    string `json:"old_root" gorm:"index;not null"`   // bytes32 indexed oldRoot
	Commitment string `json:"commitment" gorm:"index;not null"` // bytes32 indexed commitment
	NewRoot    string `json:"new_root" gorm:"index;not null"`   // bytes32 indexed newRoot

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// EventWithdrawRequested withdrawrequestevent (ZKPayProxy.WithdrawRequested)
type EventWithdrawRequested struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID         int64     `json:"chain_id" gorm:"column:chain_id;index;not null;default:714"`      // unified Chain ID field
	SLIP44ChainID   int64     `json:"slip44_chain_id" gorm:"column:slip44_chain_id;index;default:714"` // SLIP-44 Chain ID (compatible with legacy code)
	EVMChainID      *int64    `json:"evm_chain_id,omitempty" gorm:"index"`                             // EVM Chain ID -
	ContractAddress string    `json:"contract_address" gorm:"not null"`
	EventName       string    `json:"event_name" gorm:"not null"`
	BlockNumber     uint64    `json:"block_number" gorm:"index;not null"`
	TransactionHash string    `json:"transaction_hash" gorm:"index;not null"`
	LogIndex        uint      `json:"log_index" gorm:"not null"`
	BlockTimestamp  time.Time `json:"block_timestamp" gorm:"not null"`

	// Event Data
	RequestId        string `json:"request_id" gorm:"index;not null"`   // bytes32 indexed requestId
	RecipientChainId uint16 `json:"recipient_chain_id" gorm:"not null"` // UniversalAddress.chainId
	RecipientData    string `json:"recipient_data" gorm:"not null"`     // UniversalAddress.data
	TokenId          uint16 `json:"token_id" gorm:"not null"`           // uint16 tokenId
	Amount           string `json:"amount" gorm:"not null"`             // uint256 amount

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// EventWithdrawExecuted withdrawevent (Treasury.WithdrawExecuted)
type EventWithdrawExecuted struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID         int64     `json:"chain_id" gorm:"column:chain_id;index;not null;default:714"`      // unified Chain ID field
	SLIP44ChainID   int64     `json:"slip44_chain_id" gorm:"column:slip44_chain_id;index;default:714"` // SLIP-44 Chain ID (compatible with legacy code)
	EVMChainID      *int64    `json:"evm_chain_id,omitempty" gorm:"index"`                             // EVM Chain ID -
	ContractAddress string    `json:"contract_address" gorm:"not null"`
	EventName       string    `json:"event_name" gorm:"not null"`
	BlockNumber     uint64    `json:"block_number" gorm:"index;not null"`
	TransactionHash string    `json:"transaction_hash" gorm:"index;not null"`
	LogIndex        uint      `json:"log_index" gorm:"not null"`
	BlockTimestamp  time.Time `json:"block_timestamp" gorm:"not null"`

	// Event Data
	Recipient string `json:"recipient" gorm:"index;not null"`  // address indexed recipient
	Token     string `json:"token" gorm:"index;not null"`      // address indexed token
	Amount    string `json:"amount" gorm:"not null"`           // uint256 amount
	RequestId string `json:"request_id" gorm:"index;not null"` // bytes32 indexed requestId

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ============  ============

// UniversalAddress address - corresponding to Common.UniversalAddress
type UniversalAddress struct {
	SLIP44ChainID uint32  `json:"slip44_chain_id" gorm:"column:chain_id;not null"` // SLIP-44 Chain ID (BSC=714, ETH=60)
	EVMChainID    *uint32 `json:"evm_chain_id,omitempty"`                          // EVM Chain ID (BSC=56, ETH=1) -
	Data          string  `json:"data" gorm:"not null;size:66"`                    // addressdata (bytes32 as hex string, 0x + 64 hex chars = 66 chars)
}

// ============ deposit ============

// DepositInfo - corresponding tocontract DepositInfo
type DepositInfo struct {
	// : SLIP44ChainID + LocalDepositID
	SLIP44ChainID  uint32  `json:"slip44_chain_id" gorm:"column:slip44_chain_id;primaryKey"` // SLIP-44 Chain ID (BSC=714, ETH=60)
	ChainID        int64   `json:"chain_id" gorm:"column:chain_id;not null;index"`           // chain ID (，different from)
	EVMChainID     *uint32 `json:"evm_chain_id,omitempty"`                                   // EVM Chain ID (BSC=56, ETH=1) -
	LocalDepositID uint64  `json:"local_deposit_id" gorm:"primaryKey"`                       // depositID

	// Info
	TokenID           uint16           `json:"token_id" gorm:"not null"`                    // tokenID
	Owner             UniversalAddress `json:"owner" gorm:"embedded;embeddedPrefix:owner_"` // address
	GrossAmount       string           `json:"gross_amount" gorm:"not null"`                // amount (BigInt as string)
	FeeTotalLocked    string           `json:"fee_total_locked" gorm:"not null"`
	AllocatableAmount string           `json:"allocatable_amount" gorm:"not null"` // amount

	// Info
	PromoteCode   string `json:"promote_code" gorm:"size:14"`    //  (bytes6 as hex, 0x prefix)
	AddressRank   uint8  `json:"address_rank"`                   // address
	DepositTxHash string `json:"deposit_tx_hash" gorm:"size:66"` // deposithash
	BlockNumber   uint64 `json:"block_number"`
	Used          bool   `json:"used" gorm:"default:false"` // whetheralreadyUse

	// timestamp
	ContractTimestamp uint64    `json:"contract_timestamp"` // contracttimestamp
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// ============ and ============

// Commitment record - corresponding to executeCommitment
type Commitment struct {
	ID string `json:"id" gorm:"primaryKey"` // UUID

	// depositInfo
	SLIP44ChainID  uint32  `json:"slip44_chain_id" gorm:"column:slip44_chain_id;not null;index"` // SLIP-44 Chain ID
	EVMChainID     *uint32 `json:"evm_chain_id,omitempty"`                                       // EVM Chain ID -
	LocalDepositID uint64  `json:"local_deposit_id" gorm:"not null;index"`                       // corresponding to executeCommitment  localDepositId
	TokenID        uint16  `json:"token_id" gorm:"not null"`                                     // corresponding to executeCommitment  tokenId

	Commitment        string `json:"commitment" gorm:"size:66;uniqueIndex;not null"` //  (bytes32 as hex)
	AllocatableAmount string `json:"allocatable_amount" gorm:"not null"`             // amount (corresponding to executeCommitment )

	// andstatus
	Proof            string  `json:"proof" gorm:"type:text"`                 // SP1 data
	Status           string  `json:"status" gorm:"not null;default:pending"` // pending, verified, used
	OldRoot          string  `json:"old_root" gorm:"size:66"`                // queue root
	NewRoot          string  `json:"new_root" gorm:"size:66"`                // queue root
	ExecuteTimestamp *uint64 `json:"execute_timestamp"`                      // timestamp
	TransactionHash  string  `json:"transaction_hash" gorm:"size:66"`        // hash

	// timestamp
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ============ Intent System Types ============

// AllocationStatus represents the status of an allocation
type AllocationStatus string

const (
	AllocationStatusIdle    AllocationStatus = "idle"    // Available for withdrawal
	AllocationStatusPending AllocationStatus = "pending" // Added to WithdrawRequest, waiting for proof
	AllocationStatusUsed    AllocationStatus = "used"    // Nullifier consumed on-chain (irreversible)
)

// IntentType represents the type of withdrawal intent
type IntentType uint8

const (
	IntentTypeRawToken   IntentType = 0 // Direct native token transfer (USDT, USDC, ETH)
	IntentTypeAssetToken IntentType = 1 // Derivative token transfer (aUSDT, stETH, yvUSDT)
)

// Intent represents a withdrawal intent (embedded in WithdrawRequest)
// Note: This matches ZKVM program input format
// Updated to match new Intent definition:
// - RawToken: { beneficiary, token_symbol } - removed token_contract
// - AssetToken: { asset_id, beneficiary, asset_token_symbol } - removed preferred_chain
type Intent struct {
	Type        IntentType       `json:"type"`        // 0=RawToken, 1=AssetToken
	Beneficiary UniversalAddress `json:"beneficiary"` // Target beneficiary address
	TokenSymbol string           `json:"tokenSymbol"` // Token symbol (RawToken: e.g., "USDT", AssetToken: e.g., "aUSDT")
	AssetID     string           `json:"assetId"`     // For AssetToken: 32-byte asset identifier
}

// WithdrawRequestStatus represents the main status of a withdrawal request
type WithdrawRequestStatus string

const (
	// Stage 1: Proof Generation
	WithdrawStatusCreated        WithdrawRequestStatus = "created"         // Request created
	WithdrawStatusProving        WithdrawRequestStatus = "proving"         // Generating ZK proof
	WithdrawStatusProofGenerated WithdrawRequestStatus = "proof_generated" // Proof ready
	WithdrawStatusProofFailed    WithdrawRequestStatus = "proof_failed"    // Proof generation failed

	// Stage 2: On-chain Verification
	WithdrawStatusSubmitting       WithdrawRequestStatus = "submitting"        // Submitting executeWithdraw TX
	WithdrawStatusSubmitted        WithdrawRequestStatus = "submitted"         // TX submitted
	WithdrawStatusExecuteConfirmed WithdrawRequestStatus = "execute_confirmed" // executeWithdraw confirmed on-chain
	WithdrawStatusSubmitFailed     WithdrawRequestStatus = "submit_failed"     // Submit TX failed

	// Stage 3: Intent Execution (Payout)
	WithdrawStatusWaitingForPayout WithdrawRequestStatus = "waiting_for_payout" // Waiting for Treasury.payout
	WithdrawStatusPayoutProcessing WithdrawRequestStatus = "payout_processing"  // Executing payout
	WithdrawStatusPayoutCompleted  WithdrawRequestStatus = "payout_completed"   // Payout completed
	WithdrawStatusPayoutFailed     WithdrawRequestStatus = "payout_failed"      // Payout failed (can retry)

	// Stage 4: Hook Purchase (Optional)
	WithdrawStatusHookProcessing          WithdrawRequestStatus = "hook_processing"            // Processing Hook purchase
	WithdrawStatusHookFailed              WithdrawRequestStatus = "hook_failed"                // Hook purchase failed
	WithdrawStatusCompleted               WithdrawRequestStatus = "completed"                  // All stages completed
	WithdrawStatusCompletedWithHookFailed WithdrawRequestStatus = "completed_with_hook_failed" // Payout completed but Hook failed

	// Terminal States
	WithdrawStatusFailedPermanent  WithdrawRequestStatus = "failed_permanent"  // Permanent failure
	WithdrawStatusManuallyResolved WithdrawRequestStatus = "manually_resolved" // Manually resolved by admin
	WithdrawStatusCancelled        WithdrawRequestStatus = "cancelled"         // User cancelled
)

// ProofStatus sub-status for proof generation
type ProofStatus string

const (
	ProofStatusPending    ProofStatus = "pending"     // Waiting to start
	ProofStatusInProgress ProofStatus = "in_progress" // Generating
	ProofStatusCompleted  ProofStatus = "completed"   // Generated successfully
	ProofStatusFailed     ProofStatus = "failed"      // Failed
)

// ExecuteStatus sub-status for on-chain verification
type ExecuteStatus string

const (
	ExecuteStatusPending      ExecuteStatus = "pending"       // Not yet submitted
	ExecuteStatusSubmitted    ExecuteStatus = "submitted"     // TX submitted
	ExecuteStatusSuccess      ExecuteStatus = "success"       // Confirmed on-chain
	ExecuteStatusSubmitFailed ExecuteStatus = "submit_failed" // Submit failed (RPC error, network issue) - Can retry
	ExecuteStatusVerifyFailed ExecuteStatus = "verify_failed" // Verification failed (proof invalid, nullifier used) - Cannot retry, must cancel
)

// PayoutStatus sub-status for Intent execution
type PayoutStatus string

const (
	PayoutStatusPending    PayoutStatus = "pending"    // Waiting to execute
	PayoutStatusProcessing PayoutStatus = "processing" // Executing
	PayoutStatusCompleted  PayoutStatus = "completed"  // Completed
	PayoutStatusFailed     PayoutStatus = "failed"     // Failed (manual retry)
)

// HookStatus sub-status for Hook purchase (optional)
type HookStatus string

const (
	HookStatusNotRequired HookStatus = "not_required" // No Hook needed
	HookStatusPending     HookStatus = "pending"      // Waiting to process
	HookStatusProcessing  HookStatus = "processing"   // Processing
	HookStatusCompleted   HookStatus = "completed"    // Completed
	HookStatusFailed      HookStatus = "failed"       // Failed (can retry or give up)
	HookStatusAbandoned   HookStatus = "abandoned"    // User gave up, withdrew original tokens
)

// WithdrawRequest represents a withdrawal request (Intent-driven, two-stage lifecycle)
type WithdrawRequest struct {
	ID string `json:"id" gorm:"primaryKey"` // UUID

	// On-chain tracking ID (= nullifiers[0])
	WithdrawNullifier string `json:"withdraw_nullifier" gorm:"size:66;uniqueIndex;not null"` // requestID = nullifiers[0] (also called OnChainRequestID)
	QueueRoot         string `json:"queue_root" gorm:"size:66;not null"`                     // Queue root (for proof verification)

	// User Info
	OwnerAddress UniversalAddress `json:"owner_address" gorm:"embedded;embeddedPrefix:owner_"` // User's universal address

	// Intent Info (stored as JSONB - for future flexibility, currently flattened for compatibility)
	IntentType          IntentType       `json:"intent_type" gorm:"not null;default:0"`                                // 0=RawToken, 1=AssetToken
	TokenIdentifier     string           `json:"token_identifier" gorm:"size:66"`                                      // For RawToken: token contract address
	AssetID             string           `json:"asset_id" gorm:"size:66"`                                              // For AssetToken: asset identifier
	TargetSLIP44ChainID uint32           `json:"target_slip44_chain_id" gorm:"column:target_slip44_chain_id;not null"` // Target chain (beneficiary)
	TargetEVMChainID    *uint32          `json:"target_evm_chain_id,omitempty"`                                        // Target EVM chain ID - optional
	Recipient           UniversalAddress `json:"recipient" gorm:"embedded;embeddedPrefix:recipient_"`                  // Beneficiary address
	PreferredChain      *uint32          `json:"preferred_chain"`                                                      // DEPRECATED: No longer used (removed from Intent definition)
	Amount              string           `json:"amount" gorm:"not null"`                                               // Total withdrawal amount (wei, 18 decimals)

	// Allocation IDs (JSON array of UUIDs) - for tracking which allocations are used
	AllocationIDs string `json:"allocation_ids" gorm:"type:json"` // JSON array of allocation UUIDs

	// Stage 1: Proof Generation
	ProofStatus      ProofStatus `json:"proof_status" gorm:"not null;default:'pending'"` // Proof generation status
	Proof            string      `json:"proof" gorm:"type:text"`                         // ZKVM proof data
	PublicValues     string      `json:"public_values" gorm:"type:text"`                 // ZKVM public values
	ProofGeneratedAt *time.Time  `json:"proof_generated_at"`                             // Proof generation time
	ProofError       string      `json:"proof_error" gorm:"type:text"`                   // Proof generation error message

	// Stage 2: On-chain Verification
	ExecuteStatus      ExecuteStatus `json:"execute_status" gorm:"not null;default:'pending'"` // Execute status
	ExecuteChainID     *uint32       `json:"execute_chain_id"`                                 // Execute chain ID (SLIP44) - where executeWithdraw TX was submitted
	ExecuteTxHash      string        `json:"execute_tx_hash" gorm:"size:66"`                   // executeWithdraw TX hash
	ExecuteBlockNumber *uint64       `json:"execute_block_number"`                             // Execute block number
	ExecutedAt         *time.Time    `json:"executed_at"`                                      // Execute confirmation time
	ExecuteError       string        `json:"execute_error" gorm:"type:text"`                   // Execute error message

	// Route Constraints (user-defined constraints for payout execution)
	MaxSlippageBps  *uint16    `json:"max_slippage_bps"`  // Maximum slippage in basis points (0-10000)
	MinOutputAmount string     `json:"min_output_amount"` // Minimum output amount (wei)
	PayoutDeadline  *time.Time `json:"payout_deadline"`   // Deadline for payout execution

	// Stage 3: Intent Execution (Payout)
	PayoutStatus      PayoutStatus `json:"payout_status" gorm:"not null;default:'pending'"` // Payout status
	PayoutChainID     *uint32      `json:"payout_chain_id"`                                 // Payout chain ID (SLIP44) - where payout TX was submitted (may differ from target chain)
	PayoutTxHash      string       `json:"payout_tx_hash" gorm:"size:66"`                   // Treasury.payout TX hash
	PayoutBlockNumber *uint64      `json:"payout_block_number"`                             // Payout block number
	PayoutCompletedAt *time.Time   `json:"payout_completed_at"`                             // Payout completion time
	PayoutError       string       `json:"payout_error" gorm:"type:text"`                   // Payout error message
	PayoutRetryCount  int          `json:"payout_retry_count" gorm:"default:0"`             // Payout retry count
	PayoutLastRetryAt *time.Time   `json:"payout_last_retry_at"`                            // Last payout retry time
	WorkerType        *uint8       `json:"worker_type"`                                     // Worker type: 0=DirectTransfer, 1=UniswapSwap, 2=DeBridgeCrossChain
	WorkerParams      string       `json:"worker_params" gorm:"type:text"`                  // Worker parameters (JSON encoded)
	ActualOutput      string       `json:"actual_output"`                                   // Actual output amount after execution

	// Bridge/Cross-chain tracking (for cross-chain scenarios)
	BridgeType           string     `json:"bridge_type"`                   // Bridge type: "deBridge", "LiFi", etc.
	BridgeSubmissionId   string     `json:"bridge_submission_id"`          // Bridge submission ID
	BridgeStatus         string     `json:"bridge_status"`                 // Bridge status: "pending", "delivered", "recovered", "failed"
	BridgeError          string     `json:"bridge_error" gorm:"type:text"` // Bridge error message
	BridgeErrorTimestamp *time.Time `json:"bridge_error_timestamp"`        // Bridge error timestamp
	ExpectedArrivalTime  *time.Time `json:"expected_arrival_time"`         // Expected arrival time (for timeout detection)

	// Stage 4: Hook Purchase (Optional)
	HookStatus      HookStatus `json:"hook_status" gorm:"not null;default:'not_required'"` // Hook status
	HookTxHash      string     `json:"hook_tx_hash" gorm:"size:66"`                        // Hook purchase TX hash
	HookCompletedAt *time.Time `json:"hook_completed_at"`                                  // Hook completion time
	HookError       string     `json:"hook_error" gorm:"type:text"`                        // Hook error message
	HookRetryCount  int        `json:"hook_retry_count" gorm:"default:0"`                  // Hook retry count
	HookLastRetryAt *time.Time `json:"hook_last_retry_at"`                                 // Last Hook retry time

	// Hook CallData (from WithdrawRequested event)
	HookIntentType      *uint8  `json:"hook_intent_type"`       // Hook intent type: 0=RawToken, 1=AssetToken
	HookChainID         *uint32 `json:"hook_chain_id"`          // Hook target chain ID (SLIP44)
	HookTokenID         *uint16 `json:"hook_token_id"`          // Hook target token ID
	HookWorkerID        *uint16 `json:"hook_worker_id"`         // Hook worker ID (for AssetToken)
	HookMinOutputAmount string  `json:"hook_min_output_amount"` // Hook minimum output amount

	// Fallback Transfer (when Worker/Hook fails)
	FallbackTransferred bool       `json:"fallback_transferred" gorm:"default:false"` // Whether fallback transfer succeeded
	FallbackError       string     `json:"fallback_error" gorm:"type:text"`           // Fallback transfer error message
	FallbackRetryCount  int        `json:"fallback_retry_count" gorm:"default:0"`     // Fallback retry count
	FallbackLastRetryAt *time.Time `json:"fallback_last_retry_at"`                    // Last fallback retry time

	// Main Status (computed from sub-statuses)
	Status string `json:"status" gorm:"not null;default:'created';index"` // Main status

	// Legacy fields (for backward compatibility)
	RequestID        string  `json:"request_id" gorm:"size:66"`       // DEPRECATED: use WithdrawNullifier
	TokenID          uint16  `json:"token_id"`                        // DEPRECATED: use IntentType/TokenIdentifier
	ExecuteTimestamp *uint64 `json:"execute_timestamp"`               // DEPRECATED: use ExecutedAt
	TransactionHash  string  `json:"transaction_hash" gorm:"size:66"` // DEPRECATED: use ExecuteTxHash

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetIntent returns the Intent object from flattened fields
func (w *WithdrawRequest) GetIntent() Intent {
	return Intent{
		Type:        w.IntentType,
		Beneficiary: w.Recipient,
		TokenSymbol: "", // TokenSymbol not stored in WithdrawRequest (retrieved from Intent when needed)
		AssetID:     w.AssetID,
	}
}

// SetIntent sets the flattened fields from an Intent object
func (w *WithdrawRequest) SetIntent(intent Intent) {
	w.IntentType = intent.Type
	w.Recipient = intent.Beneficiary
	// TokenIdentifier is no longer used for RawToken (token_contract removed)
	// Keep it for backward compatibility but it's not part of Intent anymore
	w.AssetID = intent.AssetID
	// PreferredChain is no longer used (removed from Intent)
	w.TargetSLIP44ChainID = intent.Beneficiary.SLIP44ChainID
	w.TargetEVMChainID = intent.Beneficiary.EVMChainID
}

// CanCancel checks if the withdraw request can be cancelled
// Rules:
// - Cannot cancel after execute_status = success (nullifiers consumed on-chain)
// - Cannot cancel if execute_status = submitted (transaction in mempool, waiting for confirmation)
// - Can cancel if execute_status = verify_failed (proof/nullifier invalid, need to release allocations)
// - Can cancel if execute_status = submit_failed (submission failed, can retry or cancel)
// - Can cancel if still in proof stage (execute_status = pending)
func (w *WithdrawRequest) CanCancel() bool {
	// Already executed successfully - cannot cancel (nullifiers consumed)
	if w.ExecuteStatus == ExecuteStatusSuccess {
		return false
	}

	// Transaction submitted to mempool - cannot cancel (waiting for confirmation)
	// Risk: If user cancels but transaction succeeds, nullifier will be consumed but allocation released
	if w.ExecuteStatus == ExecuteStatusSubmitted {
		return false
	}

	// Can cancel in other cases:
	// - pending (not yet submitted)
	// - submit_failed (submission failed, can retry or cancel)
	// - verify_failed (verification failed, must cancel to release allocations)
	return true
}

// CanRetryExecute checks if on-chain execution can be retried
// Only submit_failed can be retried (RPC/network errors)
// verify_failed cannot be retried (proof invalid, must cancel)
func (w *WithdrawRequest) CanRetryExecute() bool {
	return w.ExecuteStatus == ExecuteStatusSubmitFailed
}

// CanRetryPayout checks if payout can be retried
// ⭐ Simplified design: Payout failures are not retried automatically, require manual resolution
func (w *WithdrawRequest) CanRetryPayout() bool {
	// According to simplified design, payout failures are not retried automatically
	// They are marked as failed_permanent and require manual resolution
	return false
}

// CanRetryHook checks if Hook purchase can be retried
// Note: According to simplified design, Hook itself is not retried
func (w *WithdrawRequest) CanRetryHook() bool {
	// Hook is not retried according to simplified design
	return false
}

// CanRetryFallback checks if fallback transfer can be retried
// Note: According to simplified design, fallback is not retried automatically
func (w *WithdrawRequest) CanRetryFallback() bool {
	// Fallback is not retried automatically, requires manual intervention
	return false
}

// IsTerminal checks if the request is in a terminal state
func (w *WithdrawRequest) IsTerminal() bool {
	switch WithdrawRequestStatus(w.Status) {
	case WithdrawStatusCompleted,
		WithdrawStatusCompletedWithHookFailed,
		WithdrawStatusFailedPermanent,
		WithdrawStatusManuallyResolved,
		WithdrawStatusCancelled:
		return true
	default:
		return false
	}
}

// UpdateMainStatus updates the main status based on sub-statuses
func (w *WithdrawRequest) UpdateMainStatus() {

	// Stage 1: Proof Generation
	if w.ProofStatus == ProofStatusPending {
		w.Status = string(WithdrawStatusCreated)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: proof_status=pending → status=created")
		return
	}
	if w.ProofStatus == ProofStatusInProgress {
		w.Status = string(WithdrawStatusProving)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: proof_status=in_progress → status=proving")
		return
	}
	if w.ProofStatus == ProofStatusFailed {
		w.Status = string(WithdrawStatusProofFailed)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: proof_status=failed → status=proof_failed")
		return
	}
	if w.ProofStatus == ProofStatusCompleted && w.ExecuteStatus == ExecuteStatusPending {
		w.Status = string(WithdrawStatusProofGenerated)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: proof_status=completed && execute_status=pending → status=proof_generated")
		return
	}

	// Stage 2: On-chain Verification
	// 优先检查失败状态（verify_failed 和 submit_failed），再检查进行中状态（submitted）
	if w.ExecuteStatus == ExecuteStatusVerifyFailed {
		w.Status = string(WithdrawStatusFailedPermanent) // Proof invalid, cannot retry
		log.Printf("🧮 [UpdateMainStatus] Rule matched: execute_status=verify_failed → status=failed_permanent")
		return
	}
	if w.ExecuteStatus == ExecuteStatusSubmitFailed {
		w.Status = string(WithdrawStatusSubmitFailed)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: execute_status=submit_failed → status=submit_failed")
		return
	}
	if w.ExecuteStatus == ExecuteStatusSubmitted {
		w.Status = string(WithdrawStatusSubmitting)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: execute_status=submitted → status=submitting")
		return
	}
	if w.ExecuteStatus == ExecuteStatusSuccess && w.PayoutStatus == PayoutStatusPending {
		w.Status = string(WithdrawStatusWaitingForPayout)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: execute_status=success && payout_status=pending → status=waiting_for_payout")
		return
	}

	// Stage 3: Intent Execution (Payout)
	if w.PayoutStatus == PayoutStatusProcessing {
		w.Status = string(WithdrawStatusPayoutProcessing)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=processing → status=payout_processing")
		return
	}
	if w.PayoutStatus == PayoutStatusFailed {
		// ⭐ Simplified design: Payout failure → failed_permanent (waiting for manual resolution)
		w.Status = string(WithdrawStatusFailedPermanent)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=failed → status=failed_permanent")
		return
	}

	// Stage 4: Hook Purchase (Optional)
	if w.PayoutStatus == PayoutStatusCompleted {
		// Default to not_required if hook_status is empty or unset
		hookStatus := w.HookStatus
		if hookStatus == "" {
			hookStatus = HookStatusNotRequired
			log.Printf("🧮 [UpdateMainStatus] hook_status was empty, defaulting to not_required")
		}

		if hookStatus == HookStatusNotRequired || hookStatus == HookStatusCompleted {
			w.Status = string(WithdrawStatusCompleted)
			log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=completed && hook_status=%s → status=completed", hookStatus)
			return
		}
		if hookStatus == HookStatusProcessing {
			w.Status = string(WithdrawStatusHookProcessing)
			log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=completed && hook_status=processing → status=hook_processing")
			return
		}
		if hookStatus == HookStatusFailed {
			// Hook failed: check if fallback transfer succeeded
			if w.FallbackTransferred {
				// Fallback transfer succeeded: mark as completed
				w.Status = string(WithdrawStatusCompleted)
				log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=completed && hook_status=failed && fallback_transferred=true → status=completed")
				return
			}
			// Hook failed and fallback not transferred: mark as failed (waiting for manual resolution)
			w.Status = string(WithdrawStatusFailedPermanent)
			log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=completed && hook_status=failed && fallback_transferred=false → status=failed_permanent")
			return
		}
		if hookStatus == HookStatusAbandoned {
			// User withdrew original tokens, gave up on Hook
			w.Status = string(WithdrawStatusCompletedWithHookFailed)
			log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=completed && hook_status=abandoned → status=completed_with_hook_failed")
			return
		}

		// If hook_status is unknown/unexpected value, default to completed (payout succeeded)
		// This handles edge cases where hook_status might be in an unexpected state
		w.Status = string(WithdrawStatusCompleted)
		log.Printf("🧮 [UpdateMainStatus] Rule matched: payout_status=completed && hook_status=unknown(%s) → status=completed (default)", hookStatus)
		return
	}

	// ⭐ Note: Payout failure is already handled above (line 550-553)
	// This check is kept for backward compatibility but should not be reached
	// since PayoutStatusFailed is already handled above

	// Default: keep current status if no rule matches
	log.Printf("🧮 [UpdateMainStatus] No rule matched, keeping current status: %s (proof=%s, execute=%s, payout=%s, hook=%s)",
		w.Status, w.ProofStatus, w.ExecuteStatus, w.PayoutStatus, w.HookStatus)
}

// ============ queue root ============

// QueueRoot queue rootrecord
type QueueRoot struct {
	ID string `json:"id" gorm:"primaryKey"` // UUID

	Root                string `json:"root" gorm:"size:66;not null"`         // queue root (bytes32 as hex)
	PreviousRoot        string `json:"previous_root" gorm:"size:66"`         // queue root (bidirectional linked list)
	IsRecentRoot        bool   `json:"is_recent_root" gorm:"default:false"`  // whether
	CreatedByCommitment string `json:"created_by_commitment" gorm:"size:66"` // Create
	BlockNumber         uint64 `json:"block_number"`                         // Create
	ChainID             int64  `json:"chain_id" gorm:"index"`                // Chain ID for querying

	// timestamp
	CreatedAt time.Time `json:"created_at"`
}

// ============ Allocation (Check) ============

// Check represents an allocation - a portion of a checkbook allocated for potential withdrawal
// This is the core "Allocation" entity in the Intent system
// Note: AllocationStatus is defined earlier in this file (line 277-283)
type Check struct {
	ID string `json:"id" gorm:"primaryKey"` // UUID

	// Checkbook relationship
	CheckbookID string `json:"checkbook_id" gorm:"not null;index"` // Foreign key to Checkbook

	// Allocation Info
	Seq    uint8  `json:"seq" gorm:"not null"`    // Sequence number (0-255)
	Amount string `json:"amount" gorm:"not null"` // Allocation amount (wei, 18 decimals)

	// Status and Nullifier
	Status    AllocationStatus `json:"status" gorm:"not null;default:'idle';index"` // idle/pending/used
	Nullifier string           `json:"nullifier" gorm:"size:66;uniqueIndex"`        // Nullifier hash (unique, set after commitment)

	// WithdrawRequest relationship (optional)
	WithdrawRequestID *string `json:"withdraw_request_id" gorm:"index"` // Foreign key to WithdrawRequest (NULL if idle)

	// Legacy fields (deprecated, keep for backward compatibility)
	TokenID         uint16           `json:"token_id,omitempty"`                                            // DEPRECATED: use Checkbook.TokenID
	Recipient       UniversalAddress `json:"recipient,omitempty" gorm:"embedded;embeddedPrefix:recipient_"` // DEPRECATED: use Intent
	ProofData       string           `json:"proof_data,omitempty" gorm:"type:text"`                         // DEPRECATED
	RequestID       *string          `json:"request_id,omitempty" gorm:"size:66"`                           // DEPRECATED: use WithdrawRequestID
	TransactionHash string           `json:"transaction_hash,omitempty" gorm:"size:66"`                     // DEPRECATED

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ============ Checkbook ============

// Checkbook represents a deposit with allocations (Intent-driven architecture)
// Note: We use existing CheckbookStatus enum for compatibility (defined in models.go)
type Checkbook struct {
	ID string `json:"id" gorm:"primaryKey"` // UUID

	// Deposit Info (Unique ID = ChainID + LocalDepositID)
	SLIP44ChainID          uint32  `json:"slip44_chain_id" gorm:"column:chain_id;not null;index"` // SLIP-44 Chain ID (BSC=714, ETH=60)
	EVMChainID             *uint32 `json:"evm_chain_id,omitempty"`                                // EVM Chain ID (BSC=56, ETH=1) - optional
	LocalDepositID         uint64  `json:"local_deposit_id" gorm:"not null;index"`                // Deposit ID on source chain
	DepositTransactionHash string  `json:"deposit_transaction_hash" gorm:"size:66"`               // Deposit transaction hash

	// User Info
	UserAddress UniversalAddress `json:"user_address" gorm:"embedded;embeddedPrefix:user_"` // User's universal address
	// Note: user_data column should be VARCHAR(66) - handled by UniversalAddress.Data size:66 tag and fixAllUniversalAddressColumns()
	TokenKey     string `json:"token_key" gorm:"size:50;index;not null"` // Token key (original string like "USDT", "USDC") converted from hash in DepositRecorded event
	Amount       string `json:"amount" gorm:"not null"`                  // Total deposit amount (wei, 18 decimals)
	TokenAddress string `json:"token_address"`                           // Token contract address (optional)

	// Amounts from DepositRecorded event
	GrossAmount       string `json:"gross_amount"`       // Gross amount before fees
	AllocatableAmount string `json:"allocatable_amount"` // Amount available for allocation
	FeeTotalLocked    string `json:"fee_total_locked"`   // Total fees locked
	PromoteCode       string `json:"promote_code"`       // Promotion code

	// Status and Commitment
	Status     CheckbookStatus `json:"status" gorm:"not null;index"`                    // Checkbook status (using existing enum for compatibility)
	Commitment *string         `json:"commitment,omitempty" gorm:"size:66;uniqueIndex"` // Commitment hash (NULL until commitment is created)
	Signature  string          `json:"signature" gorm:"type:text"`                      // User's signature (EIP-191/TIP-191)

	// Proof and Transaction
	ProofSignature        string  `json:"proof_signature" gorm:"type:text"`  // ZKVM proof data
	PublicValues          string  `json:"public_values" gorm:"type:text"`    // ZKVM public values
	CommitmentTxHash      string  `json:"commitment_tx_hash" gorm:"size:66"` // Commitment transaction hash
	CommitmentBlockNumber *uint64 `json:"commitment_block_number"`           // Commitment block number

	// Allocations (relationship)
	Allocations []Check `json:"allocations,omitempty" gorm:"foreignKey:CheckbookID"` // Allocations (Check entities)

	// Legacy withdraw fields (deprecated, keep for backward compatibility)
	WithdrawRecipient UniversalAddress `json:"withdraw_recipient,omitempty" gorm:"embedded;embeddedPrefix:withdraw_recipient_"` // DEPRECATED
	WithdrawAmount    string           `json:"withdraw_amount,omitempty"`                                                       // DEPRECATED
	WithdrawQueueRoot string           `json:"withdraw_queue_root,omitempty"`                                                   // DEPRECATED
	WithdrawNullifier string           `json:"withdraw_nullifier,omitempty"`                                                    // DEPRECATED

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// IsCompleted checks if all allocations are used (calculated property)
func (c *Checkbook) IsCompleted() bool {
	if len(c.Allocations) == 0 {
		return false
	}
	for _, alloc := range c.Allocations {
		if alloc.Status != AllocationStatusUsed {
			return false
		}
	}
	return true
}

// ============ event ============

// EventLog event - contractevent
type EventLog struct {
	ID string `json:"id" gorm:"primaryKey"` // UUID

	// eventInfo
	EventType       string `json:"event_type" gorm:"not null;index"`       // event
	ContractAddress string `json:"contract_address" gorm:"not null;index"` // contractaddress
	TransactionHash string `json:"transaction_hash" gorm:"not null;index"` // hash
	BlockNumber     uint64 `json:"block_number" gorm:"not null;index"`
	LogIndex        uint32 `json:"log_index" gorm:"not null"` // log index

	// eventdata (JSON，differentevent)
	EventData string `json:"event_data" gorm:"type:jsonb"` // eventdata (JSONB)

	// processstatus
	ProcessedAt *time.Time `json:"processed_at"`                           // process
	Status      string     `json:"status" gorm:"not null;default:pending"` // pending, processed, failed

	// timestamp
	CreatedAt time.Time `json:"created_at"`
}

// ============ Intent Configuration Tables ============

// IntentRawToken Raw Token configuration (native tokens like USDT, USDC, ETH)
// IntentRawToken Raw Token configuration - each chain's token is a separate record
// Example: ETH USDT, BSC USDT, Polygon USDT are three separate records
type IntentRawToken struct {
	ID           uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	TokenAddress string    `json:"token_address" gorm:"not null;size:66;uniqueIndex:idx_token_chain"` // Token contract address on this specific chain
	ChainID      uint32    `json:"chain_id" gorm:"not null;index;uniqueIndex:idx_token_chain"`        // SLIP-44 Chain ID (ETH=60, BSC=714)
	ChainName    string    `json:"chain_name" gorm:"size:50"`                                         // Ethereum, BSC, Polygon
	Symbol       string    `json:"symbol" gorm:"not null;size:10;index"`                              // USDT, USDC, ETH
	Name         string    `json:"name" gorm:"size:50"`                                               // Tether USD
	Decimals     uint8     `json:"decimals" gorm:"not null"`                                          // 6, 18
	IconURL      string    `json:"icon_url" gorm:"size:200"`                                          // Icon URL
	Description  string    `json:"description" gorm:"type:text"`                                      // Description
	IsActive     bool      `json:"is_active" gorm:"not null;default:true;index"`                      // Active status
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// IntentRawTokenChain Raw Token chain configuration
type IntentRawTokenChain struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	TokenIdentifier string    `json:"token_identifier" gorm:"not null;size:66;index"` // Foreign key
	ChainID         uint32    `json:"chain_id" gorm:"not null;index"`                 // SLIP-44 Chain ID (ETH=60, BSC=714, Polygon=966)
	ChainName       string    `json:"chain_name" gorm:"size:20"`                      // BSC, Ethereum, Polygon
	TokenAddress    string    `json:"token_address" gorm:"not null;size:42"`          // Token address on this chain
	IsNative        bool      `json:"is_native" gorm:"not null;default:false"`        // Is native token (like ETH)
	IsActive        bool      `json:"is_active" gorm:"not null;default:true;index"`   // Active status
	MinWithdraw     string    `json:"min_withdraw" gorm:"default:0"`                  // Minimum withdraw amount
	MaxWithdraw     string    `json:"max_withdraw" gorm:"default:0"`                  // Maximum withdraw amount (0 = no limit)
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// IntentAssetToken Asset Token configuration (DeFi protocol tokens like aUSDT, stETH)
// Multi-chain unified management: Asset Token ID encoding (bytes32 = 256 bits):

//	┌──────────────┬──────────────┬────────────┬─────────────────────────┐
//	│  SLIP-44 ID  │  Adapter ID  │  Token ID  │      Reserved           │
//	│   4 bytes    │   4 bytes    │   2 bytes  │      22 bytes (zeros)   │
//	│  (uint32)    │  (uint32)    │  (uint16)  │                         │
//	└──────────────┴──────────────┴────────────┴─────────────────────────┘

// Example: BSC Aave V3 aUSDT = 0x000002ca000000010001000000000000000000000000000000000000000000000000
//          ^^^^^^^^ ^^^^^^^^ ^^^^
//          714(BSC) Adapter1 Token1

// (SLIP-44 ID = 714 (BSC), Adapter ID = 1, Token ID = 1, rest = zeros)
type IntentAssetToken struct {
	ID                uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID           uint32    `json:"chain_id" gorm:"not null;index;uniqueIndex:idx_chain_adapter_token"`   // SLIP-44 Chain ID (directly stored)
	AdapterID         uint32    `json:"adapter_id" gorm:"index;not null;uniqueIndex:idx_chain_adapter_token"` // Adapter ID
	TokenID           uint16    `json:"token_id" gorm:"index;not null;uniqueIndex:idx_chain_adapter_token"`   // Token ID
	AssetID           string    `json:"asset_id" gorm:"size:66;index"`                                        // Computed field: EncodeAssetID(chain_id, adapter_id, token_id). Kept for backward compatibility.
	Symbol            string    `json:"symbol" gorm:"not null;size:10"`                                       // aUSDT, stETH, yvUSDT
	Name              string    `json:"name" gorm:"size:50"`                                                  // Aave USDT, Lido Staked ETH
	Protocol          string    `json:"protocol" gorm:"size:30;index"`                                        // Aave V3, Lido, Yearn Finance
	BaseToken         string    `json:"base_token" gorm:"size:66"`                                            // Base token Universal Address (0x... 66 chars) or ERC20 address (42 chars)
	BaseTokenSymbol   string    `json:"base_token_symbol" gorm:"size:10"`                                     // USDT, ETH, DAI
	BaseTokenDecimals uint8     `json:"base_token_decimals" gorm:"default:0"`                                 // Base token decimals
	IconURL           string    `json:"icon_url" gorm:"size:200"`                                             // Icon URL
	Description       string    `json:"description" gorm:"type:text"`                                         // Description
	IsActive          bool      `json:"is_active" gorm:"not null;default:true;index"`                         // Active status
	Decimals          uint8     `json:"decimals" gorm:"not null"`                                             // 6, 18
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// GetAssetID computes asset_id from chain_id, adapter_id, and token_id
// If AssetID is already set, returns it; otherwise computes from three fields
func (t *IntentAssetToken) GetAssetID() string {
	if t.AssetID != "" {
		return t.AssetID // Return cached value if available
	}
	// Compute from three fields
	if t.ChainID != 0 && t.AdapterID != 0 && t.TokenID != 0 {
		return utils.EncodeAssetID(t.ChainID, t.AdapterID, t.TokenID)
	}
	return "" // Cannot compute if fields are missing
}

// IntentAssetTokenChain Asset Token chain configuration
type IntentAssetTokenChain struct {
	ID                 uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	AssetID            string    `json:"asset_id" gorm:"not null;size:66;index"`             // Foreign key
	ChainID            uint32    `json:"chain_id" gorm:"not null;index"`                     // SLIP-44 Chain ID (ETH=60, BSC=714)
	ChainName          string    `json:"chain_name" gorm:"size:20"`                          // BSC, Ethereum
	AdapterAddress     string    `json:"adapter_address" gorm:"not null;size:42;index"`      // Adapter contract address
	AdapterName        string    `json:"adapter_name" gorm:"size:50"`                        // AaveV3USDTAdapter
	AssetTokenAddress  string    `json:"asset_token_address" gorm:"not null;size:42"`        // Asset token (aUSDT) contract address
	Description        string    `json:"description" gorm:"type:text"`                       // Chain-specific description
	APY                string    `json:"apy" gorm:"size:10"`                                 // Annual Percentage Yield (optional)
	TVL                string    `json:"tvl" gorm:"size:50"`                                 // Total Value Locked (optional)
	IsActive           bool      `json:"is_active" gorm:"not null;default:true;index"`       // Active status
	SupportsCrossChain bool      `json:"supports_cross_chain" gorm:"not null;default:false"` // Supports cross-chain
	MinWithdraw        string    `json:"min_withdraw" gorm:"default:0"`                      // Minimum withdraw amount
	MaxWithdraw        string    `json:"max_withdraw" gorm:"default:0"`                      // Maximum withdraw amount (0 = no limit)
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// IntentAdapter Adapter detailed information
type IntentAdapter struct {
	ID                 uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	AdapterID          uint32    `json:"adapter_id" gorm:"not null;uniqueIndex:idx_chain_adapter"`      // Business Adapter ID (unique per chain, 1-65535)
	ChainID            uint32    `json:"chain_id" gorm:"not null;index;uniqueIndex:idx_chain_adapter"`  // SLIP-44 Chain ID (ETH=60, BSC=714, Arbitrum=1042161)
	Address            string    `json:"address" gorm:"not null;size:42;uniqueIndex:idx_chain_address"` // Adapter address
	Name               string    `json:"name" gorm:"size:50"`                                           // Adapter name
	Protocol           string    `json:"protocol" gorm:"size:30;index"`                                 // Protocol name (Aave V3, Lido)
	Version            string    `json:"version" gorm:"size:20"`                                        // Version (v1.0.0)
	AssetTokenAddress  string    `json:"asset_token_address" gorm:"size:42"`                            // Asset token address
	BaseTokenAddress   string    `json:"base_token_address" gorm:"size:42"`                             // Base token address
	SupportsCrossChain bool      `json:"supports_cross_chain" gorm:"not null;default:false"`            // Supports cross-chain
	SupportsConversion bool      `json:"supports_conversion" gorm:"not null;default:true"`              // Supports conversion
	IsActive           bool      `json:"is_active" gorm:"not null;default:true;index"`                  // Is active
	IsPaused           bool      `json:"is_paused" gorm:"not null;default:false;index"`                 // Is paused
	IsFeatured         bool      `json:"is_featured" gorm:"not null;default:false;index"`               // Featured flag (for homepage display)
	ImplementationAddr string    `json:"implementation_address" gorm:"size:42"`                         // Implementation contract address
	AdminAddress       string    `json:"admin_address" gorm:"size:42"`                                  // Admin address
	Description        string    `json:"description" gorm:"type:text"`                                  // Description
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// IntentAdapterStats Adapter statistics (optional, for monitoring)
type IntentAdapterStats struct {
	ID               uint64     `json:"id" gorm:"primaryKey;autoIncrement"`
	AdapterID        uint64     `json:"adapter_id" gorm:"not null;uniqueIndex"`      // Foreign key to IntentAdapter
	TotalConversions uint64     `json:"total_conversions" gorm:"not null;default:0"` // Total number of conversions
	TotalVolume      string     `json:"total_volume" gorm:"not null;default:0"`      // Total volume (in base token)
	LastConversionAt *time.Time `json:"last_conversion_at"`                          // Last conversion time
	UpdatedAt        time.Time  `json:"updated_at"`
}

// ============================================================================
// Dynamic Metrics (APY, Yield, Price Changes, etc.)
// ============================================================================

// IntentAdapterMetrics stores dynamic metrics for Adapters (e.g., APY, TVL)
// This table stores time-series data that changes daily or more frequently
type IntentAdapterMetrics struct {
	ID         uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	AdapterID  uint64    `json:"adapter_id" gorm:"not null;index"`             // Foreign key to IntentAdapter
	ChainID    uint32    `json:"chain_id" gorm:"not null;index"`               // SLIP-44 Chain ID
	MetricType string    `json:"metric_type" gorm:"not null;size:30;index"`    // apy, tvl, volume_24h, etc.
	MetricName string    `json:"metric_name" gorm:"not null;size:50"`          // Display name: "年化收益率", "APY", "TVL"
	Value      string    `json:"value" gorm:"not null"`                        // Metric value (as string for precision)
	Unit       string    `json:"unit" gorm:"size:10"`                          // Unit: "%", "USD", "ETH"
	RecordedAt time.Time `json:"recorded_at" gorm:"not null;index"`            // When this metric was recorded
	Source     string    `json:"source" gorm:"size:50"`                        // Data source: "manual", "api", "contract"
	IsActive   bool      `json:"is_active" gorm:"not null;default:true;index"` // Whether this is the current/active value
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// IntentAssetTokenMetrics stores dynamic metrics for Asset Tokens (e.g., Yield, Price Change)
// This table stores time-series data specific to each asset token
type IntentAssetTokenMetrics struct {
	ID         uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	AssetID    string    `json:"asset_id" gorm:"not null;size:66;index"`       // Foreign key to IntentAssetToken
	ChainID    uint32    `json:"chain_id" gorm:"not null;index"`               // SLIP-44 Chain ID (from AssetID)
	MetricType string    `json:"metric_type" gorm:"not null;size:30;index"`    // yield, price_change, apy, volume, etc.
	MetricName string    `json:"metric_name" gorm:"not null;size:50"`          // Display name: "收益率", "涨跌幅", "24h 交易量"
	Value      string    `json:"value" gorm:"not null"`                        // Metric value (can be percentage, price, etc.)
	Unit       string    `json:"unit" gorm:"size:10"`                          // Unit: "%", "USD", "ETH"
	RecordedAt time.Time `json:"recorded_at" gorm:"not null;index"`            // When this metric was recorded
	Source     string    `json:"source" gorm:"size:50"`                        // Data source: "manual", "api", "contract", "oracle"
	IsActive   bool      `json:"is_active" gorm:"not null;default:true;index"` // Whether this is the current/active value
	Metadata   string    `json:"metadata" gorm:"type:json"`                    // Additional metadata (JSON)
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ============================================================================
// Chain Configuration (Contract Addresses)
// ============================================================================

// ChainConfig stores contract addresses for each chain
// Note: ZKPayAddress is global (same for all chains) and should be retrieved from global config, not stored per chain
type ChainConfig struct {
	ID                   uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID              uint32    `json:"chain_id" gorm:"uniqueIndex;not null"`           // Chain SLIP-44 ID (e.g., 60 for ETH, 714 for BSC)
	ChainName            string    `json:"chain_name" gorm:"not null;size:50"`             // Ethereum, BSC, Polygon, TRON
	TreasuryAddress      string    `json:"treasury_address" gorm:"not null;size:66"`       // Treasury contract address (chain-specific)
	IntentManagerAddress string    `json:"intent_manager_address" gorm:"not null;size:66"` // IntentManager contract address (chain-specific)
	ZKPayAddress         string    `json:"-" gorm:"size:66"`                               // ZKPay contract address (deprecated: global, not chain-specific)
	RpcEndpoint          string    `json:"rpc_endpoint" gorm:"not null;size:200"`          // RPC endpoint for chain interaction
	ExplorerURL          string    `json:"explorer_url" gorm:"size:200"`                   // Block explorer URL
	SyncEnabled          bool      `json:"sync_enabled" gorm:"not null;default:true"`      // Whether to sync RawToken from this chain
	SyncBlockNumber      uint64    `json:"sync_block_number" gorm:"default:0"`             // Last synced block number
	LastSyncedAt         time.Time `json:"last_synced_at"`                                 // Last sync timestamp
	IsActive             bool      `json:"is_active" gorm:"not null;default:true;index"`   // Active status
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// GlobalConfig stores global system configuration
// This table stores global settings that apply to all chains
type GlobalConfig struct {
	ID          uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ConfigKey   string    `json:"config_key" gorm:"uniqueIndex;not null;size:50"` // e.g., "zkpay_proxy"
	ConfigValue string    `json:"config_value" gorm:"not null;size:200"`          // Configuration value
	Description string    `json:"description" gorm:"size:200"`                    // Description of this config
	UpdatedBy   string    `json:"updated_by" gorm:"size:50"`                      // Who updated this config
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TokenRoutingRule stores routing rules for tokens
// Maps source chain+token -> allowed target chains+tokens
type TokenRoutingRule struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	SourceChainID   uint32    `json:"source_chain_id" gorm:"not null;index"`         // Source chain SLIP-44 ID
	SourceTokenID   string    `json:"source_token_id" gorm:"not null;size:66;index"` // Source token ID (token_address for RawToken, asset_id for AssetToken)
	SourceTokenType string    `json:"source_token_type" gorm:"not null;size:20"`     // 'raw_token' or 'asset_token'
	TargetChainID   uint32    `json:"target_chain_id" gorm:"not null;index"`         // Target chain SLIP-44 ID
	TargetTokenID   string    `json:"target_token_id" gorm:"not null;size:66;index"` // Target token ID (token_address for RawToken, asset_id for AssetToken)
	TargetTokenType string    `json:"target_token_type" gorm:"not null;size:20"`     // 'raw_token' or 'asset_token'
	Priority        int       `json:"priority" gorm:"default:0;index"`               // Priority for sorting (higher = preferred)
	IsActive        bool      `json:"is_active" gorm:"not null;default:true;index"`  // Active status
	Description     string    `json:"description" gorm:"type:text"`                  // Optional description
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName specifies the table name for TokenRoutingRule
func (TokenRoutingRule) TableName() string {
	return "token_routing_rules"
}

// SubgraphSyncState 子图同步状态表 - 记录每条链的子图同步位置
type SubgraphSyncState struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ChainID         int64     `json:"chain_id" gorm:"column:chain_id;uniqueIndex;not null"`                 // SLIP-44 Chain ID
	SubgraphURL     string    `json:"subgraph_url" gorm:"column:subgraph_url;not null"`                     // 子图API URL
	LastSyncedBlock uint64    `json:"last_synced_block" gorm:"column:last_synced_block;not null;default:0"` // 上次同步到的区块号
	UpdatedAt       time.Time `json:"updated_at" gorm:"column:updated_at"`
	CreatedAt       time.Time `json:"created_at" gorm:"column:created_at"`
}

// TableName specifies the table name for SubgraphSyncState
func (SubgraphSyncState) TableName() string {
	return "subgraph_sync_states"
}
