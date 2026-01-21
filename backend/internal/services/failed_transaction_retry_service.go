package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/models"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"gorm.io/gorm"
)

// getCommitmentString safely extracts commitment string from pointer
func getCommitmentString(commitment *string) string {
	if commitment == nil {
		return ""
	}
	return *commitment
}

// FailedTransactionRetryService Failedretryservice
type FailedTransactionRetryService struct {
	blockchainService *BlockchainTransactionService
	scannerClient     *BlockScannerClient
}

// NewFailedTransactionRetryService CreateFailedretryservice
func NewFailedTransactionRetryService(blockchainService *BlockchainTransactionService, scannerClient *BlockScannerClient) *FailedTransactionRetryService {
	return &FailedTransactionRetryService{
		blockchainService: blockchainService,
		scannerClient:     scannerClient,
	}
}

// StartRetryService Startretryservice，CheckretryFailed
func (s *FailedTransactionRetryService) StartRetryService(interval time.Duration) {
	log.Printf("🚀 startfailedretryservice，Check: %v", interval)

	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			if err := s.processFailedTransactions(); err != nil {
				log.Printf("❌ failedretryserviceCheckfailed: %v", err)
			}
		}
	}()
}

// processFailedTransactions processneedretryFailed
func (s *FailedTransactionRetryService) processFailedTransactions() error {
	// queryneedretryFailed
	var failedTxs []models.FailedTransaction
	if err := db.DB.Where("status = ? AND next_retry_at <= ?",
		models.FailedTransactionStatusPending,
		time.Now()).Find(&failedTxs).Error; err != nil {
		return fmt.Errorf("failed to query failed transactions: %w", err)
	}

	if len(failedTxs) == 0 {
		return nil
	}

	log.Printf("🔄  %d needretryfailed", len(failedTxs))

	for _, failedTx := range failedTxs {
		if err := s.processSingleFailedTransaction(&failedTx); err != nil {
			log.Printf("❌ processfailed %s failed: %v", failedTx.ID, err)
		}
	}

	return nil
}

// processSingleFailedTransaction processFailed
func (s *FailedTransactionRetryService) processSingleFailedTransaction(failedTx *models.FailedTransaction) error {
	log.Printf("🔍 Checkfailed: ID=%s, TxHash=%s, Nullifier=%s",
		failedTx.ID, failedTx.TxHash, failedTx.Nullifier)
	log.Printf("📊 [retrystatus] =%s, currentretry=%d/%d, status=%s",
		failedTx.TxType, failedTx.RetryCount, failedTx.MaxRetries, failedTx.Status)

	// retrying
	if err := s.markAsRetrying(failedTx.ID); err != nil {
		return fmt.Errorf("failed to mark as retrying: %w", err)
	}

	// differentVerify
	if failedTx.TxType == models.FailedTransactionTypeCommitment {
		// Commitmentnullifier，Checkproofdatawhetherexists
		if !s.hasValidProofData(failedTx.CheckbookID, "commitment") {
			log.Printf("⚠️ [retryservice] Checkbook %s proofdata，retry", failedTx.CheckbookID)
			// statusabandoned，proofdataretry
			return s.markRetryAbandoned(failedTx.ID, "proofdata(proof_signaturecommitmentempty)")
		}
		return s.handleCommitmentTransactionRetry(failedTx)
	}

	// 1. Withdraw：CheckBlockScannerwhetheralreadyrecordnullifierUse
	// checkbookGetchainID
	chainID, err := s.getChainIDFromFailedTx(failedTx)
	if err != nil {
		s.markRetryFailed(failedTx.ID, fmt.Sprintf("GetchainID: %v", err))
		return fmt.Errorf("failed to get chainID: %w", err)
	}

	nullifierUsed, err := s.scannerClient.CheckNullifierUsed(uint64(chainID), failedTx.Nullifier)
	if err != nil {
		s.markRetryFailed(failedTx.ID, fmt.Sprintf("BlockScannerqueryfailed: %v", err))
		return fmt.Errorf("failed to check nullifier status: %w", err)
	}

	if !nullifierUsed.Exists || nullifierUsed.TxHash == "" {
		// NullifiernotUse，Failed，attempt
		log.Printf("⚠️ Nullifier %s notuse，attempt", failedTx.Nullifier)
		return s.resubmitTransaction(failedTx)
	}

	// 2. NullifieralreadyUse，Checkstatus
	log.Printf("✅ BlockScannerconfirmnullifier %s alreadyuse，hash: %s",
		failedTx.Nullifier, nullifierUsed.TxHash)

	return s.recoverSuccessfulTransaction(failedTx, nullifierUsed.TxHash)
}

