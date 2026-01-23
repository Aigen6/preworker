// Package services provides business logic for WithdrawRequest management
package services

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"sort"
	"strings"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/models"
	"go-backend/internal/repository"
	"go-backend/internal/types"
	"go-backend/internal/utils"

	"github.com/ethereum/go-ethereum/common"
	ethtypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrInvalidAllocations       = errors.New("invalid allocations")
	ErrAllocationsNotIdle       = errors.New("allocations must be idle")
	ErrAllocationsDifferentUser = errors.New("allocations belong to different users")
	ErrInvalidIntent            = errors.New("invalid intent")
	ErrCannotCancel             = errors.New("cannot cancel: execute status is success")
	ErrCannotRetryPayout        = errors.New("cannot retry payout: invalid status")
	ErrCannotRetryHook          = errors.New("cannot retry hook: invalid status")
	ErrMaxRetriesExceeded       = errors.New("max retries exceeded")
)

// WithdrawRequestService handles WithdrawRequest business logic
type WithdrawRequestService struct {
	withdrawRepo         repository.WithdrawRequestRepository
	allocationRepo       repository.AllocationRepository
	checkbookRepo        repository.CheckbookRepository
	queueRootRepo        repository.QueueRootRepository // For querying queue roots
	zkvmClient           *clients.ZKVMClient            // Optional: for auto-triggering proof generation
	blockchainService    *BlockchainTransactionService  // Optional: for auto-submitting transactions
	intentService        *IntentService                 // Optional: for building IntentRequest
	pollingService       *UnifiedPollingService         // Optional: for polling transaction confirmation
	proofGenerationService *ProofGenerationService     // Optional: for async proof generation
}

// NewWithdrawRequestService creates a new WithdrawRequestService
func NewWithdrawRequestService(
	withdrawRepo repository.WithdrawRequestRepository,
	allocationRepo repository.AllocationRepository,
	checkbookRepo repository.CheckbookRepository,
	queueRootRepo repository.QueueRootRepository,
) *WithdrawRequestService {
	return &WithdrawRequestService{
		withdrawRepo:   withdrawRepo,
		allocationRepo: allocationRepo,
		checkbookRepo:  checkbookRepo,
		queueRootRepo:  queueRootRepo,
	}
}

// SetZKVMClient sets the ZKVM client for auto-triggering proof generation
func (s *WithdrawRequestService) SetZKVMClient(client *clients.ZKVMClient) {
	s.zkvmClient = client
}

// SetBlockchainService sets the blockchain transaction service for auto-submitting transactions
func (s *WithdrawRequestService) SetBlockchainService(service *BlockchainTransactionService) {
	s.blockchainService = service
}

// SetIntentService sets the intent service for building IntentRequest
// Note: IntentService is defined in the same package, so no import needed
func (s *WithdrawRequestService) SetIntentService(service *IntentService) {
	s.intentService = service
}

// SetPollingService sets the polling service for transaction confirmation
func (s *WithdrawRequestService) SetPollingService(service *UnifiedPollingService) {
	s.pollingService = service
}

// SetProofGenerationService sets the proof generation service for async proof generation
func (s *WithdrawRequestService) SetProofGenerationService(service *ProofGenerationService) {
	s.proofGenerationService = service
}

// updateChecksStatusOnFailure 在提交失败时更新关联的 Check 状态
func (s *WithdrawRequestService) updateChecksStatusOnFailure(ctx context.Context, requestID string, executeStatus models.ExecuteStatus) error {
	// 获取与 WithdrawRequest 关联的所有 Check IDs
	allocations, err := s.allocationRepo.FindByWithdrawRequest(ctx, requestID)
	if err != nil {
		return fmt.Errorf("failed to find allocations for withdraw request %s: %w", requestID, err)
	}

	if len(allocations) == 0 {
		log.Printf("⚠️ [updateChecksStatusOnFailure] No allocations found for WithdrawRequest ID=%s", requestID)
		return nil
	}

	checkIDs := make([]string, 0, len(allocations))
	for _, alloc := range allocations {
		checkIDs = append(checkIDs, alloc.ID)
	}

	log.Printf("🔄 [updateChecksStatusOnFailure] Updating %d checks for WithdrawRequest ID=%s, ExecuteStatus=%s", len(checkIDs), requestID, executeStatus)

	// 根据 executeStatus 决定 Check 的状态
	switch executeStatus {
	case models.ExecuteStatusVerifyFailed:
		// verify_failed：Proof 无效或 nullifier 已使用，不可重试，Check 回退到 idle
		log.Printf("🔄 [updateChecksStatusOnFailure] ExecuteStatus=verify_failed, releasing Checks back to idle status")
		// 使用 ReleaseAllocations 方法，它会同时更新状态为 idle 并清除 withdraw_request_id 关联
		if err := s.allocationRepo.ReleaseAllocations(ctx, checkIDs); err != nil {
			return fmt.Errorf("failed to release allocations: %w", err)
		}
		log.Printf("✅ [updateChecksStatusOnFailure] Released %d checks back to idle status", len(checkIDs))

	case models.ExecuteStatusSubmitFailed:
		// submit_failed：网络/RPC 错误，可以重试
		// 根据业务需求，保持 pending 状态（可以重试）
		log.Printf("ℹ️ [updateChecksStatusOnFailure] ExecuteStatus=submit_failed, Checks remain in pending status (can retry)")
		// 不更新状态，保持 pending，允许重试

	default:
		log.Printf("ℹ️ [updateChecksStatusOnFailure] ExecuteStatus=%s, no Check status update needed", executeStatus)
	}

	return nil
}

// CreateWithdrawRequestInput input for creating a withdraw request
type CreateWithdrawRequestInput struct {
	AllocationIDs []string      // Allocation UUIDs
	Intent        models.Intent // Intent object
	Signature     string        // User signature for ZKVM proof generation
	ChainID       uint32        // Chain ID for signature (SLIP-44)
}

// CreateWithdrawRequest creates a new withdraw request
// Stage 1 initial state: proof_status = pending, execute_status = pending, payout_status = pending
func (s *WithdrawRequestService) CreateWithdrawRequest(ctx context.Context, input *CreateWithdrawRequestInput) (*models.WithdrawRequest, error) {
	// Validate input
	if len(input.AllocationIDs) == 0 {
		return nil, ErrInvalidAllocations
	}

	// Get all allocations
	var allocations []*models.Check
	for _, id := range input.AllocationIDs {
		alloc, err := s.allocationRepo.GetByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("failed to get allocation %s: %w", id, err)
		}
		allocations = append(allocations, alloc)
	}

	// Validate allocations
	if err := s.validateAllocations(allocations); err != nil {
		return nil, err
	}

	// Calculate total amount
	totalAmount := s.calculateTotalAmount(allocations)

	// Generate on-chain request ID = nullifiers[0]
	// Note: Chain contract uses nullifiers[0] as the RequestID for tracking
	// All allocations' nullifiers are included in the ZKVM proof's PublicValues
	// but only the first one is used as the RequestID for event tracking
	onChainRequestID := allocations[0].Nullifier
	if onChainRequestID == "" {
		// If nullifier not set yet, this is an error - all allocations should have nullifiers
		return nil, fmt.Errorf("first allocation (ID: %s) has no nullifier - cannot create withdraw request", allocations[0].ID)
	}

	// Validate that all allocations have nullifiers (required for ZKVM proof)
	for i, alloc := range allocations {
		if alloc.Nullifier == "" {
			return nil, fmt.Errorf("allocation[%d] (ID: %s, seq: %d) has no nullifier - all allocations must have nullifiers for withdraw", i, alloc.ID, alloc.Seq)
		}
	}

	log.Printf("✅ [CreateWithdrawRequest] All %d allocations have nullifiers. Using first nullifier as RequestID: %s", len(allocations), onChainRequestID)

	// Check if a withdraw request with this nullifier already exists
	// Since validateAllocations already ensures allocations are IDLE, if an existing request exists,
	// it must be from a previous failed/cancelled withdraw. We should delete it to allow creating a new one.
	existingRequest, err := s.withdrawRepo.GetByNullifier(ctx, onChainRequestID)
	if err == nil && existingRequest != nil {
		// Existing request found - since allocations are IDLE (validated above),
		// this means the previous request failed/was cancelled and allocations were released.
		// Delete the old request to allow creating a new one with the same nullifier.
		// This is safe because:
		// 1. Allocations are IDLE (not locked/used by any active request)
		// 2. Nullifier can be reused for IDLE allocations
		if err := s.withdrawRepo.Delete(ctx, existingRequest.ID); err != nil {
			return nil, fmt.Errorf("failed to delete existing withdraw request %s: %w", existingRequest.ID, err)
		}
		// Continue to create new request below
	}
	// If err != nil, it means no existing request found (gorm.ErrRecordNotFound), which is fine - proceed with creation

	// Get checkbook to extract owner address
	checkbook, err := s.checkbookRepo.GetByID(ctx, allocations[0].CheckbookID)
	if err != nil {
		return nil, fmt.Errorf("failed to get checkbook: %w", err)
	}

	// Create WithdrawRequest
	request := &models.WithdrawRequest{
		ID:                uuid.New().String(),
		WithdrawNullifier: onChainRequestID, // Use as OnChainRequestID
		OwnerAddress:      checkbook.UserAddress,

		// Intent fields
		IntentType: input.Intent.Type,
		// TokenIdentifier is no longer used for RawToken (token_contract removed from Intent)
		// Keep it for backward compatibility but it's not part of Intent anymore
		AssetID:             input.Intent.AssetID, // For AssetToken: 32-byte asset ID
		Recipient:           input.Intent.Beneficiary,
		TargetSLIP44ChainID: input.Intent.Beneficiary.SLIP44ChainID,
		TargetEVMChainID:    input.Intent.Beneficiary.EVMChainID,
		// PreferredChain is no longer used (removed from Intent)
		Amount: totalAmount,
		// Note: TokenSymbol (RawToken) and TokenKey (AssetToken) are stored in Intent object
		// and will be used when generating ZKVM proof input, but not stored in WithdrawRequest DB fields

		// Stage 1: Proof Generation (initial state)
		ProofStatus: models.ProofStatusPending,

		// Stage 2: On-chain Verification (initial state)
		ExecuteStatus: models.ExecuteStatusPending,

		// Stage 3: Intent Execution (initial state)
		PayoutStatus: models.PayoutStatusPending,

		// Stage 4: Hook Purchase (initial state)
		HookStatus: models.HookStatusNotRequired, // Default: no hook

		// Main status
		Status: string(models.WithdrawStatusCreated),

		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Note: Signature is not stored in WithdrawRequest model directly
	// We'll need to store it temporarily or pass it to autoGenerateProof
	// For now, we'll store it in a temporary field or pass via context
	// TODO: Add Signature field to WithdrawRequest model if needed

	// Store allocation IDs as JSON
	allocationIDsJSON, err := json.Marshal(input.AllocationIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal allocation IDs: %w", err)
	}
	request.AllocationIDs = string(allocationIDsJSON)

	// Create request in database
	if err := s.withdrawRepo.Create(ctx, request); err != nil {
		return nil, fmt.Errorf("failed to create withdraw request: %w", err)
	}

	// Lock allocations (idle -> pending)
	if err := s.allocationRepo.LockForWithdrawal(ctx, input.AllocationIDs, request.ID); err != nil {
		// Rollback: delete the request
		s.withdrawRepo.Delete(ctx, request.ID)
		return nil, fmt.Errorf("failed to lock allocations: %w", err)
	}

	// Auto-trigger ZKVM proof generation (if ZKVM client is available)
	if s.zkvmClient != nil {
		log.Printf("🚀 [CreateWithdrawRequest] Auto-triggering ZKVM proof generation for request: %s", request.ID)
		go s.autoGenerateProofWithSignature(context.Background(), request.ID, input.Signature, input.ChainID)
	} else {
		log.Printf("⚠️ [CreateWithdrawRequest] ZKVM client not set, proof generation will not be auto-triggered")
		log.Printf("   → Use SetZKVMClient() to enable auto-triggering")
	}

	return request, nil
}

