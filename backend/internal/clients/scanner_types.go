package clients

import (
	"encoding/json"
	"time"
)

// ===== Scanner notification format =====

// ConfigurableEventNotification ConfigurableEventProcessor standard format
type ConfigurableEventNotification struct {
	Chain           string                 `json:"chain"`           // chain name
	Contract        string                 `json:"contract"`        // contract name
	Event           string                 `json:"event"`           // event name
	BlockNumber     uint64                 `json:"blockNumber"`     // block number
	TransactionHash string                 `json:"transactionHash"` // transaction hash
	LogIndex        uint                   `json:"logIndex"`        // log index
	Timestamp       string                 `json:"timestamp"`       // timestamp
	Data            map[string]interface{} `json:"data"`            // event data
	Services        []string               `json:"services"`        // notification service list
}

// ScannerEventNotification Scanner direct event format（parseGenericEvent return map）
type ScannerEventNotification struct {
	EventName    string                 `json:"eventName"`
	ContractAddr string                 `json:"contractAddr"`
	BlockNumber  uint64                 `json:"blockNumber"`
	TxHash       string                 `json:"txHash"`
	EventSig     string                 `json:"eventSig"`
	LogIndex     uint                   `json:"logIndex"`
	EventData    map[string]interface{} `json:"eventData"`
}

// ===== Event type definitions (BlockScanner API responses) =====

// EventDepositReceivedResponse BlockScanner API response structure (corresponding to Treasury.DepositReceived)
// Note：different from models.EventDepositReceived (database model) different，this is nested structure of API response
type EventDepositReceivedResponse struct {
	ChainID         int64     `json:"chainId"`         // added by BlockScannerchain ID
	ContractAddress string    `json:"contractAddress"` // added by BlockScannercontract address
	ContractName    string    `json:"contractName"`    // added by BlockScannercontract name
	EventName       string    `json:"eventName"`       // added by BlockScannerevent name
	BlockNumber     uint64    `json:"blockNumber"`     // added by BlockScannerblock number
	TransactionHash string    `json:"transactionHash"` // added by BlockScannertransaction hash
	LogIndex        uint      `json:"logIndex"`        // added by BlockScannerlog index
	BlockTimestamp  time.Time `json:"blockTimestamp"`  // added by BlockScannerblock timestamp
	EventData       struct {
		Depositor      string `json:"depositor"`      // address indexed depositor
		Token          string `json:"token"`          // address indexed token
		Amount         string `json:"amount"`         // uint256 amount
		LocalDepositId uint64 `json:"localDepositId"` // uint64 indexed localDepositId
		ChainId        uint32 `json:"chainId"`        // uint32 chainId
		PromoteCode    string `json:"promoteCode"`    // bytes6 promoteCode
	} `json:"eventData"` // actual contract event data
}

// EventDepositRecordedResponse BlockScanner API response structure (corresponding to ZKPayProxy.DepositRecorded)
// Note：different from models.EventDepositRecorded (database model) different，this is nested structure of API response
type EventDepositRecordedResponse struct {
	ChainID         int64     `json:"chainId"`         // added by BlockScannerchain ID
	ContractAddress string    `json:"contractAddress"` // added by BlockScannercontract address
	ContractName    string    `json:"contractName"`    // added by BlockScannercontract name
	EventName       string    `json:"eventName"`       // added by BlockScannerevent name
	BlockNumber     uint64    `json:"blockNumber"`     // added by BlockScannerblock number
	TransactionHash string    `json:"transactionHash"` // added by BlockScannertransaction hash
	LogIndex        uint      `json:"logIndex"`        // added by BlockScannerlog index
	BlockTimestamp  time.Time `json:"blockTimestamp"`  // added by BlockScannerblock timestamp
	EventData       struct {
		LocalDepositId uint64 `json:"localDepositId"` // uint64 indexed localDepositId
		TokenKey       string `json:"tokenKey"`       // string indexed tokenKey (from DepositRecorded event)
		TokenId        uint16 `json:"tokenId"`        // uint16 tokenId
		Owner          struct {
			ChainId uint16 `json:"chainId"` // uint16 chainId from UniversalAddress
			Data    string `json:"data"`    // bytes32 data from UniversalAddress
		} `json:"owner"` // Common.UniversalAddress owner
		GrossAmount       string `json:"grossAmount"`       // uint256 grossAmount
		FeeTotalLocked    string `json:"feeTotalLocked"`    // uint256 feeTotalLocked
		AllocatableAmount string `json:"allocatableAmount"` // uint256 allocatableAmount
		PromoteCode       string `json:"promoteCode"`       // bytes6 promoteCode
		AddressRank       uint8  `json:"addressRank"`       // uint8 addressRank
		DepositTxHash     string `json:"depositTxHash"`     // bytes32 depositTxHash
		BlockNumber       uint64 `json:"blockNumber"`       // uint64 blockNumber
		Timestamp         uint64 `json:"timestamp"`         // uint256 timestamp
	} `json:"eventData"` // actual contract event data
}