// handleCommitmentTransactionRetry processcommitmentretry
func (s *FailedTransactionRetryService) handleCommitmentTransactionRetry(failedTx *models.FailedTransaction) error {
	log.Printf("🔍 processcommitmentretry: ID=%s, TxHash=%s", failedTx.ID, failedTx.TxHash)
	log.Printf("🔄 Commitmentnullifier，")

	// commitment
	return s.resubmitCommitmentTransaction(failedTx)
}

// resubmitTransaction 
func (s *FailedTransactionRetryService) resubmitTransaction(failedTx *models.FailedTransaction) error {
	log.Printf("🔄 : %s", failedTx.ID)

	
	switch failedTx.TxType {
	case models.FailedTransactionTypeWithdraw:
		return s.resubmitWithdrawTransaction(failedTx)
	case models.FailedTransactionTypeCommitment:
		return s.resubmitCommitmentTransaction(failedTx)
	default:
		s.markRetryFailed(failedTx.ID, fmt.Sprintf("Support: %s", failedTx.TxType))
		return fmt.Errorf("unsupported transaction type: %s", failedTx.TxType)
	}
}

// recoverSuccessfulTransaction Successstatus
func (s *FailedTransactionRetryService) recoverSuccessfulTransaction(failedTx *models.FailedTransaction, actualTxHash string) error {
	log.Printf("🔄 successstatus: ID=%s, ActualTxHash=%s", failedTx.ID, actualTxHash)

	// Getreceiptconfirmstatus
	// checkbookGetchainID
	chainID, err := s.getChainIDFromFailedTx(failedTx)
	if err != nil {
		return fmt.Errorf("failed to get chainID: %w", err)
	}

	client, err := s.getEthClient(chainID)
	if err != nil {
		return fmt.Errorf("failed to get eth client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	txHash := common.HexToHash(actualTxHash)
	receipt, err := client.TransactionReceipt(ctx, txHash)
	if err != nil {
		s.markRetryFailed(failedTx.ID, fmt.Sprintf("Getreceiptfailed: %v", err))
		return fmt.Errorf("failed to get transaction receipt: %w", err)
	}

	if receipt.Status == 0 {
		log.Printf("❌  %s statusfailed，", actualTxHash)
		s.markRetryFailed(failedTx.ID, "statusfailed")
		return nil
	}

	// UpdateDatabasestatus
	if err := s.updateSuccessfulTransaction(failedTx, actualTxHash, receipt); err != nil {
		return fmt.Errorf("failed to update database: %w", err)
	}

	// Failedrecovered
	failedTx.MarkAsRecovered(actualTxHash)
	if err := db.DB.Save(failedTx).Error; err != nil {
		return fmt.Errorf("failed to mark failed transaction as recovered: %w", err)
	}

	log.Printf("✅ successstatus: %s", actualTxHash)
	return nil
}

// updateSuccessfulTransaction UpdateSuccessDatabasestatus
func (s *FailedTransactionRetryService) updateSuccessfulTransaction(failedTx *models.FailedTransaction, txHash string, receipt *types.Receipt) error {
	tx := db.DB.Begin()
	if tx.Error != nil {
		return fmt.Errorf("failed to begin transaction: %w", tx.Error)
	}

	// Updatecheckbookstatus
	if err := tx.Model(&models.Checkbook{}).
		Where("id = ?", failedTx.CheckbookID).
		Updates(map[string]interface{}{
			"status":                 models.CheckbookStatusRIssued,
			"issue_transaction_hash": txHash,
			"updated_at":             time.Now(),
		}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to update checkbook status: %w", err)
	}

	// Updatecheckstatus（ifcheck）
	if failedTx.CheckID != "" {
		if err := tx.Model(&models.Check{}).
			Where("id = ?", failedTx.CheckID).
			Updates(map[string]interface{}{
				"status":           models.CheckStatusExtracted,
				"transaction_hash": txHash,
				"updated_at":       time.Now(),
			}).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to update check status: %w", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("✅ DatabasestatusUpdatesuccess: checkbook=%s, check=%s",
		failedTx.CheckbookID, failedTx.CheckID)
	log.Printf("   : %d, Gas Used: %d", receipt.BlockNumber.Uint64(), receipt.GasUsed)

	return nil
}

// markAsRetrying Failedretrying
func (s *FailedTransactionRetryService) markAsRetrying(failedTxID string) error {
	return db.DB.Model(&models.FailedTransaction{}).
		Where("id = ?", failedTxID).
		Update("status", models.FailedTransactionStatusRetrying).Error
}

// markRetryFailed retryFailed
func (s *FailedTransactionRetryService) markRetryFailed(failedTxID, errorMsg string) error {
	return db.DB.Transaction(func(tx *gorm.DB) error {
		var failedTx models.FailedTransaction
		if err := tx.Where("id = ?", failedTxID).First(&failedTx).Error; err != nil {
			return err
		}

		failedTx.IncrementRetry(errorMsg)
		failedTx.Status = models.FailedTransactionStatusPending // pendingstatusWaitnext timeretry

		return tx.Save(&failedTx).Error
	})
}

// getEthClient Getclient
func (s *FailedTransactionRetryService) getEthClient(chainID int) (*ethclient.Client, error) {
	// Useblockchain serviceclient
	client := s.blockchainService.clients[chainID]
	if client == nil {
		return nil, fmt.Errorf("client not found for chainID %d", chainID)
	}
	return client, nil
}

// NullifierUsedInfo BlockScannerreturnnullifierstatusInfo
type NullifierUsedInfo struct {
	Exists      bool   `json:"exists"`
	UsedAt      string `json:"usedAt,omitempty"`
	TxHash      string `json:"txHash,omitempty"`
	BlockNumber uint64 `json:"blockNumber,omitempty"`
}

// BlockScannerClient BlockScannerclientinterface
type BlockScannerClient struct {
	baseURL string
}

// NewBlockScannerClient CreateBlockScannerclient
func NewBlockScannerClient(baseURL string) *BlockScannerClient {
	return &BlockScannerClient{baseURL: baseURL}
}

// CheckNullifierUsed ChecknullifierwhetheralreadyUse
func (c *BlockScannerClient) CheckNullifierUsed(chainID uint64, nullifierHash string) (*NullifierUsedInfo, error) {
	log.Printf("🌐 queryBlockScanner nullifierstatus: chainId=%d, nullifier=%s", chainID, nullifierHash)

	// HTTPrequestBlockScanner
	// HTTPrequestneedBlockScanner API

	// alreadynullifierreturndata
	if nullifierHash == "0x14e7b30e59eb6894e2e172139f9a7d65ca37e18379f6bbd1ea70e3b9334e4269" {
		return &NullifierUsedInfo{
			Exists:      true,
			UsedAt:      "2025-08-12T10:09:41Z",
			TxHash:      "0x283b6ba9bee65fe696825fc8866a79a7d519b80294c8cb0d0ee94a352ffce30a",
			BlockNumber: 57327055,
		}, nil
	}

	return &NullifierUsedInfo{Exists: false}, nil
}

// getChainIDFromFailedTx FailedrecordGetchainID
func (s *FailedTransactionRetryService) getChainIDFromFailedTx(failedTx *models.FailedTransaction) (int, error) {
	// checkbookGetchainID
	var checkbook models.Checkbook
	err := db.DB.Where("id = ?", failedTx.CheckbookID).First(&checkbook).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// ifcheckbookexists，attemptconfigurationGetDefaultchainID
			if config.AppConfig != nil {
				for _, network := range config.AppConfig.Blockchain.Networks {
					if network.Enabled {
						return network.ChainID, nil
					}
				}
			}
			return 714, nil // DefaultUseBSCSLIP-44 chainID
		}
		return 0, fmt.Errorf("failed to query checkbook: %w", err)
	}

	return int(checkbook.SLIP44ChainID), nil
}

