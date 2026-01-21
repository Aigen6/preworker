package services

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/config"
	"go-backend/internal/models"
	"go-backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// isTronAddress CheckwhetherTRONaddress
func isTronAddress(address string) bool {
	return address != "" && strings.HasPrefix(address, "T") && len(address) == 34
}

// isEvmAddress CheckwhetherEVMaddress
func isEvmAddress(address string) bool {
	if address == "" {
		return false
	}
	// Checkwhether0xor40
	if strings.HasPrefix(strings.ToLower(address), "0x") {
		return len(address) == 42
	}
	// Checkwhether40
	if len(address) == 40 {
		hexPattern := regexp.MustCompile("^[0-9a-fA-F]{40}$")
		return hexPattern.MatchString(address)
	}
	return false
}

// BlockchainEventProcessor blockchain event processor
type BlockchainEventProcessor struct {
	db               *gorm.DB
	queueRootManager *QueueRootManager
	pushService      *WebSocketPushService
	dbWithPush       *DatabaseWithPushService // DatabaseUpdate+pushservice
	decimalConverter *utils.DecimalConverter  // TokenConvert
}

// NewBlockchainEventProcessor Createblockchain event processor
func NewBlockchainEventProcessor(db *gorm.DB, pushService *WebSocketPushService, dbWithPush *DatabaseWithPushService) *BlockchainEventProcessor {
	// CreateBlockScanner API client - Useconfigurationinterface
	blockScannerURL := config.GetScannerURL()
	blockScannerAPI := clients.NewBlockScannerAPIClient(blockScannerURL)

	// Createqueue rootmanager
	queueRootManager := NewQueueRootManager(db, blockScannerAPI)

	// configuration fileLoadTokenconfiguration
	var decimalConverter *utils.DecimalConverter
	if len(config.AppConfig.Tokens.ChainDecimals) > 0 {
		decimalConverter = utils.NewDecimalConverterWithConfig(config.AppConfig.Tokens.ChainDecimals)
	} else {
		decimalConverter = utils.NewDecimalConverter() // UseDefaultConfiguration
	}

	return &BlockchainEventProcessor{
		db:               db,
		queueRootManager: queueRootManager,
		pushService:      pushService,
		dbWithPush:       dbWithPush,
		decimalConverter: decimalConverter, // Useconfiguration fileorDefaultconfiguration
	}
}

// ============ eventprocess ============

// ProcessDepositReceived process Treasury.DepositReceived event
func (p *BlockchainEventProcessor) ProcessDepositReceived(event *clients.EventDepositReceivedResponse) error {
	log.Printf("📥 [start] processDepositReceivedevent: Chain=%d, LocalDepositId=%d", event.ChainID, event.EventData.LocalDepositId)
	log.Printf("🔍 [event] Depositor=%s, Amount=%s, Token=%s", event.EventData.Depositor, event.EventData.Amount, event.EventData.Token)

	// 1. saveevent
	log.Printf("💾 [1] startsaveDepositReceivedeventDatabase...")
	eventRecord := &models.EventDepositReceived{
		ChainID:         int64(event.ChainID), // unified Chain ID field
		SLIP44ChainID:   int64(event.ChainID), // compatible with legacy code
		ContractAddress: event.ContractAddress,
		EventName:       event.EventName,
		BlockNumber:     event.BlockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        event.LogIndex,
		BlockTimestamp:  event.BlockTimestamp,

		// Event Data
		Depositor:      event.EventData.Depositor,
		Token:          event.EventData.Token,
		Amount:         event.EventData.Amount,
		LocalDepositId: event.EventData.LocalDepositId,
		// note：storageevent.EventData.ChainId（eventEVMchain ID），UseNATS subjectParseSLIP-44 chain ID
		PromoteCode: event.EventData.PromoteCode,
	}

	log.Printf("🔧 [data] EventRecord: ChainID=%d, TxHash=%s, LocalDepositId=%d",
		eventRecord.SLIP44ChainID, eventRecord.TransactionHash, eventRecord.LocalDepositId)

	// UseUpsert：attempt，existsthenCreate，existsthenUpdate
	var existingEvent models.EventDepositReceived
	err := p.db.Where("chain_id = ? AND transaction_hash = ? AND log_index = ?",
		event.ChainID, event.TransactionHash, event.LogIndex).First(&existingEvent).Error

	if err == gorm.ErrRecordNotFound {
		// exists，Createrecord
		if err := p.db.Create(eventRecord).Error; err != nil {
			log.Printf("❌ [failed] CreateDepositReceivedeventfailed: %v", err)
			return err
		}
		log.Printf("✅ [] DepositReceivedeventalreadyCreate, ID=%d", eventRecord.ID)
	} else if err != nil {
		log.Printf("❌ [queryfailed] queryDepositReceivedeventfailed: %v", err)
		return err
	} else {
		// exists，Updaterecord
		updates := map[string]interface{}{
			"depositor":        event.EventData.Depositor,
			"token":            event.EventData.Token,
			"amount":           event.EventData.Amount,
			"local_deposit_id": event.EventData.LocalDepositId,
			"promote_code":     event.EventData.PromoteCode,
			"updated_at":       time.Now(),
		}
		if err := p.db.Model(&existingEvent).Updates(updates).Error; err != nil {
			log.Printf("❌ [failed] UpdateDepositReceivedeventfailed: %v", err)
			return err
		}
		eventRecord.ID = existingEvent.ID
		log.Printf("✅ [Update] DepositReceivedeventalreadyUpdate, ID=%d", eventRecord.ID)
	}

	// 2. ：CreateCheckbookrecord（ifexists）
	log.Printf("📝 [2] startCreate/UpdateCheckbookrecord...")
	if err := p.createOrUpdateCheckbook(event); err != nil {
		log.Printf("❌ [failed] CreateCheckbookfailed: %v", err)
		return err
	}

	log.Printf("✅ [completed] DepositReceivedeventprocesscompleted: EventID=%d", eventRecord.ID)
	return nil
}

// ProcessDepositRecorded process ZKPayProxy.DepositRecorded event
func (p *BlockchainEventProcessor) ProcessDepositRecorded(event *clients.EventDepositRecordedResponse) error {
	log.Printf("🚀 [ProcessDepositRecorded] Function called! Chain=%d, LocalDepositId=%d", event.ChainID, event.EventData.LocalDepositId)

	// Ensure tokenKey mapper is initialized
	utils.InitTokenKeyHashMap()

	// Convert tokenKey hash to original string (e.g., "USDT")
	// Solidity indexed string is encoded as keccak256 hash, we need to convert it back
	log.Printf("🔍 [ProcessDepositRecorded] Converting tokenKey hash: %s", event.EventData.TokenKey)
	originalTokenKey := utils.GetTokenKeyFromHash(event.EventData.TokenKey)
	log.Printf("🔍 [ProcessDepositRecorded] Converted tokenKey: %s", originalTokenKey)
	log.Printf("📥 [ProcessDepositRecorded] processDepositRecordedevent: Chain=%d, LocalDepositId=%d, TokenKey=%s (hash: %s), AllocatableAmount=%s, FeeTotalLocked=%s",
		event.ChainID, event.EventData.LocalDepositId, originalTokenKey, event.EventData.TokenKey, event.EventData.AllocatableAmount, event.EventData.FeeTotalLocked)

	// 1. saveevent
	// Convert Owner address to Universal Address format (32-byte)
	normalizedOwner := utils.NormalizeAddressForChain(strings.TrimSpace(event.EventData.Owner.Data), int(event.ChainID))
	var ownerUniversalAddress string
	if utils.IsUniversalAddress(normalizedOwner) {
		ownerUniversalAddress = normalizedOwner
	} else if utils.IsEvmAddress(normalizedOwner) {
		universalAddr, err := utils.EvmToUniversalAddress(normalizedOwner)
		if err != nil {
			return fmt.Errorf("failed to convert Owner address to Universal Address: %w", err)
		}
		ownerUniversalAddress = universalAddr
	} else if utils.IsTronAddress(normalizedOwner) {
		universalAddr, err := utils.TronToUniversalAddress(normalizedOwner)
		if err != nil {
			return fmt.Errorf("failed to convert Owner address to Universal Address: %w", err)
		}
		ownerUniversalAddress = universalAddr
	} else {
		return fmt.Errorf("unsupported Owner address format: %s", normalizedOwner)
	}

	eventRecord := &models.EventDepositRecorded{
		ChainID:         int64(event.ChainID), // unified Chain ID field
		SLIP44ChainID:   int64(event.ChainID), // compatible with legacy code
		ContractAddress: event.ContractAddress,
		EventName:       event.EventName,
		BlockNumber:     event.BlockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        event.LogIndex,
		BlockTimestamp:  event.BlockTimestamp,

		// Event Data
		LocalDepositId:    event.EventData.LocalDepositId,
		TokenId:           event.EventData.TokenId,
		OwnerChainId:      event.EventData.Owner.ChainId,
		OwnerData:         ownerUniversalAddress, // 32-byte Universal Address
		GrossAmount:       event.EventData.GrossAmount,
		FeeTotalLocked:    event.EventData.FeeTotalLocked,
		AllocatableAmount: event.EventData.AllocatableAmount,
		PromoteCode:       event.EventData.PromoteCode,
		AddressRank:       event.EventData.AddressRank,
		DepositTxHash:     event.EventData.DepositTxHash,
		EventBlockNumber:  event.EventData.BlockNumber,
		EventTimestamp:    event.EventData.Timestamp,
	}

	// UseUpsert：attempt，existsthenCreate，existsthenUpdate
	var existingEvent models.EventDepositRecorded
	err := p.db.Where("chain_id = ? AND transaction_hash = ? AND log_index = ?",
		event.ChainID, event.TransactionHash, event.LogIndex).First(&existingEvent).Error

	if err == gorm.ErrRecordNotFound {
		// exists，Createrecord
		if err := p.db.Create(eventRecord).Error; err != nil {
			log.Printf("❌ [failed] CreateDepositRecordedeventfailed: %v", err)
			return err
		}
		log.Printf("✅ [] DepositRecordedeventalreadyCreate, ID=%d", eventRecord.ID)
	} else if err != nil {
		log.Printf("❌ [queryfailed] queryDepositRecordedeventfailed: %v", err)
		return err
	} else {
		// exists，Updaterecord - ：Updateowner_data
		updates := map[string]interface{}{
			"local_deposit_id":   event.EventData.LocalDepositId,
			"token_id":           event.EventData.TokenId,
			"owner_chain_id":     event.EventData.Owner.ChainId,
			"owner_data":         event.EventData.Owner.Data,
			"gross_amount":       event.EventData.GrossAmount,
			"fee_total_locked":   event.EventData.FeeTotalLocked,
			"allocatable_amount": event.EventData.AllocatableAmount,
			"promote_code":       event.EventData.PromoteCode,
			"address_rank":       event.EventData.AddressRank,
			"deposit_tx_hash":    event.EventData.DepositTxHash,
			"event_block_number": event.EventData.BlockNumber,
			"event_timestamp":    event.EventData.Timestamp,
			"updated_at":         time.Now(),
		}
		if err := p.db.Model(&existingEvent).Updates(updates).Error; err != nil {
			log.Printf("❌ [failed] UpdateDepositRecordedeventfailed: %v", err)
			return err
		}
		eventRecord.ID = existingEvent.ID
		log.Printf("✅ [Update] DepositRecordedeventalreadyUpdate, ID=%d, OwnerData=%s", eventRecord.ID, event.EventData.Owner.Data)
	}

	// 2. ：CreateorUpdateDepositInforecord
	depositInfo := &models.DepositInfo{
		SLIP44ChainID:  uint32(event.ChainID), // UseNATS subjectParseSLIP-44 chain ID
		ChainID:        event.ChainID,         // Setchain_id
		LocalDepositID: event.EventData.LocalDepositId,
		TokenID:        event.EventData.TokenId,
		Owner: models.UniversalAddress{
			SLIP44ChainID: uint32(event.ChainID), // UseNATS subjectParseSLIP-44 chain ID
			Data:          event.EventData.Owner.Data,
		},
		GrossAmount:       event.EventData.GrossAmount,
		FeeTotalLocked:    event.EventData.FeeTotalLocked,
		AllocatableAmount: event.EventData.AllocatableAmount,
		PromoteCode:       event.EventData.PromoteCode,
		AddressRank:       event.EventData.AddressRank,
		DepositTxHash:     event.EventData.DepositTxHash,
		BlockNumber:       event.EventData.BlockNumber,
		ContractTimestamp: event.EventData.Timestamp,
		Used:              false, // statusnotUse
	}

	// UseUpsert：attempt，existsthenCreate，existsthenUpdate
	// Note: Primary key is (slip44_chain_id, local_deposit_id), so query using slip44_chain_id
	var existingDepositInfo models.DepositInfo
	err = p.db.Where("slip44_chain_id = ? AND local_deposit_id = ?",
		event.ChainID, event.EventData.LocalDepositId).First(&existingDepositInfo).Error

	needUpdate := false
	if err == gorm.ErrRecordNotFound {
		// Record not found, try to create
		if err := p.db.Create(depositInfo).Error; err != nil {
			// Handle duplicate key error (race condition - record was created by another process)
			if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "23505") {
				log.Printf("⚠️ [duplicate] DepositInforecordalreadyexists, attemptingupdate...")
				// Record was created by another process, query and update it
				err = p.db.Where("slip44_chain_id = ? AND local_deposit_id = ?",
					event.ChainID, event.EventData.LocalDepositId).First(&existingDepositInfo).Error
				if err != nil {
					log.Printf("❌ [queryfailed] queryDepositInforecordafterduplicatefailed: %v", err)
					return err
				}
				needUpdate = true
			} else {
				log.Printf("❌ [failed] CreateDepositInforecordfailed: %v", err)
				return err
			}
		} else {
			log.Printf("✅ [] DepositInforecordalreadyCreate, ChainID=%d, LocalDepositID=%d, OwnerData=%s",
				depositInfo.SLIP44ChainID, depositInfo.LocalDepositID, depositInfo.Owner.Data)
		}
	} else if err != nil {
		log.Printf("❌ [queryfailed] queryDepositInforecordfailed: %v", err)
		return err
	} else {
		// Record exists, need to update
		needUpdate = true
	}

	// Update existing record if needed
	if needUpdate {
		// Check if associated Checkbook status has progressed beyond ready_for_commitment
		// If so, skip update to avoid rolling back progress
		var checkbook models.Checkbook
		err := p.db.Where("chain_id = ? AND local_deposit_id = ?",
			event.ChainID, event.EventData.LocalDepositId).First(&checkbook).Error

		if err == nil {
			// Checkbook exists, check its status
			statusProgression := p.getStatusProgression()
			currentLevel, exists := statusProgression[checkbook.Status]
			readyForCommitmentLevel := statusProgression[models.CheckbookStatusReadyForCommitment]

			if !exists {
				// Status not in progression map (e.g., failure states), allow update
				log.Printf("⚠️ [unknown] DepositInforecordupdate: Checkbookstatus=%s notinprogressionmap, allowupdate",
					checkbook.Status)
			} else if currentLevel > readyForCommitmentLevel {
				// Status has progressed beyond ready_for_commitment, skip update
				log.Printf("⚠️ [skip] DepositInforecordupdate: Checkbookstatus=%s (level=%d) > ready_for_commitment (level=%d), skipupdatetoavoidrollback",
					checkbook.Status, currentLevel, readyForCommitmentLevel)
				needUpdate = false
			} else {
				log.Printf("✅ [allow] DepositInforecordupdate: Checkbookstatus=%s (level=%d) <= ready_for_commitment (level=%d), allowupdate",
					checkbook.Status, currentLevel, readyForCommitmentLevel)
			}
		} else if err != gorm.ErrRecordNotFound {
			// Query error (not just not found), log but continue with update
			log.Printf("⚠️ [query] Checkbookqueryfailed: %v, continuewithDepositInfoupdate", err)
		}
		// If Checkbook not found, allow update (Checkbook will be created later)

		if needUpdate {
			updates := map[string]interface{}{
				"chain_id":           event.ChainID, // chain_idUpdate
				"token_id":           event.EventData.TokenId,
				"owner_chain_id":     event.EventData.Owner.ChainId,
				"owner_data":         event.EventData.Owner.Data, // 🔧 ：Updateowner_data
				"gross_amount":       event.EventData.GrossAmount,
				"fee_total_locked":   event.EventData.FeeTotalLocked,
				"allocatable_amount": event.EventData.AllocatableAmount,
				"promote_code":       event.EventData.PromoteCode,
				"address_rank":       event.EventData.AddressRank,
				"deposit_tx_hash":    event.EventData.DepositTxHash,
				"block_number":       event.EventData.BlockNumber,
				"contract_timestamp": event.EventData.Timestamp,
				"updated_at":         time.Now(),
			}
			if err := p.db.Model(&existingDepositInfo).Updates(updates).Error; err != nil {
				log.Printf("❌ [failed] UpdateDepositInforecordfailed: %v", err)
				return err
			}
			log.Printf("✅ [Update] DepositInforecordalreadyUpdate, ChainID=%d, LocalDepositID=%d, OwnerData=%s",
				event.ChainID, event.EventData.LocalDepositId, event.EventData.Owner.Data)
		}
	}

	// 3. ：UpdateCheckbookstatusready_for_commitment
	log.Printf("📝 [3] startUpdateCheckbookstatusready_for_commitment...")
	if err := p.updateCheckbookToReadyForCommitment(event); err != nil {
		log.Printf("❌ [failed] UpdateCheckbookstatusfailed: %v", err)
		// Return error to ensure the caller knows the checkbook creation/update failed
		return fmt.Errorf("UpdateCheckbookstatusfailed: %w", err)
	} else {
		log.Printf("✅ [3] UpdateCheckbookstatuscompleted")
	}

	// 4. Fee query records are now managed by KYT Oracle service
	// No need to update fee_query_records table in backend

	log.Printf("✅ DepositRecordedeventprocesscompleted: ID=%d, DepositInfoCreatesuccess", eventRecord.ID)
	return nil
}

