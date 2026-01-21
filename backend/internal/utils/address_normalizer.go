package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"regexp"
	"strings"
)

// isTronAddress checkwhetherTRONaddress
func IsTronAddress(address string) bool {
	return address != "" && strings.HasPrefix(address, "T") && len(address) == 34
}

// isEvmAddress checkwhetherEVMaddress (20 bytes)
func IsEvmAddress(address string) bool {
	if address == "" {
		return false
	}
	// checkwhether0x40
	if strings.HasPrefix(strings.ToLower(address), "0x") {
		return len(address) == 42
	}
	// checkwhether40
	if len(address) == 40 {
		hexPattern := regexp.MustCompile("^[0-9a-fA-F]{40}$")
		return hexPattern.MatchString(address)
	}
	return false
}

// IsUniversalAddress checkwhetherUniversal Address (32 bytes)
func IsUniversalAddress(address string) bool {
	if address == "" {
		return false
	}
	// checkwhether0x64 (32 bytes = 64 hex chars)
	if strings.HasPrefix(strings.ToLower(address), "0x") {
		return len(address) == 66
	}
	// checkwhether64 (32 bytes = 64 hex chars)
	if len(address) == 64 {
		hexPattern := regexp.MustCompile("^[0-9a-fA-F]{64}$")
		return hexPattern.MatchString(address)
	}
	return false
}

// NormalizeAddressForChain normalizes address based on chain ID
// IMPORTANT: This function handles ORIGINAL chain addresses (20-byte EVM or TRON Base58)
// For Universal Address (32-byte), use it directly without normalization
// Returns: normalized original address (for conversion to Universal Address later)
func NormalizeAddressForChain(address string, chainID int) string {
	if address == "" {
		return ""
	}

	// If already 32-byte Universal Address, return as-is (no normalization needed)
	if IsUniversalAddress(address) {
		return address
	}

	// SLIP-44 Chain ID 195 = TRON
	if chainID == 195 && IsTronAddress(address) {
		// TRON Base58 address - return as-is (will be converted to Universal Address later)
		return address
	}

	// EVM address (20-byte) - normalize: add 0x prefix if missing, lowercase
	if IsEvmAddress(address) {
		if strings.HasPrefix(strings.ToLower(address), "0x") {
			return strings.ToLower(address)
		}
		// if no 0x prefix, add it
		return "0x" + strings.ToLower(address)
	}

	// If address doesn't match any known format, return as-is
	// Note: This might be already a Universal Address or an unsupported format
	return address
}

// TronToUniversalAddress TRON Base58addressUniversal（0x）
func TronToUniversalAddress(tronAddress string) (string, error) {
	if !IsTronAddress(tronAddress) {
		return "", fmt.Errorf("invalid TRON address format: %s", tronAddress)
	}

	// Base58
	decoded, err := base58Decode(tronAddress)
	if err != nil {
		return "", fmt.Errorf("failed to decode TRON address: %w", err)
	}

	// TRONaddress：21address + 4 = 25
	if len(decoded) != 25 {
		return "", fmt.Errorf("invalid TRON address length: expected 25 bytes, got %d", len(decoded))
	}

	// verify
	addressBytes := decoded[:21]
	checksum := decoded[21:]

	hash1 := sha256.Sum256(addressBytes)
	hash2 := sha256.Sum256(hash1[:])
	expectedChecksum := hash2[:4]

	if !bytesEqual(checksum, expectedChecksum) {
		return "", fmt.Errorf("invalid TRON address checksum")
	}

	// 20address（41）
	if addressBytes[0] != 0x41 {
		return "", fmt.Errorf("invalid TRON address prefix: expected 0x41, got 0x%02x", addressBytes[0])
	}

	// 41，20address
	evmAddress := addressBytes[1:]

	// 032（matchZKVMUniversalAddress）
	universalAddress := make([]byte, 32)
	copy(universalAddress[12:], evmAddress) // 20，0

	return "0x" + hex.EncodeToString(universalAddress), nil
}