// autoGenerateProofWithSignature automatically generates ZKVM proof for a withdraw request
// This is called asynchronously after CreateWithdrawRequest
// signature and chainID are passed separately since they're not stored in WithdrawRequest model
func (s *WithdrawRequestService) autoGenerateProofWithSignature(ctx context.Context, requestID string, signature string, chainID uint32) {
	log.Printf("🔄 [autoGenerateProof] Starting proof generation for request: %s", requestID)

	// Get withdraw request
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		log.Printf("❌ [autoGenerateProof] Failed to get withdraw request %s: %v", requestID, err)
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to get request: %v", err))
		return
	}

	// Check if already processed
	if request.ProofStatus != models.ProofStatusPending {
		log.Printf("⚠️ [autoGenerateProof] Request %s is not in pending status: %s", requestID, request.ProofStatus)
		return
	}

	// Update status to in_progress
	if err := s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusInProgress, "", "", ""); err != nil {
		log.Printf("❌ [autoGenerateProof] Failed to update status to in_progress: %v", err)
		return
	}

	// Get allocations
	allocationIDs, err := s.getAllocationIDs(request)
	if err != nil {
		log.Printf("❌ [autoGenerateProof] Failed to get allocation IDs: %v", err)
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to get allocations: %v", err))
		return
	}

	var allocations []*models.Check
	for _, id := range allocationIDs {
		alloc, err := s.allocationRepo.GetByID(ctx, id)
		if err != nil {
			log.Printf("❌ [autoGenerateProof] Failed to get allocation %s: %v", id, err)
			s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to get allocation %s: %v", id, err))
			return
		}
		allocations = append(allocations, alloc)
	}

	if len(allocations) == 0 {
		log.Printf("❌ [autoGenerateProof] No allocations found for request %s", requestID)
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", "No allocations found")
		return
	}

	// Group allocations by checkbook (support cross-deposit withdrawals)
	checkbookGroups := make(map[string][]*models.Check) // key: checkbookID, value: allocations
	for _, alloc := range allocations {
		checkbookGroups[alloc.CheckbookID] = append(checkbookGroups[alloc.CheckbookID], alloc)
	}

	log.Printf("📋 [autoGenerateProof] Allocations grouped into %d checkbook(s)", len(checkbookGroups))
	for checkbookID, groupAllocs := range checkbookGroups {
		log.Printf("   - Checkbook %s: %d allocations", checkbookID, len(groupAllocs))
	}

	// Get all checkbooks and verify they belong to the same user
	var checkbooks []*models.Checkbook
	var firstCheckbook *models.Checkbook
	firstOwnerAddress := ""
	firstOwnerChainID := uint32(0)

	for checkbookID := range checkbookGroups {
		checkbook, err := s.checkbookRepo.GetByID(ctx, checkbookID)
		if err != nil {
			log.Printf("❌ [autoGenerateProof] Failed to get checkbook %s: %v", checkbookID, err)
			s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to get checkbook %s: %v", checkbookID, err))
			return
		}
		checkbooks = append(checkbooks, checkbook)

		if firstCheckbook == nil {
			firstCheckbook = checkbook
			firstOwnerAddress = strings.ToLower(checkbook.UserAddress.Data)
			firstOwnerChainID = checkbook.UserAddress.SLIP44ChainID
		} else {
			// Verify owner address matches
			ownerAddress := strings.ToLower(checkbook.UserAddress.Data)
			if ownerAddress != firstOwnerAddress || checkbook.UserAddress.SLIP44ChainID != firstOwnerChainID {
				log.Printf("❌ [autoGenerateProof] Checkbook %s belongs to different user: %s (chain=%d) vs %s (chain=%d)",
					checkbookID, checkbook.UserAddress.Data, checkbook.UserAddress.SLIP44ChainID,
					firstCheckbook.UserAddress.Data, firstCheckbook.UserAddress.SLIP44ChainID)
				s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "",
					"All checkbooks must belong to the same user")
				return
			}
		}
	}

	log.Printf("✅ [autoGenerateProof] All %d checkbook(s) belong to the same user: %s (chain=%d)",
		len(checkbooks), firstCheckbook.UserAddress.Data, firstCheckbook.UserAddress.SLIP44ChainID)

	// Check if signature is available
	if signature == "" {
		log.Printf("❌ [autoGenerateProof] Signature not found for request %s", requestID)
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", "Signature is required for proof generation")
		return
	}

	// Verify all checkbooks have commitments
	for _, cb := range checkbooks {
		if cb.Commitment == nil || *cb.Commitment == "" {
			log.Printf("❌ [autoGenerateProof] Checkbook %s has no commitment", cb.ID)
			s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Checkbook %s has no commitment", cb.ID))
			return
		}
	}

	// Get source token symbol (use first checkbook's token, verify all use same token)
	sourceTokenSymbol := ""
	for i, cb := range checkbooks {
		var tokenKey string
		if cb.TokenKey != "" {
			tokenKey = cb.TokenKey
		} else if s.intentService != nil && cb.TokenAddress != "" {
			var rawToken models.IntentRawToken
			err := s.intentService.DB().Where("token_address = ? AND chain_id = ?", strings.ToLower(cb.TokenAddress), cb.SLIP44ChainID).First(&rawToken).Error
			if err == nil && rawToken.Symbol != "" {
				tokenKey = rawToken.Symbol
			} else {
				tokenKey = "USDT" // Fallback
			}
		} else {
			tokenKey = "USDT" // Fallback
		}

		if i == 0 {
			sourceTokenSymbol = tokenKey
			log.Printf("✅ [autoGenerateProof] Using token key from first checkbook: %s", sourceTokenSymbol)
		} else if tokenKey != sourceTokenSymbol {
			log.Printf("⚠️ [autoGenerateProof] Checkbook %s uses different token: %s vs %s (using first)", cb.ID, tokenKey, sourceTokenSymbol)
			// Continue with first checkbook's token (ZKVM may support mixed tokens, but we'll use first for now)
		}
	}

	// Build CommitmentGroups for each checkbook
	// Use a struct to store commitment group with its deposit_id for sorting
	type commitmentGroupWithDepositID struct {
		commitmentGroup types.CommitmentGroupRequest
		depositID       uint64
	}
	commitmentGroupsWithDepositID := make([]commitmentGroupWithDepositID, 0, len(checkbooks))

	for _, checkbook := range checkbooks {
		// Get allocations for this checkbook
		checkbookAllocations := checkbookGroups[checkbook.ID]

		// Get ALL allocations from this checkbook (for computing left/right hashes)
		allCheckbookAllocations, err := s.allocationRepo.FindByCheckbook(ctx, checkbook.ID)
		if err != nil {
			log.Printf("❌ [autoGenerateProof] Failed to get all allocations for checkbook %s: %v", checkbook.ID, err)
			s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to get checkbook allocations: %v", err))
			return
		}

		log.Printf("📋 [autoGenerateProof] Checkbook %s: %d total allocations, %d in withdraw request",
			checkbook.ID, len(allCheckbookAllocations), len(checkbookAllocations))

		// Build CommitmentGroup for this checkbook
		commitmentGroup, err := s.buildCommitmentGroupForCheckbook(ctx, checkbook, checkbookAllocations, allCheckbookAllocations)
		if err != nil {
			log.Printf("❌ [autoGenerateProof] Failed to build CommitmentGroup for checkbook %s: %v", checkbook.ID, err)
			s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to build CommitmentGroup: %v", err))
			return
		}

		commitmentGroupsWithDepositID = append(commitmentGroupsWithDepositID, commitmentGroupWithDepositID{
			commitmentGroup: *commitmentGroup,
			depositID:       checkbook.LocalDepositID,
		})
		log.Printf("✅ [autoGenerateProof] Built CommitmentGroup for checkbook %s (deposit_id: %d): %d allocations",
			checkbook.ID, checkbook.LocalDepositID, len(commitmentGroup.Allocations))
	}

	// Sort commitment groups by deposit_id (ascending)
	// Within the same deposit_id, maintain the original order (which is by checkbook)
	sort.Slice(commitmentGroupsWithDepositID, func(i, j int) bool {
		if commitmentGroupsWithDepositID[i].depositID != commitmentGroupsWithDepositID[j].depositID {
			return commitmentGroupsWithDepositID[i].depositID < commitmentGroupsWithDepositID[j].depositID
		}
		// If deposit_id is the same, maintain original order (by checkbook ID)
		return false
	})

	// Extract sorted commitment groups
	commitmentGroups := make([]types.CommitmentGroupRequest, 0, len(commitmentGroupsWithDepositID))
	for _, cg := range commitmentGroupsWithDepositID {
		commitmentGroups = append(commitmentGroups, cg.commitmentGroup)
	}

	log.Printf("✅ [autoGenerateProof] Built and sorted %d CommitmentGroup(s) by deposit_id for %d checkbook(s)", len(commitmentGroups), len(checkbooks))

	// Build IntentRequest
	intentRequest, err := clients.BuildIntentRequestFromWithdrawRequest(request, s.intentService)
	if err != nil {
		log.Printf("❌ [autoGenerateProof] Failed to build IntentRequest: %v", err)
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to build IntentRequest: %v", err))
		return
	}

	// Get owner address from first checkbook (all checkbooks belong to same user, verified above)
	// Ensure owner address is in 32-byte Universal Address format
	ownerAddressData := firstCheckbook.UserAddress.Data
	
	// Check if address is already in 32-byte format (64 hex chars with or without 0x prefix)
	isUniversalAddr := false
	if strings.HasPrefix(strings.ToLower(ownerAddressData), "0x") {
		isUniversalAddr = len(ownerAddressData) == 66 // 0x + 64 hex chars = 32 bytes
	} else {
		isUniversalAddr = len(ownerAddressData) == 64 // 64 hex chars = 32 bytes
	}

	if !isUniversalAddr {
		// Convert based on chain type
		// SLIP-44 Chain ID 195 = TRON
		if firstCheckbook.UserAddress.SLIP44ChainID == 195 {
			// TRON address conversion
			universalAddr, err := utils.TronToUniversalAddress(ownerAddressData)
			if err != nil {
				log.Printf("❌ [autoGenerateProof] Failed to convert TRON owner address to Universal Address: %v", err)
				s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to convert TRON owner address: %v", err))
				return
			}
			ownerAddressData = universalAddr
		} else {
			// EVM address conversion (most common case)
			universalAddr, err := utils.EvmToUniversalAddress(ownerAddressData)
			if err != nil {
				log.Printf("❌ [autoGenerateProof] Failed to convert EVM owner address to Universal Address: %v", err)
				s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("Failed to convert EVM owner address: %v", err))
				return
			}
			ownerAddressData = universalAddr
		}
		log.Printf("✅ [autoGenerateProof] Converted owner address to 32-byte Universal Address: %s", ownerAddressData)
	}

	ownerAddress := types.UniversalAddressRequest{
		ChainID: firstCheckbook.UserAddress.SLIP44ChainID,
		Address: ownerAddressData, // Now guaranteed to be 32-byte format
	}

	// Build signature request
	// Use chain ID from input (passed from frontend)
	signatureRequest := types.MultichainSignatureRequest{
		ChainID:       chainID, // Use chain ID from input (frontend)
		SignatureData: signature,
		PublicKey:     nil, // Optional
	}

	// Build WithdrawProofRequest with multiple CommitmentGroups (supporting cross-deposit withdrawals)
	zkvmRequest := &clients.WithdrawProofRequest{
		CommitmentGroups:  commitmentGroups, // Multiple CommitmentGroups, one per checkbook
		OwnerAddress:      ownerAddress,
		Intent:            *intentRequest,
		Signature:         signatureRequest,
		SourceTokenSymbol: sourceTokenSymbol,
		Lang:              0,   // Default to English
		SourceChainName:   nil, // Optional
		TargetChainName:   nil, // Optional
		MinOutput:         nil, // Optional
	}

	// 检查是否使用异步队列模式
	useAsyncMode := s.proofGenerationService != nil
	if useAsyncMode {
		log.Printf("🚀 [autoGenerateProof] Using async mode: enqueuing ZKVM proof generation task for request %s", requestID)

		// 构建提交上下文（用于后续链上提交）
		// 使用第一个 allocation 和 checkbook 的信息
		firstAllocation := allocations[0]
		firstCheckbook := checkbooks[0]
		
		// 获取 queue root（从 request 中获取，如果为空则使用空字符串）
		queueRoot := request.QueueRoot
		if queueRoot == "" {
			// 如果 request 中没有 queue root，可以在后续流程中获取
			log.Printf("⚠️ [autoGenerateProof] Queue root is empty, will be set during submission")
		}

		// 确保 recipient 有 0x 前缀且是 32 字节格式（66 字符：0x + 64 hex）
		recipient := request.Recipient.Data
		// 移除可能存在的 0x 前缀，统一处理
		recipient = strings.TrimPrefix(recipient, "0x")
		// 补齐到 32 字节（64 hex chars）
		if len(recipient) < 64 {
			recipient = strings.Repeat("0", 64-len(recipient)) + recipient
		} else if len(recipient) > 64 {
			// 如果超过 64 字符，截取后 64 个字符
			recipient = recipient[len(recipient)-64:]
		}
		// 添加 0x 前缀
		recipient = "0x" + recipient

		submissionContext := &WithdrawSubmissionContext{
			ChainID:           int(firstCheckbook.SLIP44ChainID),
			CheckbookID:       firstCheckbook.ID,
			CheckID:           firstAllocation.ID,
			WithdrawRequestID: requestID,
			TokenKey:          sourceTokenSymbol,
			Recipient:         recipient,
			Amount:            request.Amount,
			NullifierHash:     request.WithdrawNullifier,
			QueueRoot:         queueRoot,
		}

		// 将任务加入队列
		taskID, err := s.proofGenerationService.EnqueueWithdrawProofGeneration(
			requestID,
			zkvmRequest,
			submissionContext,
			100, // 默认优先级
		)
		if err != nil {
			log.Printf("❌ [autoGenerateProof] Failed to enqueue proof generation task: %v", err)
			// 回退到同步模式
			log.Printf("🔄 [autoGenerateProof] Falling back to sync mode")
			useAsyncMode = false
		} else {
			log.Printf("✅ [autoGenerateProof] Proof generation task enqueued: TaskID=%s, WithdrawRequestID=%s", taskID, requestID)
			log.Printf("   Note: ZKVM proof will be generated asynchronously")
			log.Printf("   Status will be updated via WebSocket when proof is generated and submitted")
			return // 立即返回，不等待 ZKVM 响应
		}
	}

	// 同步模式：直接调用 ZKVM 服务（原有逻辑，向后兼容）
	if !useAsyncMode {
		log.Printf("🔄 [autoGenerateProof] Using sync mode: calling ZKVM service directly for request %s", requestID)
	}

	// Call ZKVM service to generate proof
	log.Printf("📤 [autoGenerateProof] Calling ZKVM GenerateWithdrawProofV2 for request %s", requestID)
	zkvmResponse, err := s.zkvmClient.GenerateWithdrawProofV2(zkvmRequest)
	if err != nil {
		log.Printf("❌ [autoGenerateProof] ZKVM proof generation failed: %v", err)
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("ZKVM proof generation failed: %v", err))
		return
	}

	if !zkvmResponse.Success {
		errorMsg := "Unknown error"
		if zkvmResponse.ErrorMessage != nil {
			errorMsg = *zkvmResponse.ErrorMessage
		}
		log.Printf("❌ [autoGenerateProof] ZKVM service returned error: %s", errorMsg)
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", fmt.Sprintf("ZKVM service error: %s", errorMsg))
		return
	}

	// Save proof to database
	// Note: zkvmResponse.PublicValues is the encoded public values returned by ZKVM service
	// This will be used directly in ExecuteWithdraw to submit to blockchain
	log.Printf("✅ [autoGenerateProof] ZKVM proof generated successfully for request %s", requestID)
	log.Printf("   ProofData length: %d bytes", len(zkvmResponse.ProofData))
	log.Printf("   PublicValues length: %d bytes (from ZKVM)", len(zkvmResponse.PublicValues))

	// Validate that we have the required data
	if zkvmResponse.ProofData == "" {
		log.Printf("❌ [autoGenerateProof] ProofData is empty from ZKVM response")
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", "ProofData is empty from ZKVM response")
		return
	}
	if zkvmResponse.PublicValues == "" {
		log.Printf("❌ [autoGenerateProof] PublicValues is empty from ZKVM response")
		s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusFailed, "", "", "PublicValues is empty from ZKVM response")
		return
	}

	// ========== 验证 ZKVM 返回的 nullifiers ==========
	// 这是关键验证：确保 ZKVM 返回的 nullifiers 与数据库中的一致
	log.Printf("\n🔍 [autoGenerateProof] ========================================")
	log.Printf("🔍 [autoGenerateProof] 验证 ZKVM 返回的 nullifiers")
	log.Printf("🔍 [autoGenerateProof] ========================================")

	if len(zkvmResponse.Nullifiers) == 0 {
		log.Printf("⚠️ [autoGenerateProof] ZKVM response has no nullifiers array")
		log.Printf("   This may indicate an issue with the ZKVM service response format")
	} else {
		log.Printf("📋 [autoGenerateProof] ZKVM returned %d nullifiers:", len(zkvmResponse.Nullifiers))
		for i, nullifier := range zkvmResponse.Nullifiers {
			log.Printf("   [%d] %s", i, nullifier)
		}

		// 验证第一个 nullifier（这是 withdraw_nullifier，用于链上事件追踪）
		zkvmFirstNullifier := zkvmResponse.GetNullifier()
		expectedNullifier := request.WithdrawNullifier

		log.Printf("🔍 [autoGenerateProof] 验证第一个 nullifier:")
		log.Printf("   ZKVM 返回: %s", zkvmFirstNullifier)
		log.Printf("   数据库中的: %s", expectedNullifier)

		// 标准化格式（移除大小写差异）
		zkvmNullifierNormalized := strings.ToLower(strings.TrimPrefix(zkvmFirstNullifier, "0x"))
		expectedNullifierNormalized := strings.ToLower(strings.TrimPrefix(expectedNullifier, "0x"))

		if zkvmNullifierNormalized != expectedNullifierNormalized {
			log.Printf("❌ [autoGenerateProof] Nullifier 不匹配！")
			log.Printf("   ZKVM 返回的 nullifier 与数据库中的不一致")
			log.Printf("   这可能导致链上事件无法匹配到 WithdrawRequest")
			log.Printf("   可能原因：")
			log.Printf("     1. Go Backend 生成的 nullifier 与 Rust 生成的不一致")
			log.Printf("     2. Commitment 计算不一致")
			log.Printf("     3. Amount 或 seq 编码不一致")
			log.Printf("   ⚠️  继续保存 proof，但可能会在链上执行时失败")

			// 记录详细的调试信息
			log.Printf("🔍 [autoGenerateProof] 调试信息：")
			log.Printf("   WithdrawRequest ID: %s", request.ID)
			log.Printf("   第一个 Allocation ID: %s", allocations[0].ID)
			log.Printf("   第一个 Allocation Seq: %d", allocations[0].Seq)
			log.Printf("   第一个 Allocation Amount: %s", allocations[0].Amount)
			log.Printf("   第一个 Allocation Nullifier (DB): %s", allocations[0].Nullifier)
			if len(checkbooks) > 0 && checkbooks[0].Commitment != nil {
				log.Printf("   第一个 Checkbook Commitment Hash: %s", *checkbooks[0].Commitment)
			}

			// 尝试重新计算 nullifier 来对比
			// 注意：这里需要确保使用相同的 commitment 和 allocation 数据
			log.Printf("   ⚠️  建议检查 Go 和 Rust 的 nullifier 生成逻辑是否完全一致")
		} else {
			log.Printf("✅ [autoGenerateProof] Nullifier 验证通过！")
		}

		// 验证所有 allocations 的 nullifiers
		if len(zkvmResponse.Nullifiers) != len(allocations) {
			log.Printf("⚠️ [autoGenerateProof] Nullifiers 数量不匹配：")
			log.Printf("   ZKVM 返回: %d 个", len(zkvmResponse.Nullifiers))
			log.Printf("   Allocations: %d 个", len(allocations))
		} else {
			log.Printf("✅ [autoGenerateProof] Nullifiers 数量匹配：%d 个", len(zkvmResponse.Nullifiers))

			// 验证每个 allocation 的 nullifier
			mismatchCount := 0
			for i, alloc := range allocations {
				if i < len(zkvmResponse.Nullifiers) {
					zkvmNullifier := strings.ToLower(strings.TrimPrefix(zkvmResponse.Nullifiers[i], "0x"))
					dbNullifier := strings.ToLower(strings.TrimPrefix(alloc.Nullifier, "0x"))

					if zkvmNullifier != dbNullifier {
						mismatchCount++
						log.Printf("   ⚠️ [%d] Allocation %s nullifier 不匹配:", i, alloc.ID)
						log.Printf("      ZKVM: %s", zkvmResponse.Nullifiers[i])
						log.Printf("      DB:   %s", alloc.Nullifier)
					}
				}
			}

			if mismatchCount > 0 {
				log.Printf("❌ [autoGenerateProof] 发现 %d 个 nullifier 不匹配", mismatchCount)
			} else {
				log.Printf("✅ [autoGenerateProof] 所有 nullifiers 验证通过！")
			}
		}
	}
	log.Printf("🔍 [autoGenerateProof] ========================================\n")

	// Log preview of data being saved
	if len(zkvmResponse.ProofData) > 100 {
		log.Printf("   ProofData preview: %s...", zkvmResponse.ProofData[:100])
	} else {
		log.Printf("   ProofData: %s", zkvmResponse.ProofData)
	}
	if len(zkvmResponse.PublicValues) > 100 {
		log.Printf("   PublicValues preview: %s...", zkvmResponse.PublicValues[:100])
	} else {
		log.Printf("   PublicValues: %s", zkvmResponse.PublicValues)
	}

	if err := s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusCompleted, zkvmResponse.ProofData, zkvmResponse.PublicValues, ""); err != nil {
		log.Printf("❌ [autoGenerateProof] Failed to save proof: %v", err)
		return
	}

	log.Printf("✅ [autoGenerateProof] Proof and PublicValues saved to database successfully")

	// ========== 更新 withdraw_nullifier 为 public_values 中的第一个 nullifier ==========
	// 这是关键修复：链上的 request_id 是 public_values[0]（第一个 nullifier）
	// 需要确保 withdraw_nullifier 与链上的 request_id 一致
	log.Printf("🔍 [autoGenerateProof] 解析 public_values 以获取第一个 nullifier...")
	parsedPublicValues, err := types.ParseWithdrawPublicValues(zkvmResponse.PublicValues)
	if err != nil {
		log.Printf("⚠️ [autoGenerateProof] 无法解析 public_values: %v", err)
		log.Printf("   继续使用原有的 withdraw_nullifier，但链上事件可能无法匹配")
	} else if len(parsedPublicValues.Nullifiers) > 0 {
		firstNullifierFromPublicValues := parsedPublicValues.Nullifiers[0]
		currentNullifier := request.WithdrawNullifier

		// 标准化格式进行比较
		firstNullifierNormalized := strings.ToLower(strings.TrimPrefix(firstNullifierFromPublicValues, "0x"))
		currentNullifierNormalized := strings.ToLower(strings.TrimPrefix(currentNullifier, "0x"))

		if firstNullifierNormalized != currentNullifierNormalized {
			log.Printf("🔄 [autoGenerateProof] 检测到 withdraw_nullifier 不匹配，需要更新：")
			log.Printf("   当前值（allocation_ids[0]）: %s", currentNullifier)
			log.Printf("   public_values[0]（链上 request_id）: %s", firstNullifierFromPublicValues)
			log.Printf("   正在更新 withdraw_nullifier 为 public_values[0]...")

			if err := s.withdrawRepo.UpdateWithdrawNullifier(ctx, requestID, firstNullifierFromPublicValues); err != nil {
				log.Printf("❌ [autoGenerateProof] 更新 withdraw_nullifier 失败: %v", err)
				log.Printf("   ⚠️  链上事件可能无法匹配到 WithdrawRequest")
			} else {
				log.Printf("✅ [autoGenerateProof] withdraw_nullifier 已更新为 public_values[0]")
				log.Printf("   现在 withdraw_nullifier 与链上的 request_id 一致")
			}
		} else {
			log.Printf("✅ [autoGenerateProof] withdraw_nullifier 与 public_values[0] 一致，无需更新")
		}
	} else {
		log.Printf("⚠️ [autoGenerateProof] public_values 中没有 nullifiers")
	}

	// Update main status
	// ⚠️ CRITICAL: Do NOT use Update() with the request object from GetByID!
	// Update() uses Save() which will overwrite ALL fields, including proof and public_values
	// If GetByID didn't load these fields correctly, Save() will clear them!
	// Instead, only update the status field using Updates()
	request.ProofStatus = models.ProofStatusCompleted
	request.UpdateMainStatus()

	// Use Updates() to only update status field, not the entire record
	// This prevents accidentally clearing proof and public_values
	if err := s.withdrawRepo.UpdateStatus(ctx, request.ID, request.Status); err != nil {
		log.Printf("❌ [autoGenerateProof] Failed to update main status: %v", err)
		return
	}

	log.Printf("✅ [autoGenerateProof] Main status updated to: %s (using UpdateStatus to avoid clearing proof/public_values)", request.Status)

	log.Printf("✅ [autoGenerateProof] Proof saved successfully, auto-triggering ExecuteWithdraw for request %s", requestID)

	// Auto-trigger Stage 2: Execute on-chain verification
	if err := s.ExecuteWithdraw(ctx, requestID); err != nil {
		log.Printf("⚠️ [autoGenerateProof] ExecuteWithdraw failed (proof was saved successfully): %v", err)
		// Don't fail - proof is already saved, frontend can retry ExecuteWithdraw
		return
	}

	log.Printf("✅ [autoGenerateProof] Full flow completed successfully for request %s", requestID)
}