// ProcessDepositUsed process ZKPayProxy.DepositUsed event
func (p *BlockchainEventProcessor) ProcessDepositUsed(event *clients.EventDepositUsedResponse) error {
	log.Printf("📥 processDepositUsedevent: Chain=%d, LocalDepositId=%d, Commitment=%s", event.ChainID, event.EventData.LocalDepositId, event.EventData.Commitment)

	// 1. saveevent
	eventRecord := &models.EventDepositUsed{
		ChainID:         int64(event.ChainID), // unified Chain ID field
		SLIP44ChainID:   int64(event.ChainID), // compatible with legacy code
		ContractAddress: event.ContractAddress,
		EventName:       event.EventName,
		BlockNumber:     event.BlockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        event.LogIndex,
		BlockTimestamp:  event.BlockTimestamp,

		// Event Data
		EventChainId:   uint32(event.ChainID), // UseNATS subjectParseSLIP-44 chain ID
		LocalDepositId: event.EventData.LocalDepositId,
		Commitment:     event.EventData.Commitment,
		PromoteCode:    event.EventData.PromoteCode,
	}

	if err := p.db.Create(eventRecord).Error; err != nil {
		log.Printf("❌ saveDepositUsedeventfailed: %v", err)
		return err
	}

	// 2. ：DepositInfoalreadyUse
	// Note: Primary key is (slip44_chain_id, local_deposit_id), so query using slip44_chain_id
	result := p.db.Model(&models.DepositInfo{}).
		Where("slip44_chain_id = ? AND local_deposit_id = ?", event.ChainID, event.EventData.LocalDepositId).
		Update("used", true)

	if result.Error != nil {
		log.Printf("❌ UpdateDepositInfousestatusfailed: %v", result.Error)
		return result.Error
	}

	if result.RowsAffected == 0 {
		log.Printf("⚠️ notcorresponding toDepositInforecord: ChainID=%d, LocalDepositId=%d", event.ChainID, event.EventData.LocalDepositId)
	}

	// 3. ：UpdateCheckbookstatuswith_checkbook
	log.Printf("📝 [3] startUpdateCheckbookstatuswith_checkbook...")
	var affectedCheckbooks []models.Checkbook
	if err := p.db.Where("chain_id = ? AND local_deposit_id = ?",
		event.ChainID, event.EventData.LocalDepositId).Find(&affectedCheckbooks).Error; err != nil {
		log.Printf("❌ Checkbookfailed: ChainID=%d, LocalDepositId=%d, Error=%v",
			event.ChainID, event.EventData.LocalDepositId, err)
	} else {
		updatedCount := 0
		targetStatus := models.CheckbookStatusWithCheckbook
		for i := range affectedCheckbooks {
			checkbook := &affectedCheckbooks[i]
			advanced, err := p.advanceCheckbookStatus(checkbook, targetStatus, "DepositUsed")
			if err != nil {
				log.Printf("❌ processCheckbook[%s]statusfailed: %v", checkbook.ID, err)
				continue
			}
			if advanced {
				updatedCount++
			}
		}
		log.Printf("✅ [3] DepositUsedeventUpdateCheckbookstatus: %d, successUpdate%d", len(affectedCheckbooks), updatedCount)
	}

	log.Printf("✅ DepositUsedeventprocesscompleted: ID=%d, =%d", eventRecord.ID, result.RowsAffected)
	return nil
}

// ProcessCommitmentRootUpdated process ZKPayProxy.CommitmentRootUpdated event
func (p *BlockchainEventProcessor) ProcessCommitmentRootUpdated(event *clients.EventCommitmentRootUpdatedResponse) error {
	log.Printf("📥 processCommitmentRootUpdatedevent: Chain=%d, OldRoot=%s, NewRoot=%s", event.ChainID, event.EventData.OldRoot, event.EventData.NewRoot)

	// 1. saveevent
	eventRecord := &models.EventCommitmentRootUpdated{
		ChainID:         int64(event.ChainID), // unified Chain ID field
		SLIP44ChainID:   int64(event.ChainID), // compatible with legacy code
		ContractAddress: event.ContractAddress,
		EventName:       event.EventName,
		BlockNumber:     event.BlockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        event.LogIndex,
		BlockTimestamp:  event.BlockTimestamp,

		// Event Data
		OldRoot:    event.EventData.OldRoot,
		Commitment: event.EventData.Commitment,
		NewRoot:    event.EventData.NewRoot,
	}

	if err := p.db.Create(eventRecord).Error; err != nil {
		log.Printf("❌ saveCommitmentRootUpdatedeventfailed: %v", err)
		return err
	}

	// 2. ：Usequeue rootmanagerbidirectional linked list
	if err := p.queueRootManager.ProcessCommitmentRootUpdated(event); err != nil {
		log.Printf("❌ queue rootmanagerprocessfailed: %v", err)
		return err
	}

	// 3. UpdateCheckbookstatus - status
	// ：CommitmentRootUpdated.commitment -> DepositUsed.commitment -> (ChainID + LocalDepositId) -> Checkbook
	// ：ifcommitmentempty，querymatchrecord
	if event.EventData.Commitment == "" {
		log.Printf("⚠️ [CommitmentRootUpdated] Commitmentempty，CheckbookstatusUpdate")
		log.Printf("✅ CommitmentRootUpdatedeventprocesscompleted: ID=%d, statusUpdate（Commitmentempty）", eventRecord.ID)
		return nil
	}

	// 1: commitmentDepositUsedrecord
	var depositUsedEvents []models.EventDepositUsed
	if err := p.db.Where("commitment = ?", event.EventData.Commitment).Find(&depositUsedEvents).Error; err != nil {
		log.Printf("❌ DepositUsedrecordfailed: %v", err)
		return fmt.Errorf("DepositUsedrecordfailed: %w", err)
	}

	if len(depositUsedEvents) == 0 {
		log.Printf("⚠️ [CommitmentRootUpdated] notcorresponding toDepositUsedrecord，Commitment=%s", event.EventData.Commitment)
		log.Printf("✅ CommitmentRootUpdatedeventprocesscompleted: ID=%d, notcorresponding toDepositUsed", eventRecord.ID)
		return nil
	}

	// 2: DepositUsedrecord(ChainID + LocalDepositId)corresponding toCheckbook
	var affectedCheckbooks []models.Checkbook
	for _, depositUsed := range depositUsedEvents {
		var checkbooks []models.Checkbook
		if err := p.db.Where("chain_id = ? AND local_deposit_id = ?",
			depositUsed.SLIP44ChainID, depositUsed.LocalDepositId).Find(&checkbooks).Error; err != nil {
			log.Printf("❌ Checkbookfailed: ChainID=%d, LocalDepositId=%d, Error=%v",
				depositUsed.SLIP44ChainID, depositUsed.LocalDepositId, err)
			continue
		}
		affectedCheckbooks = append(affectedCheckbooks, checkbooks...)
		log.Printf("🔗 [] Commitment=%s -> DepositUsed(ChainID=%d, LocalDepositId=%d) -> %dCheckbook",
			event.EventData.Commitment, depositUsed.SLIP44ChainID, depositUsed.LocalDepositId, len(checkbooks))
	}

	updatedCount := 0
	targetStatus := models.CheckbookStatusWithCheckbook

	for i := range affectedCheckbooks {
		checkbook := &affectedCheckbooks[i] // UseGet，
		oldStatus := checkbook.Status
		advanced, err := p.advanceCheckbookStatus(checkbook, targetStatus, "CommitmentRootUpdated")
		if err != nil {
			log.Printf("❌ processCheckbook[%s]statusfailed: %v", checkbook.ID, err)
			continue
		}
		if advanced {
			updatedCount++

			// If dbWithPush is nil, manually push Checkbook status update
			// (advanceCheckbookStatus already handles push when dbWithPush is available)
			if p.dbWithPush == nil && p.pushService != nil {
				// Reload checkbook to get updated status
				var updatedCheckbook models.Checkbook
				if err := p.db.First(&updatedCheckbook, "id = ?", checkbook.ID).Error; err == nil {
					p.pushService.PushCheckbookStatusUpdateDirect(&updatedCheckbook, string(oldStatus), "CommitmentRootUpdated")
					log.Printf("✅ [CommitmentRootUpdated] Pushed Checkbook update: ID=%s, Status=%s", updatedCheckbook.ID, updatedCheckbook.Status)
				}
			}
		}
	}

	log.Printf("✅ CommitmentRootUpdatedeventprocesscompleted: ID=%d, Checkbook=%d, status=%d",
		eventRecord.ID, len(affectedCheckbooks), updatedCount)
	return nil
}

