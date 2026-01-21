package main

import (
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

func main() {
	// Input values
	commitmentHex := "0xa8c67f5fd8466da0f75415c42ad9fa15bb2daf0d4a9923da4042954f979ed366"
	seq := 1
	amountStr := "339300000000000000"

	// Remove 0x prefix if present
	commitmentHex = strings.TrimPrefix(commitmentHex, "0x")

	// Convert commitment hex to bytes using go-ethereum common.HexToHash
	commitmentHash := common.HexToHash("0x" + commitmentHex)
	commitmentBytes := commitmentHash.Bytes()

	// Convert seq to byte
	seqByte := byte(seq)

	// Convert amount string to big.Int and then to 32 bytes (big-endian)
	amountBig, ok := new(big.Int).SetString(amountStr, 10)
	if !ok {
		panic("Failed to parse amount")
	}
	amountBytes := make([]byte, 32)
	amountBig.FillBytes(amountBytes) // Big-endian encoding (U256)

	// Build data: commitment || seq || amount
	data := make([]byte, 0, 65) // 32 + 1 + 32 = 65 bytes
	data = append(data, commitmentBytes...)
	data = append(data, seqByte)
	data = append(data, amountBytes...)

	// Compute keccak256 hash (matching backend code)
	result := crypto.Keccak256(data)

	// Format as hex string with 0x prefix
	nullifier := "0x" + common.Bytes2Hex(result)

	fmt.Println("=== Nullifier Calculation ===")
	fmt.Printf("Commitment: %s\n", "0x"+commitmentHex)
	fmt.Printf("Seq: %d\n", seq)
	fmt.Printf("Amount: %s\n", amountStr)
	fmt.Println()
	fmt.Printf("Commitment bytes (32): %x\n", commitmentBytes)
	fmt.Printf("Seq byte (1): %x\n", seqByte)
	fmt.Printf("Amount bytes (32, big-endian): %x\n", amountBytes)
	fmt.Println()
	fmt.Printf("Concatenated data (65 bytes): %x\n", data)
	fmt.Println()
	fmt.Printf("✅ Nullifier: %s\n", nullifier)
}