// SubmitProof submits ZK proof for the withdraw request (Stage 1)
// After proof is saved, automatically triggers Stage 2 (on-chain verification)
func (s *WithdrawRequestService) SubmitProof(ctx context.Context, requestID string, proof string, publicValues string) error {
	// Update proof status to in_progress
	if err := s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusInProgress, "", "", ""); err != nil {
		return err
	}

	// In real implementation, this would trigger ZKVM proof generation
	// For now, we'll simulate success
	// TODO: Call ZKVM service to generate proof

	// On success, update to completed
	if err := s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusCompleted, proof, publicValues, ""); err != nil {
		return err
	}

	// Update main status
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}
	request.UpdateMainStatus()
	if err := s.withdrawRepo.Update(ctx, request); err != nil {
		return err
	}

	// Auto-trigger Stage 2: Execute on-chain verification
	// This is a backend-automated flow, frontend only needs to call SubmitProof once
	if err := s.ExecuteWithdraw(ctx, requestID); err != nil {
		// Don't fail the entire operation - proof is already saved successfully
		// Frontend can retry using POST /api/v1/withdrawals/:id/execute
		// or backend event listener will retry automatically
		// Return nil to indicate proof submission was successful
		return nil
	}

	return nil
}

// ExecuteWithdraw executes on-chain verification (Stage 2)
// Can be called:
// 1. Automatically after SubmitProof succeeds
// 2. Manually by frontend using POST /api/v1/withdrawals/:id/execute (retry)
// 3. By event listener for automatic retry
func (s *WithdrawRequestService) ExecuteWithdraw(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Validate: proof must be completed
	// If proof_status is not completed but we have proof data, update it to completed
	if request.ProofStatus != models.ProofStatusCompleted {
		if request.Proof != "" && request.PublicValues != "" {
			// We have proof data, so proof generation was successful, just status wasn't updated
			log.Printf("⚠️ [ExecuteWithdraw] proof_status is %s but proof data exists, updating to completed", request.ProofStatus)
			if err := s.withdrawRepo.UpdateProofStatus(ctx, requestID, models.ProofStatusCompleted, request.Proof, request.PublicValues, ""); err != nil {
				log.Printf("❌ [ExecuteWithdraw] Failed to update proof_status to completed: %v", err)
				return fmt.Errorf("failed to update proof status: %w", err)
			}
			log.Printf("✅ [ExecuteWithdraw] Updated proof_status to completed before submission")
		} else {
			// No proof data, cannot proceed
			return fmt.Errorf("proof not completed (status: %s) and no proof data available", request.ProofStatus)
		}
	}

	// Check if already successfully executed (prevent duplicate execution)
	if request.ExecuteStatus == models.ExecuteStatusSuccess {
		return errors.New("withdraw already executed successfully")
	}

	// Check if verification already failed (cannot retry)
	if request.ExecuteStatus == models.ExecuteStatusVerifyFailed {
		return errors.New("verification failed permanently, cannot retry - please cancel the request")
	}

	// Check if blockchain service is available
	if s.blockchainService == nil {
		log.Printf("⚠️ [ExecuteWithdraw] Blockchain service not set, cannot submit transaction")
		log.Printf("   Service instance: %p", s)
		log.Printf("   blockchainService field: %p", s.blockchainService)
		log.Printf("   → Use SetBlockchainService() to enable auto-submission")
		log.Printf("   → Check if InitializeClients() was called successfully during startup")
		// Update to submit_failed so user can retry when service is available
		if err := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusSubmitFailed, "", nil, "Blockchain service not configured"); err != nil {
			return err
		}
		return fmt.Errorf("blockchain service not configured")
	}

	// Verify blockchain service has initialized clients
	clientCount := s.blockchainService.GetClientCount()
	log.Printf("🔍 [ExecuteWithdraw] Blockchain service available, client count: %d", clientCount)
	if clientCount == 0 {
		log.Printf("⚠️ [ExecuteWithdraw] Blockchain service has no initialized clients")
		log.Printf("   → InitializeClients() may have failed or not been called")
		// Try to initialize clients now
		if err := s.blockchainService.InitializeClients(); err != nil {
			log.Printf("❌ [ExecuteWithdraw] Failed to initialize clients: %v", err)
			if updateErr := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusSubmitFailed, "", nil, fmt.Sprintf("Failed to initialize blockchain clients: %v", err)); updateErr != nil {
				return updateErr
			}
			return fmt.Errorf("failed to initialize blockchain clients: %w", err)
		}
		log.Printf("✅ [ExecuteWithdraw] Successfully initialized blockchain clients")
	}

	// Get allocations to extract checkbook and token information
	allocationIDs, err := s.getAllocationIDs(request)
	if err != nil {
		return fmt.Errorf("failed to get allocation IDs: %w", err)
	}

	if len(allocationIDs) == 0 {
		return fmt.Errorf("no allocations found for withdraw request")
	}

	// Get first allocation to get checkbook info
	firstAllocation, err := s.allocationRepo.GetByID(ctx, allocationIDs[0])
	if err != nil {
		return fmt.Errorf("failed to get first allocation: %w", err)
	}

	// Get checkbook to get chain ID and token info
	checkbook, err := s.checkbookRepo.GetByID(ctx, firstAllocation.CheckbookID)
	if err != nil {
		return fmt.Errorf("failed to get checkbook: %w", err)
	}

	// Get chain ID from checkbook (SLIP-44)
	chainID := int(checkbook.SLIP44ChainID)

	// Get token key from checkbook
	tokenKey := "USDT" // Default
	if checkbook.TokenKey != "" {
		tokenKey = checkbook.TokenKey
		log.Printf("📋 [retry] Using token key from Checkbook: %s", tokenKey)
	} else {
		log.Printf("⚠️ [retry] Checkbook.TokenKey is empty, using default: %s", tokenKey)
	}

	// Build recipient address (32-byte Universal Address)
	// 确保 recipient 有 0x 前缀且是 32 字节格式（66 字符：0x + 64 hex）
	recipientHex := request.Recipient.Data
	// 移除可能存在的 0x 前缀，统一处理
	recipientHex = strings.TrimPrefix(recipientHex, "0x")
	// 补齐到 32 字节（64 hex chars）
	if len(recipientHex) < 64 {
		recipientHex = strings.Repeat("0", 64-len(recipientHex)) + recipientHex
	} else if len(recipientHex) > 64 {
		// 如果超过 64 字符，截取后 64 个字符
		recipientHex = recipientHex[len(recipientHex)-64:]
	}
	// 添加 0x 前缀
	recipientHex = "0x" + recipientHex

	// Debug: Check if proof and public values are loaded correctly
	log.Printf("🔍 [ExecuteWithdraw] Debug - Checking request data:")
	log.Printf("   request.Proof length: %d bytes", len(request.Proof))
	log.Printf("   request.PublicValues length: %d bytes", len(request.PublicValues))
	if len(request.PublicValues) > 0 {
		previewLen := 100
		if len(request.PublicValues) < previewLen {
			previewLen = len(request.PublicValues)
		}
		log.Printf("   request.PublicValues preview: %s...", request.PublicValues[:previewLen])
	}
	if len(request.Proof) > 0 {
		previewLen := 100
		if len(request.Proof) < previewLen {
			previewLen = len(request.Proof)
		}
		log.Printf("   request.Proof preview: %s...", request.Proof[:previewLen])
	}

	// Build blockchain transaction request
	// Note: Using the WithdrawRequest type from blockchain_transaction_service (same package)
	// request.PublicValues is saved from ZKVM response in autoGenerateProofWithSignature
	// It's the encoded public values that ZKVM service returns, ready to use in executeWithdraw
	blockchainReq := &WithdrawRequest{
		ChainID:           chainID,
		NullifierHash:     request.WithdrawNullifier, // Use WithdrawNullifier as nullifier
		Recipient:         recipientHex,
		Amount:            request.Amount,
		QueueRoot:         request.QueueRoot,
		OriginalProofHash: "",                      // Not used in new signature
		SP1Proof:          request.Proof,           // ZKVM proof data (from zkvmResponse.ProofData)
		PublicValues:      request.PublicValues,    // ZKVM public values (encoded, from zkvmResponse.PublicValues)
		Token:             request.TokenIdentifier, // Token contract address (for RawToken)
		TokenKey:          tokenKey,
		CheckbookID:       checkbook.ID,
		CheckID:           firstAllocation.ID,
	}

	// Validate that proof and public values are present
	if blockchainReq.SP1Proof == "" {
		return fmt.Errorf("proof data is empty - cannot submit transaction")
	}
	if blockchainReq.PublicValues == "" {
		return fmt.Errorf("public values is empty - cannot submit transaction. Proof status: %s", request.ProofStatus)
	}

	// Update execute status to submitted BEFORE submitting transaction
	log.Printf("🔄 [ExecuteWithdraw] Updating execute_status to 'submitted' for request %s", requestID)
	log.Printf("   Current execute_status: %s", request.ExecuteStatus)
	if err := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusSubmitted, "", nil, ""); err != nil {
		log.Printf("❌ [ExecuteWithdraw] Failed to update execute_status to 'submitted': %v", err)
		return fmt.Errorf("failed to update execute status to submitted: %w", err)
	}
	log.Printf("✅ [ExecuteWithdraw] Successfully updated execute_status to 'submitted' for request %s", requestID)

	// Verify the update by querying the database
	verifyRequest, verifyErr := s.withdrawRepo.GetByID(ctx, requestID)
	if verifyErr != nil {
		log.Printf("⚠️ [ExecuteWithdraw] Failed to verify update: %v", verifyErr)
	} else {
		log.Printf("🔍 [ExecuteWithdraw] Verification: execute_status=%s, proof_status=%s", verifyRequest.ExecuteStatus, verifyRequest.ProofStatus)
	}

	// Submit transaction to blockchain
	// Note: blockchainReq.PublicValues is from ZKVM response (saved in autoGenerateProofWithSignature)
	// It's the encoded public values that ZKVM service returns, ready to use in executeWithdraw
	log.Printf("📤 [ExecuteWithdraw] Submitting executeWithdraw transaction for request %s", requestID)
	log.Printf("   Using PublicValues from ZKVM: %d bytes", len(blockchainReq.PublicValues))
	log.Printf("   Using Proof from ZKVM: %d bytes", len(blockchainReq.SP1Proof))
	withdrawResponse, err := s.blockchainService.SubmitWithdraw(blockchainReq)
	if err != nil {
		// Check if it's a contract revert (proof invalid, nullifier used, etc.)
		errorMsg := err.Error()
		isContractRevert := strings.Contains(errorMsg, "execution reverted") ||
			strings.Contains(errorMsg, "revert") ||
			strings.Contains(errorMsg, "invalid proof") ||
			strings.Contains(errorMsg, "nullifier already used")

		if isContractRevert {
			// Proof invalid or nullifier already used - cannot retry
			log.Printf("❌ [ExecuteWithdraw] Contract revert (verification failed): %v", err)
			if updateErr := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusVerifyFailed, "", nil, errorMsg); updateErr != nil {
				log.Printf("❌ [ExecuteWithdraw] Failed to update status to verify_failed: %v", updateErr)
			}
			// 立即更新关联的 Check 状态为 idle（释放 allocations，因为验证失败不可重试）
			if updateErr := s.updateChecksStatusOnFailure(ctx, requestID, models.ExecuteStatusVerifyFailed); updateErr != nil {
				log.Printf("⚠️ [ExecuteWithdraw] Failed to update checks status: %v", updateErr)
			}
			return fmt.Errorf("verification failed (contract revert): %w", err)
		} else {
			// Network/RPC error - can retry
			log.Printf("⚠️ [ExecuteWithdraw] Network/RPC error (can retry): %v", err)
			if updateErr := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusSubmitFailed, "", nil, errorMsg); updateErr != nil {
				log.Printf("❌ [ExecuteWithdraw] Failed to update status to submit_failed: %v", updateErr)
			}
			// 立即更新关联的 Check 状态（提交失败，但可以重试，保持 pending 或标记为失败）
			// 根据业务逻辑，submit_failed 可以重试，所以保持 pending 状态
			// 但如果需要明确标记失败，可以更新 Check 状态
			if updateErr := s.updateChecksStatusOnFailure(ctx, requestID, models.ExecuteStatusSubmitFailed); updateErr != nil {
				log.Printf("⚠️ [ExecuteWithdraw] Failed to update checks status: %v", updateErr)
			}
			return fmt.Errorf("submit failed (network error): %w", err)
		}
	}

	// Transaction submitted successfully
	txHash := withdrawResponse.TxHash
	log.Printf("✅ [ExecuteWithdraw] Transaction submitted successfully: %s", txHash)

	// Update status with TX hash (will update to success/failed after confirmation)
	if err := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusSubmitted, txHash, nil, ""); err != nil {
		log.Printf("⚠️ [ExecuteWithdraw] Failed to update TX hash: %v", err)
		// Don't return error - transaction was submitted successfully
	}

	// Check transaction status immediately (quick check, then create polling task)
	log.Printf("⏳ [ExecuteWithdraw] Checking transaction status: %s", txHash)

	// Get blockchain client to check transaction status
	const MANAGEMENT_CHAIN_ID = 714 // BSC chain ID
	client, exists := s.blockchainService.GetClient(MANAGEMENT_CHAIN_ID)
	if !exists {
		log.Printf("⚠️ [ExecuteWithdraw] Blockchain client not found for chain %d", MANAGEMENT_CHAIN_ID)
		log.Printf("   Creating polling task to check transaction status periodically")

		// Create polling task even without client (will use polling service's client)
		if s.pollingService != nil {
			pollingConfig := models.PollingTaskConfig{
				EntityType:    "withdraw_request",
				EntityID:      requestID,
				TaskType:      models.PollingWithdrawExecute,
				ChainID:       MANAGEMENT_CHAIN_ID,
				TxHash:        txHash,
				TargetStatus:  string(models.ExecuteStatusSuccess),
				CurrentStatus: string(models.ExecuteStatusSubmitted),
				MaxRetries:    180, // 30 minutes (180 * 10 seconds)
				PollInterval:  10,  // 10 seconds
			}

			if err := s.pollingService.CreatePollingTask(pollingConfig); err != nil {
				log.Printf("⚠️ [ExecuteWithdraw] Failed to create polling task: %v", err)
				log.Printf("   Transaction will be checked by event listener when confirmed")
			} else {
				log.Printf("✅ [ExecuteWithdraw] Created polling task to monitor transaction: %s", txHash)
				log.Printf("   Will poll every %d seconds, max %d retries (total ~%d minutes)",
					pollingConfig.PollInterval, pollingConfig.MaxRetries,
					pollingConfig.MaxRetries*pollingConfig.PollInterval/60)
			}
		} else {
			log.Printf("⚠️ [ExecuteWithdraw] Polling service not available, transaction will be checked by event listener when confirmed")
		}
	} else {
		// Enhanced quick check: try multiple times with increasing delays
		// This handles cases where transaction confirms quickly but receipt is not immediately available
		txHashBytes := common.HexToHash(txHash)
		var receipt *ethtypes.Receipt
		var err error
		var blockNumber uint64

		// Try 3 times with increasing delays: 2s, 5s, 10s
		quickCheckDelays := []time.Duration{2 * time.Second, 5 * time.Second, 10 * time.Second}
		confirmed := false

		for i, delay := range quickCheckDelays {
			log.Printf("⏳ [ExecuteWithdraw] Quick check attempt %d/%d (delay: %v): %s", i+1, len(quickCheckDelays), delay, txHash)
			time.Sleep(delay)

			ctxQuickCheck, cancel := context.WithTimeout(ctx, 10*time.Second)
			receipt, err = client.TransactionReceipt(ctxQuickCheck, txHashBytes)
			cancel()

			if err == nil && receipt != nil {
				// Transaction confirmed - update immediately
				blockNumber = receipt.BlockNumber.Uint64()
				confirmed = true
				log.Printf("✅ [ExecuteWithdraw] Transaction confirmed on attempt %d: %s, block=%d", i+1, txHash, blockNumber)
				break
			} else if err != nil {
				log.Printf("⚠️ [ExecuteWithdraw] Quick check attempt %d failed: %v (transaction may still be pending)", i+1, err)
			}
		}

		if confirmed {
			// Transaction already confirmed - update immediately
			if receipt.Status == 0 {
				// Transaction failed
				log.Printf("❌ [ExecuteWithdraw] Transaction failed: %s", txHash)
				if updateErr := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusVerifyFailed, txHash, &blockNumber, "Transaction reverted on-chain"); updateErr != nil {
					log.Printf("❌ [ExecuteWithdraw] Failed to update status to verify_failed: %v", updateErr)
				} else {
					log.Printf("✅ [ExecuteWithdraw] Updated execute_status to verify_failed")
				}
			} else {
				// Transaction succeeded
				log.Printf("✅ [ExecuteWithdraw] Transaction confirmed successfully: %s, block=%d", txHash, blockNumber)
				if updateErr := s.withdrawRepo.UpdateExecuteStatus(ctx, requestID, models.ExecuteStatusSuccess, txHash, &blockNumber, ""); updateErr != nil {
					log.Printf("❌ [ExecuteWithdraw] Failed to update status to success: %v", updateErr)
				} else {
					log.Printf("✅ [ExecuteWithdraw] Updated execute_status to success")

					// Update main status
					request.ExecuteStatus = models.ExecuteStatusSuccess
					request.UpdateMainStatus()
					if err := s.withdrawRepo.Update(ctx, request); err != nil {
						log.Printf("⚠️ [ExecuteWithdraw] Failed to update main status: %v", err)
					}
				}
			}
		} else {
			// Transaction not confirmed yet after quick checks - create polling task
			log.Printf("⏳ [ExecuteWithdraw] Transaction not confirmed after quick checks (may still be pending): %v", err)
			log.Printf("   Creating polling task to check transaction status every 10 seconds")

			if s.pollingService != nil {
				pollingConfig := models.PollingTaskConfig{
					EntityType:    "withdraw_request",
					EntityID:      requestID,
					TaskType:      models.PollingWithdrawExecute,
					ChainID:       MANAGEMENT_CHAIN_ID,
					TxHash:        txHash,
					TargetStatus:  string(models.ExecuteStatusSuccess),
					CurrentStatus: string(models.ExecuteStatusSubmitted),
					MaxRetries:    180, // 30 minutes (180 * 10 seconds)
					PollInterval:  10,  // 10 seconds
				}

				if err := s.pollingService.CreatePollingTask(pollingConfig); err != nil {
					log.Printf("⚠️ [ExecuteWithdraw] Failed to create polling task: %v", err)
					log.Printf("   Transaction will be checked by event listener when confirmed")
				} else {
					log.Printf("✅ [ExecuteWithdraw] Created polling task to monitor transaction: %s", txHash)
					log.Printf("   Will poll every %d seconds, max %d retries (total ~%d minutes)",
						pollingConfig.PollInterval, pollingConfig.MaxRetries,
						pollingConfig.MaxRetries*pollingConfig.PollInterval/60)
				}
			} else {
				log.Printf("⚠️ [ExecuteWithdraw] Polling service not available, transaction will be checked by event listener when confirmed")
			}
		}
	}

	// Update main status to submitting (if not already updated to success above)
	if request.ExecuteStatus != models.ExecuteStatusSuccess {
		request.ExecuteStatus = models.ExecuteStatusSubmitted
		request.UpdateMainStatus()
		if err := s.withdrawRepo.Update(ctx, request); err != nil {
			log.Printf("⚠️ [ExecuteWithdraw] Failed to update main status: %v", err)
		}
	}

	// Note:
	// 1. If transaction confirmation timed out, event listener will handle it when transaction is confirmed
	// 2. Allocations will be marked as used when execute_status = success (handled by event listener)
	// 3. PublicValues used here is from ZKVM response (saved in autoGenerateProofWithSignature)

	return nil
}