// ProcessWithdrawRequested process ZKPayProxy.WithdrawRequested event
func (p *BlockchainEventProcessor) ProcessWithdrawRequested(event *clients.EventWithdrawRequestedResponse) error {
	log.Printf("📥 processWithdrawRequestedevent: Chain=%d, RequestId=%s, Amount=%s", event.ChainID, event.EventData.RequestId, event.EventData.Amount)

	// 1. Parserecipienthash - needdataGet
	log.Printf("⚠️ WithdrawRequestedeventrecipienthash: %s", event.EventData.Recipient)
	log.Printf("   indexed tuplekeccak256hash，needinput dataParserecipient")

	// Use，TODO: dataParserecipient
	recipientChainId := uint16(0)              // ：needParse
	recipientData := event.EventData.Recipient // Usehashdata

	// 1. saveevent
	eventRecord := &models.EventWithdrawRequested{
		ChainID:         int64(event.ChainID), // unified Chain ID field
		SLIP44ChainID:   int64(event.ChainID), // compatible with legacy code
		ContractAddress: event.ContractAddress,
		EventName:       event.EventName,
		BlockNumber:     event.BlockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        event.LogIndex,
		BlockTimestamp:  event.BlockTimestamp,

		// Event Data
		RequestId:        event.EventData.RequestId,
		RecipientChainId: recipientChainId, // ，needParse
		RecipientData:    recipientData,    // Usehash
		TokenId:          event.EventData.TokenId,
		Amount:           event.EventData.Amount,
	}

	if err := p.db.Create(eventRecord).Error; err != nil {
		log.Printf("❌ saveWithdrawRequestedeventfailed: %v", err)
		return err
	}

	// 2. ：orCreateCheckrecord，status
	log.Printf("📝 [2] startprocessWithdrawRequestedCheck...")
	if err := p.processWithdrawRequestedCheck(event); err != nil {
		log.Printf("❌ [failed] processWithdrawRequested Checkfailed: %v", err)
		// returnError，eventalreadysaveSuccess
	}

	// 3. Update WithdrawRequest status: proof_status=completed, execute_status=success, payout_status=pending
	log.Printf("📝 [3] startupdateWithdrawRequeststatus...")
	var withdrawRequest models.WithdrawRequest

	// Use transaction with FOR UPDATE to prevent deadlocks with polling service
	tx := p.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			log.Printf("❌ Panic in ProcessWithdrawRequested: %v", r)
		}
	}()

	err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("withdraw_nullifier = ?", event.EventData.RequestId).
		First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [WithdrawRequested] WithdrawRequest not found by nullifier: RequestId=%s", event.EventData.RequestId)
			// Try to find by Check's withdraw_request_id (if Check was found in step 2)
			var check models.Check
			checkErr := tx.Where("nullifier = ? OR request_id = ?", event.EventData.RequestId, event.EventData.RequestId).
				First(&check).Error
			if checkErr == nil && check.WithdrawRequestID != nil && *check.WithdrawRequestID != "" {
				log.Printf("🔍 [WithdrawRequested] Found Check with withdraw_request_id=%s, trying to find WithdrawRequest", *check.WithdrawRequestID)
				err = tx.Set("gorm:query_option", "FOR UPDATE").
					Where("id = ?", *check.WithdrawRequestID).
					First(&withdrawRequest).Error
				if err == nil {
					log.Printf("✅ [WithdrawRequested] Found WithdrawRequest via Check's withdraw_request_id: %s", withdrawRequest.ID)
				}
			}
		}

		if err != nil {
			tx.Rollback()
			if err == gorm.ErrRecordNotFound {
				log.Printf("⚠️ [WithdrawRequested] WithdrawRequest not found: RequestId=%s (may be user-initiated withdraw or fee)", event.EventData.RequestId)
				// Don't fail, just log - WithdrawRequest may not exist yet (user-initiated withdraw or fee)
			} else {
				log.Printf("❌ [WithdrawRequested] Query WithdrawRequest failed: %v", err)
				// Don't return error - event already saved successfully
			}
			return nil // Exit early if WithdrawRequest not found
		}
	}

	// WithdrawRequest found, proceed with status update
	// Check if already in final status to avoid unnecessary updates
	// This prevents conflicts with polling service that might have already updated it
	if withdrawRequest.ExecuteStatus == models.ExecuteStatusSuccess {
		tx.Rollback()
		log.Printf("⚠️ [WithdrawRequested] WithdrawRequest %s already has execute_status=success, skipping update", withdrawRequest.ID)
	} else {
		// Update status: proof_status=completed, execute_status=success
		// Only update payout_status to pending if it's not already completed
		blockNumber := uint64(event.BlockNumber)
		chainID := uint32(event.ChainID) // SLIP44 chain ID where executeWithdraw TX was submitted

		// Validate TransactionHash is not empty
		if event.TransactionHash == "" {
			log.Printf("⚠️ [WithdrawRequested] WARNING: TransactionHash is empty! RequestId=%s", event.EventData.RequestId)
		}

		log.Printf("📝 [WithdrawRequested] Event TransactionHash: %s, BlockNumber: %d, ChainID: %d", event.TransactionHash, event.BlockNumber, event.ChainID)

		updates := map[string]interface{}{
			"proof_status":         models.ProofStatusCompleted,
			"execute_status":       models.ExecuteStatusSuccess,
			"execute_chain_id":     chainID, // Record chain ID where execute transaction was submitted
			"execute_tx_hash":      event.TransactionHash,
			"execute_block_number": blockNumber,
			"executed_at":          gorm.Expr("NOW()"),
		}

		// Only update payout_status to pending if it's not already completed
		// This prevents overwriting a completed payout status (e.g., if WithdrawExecuted arrived first)
		if withdrawRequest.PayoutStatus != models.PayoutStatusCompleted {
			updates["payout_status"] = models.PayoutStatusPending
		} else {
			log.Printf("⚠️ [WithdrawRequested] WithdrawRequest %s already has payout_status=completed, skipping payout_status update", withdrawRequest.ID)
		}

		if err := tx.Model(&withdrawRequest).Updates(updates).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ [WithdrawRequested] Failed to update WithdrawRequest status: %v", err)
			// Don't return error - event already saved successfully
		} else {
			// Reload to get updated sub-statuses (Updates() already updated proof_status, execute_status, payout_status in DB)
			if err := tx.Where("id = ?", withdrawRequest.ID).First(&withdrawRequest).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ [WithdrawRequested] Failed to reload WithdrawRequest: %v", err)
			} else {
				// Update main status based on sub-statuses (Status is computed, not set directly)
				withdrawRequest.UpdateMainStatus()
				if err := tx.Save(&withdrawRequest).Error; err != nil {
					tx.Rollback()
					log.Printf("❌ [WithdrawRequested] Failed to update main status: %v", err)
				} else {
					if err := tx.Commit().Error; err != nil {
						log.Printf("❌ [WithdrawRequested] Failed to commit transaction: %v", err)
					} else {
						log.Printf("✅ [WithdrawRequested] WithdrawRequest status updated: ID=%s, proof_status=completed, execute_status=success, payout_status=pending, computed_status=%s", withdrawRequest.ID, withdrawRequest.Status)
						// Push WebSocket update for WithdrawRequest status change
						if p.pushService != nil {
							p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "WithdrawRequested")
						}
					}
				}
			}
		}
	}

	log.Printf("✅ WithdrawRequestedeventprocesscompleted: ID=%d", eventRecord.ID)
	return nil
}