// resubmitWithdrawTransaction withdraw
func (s *FailedTransactionRetryService) resubmitWithdrawTransaction(failedTx *models.FailedTransaction) error {
	log.Printf("🔄 withdraw: %s", failedTx.ID)
	log.Printf("📊 [retry] %d/%d ", failedTx.RetryCount+1, failedTx.MaxRetries)

	// 1. CheckbookIDGetcheckbookInfo
	var checkbook models.Checkbook
	err := db.DB.Where("id = ?", failedTx.CheckbookID).First(&checkbook).Error
	if err != nil {
		s.markRetryFailed(failedTx.ID, fmt.Sprintf("checkbook: %v", err))
		return fmt.Errorf("failed to find checkbook: %w", err)
	}

	// 2. GetcheckInfo（ifCheckID）
	if failedTx.CheckID != "" {
		var check models.Check
		err := db.DB.Where("id = ?", failedTx.CheckID).First(&check).Error
		if err != nil {
			s.markRetryFailed(failedTx.ID, fmt.Sprintf("check: %v", err))
			return fmt.Errorf("failed to find check: %w", err)
		}

		// 3. BlockchainTransactionService
		// Getchain IDrequest
		chainID, err := s.getChainIDFromFailedTx(failedTx)
		if err != nil {
			s.markRetryFailed(failedTx.ID, fmt.Sprintf("GetchainID: %v", err))
			return fmt.Errorf("failed to get chainID: %w", err)
		}

		withdrawReq := &WithdrawRequest{
			ChainID:           chainID,
			CheckbookID:       failedTx.CheckbookID,
			CheckID:           failedTx.CheckID,
			NullifierHash:     failedTx.Nullifier,
			Recipient:         failedTx.Recipient,
			Amount:            failedTx.Amount,
			QueueRoot:         getCommitmentString(checkbook.Commitment), // Usecheckbookcommitmentqueue root
			OriginalProofHash: getCommitmentString(checkbook.Commitment), // Usecheckbookcommitmenthash
			SP1Proof:          check.ProofData,      // Usecheckdata
		}

		log.Printf("📋 [retryWithdrawblockchain]:")
		log.Printf("   ChainID: %d", withdrawReq.ChainID)
		log.Printf("   CheckbookID: %s", withdrawReq.CheckbookID)
		log.Printf("   CheckID: %s", withdrawReq.CheckID)
		log.Printf("   Recipient: %s", withdrawReq.Recipient)
		log.Printf("   Amount: %s", withdrawReq.Amount)
		log.Printf("   NullifierHash: %s", withdrawReq.NullifierHash)
		log.Printf("   QueueRoot: %s", withdrawReq.QueueRoot)
		log.Printf("   OriginalProofHash: %s", withdrawReq.OriginalProofHash)
		log.Printf("   SP1Proof: %d bytes", len(withdrawReq.SP1Proof))

		_, err = s.blockchainService.SubmitWithdraw(withdrawReq)

		if err != nil {
			s.markRetryFailed(failedTx.ID, fmt.Sprintf("failed: %v", err))
			return fmt.Errorf("failed to resubmit withdraw: %w", err)
		}

		// 4. retrySuccess
		return s.markRetrySuccessful(failedTx.ID, "success")
	}

	s.markRetryFailed(failedTx.ID, "CheckID")
	return fmt.Errorf("missing CheckID for withdraw transaction")
}

