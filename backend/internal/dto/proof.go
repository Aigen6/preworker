package dto

import "go-backend/internal/types"

// ==================== Proof DTOs ====================

// Allocation Type alias, using unified types.AllocationRequest
type Allocation = types.AllocationRequest

// BSCCommitmentRequest corresponds to the request body for /api/proof/buildcommitment
type BSCCommitmentRequest struct {
	Allocations   []Allocation                     `json:"allocations" binding:"required"`
	DepositID     string                           `json:"deposit_id" binding:"required"`
	Signature     types.MultichainSignatureRequest `json:"signature" binding:"required"`
	OwnerAddress  types.UniversalAddressRequest    `json:"owner_address" binding:"required"`
	TokenSymbol   string                           `json:"token_symbol" binding:"required"`
	TokenDecimals uint8                            `json:"token_decimals" binding:"required"`
	Lang          uint8                            `json:"lang" binding:"required"`
}
