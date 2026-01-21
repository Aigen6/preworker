package clients

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"go-backend/internal/config"
	"go-backend/internal/interfaces"
	"go-backend/internal/models"
	"go-backend/internal/types"
	"go-backend/internal/utils"
)

// ZKVMClient ZKVM service client
type ZKVMClient struct {
	BaseURL string
	Client  *http.Client
}

// NewZKVMClient Create a new ZKVM client
func NewZKVMClient(baseURL string) *ZKVMClient {
	// Get timeout settings from configuration file，Use default value if not configured10minutes
	timeout := 600 * time.Second // Default10minutes

	if config.AppConfig != nil && config.AppConfig.ZKVM.Timeout > 0 {
		timeout = time.Duration(config.AppConfig.ZKVM.Timeout) * time.Second
	}

	client := &ZKVMClient{
		BaseURL: baseURL,
		Client: &http.Client{
			Timeout: timeout,
		},
	}

	fmt.Printf("🔧 [ZKVM] Createclient: BaseURL=%s, Timeout=%v\n", baseURL, timeout)
	if config.AppConfig != nil {
		fmt.Printf("🔧 [ZKVM] configuration: ConfigTimeout=%d, BaseURL=%s\n",
			config.AppConfig.ZKVM.Timeout, config.AppConfig.ZKVM.BaseURL)
	} else {
		fmt.Printf("⚠️ [ZKVM] configurationnotLoad，usetimeout\n")
	}

	return client
}

// BuildCommitmentRequest Build commitment request - Based on latest API format
// Updated to use token_key instead of token_id per latest ZKVM service API
type BuildCommitmentRequest struct {
	Allocations  []CommitmentAllocationRequest `json:"allocations"` // Simplified allocation (only seq and amount)
	DepositID    string                        `json:"deposit_id"`
	Signature    MultichainSignatureRequest    `json:"signature"`
	OwnerAddress UniversalAddressRequest       `json:"owner_address"`
	TokenKey     string                        `json:"token_key"`            // Token key (e.g., "USDT", "USDC") - replaces token_id
	ChainName    *string                       `json:"chain_name,omitempty"` // Optional chain name (e.g., "Ethereum", "BSC", "TRON")
	Lang         uint8                         `json:"lang"`
}

// CommitmentAllocationRequest represents a simplified allocation for commitment proofs
// Only contains seq and amount - recipient and token info are at commitment level
type CommitmentAllocationRequest struct {
	Seq    uint8  `json:"seq" binding:"required"`    // Allocation sequence (0-255)
	Amount string `json:"amount" binding:"required"` // Amount in HEX format (32 bytes, 64 hex chars, no 0x prefix)
}

// use types
type AllocationRequest = types.AllocationRequest
type MultichainSignatureRequest = types.MultichainSignatureRequest
type UniversalAddressRequest = types.UniversalAddressRequest

// BuildCommitmentResponse Build commitment response - Based on latest API format
type BuildCommitmentResponse struct {
	RequestID        string  `json:"request_id"`
	Success          bool    `json:"success"`
	ProofData        string  `json:"proof_data"`
	PublicValues     string  `json:"public_values"`
	VKey             *string `json:"vkey"`
	AllocationsCount uint32  `json:"allocations_count"`
	TotalAmount      string  `json:"total_amount"`
	TokenSymbol      string  `json:"token_symbol"`
	OwnerChainID     uint32  `json:"owner_chain_id"`
	Timestamp        string  `json:"timestamp"`
	ErrorMessage     *string `json:"error_message"`
	GenerationTime   *string `json:"generation_time"`
}

// BuildWithdrawRequest Build withdraw request - Based on latest API format (deprecated, use WithdrawProofRequest)
type BuildWithdrawRequest struct {
	Allocation           AllocationRequest `json:"allocation"`
	Credential           CredentialRequest `json:"credential"`
	RootBeforeCommitment string            `json:"root_before_commitment"`
	CommitmentsAfter     []string          `json:"commitments_after"`
}

// CredentialRequest use types
type CredentialRequest = types.CredentialRequest

// WithdrawProofRequest represents the new withdraw proof request format with Intent system
type WithdrawProofRequest struct {
	CommitmentGroups  []types.CommitmentGroupRequest   `json:"commitment_groups" binding:"required"`
	OwnerAddress      types.UniversalAddressRequest    `json:"owner_address" binding:"required"`
	Intent            types.IntentRequest              `json:"intent" binding:"required"`
	Signature         types.MultichainSignatureRequest `json:"signature" binding:"required"`
	SourceTokenSymbol string                           `json:"source_token_symbol" binding:"required"` // Source token symbol (e.g., "USDT", "USDC", "ETH")
	Lang              uint8                            `json:"lang" binding:"required"`
	// 注意：目标代币符号现在从 Intent 中获取：
	//   - RawToken: 使用 intent.token_symbol
	//   - AssetToken: 使用 intent.asset_token_symbol
	SourceChainName *string `json:"source_chain_name,omitempty"` // Optional source chain name (e.g., "Ethereum", "BSC", "TRON")
	TargetChainName *string `json:"target_chain_name,omitempty"` // Optional target chain name (e.g., "Ethereum", "BSC", "TRON")
	MinOutput       *string `json:"min_output,omitempty"`        // Optional minimum output constraint (HEX format, 32 bytes, defaults to 0)
}

