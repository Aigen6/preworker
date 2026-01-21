// Package types provides common type definitions used across the backend
package types

import (
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// mustNewType creates a new ABI type, panicking on error (for use in package-level constants)
func mustNewType(t string) abi.Type {
	typ, err := abi.NewType(t, "", nil)
	if err != nil {
		panic(fmt.Sprintf("failed to create ABI type %s: %v", t, err))
	}
	return typ
}

// CommitmentPublicValues represents the public values from a commitment proof
// Format (Solidity ABI encode):
// - bytes32 commitment     - commitment hash
// - address owner          - owner address
// - uint256 totalAmount    - total amount
// - bytes32 depositId      - deposit ID
// - uint32 coinType        - SLIP-44 coin type
// - string tokenKey        - token key (e.g., "USDT"), same as tokenSymbol
type CommitmentPublicValues struct {
	Commitment    string `json:"commitment"`     // bytes32 - commitment hash
	Owner         string `json:"owner"`          // address - owner address
	TotalAmount   string `json:"total_amount"`   // uint256 - total amount
	DepositID     string `json:"deposit_id"`     // bytes32 - deposit ID
	CoinType      uint32 `json:"coin_type"`      // uint32 - SLIP-44 coin type
	TokenKey      string `json:"token_key"`      // string - token key (e.g., "USDT"), same as tokenSymbol
	TokenSymbol   string `json:"token_symbol"`   // string - token symbol (e.g., "USDT")
	TokenDecimals uint8  `json:"token_decimals"` // uint8 - token decimals
}

// WithdrawPublicValues represents the public values from a withdraw proof
// Struct definition (from zkvm/programs/zkpay_withdraw/src/main.rs):
//
//	struct WithdrawPublicValues {
//	    bytes32 commitmentRoot;
//	    bytes32[] nullifiers;
//	    uint256 amount;
//	    uint8 intentType;
//	    uint32 slip44chainID;
//	    uint32 adapterId;
//	    string tokenKey;
//	    bytes32 beneficiaryData;
//	    bytes32 minOutput;
//	    uint32 sourceChainId;
//	    string sourceTokenKey;
//	}
type WithdrawPublicValues struct {
	CommitmentRoot  string   `json:"commitment_root"`  // bytes32 - commitment tree root
	Nullifiers      []string `json:"nullifiers"`       // bytes32[] - array of nullifier hashes
	Amount          string   `json:"amount"`           // uint256 - aggregated total amount
	IntentType      uint8    `json:"intent_type"`      // uint8 - 0=RawToken, 1=AssetToken
	Slip44ChainID   uint32   `json:"slip44_chain_id"`  // uint32 - target chain ID (SLIP-44)
	AdapterID       uint32   `json:"adapter_id"`       // uint32 - adapter ID (only for AssetToken)
	TokenKey        string   `json:"token_key"`        // string - token key (only for AssetToken)
	BeneficiaryData string   `json:"beneficiary_data"` // bytes32 - beneficiary address
	MinOutput       string   `json:"min_output"`       // bytes32 - minimum output constraint
	SourceChainID   uint32   `json:"source_chain_id"`  // uint32 - source chain ID (SLIP-44)
	SourceTokenKey  string   `json:"source_token_key"` // string - source token key
}

// ParseCommitmentPublicValues parses commitment proof public values from hex string
// Format: ABI-encoded tuple (using Alloy's abi_encode, which follows Solidity ABI encoding)
// Struct definition (from zkvm/programs/zkpay_commitment/src/main.rs):
//
//	struct CommitmentPublicValues {
//	    bytes32 commitment;
//	    address owner;
//	    uint256 totalAmount;
//	    bytes32 depositId;
//	    uint32 coinType;
//	    string tokenKey;
//	}
func ParseCommitmentPublicValues(publicValuesHex string) (*CommitmentPublicValues, error) {
	// Clean hex prefix
	cleanHex := strings.TrimPrefix(publicValuesHex, "0x")

	// Decode hex string to bytes
	publicValuesBytes, err := hex.DecodeString(cleanHex)
	if err != nil {
		return nil, fmt.Errorf("hex decode failed: %w", err)
	}

	// Define tuple components directly using abi.Arguments
	// This is equivalent to abi_encode of the struct
	tupleArgs := abi.Arguments{
		{Name: "commitment", Type: mustNewType("bytes32")},
		{Name: "owner", Type: mustNewType("address")},
		{Name: "totalAmount", Type: mustNewType("uint256")},
		{Name: "depositId", Type: mustNewType("bytes32")},
		{Name: "coinType", Type: mustNewType("uint32")},
		{Name: "tokenKey", Type: mustNewType("string")},
	}

	// For tuple encoding, first 32 bytes is the offset to tuple data
	// abi.Arguments.Unpack expects the tuple data starting from the offset
	// So we need to skip the offset prefix
	if len(publicValuesBytes) < 32 {
		return nil, fmt.Errorf("public values too short, need at least 32 bytes for offset")
	}

	// Read offset (first 32 bytes)
	structOffset := int(new(big.Int).SetBytes(publicValuesBytes[0:32]).Uint64())
	if structOffset < 32 || structOffset >= len(publicValuesBytes) {
		return nil, fmt.Errorf("invalid struct offset: %d (data length: %d)", structOffset, len(publicValuesBytes))
	}

	// Unpack tuple from the offset position - ABI library handles all decoding automatically
	unpacked, err := tupleArgs.Unpack(publicValuesBytes[structOffset:])
	if err != nil {
		return nil, fmt.Errorf("failed to unpack ABI data: %w", err)
	}

	if len(unpacked) != 6 {
		return nil, fmt.Errorf("unexpected unpacked data length: expected 6 fields, got %d", len(unpacked))
	}

	// ABI library has already decoded all types, just convert to our struct format
	commitment := unpacked[0].([32]byte)
	depositId := unpacked[3].([32]byte)

	result := &CommitmentPublicValues{
		Commitment:    "0x" + hex.EncodeToString(commitment[:]),
		Owner:         unpacked[1].(common.Address).Hex(),
		TotalAmount:   unpacked[2].(*big.Int).String(),
		DepositID:     "0x" + hex.EncodeToString(depositId[:]),
		CoinType:      getUint32(unpacked[4]),
		TokenKey:      unpacked[5].(string),
		TokenSymbol:   unpacked[5].(string),
		TokenDecimals: 18,
	}

	return result, nil
}

// getUint32 extracts uint32 from ABI unpacked value (handles both uint32 and *big.Int)
func getUint32(v interface{}) uint32 {
	switch val := v.(type) {
	case uint32:
		return val
	case *big.Int:
		return uint32(val.Uint64())
	default:
		return 0
	}
}

// ParseWithdrawPublicValues parses withdraw proof public values from hex string
// Format: ABI-encoded struct (using Alloy's abi_encode, which follows Solidity ABI encoding)
// Uses Ethereum ABI library to decode the ABI-encoded struct
func ParseWithdrawPublicValues(publicValuesHex string) (*WithdrawPublicValues, error) {
	// Clean hex prefix
	cleanHex := strings.TrimPrefix(publicValuesHex, "0x")

	// Decode hex string to bytes
	publicValuesBytes, err := hex.DecodeString(cleanHex)
	if err != nil {
		return nil, fmt.Errorf("hex decode failed: %w", err)
	}

	// Define tuple components directly using abi.Arguments
	// This is equivalent to abi_encode of the struct
	tupleArgs := abi.Arguments{
		{Name: "commitmentRoot", Type: mustNewType("bytes32")},
		{Name: "nullifiers", Type: mustNewType("bytes32[]")},
		{Name: "amount", Type: mustNewType("uint256")},
		{Name: "intentType", Type: mustNewType("uint8")},
		{Name: "slip44chainID", Type: mustNewType("uint32")},
		{Name: "adapterId", Type: mustNewType("uint32")},
		{Name: "tokenKey", Type: mustNewType("string")},
		{Name: "beneficiaryData", Type: mustNewType("bytes32")},
		{Name: "minOutput", Type: mustNewType("bytes32")},
		{Name: "sourceChainId", Type: mustNewType("uint32")},
		{Name: "sourceTokenKey", Type: mustNewType("string")},
	}

	// For tuple encoding, first 32 bytes is the offset to tuple data
	// abi.Arguments.Unpack expects the tuple data starting from the offset
	if len(publicValuesBytes) < 32 {
		return nil, fmt.Errorf("public values too short, need at least 32 bytes for offset")
	}

	// Read offset (first 32 bytes)
	structOffset := int(new(big.Int).SetBytes(publicValuesBytes[0:32]).Uint64())
	if structOffset < 32 || structOffset >= len(publicValuesBytes) {
		return nil, fmt.Errorf("invalid struct offset: %d (data length: %d)", structOffset, len(publicValuesBytes))
	}

	// Unpack tuple from the offset position - ABI library handles all decoding automatically
	unpacked, err := tupleArgs.Unpack(publicValuesBytes[structOffset:])
	if err != nil {
		return nil, fmt.Errorf("failed to unpack ABI data: %w", err)
	}

	if len(unpacked) != 11 {
		return nil, fmt.Errorf("unexpected unpacked data length: expected 11 fields, got %d", len(unpacked))
	}

	// Convert nullifiers array
	nullifiersSlice := unpacked[1].([][32]byte)
	nullifiers := make([]string, len(nullifiersSlice))
	for i, n := range nullifiersSlice {
		nullifiers[i] = "0x" + hex.EncodeToString(n[:])
	}

	// ABI library has already decoded all types, just convert to our struct format
	commitmentRoot := unpacked[0].([32]byte)
	beneficiaryData := unpacked[7].([32]byte)
	minOutput := unpacked[8].([32]byte)

	result := &WithdrawPublicValues{
		CommitmentRoot:  "0x" + hex.EncodeToString(commitmentRoot[:]),
		Nullifiers:      nullifiers,
		Amount:          unpacked[2].(*big.Int).String(),
		IntentType:      getUint8(unpacked[3]),
		Slip44ChainID:   getUint32(unpacked[4]),
		AdapterID:       getUint32(unpacked[5]),
		TokenKey:        unpacked[6].(string),
		BeneficiaryData: "0x" + hex.EncodeToString(beneficiaryData[:]),
		MinOutput:       "0x" + hex.EncodeToString(minOutput[:]),
		SourceChainID:   getUint32(unpacked[9]),
		SourceTokenKey:  unpacked[10].(string),
	}

	return result, nil
}

// getUint8 extracts uint8 from ABI unpacked value (handles both uint8 and *big.Int)
func getUint8(v interface{}) uint8 {
	switch val := v.(type) {
	case uint8:
		return val
	case *big.Int:
		return uint8(val.Uint64())
	default:
		return 0
	}
}

// ExtractCommitmentHash extracts the commitment hash from public values (compatibility function)
func ExtractCommitmentHash(publicValuesHex string) (string, error) {
	parsed, err := ParseCommitmentPublicValues(publicValuesHex)
	if err != nil {
		return "", err
	}
	return parsed.Commitment, nil
}

// ExtractCommitmentRoot extracts the commitment root from withdraw public values
func ExtractCommitmentRoot(publicValuesHex string) (string, error) {
	parsed, err := ParseWithdrawPublicValues(publicValuesHex)
	if err != nil {
		return "", err
	}
	return parsed.CommitmentRoot, nil
}
