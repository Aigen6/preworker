package main

import (
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
)

func main() {
	// The hex data provided
	hexData := "00000000000000000000000000000000000000000000000000000000000000207347a9f3731f49562e9f63f68fdd67110c31f38e2d76d0743f747937a2db941e00000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000001b33519d8fc40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002ca000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000006f3995e2e40ca58adcbd47a2edad192e43d98638000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002ca000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000000040e77afd3b87cb2b69ab256510fa18385b5c0824945eec1d746c6fa1fe7afc97fa134224bd209de916d6bc9a692408aabc2b7c50a59202ea501fe2135a0497975525e42684cf04145c7064b7bfe6a25b927fd61f80c6c9062d00937de8a446f17c1576f9c2921f73192c4eb1543127c7492433d3b09892d085676ac627eb83a73000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000045553445400000000000000000000000000000000000000000000000000000000"

	// Remove 0x prefix if present
	hexData = strings.TrimPrefix(hexData, "0x")

	// Decode hex string
	data, err := hex.DecodeString(hexData)
	if err != nil {
		fmt.Printf("Error decoding hex: %v\n", err)
		return
	}

	fmt.Printf("=== ABI-Encoded WithdrawPublicValues Structure ===\n\n")
	fmt.Printf("Total data length: %d bytes (%d hex chars)\n\n", len(data), len(hexData))

	// Parse ABI-encoded struct
	// Offset 0: struct offset (0x20 = 32 bytes, pointing to start of struct data)
	offset := readUint256(data, 0)
	fmt.Printf("Position 0: struct offset = %d (0x%x)\n\n", offset, offset)

	// Start reading struct data at offset
	pos := int(offset.Int64())

	// commitmentRoot: bytes32 (32 bytes)
	commitmentRoot := hex.EncodeToString(data[pos : pos+32])
	pos += 32
	fmt.Printf("commitmentRoot = 0x%s\n", commitmentRoot)

	// nullifiers offset: uint256 (points to where nullifiers array starts)
	nullifiersOffset := readUint256(data, pos)
	pos += 32
	fmt.Printf("nullifiers offset = %d (0x%x)\n", nullifiersOffset.Int64(), nullifiersOffset.Int64())

	// amount: uint256 (32 bytes)
	amount := readUint256(data, pos)
	pos += 32
	fmt.Printf("amount = %s (0x%x) = %s ETH\n", amount.String(), amount, formatWei(amount))

	// intentType: uint8 (1 byte, but padded to 32 bytes)
	intentType := data[pos+31] // uint8 is at the last byte of 32-byte slot
	pos += 32
	fmt.Printf("intentType = %d\n", intentType)

	// slip44chainID: uint32 (4 bytes, but padded to 32 bytes)
	slip44ChainID := readUint32(data, pos)
	pos += 32
	fmt.Printf("slip44chainID = %d\n", slip44ChainID)

	// adapterId: uint32 (4 bytes, but padded to 32 bytes)
	adapterID := readUint32(data, pos)
	pos += 32
	fmt.Printf("adapterId = %d\n", adapterID)

	// tokenKey offset: uint256 (points to where string starts)
	tokenKeyOffset := readUint256(data, pos)
	pos += 32
	fmt.Printf("tokenKey offset = %d (0x%x)\n", tokenKeyOffset.Int64(), tokenKeyOffset.Int64())

	// beneficiaryData: bytes32 (32 bytes)
	beneficiaryData := hex.EncodeToString(data[pos : pos+32])
	beneficiaryAddr := beneficiaryData[24:] // Last 20 bytes (40 hex chars)
	pos += 32
	fmt.Printf("beneficiaryData = 0x%s\n", beneficiaryData)
	fmt.Printf("  → beneficiary address = 0x%s\n", beneficiaryAddr)

	// minOutput: bytes32 (32 bytes)
	minOutput := hex.EncodeToString(data[pos : pos+32])
	pos += 32
	fmt.Printf("minOutput = 0x%s\n", minOutput)

	// sourceChainId: uint32 (4 bytes, but padded to 32 bytes)
	sourceChainID := readUint32(data, pos)
	pos += 32
	fmt.Printf("sourceChainId = %d\n", sourceChainID)

	// sourceTokenKey offset: uint256 (points to where string starts)
	sourceTokenKeyOffset := readUint256(data, pos)
	pos += 32
	fmt.Printf("sourceTokenKey offset = %d (0x%x)\n\n", sourceTokenKeyOffset.Int64(), sourceTokenKeyOffset.Int64())

	// Now read dynamic arrays/strings
	// nullifiers array: The offset points to where the array data starts
	// But in ABI encoding, dynamic arrays are placed after all fixed fields
	// So nullifiers array starts after sourceTokenKey offset (position 384)
	nullifiersStart := 384 // After all fixed fields (32 + 11*32 = 384)
	nullifiersLength := readUint256(data, nullifiersStart)
	nullifiersPos := nullifiersStart + 32
	fmt.Printf("=== Dynamic Data ===\n\n")
	fmt.Printf("nullifiers array (at position %d):\n", nullifiersStart)
	fmt.Printf("  length = %d\n", nullifiersLength.Int64())
	nullifiers := make([]string, nullifiersLength.Int64())
	for i := int64(0); i < nullifiersLength.Int64(); i++ {
		nullifier := hex.EncodeToString(data[nullifiersPos : nullifiersPos+32])
		nullifiers[i] = nullifier
		fmt.Printf("  nullifier[%d] = 0x%s\n", i, nullifier)
		nullifiersPos += 32
	}
	fmt.Println()

	// tokenKey string: The offset points to where the string data starts
	// But in ABI encoding, strings are placed after arrays
	// So tokenKey string starts after nullifiers array and sourceTokenKey
	// nullifiers array: 384 + 32 (length) + 4*32 (data) = 544
	// sourceTokenKey: 544 + 32 (length) = 576
	// tokenKey: 576 + 32 (length) = 608
	tokenKeyStart := 576 // After nullifiers array and sourceTokenKey length
	if tokenKeyStart < len(data) {
		tokenKeyLength := readUint256(data, tokenKeyStart)
		tokenKeyPos := tokenKeyStart + 32
		if tokenKeyPos+int(tokenKeyLength.Int64()) <= len(data) {
			tokenKeyBytes := data[tokenKeyPos : tokenKeyPos+int(tokenKeyLength.Int64())]
			tokenKey := string(tokenKeyBytes)
			fmt.Printf("tokenKey (at position %d):\n", tokenKeyStart)
			fmt.Printf("  length = %d\n", tokenKeyLength.Int64())
			fmt.Printf("  value = \"%s\"\n\n", tokenKey)
		} else {
			fmt.Printf("tokenKey: invalid length or out of bounds\n\n")
		}
	}

	// sourceTokenKey string starts at sourceTokenKeyOffset
	sourceTokenKeyPos := int(sourceTokenKeyOffset.Int64())
	sourceTokenKeyLength := readUint256(data, sourceTokenKeyPos)
	sourceTokenKeyPos += 32
	if sourceTokenKeyLength.Int64() > 0 {
		sourceTokenKeyBytes := data[sourceTokenKeyPos : sourceTokenKeyPos+int(sourceTokenKeyLength.Int64())]
		sourceTokenKey := string(sourceTokenKeyBytes)
		fmt.Printf("sourceTokenKey (at position %d):\n", sourceTokenKeyOffset.Int64())
		fmt.Printf("  length = %d\n", sourceTokenKeyLength.Int64())
		fmt.Printf("  value = \"%s\"\n", sourceTokenKey)
	} else {
		fmt.Printf("sourceTokenKey (at position %d):\n", sourceTokenKeyOffset.Int64())
		fmt.Printf("  length = 0\n")
		fmt.Printf("  value = \"\" (empty)\n")
	}
}

func readUint256(data []byte, offset int) *big.Int {
	if offset+32 > len(data) {
		return big.NewInt(0)
	}
	return new(big.Int).SetBytes(data[offset : offset+32])
}

func readUint32(data []byte, offset int) uint32 {
	if offset+32 > len(data) {
		return 0
	}
	// uint32 is in the last 4 bytes of the 32-byte slot
	value := uint32(data[offset+28])<<24 |
		uint32(data[offset+29])<<16 |
		uint32(data[offset+30])<<8 |
		uint32(data[offset+31])
	return value
}

func formatWei(wei *big.Int) string {
	ether := new(big.Float).Quo(new(big.Float).SetInt(wei), big.NewFloat(1e18))
	return ether.Text('f', 18)
}
