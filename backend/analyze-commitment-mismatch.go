package main

import (
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"
)

func main() {
	fmt.Println("=== Commitment 差异分析 ===\n")

	// 从日志中提取的数据
	oldCommitment := "0x682dd7d416522a9bb7657057f5fc8b76181fb5753a432d553a9d4a6b38792b5f"
	newCommitment := "0xafdbc96635f3aabf06c62b21b4fe1c5cf0337a78275108456cc8d95d505a9d71"

	// ZKVM 使用的 allocations（从日志中提取）
	allocations := []struct {
		seq    int
		amount string
	}{
		{0, "000000000000000000000000000000000000000000000000029a2241af62c000"}, // 1880000000000000000
		{1, "0000000000000000000000000000000000000000000000000e7e74443b6b0000"}, // 1044400000000000000
		{2, "0000000000000000000000000000000000000000000000000a1abb17a4f64000"}, // 728100000000000000
	}

	// 从日志中提取的其他数据
	depositIDHex := "000000000000000000000000000000000000000000000000000000000117981c"
	chainID := uint32(714) // BSC SLIP-44
	tokenKey := "USDT"
	ownerChainID := uint32(714)
	ownerAddress := "0000000000000000000000006f3995e2e40ca58adcbd47a2edad192e43d98638"

	fmt.Printf("📋 输入数据:\n")
	fmt.Printf("   DepositID: %s\n", depositIDHex)
	fmt.Printf("   ChainID: %d\n", chainID)
	fmt.Printf("   TokenKey: %s\n", tokenKey)
	fmt.Printf("   Owner ChainID: %d\n", ownerChainID)
	fmt.Printf("   Owner Address: %s\n", ownerAddress)
	fmt.Printf("   Allocations:\n")
	for _, alloc := range allocations {
		amountBig, _ := new(big.Int).SetString(alloc.amount, 16)
		fmt.Printf("      Seq %d: %s (decimal: %s)\n", alloc.seq, alloc.amount, amountBig.String())
	}
	fmt.Println()

	// 计算 token_key_hash
	tokenKeyHash := crypto.Keccak256([]byte(tokenKey))
	fmt.Printf("🔑 Token Key Hash: 0x%s\n", hex.EncodeToString(tokenKeyHash))
	fmt.Println()

	// 计算新的 commitment（使用 ZKVM 的数据）
	fmt.Println("🔍 计算新的 commitment（使用 ZKVM 的数据）...")
	newCommitmentCalc := calculateCommitment(
		depositIDHex,
		chainID,
		tokenKeyHash,
		ownerChainID,
		ownerAddress,
		allocations,
	)
	fmt.Printf("   计算得到的 commitment: %s\n", newCommitmentCalc)
	fmt.Printf("   ZKVM 返回的 commitment: %s\n", newCommitment)
	if strings.EqualFold(newCommitmentCalc, newCommitment) {
		fmt.Printf("   ✅ 匹配！\n")
	} else {
		fmt.Printf("   ❌ 不匹配！\n")
	}
	fmt.Println()

	// 分析旧 commitment 可能基于的数据
	fmt.Println("🔍 分析旧 commitment 可能基于的数据...")
	fmt.Printf("   旧的 commitment: %s\n", oldCommitment)
	fmt.Printf("   新的 commitment: %s\n", newCommitment)
	fmt.Println()

	// 从日志中看到的旧 allocations（创建 check 时使用的）
	// 注意：这些是创建 check 时记录的，可能和 ZKVM 使用的不同
	fmt.Println("📝 从日志中看到的 allocations（创建 check 时）:")
	fmt.Println("   Seq 0: 1880000000000000000 (可能)")
	fmt.Println("   Seq 1: 1044400000000000000")
	fmt.Println("   Seq 2: 728100000000000000")
	fmt.Println()
	fmt.Println("📝 ZKVM 使用的 allocations:")
	for _, alloc := range allocations {
		amountBig, _ := new(big.Int).SetString(alloc.amount, 16)
		fmt.Printf("   Seq %d: %s\n", alloc.seq, amountBig.String())
	}
	fmt.Println()

	// 尝试找出差异
	fmt.Println("💡 可能的原因:")
	fmt.Println("   1. ⚠️  旧的 commitment 可能是基于不同的 allocations 计算的")
	fmt.Println("      - 从日志看，Seq 0 的金额可能不同")
	fmt.Println("      - 旧的: 1880000000000000000 (1.88)")
	fmt.Println("      - 新的: 187500000000000000 (0.1875)")
	fmt.Println("   2. 旧的 commitment 可能是基于不同的 deposit_id 计算的")
	fmt.Println("   3. 旧的 commitment 可能是基于不同的 token_key 计算的")
	fmt.Println("   4. 旧的 commitment 可能是基于不同的 owner_address 计算的")
	fmt.Println()
	fmt.Println("⚠️  这会导致 nullifier 不匹配，因为 nullifier = keccak256(commitment || seq || amount)")
	fmt.Println("   如果 commitment 不同，即使 seq 和 amount 相同，nullifier 也会不同")
	fmt.Println()
	fmt.Println("🔧 解决方案:")
	fmt.Println("   1. 不要单独使用 /api/allocations 创建 allocations")
	fmt.Println("   2. 应该使用 /api/commitments/submit，它会:")
	fmt.Println("      - 删除旧的 allocations")
	fmt.Println("      - 创建新的 allocations")
	fmt.Println("      - 调用 ZKVM 重新计算 commitment")
	fmt.Println("      - 使用新的 commitment 生成 nullifiers")
}

func calculateCommitment(
	depositIDHex string,
	chainID uint32,
	tokenKeyHash []byte,
	ownerChainID uint32,
	ownerAddress string,
	allocations []struct {
		seq    int
		amount string
	},
) string {
	var hashData []byte

	// 1. Hash deposit 基本信息
	depositIDBytes, _ := hex.DecodeString(depositIDHex)
	hashData = append(hashData, depositIDBytes...)

	chainIDBytes := make([]byte, 4)
	chainIDBig := big.NewInt(int64(chainID))
	chainIDBig.FillBytes(chainIDBytes)
	hashData = append(hashData, chainIDBytes...)

	hashData = append(hashData, tokenKeyHash...)

	// 2. Hash owner 地址
	ownerChainIDBytes := make([]byte, 4)
	ownerChainIDBig := big.NewInt(int64(ownerChainID))
	ownerChainIDBig.FillBytes(ownerChainIDBytes)
	hashData = append(hashData, ownerChainIDBytes...)

	ownerAddressBytes, _ := hex.DecodeString(ownerAddress)
	hashData = append(hashData, ownerAddressBytes...)

	// 3. Hash allocations（按 seq 排序）
	for _, alloc := range allocations {
		// hash_allocation = keccak256(seq || amount)
		amountBytes, _ := hex.DecodeString(alloc.amount)
		allocData := append([]byte{byte(alloc.seq)}, amountBytes...)
		allocHash := crypto.Keccak256(allocData)
		hashData = append(hashData, allocHash...)
	}

	result := crypto.Keccak256(hashData)
	return "0x" + hex.EncodeToString(result)
}

