package dto

// ==================== Blockchain DTOs ====================

// CommitmentSubmittedRequest Commitment submission request
type CommitmentSubmittedRequest struct {
	CheckbookID string `json:"checkbook_id" binding:"required"`
	Commitment  string `json:"commitment" binding:"required"`
	TxHash      string `json:"tx_hash" binding:"required"`
	ChainID     int    `json:"chain_id"`
}

// SubmitWithdrawRequest Submit withdraw request
type SubmitWithdrawRequest struct {
	CheckID       string `json:"check_id" binding:"required"`
	NullifierHash string `json:"nullifier_hash" binding:"required"`
	TxHash        string `json:"tx_hash" binding:"required"`
	ChainID       int    `json:"chain_id"`
}

// RelayWithdrawRequest Relay withdraw request
type RelayWithdrawRequest struct {
	DepositID int `json:"deposit_id" binding:"required"`
	ChainID   int `json:"chain_id"`
}

// SP1PublicValues SP1 proof public values structure
type SP1PublicValues struct {
	Recipient     string `json:"recipient"`      // recipient address (20 bytes)
	Amount        string `json:"amount"`         // withdrawal amount (32 bytes)
	QueueRoot     string `json:"queue_root"`     // queue root (32 bytes)
	NullifierHash string `json:"nullifier_hash"` // nullifier hash (32 bytes)
}
