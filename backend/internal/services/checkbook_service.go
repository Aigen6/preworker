package services

import (
	"context"
	"encoding/json"
	"fmt"
	"go-backend/internal/clients"
	"go-backend/internal/config"
	"log"
	"math/big"
	"strings"
	"time"

	"go-backend/internal/models"
	"go-backend/internal/repository"
	"go-backend/internal/types"
	"go-backend/internal/utils"

	"gorm.io/gorm"
)

// CheckbookService transferservice
type CheckbookService struct {
	repo              repository.CheckbookRepository
	db                *gorm.DB // service（）
	pollingService    *UnifiedPollingService
	pushService       *WebSocketPushService
	zkvmClient        *clients.ZKVMClient
	blockchainService *BlockchainTransactionService // Use service container instance
}

// createCheckbookService
func NewCheckbookService(repo repository.CheckbookRepository, db *gorm.DB, pollingService *UnifiedPollingService, pushService *WebSocketPushService, zkvmClient *clients.ZKVMClient, blockchainService ...*BlockchainTransactionService) *CheckbookService {
	service := &CheckbookService{
		repo:           repo,
		db:             db,
		pollingService: pollingService,
		pushService:    pushService,
		zkvmClient:     zkvmClient,
	}
	// If blockchainService is provided, use it (from service container)
	if len(blockchainService) > 0 && blockchainService[0] != nil {
		service.blockchainService = blockchainService[0]
	}
	return service
}

// updateCheckbookstatus
func (s *CheckbookService) UpdateStatus(checkbookID string, newStatus models.CheckbookStatus) error {
	ctx := context.Background()

	checkbook, err := s.repo.GetByID(ctx, checkbookID)
	if err != nil {
		return fmt.Errorf("failed to get checkbook: %w", err)
	}

	oldStatus := checkbook.Status
	checkbook.Status = newStatus
	checkbook.UpdatedAt = time.Now()

	err = s.repo.Update(ctx, checkbook)
	if err != nil {
		return fmt.Errorf("failed to update checkbook status: %w", err)
	}

	log.Printf("✅ Updated checkbook %s status: %s → %s", checkbookID, oldStatus, newStatus)

	// pushstatusupdate
	userAddressStr := fmt.Sprintf("%d:%s", checkbook.UserAddress.SLIP44ChainID, checkbook.UserAddress.Data)
	s.pushService.BroadcastCheckbookUpdate(userAddressStr, CheckbookStatusUpdateData{
		CheckbookID: checkbookID,
		OldStatus:   string(oldStatus),
		NewStatus:   string(newStatus),
	})

	return nil
}

// SaveProofToCheckbook savecheckbookdata
func (s *CheckbookService) SaveProofToCheckbook(checkbookID string, proof *ProofResult) error {
	ctx := context.Background()

	//  checkbook
	checkbook, err := s.repo.GetByID(ctx, checkbookID)
	if err != nil {
		return fmt.Errorf("failed to get checkbook: %w", err)
	}

	// JSON
	publicValuesJSON := ""
	if len(proof.PublicInputs) > 0 {
		publicValuesBytes, err := json.Marshal(proof.PublicInputs)
		if err != nil {
			log.Printf("⚠️ failed: %v", err)
		} else {
			publicValuesJSON = string(publicValuesBytes)
		}
	}

	//  checkbook
	checkbook.ProofSignature = proof.Proof
	checkbook.PublicValues = publicValuesJSON
	commitmentHash := proof.CommitmentHash
	checkbook.Commitment = &commitmentHash
	checkbook.UpdatedAt = time.Now()

	err = s.repo.Update(ctx, checkbook)
	if err != nil {
		return fmt.Errorf("failed to save proof to checkbook: %w", err)
	}

	log.Printf("✅ [SaveProofToCheckbook] alreadysavecheckbook: %s", checkbookID)
	log.Printf("   ProofSignature: %d", len(proof.Proof))
	log.Printf("   PublicValues: %s", publicValuesJSON)
	log.Printf("   CommitmentHash: %s", proof.CommitmentHash)

	return nil
}