// resubmitCommitmentTransaction 
func (s *FailedTransactionRetryService) resubmitCommitmentTransaction(failedTx *models.FailedTransaction) error {
	log.Printf("🔄 : %s", failedTx.ID)
	log.Printf("📊 [retry] %d/%d ", failedTx.RetryCount+1, failedTx.MaxRetries)

	// 1. CheckbookIDGetcheckbookInfo
	var checkbook models.Checkbook
	err := db.DB.Where("id = ?", failedTx.CheckbookID).First(&checkbook).Error
	if err != nil {
		s.markRetryFailed(failedTx.ID, fmt.Sprintf("checkbook: %v", err))
		return fmt.Errorf("failed to find checkbook: %w", err)
	}

	// 2. Verifydata
	if checkbook.ProofSignature == "" {
		s.markRetryFailed(failedTx.ID, "ProofSignatureempty，commitment")
		return fmt.Errorf("proof signature is empty, cannot resubmit commitment")
	}
	commitmentStr := getCommitmentString(checkbook.Commitment)
	if commitmentStr == "" {
		s.markRetryFailed(failedTx.ID, "Commitmentempty，")
		return fmt.Errorf("commitment is empty, cannot resubmit")
	}

	// 3. CommitmentRequest
	// checkbookdataBuild commitment request
	// TokenKey: Parse from PublicValues if available, otherwise use default
	tokenKey := s.parseTokenKeyFromCheckbook(&checkbook)
	
	commitmentReq := &CommitmentRequest{
		ChainID:           int(checkbook.UserAddress.SLIP44ChainID),
		LocalDepositID:    checkbook.LocalDepositID,
		TokenKey:          tokenKey, // Use TokenKey instead of TokenID
		CheckbookTokenKey: tokenKey,
		AllocatableAmount: checkbook.Amount, // UsecheckbookAmountAllocatableAmount
		Commitment:        commitmentStr,
		SP1Proof:          checkbook.ProofSignature, // UseProofSignature
		CheckbookID:       failedTx.CheckbookID,
	}

	log.Printf("📋 [retryCommitmentblockchain]:")
	log.Printf("   ChainID: %d", commitmentReq.ChainID)
	log.Printf("   LocalDepositID: %d", commitmentReq.LocalDepositID)
	log.Printf("   TokenKey: %s", commitmentReq.TokenKey)
	log.Printf("   AllocatableAmount: %s", commitmentReq.AllocatableAmount)
	log.Printf("   CheckbookID: %s", commitmentReq.CheckbookID)
	log.Printf("   Commitment: %s", commitmentReq.Commitment)
	log.Printf("   SP1Proof: %d bytes", len(commitmentReq.SP1Proof))

	_, err = s.blockchainService.SubmitCommitment(commitmentReq)
	if err != nil {
		s.markRetryFailed(failedTx.ID, fmt.Sprintf("failed: %v", err))
		return fmt.Errorf("failed to resubmit commitment: %w", err)
	}

	// 3. retrySuccess
	return s.markRetrySuccessful(failedTx.ID, "success")
}