// ProcessPayout processes Intent execution (Stage 3)
// After payout is completed, automatically triggers Stage 4 (Hook) if needed
func (s *WithdrawRequestService) ProcessPayout(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Validate: execute must be successful
	if request.ExecuteStatus != models.ExecuteStatusSuccess {
		return errors.New("execute not successful")
	}

	// Update payout status to processing
	if err := s.withdrawRepo.UpdatePayoutStatus(ctx, requestID, models.PayoutStatusProcessing, "", nil, ""); err != nil {
		return err
	}

	// In real implementation, this would:
	// 1. Call multisig to execute Treasury.payout(
	//      targetChainId,
	//      IntentManagerAddress,  // 目标：IntentManager 合约
	//      amount,
	//      beneficiary,
	//      hookCalldata
	//    )
	// 2. Query LiFi for optimal cross-chain route
	// 3. Execute bridge transaction
	// 4. Monitor IntentManager.FundsReceived event
	// TODO: Integrate MultisigService + LiFi + IntentManager monitoring

	// Simulate success
	txHash := "0x" + uuid.New().String()
	blockNumber := uint64(12346)
	if err := s.withdrawRepo.UpdatePayoutStatus(ctx, requestID, models.PayoutStatusCompleted, txHash, &blockNumber, ""); err != nil {
		return err
	}

	// Update main status
	request.PayoutStatus = models.PayoutStatusCompleted
	request.UpdateMainStatus()
	if err := s.withdrawRepo.Update(ctx, request); err != nil {
		return err
	}

	// Auto-trigger Stage 4: Process Hook (if applicable)
	// Hook is optional - if it fails, main payout is still considered successful
	if request.HookStatus != models.HookStatusNotRequired {
		if err := s.ProcessHook(ctx, requestID); err != nil {
			// Log error but don't fail the payout
			// Hook failure will be marked separately (completed_with_hook_failed)
			return fmt.Errorf("payout completed, but hook processing failed: %w", err)
		}
	}

	return nil
}