// retry
func (s *CheckbookService) RetryProofGeneration(checkbookID string) error {
	ctx := context.Background()

	// updatestatus
	err := s.UpdateStatus(checkbookID, models.CheckbookStatusGeneratingProof)
	if err != nil {
		return err
	}

	// getcheckbook
	checkbook, err := s.repo.GetByID(ctx, checkbookID)
	if err != nil {
		return fmt.Errorf("failed to get checkbook: %w", err)
	}

	// retryrequest
	retryReq := GenerateCommitmentRequest{
		Allocations: []AllocationData{
			// checkbook，use
			{
				Recipient: checkbook.UserAddress.Data, // useuseraddressaddress
				Amount:    checkbook.Amount,
				ChainID:   int32(checkbook.UserAddress.SLIP44ChainID), // useuseraddresschain ID
			},
		},
		Signature:    checkbook.ProofSignature, // usesave
		ChainInfo:    map[string]interface{}{"chain_id": checkbook.SLIP44ChainID},
		Language:     "zh-CN",
		ForceRestart: true, // forcestart
	}

	return s.GenerateAndSubmitCommitment(checkbookID, retryReq)
}

// retrycommitment
func (s *CheckbookService) RetryCommitmentSubmission(checkbookID string) error {
	ctx := context.Background()

	// updatestatuscommitment
	err := s.UpdateStatus(checkbookID, models.CheckbookStatusSubmittingCommitment)
	if err != nil {
		log.Printf("❌ Failed to update checkbook status to submitting_commitment: %v", err)
		return fmt.Errorf("failed to update status: %w", err)
	}

	// getcheckbookdata
	checkbook, err := s.repo.GetByID(ctx, checkbookID)
	if err != nil {
		log.Printf("❌ Failed to get checkbook %s: %v", checkbookID, err)
		// Update status to submission_failed since we can't proceed
		if updateErr := s.UpdateStatus(checkbookID, models.CheckbookStatusSubmissionFailed); updateErr != nil {
			log.Printf("❌ Failed to update checkbook status to submission_failed: %v", updateErr)
		}
		return fmt.Errorf("failed to get checkbook: %w", err)
	}

	// checkwhetherdata
	if checkbook.ProofSignature == "" {
		log.Printf("❌ Checkbook %s has no proof data, cannot retry commitment submission", checkbookID)
		// Update status to proof_failed since we need to regenerate proof
		if updateErr := s.UpdateStatus(checkbookID, models.CheckbookStatusProofFailed); updateErr != nil {
			log.Printf("❌ Failed to update checkbook status to proof_failed: %v", updateErr)
		}
		return fmt.Errorf("no proof data found, need to retry from proof generation")
	}

	// blockchain
	// needsavedata
	commitmentStr := ""
	if checkbook.Commitment != nil {
		commitmentStr = *checkbook.Commitment
	}
	proof := &ProofResult{
		Proof:          checkbook.ProofSignature,
		PublicInputs:   []string{commitmentStr}, // process
		CommitmentHash: commitmentStr,
	}

	txHash, err := s.submitCommitmentToChain(checkbookID, proof)
	if err != nil {
		// Update status to submission_failed on error
		if updateErr := s.UpdateStatus(checkbookID, models.CheckbookStatusSubmissionFailed); updateErr != nil {
			log.Printf("❌ Failed to update checkbook status to submission_failed: %v", updateErr)
		}
		return fmt.Errorf("failed to resubmit commitment: %w", err)
	}

	// createpollingwaitconfirm
	err = s.pollingService.CreatePollingTask(models.PollingTaskConfig{
		EntityType:    "checkbook",
		EntityID:      checkbookID,
		TaskType:      models.PollingCommitmentConfirmation,
		ChainID:       56, // BSC
		TxHash:        txHash,
		TargetStatus:  string(models.CheckbookStatusWithCheckbook),
		CurrentStatus: string(models.CheckbookStatusCommitmentPending),
		MaxRetries:    180,
		PollInterval:  10,
	})
	if err != nil {
		// Update status to submission_failed if polling task creation fails
		log.Printf("❌ Failed to create polling task: %v", err)
		if updateErr := s.UpdateStatus(checkbookID, models.CheckbookStatusSubmissionFailed); updateErr != nil {
			log.Printf("❌ Failed to update checkbook status to submission_failed: %v", updateErr)
		}
		return fmt.Errorf("failed to create polling task: %w", err)
	}

	return s.UpdateStatus(checkbookID, models.CheckbookStatusCommitmentPending)
}