// EvmToUniversalAddress EVMaddressUniversal Address（320 matchZKVM）
func EvmToUniversalAddress(evmAddress string) (string, error) {
	if !IsEvmAddress(evmAddress) {
		return "", fmt.Errorf("invalid EVM address format: %s", evmAddress)
	}

	// EVMaddress0x
	normalized := NormalizeAddressForChain(evmAddress, 1) // usechain ID 1 ()
	hexStr := strings.TrimPrefix(normalized, "0x")

	
	evmBytes, err := hex.DecodeString(hexStr)
	if err != nil {
		return "", fmt.Errorf("failed to decode EVM address: %w", err)
	}

	if len(evmBytes) != 20 {
		return "", fmt.Errorf("invalid EVM address length: expected 20 bytes, got %d", len(evmBytes))
	}

	// 032（matchZKVMUniversalAddress）
	universalAddress := make([]byte, 32)
	copy(universalAddress[12:], evmBytes) // 20，0

	return "0x" + hex.EncodeToString(universalAddress), nil
}

// base58Decode Base58
func base58Decode(input string) ([]byte, error) {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

	// create
	decode := make(map[byte]int)
	for i, char := range alphabet {
		decode[byte(char)] = i
	}

	// 1
	zeroCount := 0
	for i := 0; i < len(input) && input[i] == '1'; i++ {
		zeroCount++
	}

	
	num := big.NewInt(0)
	base := big.NewInt(58)

	for i := range input {
		char := input[i]
		val, exists := decode[char]
		if !exists {
			return nil, fmt.Errorf("invalid base58 character: %c", char)
		}
		num.Mul(num, base)
		num.Add(num, big.NewInt(int64(val)))
	}

	
	decoded := num.Bytes()

	// add
	for i := 0; i < zeroCount; i++ {
		decoded = append([]byte{0}, decoded...)
	}

	return decoded, nil
}

// ExtractEvmAddressFromUniversal extracts EVM address (20 bytes) from Universal Address (32 bytes)
// Universal Address format: 32 bytes where last 20 bytes contain the EVM address
// Returns: EVM address in format "0x" + 40 hex chars, or error if invalid
func ExtractEvmAddressFromUniversal(universalAddress string) (string, error) {
	if !IsUniversalAddress(universalAddress) {
		return "", fmt.Errorf("invalid Universal Address format: %s", universalAddress)
	}

	// Remove 0x prefix if present
	hexStr := strings.TrimPrefix(strings.ToLower(universalAddress), "0x")
	if len(hexStr) != 64 {
		return "", fmt.Errorf("invalid Universal Address length: expected 64 hex chars, got %d", len(hexStr))
	}

	// Extract last 20 bytes (40 hex chars) which contain the EVM address
	evmHex := hexStr[24:] // Skip first 12 bytes (24 hex chars), take last 20 bytes (40 hex chars)

	return "0x" + evmHex, nil
}

// bytesEqual whether
func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// EvmToTronAddress converts EVM address (0x...) to TRON Base58 address (T...)
func EvmToTronAddress(evmAddress string) (string, error) {
	if !IsEvmAddress(evmAddress) {
		return "", fmt.Errorf("invalid EVM address format: %s", evmAddress)
	}

	// Remove 0x prefix and decode hex
	hexStr := strings.TrimPrefix(strings.ToLower(evmAddress), "0x")
	evmBytes, err := hex.DecodeString(hexStr)
	if err != nil {
		return "", fmt.Errorf("failed to decode EVM address: %w", err)
	}

	if len(evmBytes) != 20 {
		return "", fmt.Errorf("invalid EVM address length: expected 20 bytes, got %d", len(evmBytes))
	}

	// TRON address format: 0x41 + 20 bytes address = 21 bytes
	tronAddressBytes := make([]byte, 21)
	tronAddressBytes[0] = 0x41 // TRON prefix
	copy(tronAddressBytes[1:], evmBytes)

	// Calculate checksum (double SHA256)
	hash1 := sha256.Sum256(tronAddressBytes)
	hash2 := sha256.Sum256(hash1[:])
	checksum := hash2[:4]

	// Combine address + checksum = 25 bytes
	fullAddress := append(tronAddressBytes, checksum...)

	// Encode to Base58
	tronAddress := base58Encode(fullAddress)
	return tronAddress, nil
}

// base58Encode encodes bytes to Base58 string
func base58Encode(input []byte) string {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

	// Convert to big integer
	num := big.NewInt(0).SetBytes(input)
	base := big.NewInt(58)

	// Encode
	var result []byte
	zero := big.NewInt(0)
	for num.Cmp(zero) > 0 {
		mod := new(big.Int)
		num.DivMod(num, base, mod)
		result = append(result, alphabet[mod.Int64()])
	}

	// Add leading zeros
	for _, b := range input {
		if b == 0 {
			result = append(result, '1')
		} else {
			break
		}
	}

	// Reverse
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return string(result)
}