// ProcessWithdrawExecuted process Treasury.WithdrawExecuted event
func (p *BlockchainEventProcessor) ProcessWithdrawExecuted(event *clients.EventWithdrawExecutedResponse) error {
	log.Printf("📥 processWithdrawExecutedevent: Chain=%d, RequestId=%s, Amount=%s", event.ChainID, event.EventData.RequestId, event.EventData.Amount)

	// 1. saveevent
	// Convert Recipient address to Universal Address format (32-byte)
	normalizedRecipient := utils.NormalizeAddressForChain(strings.TrimSpace(event.EventData.Recipient), int(event.ChainID))
	var recipientUniversalAddress string
	if utils.IsUniversalAddress(normalizedRecipient) {
		recipientUniversalAddress = normalizedRecipient
	} else if utils.IsEvmAddress(normalizedRecipient) {
		universalAddr, err := utils.EvmToUniversalAddress(normalizedRecipient)
		if err != nil {
			return fmt.Errorf("failed to convert Recipient address to Universal Address: %w", err)
		}
		recipientUniversalAddress = universalAddr
	} else if utils.IsTronAddress(normalizedRecipient) {
		universalAddr, err := utils.TronToUniversalAddress(normalizedRecipient)
		if err != nil {
			return fmt.Errorf("failed to convert Recipient address to Universal Address: %w", err)
		}
		recipientUniversalAddress = universalAddr
	} else {
		return fmt.Errorf("unsupported Recipient address format: %s", normalizedRecipient)
	}

	eventRecord := &models.EventWithdrawExecuted{
		ChainID:         int64(event.ChainID), // unified Chain ID field
		SLIP44ChainID:   int64(event.ChainID), // compatible with legacy code
		ContractAddress: event.ContractAddress,
		EventName:       event.EventName,
		BlockNumber:     event.BlockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        event.LogIndex,
		BlockTimestamp:  event.BlockTimestamp,

		// Event Data
		Recipient: recipientUniversalAddress, // 32-byte Universal Address
		Token:     event.EventData.Token,
		Amount:    event.EventData.Amount,
		RequestId: event.EventData.RequestId,
	}

	if err := p.db.Create(eventRecord).Error; err != nil {
		log.Printf("❌ saveWithdrawExecutedeventfailed: %v", err)
		return err
	}

	// 2. ：Checkrecord，statuscompleted
	log.Printf("📝 [2] startprocessWithdrawExecutedCheck...")
	if err := p.processWithdrawExecutedCheck(event); err != nil {
		log.Printf("❌ [failed] processWithdrawExecuted Checkfailed: %v", err)
		// returnError，eventalreadysaveSuccess
	}

	// 3. Update WithdrawRequest status: payout_status=completed
	log.Printf("📝 [3] startupdateWithdrawRequeststatus...")
	var withdrawRequest models.WithdrawRequest
	// 优先通过 withdraw_nullifier 查询
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// Fallback: 尝试通过 request_id (DEPRECATED) 查询
			log.Printf("🔍 [WithdrawExecuted] WithdrawRequest not found by withdraw_nullifier, trying request_id (DEPRECATED): RequestId=%s", event.EventData.RequestId)
			err = p.db.Where("request_id = ?", event.EventData.RequestId).First(&withdrawRequest).Error
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					log.Printf("⚠️ [WithdrawExecuted] WithdrawRequest not found by withdraw_nullifier or request_id: RequestId=%s", event.EventData.RequestId)
					// Don't fail, just log - WithdrawRequest may not exist
					return nil
				}
				log.Printf("❌ [WithdrawExecuted] Query WithdrawRequest by request_id failed: %v", err)
				// Don't return error - event already saved successfully
				return nil
			}
			// Found by request_id, continue below
		} else {
			log.Printf("❌ [WithdrawExecuted] Query WithdrawRequest failed: %v", err)
			// Don't return error - event already saved successfully
			return nil
		}
	}

	// Found WithdrawRequest, continue with status update
	{
		// Log sub-statuses BEFORE update
		log.Printf("📊 [WithdrawExecuted] Sub-statuses BEFORE update: proof_status=%s, execute_status=%s, payout_status=%s, hook_status=%s, fallback_transferred=%v, main_status=%s",
			withdrawRequest.ProofStatus, withdrawRequest.ExecuteStatus, withdrawRequest.PayoutStatus, withdrawRequest.HookStatus, withdrawRequest.FallbackTransferred, withdrawRequest.Status)
		log.Printf("📝 [WithdrawExecuted] Event TransactionHash: %s, BlockNumber: %d, ChainID: %d", event.TransactionHash, event.BlockNumber, event.ChainID)

		// Update both execute_status and payout_status to completed
		// WithdrawExecuted event indicates both execute (verification) and payout are completed
		blockNumber := uint64(event.BlockNumber)
		chainID := uint32(event.ChainID) // SLIP44 chain ID where payout TX was executed

		// Validate TransactionHash is not empty
		if event.TransactionHash == "" {
			log.Printf("⚠️ [WithdrawExecuted] WARNING: TransactionHash is empty! RequestId=%s", event.EventData.RequestId)
		}

		updates := map[string]interface{}{
			"execute_status":      models.ExecuteStatusSuccess, // Ensure execute_status is success
			"payout_status":       models.PayoutStatusCompleted,
			"payout_chain_id":     chainID, // Record chain ID where payout transaction was executed
			"payout_tx_hash":      event.TransactionHash,
			"payout_block_number": blockNumber,
			"payout_completed_at": gorm.Expr("NOW()"),
		}

		// Only update execute fields if they are not already set (WithdrawRequested may have set them)
		if withdrawRequest.ExecuteTxHash == "" {
			updates["execute_tx_hash"] = event.TransactionHash
		}
		if withdrawRequest.ExecuteBlockNumber == nil {
			updates["execute_block_number"] = blockNumber
		}
		if withdrawRequest.ExecuteChainID == nil {
			updates["execute_chain_id"] = chainID // Record chain ID if not set
		}
		if withdrawRequest.ExecutedAt == nil {
			updates["executed_at"] = gorm.Expr("NOW()")
		}

		log.Printf("📝 [WithdrawExecuted] Updating sub-statuses: execute_status=%s, payout_status=%s, execute_chain_id=%d, payout_chain_id=%d",
			updates["execute_status"], updates["payout_status"], chainID, chainID)

		if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
			log.Printf("❌ [WithdrawExecuted] Failed to update WithdrawRequest status: %v", err)
			// Don't return error - event already saved successfully
		} else {
			// Reload to get updated sub-statuses
			if err := p.db.First(&withdrawRequest, "id = ?", withdrawRequest.ID).Error; err != nil {
				log.Printf("❌ [WithdrawExecuted] Failed to reload WithdrawRequest: %v", err)
			} else {
				// Log sub-statuses AFTER update (before computing main status)
				log.Printf("📊 [WithdrawExecuted] Sub-statuses AFTER update (before UpdateMainStatus): proof_status=%s, execute_status=%s, payout_status=%s, hook_status=%s, fallback_transferred=%v, main_status=%s",
					withdrawRequest.ProofStatus, withdrawRequest.ExecuteStatus, withdrawRequest.PayoutStatus, withdrawRequest.HookStatus, withdrawRequest.FallbackTransferred, withdrawRequest.Status)

				// Update main status based on sub-statuses (Status is computed, not set directly)
				oldStatus := withdrawRequest.Status
				withdrawRequest.UpdateMainStatus()

				// Log main status computation result
				log.Printf("🧮 [WithdrawExecuted] Main status computation result: %s → %s (based on: proof=%s, execute=%s, payout=%s, hook=%s, fallback=%v)",
					oldStatus, withdrawRequest.Status, withdrawRequest.ProofStatus, withdrawRequest.ExecuteStatus, withdrawRequest.PayoutStatus, withdrawRequest.HookStatus, withdrawRequest.FallbackTransferred)

				if err := p.db.Save(&withdrawRequest).Error; err != nil {
					log.Printf("❌ [WithdrawExecuted] Failed to update main status: %v", err)
				} else {
					log.Printf("✅ [WithdrawExecuted] WithdrawRequest status updated: ID=%s, final_status=%s (was %s)", withdrawRequest.ID, withdrawRequest.Status, oldStatus)
					// Push WebSocket update for WithdrawRequest status change
					if p.pushService != nil {
						p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, oldStatus, "WithdrawExecuted")
					}
				}
			}
		}
	}

	log.Printf("✅ WithdrawExecutedeventprocesscompleted: ID=%d", eventRecord.ID)
	return nil
}

// ProcessIntentManagerWithdrawExecuted process IntentManager.WithdrawExecuted event
// This event indicates that payout (Stage 3) has completed successfully
func (p *BlockchainEventProcessor) ProcessIntentManagerWithdrawExecuted(event *clients.EventIntentManagerWithdrawExecutedResponse) error {
	log.Printf("📥 process IntentManager.WithdrawExecuted event: Chain=%d, WorkerType=%d, Success=%v",
		event.ChainID, event.EventData.WorkerType, event.EventData.Success)

	// Validate: event must indicate success
	if !event.EventData.Success {
		log.Printf("⚠️ [IntentManager.WithdrawExecuted] Event indicates failure: %s", event.EventData.Message)
		// Even if success=false, we should still try to update the request status
		// The contract may have reverted, but we should mark it as failed
	}

	// 1. Try to find the corresponding WithdrawRequest by payout_tx_hash
	// Note: If Treasury.payout and IntentManager.executeWithdraw are in the same transaction,
	// the txHash will match. If they're in different transactions (cross-chain), we need to
	// use a different matching strategy (e.g., by beneficiary address and time range)
	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("payout_tx_hash = ?", event.TransactionHash).First(&withdrawRequest).Error

	if err == gorm.ErrRecordNotFound {
		// Try to find by matching beneficiary and recent payout status
		// This handles cross-chain scenarios where payout_tx_hash might be different
		log.Printf("⚠️ [IntentManager.WithdrawExecuted] No WithdrawRequest found with payout_tx_hash=%s, trying alternative matching", event.TransactionHash)

		// Find requests with payout_status=processing that are recent (within last 24 hours)
		// Note: This is a fallback - ideally we should track the IntentManager transaction hash separately
		err = p.db.Where("payout_status = ? AND payout_status_updated_at > ?",
			models.PayoutStatusProcessing,
			time.Now().Add(-24*time.Hour)).First(&withdrawRequest).Error

		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [IntentManager.WithdrawExecuted] No matching WithdrawRequest found, skipping status update")
			log.Printf("   TransactionHash=%s, WorkerType=%d, Success=%v, Message=%s",
				event.TransactionHash, event.EventData.WorkerType, event.EventData.Success, event.EventData.Message)
			return nil // Don't fail, just log and continue
		} else if err != nil {
			log.Printf("❌ [IntentManager.WithdrawExecuted] Query failed: %v", err)
			return fmt.Errorf("query WithdrawRequest failed: %w", err)
		}
	} else if err != nil {
		log.Printf("❌ [IntentManager.WithdrawExecuted] Query failed: %v", err)
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	log.Printf("✅ [IntentManager.WithdrawExecuted] Found matching WithdrawRequest: ID=%s, current_payout_status=%s",
		withdrawRequest.ID, withdrawRequest.PayoutStatus)

	// 2. Update payout status based on event success
	if event.EventData.Success {
		// Update to completed
		blockNumber := uint64(event.BlockNumber)
		if err := p.updateWithdrawRequestPayoutStatus(&withdrawRequest, models.PayoutStatusCompleted,
			event.TransactionHash, &blockNumber, ""); err != nil {
			log.Printf("❌ [IntentManager.WithdrawExecuted] Failed to update payout status: %v", err)
			return err
		}

		// Update main status
		withdrawRequest.PayoutStatus = models.PayoutStatusCompleted
		withdrawRequest.UpdateMainStatus()
		if err := p.db.Save(&withdrawRequest).Error; err != nil {
			log.Printf("❌ [IntentManager.WithdrawExecuted] Failed to update main status: %v", err)
			return err
		}

		log.Printf("✅ [IntentManager.WithdrawExecuted] Payout status updated to completed: ID=%s", withdrawRequest.ID)
		// Push WebSocket update for WithdrawRequest status change
		if p.pushService != nil {
			p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "IntentManager.WithdrawExecuted")
		}
	} else {
		// Update to failed
		if err := p.updateWithdrawRequestPayoutStatus(&withdrawRequest, models.PayoutStatusFailed,
			event.TransactionHash, nil, event.EventData.Message); err != nil {
			log.Printf("❌ [IntentManager.WithdrawExecuted] Failed to update payout status: %v", err)
			return err
		}

		// Update main status
		withdrawRequest.PayoutStatus = models.PayoutStatusFailed
		withdrawRequest.UpdateMainStatus()
		if err := p.db.Save(&withdrawRequest).Error; err != nil {
			log.Printf("❌ [IntentManager.WithdrawExecuted] Failed to update main status: %v", err)
			return err
		}

		log.Printf("⚠️ [IntentManager.WithdrawExecuted] Payout status updated to failed: ID=%s, Message=%s",
			withdrawRequest.ID, event.EventData.Message)
		// Push WebSocket update for WithdrawRequest status change
		if p.pushService != nil {
			p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "IntentManager.WithdrawExecuted")
		}
	}

	log.Printf("✅ IntentManager.WithdrawExecuted event process completed: ID=%s", withdrawRequest.ID)
	return nil
}

// updateWithdrawRequestPayoutStatus updates the payout status of a WithdrawRequest
func (p *BlockchainEventProcessor) updateWithdrawRequestPayoutStatus(
	request *models.WithdrawRequest,
	status models.PayoutStatus,
	txHash string,
	blockNumber *uint64,
	errMsg string,
) error {
	updates := map[string]interface{}{
		"payout_status": status,
	}

	if txHash != "" {
		updates["payout_tx_hash"] = txHash
	}

	if status == models.PayoutStatusCompleted {
		updates["payout_completed_at"] = gorm.Expr("NOW()")
		if blockNumber != nil {
			updates["payout_block_number"] = *blockNumber
		}
	} else if status == models.PayoutStatusFailed {
		updates["payout_error"] = errMsg
		updates["payout_last_retry_at"] = gorm.Expr("NOW()")
		// Increment retry count
		p.db.Model(&models.WithdrawRequest{}).
			Where("id = ?", request.ID).
			UpdateColumn("payout_retry_count", gorm.Expr("payout_retry_count + 1"))
	}

	return p.db.Model(&models.WithdrawRequest{}).
		Where("id = ?", request.ID).
		Updates(updates).Error
}

// ============ event ============

// ProcessEvent eventprocess