// commitment（）
func (s *CheckbookService) GenerateAndSubmitCommitment(checkbookID string, req GenerateCommitmentRequest) error {
	// 1.
	err := s.UpdateStatus(checkbookID, models.CheckbookStatusGeneratingProof)
	if err != nil {
		return err
	}

	// ZKVMservice
	proof, err := generateCommitmentProof(s.zkvmClient, req)
	if err != nil {
		s.UpdateStatus(checkbookID, models.CheckbookStatusProofFailed)
		return fmt.Errorf("failed to generate proof: %w", err)
	}

	// 1.5. savecheckbookdata
	err = s.SaveProofToCheckbook(checkbookID, proof)
	if err != nil {
		log.Printf("⚠️ savecheckbookfailed: %v", err)
		// returnerror，continue
	}

	// 2.
	err = s.UpdateStatus(checkbookID, models.CheckbookStatusSubmittingCommitment)
	if err != nil {
		return err
	}

	// blockchain
	txHash, err := s.submitCommitmentToChain(checkbookID, proof)
	if err != nil {
		// Update status to submission_failed on error
		if updateErr := s.UpdateStatus(checkbookID, models.CheckbookStatusSubmissionFailed); updateErr != nil {
			log.Printf("❌ Failed to update checkbook status to submission_failed: %v", updateErr)
		}
		return fmt.Errorf("failed to submit commitment: %w", err)
	}

	// 3. createpollingwaitconfirm
	err = s.pollingService.CreatePollingTask(models.PollingTaskConfig{
		EntityType:    "checkbook",
		EntityID:      checkbookID,
		TaskType:      models.PollingCommitmentConfirmation,
		ChainID:       56, // BSC
		TxHash:        txHash,
		TargetStatus:  string(models.CheckbookStatusWithCheckbook),
		CurrentStatus: string(models.CheckbookStatusCommitmentPending),
		MaxRetries:    180, // 30
		PollInterval:  10,  // 10
	})
	if err != nil {
		// Update status to submission_failed if polling task creation fails
		log.Printf("❌ Failed to create polling task: %v", err)
		if updateErr := s.UpdateStatus(checkbookID, models.CheckbookStatusSubmissionFailed); updateErr != nil {
			log.Printf("❌ Failed to update checkbook status to submission_failed: %v", updateErr)
		}
		return fmt.Errorf("failed to create polling task: %w", err)
	}

	err = s.UpdateStatus(checkbookID, models.CheckbookStatusCommitmentPending)
	if err != nil {
		return err
	}

	return nil
}