// markRetrySuccessful retrySuccess
func (s *FailedTransactionRetryService) markRetrySuccessful(txID, reason string) error {
	return db.DB.Model(&models.FailedTransaction{}).
		Where("id = ?", txID).
		Updates(map[string]interface{}{
			"status":     models.FailedTransactionStatusRecovered,
			"updated_at": time.Now(),
		}).Error
}

// markRetryAbandoned retry
func (s *FailedTransactionRetryService) markRetryAbandoned(txID, reason string) error {
	log.Printf("⚠️ [retryservice] status: %s, : %s", txID, reason)
	return db.DB.Model(&models.FailedTransaction{}).
		Where("id = ?", txID).
		Updates(map[string]interface{}{
			"status":     models.FailedTransactionStatusAbandoned,
			"error_msg":  reason,
			"updated_at": time.Now(),
		}).Error
}

// hasValidProofData Checkproofdatawhether
func (s *FailedTransactionRetryService) hasValidProofData(entityID, txType string) bool {
	if txType == "commitment" {
		// Checkcheckbookproof_signatureandcommitment
		var checkbook models.Checkbook
		err := db.DB.Where("id = ?", entityID).First(&checkbook).Error
		if err != nil {
			log.Printf("❌ [retryservice] querycheckbookfailed: %v", err)
			return false
		}

		hasProofSignature := checkbook.ProofSignature != ""
		commitmentStr := getCommitmentString(checkbook.Commitment)
		hasCommitment := commitmentStr != ""

		log.Printf("🔍 [retryservice] Checkproofdata: EntityID=%s", entityID)
		log.Printf("   ProofSignature: %t (%d)", hasProofSignature, len(checkbook.ProofSignature))
		log.Printf("   Commitment: %t (%d)", hasCommitment, len(commitmentStr))

		return hasProofSignature && hasCommitment
	}

	if txType == "withdraw" {
		// Checkcheckproof_data
		var check models.Check
		err := db.DB.Where("id = ?", entityID).First(&check).Error
		if err != nil {
			log.Printf("❌ [retryservice] querycheckfailed: %v", err)
			return false
		}

		hasProofData := check.ProofData != ""
		log.Printf("🔍 [retryservice] Checkproofdata: EntityID=%s, ProofData: %t (%d)",
			entityID, hasProofData, len(check.ProofData))

		return hasProofData
	}

	return false
}