// EventDepositUsedResponse deposit use event structure (corresponding to ZKPayProxy.DepositUsed)
type EventDepositUsedResponse struct {
	ChainID         int64     `json:"chainId"`         // added by BlockScannerchain ID
	ContractAddress string    `json:"contractAddress"` // added by BlockScannercontract address
	ContractName    string    `json:"contractName"`    // added by BlockScannercontract name
	EventName       string    `json:"eventName"`       // added by BlockScannerevent name
	BlockNumber     uint64    `json:"blockNumber"`     // added by BlockScannerblock number
	TransactionHash string    `json:"transactionHash"` // added by BlockScannertransaction hash
	LogIndex        uint      `json:"logIndex"`        // added by BlockScannerlog index
	BlockTimestamp  time.Time `json:"blockTimestamp"`  // added by BlockScannerblock timestamp
	EventData       struct {
		ChainId        uint32 `json:"chainId"`        // uint32 indexed chainId
		LocalDepositId uint64 `json:"localDepositId"` // uint64 indexed localDepositId
		Commitment     string `json:"commitment"`     // bytes32 indexed commitment
		PromoteCode    string `json:"promoteCode"`    // bytes6 promoteCode
	} `json:"eventData"` // actual contract event data
}

// EventWithdrawRequestedResponse withdraw request event structure (corresponding to ZKPayProxy.WithdrawRequested)
type EventWithdrawRequestedResponse struct {
	ChainID         int64     `json:"chainId"`         // added by BlockScannerchain ID
	ContractAddress string    `json:"contractAddress"` // added by BlockScannercontract address
	ContractName    string    `json:"contractName"`    // added by BlockScannercontract name
	EventName       string    `json:"eventName"`       // added by BlockScannerevent name
	BlockNumber     uint64    `json:"blockNumber"`     // added by BlockScannerblock number
	TransactionHash string    `json:"transactionHash"` // added by BlockScannertransaction hash
	LogIndex        uint      `json:"logIndex"`        // added by BlockScannerlog index
	BlockTimestamp  time.Time `json:"blockTimestamp"`  // added by BlockScannerblock timestamp
	EventData       struct {
		RequestId string `json:"requestId"` // bytes32 indexed requestId
		Recipient string `json:"recipient"` // Common.UniversalAddress indexed recipient (hash value， indexed tuple hashed with keccak256)
		TokenId   uint16 `json:"tokenId"`   // uint16 tokenId
		Amount    string `json:"amount"`    // uint256 amount
	} `json:"eventData"` // actual contract event data
}

// UnmarshalJSON custom unmarshaler to support both "txHash" and "transactionHash" field names
func (e *EventWithdrawRequestedResponse) UnmarshalJSON(data []byte) error {
	// Define a temporary struct with both field names
	type Alias EventWithdrawRequestedResponse
	aux := &struct {
		TxHash          string `json:"txHash"`          // Support "txHash" field name
		TransactionHash string `json:"transactionHash"` // Support "transactionHash" field name
		*Alias
	}{
		Alias: (*Alias)(e),
	}
	
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	
	// Use txHash if transactionHash is empty (prioritize txHash for compatibility)
	if aux.TxHash != "" {
		e.TransactionHash = aux.TxHash
	} else if aux.TransactionHash != "" {
		e.TransactionHash = aux.TransactionHash
	}
	
	return nil
}

// EventWithdrawExecutedResponse withdraw execution event structure (corresponding to Treasury.WithdrawExecuted)
type EventWithdrawExecutedResponse struct {
	ChainID         int64     `json:"chainId"`         // added by BlockScannerchain ID
	ContractAddress string    `json:"contractAddress"` // added by BlockScannercontract address
	ContractName    string    `json:"contractName"`    // added by BlockScannercontract name
	EventName       string    `json:"eventName"`       // added by BlockScannerevent name
	BlockNumber     uint64    `json:"blockNumber"`     // added by BlockScannerblock number
	TransactionHash string    `json:"transactionHash"` // added by BlockScannertransaction hash
	LogIndex        uint      `json:"logIndex"`        // added by BlockScannerlog index
	BlockTimestamp  time.Time `json:"blockTimestamp"`  // added by BlockScannerblock timestamp
	EventData       struct {
		Recipient string `json:"recipient"` // address indexed recipient
		Token     string `json:"token"`     // address indexed token
		Amount    string `json:"amount"`    // uint256 amount
		RequestId string `json:"requestId"` // bytes32 indexed requestId
	} `json:"eventData"` // actual contract event data
}