// commitment
func (s *CheckbookService) submitCommitmentToChain(checkbookID string, proof *ProofResult) (string, error) {
	log.Printf("🚀 commitmentblockchain...")

	// blockchaincommitment
	// proof
	chainID := 714 // BSC SLIP-44 ChainID，configurationget
	localDepositID := s.parseLocalDepositIDFromProof(proof)
	tokenKey := s.parseTokenKeyFromProof(proof) // Use token_key instead of token_id
	allocatableAmount := s.parseAllocatableAmountFromProof(proof)

	// commitmentrequest
	commitmentReq := &CommitmentRequest{
		ChainID:           chainID,
		LocalDepositID:    localDepositID,
		TokenKey:          tokenKey, // Use token_key instead of token_id
		CheckbookTokenKey: tokenKey, // Use same value for checkbook token key
		AllocatableAmount: allocatableAmount,
		Commitment:        proof.CommitmentHash,
		SP1Proof:          proof.Proof,
		CheckbookID:       checkbookID, // Pass checkbookID to enable direct lookup
	}

	// useblockchainservice（alreadyinitializeRPCclient）
	// Use service container instance if available, otherwise create new one
	var blockchainService *BlockchainTransactionService
	if s.blockchainService != nil {
		// Use service container instance (already initialized with proper config)
		blockchainService = s.blockchainService
		log.Printf("✅ Using service container BlockchainTransactionService")
	} else {
		// Fallback: create new instance (for backward compatibility)
		log.Printf("⚠️ Creating new BlockchainTransactionService (should use service container)")
		keyMgmtService := NewKeyManagementService(config.AppConfig, s.db)
		blockchainService = NewBlockchainTransactionService(keyMgmtService)
		// initializeclient（useconfiguration）
		if err := blockchainService.InitializeClients(); err != nil {
			log.Printf("❌ initializeblockchainclientfailed: %v", err)
			return "", fmt.Errorf("failed to initialize blockchain clients: %w", err)
		}
	}

	// commitmentblockchain
	response, err := blockchainService.SubmitCommitment(commitmentReq)
	if err != nil {
		log.Printf("❌ commitmentfailed: %v", err)
		return "", fmt.Errorf("failed to submit commitment: %w", err)
	}

	txHash := response.TxHash

	log.Printf("📝 Commitmentcompleted:")
	log.Printf("   Proof: %s", proof.Proof[:utils.Min(20, len(proof.Proof))]+"...")
	log.Printf("   CommitmentHash: %s", proof.CommitmentHash)
	log.Printf("   TxHash: %s", txHash)

	return txHash, nil
}

// parseLocalDepositIDFromProof proofLocalDepositID
func (s *CheckbookService) parseLocalDepositIDFromProof(proof *ProofResult) uint64 {
	// proof.PublicInputsLocalDepositID
	// PublicInputs[]string，attemptJSON
	if len(proof.PublicInputs) > 0 {
		// attemptJSON
		var inputs map[string]interface{}
		if err := json.Unmarshal([]byte(proof.PublicInputs[0]), &inputs); err == nil {
			if id, ok := inputs["localDepositId"].(float64); ok {
				return uint64(id)
			}
		}
	}
	return 1
}

// parseTokenKeyFromProof proofTokenKey (replaces parseTokenIDFromProof)
func (s *CheckbookService) parseTokenKeyFromProof(proof *ProofResult) string {
	// proof.PublicInputsTokenKey
	if len(proof.PublicInputs) > 0 {
		var inputs map[string]interface{}
		if err := json.Unmarshal([]byte(proof.PublicInputs[0]), &inputs); err == nil {
			if tokenKey, ok := inputs["token_key"].(string); ok && tokenKey != "" {
				return tokenKey
			}
			if tokenSymbol, ok := inputs["token_symbol"].(string); ok && tokenSymbol != "" {
				return tokenSymbol
			}
		}
	}
	return "USDT" // Default: USDT
}

// parseAllocatableAmountFromProof proofAllocatableAmount
func (s *CheckbookService) parseAllocatableAmountFromProof(proof *ProofResult) string {
	// proof.PublicInputsAllocatableAmount
	if len(proof.PublicInputs) > 0 {
		var inputs map[string]interface{}
		if err := json.Unmarshal([]byte(proof.PublicInputs[0]), &inputs); err == nil {
			if amount, ok := inputs["allocatableAmount"].(string); ok {
				return amount
			}
			if amount, ok := inputs["amount"].(string); ok {
				return amount
			}
		}
	}
	return "1000000000000000000" // ：1 ETH
}

