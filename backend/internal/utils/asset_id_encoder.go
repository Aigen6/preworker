package utils

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"strings"
)

// EncodeAssetID encodes SLIP-44 Chain ID, Adapter ID, and Token ID into a bytes32 hex string
// Format: SLIP44ID (4 bytes) || AdapterID (4 bytes) || TokenID (2 bytes) || Reserved (22 bytes)
// Example: BSC (714) + Adapter(1) + Token(1) = 0x000002ca000000010001000000000000000000000000000000000000000000000000
func EncodeAssetID(slip44ChainID uint32, adapterID uint32, tokenID uint16) string {
	// Create 32-byte array
	result := make([]byte, 32)

	// Bytes 0-3: SLIP-44 Chain ID (big-endian)
	binary.BigEndian.PutUint32(result[0:4], slip44ChainID)

	// Bytes 4-7: Adapter ID (big-endian)
	binary.BigEndian.PutUint32(result[4:8], adapterID)

	// Bytes 8-9: Token ID (big-endian)
	binary.BigEndian.PutUint16(result[8:10], tokenID)

	// Bytes 10-31: Reserved (already zeros)

	// Return as hex string with 0x prefix
	return "0x" + hex.EncodeToString(result)
}

// DecodeAssetID decodes a bytes32 hex string into SLIP-44 Chain ID, Adapter ID, and Token ID
// Returns: (slip44ChainID, adapterID, tokenID, error)
func DecodeAssetID(assetID string) (uint32, uint32, uint16, error) {
	// Remove 0x prefix if present
	assetID = strings.TrimPrefix(assetID, "0x")

	// Check length (64 hex chars = 32 bytes)
	if len(assetID) != 64 {
		return 0, 0, 0, fmt.Errorf("invalid asset ID length: expected 64 hex chars, got %d", len(assetID))
	}

	// Decode hex string to bytes
	data, err := hex.DecodeString(assetID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("invalid hex string: %v", err)
	}

	// Extract components
	slip44ChainID := binary.BigEndian.Uint32(data[0:4])
	adapterID := binary.BigEndian.Uint32(data[4:8])
	tokenID := binary.BigEndian.Uint16(data[8:10])

	return slip44ChainID, adapterID, tokenID, nil
}

// ValidateAssetID validates that an asset ID is well-formed and matches expected values
func ValidateAssetID(assetID string, expectedSLIP44 uint32, expectedAdapter uint32, expectedToken uint16) error {
	slip44, adapter, token, err := DecodeAssetID(assetID)
	if err != nil {
		return err
	}

	if slip44 != expectedSLIP44 {
		return fmt.Errorf("SLIP-44 Chain ID mismatch: expected %d, got %d", expectedSLIP44, slip44)
	}

	if adapter != expectedAdapter {
		return fmt.Errorf("adapter ID mismatch: expected %d, got %d", expectedAdapter, adapter)
	}

	if token != expectedToken {
		return fmt.Errorf("token ID mismatch: expected %d, got %d", expectedToken, token)
	}

	return nil
}

// GetChainIDFromAssetID extracts SLIP-44 Chain ID from an Asset ID
func GetChainIDFromAssetID(assetID string) (uint32, error) {
	slip44, _, _, err := DecodeAssetID(assetID)
	return slip44, err
}

// GetAdapterIDFromAssetID extracts Adapter ID from an Asset ID
func GetAdapterIDFromAssetID(assetID string) (uint32, error) {
	_, adapter, _, err := DecodeAssetID(assetID)
	return adapter, err
}

// GetTokenIDFromAssetID extracts Token ID from an Asset ID
func GetTokenIDFromAssetID(assetID string) (uint16, error) {
	_, _, token, err := DecodeAssetID(assetID)
	return token, err
}
