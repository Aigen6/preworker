package dto

import "time"

// ==================== BlockScanner DTOs ====================

// DepositEventRequest deposit event sent by blockscanner
type DepositEventRequest struct {
	ChainID         int64  `json:"chain_id" binding:"required"`
	ContractAddress string `json:"contract_address" binding:"required"`
	TransactionHash string `json:"transaction_hash" binding:"required"`
	BlockNumber     int64  `json:"block_number" binding:"required"`
	LogIndex        int    `json:"log_index" binding:"required"`
	Depositor       string `json:"depositor" binding:"required"`
	TokenAddress    string `json:"token_address" binding:"required"`
	Amount          string `json:"amount" binding:"required"`
	LocalDepositID  int64  `json:"local_deposit_id" binding:"required"`
	PromoteCode     string `json:"promote_code"`
	BlockTimestamp  int64  `json:"block_timestamp" binding:"required"`
}

// WithdrawEventRequest withdraw event sent by blockscanner
type WithdrawEventRequest struct {
	ChainID         int64  `json:"chain_id" binding:"required"`
	ContractAddress string `json:"contract_address" binding:"required"`
	TransactionHash string `json:"transaction_hash" binding:"required"`
	BlockNumber     int64  `json:"block_number" binding:"required"`
	LogIndex        int    `json:"log_index" binding:"required"`
	Recipient       string `json:"recipient" binding:"required"`
	TokenAddress    string `json:"token_address" binding:"required"`
	Amount          string `json:"amount" binding:"required"`
	NullifierHash   string `json:"nullifier_hash" binding:"required"`
	BlockTimestamp  int64  `json:"block_timestamp" binding:"required"`
}

// BlockscannerHealthResponse blockscanner health check response
type BlockscannerHealthResponse struct {
	Status    string    `json:"status"`
	Service   string    `json:"service"`
	Timestamp time.Time `json:"timestamp"`
	Database  struct {
		Connected bool   `json:"connected"`
		Provider  string `json:"provider"`
	} `json:"database"`
	Scanner struct {
		ActiveChains int `json:"active_chains"`
		LastScan     struct {
			Timestamp time.Time `json:"timestamp"`
			ChainID   int64     `json:"chain_id"`
		} `json:"last_scan"`
	} `json:"scanner"`
}
