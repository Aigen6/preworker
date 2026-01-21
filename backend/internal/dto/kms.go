package dto

// ==================== KMS DTOs ====================

// StorePrivateKeyRequest Store private key request
type StorePrivateKeyRequest struct {
	NetworkName string `json:"network_name" binding:"required"`
	ChainID     int    `json:"chain_id" binding:"required"`
	KeyAlias    string `json:"key_alias" binding:"required"`
	PrivateKey  string `json:"private_key" binding:"required"`
}

// StorePrivateKeyResponse Store private key response
type StorePrivateKeyResponse struct {
	Success       bool   `json:"success"`
	ID            string `json:"id,omitempty"`
	PublicAddress string `json:"public_address,omitempty"`
	Message       string `json:"message,omitempty"`
	Error         string `json:"error,omitempty"`
}