// BuildWithdrawResponse Build withdraw response - Based on latest API format
type BuildWithdrawResponse struct {
	RequestID        string   `json:"request_id"`
	Success          bool     `json:"success"`
	ProofData        string   `json:"proof_data"`
	PublicValues     string   `json:"public_values"`
	VKey             *string  `json:"vkey"`
	RecipientChainID uint32   `json:"recipient_chain_id"`
	RecipientAddress string   `json:"recipient_address"`
	Amount           string   `json:"amount"`
	TokenKey         string   `json:"token_key"` // Token key (e.g., "USDT")
	CommitmentRoot   string   `json:"commitment_root"`
	Nullifiers       []string `json:"nullifiers"` // Array of nullifiers
	Timestamp        string   `json:"timestamp"`
	ErrorMessage     *string  `json:"error_message"`
	GenerationTime   *string  `json:"generation_time"`
}

// GetNullifier returns the primary nullifier from the response
func (r *BuildWithdrawResponse) GetNullifier() string {
	if len(r.Nullifiers) > 0 {
		return r.Nullifiers[0]
	}
	return "" // Return empty string if no nullifiers available
}

// GenerateWithdrawProofRequest Generate withdraw proof request
type GenerateWithdrawProofRequest struct {
	CheckID          string `json:"check_id"`
	CheckbookID      string `json:"checkbook_id"`
	Commitment       string `json:"commitment"`
	Nullifier        string `json:"nullifier"`
	RecipientChainID uint32 `json:"recipient_chain_id"`
	RecipientAddress string `json:"recipient_address"`
	Amount           string `json:"amount"`
	TokenID          uint32 `json:"token_id"`
	DepositID        string `json:"deposit_id"`
	CoinType         uint32 `json:"coin_type"`
	TokenSymbol      string `json:"token_symbol"`
	TokenDecimals    uint8  `json:"token_decimals"`
}