// createOrUpdateCheckbook DepositReceivedeventCreateorUpdateCheckbook
func (p *BlockchainEventProcessor) createOrUpdateCheckbook(event *clients.EventDepositReceivedResponse) error {
	// useraddress - Event data should already be in Universal Address format (32-byte)
	// But we normalize it to ensure it's in the correct format
	normalizedAddress := utils.NormalizeAddressForChain(strings.TrimSpace(event.EventData.Depositor), int(event.ChainID))

	// Convert to Universal Address if it's not already (20-byte EVM or TRON Base58)
	var universalAddressData string
	if utils.IsUniversalAddress(normalizedAddress) {
		// Already 32-byte Universal Address
		universalAddressData = normalizedAddress
	} else if utils.IsEvmAddress(normalizedAddress) {
		// Convert 20-byte EVM address to 32-byte Universal Address
		universalAddr, err := utils.EvmToUniversalAddress(normalizedAddress)
		if err != nil {
			return fmt.Errorf("failed to convert EVM address to Universal Address: %w", err)
		}
		universalAddressData = universalAddr
	} else if utils.IsTronAddress(normalizedAddress) {
		// Convert TRON Base58 address to 32-byte Universal Address
		universalAddr, err := utils.TronToUniversalAddress(normalizedAddress)
		if err != nil {
			return fmt.Errorf("failed to convert TRON address to Universal Address: %w", err)
		}
		universalAddressData = universalAddr
	} else {
		return fmt.Errorf("unsupported address format: %s", normalizedAddress)
	}

	userAddress := models.UniversalAddress{
		SLIP44ChainID: uint32(event.ChainID), // UseNATS subjectParseSLIP-44 chain ID
		Data:          universalAddressData,  // 32-byte Universal Address
	}

	log.Printf("📋 [CheckbookCreate] startprocess...")
	log.Printf("🔧 [addressprocess] address=%s, address=%s", event.EventData.Depositor, normalizedAddress)
	log.Printf("🔧 [useraddress] UserChainID=%d, UserData=%s", userAddress.SLIP44ChainID, userAddress.Data)
	log.Printf("🔍 [query] Checkbook: ChainID=%d, LocalDepositId=%d",
		event.ChainID, event.EventData.LocalDepositId)

	// Checkwhetheralreadyexists(ChainID, LocalDepositId)corresponding toCheckbook
	var existingCheckbook models.Checkbook
	log.Printf("🔍 [query] queryCheckbookwhetherexists...")
	err := p.db.Where("chain_id = ? AND local_deposit_id = ?",
		event.ChainID, event.EventData.LocalDepositId).First(&existingCheckbook).Error

	if err == nil {
		// Checkbookalreadyexists，CheckwhetherneedstatusandSetGrossAmount
		log.Printf("✅ [alreadyexists] Checkbookalreadyexists: ChainID=%d, LocalDepositId=%d, CheckbookID=%s, currentstatus=%s",
			event.ChainID, event.EventData.LocalDepositId, existingCheckbook.ID, existingCheckbook.Status)

		// ifGrossAmountempty，DepositReceivedAmount（Convert）
		updates := map[string]interface{}{}
		if existingCheckbook.GrossAmount == "" && event.EventData.Amount != "" {
			// 💱 Convert：amountConvertcontractamount（18）
			// DepositReceivedTokenIdSet0，WaitDepositRecordedUpdateTokenId
			managementAmount, convErr := p.decimalConverter.ConvertToManagementAmount(
				event.EventData.Amount,
				event.ChainID,
				0, // DepositReceivedUse0，WaitDepositRecordedUpdate
			)
			if convErr != nil {
				log.Printf("❌ [Convertfailed] %v，useamount", convErr)
				managementAmount = event.EventData.Amount
			} else {
				// recordConvert
				p.decimalConverter.LogConversion(
					event.EventData.Amount,
					managementAmount,
					event.ChainID,
					0, // DepositReceivedUseTokenId=0
					"to_management",
				)
			}

			updates["gross_amount"] = managementAmount
			log.Printf("🔧 [data] GrossAmount: %s (Convert: %s)", event.EventData.Amount, managementAmount)
		}

		// Update（if）
		if len(updates) > 0 {
			if err := p.db.Model(&existingCheckbook).Updates(updates).Error; err != nil {
				log.Printf("❌ [Updatefailed] UpdateCheckbook GrossAmountfailed: %v", err)
				return fmt.Errorf("UpdateCheckbookfailed: %w", err)
			}
		}

		// DepositReceivedunsignedstatus
		_, err := p.advanceCheckbookStatus(&existingCheckbook, models.CheckbookStatusUnsigned, "DepositReceived")
		if err != nil {
			return err
		}
		return nil
	} else if err != gorm.ErrRecordNotFound {
		log.Printf("❌ [queryerror] queryCheckbookfailed: %v", err)
		return fmt.Errorf("queryCheckbookfailed: %w", err)
	}

	// 💱 Convert：amountConvertcontractamount（18）
	// DepositReceivedTokenIdSet0，WaitDepositRecordedUpdateTokenId
	managementAmount, err := p.decimalConverter.ConvertToManagementAmount(
		event.EventData.Amount,
		event.ChainID,
		0, // DepositReceivedUse0，WaitDepositRecordedUpdate
	)
	if err != nil {
		log.Printf("❌ [Convertfailed] %v，useamount", err)
		managementAmount = event.EventData.Amount
	} else {
		// recordConvert
		p.decimalConverter.LogConversion(
			event.EventData.Amount,
			managementAmount,
			event.ChainID,
			0, // DepositReceivedUseTokenId=0
			"to_management",
		)
	}

	// Checkbookexists，Create
	newCheckbook := &models.Checkbook{
		ID:                     uuid.New().String(),   // UUID
		SLIP44ChainID:          uint32(event.ChainID), // UseNATS subjectParseSLIP-44 chain ID
		LocalDepositID:         event.EventData.LocalDepositId,
		TokenKey:               "",                    // DepositReceived: TokenKey will be set when DepositRecorded event arrives
		TokenAddress:           event.EventData.Token, // ✅ saveToken Address，
		UserAddress:            userAddress,
		Amount:                 managementAmount,               // UseConvertcontractamount
		GrossAmount:            managementAmount,               // DepositReceived：UseConvertamount
		Status:                 models.CheckbookStatusUnsigned, // DepositReceivedstatus：deposit confirmed, encrypting securely
		DepositTransactionHash: event.TransactionHash,
	}

	log.Printf("📝 [Createrecord] Checkbookexists，startCreaterecord...")
	log.Printf("🔧 [data] Checkbookdata:")
	log.Printf("   ChainID=%d, LocalDepositID=%d, TokenKey=%s",
		newCheckbook.SLIP44ChainID, newCheckbook.LocalDepositID, newCheckbook.TokenKey)
	log.Printf("   UserAddress={ChainID=%d, Data=%s}",
		newCheckbook.UserAddress.SLIP44ChainID, newCheckbook.UserAddress.Data)
	log.Printf("   Amount=%s, GrossAmount=%s, Status=%s", newCheckbook.Amount, newCheckbook.GrossAmount, newCheckbook.Status)
	log.Printf("   📊 amount=%s -> contractamount=%s", event.EventData.Amount, managementAmount)
	log.Printf("   DepositTxHash=%s", newCheckbook.DepositTransactionHash)

	log.Printf("💾 [] startDatabasepush...")

	// UsepushDatabaseservice
	if p.dbWithPush != nil {
		if err := p.dbWithPush.CreateCheckbook(newCheckbook, "DepositReceived-"); err != nil {
			log.Printf("❌ [failed] CreateCheckbookfailed: %v", err)
			return fmt.Errorf("CreateCheckbookfailed: %w", err)
		}
		log.Printf("✅ [success] CreateCheckbooksuccessalreadypush!")
	} else {
		// ：CreateDatabaserecord
		if err := p.db.Create(newCheckbook).Error; err != nil {
			log.Printf("❌ [failed] CreateCheckbookfailed: %v", err)
			return fmt.Errorf("CreateCheckbookfailed: %w", err)
		}
		log.Printf("✅ [success] CreateCheckbooksuccess!")
		log.Printf("⚠️ [DepositReceived] pushservicenotinitialize，WebSocketpush")
	}

	log.Printf("   ID=%s, ChainID=%d, LocalDepositId=%d, Status=%s, User=%s",
		newCheckbook.ID, newCheckbook.SLIP44ChainID, newCheckbook.LocalDepositID, newCheckbook.Status, userAddress.Data)

	return nil
}

// updateCheckbookToReadyForCommitment DepositRecordedeventUpdateCheckbookstatus
func (p *BlockchainEventProcessor) updateCheckbookToReadyForCommitment(event *clients.EventDepositRecordedResponse) error {
	log.Printf("📋 [CheckbookUpdate] startprocess...")
	log.Printf("🔍 [query] ChainID=%d, LocalDepositID=%d Checkbook",
		event.ChainID, event.EventData.LocalDepositId)
	log.Printf("🔍 [data] EventData - AllocatableAmount=%s, FeeTotalLocked=%s, GrossAmount=%s",
		event.EventData.AllocatableAmount, event.EventData.FeeTotalLocked, event.EventData.GrossAmount)

	//  chainid + local_deposit_id corresponding toCheckbookrecord
	var checkbook models.Checkbook
	err := p.db.Where("chain_id = ? AND local_deposit_id = ?",
		event.ChainID, event.EventData.LocalDepositId).First(&checkbook).Error

	if err == gorm.ErrRecordNotFound {
		log.Printf("⚠️ [not] corresponding toCheckbookrecord: ChainID=%d, LocalDepositID=%d",
			event.ChainID, event.EventData.LocalDepositId)
		log.Printf("📝 [Createrecord] needDepositRecordedeventCreateCheckbook")

		// if，DepositRecordedeventCreateCheckbook
		return p.createCheckbookFromDepositRecorded(event)
	} else if err != nil {
		log.Printf("❌ [queryerror] queryCheckbookfailed: %v", err)
		return fmt.Errorf("queryCheckbookfailed: %w", err)
	}

	log.Printf("✅ [record] Checkbook ID=%s, currentstatus=%s", checkbook.ID, checkbook.Status)

	// Ensure tokenKey mapper is initialized
	utils.InitTokenKeyHashMap()

	// Convert tokenKey hash to original string (e.g., "USDT")
	log.Printf("🔍 [updateCheckbookToReadyForCommitment] Converting tokenKey hash: %s", event.EventData.TokenKey)
	originalTokenKey := utils.GetTokenKeyFromHash(event.EventData.TokenKey)
	log.Printf("🔍 [updateCheckbookToReadyForCommitment] Converted tokenKey: %s", originalTokenKey)

	// UpdateDepositRecordedevent，user_data
	// useraddress - Event data should already be in Universal Address format (32-byte)
	normalizedAddress := utils.NormalizeAddressForChain(strings.TrimSpace(event.EventData.Owner.Data), int(event.ChainID))

	// Convert to Universal Address if it's not already (20-byte EVM or TRON Base58)
	var universalAddressData string
	if utils.IsUniversalAddress(normalizedAddress) {
		// Already 32-byte Universal Address
		universalAddressData = normalizedAddress
	} else if utils.IsEvmAddress(normalizedAddress) {
		// Convert 20-byte EVM address to 32-byte Universal Address
		universalAddr, err := utils.EvmToUniversalAddress(normalizedAddress)
		if err != nil {
			return fmt.Errorf("failed to convert EVM address to Universal Address: %w", err)
		}
		universalAddressData = universalAddr
	} else if utils.IsTronAddress(normalizedAddress) {
		// Convert TRON Base58 address to 32-byte Universal Address
		universalAddr, err := utils.TronToUniversalAddress(normalizedAddress)
		if err != nil {
			return fmt.Errorf("failed to convert TRON address to Universal Address: %w", err)
		}
		universalAddressData = universalAddr
	} else {
		return fmt.Errorf("unsupported address format: %s", normalizedAddress)
	}

	// Log event data before creating updates map
	log.Printf("🔍 [dataCheck] EventData - GrossAmount=%s, AllocatableAmount=%s, FeeTotalLocked=%s",
		event.EventData.GrossAmount, event.EventData.AllocatableAmount, event.EventData.FeeTotalLocked)

	updates := map[string]interface{}{
		"gross_amount":       event.EventData.GrossAmount,
		"allocatable_amount": event.EventData.AllocatableAmount,
		"fee_total_locked":   event.EventData.FeeTotalLocked,
		"promote_code":       event.EventData.PromoteCode,
		"token_key":          originalTokenKey,              // 🔧 ：UpdateToken Key (converted from hash to original string like "USDT")
		"user_chain_id":      event.EventData.Owner.ChainId, // 🔧 ：Updateuserchain ID
		"user_data":          universalAddressData,          // 🔧 ：Updateuser_data (32-byte Universal Address)
		"updated_at":         time.Now(),
	}

	// Log updates map to verify values
	log.Printf("🔍 [dataCheck] Updates map - gross_amount=%s, allocatable_amount=%s, fee_total_locked=%s",
		updates["gross_amount"], updates["allocatable_amount"], updates["fee_total_locked"])

	log.Printf("🔧 [dataUpdate] Updateuser_data: %s -> %s", checkbook.UserAddress.Data, normalizedAddress)

	// Checkstatuswhetherneedready_for_commitment
	// 如果当前状态是 pending 或 unsigned，应该更新到 ready_for_commitment
	statusProgression := p.getStatusProgression()
	currentLevel, exists := statusProgression[checkbook.Status]
	targetLevel := statusProgression[models.CheckbookStatusReadyForCommitment]

	// 明确检查状态是否为 pending 或 unsigned，或者当前级别小于目标级别
	shouldUpdateStatus := false
	if !exists {
		// 状态不在映射中（可能是失败状态等），允许更新
		log.Printf("⚠️ [DepositRecorded] Status %s not in progression map, will update to ready_for_commitment", checkbook.Status)
		shouldUpdateStatus = true
	} else if checkbook.Status == models.CheckbookStatusPending || checkbook.Status == models.CheckbookStatusUnsigned {
		// 明确处理 pending 和 unsigned 状态
		shouldUpdateStatus = true
		log.Printf("🔄 [DepositRecorded] Status is %s (level=%d), will update to ready_for_commitment (level=%d)",
			checkbook.Status, currentLevel, targetLevel)
	} else if currentLevel < targetLevel {
		// 其他状态，如果级别小于目标级别，也更新
		shouldUpdateStatus = true
		log.Printf("🔄 [DepositRecorded] Status %s (level=%d) < ready_for_commitment (level=%d), will update",
			checkbook.Status, currentLevel, targetLevel)
	} else {
		log.Printf("ℹ️ [DepositRecorded] Status %s (level=%d) >= ready_for_commitment (level=%d), skip status update",
			checkbook.Status, currentLevel, targetLevel)
	}

	if shouldUpdateStatus {
		updates["status"] = models.CheckbookStatusReadyForCommitment
		log.Printf("🔄 [DepositRecorded] status: %s → %s", checkbook.Status, models.CheckbookStatusReadyForCommitment)
	}

	// Log what will be updated before actually updating
	log.Printf("📝 [DepositRecorded] About to update Checkbook ID=%s with %d fields", checkbook.ID, len(updates))
	for key, value := range updates {
		log.Printf("   → %s = %v", key, value)
	}

	// Update - Usepushservice
	if p.dbWithPush != nil {
		log.Printf("🔄 [DepositRecorded] Using push service to update checkbook...")
		if err := p.dbWithPush.UpdateCheckbook(checkbook.ID, updates, "DepositRecorded"); err != nil {
			log.Printf("❌ [DepositRecorded] UpdateCheckbookfailed: %v", err)
			return fmt.Errorf("UpdateCheckbookfailed: %w", err)
		}
		log.Printf("✅ [DepositRecorded] CheckbookUpdatesuccessalreadypush: ID=%s", checkbook.ID)
	} else {
		// ：UpdateDatabase
		log.Printf("🔄 [DepositRecorded] Using direct database update...")
		if err := p.db.Model(&checkbook).Updates(updates).Error; err != nil {
			log.Printf("❌ [DepositRecorded] UpdateCheckbookfailed: %v", err)
			return fmt.Errorf("UpdateCheckbookfailed: %w", err)
		}
		log.Printf("✅ [DepositRecorded] CheckbookUpdatesuccess: ID=%s", checkbook.ID)
		log.Printf("⚠️ pushservicenotinitialize，push")
	}

	// Verify the update by querying the checkbook again
	var updatedCheckbook models.Checkbook
	if err := p.db.Where("id = ?", checkbook.ID).First(&updatedCheckbook).Error; err == nil {
		log.Printf("✅ [DepositRecorded] Verification - Checkbook ID=%s, Status=%s, AllocatableAmount=%s, FeeTotalLocked=%s",
			updatedCheckbook.ID, updatedCheckbook.Status, updatedCheckbook.AllocatableAmount, updatedCheckbook.FeeTotalLocked)
	} else {
		log.Printf("⚠️ [DepositRecorded] Failed to verify update: %v", err)
	}

	log.Printf("   Update: gross_amount=%s, allocatable_amount=%s, fee_total_locked=%s, promote_code=%s, token_key=%s",
		event.EventData.GrossAmount, event.EventData.AllocatableAmount, event.EventData.FeeTotalLocked, event.EventData.PromoteCode, originalTokenKey)

	return nil
}

