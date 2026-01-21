package dto

import "github.com/golang-jwt/jwt/v5"

// ==================== Auth DTOs ====================

// AuthRequest Authentication request structure
type AuthRequest struct {
	UserAddress string `json:"user_address" binding:"required"` // user wallet address
	Message     string `json:"message" binding:"required"`      // message to be signed
	Signature   string `json:"signature" binding:"required"`    // wallet signature
	ChainID     int    `json:"chain_id" binding:"required"`     // SLIP-44 chain ID (e.g., 714 for BSC, 60 for Ethereum, 195 for TRON)
	// Note: Backend converts EVM chain ID to SLIP-44 if needed
}

// AuthResponse Authentication response structure
type AuthResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token,omitempty"`
	Message string `json:"message"`
}

// JWTClaims JWT Claims structure
type JWTClaims struct {
	UserAddress      string `json:"user_address"`      // wallet address
	UniversalAddress string `json:"universal_address"` // Universal Address format: slip44_chain_id:data
	ChainID          int    `json:"chain_id"`          // SLIP-44 chain ID (e.g., 714 for BSC, 60 for Ethereum, 195 for TRON)
	jwt.RegisteredClaims
}