// commitmentrequest
type GenerateCommitmentRequest struct {
	Allocations  []AllocationData `json:"allocations"`
	Signature    string           `json:"signature"`
	ChainInfo    interface{}      `json:"chain_info"`
	Language     string           `json:"language"`
	ForceRestart bool             `json:"force_restart,omitempty"`
}

// data
type AllocationData struct {
	Recipient string `json:"recipient"`
	Amount    string `json:"amount"`
	ChainID   int32  `json:"chain_id"`
}

type ProofResult struct {
	Proof          string   `json:"proof"`
	PublicInputs   []string `json:"public_inputs"`
	CommitmentHash string   `json:"commitment_hash"`
}

// ============ ZKVM （ zkvm_extensions  zkvm_helper_functions ） ============

// generateCommitmentProof commitment（API）
func generateCommitmentProof(zkClient *clients.ZKVMClient, req GenerateCommitmentRequest) (*ProofResult, error) {
	// gettoken
	tokenSymbol, _, chainName := getTokenInfo(req.ChainInfo) // tokenID no longer used (replaced by token_key)

	// ZKVM API - Updated to use token_key and simplified allocations
	zkRequest := &clients.BuildCommitmentRequest{
		DepositID:   "1", // usecheckbookdatarecordgetDepositID
		TokenKey:    tokenSymbol, // Use token_key instead of token_id
		ChainName:   chainName,
		Lang:        getLanguageCode(req.Language),
		Allocations: convertAllocationsToZKVM(req.Allocations), // Simplified allocations (only seq and amount)
		Signature: clients.MultichainSignatureRequest{
			ChainID:       56, // chain ID，configurationget
			SignatureData: req.Signature,
			PublicKey:     nil, // ，ifneedcansignature
		},
		OwnerAddress: clients.UniversalAddressRequest{
			ChainID: 56, // useraddresschain ID
			Address: extractAddressFromSignature(req.Signature),
		},
	}

	// BuildCommitment
	response, err := zkClient.BuildCommitment(zkRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to build commitment: %w", err)
	}

	// Parse PublicValues to get the actual commitment hash
	parsedValues, err := types.ParseCommitmentPublicValues(response.PublicValues)
	if err != nil {
		return nil, fmt.Errorf("failed to parse commitment public values: %w", err)
	}

	// response
	result := &ProofResult{
		Proof:          response.ProofData,
		PublicInputs:   []string{response.PublicValues},
		CommitmentHash: parsedValues.Commitment, // Use actual commitment hash from PublicValues
	}

	return result, nil
}

// convertAllocationsToZKVM allocationsZKVM - Updated to use simplified allocation structure
func convertAllocationsToZKVM(allocations []AllocationData) []clients.CommitmentAllocationRequest {
	zkAllocations := make([]clients.CommitmentAllocationRequest, len(allocations))
	for i, alloc := range allocations {
		// Convert amount to HEX format (32 bytes, 64 hex chars, no 0x prefix)
		amountHex := alloc.Amount
		if !strings.HasPrefix(amountHex, "0x") {
			// If not hex, assume it's decimal and convert
			amountBig, ok := new(big.Int).SetString(amountHex, 10)
			if ok {
				amountHex = fmt.Sprintf("%064x", amountBig)
			}
		} else {
			amountHex = strings.TrimPrefix(amountHex, "0x")
			if len(amountHex) < 64 {
				amountHex = strings.Repeat("0", 64-len(amountHex)) + amountHex
			}
		}
		
		zkAllocations[i] = clients.CommitmentAllocationRequest{
			Seq:    uint8(i), // Allocation sequence (0-255)
			Amount: amountHex, // 32 bytes HEX format (no 0x prefix)
		}
	}
	return zkAllocations
}