// UnmarshalJSON custom unmarshaler to support both "txHash" and "transactionHash" field names
func (e *EventWithdrawExecutedResponse) UnmarshalJSON(data []byte) error {
	// Define a temporary struct with both field names
	type Alias EventWithdrawExecutedResponse
	aux := &struct {
		TxHash          string `json:"txHash"`          // Support "txHash" field name
		TransactionHash string `json:"transactionHash"` // Support "transactionHash" field name
		*Alias
	}{
		Alias: (*Alias)(e),
	}
	
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	
	// Use txHash if transactionHash is empty (prioritize txHash for compatibility)
	if aux.TxHash != "" {
		e.TransactionHash = aux.TxHash
	} else if aux.TransactionHash != "" {
		e.TransactionHash = aux.TransactionHash
	}
	
	return nil
}

// EventCommitmentRootUpdatedResponse corresponding to CommitmentRootUpdated
type EventCommitmentRootUpdatedResponse struct {
	ChainID         int64     `json:"chainId"`         // added by BlockScannerchain ID
	ContractAddress string    `json:"contractAddress"` // added by BlockScannercontract address
	ContractName    string    `json:"contractName"`    // added by BlockScannercontract name
	EventName       string    `json:"eventName"`       // added by BlockScannerevent name
	BlockNumber     uint64    `json:"blockNumber"`     // added by BlockScannerblock number
	TransactionHash string    `json:"transactionHash"` // added by BlockScannertransaction hash
	LogIndex        uint      `json:"logIndex"`        // added by BlockScannerlog index
	BlockTimestamp  time.Time `json:"blockTimestamp"`  // added by BlockScannerblock timestamp
	EventData       struct {
		OldRoot    string `json:"oldRoot"`    // bytes32 indexed oldRoot
		Commitment string `json:"commitment"` // bytes32 indexed commitment
		NewRoot    string `json:"newRoot"`    // bytes32 indexed newRoot
	} `json:"eventData"` // actual contract event data
}

// EventIntentManagerWithdrawExecutedResponse IntentManager.WithdrawExecuted event structure
// This event is emitted when IntentManager.executeWithdraw completes successfully
// Note: This event indicates that payout (Stage 3) has completed
type EventIntentManagerWithdrawExecutedResponse struct {
	ChainID         int64     `json:"chainId"`         // added by BlockScannerchain ID
	ContractAddress string    `json:"contractAddress"` // added by BlockScannercontract address
	ContractName    string    `json:"contractName"`    // added by BlockScannercontract name
	EventName       string    `json:"eventName"`       // added by BlockScannerevent name
	BlockNumber     uint64    `json:"blockNumber"`     // added by BlockScannerblock number
	TransactionHash string    `json:"transactionHash"` // added by BlockScannertransaction hash
	LogIndex        uint      `json:"logIndex"`       // added by BlockScannerlog index
	BlockTimestamp  time.Time `json:"blockTimestamp"`  // added by BlockScannerblock timestamp
	EventData       struct {
		WorkerType uint8  `json:"workerType"` // uint8 indexed workerType (0=DirectTransfer, 1=UniswapSwap, 2=DeBridgeCrossChain)
		Success    bool   `json:"success"`    // bool success
		Message    string `json:"message"`    // string message
	} `json:"eventData"` // actual contract event data
}

// EventPayoutExecutedResponse Treasury.PayoutExecuted event structure
// This event is emitted when Treasury.payout completes successfully
type EventPayoutExecutedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RequestId     string `json:"requestId"`     // bytes32 indexed requestId
		Beneficiary   string `json:"beneficiary"`   // address indexed beneficiary
		Token         string `json:"token"`          // address token
		Amount        string `json:"amount"`        // uint256 amount
		WorkerType    uint8  `json:"workerType"`    // uint8 workerType
		ActualOutput  string `json:"actualOutput"`  // uint256 actualOutput
	} `json:"eventData"`
}