// ProcessHook processes Hook execution (Stage 4 - Optional)
// Executes the on-chain recorded calldata via IntentManager
// Note: calldata is retrieved from blockchain (or database cache) for decentralization
func (s *WithdrawRequestService) ProcessHook(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Validate: payout must be completed (funds already in IntentManager)
	if request.PayoutStatus != models.PayoutStatusCompleted {
		return errors.New("payout not completed")
	}

	// Update hook status to processing
	if err := s.withdrawRepo.UpdateHookStatus(ctx, requestID, models.HookStatusProcessing, "", ""); err != nil {
		return err
	}

	// In real implementation, this would:
	// 1. Read hookCalldata from database (cached from blockchain event)
	//    OR query directly from blockchain: privacyPool.withdrawCalldata(withdrawNullifier)
	//    Note: calldata is recorded on-chain during executeWithdraw, ensuring decentralization
	// 2. Call IntentManager.executeIntent(
	//      beneficiary,
	//      amount,
	//      hookCalldata  // e.g., Aave.deposit, Compound.supply, Uniswap.swap
	//    )
	// 3. IntentManager uses its held funds to execute the calldata
	// 4. On success: beneficiary receives yield-bearing assets (aUSDT, cUSDT, etc.)
	// 5. On failure: IntentManager refunds original tokens to beneficiary
	// TODO: Integrate blockchain query + IntentManager contract call (possibly via multisig)

	// Simulate success
	txHash := "0x" + uuid.New().String()
	if err := s.withdrawRepo.UpdateHookStatus(ctx, requestID, models.HookStatusCompleted, txHash, ""); err != nil {
		return err
	}

	// Update main status
	request.HookStatus = models.HookStatusCompleted
	request.UpdateMainStatus()
	return s.withdrawRepo.Update(ctx, request)
}