// createCheckbookFromDepositRecorded DepositRecordedeventCreateCheckbook
func (p *BlockchainEventProcessor) createCheckbookFromDepositRecorded(event *clients.EventDepositRecordedResponse) error {
	// Convert tokenKey hash to original string (e.g., "USDT")
	originalTokenKey := utils.GetTokenKeyFromHash(event.EventData.TokenKey)

	// useraddress - Event data should already be in Universal Address format (32-byte)
	normalizedAddress := utils.NormalizeAddressForChain(strings.TrimSpace(event.EventData.Owner.Data), int(event.ChainID))

	// Convert to Universal Address if it's not already (20-byte EVM or TRON Base58)
	var universalAddressData string
	if utils.IsUniversalAddress(normalizedAddress) {
		// Already 32-byte Universal Address
		universalAddressData = normalizedAddress
	} else if utils.IsEvmAddress(normalizedAddress) {
		// Convert 20-byte EVM address to 32-byte Universal Address
		universalAddr, err := utils.EvmToUniversalAddress(normalizedAddress)
		if err != nil {
			return fmt.Errorf("failed to convert EVM address to Universal Address: %w", err)
		}
		universalAddressData = universalAddr
	} else if utils.IsTronAddress(normalizedAddress) {
		// Convert TRON Base58 address to 32-byte Universal Address
		universalAddr, err := utils.TronToUniversalAddress(normalizedAddress)
		if err != nil {
			return fmt.Errorf("failed to convert TRON address to Universal Address: %w", err)
		}
		universalAddressData = universalAddr
	} else {
		return fmt.Errorf("unsupported address format: %s", normalizedAddress)
	}

	userAddress := models.UniversalAddress{
		SLIP44ChainID: uint32(event.EventData.Owner.ChainId), // Useeventchain ID
		Data:          universalAddressData,                  // 32-byte Universal Address
	}

	log.Printf("📝 [CreateCheckbook] DepositRecordedeventCreate...")
	log.Printf("🔧 [data] ChainID=%d, LocalDepositID=%d, TokenKey=%s (hash: %s)", event.ChainID, event.EventData.LocalDepositId, originalTokenKey, event.EventData.TokenKey)
	log.Printf("🔧 [useraddress] UserChainID=%d, UserData=%s", userAddress.SLIP44ChainID, userAddress.Data)

	// CreateCheckbookrecord，Setready_for_commitmentstatus
	newCheckbook := &models.Checkbook{
		ID:                     uuid.New().String(),
		SLIP44ChainID:          uint32(event.ChainID), // UseSLIP-44 chain ID
		LocalDepositID:         event.EventData.LocalDepositId,
		TokenKey:               originalTokenKey, // Store TokenKey (converted from hash to original string like "USDT")
		UserAddress:            userAddress,
		Amount:                 event.EventData.GrossAmount,
		GrossAmount:            event.EventData.GrossAmount,
		AllocatableAmount:      event.EventData.AllocatableAmount,
		FeeTotalLocked:         event.EventData.FeeTotalLocked,
		PromoteCode:            event.EventData.PromoteCode,
		Status:                 models.CheckbookStatusReadyForCommitment, // Setready_for_commitment
		DepositTransactionHash: event.EventData.DepositTxHash,
	}

	log.Printf("💾 [] startDatabase...")
	if err := p.db.Create(newCheckbook).Error; err != nil {
		log.Printf("❌ [failed] CreateCheckbookfailed: %v", err)
		return fmt.Errorf("CreateCheckbookfailed: %w", err)
	}

	log.Printf("✅ [success] DepositRecordedCreateCheckbooksuccess!")
	log.Printf("   ID=%s, ChainID=%d, LocalDepositId=%d, Status=%s",
		newCheckbook.ID, newCheckbook.SLIP44ChainID, newCheckbook.LocalDepositID, newCheckbook.Status)

	return nil
}

// ============ Check eventprocess ============

// processWithdrawRequestedCheck processWithdrawRequestedeventCheck
func (p *BlockchainEventProcessor) processWithdrawRequestedCheck(event *clients.EventWithdrawRequestedResponse) error {
	// RequestIdorCreateCheckrecord
	var check models.Check
	err := p.db.Where("request_id = ?", event.EventData.RequestId).First(&check).Error

	if err == gorm.ErrRecordNotFound {
		log.Printf("⚠️ [not] RequestId=%sCheckrecord，needCreateCheck", event.EventData.RequestId)
		// canCreateCheckrecord，orrecordWarning
		return nil
	} else if err != nil {
		log.Printf("❌ [queryerror] queryCheckfailed: %v", err)
		return fmt.Errorf("queryCheckfailed: %w", err)
	}

	// Checkstatuspending
	advanced, err := p.advanceCheckStatus(&check, models.AllocationStatusPending, "WithdrawRequested")
	if err != nil {
		return err
	}

	if advanced {
		// UpdaterequestInfo（Updaterequest_id，）
		if err := p.db.Model(&check).Updates(map[string]interface{}{
			"request_id": &event.EventData.RequestId,
			"updated_at": time.Now(),
		}).Error; err != nil {
			log.Printf("❌ [Updatefailed] saveCheck RequestIDfailed: %v", err)
			return fmt.Errorf("saveCheck RequestIDfailed: %w", err)
		}
		log.Printf("✅ [Updatesuccess] Check RequestIDalreadyUpdate: %s", event.EventData.RequestId)

		// Push Checkbook status update to frontend
		// Even if Checkbook status doesn't change, we need to notify frontend that Checks under it have changed
		if p.pushService != nil && check.CheckbookID != "" {
			var checkbook models.Checkbook
			if err := p.db.First(&checkbook, "id = ?", check.CheckbookID).Error; err == nil {
				p.pushService.PushCheckbookStatusUpdateDirect(&checkbook, string(checkbook.Status), "WithdrawRequested")
				log.Printf("✅ [WithdrawRequested] Pushed Checkbook update: ID=%s, Status=%s", checkbook.ID, checkbook.Status)
			}
		}
	}

	return nil
}

// processWithdrawExecutedCheck processWithdrawExecutedeventCheck
// Uses the same lookup logic as updateCheckStatusOnWithdrawExecuted: Find WithdrawRequest first, then find associated Checks
func (p *BlockchainEventProcessor) processWithdrawExecutedCheck(event *clients.EventWithdrawExecutedResponse) error {
	requestId := event.EventData.RequestId

	// Step 1: Find WithdrawRequest by withdraw_nullifier or request_id (DEPRECATED)
	var withdrawRequest models.WithdrawRequest
	// 优先通过 withdraw_nullifier 查询
	err := p.db.Where("withdraw_nullifier = ?", requestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// Fallback: 尝试通过 request_id (DEPRECATED) 查询
			log.Printf("🔍 [WithdrawExecuted] WithdrawRequest not found by withdraw_nullifier, trying request_id (DEPRECATED): RequestId=%s", requestId)
			err = p.db.Where("request_id = ?", requestId).First(&withdrawRequest).Error
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					log.Printf("⚠️ [WithdrawExecuted] WithdrawRequest not found by withdraw_nullifier or request_id: RequestId=%s", requestId)

					// Fallback 1: Try to find Check by nullifier field (commitment nullifier)
					log.Printf("🔍 [WithdrawExecuted] Trying to find Check by nullifier field: %s", requestId)
					var checksByNullifier []models.Check
					err = p.db.Where("nullifier = ?", requestId).Find(&checksByNullifier).Error
					if err == nil && len(checksByNullifier) > 0 {
						log.Printf("✅ [WithdrawExecuted] Found %d Checks by nullifier field", len(checksByNullifier))
						// 尝试通过 Check 的 withdraw_request_id 更新 WithdrawRequest 状态
						if err := p.updateWithdrawRequestFromChecks(checksByNullifier, event); err != nil {
							log.Printf("⚠️ [WithdrawExecuted] Failed to update WithdrawRequest from Checks: %v", err)
						}
						return p.updateChecksAndPushCheckbook(checksByNullifier, event)
					}

					// Fallback 2: Try to find Check by deprecated request_id field (for backward compatibility)
					log.Printf("🔍 [WithdrawExecuted] Trying to find Check by deprecated request_id field: %s", requestId)
					var checksByRequestID []models.Check
					err = p.db.Where("request_id = ?", requestId).Find(&checksByRequestID).Error
					if err == nil && len(checksByRequestID) > 0 {
						log.Printf("✅ [WithdrawExecuted] Found %d Checks by request_id field", len(checksByRequestID))
						// 尝试通过 Check 的 withdraw_request_id 更新 WithdrawRequest 状态
						if err := p.updateWithdrawRequestFromChecks(checksByRequestID, event); err != nil {
							log.Printf("⚠️ [WithdrawExecuted] Failed to update WithdrawRequest from Checks: %v", err)
						}
						return p.updateChecksAndPushCheckbook(checksByRequestID, event)
					}

					log.Printf("⚠️ [WithdrawExecuted] Check not found by any method: RequestId=%s", requestId)
					return nil // Not an error, may be user-initiated withdraw or fee
				}
				log.Printf("❌ [WithdrawExecuted] Query WithdrawRequest by request_id failed: %v", err)
				return fmt.Errorf("query WithdrawRequest failed: %w", err)
			}
			// Found by request_id, continue below
		} else {
			log.Printf("❌ [WithdrawExecuted] Query WithdrawRequest failed: %v", err)
			return fmt.Errorf("query WithdrawRequest failed: %w", err)
		}
	}

	log.Printf("✅ [WithdrawExecuted] Found WithdrawRequest: ID=%s", withdrawRequest.ID)

	// Step 2: Find all Checks associated with this WithdrawRequest
	var checks []models.Check
	err = p.db.Where("withdraw_request_id = ?", withdrawRequest.ID).Find(&checks).Error
	if err != nil {
		log.Printf("❌ [queryerror] queryCheckfailed: %v", err)
		return fmt.Errorf("queryCheckfailed: %w", err)
	}

	if len(checks) == 0 {
		log.Printf("⚠️ [WithdrawExecuted] No Checks found for WithdrawRequest ID=%s, trying deprecated request_id field", withdrawRequest.ID)
		// Fallback: Try to find by deprecated request_id field
		err = p.db.Where("request_id = ?", requestId).Find(&checks).Error
		if err != nil {
			log.Printf("❌ [queryerror] queryCheckfailed: %v", err)
			return fmt.Errorf("queryCheckfailed: %w", err)
		}
		if len(checks) == 0 {
			log.Printf("⚠️ [WithdrawExecuted] No Checks found by request_id either: RequestId=%s", requestId)
			return nil // Not an error, may be user-initiated withdraw or fee
		}
	}

	log.Printf("🎯 [WithdrawExecuted] Found %d checks to update", len(checks))
	return p.updateChecksAndPushCheckbook(checks, event)
}