// extractAddressFromSignature address
func extractAddressFromSignature(signature string) string {
	// ，needuseaddress
	// use go-ethereum  crypto.SigToPub  crypto.PubkeyToAddress
	if strings.HasPrefix(signature, "0x") && len(signature) >= 42 {
		// address，20address
		address := signature[2:42] // address
		return padAddressTo32Bytes("0x" + address)
	}
	// returnaddress32
	return "0x0000000000000000000000000000000000000000000000000000000000000000"
}

// padAddressTo32Bytes address32
func padAddressTo32Bytes(address string) string {
	if strings.HasPrefix(address, "0x") {
		address = address[2:]
	}
	// address40（20）
	if len(address) < 40 {
		address = strings.Repeat("0", 40-len(address)) + address
	}
	// address20，need12032universal address
	return "0x000000000000000000000000" + strings.ToLower(address)
}

// getLanguageCode get
func getLanguageCode(language string) uint8 {
	switch strings.ToLower(language) {
	case "zh-cn", "zh", "chinese":
		return 0
	case "en", "en-us", "english":
		return 1
	default:
		return 0
	}
}

// getTokenInfo gettoken
func getTokenInfo(chainInfo interface{}) (symbol string, tokenID uint16, chainName *string) {
	// needchainInfo
	// return
	ethChainName := "Ethereum"
	return "USDT", 1, &ethChainName
}

// ============ Intent System Methods ============

// GenerateAllocations generates allocations for a checkbook
func (s *CheckbookService) GenerateAllocations(ctx context.Context, checkbookID string, allocationCount uint8, amountPerAllocation string) error {
	_, err := s.repo.GetByID(ctx, checkbookID)
	if err != nil {
		return fmt.Errorf("failed to get checkbook: %w", err)
	}

	// Create allocations
	allocations := make([]*models.Check, allocationCount)
	for i := uint8(0); i < allocationCount; i++ {
		allocationID := fmt.Sprintf("%s-%d", checkbookID, i) // Simple ID generation
		allocations[i] = &models.Check{
			ID:          allocationID,
			CheckbookID: checkbookID,
			Seq:         i,
			Amount:      amountPerAllocation,
			Status:      models.AllocationStatusIdle,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
	}

	// Save allocations to database
	for _, alloc := range allocations {
		if err := s.db.Create(alloc).Error; err != nil {
			return fmt.Errorf("failed to create allocation: %w", err)
		}
	}

	log.Printf("✅ Generated %d allocations for checkbook %s", allocationCount, checkbookID)
	return nil
}

// GetAvailableAllocations gets all available (idle) allocations for a checkbook
func (s *CheckbookService) GetAvailableAllocations(ctx context.Context, checkbookID string) ([]*models.Check, error) {
	var allocations []*models.Check
	err := s.db.WithContext(ctx).
		Where("checkbook_id = ? AND status = ?", checkbookID, models.AllocationStatusIdle).
		Order("seq ASC").
		Find(&allocations).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get available allocations: %w", err)
	}
	return allocations, nil
}

// GetCheckbookWithAllocations gets checkbook with its allocations
func (s *CheckbookService) GetCheckbookWithAllocations(ctx context.Context, checkbookID string) (*models.Checkbook, error) {
	checkbook, err := s.repo.GetByID(ctx, checkbookID)
	if err != nil {
		return nil, fmt.Errorf("failed to get checkbook: %w", err)
	}

	// Load allocations
	var allocations []models.Check
	err = s.db.WithContext(ctx).
		Where("checkbook_id = ?", checkbookID).
		Order("seq ASC").
		Find(&allocations).Error
	if err != nil {
		return nil, fmt.Errorf("failed to load allocations: %w", err)
	}

	checkbook.Allocations = allocations
	return checkbook, nil
}

// IsCheckbookCompleted checks if all allocations in the checkbook are used
func (s *CheckbookService) IsCheckbookCompleted(ctx context.Context, checkbookID string) (bool, error) {
	checkbook, err := s.GetCheckbookWithAllocations(ctx, checkbookID)
	if err != nil {
		return false, err
	}
	return checkbook.IsCompleted(), nil
}
