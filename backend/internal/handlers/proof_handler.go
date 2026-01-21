package handlers

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"go-backend/internal/app"
	"go-backend/internal/clients"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/services"
	"go-backend/internal/types"
	"go-backend/internal/utils"
	"log"
	"math/big"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// normalizeAddressForChain normalize address format based on chain ID
func normalizeAddressForChain(address string, chainID int) string {
	if address == "" {
		return ""
	}

	// SLIP-44 Chain ID 195 = TRON
	if chainID == 195 && strings.HasPrefix(address, "T") && len(address) == 34 {
		// TRON address case sensitive, keep original format
		return address
	}

	// EVM address handling: convert to lowercase and ensure 0x prefix
	if strings.HasPrefix(strings.ToLower(address), "0x") {
		return strings.ToLower(address)
	}

	// Checkwhether40
	if len(address) == 40 {
		hexPattern := regexp.MustCompile("^[0-9a-fA-F]{40}$")
		if hexPattern.MatchString(address) {
			return "0x" + strings.ToLower(address)
		}
	}

	// Defaultreturnaddress
	return address
}

// Allocation corresponds to the Allocation data structure in the API spec.
type Allocation struct {
	RecipientChainID uint32 `json:"recipient_chain_id" binding:"required"`
	RecipientAddress string `json:"recipient_address" binding:"required"`
	Amount           string `json:"amount" binding:"required"`
}

// MultichainSignatureRequest Multi-chain signature request structure
type MultichainSignatureRequest struct {
	ChainID       uint32  `json:"chain_id" binding:"required"`
	SignatureData string  `json:"signature_data" binding:"required"`
	PublicKey     *string `json:"public_key"`
}

// UniversalAddressRequest Universal address request structure
type UniversalAddressRequest struct {
	ChainID uint32 `json:"chain_id" binding:"required"`
	Address string `json:"address" binding:"required"`
}

// BSCCommitmentRequest corresponds to the request body for /api/proof/buildcommitment
type BSCCommitmentRequest struct {
	Allocations   []Allocation               `json:"allocations" binding:"required"`
	DepositID     string                     `json:"deposit_id" binding:"required"`
	Signature     MultichainSignatureRequest `json:"signature" binding:"required"`
	OwnerAddress  UniversalAddressRequest    `json:"owner_address" binding:"required"`
	TokenSymbol   string                     `json:"token_symbol" binding:"required"`
	TokenDecimals uint8                      `json:"token_decimals" binding:"required"`
	Lang          uint8                      `json:"lang" binding:"required"`
	Commitment    string                     `json:"commitment,omitempty"` // Optional: commitment hash calculated by frontend
}