// updateWithdrawRequestFromChecks 通过 Check 的 withdraw_request_id 更新 WithdrawRequest 状态
func (p *BlockchainEventProcessor) updateWithdrawRequestFromChecks(checks []models.Check, event *clients.EventWithdrawExecutedResponse) error {
	// 收集所有唯一的 withdraw_request_id
	withdrawRequestIDs := make(map[string]bool)
	for _, check := range checks {
		if check.WithdrawRequestID != nil && *check.WithdrawRequestID != "" {
			withdrawRequestIDs[*check.WithdrawRequestID] = true
		}
	}

	if len(withdrawRequestIDs) == 0 {
		log.Printf("⚠️ [WithdrawExecuted] No withdraw_request_id found in Checks, cannot update WithdrawRequest")
		return nil
	}

	// 更新所有找到的 WithdrawRequest
	for requestID := range withdrawRequestIDs {
		var withdrawRequest models.WithdrawRequest
		if err := p.db.Where("id = ?", requestID).First(&withdrawRequest).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				log.Printf("⚠️ [WithdrawExecuted] WithdrawRequest not found by ID from Check: ID=%s", requestID)
				continue
			}
			return fmt.Errorf("failed to query WithdrawRequest: %w", err)
		}

		log.Printf("✅ [WithdrawExecuted] Found WithdrawRequest by Check's withdraw_request_id: ID=%s", requestID)

		// 更新状态（与 ProcessWithdrawExecuted 中的逻辑一致）
		blockNumber := uint64(event.BlockNumber)
		chainID := uint32(event.ChainID)

		updates := map[string]interface{}{
			"execute_status":      models.ExecuteStatusSuccess,
			"payout_status":       models.PayoutStatusCompleted,
			"payout_chain_id":     chainID,
			"payout_tx_hash":      event.TransactionHash,
			"payout_block_number": blockNumber,
			"payout_completed_at": gorm.Expr("NOW()"),
		}

		// Only update execute fields if they are not already set
		if withdrawRequest.ExecuteTxHash == "" {
			updates["execute_tx_hash"] = event.TransactionHash
			updates["execute_block_number"] = blockNumber
			updates["execute_chain_id"] = chainID
		}

		if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
			log.Printf("❌ [WithdrawExecuted] Failed to update WithdrawRequest: %v", err)
			continue
		}

		// 更新主状态
		withdrawRequest.UpdateMainStatus()
		if err := p.db.Model(&withdrawRequest).Update("status", withdrawRequest.Status).Error; err != nil {
			log.Printf("⚠️ [WithdrawExecuted] Failed to update main status: %v", err)
		}

		log.Printf("✅ [WithdrawExecuted] Updated WithdrawRequest status: ID=%s, Status=%s", requestID, withdrawRequest.Status)
	}

	return nil
}

// updateChecksAndPushCheckbook updates Checks to 'used' status and pushes Checkbook updates
func (p *BlockchainEventProcessor) updateChecksAndPushCheckbook(checks []models.Check, event *clients.EventWithdrawExecutedResponse) error {

	updatedCount := 0
	checkbookIDs := make(map[string]bool) // Track unique checkbook IDs

	for i := range checks {
		check := &checks[i]
		// Checkstatusused
		advanced, err := p.advanceCheckStatus(check, models.AllocationStatusUsed, "WithdrawExecuted")
		if err != nil {
			log.Printf("❌ processCheck[%s]statusfailed: %v", check.ID, err)
			continue
		}

		if advanced {
			// Updatehash
			check.TransactionHash = event.TransactionHash
			if err := p.db.Save(check).Error; err != nil {
				log.Printf("❌ [Updatefailed] saveCheck TransactionHashfailed: %v", err)
				continue
			}
			log.Printf("✅ [Updatesuccess] Check TransactionHashalreadyUpdate: %s", check.TransactionHash)
			updatedCount++

			// Track checkbook ID for push notification
			if check.CheckbookID != "" {
				checkbookIDs[check.CheckbookID] = true
			}
		}
	}

	// Push Checkbook status updates to frontend
	// Even if Checkbook status doesn't change, we need to notify frontend that Checks under it have changed
	if p.pushService != nil && len(checkbookIDs) > 0 {
		log.Printf("📡 [WithdrawExecuted] Pushing Checkbook status updates for %d checkbook(s)", len(checkbookIDs))
		for checkbookID := range checkbookIDs {
			// Query checkbook to get current status
			var checkbook models.Checkbook
			if err := p.db.First(&checkbook, "id = ?", checkbookID).Error; err != nil {
				log.Printf("⚠️ [WithdrawExecuted] Failed to query Checkbook ID=%s: %v", checkbookID, err)
				continue
			}

			// Push checkbook update (status may not change, but Checks under it have changed)
			p.pushService.PushCheckbookStatusUpdateDirect(&checkbook, string(checkbook.Status), "WithdrawExecuted")
			log.Printf("✅ [WithdrawExecuted] Pushed Checkbook update: ID=%s, Status=%s", checkbookID, checkbook.Status)
		}
	}

	log.Printf("✅ WithdrawExecutedprocesscompleted: Check=%d, status=%d, Checkbook=%d", len(checks), updatedCount, len(checkbookIDs))
	return nil
}

// ============ status ============

// getStatusProgression Getstatus
func (p *BlockchainEventProcessor) getStatusProgression() map[models.CheckbookStatus]int {
	return map[models.CheckbookStatus]int{
		models.CheckbookStatusPending:              1,
		models.CheckbookStatusUnsigned:             2,
		models.CheckbookStatusReadyForCommitment:   3,
		models.CheckbookStatusGeneratingProof:      4,
		models.CheckbookStatusSubmittingCommitment: 5,
		models.CheckbookStatusCommitmentPending:    6,
		models.CheckbookStatusWithCheckbook:        7,
	}
}

// advanceCheckbookStatus Checkbookstatus（ifcurrentstatus）
func (p *BlockchainEventProcessor) advanceCheckbookStatus(checkbook *models.Checkbook, targetStatus models.CheckbookStatus, context string) (bool, error) {
	statusProgression := p.getStatusProgression()
	currentLevel := statusProgression[checkbook.Status]
	targetLevel := statusProgression[targetStatus]

	if currentLevel < targetLevel {
		oldStatus := checkbook.Status

		// UsepushserviceUpdatestatus
		updates := map[string]interface{}{
			"status":     targetStatus,
			"updated_at": time.Now(),
		}

		if p.dbWithPush != nil {
			if err := p.dbWithPush.UpdateCheckbook(checkbook.ID, updates, context); err != nil {
				log.Printf("❌ [%s] statusfailed: %v", context, err)
				return false, fmt.Errorf("UpdateCheckbookstatusfailed: %w", err)
			}
			log.Printf("🔄 [%s] statussuccessalreadypush: %s → %s (ID=%s)", context, oldStatus, targetStatus, checkbook.ID)
		} else {
			// ：UpdateDatabase
			checkbook.Status = targetStatus
			if err := p.db.Save(checkbook).Error; err != nil {
				log.Printf("❌ [%s] statusfailed: %v", context, err)
				return false, fmt.Errorf("UpdateCheckbookstatusfailed: %w", err)
			}
			log.Printf("🔄 [%s] statussuccess: %s → %s (ID=%s)", context, oldStatus, targetStatus, checkbook.ID)
			log.Printf("⚠️ [%s] pushservicenotinitialize，push", context)
		}

		return true, nil
	} else {
		log.Printf("ℹ️ [%s] status: current=%s（%d） >= target=%s（%d）",
			context, checkbook.Status, currentLevel, targetStatus, targetLevel)
		return false, nil
	}
}

// getCheckStatusProgression GetCheckstatus
func (p *BlockchainEventProcessor) getCheckStatusProgression() map[models.CheckStatus]int {
	return map[models.CheckStatus]int{
		models.CheckStatus(models.AllocationStatusIdle):    0,
		models.CheckStatus(models.AllocationStatusPending): 1,
		models.CheckStatus(models.AllocationStatusUsed):    2,
	}
}

// advanceCheckStatus Checkstatus（ifcurrentstatus）
func (p *BlockchainEventProcessor) advanceCheckStatus(check *models.Check, targetStatus models.AllocationStatus, context string) (bool, error) {
	statusProgression := p.getCheckStatusProgression()
	currentLevel := statusProgression[models.CheckStatus(check.Status)]
	targetLevel := statusProgression[models.CheckStatus(targetStatus)]

	if currentLevel < targetLevel {
		oldStatus := check.Status

		// UsepushserviceUpdateCheckstatus
		if p.dbWithPush != nil {
			if err := p.dbWithPush.UpdateCheckStatus(check.ID, targetStatus, context); err != nil {
				log.Printf("❌ [%s] Checkstatusfailed: %v", context, err)
				return false, fmt.Errorf("UpdateCheckstatusfailed: %w", err)
			}
			log.Printf("🔄 [%s] Checkstatussuccessalreadypush: %s → %s (ID=%s)", context, oldStatus, targetStatus, check.ID)
		} else {
			// ：UpdateDatabase
			check.Status = targetStatus
			if err := p.db.Save(check).Error; err != nil {
				log.Printf("❌ [%s] Checkstatusfailed: %v", context, err)
				return false, fmt.Errorf("UpdateCheckstatusfailed: %w", err)
			}
			log.Printf("🔄 [%s] Checkstatussuccess: %s → %s (ID=%s)", context, oldStatus, targetStatus, check.ID)
			log.Printf("⚠️ [%s] pushservicenotinitialize，push", context)
		}

		return true, nil
	} else {
		log.Printf("ℹ️ [%s] Checkstatus: current=%s（%d） >= target=%s（%d）",
			context, check.Status, currentLevel, targetStatus, targetLevel)
		return false, nil
	}
}

// ============ queue rootqueryinterface ============

// GetCommitmentQueueInfo commitmentGetqueue rootInfoandsubsequentcommitment
func (p *BlockchainEventProcessor) GetCommitmentQueueInfo(commitment string) (*CommitmentQueueInfo, error) {
	return p.queueRootManager.GetCommitmentQueueInfo(commitment)
}