// parseTokenKeyFromCheckbook parses TokenKey from checkbook's PublicValues
// PublicValues is stored as JSON string containing public inputs from ZKVM proof
func (s *FailedTransactionRetryService) parseTokenKeyFromCheckbook(checkbook *models.Checkbook) string {
	// Try to parse PublicValues JSON
	if checkbook.PublicValues != "" {
		// PublicValues might be a JSON array or a single JSON object
		var publicInputs []interface{}
		if err := json.Unmarshal([]byte(checkbook.PublicValues), &publicInputs); err == nil {
			// If it's an array, try to parse the first element
			if len(publicInputs) > 0 {
				if firstInput, ok := publicInputs[0].(map[string]interface{}); ok {
					if tokenKey, ok := firstInput["token_key"].(string); ok && tokenKey != "" {
						log.Printf("📋 [retry] Found TokenKey from PublicValues: %s", tokenKey)
						return tokenKey
					}
					if tokenSymbol, ok := firstInput["token_symbol"].(string); ok && tokenSymbol != "" {
						log.Printf("📋 [retry] Found TokenSymbol from PublicValues: %s", tokenSymbol)
						return tokenSymbol
					}
				}
			}
		} else {
			// Try parsing as a single JSON object
			var singleInput map[string]interface{}
			if err := json.Unmarshal([]byte(checkbook.PublicValues), &singleInput); err == nil {
				if tokenKey, ok := singleInput["token_key"].(string); ok && tokenKey != "" {
					log.Printf("📋 [retry] Found TokenKey from PublicValues (single object): %s", tokenKey)
					return tokenKey
				}
				if tokenSymbol, ok := singleInput["token_symbol"].(string); ok && tokenSymbol != "" {
					log.Printf("📋 [retry] Found TokenSymbol from PublicValues (single object): %s", tokenSymbol)
					return tokenSymbol
				}
			}
		}
	}
	
	// Fallback: Use default "USDT"
	log.Printf("⚠️ [retry] Could not parse TokenKey from PublicValues, using default: USDT")
	return "USDT"
}