// BuildCommitment Build commitment proof
func (c *ZKVMClient) BuildCommitment(req *BuildCommitmentRequest) (*BuildCommitmentResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.Client.Post(c.BaseURL+"/api/proof/commitment", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("❌ [ZKVM] BuildCommitment failed: status=%d", resp.StatusCode)
		log.Printf("   Response body: %s", string(body))
		// Try to parse error response
		var errorResp map[string]interface{}
		if json.Unmarshal(body, &errorResp) == nil {
			if msg, ok := errorResp["message"].(string); ok {
				log.Printf("   Error message: %s", msg)
			}
			if errCode, ok := errorResp["error"].(string); ok {
				log.Printf("   Error code: %s", errCode)
			}
		}
		return nil, fmt.Errorf("ZKVM service returned error (status %d): %s", resp.StatusCode, string(body))
	}

	var result BuildCommitmentResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GenerateWithdrawProof Generate withdraw proof
func (c *ZKVMClient) GenerateWithdrawProof(req *GenerateWithdrawProofRequest) (*BuildWithdrawResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.Client.Post(c.BaseURL+"/api/proof/withdraw", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ZKVM service returned error: %s", string(body))
	}

	var result BuildWithdrawResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// BuildWithdraw Build withdraw proof (deprecated, use GenerateWithdrawProofV2)
func (c *ZKVMClient) BuildWithdraw(req *BuildWithdrawRequest) (*BuildWithdrawResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.Client.Post(c.BaseURL+"/api/proof/withdraw", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ZKVM service returned error: %s", string(body))
	}

	// Add debug log to view raw response
	log.Printf("🔍 [ZKVM] BuildWithdrawresponse: %s", string(body))

	var result BuildWithdrawResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// Add debug log to view parsed data
	log.Printf("🔍 [ZKVM] ParseCommitmentRoot: %s", result.CommitmentRoot)

	return &result, nil
}

// GenerateWithdrawProofV2 generates withdraw proof using the new Intent-based API
func (c *ZKVMClient) GenerateWithdrawProofV2(req *WithdrawProofRequest) (*BuildWithdrawResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	log.Printf("📤 [ZKVM] Sending WithdrawProofRequest to %s/api/proof/withdraw", c.BaseURL)
	if reqData, err := json.MarshalIndent(req, "", "  "); err == nil {
		log.Printf("📋 [ZKVM] Request body:\n%s", string(reqData))
	}

	resp, err := c.Client.Post(c.BaseURL+"/api/proof/withdraw", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ZKVM service returned error (status %d): %s", resp.StatusCode, string(body))
	}

	// Add debug log to view raw response
	log.Printf("🔍 [ZKVM] WithdrawProofResponse: %s", string(body))

	var result BuildWithdrawResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// Add debug log to view parsed data
	log.Printf("🔍 [ZKVM] ParseCommitmentRoot: %s", result.CommitmentRoot)

	return &result, nil
}

// BuildIntentRequestFromWithdrawRequest constructs IntentRequest from WithdrawRequest
// This helper function decodes AssetID to get chain_id, adapter_id, token_id for AssetToken
// intentService is optional - if provided, will fetch asset_token_symbol from IntentAssetToken config
func BuildIntentRequestFromWithdrawRequest(wr *models.WithdrawRequest, intentService interfaces.IntentServiceInterface) (*types.IntentRequest, error) {
	// Convert recipient address to 32-byte Universal Address format
	// ZKVM service expects 32-byte addresses, but database may store 20-byte addresses
	recipientAddress := wr.Recipient.Data

	// Check if address is already in 32-byte format (64 hex chars with or without 0x prefix)
	isUniversalAddr := false
	if strings.HasPrefix(strings.ToLower(recipientAddress), "0x") {
		isUniversalAddr = len(recipientAddress) == 66 // 0x + 64 hex chars = 32 bytes
	} else {
		isUniversalAddr = len(recipientAddress) == 64 // 64 hex chars = 32 bytes
	}

	if !isUniversalAddr {
		// Convert based on chain type
		// SLIP-44 Chain ID 195 = TRON
		if wr.TargetSLIP44ChainID == 195 {
			// TRON address conversion
			universalAddr, err := utils.TronToUniversalAddress(recipientAddress)
			if err != nil {
				return nil, fmt.Errorf("failed to convert TRON recipient address to Universal Address: %w", err)
			}
			recipientAddress = universalAddr
		} else {
			// EVM address conversion (most common case)
			universalAddr, err := utils.EvmToUniversalAddress(recipientAddress)
			if err != nil {
				return nil, fmt.Errorf("failed to convert EVM recipient address to Universal Address: %w", err)
			}
			recipientAddress = universalAddr
		}
	}

	// Build beneficiary UniversalAddress
	beneficiary := &types.UniversalAddressRequest{
		ChainID: wr.TargetSLIP44ChainID,
		Address: recipientAddress, // Now guaranteed to be 32-byte format
	}

	if wr.IntentType == models.IntentTypeRawToken {
		// RawToken - token_contract removed from Intent definition
		// Get token_symbol from database or config
		// TODO: 从 Token 配置中获取 token_symbol，基于 token_identifier 地址（如果还存储的话）
		tokenSymbol := "USDT" // Default fallback, should be fetched from token config
		// Note: TokenIdentifier field may still exist in database for backward compatibility,
		// but it's no longer part of the Intent structure
		log.Printf("📋 [ZKVM] Using token_symbol for RawToken: %s", tokenSymbol)

		return &types.IntentRequest{
			Type:        "RawToken",
			Beneficiary: beneficiary,
			TokenSymbol: &tokenSymbol,
		}, nil
	} else if wr.IntentType == models.IntentTypeAssetToken {
		// AssetToken: decode AssetID to get three fields
		if wr.AssetID == "" {
			return nil, fmt.Errorf("asset_id is required for AssetToken")
		}

		chainID, adapterID, tokenID, err := utils.DecodeAssetID(wr.AssetID)
		if err != nil {
			return nil, fmt.Errorf("failed to decode asset_id: %w", err)
		}

		// Get asset_token_symbol from IntentAssetToken config
		// asset_token_symbol is the Symbol field from IntentAssetToken table (e.g., "aUSDT", "stETH")
		// It's used for ZKVM signature display and on-chain verification
		assetTokenSymbol := "aUSDT" // Default fallback if config not available
		if intentService != nil {
			token, err := intentService.GetAssetToken(wr.AssetID)
			if err == nil && token != nil {
				assetTokenSymbol = token.Symbol
				log.Printf("📋 [ZKVM] Found asset_token_symbol from config: %s (asset_id: %s)", assetTokenSymbol, wr.AssetID)
			} else {
				log.Printf("⚠️ [ZKVM] Failed to get asset_token_symbol from config (asset_id: %s), using default: %s", wr.AssetID, assetTokenSymbol)
			}
		}

		return &types.IntentRequest{
			Type:             "AssetToken",
			ChainID:          &chainID,
			AdapterID:        &adapterID,
			TokenID:          &tokenID,
			Beneficiary:      beneficiary,
			AssetTokenSymbol: &assetTokenSymbol,
			// preferred_chain removed - no longer part of Intent
		}, nil
	}

	return nil, fmt.Errorf("unsupported intent type: %d", wr.IntentType)
}