// CancelWithdrawRequest cancels a withdraw request
// Rule: Can only cancel if execute_status != success (Stage 1-2 failed)
func (s *WithdrawRequestService) CancelWithdrawRequest(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Check if can cancel
	if !request.CanCancel() {
		return ErrCannotCancel
	}

	// Release allocations (pending -> idle)
	allocationIDs, err := s.getAllocationIDs(request)
	if err != nil {
		return err
	}
	if err := s.allocationRepo.ReleaseAllocations(ctx, allocationIDs); err != nil {
		return fmt.Errorf("failed to release allocations: %w", err)
	}

	// Update status to cancelled
	request.Status = string(models.WithdrawStatusCancelled)
	return s.withdrawRepo.Update(ctx, request)
}

// RetryPayout manually retries payout (Stage 3)
// Rule: Can only retry if execute_status = success AND payout_status = failed
func (s *WithdrawRequestService) RetryPayout(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Check if can retry
	if !request.CanRetryPayout() {
		return ErrCannotRetryPayout
	}

	// Check retry limit (recommended: 5 times)
	if request.PayoutRetryCount >= 5 {
		return ErrMaxRetriesExceeded
	}

	// Update to processing
	if err := s.withdrawRepo.UpdatePayoutStatus(ctx, requestID, models.PayoutStatusProcessing, "", nil, ""); err != nil {
		return err
	}

	// Retry payout
	return s.ProcessPayout(ctx, requestID)
}