// BuildCommitmentHandler handles the /api/proof/buildcommitment endpoint.
func BuildCommitmentHandler(c *gin.Context) {
	var req BSCCommitmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success":   false,
			"error":     "ValidationError",
			"message":   err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	// requestdata
	if reqData, err := json.MarshalIndent(req, "", "  "); err == nil {
		log.Printf("=== Go Backend request ===\n%s\n", string(reqData))
		log.Printf("===  ===")
		log.Printf("SLIP44ChainID: %d", req.Signature.ChainID)
		log.Printf(": %d", len(req.Signature.SignatureData))
		log.Printf(": %s", req.Signature.SignatureData)
		if req.Signature.PublicKey != nil {
			log.Printf(": %s", *req.Signature.PublicKey)
		}
	}

	// Convert DepositID  int64
	log.Printf("📥 [BuildCommitmentHandler] Received deposit_id from frontend: %s (type: string)", req.DepositID)
	depositID, err := strconv.ParseInt(req.DepositID, 10, 64)
	if err != nil {
		log.Printf("❌ [BuildCommitmentHandler] Failed to parse deposit_id: %s, error: %v", req.DepositID, err)
		c.JSON(http.StatusBadRequest, gin.H{
			"success":   false,
			"error":     "ValidationError",
			"message":   "Invalid deposit_id format",
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}
	log.Printf("✅ [BuildCommitmentHandler] Parsed deposit_id: %d (int64)", depositID)

	// address - SDK should send 32-byte Universal Address, but we support both for backward compatibility
	chainID := int(req.OwnerAddress.ChainID)
	ownerAddress := req.OwnerAddress.Address

	// Normalize address (add 0x prefix if missing, lowercase)
	var normalizedOwner string
	if strings.HasPrefix(strings.ToLower(ownerAddress), "0x") {
		normalizedOwner = strings.ToLower(ownerAddress)
	} else {
		normalizedOwner = "0x" + strings.ToLower(ownerAddress)
	}

	// Convert to Universal Address for database query and ZKVM
	var universalAddressData string
	if utils.IsUniversalAddress(normalizedOwner) {
		// Already 32-byte Universal Address format - use directly
		universalAddressData = normalizedOwner
		log.Printf("✅ Received 32-byte Universal Address: %s", normalizedOwner)
	} else if chainID == 195 && utils.IsTronAddress(normalizedOwner) {
		// TRON address - convert to Universal Address
		universalAddr, convErr := utils.TronToUniversalAddress(normalizedOwner)
		if convErr != nil {
			log.Printf("❌ TRON address conversion failed: %v", convErr)
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "AddressConversionFailed",
				"message": "Failed to convert TRON address to universal format",
				"details": convErr.Error(),
			})
			return
		}
		universalAddressData = universalAddr
		log.Printf("✅ Converted TRON address to Universal Address: %s -> %s", normalizedOwner, universalAddr)
	} else if utils.IsEvmAddress(normalizedOwner) {
		// 20-byte EVM address - convert to Universal Address
		universalAddr, convErr := utils.EvmToUniversalAddress(normalizedOwner)
		if convErr != nil {
			log.Printf("❌ EVM address conversion failed: %v", convErr)
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "AddressConversionFailed",
				"message": "Failed to convert EVM address to universal format",
				"details": convErr.Error(),
			})
			return
		}
		universalAddressData = universalAddr
		log.Printf("✅ Converted EVM address to Universal Address: %s -> %s", normalizedOwner, universalAddr)
	} else {
		log.Printf("❌ Unsupported address format: %s, chainID=%d", normalizedOwner, chainID)
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "UnsupportedAddressFormat",
			"message": "Unsupported address format. Expected 32-byte Universal Address or 20-byte EVM address",
			"address": normalizedOwner,
			"chainID": chainID,
		})
		return
	}

	// 1. corresponding to checkbook - UseV2query
	log.Printf("🔍 checkbookrecord: local_deposit_id=%d, owner=%s, owner_chain_id=%d", depositID, normalizedOwner, req.OwnerAddress.ChainID)

	var checkbook models.Checkbook
	var query *gorm.DB
	if chainID == 195 {
		// TRON: exact match, case sensitive，UseV2query
		query = db.DB.Where("local_deposit_id = ? AND user_chain_id = ? AND user_data = ?", depositID, chainID, universalAddressData)
	} else {
		// EVM: case insensitive query，UseV2query
		query = db.DB.Where("local_deposit_id = ? AND user_chain_id = ? AND LOWER(user_data) = LOWER(?)", depositID, chainID, universalAddressData)
	}

	if err := query.First(&checkbook).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("❌ notcheckbookrecord: local_deposit_id=%d, owner=%s", depositID, normalizedOwner)
			c.JSON(http.StatusNotFound, gin.H{
				"success":   false,
				"error":     "CheckbookNotFound",
				"message":   "Checkbook not found for the given deposit_id and owner",
				"timestamp": time.Now().Format(time.RFC3339),
			})
			return
		}
		log.Printf("❌ querycheckbook: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "DatabaseError",
			"message":   err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	log.Printf("📋 checkbookrecord:")
	log.Printf("   ID: %s", checkbook.ID)
	log.Printf("   currentstatus: %s", checkbook.Status)
	log.Printf("   useraddress: {SLIP44ChainID:%d, Data:%s}", checkbook.UserAddress.SLIP44ChainID, checkbook.UserAddress.Data)
	log.Printf("   amount: %s", checkbook.Amount)
	var commitmentStr1 string
	if checkbook.Commitment != nil {
		commitmentStr1 = *checkbook.Commitment
	}
	log.Printf("   Commitment: %s", commitmentStr1)

	// Save original status for rollback in case of ZKVM failure
	originalStatus := checkbook.Status

	// Check record status with retry and in-progress handling
	// 1. Allow retry for failed states: proof_failed, submission_failed
	// 2. Reject if already in progress: generating_proof, submitting_commitment, commitment_pending
	// 3. Allow normal flow for: ready_for_commitment
	currentStatus := checkbook.Status

	// Check if already in progress (should reject with "正在执行中" message)
	if currentStatus == models.CheckbookStatusGeneratingProof ||
		currentStatus == models.CheckbookStatusSubmittingCommitment ||
		currentStatus == models.CheckbookStatusCommitmentPending {
		log.Printf("⏸️ [BuildCommitmentHandler] Commitment is already in progress: current status='%s', deposit_id=%s", currentStatus, req.DepositID)
		c.JSON(http.StatusBadRequest, gin.H{
			"success":   false,
			"error":     "AlreadyInProgress",
			"message":   "正在执行中",
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	// Allow retry for failed states
	if currentStatus == models.CheckbookStatusProofFailed || currentStatus == models.CheckbookStatusSubmissionFailed {
		log.Printf("🔄 [BuildCommitmentHandler] Retrying commitment submission: current status='%s', deposit_id=%s", currentStatus, req.DepositID)
		// Continue with normal flow - will retry the commitment process
	}

	// Only allow ready_for_commitment or failed states (for retry)
	if currentStatus != models.CheckbookStatusReadyForCommitment &&
		currentStatus != models.CheckbookStatusProofFailed &&
		currentStatus != models.CheckbookStatusSubmissionFailed {
		log.Printf("❌ [BuildCommitmentHandler] Status check failed: current status='%s', deposit_id=%s. Only 'ready_for_commitment', 'proof_failed', or 'submission_failed' status is allowed for commitment submission", currentStatus, req.DepositID)
		c.JSON(http.StatusBadRequest, gin.H{
			"success":   false,
			"error":     "InvalidStatus",
			"message":   fmt.Sprintf("Invalid checkbook status '%s'. Only checkbooks with 'ready_for_commitment', 'proof_failed', or 'submission_failed' status can submit commitment. Current status: '%s'", currentStatus, currentStatus),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	// startDatabasetransaction
	tx := db.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Note: Do NOT convert status to 'with_checkbook' here!
	// 'with_checkbook' status should only be set AFTER commitment is successfully confirmed on-chain.
	// At this point, we're just starting the commitment creation process, so we keep the current status
	// and will update to 'signaturing' after creating allocations.
	// Status flow:
	// - ready_for_commitment → signaturing (when starting commitment creation)
	// - unsigned → signaturing (legacy status, convert for backward compatibility)
	// - with_checkbook → signaturing (re-commitment, already has a commitment on-chain)
	// - proof_failed → signaturing (retry after proof generation failure, regenerate proof and commitment)
	// - submission_failed → signaturing (retry after submission failure, regenerate commitment)
	log.Printf("ℹ️ Starting commitment creation process, current status='%s', deposit_id=%s", checkbook.Status, req.DepositID)

	// 5. deletedata（！SupportCreate）
	log.Printf("🗑️ deletecheckbook_id=%s", checkbook.ID)
	deleteResult := tx.Where("checkbook_id = ?", checkbook.ID).Delete(&models.Check{})
	if deleteResult.Error != nil {
		log.Printf("❌ deletefailed: %v", deleteResult.Error)
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "DatabaseError",
			"message":   "Failed to delete existing checks: " + deleteResult.Error.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}
	log.Printf("✅ successdelete %d record", deleteResult.RowsAffected)

	// Generate nullifier for each allocation if commitment is provided
	// Nullifier = keccak256(commitment || seq || amount)
	// Matching SDK logic: CommitmentCore.generateNullifier
	// IMPORTANT: Do NOT use old commitment from checkbook or request here!
	// ZKVM will calculate a NEW commitment based on current allocations.
	// Using old commitment will cause nullifier mismatch.
	// We should leave nullifier as NULL and let it be set after ZKVM proof is generated.
	var commitmentHash common.Hash
	hasCommitment := false

	// ⚠️ WARNING: Even if request provides commitment or checkbook has commitment,
	// we should NOT use it here because:
	// 1. ZKVM will recalculate commitment based on current allocations
	// 2. If allocations have changed, the commitment will be different
	// 3. Using old commitment will generate wrong nullifiers
	//
	// Solution: Always set nullifier to NULL here, it will be recalculated after ZKVM proof
	// if needed (though typically nullifiers are only needed when creating withdraw requests)

	if req.Commitment != "" {
		log.Printf("⚠️  WARNING: Request provided commitment: %s", req.Commitment)
		log.Printf("   ⚠️  This commitment may be OLD and based on different allocations.")
		log.Printf("   ⚠️  ZKVM will calculate a NEW commitment based on current allocations.")
		log.Printf("   ⚠️  Using old commitment here will cause nullifier mismatch!")
		log.Printf("   ✅ Solution: Ignoring request commitment, nullifier will be NULL (correct behavior)")
	}

	if checkbook.Commitment != nil && *checkbook.Commitment != "" {
		log.Printf("⚠️  WARNING: Checkbook has old commitment: %s", *checkbook.Commitment)
		log.Printf("   ⚠️  This commitment may be based on OLD allocations.")
		log.Printf("   ⚠️  ZKVM will calculate a NEW commitment based on current allocations.")
		log.Printf("   ⚠️  Using old commitment here will cause nullifier mismatch!")
		log.Printf("   ✅ Solution: Ignoring checkbook commitment, nullifier will be NULL (correct behavior)")
	}

	log.Printf("✅ No nullifier will be generated here (will be NULL)")
	log.Printf("   → ZKVM will calculate new commitment based on current allocations")
	log.Printf("   → Nullifiers can be recalculated later if needed using the new commitment")

	// 6. Createdata
	log.Printf("📝 Create %d record", len(req.Allocations))
	var checks []models.Check
	for i, allocation := range req.Allocations {
		// UniversalAddress
		recipient := models.UniversalAddress{
			SLIP44ChainID: allocation.RecipientChainID, // allocationGetchain ID
			Data:          allocation.RecipientAddress,
		}

		// Generate nullifier if commitment is available
		// Matching lib.rs: generate_nullifier(commitment, allocation)
		// Formula: keccak256(commitment[32 bytes] || seq[1 byte] || amount[32 bytes])
		var nullifier string
		if hasCommitment {
			// Convert amount to big.Int and then to 32 bytes (U256 big-endian)
			amountBig, ok := new(big.Int).SetString(allocation.Amount, 10)
			if !ok {
				log.Printf("⚠️ Failed to parse amount %s, nullifier will be NULL", allocation.Amount)
				nullifier = "" // Will be NULL in database
			} else {
				// Prepare data exactly as lib.rs does:
				// 1. commitment (32 bytes)
				// 2. seq (1 byte, u8)
				// 3. amount (32 bytes, U256 big-endian)
				seqByte := byte(i) // seq is u8 (0-255)
				amountBytes := make([]byte, 32)
				amountBig.FillBytes(amountBytes) // Big-endian encoding (U256)

				// Build data: commitment || seq || amount
				// This matches lib.rs: hasher.update(commitment); hasher.update(&[seq]); hasher.update(&amount);
				data := make([]byte, 0, 65) // 32 + 1 + 32 = 65 bytes
				data = append(data, commitmentHash.Bytes()...)
				data = append(data, seqByte)
				data = append(data, amountBytes...)

				// Compute keccak256 hash (matches Rust Keccak256::finalize())
				hash := crypto.Keccak256(data)
				nullifier = "0x" + common.Bytes2Hex(hash)
				log.Printf("   [%d] Generated nullifier - Commitment: %s, Seq: %d, Amount: %s, Nullifier: %s",
					i+1, commitmentHash.Hex(), i, allocation.Amount, nullifier)
			}
		}

		check := models.Check{
			ID:          uuid.New().String(),
			CheckbookID: checkbook.ID,
			Seq:         uint8(i), // Sequence number (0-255), required field
			// TokenID is deprecated, no longer set
			Amount:    allocation.Amount,           // amount
			Recipient: recipient,                   // address
			Nullifier: nullifier,                   // Generated from commitment if available, otherwise empty (NULL in DB)
			RequestID: nil,                         // request_idZKVMproofSet
			Status:    models.AllocationStatusIdle, // Allocations start as idle, become pending when used in withdraw request
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		checks = append(checks, check)
		log.Printf("    %d: ID=%s, Seq=%d, RecipientAddress=%s, Amount=%s, Nullifier=%s", i+1, check.ID, check.Seq, allocation.RecipientAddress, allocation.Amount, nullifier)
	}

	// Create checks
	// If nullifier is empty string, use Omit to set it to NULL in database (to avoid unique constraint violation)
	if hasCommitment {
		// All nullifiers are generated, create normally
		if err := tx.Create(&checks).Error; err != nil {
			log.Printf("❌ Createfailed: %v", err)
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{
				"success":   false,
				"error":     "DatabaseError",
				"message":   "Failed to create checks: " + err.Error(),
				"timestamp": time.Now().Format(time.RFC3339),
			})
			return
		}
		log.Printf("✅ Successfully created %d checks in database (nullifier generated from commitment)", len(checks))
	} else {
		// No commitment provided, omit nullifier to set it to NULL
		if err := tx.Omit("nullifier").Create(&checks).Error; err != nil {
			log.Printf("❌ Createfailed: %v", err)
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{
				"success":   false,
				"error":     "DatabaseError",
				"message":   "Failed to create checks: " + err.Error(),
				"timestamp": time.Now().Format(time.RFC3339),
			})
			return
		}
		log.Printf("✅ Successfully created %d checks in database (nullifier set to NULL, will be set after ZKVM proof)", len(checks))
	}

	// 7. Update checkbook status：with_checkbook → signaturing (proving)
	log.Printf("🔄 Updatecheckbookstatus: '%s''signaturing'", checkbook.Status)
	if err := tx.Model(&checkbook).Update("status", models.CheckbookStatusSignaturing).Error; err != nil {
		log.Printf("❌ Updatestatussignaturingfailed: %v", err)
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "DatabaseError",
			"message":   "Failed to update checkbook status to signaturing: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}
	log.Printf("✅ checkbookstatusUpdatesuccess: status='signaturing'")

	// Databasetransaction
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "DatabaseError",
			"message":   "Failed to commit transaction: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	//  deposit_id Convert to 32 bytes hex (right-aligned, little-endian for uint64 conversion)
	//  Format: uint64 value right-aligned in 32 bytes (last 8 bytes contain the value, left-padded to 8 bytes, then left-padded to 32 bytes)
	//  Example: 18323478 -> 0000000000000000000000000000000000000000000000000000000001179816
	//  This matches Solidity's uint64(uint256(bytes32)) which reads the lowest 8 bytes
	//  Step 1: Convert to 8-byte hex (16 hex chars, left-padded with zeros)
	//  Step 2: Left-pad with zeros to 32 bytes (64 hex chars)
	depositIDHex8Bytes := fmt.Sprintf("%016x", depositID)                                // 8 bytes = 16 hex chars, left-padded
	depositIDHex := strings.Repeat("0", 64-len(depositIDHex8Bytes)) + depositIDHex8Bytes // Left-pad to 64 hex chars (32 bytes)
	log.Printf("🔧 [BuildCommitmentHandler] Converted deposit_id to hex: %s (from int64: %d)", depositIDHex, depositID)
	log.Printf("   DepositID hex breakdown: first 24 bytes (zeros): %s, last 8 bytes (value): %s",
		depositIDHex[:48], depositIDHex[48:])

	// 8. ConvertInfoZKVM API
	// 注意：ZKVM Service 需要简化的 allocations（只有 seq 和 amount）
	// recipient 和 token 信息在 commitment 级别，不在 allocation 级别
	var zkvmAllocations []clients.CommitmentAllocationRequest
	for i, alloc := range req.Allocations {
		// 将 amount 转换为 32 字节 HEX 格式（如果还不是）
		amountHex := alloc.Amount
		if !strings.HasPrefix(amountHex, "0x") {
			// 假设是十进制字符串，转换为 HEX
			amountBig, ok := new(big.Int).SetString(amountHex, 10)
			if !ok {
				c.JSON(http.StatusBadRequest, gin.H{
					"success":   false,
					"error":     "ValidationError",
					"message":   fmt.Sprintf("Invalid amount format for allocation %d: %s", i, alloc.Amount),
					"timestamp": time.Now().Format(time.RFC3339),
				})
				return
			}
			// 转换为 32 字节 HEX（64 个十六进制字符）
			amountHex = fmt.Sprintf("%064x", amountBig)
		} else {
			// 移除 0x 前缀，确保是 64 个字符
			amountHex = strings.TrimPrefix(amountHex, "0x")
			if len(amountHex) < 64 {
				amountHex = strings.Repeat("0", 64-len(amountHex)) + amountHex
			}
		}

		// ZKVM commitment allocations 只需要 seq 和 amount
		zkvmAllocations = append(zkvmAllocations, clients.CommitmentAllocationRequest{
			Seq:    uint8(i),  // 从 0 开始递增
			Amount: amountHex, // 32 字节 HEX 格式（无 0x 前缀）
		})
	}

	// 9.  ZKVM proof service - UseAPI
	zkvmClient := clients.NewZKVMClient(config.AppConfig.ZKVM.BaseURL)

	// 获取链名称（可选，用于提升签名消息可读性）
	var chainName *string
	if req.OwnerAddress.ChainID != 0 {
		chainNameStr := utils.GlobalChainIDMapping.GetChainName(req.OwnerAddress.ChainID)
		if chainNameStr != "" && !strings.HasPrefix(chainNameStr, "Unknown") {
			chainName = &chainNameStr
		}
	}

	// 将 Universal Address 转换为 ZKVM 需要的格式（移除 0x 前缀）
	universalAddrForZKVM := strings.TrimPrefix(universalAddressData, "0x")
	log.Printf("🔧 [ZKVM] Using Universal Address: %s (length: %d bytes)", universalAddrForZKVM, len(universalAddrForZKVM)/2)

	zkvmReq := &clients.BuildCommitmentRequest{
		Allocations: zkvmAllocations, // 简化的 allocations（只有 seq 和 amount）
		DepositID:   depositIDHex,
		Signature: clients.MultichainSignatureRequest{
			ChainID:       req.Signature.ChainID,
			SignatureData: strings.TrimPrefix(req.Signature.SignatureData, "0x"), // 移除 0x 前缀
			PublicKey:     req.Signature.PublicKey,
		},
		OwnerAddress: clients.UniversalAddressRequest{
			ChainID: req.OwnerAddress.ChainID,
			Address: universalAddrForZKVM, // 使用 32 字节 Universal Address，而不是 20 字节 EVM 地址
		},
		TokenKey:  req.TokenSymbol, // 使用 token_key 替代 token_id
		ChainName: chainName,       // 可选的链名称
		Lang:      req.Lang,
	}

	log.Printf("📤 [BuildCommitmentHandler] Sending to ZKVM Service:")
	log.Printf("   DepositID (hex): %s", depositIDHex)
	log.Printf("   DepositID (original int64): %d", depositID)
	log.Printf("   TokenKey: %s", req.TokenSymbol)
	log.Printf("   Lang: %d", req.Lang)

	//  ZKVM requestdata
	if reqData, err := json.MarshalIndent(zkvmReq, "", "  "); err == nil {
		log.Printf("=== BuildCommitment ZKVM Request ===\n%s\n", string(reqData))
	} else {
		log.Printf("Failed to marshal ZKVM request: %v", err)
	}

	// 9.5. 异步模式：将 ZKVM 请求加入队列并立即返回
	// 检查是否应该使用异步模式（可以通过配置或环境变量控制）
	useAsyncMode := true // TODO: 从配置中读取

	if useAsyncMode {
		log.Printf("🚀 [BuildCommitmentHandler] Using async mode: enqueuing ZKVM proof generation task")

		// 从服务容器获取证明生成服务
		// 如果服务容器中没有，创建临时实例（向后兼容）
		var proofGenService *services.ProofGenerationService
		if app.Container != nil && app.Container.ProofGenerationService != nil {
			proofGenService = app.Container.ProofGenerationService
			log.Printf("✅ [BuildCommitmentHandler] Using ProofGenerationService from service container")
		} else {
			// 向后兼容：创建临时实例
			log.Printf("⚠️ [BuildCommitmentHandler] Service container not available, creating temporary ProofGenerationService")
			keyMgmtService := services.NewKeyManagementService(config.AppConfig, db.DB)
			blockchainService := services.NewBlockchainTransactionService(keyMgmtService)
			pushService := services.NewWebSocketPushService()
			proofGenService = services.NewProofGenerationService(
				db.DB,
				zkvmClient,
				blockchainService,
				pushService,
			)
			// 启动服务（临时实例）
			proofGenService.Start()
		}

		// 构建提交上下文
		submissionContext := &services.SubmissionContext{
			ChainID:           chainID,
			DepositID:         depositID,
			TokenKey:          req.TokenSymbol,
			AllocatableAmount: checkbook.AllocatableAmount,
		}

		// 将任务加入队列
		taskID, err := proofGenService.EnqueueProofGeneration(
			checkbook.ID,
			zkvmReq,
			submissionContext,
			100, // 默认优先级
		)
		if err != nil {
			log.Printf("❌ [BuildCommitmentHandler] Failed to enqueue proof generation task: %v", err)
			// Rollback to original status
			db.DB.Model(&checkbook).Update("status", originalStatus)
			c.JSON(http.StatusInternalServerError, gin.H{
				"success":   false,
				"error":     "QueueError",
				"message":   "Failed to enqueue proof generation task: " + err.Error(),
				"timestamp": time.Now().Format(time.RFC3339),
			})
			return
		}

		// 更新状态为 generating_proof
		oldStatus := checkbook.Status
		if err := db.DB.Model(&checkbook).Update("status", models.CheckbookStatusGeneratingProof).Error; err != nil {
			log.Printf("⚠️ [BuildCommitmentHandler] Failed to update status: %v", err)
		} else {
			// 推送 WebSocket 通知
			pushService := services.NewWebSocketPushService()
			if pushErr := pushService.PushCheckbookStatusUpdate(db.DB, checkbook.ID, string(oldStatus), "BuildCommitmentHandler"); pushErr != nil {
				log.Printf("⚠️ [BuildCommitmentHandler] Failed to push WebSocket notification: %v", pushErr)
			}
		}

		// 立即返回，不等待 ZKVM 响应
		var allChecks []models.Check
		if err := db.DB.Where("checkbook_id = ?", checkbook.ID).Find(&allChecks).Error; err != nil {
			log.Printf("⚠️ [BuildCommitmentHandler] Failed to retrieve checks: %v", err)
		}

		log.Printf("✅ [BuildCommitmentHandler] Proof generation task enqueued: TaskID=%s, CheckbookID=%s", taskID, checkbook.ID)
		log.Printf("   Note: ZKVM proof will be generated asynchronously")
		log.Printf("   Status will be updated via WebSocket when proof is generated and submitted")

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"checkbook": checkbook,
			"checks":    allChecks,
			"task_id":   taskID, // 返回任务ID
			"message":   "Proof generation task enqueued, ZKVM proof will be generated asynchronously",
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	// 同步模式：直接调用 ZKVM 服务（原有逻辑）
	log.Printf("🔄 [BuildCommitmentHandler] Using sync mode: calling ZKVM service directly")

	zkvmResp, err := zkvmClient.BuildCommitment(zkvmReq)
	if err != nil {
		// ZKVM Failed - rollback to original status
		log.Printf("❌ [BuildCommitmentHandler] ZKVM service call failed: %v", err)
		log.Printf("   Request details: deposit_id=%s, allocation_count=%d, token_key=%s", depositIDHex, len(zkvmAllocations), req.TokenSymbol)

		// Rollback to original status before starting commitment creation
		db.DB.Model(&checkbook).Update("status", originalStatus)
		log.Printf("🔄 Rolled back checkbook status to '%s' (original) due to ZKVM failure", originalStatus)

		c.JSON(http.StatusBadRequest, gin.H{
			"success":   false,
			"error":     "ZKVMError",
			"message":   "Failed to call ZKVM service: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	if !zkvmResp.Success {
		// ZKVM returned error - rollback to original status
		errorMsg := "Unknown error"
		if zkvmResp.ErrorMessage != nil {
			errorMsg = *zkvmResp.ErrorMessage
		}
		log.Printf("❌ [BuildCommitmentHandler] ZKVM service returned error: %s", errorMsg)

		// Rollback to original status before starting commitment creation
		db.DB.Model(&checkbook).Update("status", originalStatus)
		log.Printf("🔄 Rolled back checkbook status to '%s' (original) due to ZKVM error", originalStatus)

		c.JSON(http.StatusBadRequest, gin.H{
			"success":   false,
			"error":     "ZKVMError",
			"message":   "ZKVM service returned error: " + errorMsg,
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	// 10. Update checkbook status：signaturing → signatured saveproofdata
	log.Printf("🔄 Updatecheckbook: saveproofdata'signatured'status")

	// ParseZKVMreturnPublicValues，commitmentsavedata
	log.Printf("📊 [BuildCommitmentHandler] ========================================")
	log.Printf("📊 [BuildCommitmentHandler] Parsing ZKVM PublicValues...")
	log.Printf("📊 [BuildCommitmentHandler] ========================================")
	log.Printf("📥 [BuildCommitmentHandler] Raw PublicValues from ZKVM:")
	log.Printf("   Hex String: %s", zkvmResp.PublicValues)
	log.Printf("   Length: %d hex chars (%d bytes)", len(zkvmResp.PublicValues), len(zkvmResp.PublicValues)/2)

	// Decode hex to show raw bytes
	cleanHex := strings.TrimPrefix(zkvmResp.PublicValues, "0x")
	if len(cleanHex) > 0 {
		if bytes, err := hex.DecodeString(cleanHex); err == nil {
			showLen := 64
			if len(bytes) < showLen {
				showLen = len(bytes)
			}
			log.Printf("   Raw Bytes (first %d bytes): %x", showLen, bytes[:showLen])
			if len(bytes) > showLen {
				log.Printf("   ... (total %d bytes)", len(bytes))
			}
		} else {
			log.Printf("   ⚠️ Failed to decode hex: %v", err)
		}
	}

	parsedValues, err := parsePublicValuesFromProofHandler(zkvmResp.PublicValues)
	if err != nil {
		log.Printf("❌ [BuildCommitmentHandler] ParseZKVM PublicValues failed: %v", err)
		log.Printf("   Raw PublicValues: %s", zkvmResp.PublicValues)
		// ParseFailed - rollback to original status
		db.DB.Model(&checkbook).Update("status", originalStatus)
		log.Printf("🔄 Rolled back checkbook status to '%s' (original) due to PublicValues parse failure", originalStatus)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to parse ZKVM PublicValues",
			"details": err.Error(),
		})
		return
	}

	log.Printf("✅ [BuildCommitmentHandler] ZKVM PublicValues parsed successfully!")
	log.Printf("📊 [BuildCommitmentHandler] ========================================")
	log.Printf("📊 [BuildCommitmentHandler] Parsed PublicValues Fields:")
	log.Printf("   Commitment (bytes32): %s", parsedValues.Commitment)
	log.Printf("   Owner (address): %s", parsedValues.Owner)
	log.Printf("   TotalAmount (uint256): %s", parsedValues.TotalAmount)
	log.Printf("   DepositID (bytes32): %s", parsedValues.DepositID)
	log.Printf("   CoinType (uint32): %d (SLIP-44)", parsedValues.CoinType)
	log.Printf("   TokenSymbol (string): %s", parsedValues.TokenSymbol)
	log.Printf("   TokenDecimals (uint8): %d", parsedValues.TokenDecimals)
	log.Printf("📊 [BuildCommitmentHandler] ========================================")

	// Note: CheckbookStatusSignatured is an alias for CheckbookStatusReadyForCommitment
	// We should use CheckbookStatusGeneratingProof to indicate proof is being generated,
	// but since proof is already generated, we should proceed to submission
	// Status flow: signaturing → (after ZKVM success) → submitting_commitment
	updates := map[string]interface{}{
		"status":          models.CheckbookStatusSubmittingCommitment, // Update to submitting_commitment (will submit to chain)
		"commitment":      parsedValues.Commitment,                    // UseParsecommitment
		"proof_signature": zkvmResp.ProofData,                         // SP1 proofdata
		"public_values":   zkvmResp.PublicValues,                      // savehexpublic_values
		"updated_at":      time.Now(),
	}

	log.Printf("   savedata:")
	log.Printf("   - status: %s (ZKVM proof generated, will submit to blockchain)", models.CheckbookStatusSubmittingCommitment)
	log.Printf("   - Commitment: %s (calculated by ZKVM with current allocations)", parsedValues.Commitment)
	log.Printf("   - ProofData: %d", len(zkvmResp.ProofData))
	log.Printf("   - PublicValues: %d", len(zkvmResp.PublicValues))

	// ⚠️ WARNING: Check if commitment changed
	if checkbook.Commitment != nil && *checkbook.Commitment != "" {
		oldCommitment := strings.ToLower(strings.TrimPrefix(*checkbook.Commitment, "0x"))
		newCommitment := strings.ToLower(strings.TrimPrefix(parsedValues.Commitment, "0x"))
		if oldCommitment != newCommitment {
			log.Printf("⚠️  WARNING: Commitment changed!")
			log.Printf("   - Old commitment (from DB): %s", *checkbook.Commitment)
			log.Printf("   - New commitment (from ZKVM): %s", parsedValues.Commitment)
			log.Printf("   - This means allocations have changed, and nullifiers generated with old commitment are INVALID.")
			log.Printf("   - Allocations created with old commitment should be deleted and recreated.")
		}
	}

	if err := db.DB.Model(&checkbook).Updates(updates).Error; err != nil {
		log.Printf("❌ Updatecheckbookfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "DatabaseError",
			"message":   "Failed to update checkbook with proof data: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	// 10.5. Update nullifiers for all checks using the new commitment
	log.Printf("🔧 [BuildCommitmentHandler] Updating nullifiers for all checks using new commitment...")
	commitmentHash = common.HexToHash(parsedValues.Commitment)

	// Query all checks for this checkbook
	var allChecksForNullifier []models.Check
	if err := db.DB.Where("checkbook_id = ?", checkbook.ID).Find(&allChecksForNullifier).Error; err != nil {
		log.Printf("⚠️ [BuildCommitmentHandler] Failed to query checks for nullifier update: %v", err)
		// Continue anyway - nullifiers can be updated later
	} else {
		updatedCount := 0
		for _, check := range allChecksForNullifier {
			// Generate nullifier: keccak256(commitment || seq || amount)
			amountBig, ok := new(big.Int).SetString(check.Amount, 10)
			if !ok {
				log.Printf("⚠️ [BuildCommitmentHandler] Failed to parse amount %s for check %s, skipping nullifier update", check.Amount, check.ID)
				continue
			}

			// Prepare data: commitment (32 bytes) || seq (1 byte) || amount (32 bytes)
			seqByte := byte(check.Seq)
			amountBytes := make([]byte, 32)
			amountBig.FillBytes(amountBytes) // Big-endian encoding (U256)

			data := make([]byte, 0, 65) // 32 + 1 + 32 = 65 bytes
			data = append(data, commitmentHash.Bytes()...)
			data = append(data, seqByte)
			data = append(data, amountBytes...)

			// Compute keccak256 hash
			hash := crypto.Keccak256(data)
			nullifier := "0x" + common.Bytes2Hex(hash)

			// Update check with nullifier
			if err := db.DB.Model(&check).Update("nullifier", nullifier).Error; err != nil {
				log.Printf("⚠️ [BuildCommitmentHandler] Failed to update nullifier for check %s: %v", check.ID, err)
			} else {
				updatedCount++
				log.Printf("   ✅ Updated nullifier for check %s (seq=%d): %s", check.ID, check.Seq, nullifier)
			}
		}
		log.Printf("✅ [BuildCommitmentHandler] Updated nullifiers for %d/%d checks", updatedCount, len(allChecksForNullifier))
	}

	// 11. queryUpdate checkbook
	if err := db.DB.First(&checkbook, "id = ?", checkbook.ID).Error; err != nil {
		log.Printf("❌ queryUpdatecheckbookfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "DatabaseError",
			"message":   "Failed to reload checkbook: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	log.Printf("✅ checkbookUpdatesuccess:")
	log.Printf("   ID: %s", checkbook.ID)
	log.Printf("   status: %s", checkbook.Status)
	var commitmentStr string
	if checkbook.Commitment != nil {
		commitmentStr = *checkbook.Commitment
	}
	log.Printf("   Commitment: %s", commitmentStr)
	log.Printf("   ProofSignature: %d", len(checkbook.ProofSignature))

	// 11.5. Submit commitment to blockchain automatically
	log.Printf("🚀 [BuildCommitmentHandler] ========================================")
	log.Printf("🚀 [BuildCommitmentHandler] Starting automatic commitment submission to blockchain...")
	log.Printf("🚀 [BuildCommitmentHandler] ========================================")
	log.Printf("📋 [BuildCommitmentHandler] Submission Parameters:")
	log.Printf("   Checkbook ID: %s", checkbook.ID)
	log.Printf("   Chain ID (SLIP-44): %d", chainID)
	log.Printf("   Local Deposit ID: %d", depositID)
	log.Printf("   Token Key: %s", req.TokenSymbol)
	log.Printf("   Commitment: %s", commitmentStr)
	log.Printf("   Proof Data Length: %d bytes", len(zkvmResp.ProofData))
	log.Printf("   Public Values Length: %d bytes", len(zkvmResp.PublicValues))
	log.Printf("   Allocatable Amount: %s", checkbook.AllocatableAmount)

	// Create CommitmentRequest for blockchain submission
	commitmentReq := &services.CommitmentRequest{
		ChainID:           chainID, // Use SLIP-44 chain ID
		LocalDepositID:    uint64(depositID),
		TokenKey:          req.TokenSymbol, // Use token_key
		CheckbookTokenKey: req.TokenSymbol, // Use same value
		AllocatableAmount: checkbook.AllocatableAmount,
		Commitment:        commitmentStr,
		SP1Proof:          zkvmResp.ProofData,
		PublicValues:      []string{zkvmResp.PublicValues}, // ZKVM public values
		CheckbookID:       checkbook.ID,
	}
	log.Printf("✅ [BuildCommitmentHandler] CommitmentRequest created")

	// Initialize blockchain service
	log.Printf("🔧 [BuildCommitmentHandler] Initializing blockchain service...")
	log.Printf("   Step 1: Creating KeyManagementService...")
	if config.AppConfig == nil {
		log.Printf("❌ [BuildCommitmentHandler] config.AppConfig is nil, cannot initialize blockchain service")
		oldStatus := checkbook.Status
		updateErr := db.DB.Model(&checkbook).Where("id = ?", checkbook.ID).Update("status", models.CheckbookStatusSubmissionFailed).Error
		if updateErr != nil {
			log.Printf("❌ [BuildCommitmentHandler] Failed to update checkbook status to 'submission_failed': %v", updateErr)
		} else {
			log.Printf("✅ [BuildCommitmentHandler] Checkbook status updated to 'submission_failed' successfully")
			// Push WebSocket notification to frontend
			pushService := services.NewWebSocketPushService()
			if pushErr := pushService.PushCheckbookStatusUpdate(db.DB, checkbook.ID, string(oldStatus), "BuildCommitmentHandler"); pushErr != nil {
				log.Printf("⚠️ [BuildCommitmentHandler] Failed to push WebSocket notification: %v", pushErr)
			}
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "ConfigurationError",
			"message":   "Application configuration not loaded",
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}
	keyMgmtService := services.NewKeyManagementService(config.AppConfig, db.DB)
	log.Printf("✅ [BuildCommitmentHandler] KeyManagementService created: %p", keyMgmtService)
	log.Printf("   Step 2: Creating BlockchainTransactionService...")
	blockchainService := services.NewBlockchainTransactionService(keyMgmtService)
	log.Printf("✅ [BuildCommitmentHandler] BlockchainTransactionService created: %p", blockchainService)

	// Initialize blockchain clients
	log.Printf("🔧 [BuildCommitmentHandler] Initializing blockchain clients...")
	log.Printf("   Target Chain ID (SLIP-44): %d", chainID)
	if err := blockchainService.InitializeClients(); err != nil {
		log.Printf("❌ [BuildCommitmentHandler] Failed to initialize blockchain clients: %v", err)
		// Update status to submission_failed
		oldStatus := checkbook.Status
		updateErr := db.DB.Model(&checkbook).Where("id = ?", checkbook.ID).Update("status", models.CheckbookStatusSubmissionFailed).Error
		if updateErr != nil {
			log.Printf("❌ [BuildCommitmentHandler] Failed to update checkbook status to 'submission_failed': %v", updateErr)
		} else {
			log.Printf("✅ [BuildCommitmentHandler] Checkbook status updated to 'submission_failed' successfully")
			// Push WebSocket notification to frontend
			pushService := services.NewWebSocketPushService()
			if pushErr := pushService.PushCheckbookStatusUpdate(db.DB, checkbook.ID, string(oldStatus), "BuildCommitmentHandler"); pushErr != nil {
				log.Printf("⚠️ [BuildCommitmentHandler] Failed to push WebSocket notification: %v", pushErr)
			}
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "BlockchainServiceError",
			"message":   "Failed to initialize blockchain clients: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}
	log.Printf("✅ [BuildCommitmentHandler] Blockchain clients initialized successfully")
	log.Printf("   Initialized clients count: %d", blockchainService.GetClientCount())
	initializedChainIDs := blockchainService.GetAllClientIDs()
	log.Printf("   Initialized Chain IDs (SLIP-44): %v", initializedChainIDs)

	// Submit commitment to blockchain
	log.Printf("📤 [BuildCommitmentHandler] Calling SubmitCommitment to blockchain...")
	log.Printf("   Network: %s (Chain ID: %d)", utils.GlobalChainIDMapping.GetChainName(uint32(chainID)), chainID)
	commitmentResponse, err := blockchainService.SubmitCommitment(commitmentReq)
	if err != nil {
		log.Printf("❌ [BuildCommitmentHandler] Failed to submit commitment to blockchain: %v", err)
		// Update status to submission_failed
		log.Printf("🔄 [BuildCommitmentHandler] Updating checkbook status to 'submission_failed'...")
		log.Printf("   Checkbook ID: %s", checkbook.ID)
		oldStatus := checkbook.Status
		log.Printf("   Current status: %s", oldStatus)

		updateErr := db.DB.Model(&checkbook).Where("id = ?", checkbook.ID).Update("status", models.CheckbookStatusSubmissionFailed).Error
		if updateErr != nil {
			log.Printf("❌ [BuildCommitmentHandler] Failed to update checkbook status to 'submission_failed': %v", updateErr)
			log.Printf("   Checkbook ID: %s", checkbook.ID)
		} else {
			log.Printf("✅ [BuildCommitmentHandler] Checkbook status updated to 'submission_failed' successfully")
			log.Printf("   Checkbook ID: %s", checkbook.ID)

			// Push WebSocket notification to frontend
			log.Printf("📡 [BuildCommitmentHandler] Pushing WebSocket notification for status update...")
			pushService := services.NewWebSocketPushService()

			// Push status update via WebSocket
			if pushErr := pushService.PushCheckbookStatusUpdate(db.DB, checkbook.ID, string(oldStatus), "BuildCommitmentHandler"); pushErr != nil {
				log.Printf("⚠️ [BuildCommitmentHandler] Failed to push WebSocket notification: %v", pushErr)
			} else {
				log.Printf("✅ [BuildCommitmentHandler] WebSocket notification pushed successfully")
			}
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "SubmissionError",
			"message":   "Failed to submit commitment to blockchain: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	txHash := commitmentResponse.TxHash
	queueID := commitmentResponse.QueueID

	// 如果使用队列模式（有 QueueID 但 TxHash 为空），立即返回
	if queueID != "" && txHash == "" {
		log.Printf("✅ [BuildCommitmentHandler] ========================================")
		log.Printf("✅ [BuildCommitmentHandler] Commitment enqueued successfully!")
		log.Printf("✅ [BuildCommitmentHandler] ========================================")
		log.Printf("📝 [BuildCommitmentHandler] Queue Details:")
		log.Printf("   QueueID: %s", queueID)
		log.Printf("   Commitment: %s", commitmentStr)
		log.Printf("   Checkbook ID: %s", checkbook.ID)
		log.Printf("   Chain ID: %d", chainID)
		log.Printf("   Note: Transaction will be submitted asynchronously by queue service")
		log.Printf("   Status will be updated via WebSocket when transaction is confirmed")

		// 更新状态为 submitting_commitment（交易正在队列中等待处理）
		oldStatus := checkbook.Status
		statusUpdates := map[string]interface{}{
			"status":     models.CheckbookStatusSubmittingCommitment,
			"updated_at": time.Now(),
		}
		if err := db.DB.Model(&checkbook).Updates(statusUpdates).Error; err != nil {
			log.Printf("⚠️ [BuildCommitmentHandler] Failed to update status: %v", err)
		} else {
			log.Printf("✅ [BuildCommitmentHandler] Checkbook status updated to 'submitting_commitment'")
			// Push WebSocket notification
			pushService := services.NewWebSocketPushService()
			if pushErr := pushService.PushCheckbookStatusUpdate(db.DB, checkbook.ID, string(oldStatus), "BuildCommitmentHandler"); pushErr != nil {
				log.Printf("⚠️ [BuildCommitmentHandler] Failed to push WebSocket notification: %v", pushErr)
			}
		}

		// 立即返回，不等待交易确认
		var allChecks []models.Check
		if err := db.DB.Where("checkbook_id = ?", checkbook.ID).Find(&allChecks).Error; err != nil {
			log.Printf("⚠️ [BuildCommitmentHandler] Failed to retrieve checks: %v", err)
		}

		c.JSON(http.StatusOK, gin.H{
			"success":           true,
			"checkbook":         checkbook,
			"checks":            allChecks,
			"commitment":        parsedValues.Commitment,
			"proof_data":        zkvmResp.ProofData,
			"public_values":     zkvmResp.PublicValues,
			"allocations_count": zkvmResp.AllocationsCount,
			"total_amount":      zkvmResp.TotalAmount,
			"queue_id":          queueID, // 返回队列ID
			"message":           "Commitment enqueued, transaction will be submitted asynchronously",
			"timestamp":         time.Now().Format(time.RFC3339),
		})
		return
	}

	log.Printf("✅ [BuildCommitmentHandler] ========================================")
	log.Printf("✅ [BuildCommitmentHandler] Commitment submitted to blockchain successfully!")
	log.Printf("✅ [BuildCommitmentHandler] ========================================")
	log.Printf("📝 [BuildCommitmentHandler] Transaction Details:")
	log.Printf("   TxHash: %s", txHash)
	log.Printf("   Commitment: %s", commitmentStr)
	log.Printf("   Checkbook ID: %s", checkbook.ID)
	log.Printf("   Chain ID: %d", chainID)
	if commitmentResponse.GasUsed > 0 {
		log.Printf("   Gas Used: %d", commitmentResponse.GasUsed)
	}

	// Create polling task to wait for blockchain confirmation
	log.Printf("🔧 [BuildCommitmentHandler] Setting up polling task for transaction confirmation...")
	// Note: We need to get UnifiedPollingService instance
	// For now, we'll create it directly (similar to CheckbookService)
	scannerURL := config.GetScannerURL()
	log.Printf("   Scanner URL: %s", scannerURL)
	scannerClient := clients.NewBlockchainScannerClient(scannerURL)
	pushService := services.NewWebSocketPushService()
	pollingService := services.NewUnifiedPollingService(db.DB, pushService, scannerClient)

	// Convert chainID to uint32 for polling task (BSC mainnet = 56, but we use SLIP-44 = 714)
	// Polling service expects EVM chain ID (56 for BSC), not SLIP-44
	var pollingChainID uint32 = 56 // BSC mainnet EVM chain ID
	if chainID == 714 {
		pollingChainID = 56 // BSC
	} else if chainID == 60 {
		pollingChainID = 1 // Ethereum
	} else {
		pollingChainID = uint32(chainID) // Use as-is for other chains
	}
	log.Printf("   Polling Chain ID (EVM): %d (from SLIP-44: %d)", pollingChainID, chainID)

	pollingConfig := models.PollingTaskConfig{
		EntityType:    "checkbook",
		EntityID:      checkbook.ID,
		TaskType:      models.PollingCommitmentConfirmation,
		ChainID:       pollingChainID,
		TxHash:        txHash,
		TargetStatus:  string(models.CheckbookStatusWithCheckbook),
		CurrentStatus: string(models.CheckbookStatusCommitmentPending),
		MaxRetries:    180, // 30 minutes (180 * 10 seconds)
		PollInterval:  10,  // 10 seconds
	}
	log.Printf("   Polling Config: EntityType=%s, EntityID=%s, TaskType=%s",
		pollingConfig.EntityType, pollingConfig.EntityID, pollingConfig.TaskType)
	log.Printf("   Polling Config: MaxRetries=%d, PollInterval=%d seconds",
		pollingConfig.MaxRetries, pollingConfig.PollInterval)

	err = pollingService.CreatePollingTask(pollingConfig)
	if err != nil {
		log.Printf("⚠️ [BuildCommitmentHandler] Failed to create polling task: %v", err)
		// Continue anyway - commitment is already submitted
	} else {
		log.Printf("✅ [BuildCommitmentHandler] Polling task created successfully")
		log.Printf("   Will poll every %d seconds, max %d retries (total ~%d minutes)",
			pollingConfig.PollInterval, pollingConfig.MaxRetries,
			pollingConfig.MaxRetries*pollingConfig.PollInterval/60)
	}

	// Update status to commitment_pending (waiting for blockchain confirmation) and save tx_hash together
	log.Printf("💾 [BuildCommitmentHandler] Updating checkbook status and saving tx_hash...")
	oldStatus := checkbook.Status
	statusUpdates := map[string]interface{}{
		"status":             models.CheckbookStatusCommitmentPending,
		"commitment_tx_hash": txHash,
		"updated_at":         time.Now(),
	}
	log.Printf("   Status: %s → %s", oldStatus, models.CheckbookStatusCommitmentPending)
	log.Printf("   TxHash: %s", txHash)
	if err := db.DB.Model(&checkbook).Updates(statusUpdates).Error; err != nil {
		log.Printf("❌ [BuildCommitmentHandler] Failed to update status and tx_hash: %v", err)
		// Continue anyway - commitment is already submitted
	} else {
		log.Printf("✅ [BuildCommitmentHandler] Checkbook status updated and tx_hash saved")
		log.Printf("   New Status: %s", models.CheckbookStatusCommitmentPending)
		log.Printf("   TxHash: %s", txHash)

		// Push WebSocket notification to frontend
		log.Printf("📡 [BuildCommitmentHandler] Pushing WebSocket notification for commitment submitted...")
		pushService := services.NewWebSocketPushService()
		if pushErr := pushService.PushCheckbookStatusUpdate(db.DB, checkbook.ID, string(oldStatus), "BuildCommitmentHandler"); pushErr != nil {
			log.Printf("⚠️ [BuildCommitmentHandler] Failed to push WebSocket notification: %v", pushErr)
		} else {
			log.Printf("✅ [BuildCommitmentHandler] WebSocket notification pushed successfully")
		}
	}

	// Reload checkbook to get updated status
	if err := db.DB.First(&checkbook, "id = ?", checkbook.ID).Error; err != nil {
		log.Printf("⚠️ [BuildCommitmentHandler] Failed to reload checkbook: %v", err)
	}

	// 12. query
	var allChecks []models.Check
	if err := db.DB.Where("checkbook_id = ?", checkbook.ID).Find(&allChecks).Error; err != nil {
		log.Printf("❌ queryfailed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"error":     "DatabaseError",
			"message":   "Failed to retrieve checks: " + err.Error(),
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	log.Printf("✅ BuildCommitmentprocesscompleted:")
	log.Printf("   Checkbook ID: %s", checkbook.ID)
	log.Printf("   status: %s", checkbook.Status)
	log.Printf("   : %d", len(allChecks))
	log.Printf("   Commitment: %s", parsedValues.Commitment)
	log.Printf("   TxHash: %s", txHash)

	// 13. returnSuccessresponse，and
	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"checkbook":         checkbook,
		"checks":            allChecks,
		"commitment":        parsedValues.Commitment,
		"proof_data":        zkvmResp.ProofData,
		"public_values":     zkvmResp.PublicValues,
		"allocations_count": zkvmResp.AllocationsCount,
		"total_amount":      zkvmResp.TotalAmount,
		"tx_hash":           txHash, // Include transaction hash
		"timestamp":         time.Now().Format(time.RFC3339),
	})
}

// ParsedPublicValuesProofHandler ZKVM PublicValuesParse (proof handler)
type ParsedPublicValuesProofHandler struct {
	Commitment    string `json:"commitment"`     // bytes32 - commitmenthash
	Owner         string `json:"owner"`          // address - Verifyaddress
	TotalAmount   string `json:"total_amount"`   // uint256 - amount
	DepositID     string `json:"deposit_id"`     // bytes32 - depositID
	CoinType      uint32 `json:"coin_type"`      // uint32 - SLIP-44
	TokenSymbol   string `json:"token_symbol"`   // string - Token
	TokenDecimals uint8  `json:"token_decimals"` // uint8 - Tokendecimal places
}

// parsePublicValuesFromProofHandler ParseZKVMPublicValues (proof handler)
func parsePublicValuesFromProofHandler(publicValuesHex string) (*ParsedPublicValuesProofHandler, error) {
	// Use the existing ParseCommitmentPublicValues function from types package
	parsed, err := types.ParseCommitmentPublicValues(publicValuesHex)
	if err != nil {
		return nil, fmt.Errorf("failed to parse public values: %w", err)
	}

	// Convert to ParsedPublicValuesProofHandler format
	result := &ParsedPublicValuesProofHandler{
		Commitment:    parsed.Commitment,
		Owner:         parsed.Owner,
		TotalAmount:   parsed.TotalAmount,
		DepositID:     parsed.DepositID,
		CoinType:      parsed.CoinType,
		TokenSymbol:   parsed.TokenKey, // TokenKey and TokenSymbol are the same
		TokenDecimals: parsed.TokenDecimals,
	}

	return result, nil
}
