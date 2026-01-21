// Package types provides common type definitions used across the backend
package types

// MultichainSignatureRequest represents a signature from a specific blockchain
type MultichainSignatureRequest struct {
	ChainID       uint32  `json:"chain_id" binding:"required"`
	SignatureData string  `json:"signature_data" binding:"required"`
	PublicKey     *string `json:"public_key,omitempty"`
}

// UniversalAddressRequest represents an address on a specific blockchain
type UniversalAddressRequest struct {
	ChainID uint32 `json:"chain_id" binding:"required"`
	Address string `json:"address" binding:"required"`
}

// AllocationRequest represents a fund allocation for commitment proofs
// For ZKVM commitment API, allocations only contain seq and amount.
// Recipient and token info are provided at the commitment level, not allocation level.
type AllocationRequest struct {
	Seq    uint8  `json:"seq" binding:"required"`    // 分配序号 (0-255)，用于 ZKVM Service
	Amount string `json:"amount" binding:"required"`  // Amount in HEX format (32 bytes, 64 hex chars, no 0x prefix)
}

// CredentialRequest represents withdrawal credential information
type CredentialRequest struct {
	LeftHashes  []string `json:"left_hashes" binding:"required"`
	RightHashes []string `json:"right_hashes" binding:"required"`
	DepositID   string   `json:"deposit_id" binding:"required"`
	ChainID     uint32   `json:"chain_id" binding:"required"`
	TokenKey    string   `json:"token_key" binding:"required"` // Token key (e.g., "USDT", "USDC") - replaces token_id
}

// AllocationWithCredentialRequest represents an allocation with its credential
type AllocationWithCredentialRequest struct {
	Allocation AllocationRequest `json:"allocation" binding:"required"`
	Credential CredentialRequest `json:"credential" binding:"required"`
}

// CommitmentGroupRequest represents a group of allocations from the same commitment
type CommitmentGroupRequest struct {
	Allocations          []AllocationWithCredentialRequest `json:"allocations" binding:"required"`
	RootBeforeCommitment string                            `json:"root_before_commitment" binding:"required"`
	CommitmentsAfter     []string                          `json:"commitments_after" binding:"required"`
}

// IntentRequest represents the withdrawal intent (RawToken or AssetToken)
// Updated to match new Intent definition:
// - RawToken: { beneficiary, token_symbol } - removed token_contract
// - AssetToken: { asset_id, beneficiary, asset_token_symbol } - removed preferred_chain
type IntentRequest struct {
	Type string `json:"type" binding:"required"` // "RawToken" or "AssetToken"
	
	// Common fields (used by both RawToken and AssetToken)
	Beneficiary *UniversalAddressRequest `json:"beneficiary,omitempty"` // Beneficiary address (includes chain_id and address)
	
	// RawToken fields
	TokenSymbol *string `json:"token_symbol,omitempty"` // Token symbol (用于签名显示和链上验证，如 "USDT", "USDC", "ETH")
	
	// AssetToken fields
	ChainID          *uint32 `json:"chain_id,omitempty"`          // Source chain ID (SLIP-44)
	AdapterID        *uint32 `json:"adapter_id,omitempty"`       // Adapter ID
	TokenID          *uint16 `json:"token_id,omitempty"`          // Token ID
	AssetTokenSymbol *string `json:"asset_token_symbol,omitempty"` // Asset Token symbol (e.g., "aUSDT")
}