// RetryHook manually retries Hook purchase (Stage 4)
// Rule: Can only retry if payout_status = completed AND hook_status = failed
func (s *WithdrawRequestService) RetryHook(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Check if can retry
	if !request.CanRetryHook() {
		return ErrCannotRetryHook
	}

	// Check retry limit
	if request.HookRetryCount >= 5 {
		return ErrMaxRetriesExceeded
	}

	// Retry hook
	return s.ProcessHook(ctx, requestID)
}

// RetryFallback retries a failed fallback transfer
// This calls multisig service to retry Treasury.retryFallback()
func (s *WithdrawRequestService) RetryFallback(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return fmt.Errorf("withdraw request not found: %w", err)
	}

	// Validate: can retry fallback
	if !request.CanRetryFallback() {
		return fmt.Errorf("cannot retry fallback: invalid status or max retries exceeded")
	}

	// Check retry count
	if request.FallbackRetryCount >= 5 {
		return ErrMaxRetriesExceeded
	}

	// TODO: Call multisig service API to execute Treasury.retryFallback(requestId)
	// This will be implemented when multisig service integration is ready
	// For now, just update retry count
	if err := s.withdrawRepo.UpdateFallbackStatus(ctx, requestID, false, "", request.FallbackRetryCount+1); err != nil {
		return fmt.Errorf("failed to update fallback retry count: %w", err)
	}

	return nil
}

// GetWithdrawRequest gets a withdraw request by ID
func (s *WithdrawRequestService) GetWithdrawRequest(ctx context.Context, requestID string) (*models.WithdrawRequest, error) {
	return s.withdrawRepo.GetByID(ctx, requestID)
}

// GetUserWithdrawRequests gets withdraw requests for a user
func (s *WithdrawRequestService) GetUserWithdrawRequests(ctx context.Context, ownerChainID uint32, ownerData string, page, pageSize int) ([]*models.WithdrawRequest, int64, error) {
	return s.withdrawRepo.FindByOwner(ctx, ownerChainID, ownerData, page, pageSize)
}

// GetBeneficiaryWithdrawRequests gets withdraw requests where the user is the beneficiary
func (s *WithdrawRequestService) GetBeneficiaryWithdrawRequests(ctx context.Context, beneficiaryChainID uint32, beneficiaryData string, page, pageSize int) ([]*models.WithdrawRequest, int64, error) {
	return s.withdrawRepo.FindByBeneficiary(ctx, beneficiaryChainID, beneficiaryData, page, pageSize)
}

// RequestPayoutExecution requests backend multisig to execute payout
// This should be called when execute_status = success but payout hasn't been executed yet
func (s *WithdrawRequestService) RequestPayoutExecution(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Validate: execute must be successful
	if request.ExecuteStatus != models.ExecuteStatusSuccess {
		return errors.New("execute not successful yet, cannot request payout")
	}

	// Check if payout is already completed or processing
	if request.PayoutStatus == models.PayoutStatusCompleted {
		return errors.New("payout already completed")
	}
	if request.PayoutStatus == models.PayoutStatusProcessing {
		return errors.New("payout is already being processed")
	}

	// Check retry limit
	if request.PayoutRetryCount >= 5 {
		return ErrMaxRetriesExceeded
	}

	// Trigger payout execution
	// In production, this would:
	// 1. Call multisig to execute Treasury.payout() → IntentManager
	// 2. Query LiFi for optimal cross-chain route
	// 3. Execute bridge transaction
	// 4. Monitor IntentManager.FundsReceived event
	return s.ProcessPayout(ctx, requestID)
}

// ClaimTimeout allows user to claim funds on source chain after timeout
// This is used when payout fails or times out
func (s *WithdrawRequestService) ClaimTimeout(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Validate: execute must be successful (nullifiers consumed)
	if request.ExecuteStatus != models.ExecuteStatusSuccess {
		return errors.New("cannot claim timeout: execute not successful yet")
	}

	// Check if payout is already completed
	if request.PayoutStatus == models.PayoutStatusCompleted {
		return errors.New("cannot claim timeout: payout already completed")
	}

	// In production, this would:
	// 1. Call source chain's Treasury.claimTimeout(withdrawNullifier)
	// 2. Verify timeout condition (e.g., 7 days since execute)
	// 3. Transfer funds directly to beneficiary on source chain
	// Note: This bypasses cross-chain + IntentManager flow

	// For now, simulate the timeout claim
	// Update status to indicate timeout was claimed
	request.PayoutStatus = models.PayoutStatusCompleted
	request.Status = string(models.WithdrawStatusCompleted)
	if err := s.withdrawRepo.Update(ctx, request); err != nil {
		return err
	}

	return nil
}

// RequestHookPurchase requests direct asset purchase via Hook
// This can be called to execute Hook purchase after payout completes
func (s *WithdrawRequestService) RequestHookPurchase(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Validate: payout must be completed
	if request.PayoutStatus != models.PayoutStatusCompleted {
		return errors.New("payout not completed yet, cannot purchase asset")
	}

	// Check if hook is already completed or processing
	if request.HookStatus == models.HookStatusCompleted {
		return errors.New("hook purchase already completed")
	}
	if request.HookStatus == models.HookStatusProcessing {
		return errors.New("hook purchase is already being processed")
	}

	// Check retry limit
	if request.HookRetryCount >= 5 {
		return ErrMaxRetriesExceeded
	}

	// Update hook status to required if it was not_required
	if request.HookStatus == models.HookStatusNotRequired {
		request.HookStatus = models.HookStatusPending
		if err := s.withdrawRepo.Update(ctx, request); err != nil {
			return err
		}
	}

	// Trigger hook execution
	// In production, this would:
	// 1. Read hookCalldata from database
	// 2. Call IntentManager.executeIntent(beneficiary, amount, hookCalldata)
	// 3. IntentManager executes calldata (Aave/Compound/Uniswap/etc.)
	return s.ProcessHook(ctx, requestID)
}

// WithdrawOriginalTokens allows beneficiary to withdraw original tokens from IntentManager
// This is used when user gives up on Hook after multiple failures
func (s *WithdrawRequestService) WithdrawOriginalTokens(ctx context.Context, requestID string) error {
	request, err := s.withdrawRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Validate: payout must be completed (funds in IntentManager)
	if request.PayoutStatus != models.PayoutStatusCompleted {
		return errors.New("payout not completed yet, cannot withdraw original tokens")
	}

	// Check if hook already completed
	if request.HookStatus == models.HookStatusCompleted {
		return errors.New("hook already completed, tokens have been converted")
	}

	// Check if hook has failed (or not required)
	if request.HookStatus != models.HookStatusFailed && request.HookStatus != models.HookStatusNotRequired {
		return errors.New("hook not in failed state, cannot withdraw original tokens")
	}

	// In production, this would:
	// 1. Call IntentManager.withdrawOriginalTokens(
	//      beneficiary: request.BeneficiaryData,
	//      token: sourceTokenAddress,
	//      amount: request.Amount
	//    )
	// 2. Monitor transaction confirmation
	// 3. Update status to completed_with_hook_failed
	// TODO: Integrate IntentManager contract call

	// Simulate success
	txHash := "0x" + uuid.New().String()

	// Update hook status to abandoned
	if err := s.withdrawRepo.UpdateHookStatus(ctx, requestID, models.HookStatusAbandoned, txHash, "Original tokens withdrawn"); err != nil {
		return err
	}

	// Update main status
	request.HookStatus = models.HookStatusAbandoned
	request.UpdateMainStatus()
	return s.withdrawRepo.Update(ctx, request)
}