// EventPayoutFailedResponse Treasury.PayoutFailed event structure
// This event is emitted when Treasury.payout fails
type EventPayoutFailedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RequestId    string `json:"requestId"`    // bytes32 indexed requestId
		Beneficiary  string `json:"beneficiary"`  // address indexed beneficiary
		WorkerType   uint8  `json:"workerType"`   // uint8 workerType
		ErrorReason  string `json:"errorReason"`  // string errorReason
	} `json:"eventData"`
}

// EventHookExecutedResponse IntentManager.HookExecuted event structure
// This event is emitted when Hook execution succeeds
type EventHookExecutedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RequestId   string `json:"requestId"`   // bytes32 indexed requestId
		Beneficiary string `json:"beneficiary"` // address indexed beneficiary
		Token       string `json:"token"`       // address token
		Amount      string `json:"amount"`      // uint256 amount
	} `json:"eventData"`
}

// EventHookFailedResponse IntentManager.HookFailed event structure
// This event is emitted when Hook execution fails
type EventHookFailedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RequestId   string `json:"requestId"`   // bytes32 indexed requestId
		Beneficiary string `json:"beneficiary"` // address indexed beneficiary
		Token       string `json:"token"`       // address token
		Amount      string `json:"amount"`      // uint256 amount
		ErrorData   string `json:"errorData"`   // bytes errorData
	} `json:"eventData"`
}

// EventFallbackTransferredResponse IntentManager.FallbackTransferred event structure
// This event is emitted when Fallback transfer succeeds
type EventFallbackTransferredResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RequestId   string `json:"requestId"`   // bytes32 indexed requestId
		Beneficiary string `json:"beneficiary"` // address indexed beneficiary
		Token       string `json:"token"`       // address token
		Amount      string `json:"amount"`      // uint256 amount
	} `json:"eventData"`
}

// EventFallbackFailedResponse IntentManager.FallbackFailed event structure
// This event is emitted when Fallback transfer fails
type EventFallbackFailedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RequestId   string `json:"requestId"`   // bytes32 indexed requestId
		Beneficiary string `json:"beneficiary"` // address indexed beneficiary
		Token       string `json:"token"`       // address token
		Amount      string `json:"amount"`      // uint256 amount
		ErrorReason string `json:"errorReason"` // string errorReason
	} `json:"eventData"`
}

// EventPayoutRetryRecordCreatedResponse Treasury.PayoutRetryRecordCreated event structure
type EventPayoutRetryRecordCreatedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RecordId    string `json:"recordId"`    // bytes32 indexed recordId
		RequestId   string `json:"requestId"`   // bytes32 indexed requestId
		ErrorReason string `json:"errorReason"` // string errorReason
	} `json:"eventData"`
}

// EventFallbackRetryRecordCreatedResponse Treasury.FallbackRetryRecordCreated event structure
type EventFallbackRetryRecordCreatedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RecordId    string `json:"recordId"`    // bytes32 indexed recordId
		RequestId   string `json:"requestId"`   // bytes32 indexed requestId
		ErrorReason string `json:"errorReason"` // string errorReason
	} `json:"eventData"`
}

// EventManuallyResolvedResponse ZKPay.ManuallyResolved event structure
// This event is emitted when a withdraw request is manually resolved by admin
type EventManuallyResolvedResponse struct {
	ChainID         int64     `json:"chainId"`
	ContractAddress string    `json:"contractAddress"`
	ContractName    string    `json:"contractName"`
	EventName       string    `json:"eventName"`
	BlockNumber     uint64    `json:"blockNumber"`
	TransactionHash string    `json:"transactionHash"`
	LogIndex        uint      `json:"logIndex"`
	BlockTimestamp  time.Time `json:"blockTimestamp"`
	EventData       struct {
		RequestId string `json:"requestId"` // bytes32 indexed requestId
		Resolver  string `json:"resolver"`  // address indexed resolver (admin/multisig)
		Note      string `json:"note"`      // string note (optional resolution note)
	} `json:"eventData"`
}

// ===== / =====

// CommitmentResponse BlockScanner API Response - Commitment
type CommitmentResponse struct {
	ChainID         int    `json:"chainId"`
	QueueIndex      int64  `json:"queueIndex"`
	Commitment      string `json:"commitment"`
	DepositID       int64  `json:"depositId"` // match BlockScanner API
	Submitter       string `json:"submitter"`
	QueueRoot       string `json:"newQueueRoot"` // match API
	OldQueueRoot    string `json:"oldQueueRoot"` // match API
	BlockNumber     int64  `json:"blockNumber"`
	TransactionHash string `json:"txHash"` // match API
	CreatedAt       string `json:"createdAt"`
}