// GetCommitmentChainFromRoot startGetcommitment
func (p *BlockchainEventProcessor) GetCommitmentChainFromRoot(startRoot string) ([]string, error) {
	return p.queueRootManager.GetCommitmentChainFromRoot(startRoot)
}

// ============ New Event Processors for WithdrawRequest Retry Design ============

// ProcessPayoutExecuted processes Treasury.PayoutExecuted event
func (p *BlockchainEventProcessor) ProcessPayoutExecuted(event *clients.EventPayoutExecutedResponse) error {
	log.Printf("📥 ProcessPayoutExecuted: Chain=%d, RequestId=%s, WorkerType=%d",
		event.ChainID, event.EventData.RequestId, event.EventData.WorkerType)

	// Find WithdrawRequest by requestId
	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [PayoutExecuted] WithdrawRequest not found: RequestId=%s", event.EventData.RequestId)
			return nil // Don't fail, just log
		}
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	// Update payout status to completed
	blockNumber := uint64(event.BlockNumber)
	chainID := uint32(event.ChainID) // SLIP44 chain ID where payout TX was executed
	now := time.Now()
	workerType := uint8(event.EventData.WorkerType)

	updates := map[string]interface{}{
		"payout_status":       models.PayoutStatusCompleted,
		"payout_chain_id":     chainID, // Record chain ID where payout transaction was executed
		"payout_tx_hash":      event.TransactionHash,
		"payout_block_number": blockNumber,
		"payout_completed_at": now,
		"worker_type":         workerType,
		"actual_output":       event.EventData.ActualOutput,
		"payout_error":        "", // Clear error on success
	}

	if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
		return fmt.Errorf("update WithdrawRequest failed: %w", err)
	}

	// Update main status
	withdrawRequest.PayoutStatus = models.PayoutStatusCompleted
	withdrawRequest.WorkerType = &workerType
	withdrawRequest.ActualOutput = event.EventData.ActualOutput
	withdrawRequest.UpdateMainStatus()
	if err := p.db.Save(&withdrawRequest).Error; err != nil {
		log.Printf("❌ [PayoutExecuted] Failed to update main status: %v", err)
		return err
	}

	log.Printf("✅ [PayoutExecuted] Payout completed: RequestId=%s, WorkerType=%d", event.EventData.RequestId, workerType)
	// Push WebSocket update for WithdrawRequest status change
	if p.pushService != nil {
		p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "PayoutExecuted")
	}
	return nil
}

// ProcessPayoutFailed processes Treasury.PayoutFailed event
// ⭐ Simplified design: Payout failure → failed_permanent (waiting for manual resolution)
func (p *BlockchainEventProcessor) ProcessPayoutFailed(event *clients.EventPayoutFailedResponse) error {
	log.Printf("📥 ProcessPayoutFailed: Chain=%d, RequestId=%s, WorkerType=%d, Error=%s",
		event.ChainID, event.EventData.RequestId, event.EventData.WorkerType, event.EventData.ErrorReason)

	// Find WithdrawRequest by requestId
	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [PayoutFailed] WithdrawRequest not found: RequestId=%s", event.EventData.RequestId)
			return nil
		}
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	// ⭐ Simplified design: Directly set to failed_permanent (waiting for manual resolution)
	updates := map[string]interface{}{
		"payout_status": models.PayoutStatusFailed,
		"payout_error":  event.EventData.ErrorReason,
		"status":        string(models.WithdrawStatusFailedPermanent), // ⭐ Directly set to failed_permanent
	}

	if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
		return fmt.Errorf("update WithdrawRequest failed: %w", err)
	}

	log.Printf("⚠️ [PayoutFailed] Payout failed → failed_permanent (waiting for manual resolution): RequestId=%s, Error=%s",
		event.EventData.RequestId, event.EventData.ErrorReason)
	return nil
}

// ProcessHookExecuted processes IntentManager.HookExecuted event
func (p *BlockchainEventProcessor) ProcessHookExecuted(event *clients.EventHookExecutedResponse) error {
	log.Printf("📥 ProcessHookExecuted: Chain=%d, RequestId=%s", event.ChainID, event.EventData.RequestId)

	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [HookExecuted] WithdrawRequest not found: RequestId=%s", event.EventData.RequestId)
			return nil
		}
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	// Update hook status to completed
	now := time.Now()
	chainID := uint32(event.ChainID) // SLIP44 chain ID where hook TX was executed
	updates := map[string]interface{}{
		"hook_status":       models.HookStatusCompleted,
		"hook_chain_id":     chainID, // Record chain ID where hook transaction was executed
		"hook_tx_hash":      event.TransactionHash,
		"hook_completed_at": now,
		"hook_error":        "", // Clear error on success
	}

	if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
		return fmt.Errorf("update WithdrawRequest failed: %w", err)
	}

	// Update main status
	withdrawRequest.HookStatus = models.HookStatusCompleted
	withdrawRequest.UpdateMainStatus()
	if err := p.db.Save(&withdrawRequest).Error; err != nil {
		log.Printf("❌ [HookExecuted] Failed to update main status: %v", err)
		return err
	}

	log.Printf("✅ [HookExecuted] Hook completed: RequestId=%s", event.EventData.RequestId)
	// Push WebSocket update for WithdrawRequest status change
	if p.pushService != nil {
		p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "HookExecuted")
	}
	return nil
}

// ProcessHookFailed processes IntentManager.HookFailed event
func (p *BlockchainEventProcessor) ProcessHookFailed(event *clients.EventHookFailedResponse) error {
	log.Printf("📥 ProcessHookFailed: Chain=%d, RequestId=%s", event.ChainID, event.EventData.RequestId)

	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [HookFailed] WithdrawRequest not found: RequestId=%s", event.EventData.RequestId)
			return nil
		}
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	// Update hook status to failed (even on failure, record the transaction hash)
	chainID := uint32(event.ChainID) // SLIP44 chain ID where hook TX was executed
	updates := map[string]interface{}{
		"hook_status":   models.HookStatusFailed,
		"hook_chain_id": chainID,               // Record chain ID where hook transaction was executed
		"hook_tx_hash":  event.TransactionHash, // Record transaction hash even on failure
		"hook_error":    event.EventData.ErrorData,
	}

	if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
		return fmt.Errorf("update WithdrawRequest failed: %w", err)
	}

	// Update main status (will check fallback_transferred in UpdateMainStatus)
	withdrawRequest.HookStatus = models.HookStatusFailed
	withdrawRequest.HookError = event.EventData.ErrorData
	withdrawRequest.UpdateMainStatus()
	if err := p.db.Save(&withdrawRequest).Error; err != nil {
		log.Printf("❌ [HookFailed] Failed to update main status: %v", err)
		return err
	}

	log.Printf("⚠️ [HookFailed] Hook failed: RequestId=%s, waiting for fallback", event.EventData.RequestId)
	// Push WebSocket update for WithdrawRequest status change
	if p.pushService != nil {
		p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "HookFailed")
	}
	return nil
}

// ProcessFallbackTransferred processes IntentManager.FallbackTransferred event
func (p *BlockchainEventProcessor) ProcessFallbackTransferred(event *clients.EventFallbackTransferredResponse) error {
	log.Printf("📥 ProcessFallbackTransferred: Chain=%d, RequestId=%s", event.ChainID, event.EventData.RequestId)

	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [FallbackTransferred] WithdrawRequest not found: RequestId=%s", event.EventData.RequestId)
			return nil
		}
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	// Update fallback status
	updates := map[string]interface{}{
		"fallback_transferred": true,
		"fallback_error":       "", // Clear error on success
	}

	if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
		return fmt.Errorf("update WithdrawRequest failed: %w", err)
	}

	// Update main status (should be completed with fallback_transferred = true)
	withdrawRequest.FallbackTransferred = true
	withdrawRequest.UpdateMainStatus()
	if err := p.db.Save(&withdrawRequest).Error; err != nil {
		log.Printf("❌ [FallbackTransferred] Failed to update main status: %v", err)
		return err
	}

	log.Printf("✅ [FallbackTransferred] Fallback transfer succeeded: RequestId=%s", event.EventData.RequestId)
	// Push WebSocket update for WithdrawRequest status change
	if p.pushService != nil {
		p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "FallbackTransferred")
	}
	return nil
}

// ProcessFallbackFailed processes IntentManager.FallbackFailed event
func (p *BlockchainEventProcessor) ProcessFallbackFailed(event *clients.EventFallbackFailedResponse) error {
	log.Printf("📥 ProcessFallbackFailed: Chain=%d, RequestId=%s, Error=%s",
		event.ChainID, event.EventData.RequestId, event.EventData.ErrorReason)

	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [FallbackFailed] WithdrawRequest not found: RequestId=%s", event.EventData.RequestId)
			return nil
		}
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	// Update fallback error (simplified: just record error, wait for manual resolution)
	updates := map[string]interface{}{
		"fallback_error":       event.EventData.ErrorReason,
		"fallback_transferred": false,
	}

	if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
		return fmt.Errorf("update WithdrawRequest failed: %w", err)
	}

	// Update main status
	withdrawRequest.FallbackError = event.EventData.ErrorReason
	withdrawRequest.FallbackTransferred = false
	withdrawRequest.UpdateMainStatus()
	if err := p.db.Save(&withdrawRequest).Error; err != nil {
		log.Printf("❌ [FallbackFailed] Failed to update main status: %v", err)
		return err
	}

	log.Printf("⚠️ [FallbackFailed] Fallback transfer failed: RequestId=%s, Error=%s", event.EventData.RequestId, event.EventData.ErrorReason)
	// Push WebSocket update for WithdrawRequest status change
	if p.pushService != nil {
		p.pushService.PushWithdrawRequestStatusUpdateDirect(&withdrawRequest, "", "FallbackFailed")
	}
	return nil
}

// ProcessManuallyResolved processes ZKPayProxy.ManuallyResolved event
// This event is emitted when admin manually resolves a failed withdraw request
func (p *BlockchainEventProcessor) ProcessManuallyResolved(event *clients.EventManuallyResolvedResponse) error {
	log.Printf("📥 ProcessManuallyResolved: Chain=%d, RequestId=%s, Resolver=%s, Note=%s",
		event.ChainID, event.EventData.RequestId, event.EventData.Resolver, event.EventData.Note)

	// Find WithdrawRequest by requestId
	var withdrawRequest models.WithdrawRequest
	err := p.db.Where("withdraw_nullifier = ?", event.EventData.RequestId).First(&withdrawRequest).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("⚠️ [ManuallyResolved] WithdrawRequest not found: RequestId=%s", event.EventData.RequestId)
			return nil
		}
		return fmt.Errorf("query WithdrawRequest failed: %w", err)
	}

	// Set status to manually_resolved (terminal state)
	updates := map[string]interface{}{
		"status": string(models.WithdrawStatusManuallyResolved),
	}

	if err := p.db.Model(&withdrawRequest).Updates(updates).Error; err != nil {
		return fmt.Errorf("update WithdrawRequest failed: %w", err)
	}

	log.Printf("✅ [ManuallyResolved] WithdrawRequest manually resolved: RequestId=%s, Resolver=%s",
		event.EventData.RequestId, event.EventData.Resolver)
	return nil
}

// ProcessPayoutRetryRecordCreated processes Treasury.PayoutRetryRecordCreated event
func (p *BlockchainEventProcessor) ProcessPayoutRetryRecordCreated(event *clients.EventPayoutRetryRecordCreatedResponse) error {
	log.Printf("📥 ProcessPayoutRetryRecordCreated: Chain=%d, RecordId=%s, RequestId=%s",
		event.ChainID, event.EventData.RecordId, event.EventData.RequestId)

	// TODO: Sync retry record from chain and store in database
	// This will be implemented when we have chain query capability
	log.Printf("ℹ️ [PayoutRetryRecordCreated] Retry record created, will sync from chain later")
	return nil
}

// ProcessFallbackRetryRecordCreated processes Treasury.FallbackRetryRecordCreated event
func (p *BlockchainEventProcessor) ProcessFallbackRetryRecordCreated(event *clients.EventFallbackRetryRecordCreatedResponse) error {
	log.Printf("📥 ProcessFallbackRetryRecordCreated: Chain=%d, RecordId=%s, RequestId=%s",
		event.ChainID, event.EventData.RecordId, event.EventData.RequestId)

	// TODO: Sync retry record from chain and store in database
	log.Printf("ℹ️ [FallbackRetryRecordCreated] Retry record created, will sync from chain later")
	return nil
}