// ============ Helper methods ============

// validateAllocations validates that all allocations can be used for withdrawal
// Now supports allocations from different checkbooks (different deposits) as long as they belong to the same user
func (s *WithdrawRequestService) validateAllocations(allocations []*models.Check) error {
	if len(allocations) == 0 {
		return ErrInvalidAllocations
	}

	// Check all allocations are idle
	for _, alloc := range allocations {
		if alloc.Status != models.AllocationStatusIdle {
			return ErrAllocationsNotIdle
		}
	}

	// Check all allocations belong to the same user (same owner address)
	// Get first checkbook to get owner address
	firstCheckbook, err := s.checkbookRepo.GetByID(context.Background(), allocations[0].CheckbookID)
	if err != nil {
		return fmt.Errorf("failed to get first checkbook: %w", err)
	}
	firstOwnerAddress := firstCheckbook.UserAddress.Data
	firstOwnerChainID := firstCheckbook.UserAddress.SLIP44ChainID

	// Verify all other allocations belong to checkbooks with the same owner
	for i := 1; i < len(allocations); i++ {
		checkbook, err := s.checkbookRepo.GetByID(context.Background(), allocations[i].CheckbookID)
		if err != nil {
			return fmt.Errorf("failed to get checkbook for allocation %s: %w", allocations[i].ID, err)
		}

		// Compare owner address (case-insensitive for EVM addresses)
		ownerAddress := checkbook.UserAddress.Data
		ownerChainID := checkbook.UserAddress.SLIP44ChainID

		// Normalize addresses for comparison (lowercase for EVM)
		firstAddrNormalized := strings.ToLower(firstOwnerAddress)
		ownerAddrNormalized := strings.ToLower(ownerAddress)

		if ownerAddrNormalized != firstAddrNormalized || ownerChainID != firstOwnerChainID {
			return fmt.Errorf("allocations belong to different users: first owner=%s (chain=%d), allocation[%d] owner=%s (chain=%d)",
				firstOwnerAddress, firstOwnerChainID, i, ownerAddress, ownerChainID)
		}
	}

	return nil
}

// calculateTotalAmount calculates total amount from allocations
func (s *WithdrawRequestService) calculateTotalAmount(allocations []*models.Check) string {
	if len(allocations) == 0 {
		return "0"
	}

	// Use big.Int for precision
	total := new(big.Int)
	for _, alloc := range allocations {
		amount, ok := new(big.Int).SetString(alloc.Amount, 10)
		if !ok {
			// If parsing fails, skip this allocation
			continue
		}
		total.Add(total, amount)
	}

	return total.String()
}

// getAllocationIDs extracts allocation IDs from WithdrawRequest
func (s *WithdrawRequestService) getAllocationIDs(request *models.WithdrawRequest) ([]string, error) {
	var ids []string
	if err := json.Unmarshal([]byte(request.AllocationIDs), &ids); err != nil {
		return nil, fmt.Errorf("failed to unmarshal allocation IDs: %w", err)
	}
	return ids, nil
}

// buildCommitmentGroupForCheckbook builds a CommitmentGroup for a specific checkbook and its allocations
// This helper function is used to support cross-deposit withdrawals (multiple checkbooks)
func (s *WithdrawRequestService) buildCommitmentGroupForCheckbook(
	ctx context.Context,
	checkbook *models.Checkbook,
	checkbookAllocations []*models.Check, // Allocations from this checkbook in the withdraw request
	allCheckbookAllocations []*models.Check, // ALL allocations from this checkbook (for computing left/right hashes)
) (*types.CommitmentGroupRequest, error) {
	// Get commitment hash
	commitmentHash := ""
	if checkbook.Commitment != nil && *checkbook.Commitment != "" {
		commitmentHash = *checkbook.Commitment
	} else {
		return nil, fmt.Errorf("checkbook %s has no commitment", checkbook.ID)
	}

	// Get queue root info
	var rootBeforeCommitment string
	queueRoot, err := s.queueRootRepo.GetByCommitment(ctx, commitmentHash)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [buildCommitmentGroup] Queue root not found for commitment %s, using all-zero root", commitmentHash)
			rootBeforeCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000"
		} else {
			return nil, fmt.Errorf("failed to query queue root: %w", err)
		}
	} else {
		rootBeforeCommitment = queueRoot.PreviousRoot
		if rootBeforeCommitment == "" {
			rootBeforeCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000"
		}
	}

	// Get subsequent commitments
	commitmentsAfter := []string{}
	if queueRoot != nil {
		currentRoot := queueRoot.Root
		maxTraversal := 1000
		for i := 0; i < maxTraversal; i++ {
			nextQueueRoot, err := s.queueRootRepo.FindByPreviousRoot(ctx, currentRoot)
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					break
				}
				log.Printf("⚠️ [buildCommitmentGroup] Failed to query subsequent queue root: %v", err)
				break
			}
			if nextQueueRoot.CreatedByCommitment != "" {
				commitmentsAfter = append(commitmentsAfter, nextQueueRoot.CreatedByCommitment)
			}
			currentRoot = nextQueueRoot.Root
		}
	}

	// Helper function to hash allocation
	hashAllocation := func(seq uint8, amountHex string) (string, error) {
		amountBytes, err := hex.DecodeString(amountHex)
		if err != nil {
			return "", fmt.Errorf("failed to decode amount hex: %w", err)
		}
		if len(amountBytes) != 32 {
			return "", fmt.Errorf("amount must be 32 bytes, got %d", len(amountBytes))
		}
		data := append([]byte{seq}, amountBytes...)
		hash := crypto.Keccak256(data)
		return hex.EncodeToString(hash), nil
	}

	// Sort all checkbook allocations by seq
	sortedAllCheckbookAllocations := make([]struct {
		id     string
		seq    uint8
		amount string
	}, len(allCheckbookAllocations))
	for i, alloc := range allCheckbookAllocations {
		amountBig, ok := new(big.Int).SetString(alloc.Amount, 10)
		if !ok {
			return nil, fmt.Errorf("invalid amount format: %s", alloc.Amount)
		}
		amountHex := fmt.Sprintf("%064x", amountBig)
		sortedAllCheckbookAllocations[i] = struct {
			id     string
			seq    uint8
			amount string
		}{alloc.ID, alloc.Seq, amountHex}
	}
	sort.Slice(sortedAllCheckbookAllocations, func(i, j int) bool {
		return sortedAllCheckbookAllocations[i].seq < sortedAllCheckbookAllocations[j].seq
	})

	// Compute hashes for all checkbook allocations
	checkbookAllocationHashes := make([]string, len(sortedAllCheckbookAllocations))
	for i, sa := range sortedAllCheckbookAllocations {
		hash, err := hashAllocation(sa.seq, sa.amount)
		if err != nil {
			return nil, fmt.Errorf("failed to hash allocation: %w", err)
		}
		checkbookAllocationHashes[i] = hash
	}

	// Convert deposit ID to hex
	depositIDBig := big.NewInt(int64(checkbook.LocalDepositID))
	depositID8Bytes := make([]byte, 8)
	depositIDBig.FillBytes(depositID8Bytes)
	depositIDBytes := make([]byte, 32)
	copy(depositIDBytes[24:32], depositID8Bytes)
	depositIDHex := hex.EncodeToString(depositIDBytes)

	// Get token key
	tokenKey := checkbook.TokenKey
	if tokenKey == "" {
		tokenKey = "USDT" // Fallback
	}

	credentialChainID := uint32(checkbook.SLIP44ChainID)

	// Build AllocationWithCredentialRequest for each allocation in this checkbook
	allocationWithCredentialRequests := make([]types.AllocationWithCredentialRequest, len(checkbookAllocations))
	for i, alloc := range checkbookAllocations {
		amountBig, ok := new(big.Int).SetString(alloc.Amount, 10)
		if !ok {
			return nil, fmt.Errorf("invalid amount format: %s", alloc.Amount)
		}
		amountHex := fmt.Sprintf("%064x", amountBig)

		// Find allocation's position in sorted list
		sortedIndex := -1
		for j, sa := range sortedAllCheckbookAllocations {
			if sa.id == alloc.ID {
				sortedIndex = j
				break
			}
		}
		if sortedIndex == -1 {
			return nil, fmt.Errorf("allocation %s not found in checkbook allocations", alloc.ID)
		}

		// Build left_hashes and right_hashes
		leftHashes := make([]string, sortedIndex)
		for j := 0; j < sortedIndex; j++ {
			leftHashes[j] = checkbookAllocationHashes[j]
		}

		rightHashes := make([]string, len(sortedAllCheckbookAllocations)-sortedIndex-1)
		for j := sortedIndex + 1; j < len(sortedAllCheckbookAllocations); j++ {
			rightHashes[j-sortedIndex-1] = checkbookAllocationHashes[j]
		}

		credential := types.CredentialRequest{
			LeftHashes:  leftHashes,
			RightHashes: rightHashes,
			DepositID:   depositIDHex,
			ChainID:     credentialChainID,
			TokenKey:    tokenKey,
		}

		allocationWithCredentialRequests[i] = types.AllocationWithCredentialRequest{
			Allocation: types.AllocationRequest{
				Seq:    alloc.Seq,
				Amount: amountHex,
			},
			Credential: credential,
		}
	}

	// Sort allocations by seq within the commitment group (ascending)
	sort.Slice(allocationWithCredentialRequests, func(i, j int) bool {
		return allocationWithCredentialRequests[i].Allocation.Seq < allocationWithCredentialRequests[j].Allocation.Seq
	})

	return &types.CommitmentGroupRequest{
		Allocations:          allocationWithCredentialRequests,
		RootBeforeCommitment: rootBeforeCommitment,
		CommitmentsAfter:     commitmentsAfter,
	}, nil
}