// Withdrawal withdraw  ( for compatibility)
type Withdrawal struct {
	ChainID         int    `json:"chain_id"`
	NullifierHash   string `json:"nullifier_hash"`
	Recipient       string `json:"recipient"`
	Relayer         string `json:"relayer"`
	Amount          string `json:"amount"`
	Token           string `json:"token"`
	BlockNumber     int64  `json:"block_number"`
	TransactionHash string `json:"transaction_hash"`
	CreatedAt       string `json:"created_at"`
}

// =====  =====

// DepositsByAddressRequest  deposit
type DepositsByAddressRequest struct {
	Address string `json:"address"`
	Page    int    `json:"page"`
	Limit   int    `json:"limit"`
}

// DepositsByAddressResponse  deposit
type DepositsByAddressResponse struct {
	DepositReceived []EventDepositReceivedResponse `json:"depositReceived"`
	DepositRecorded []EventDepositRecordedResponse `json:"depositRecorded"`
	Pagination      Pagination                     `json:"pagination"`
}

// CommitmentsByAddressRequest  commitment
type CommitmentsByAddressRequest struct {
	Address string `json:"address"`
	Page    int    `json:"page"`
	Limit   int    `json:"limit"`
}

// CommitmentsByAddressResponse  commitment
type CommitmentsByAddressResponse struct {
	Commitments []CommitmentResponse `json:"commitments"`
	Pagination  Pagination           `json:"pagination"`
}

// Pagination
type Pagination struct {
	Page       int  `json:"page"`
	Limit      int  `json:"limit"`
	Total      int  `json:"total"`
	TotalPages int  `json:"totalPages"`
	HasMore    bool `json:"hasMore"`
}

// =====  =====

// DepositResponse  deposit
type DepositResponse struct {
	DepositReceived *EventDepositReceivedResponse `json:"depositReceived,omitempty"`
	DepositRecorded *EventDepositRecordedResponse `json:"depositRecorded,omitempty"`
	Exists          bool                          `json:"exists"`
}

// CommitmentExistsResponse commitment exists
type CommitmentExistsResponse struct {
	Exists     bool                `json:"exists"`
	Commitment *CommitmentResponse `json:"commitment,omitempty"`
}

// NullifierUsedResponse nullifier useStatus response
type NullifierUsedResponse struct {
	Exists      bool        `json:"exists"`
	UsedAt      string      `json:"usedAt,omitempty"`
	TxHash      string      `json:"txHash,omitempty"`
	BlockNumber int64       `json:"blockNumber,omitempty"`
	Withdrawal  *Withdrawal `json:"withdrawal,omitempty"`
}

// CommitmentRootResponse commitment root
type CommitmentRootResponse struct {
	Root   string `json:"root"`
	Exists bool   `json:"exists"`
}

// CommitmentsFromCommitmentResponse  commitment started commitment
type CommitmentsFromCommitmentResponse struct {
	Commitments []string `json:"commitments"`
	Total       int      `json:"total"`
}

// =====  =====

// EventQueryParams
type EventQueryParams struct {
	ChainID      int64  `json:"chainId"`
	Address      string `json:"address,omitempty"`
	ContractAddr string `json:"contractAddr,omitempty"`
	TxHash       string `json:"txHash,omitempty"`
	EventType    string `json:"eventType,omitempty"`
	FromBlock    string `json:"fromBlock,omitempty"`
	ToBlock      string `json:"toBlock,omitempty"`

	// （support）
	Depositor      string `json:"depositor,omitempty"`
	Recipient      string `json:"recipient,omitempty"`
	Token          string `json:"token,omitempty"`
	Amount         string `json:"amount,omitempty"`
	LocalDepositID string `json:"localDepositId,omitempty"`
	PromoteCode    string `json:"promoteCode,omitempty"`
	Commitment     string `json:"commitment,omitempty"`
	NullifierHash  string `json:"nullifierHash,omitempty"`
	Submitter      string `json:"submitter,omitempty"`

	Page  int `json:"page,omitempty"`
	Limit int `json:"limit,omitempty"`
}

// EventSearchResponse
type EventSearchResponse struct {
	Success    bool                     `json:"success"`
	Events     []map[string]interface{} `json:"events"`
	TotalCount int64                    `json:"totalCount"`
	Page       int                      `json:"page"`
	Limit      int                      `json:"limit"`
	Message    string                   `json:"message,omitempty"`
}
