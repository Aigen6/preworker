package events

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/services"
	"go-backend/internal/utils"

	"gorm.io/gorm"
)

var (
	natsClient           *clients.NATSClient
	eventProcessor       *services.BlockchainEventProcessor
	pushService          *services.WebSocketPushService
	databaseWithPush     *services.DatabaseWithPushService
	natsOnce             sync.Once
	eventProcessorOnce   sync.Once
	pushServiceOnce      sync.Once
	databaseWithPushOnce sync.Once
)

// InitNATSServices InitializeNATSservice
func InitNATSServices() error {
	var initErr error
	natsOnce.Do(func() {
		// CheckwhetherconfigurationNATS
		if config.AppConfig == nil || config.AppConfig.NATS.URL == "" {
			log.Println("NATS not configured, skipping initialization")
			return
		}

		// Checkscanner
		if config.AppConfig.Scanner.Type != "nats" {
			log.Println("Scanner type is not NATS, skipping NATS initialization")
			return
		}

		// configuration fileGetSubscriptionSubject
		subjects := map[string]string{
			"events":      "zkpay.*.*.*",
			"deposits":    "zkpay.*.Treasury.DepositReceived",
			"commitments": "zkpay.bsc.ZKPayProxy.CommitmentRootUpdated",
			"withdrawals": "zkpay.*.Treasury.WithdrawExecuted",
		}

		streamName := "ZKPAY_EVENTS"
		consumerName := "zkpay-backend-consumer"

		client, err := clients.NewNATSClient(
			config.AppConfig.NATS.URL,
			streamName,
			consumerName,
			subjects,
		)
		if err != nil {
			initErr = fmt.Errorf("failed to create NATS client: %w", err)
			return
		}

		natsClient = client
		log.Printf("✅ NATS client initialized successfully")

		// subscribe to events
		if err := SubscribeToEvents(); err != nil {
			initErr = fmt.Errorf("failed to subscribe to events: %w", err)
			return
		}

		log.Printf("✅ NATS event subscriptions initialized")
	})

	return initErr
}

// subscribeToEvents SubscriptionNATSevent
func SubscribeToEvents() error {
	if natsClient == nil {
		return fmt.Errorf("NATS client not initialized")
	}

	// Subscriptiondepositevent
	if err := natsClient.SubscribeToDepositReceived(handleDepositReceivedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to deposit received: %w", err)
	}

	// Subscriptiondepositrecordevent
	if err := natsClient.SubscribeToDepositRecorded(handleDepositRecordedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to deposit recorded: %w", err)
	}

	// SubscriptiondepositUseevent
	if err := natsClient.SubscribeToDepositUsed(handleDepositUsedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to deposit used: %w", err)
	}

	// Subscriptionqueue rootUpdateevent
	if err := natsClient.SubscribeToCommitmentRootUpdates(handleCommitmentRootUpdateEvent); err != nil {
		return fmt.Errorf("failed to subscribe to commitment root updates: %w", err)
	}

	// Subscriptionwithdrawrequestevent
	if err := natsClient.SubscribeToWithdrawRequested(handleWithdrawRequestedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to withdraw requested: %w", err)
	}

	// Subscriptionwithdrawevent
	if err := natsClient.SubscribeToWithdrawExecuted(handleWithdrawExecutedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to withdraw executed: %w", err)
	}

	// SubscriptionIntentManager.WithdrawExecuted event (payout completion)
	if err := natsClient.SubscribeToIntentManagerWithdrawExecuted(handleIntentManagerWithdrawExecutedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to IntentManager.WithdrawExecuted: %w", err)
	}

	// Subscribe to new Treasury events
	if err := natsClient.SubscribeToPayoutExecuted(handlePayoutExecutedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to PayoutExecuted: %w", err)
	}

	if err := natsClient.SubscribeToPayoutFailed(handlePayoutFailedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to PayoutFailed: %w", err)
	}

	// Subscribe to new IntentManager events
	if err := natsClient.SubscribeToHookExecuted(handleHookExecutedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to HookExecuted: %w", err)
	}

	if err := natsClient.SubscribeToHookFailed(handleHookFailedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to HookFailed: %w", err)
	}

	if err := natsClient.SubscribeToFallbackTransferred(handleFallbackTransferredEvent); err != nil {
		return fmt.Errorf("failed to subscribe to FallbackTransferred: %w", err)
	}

	if err := natsClient.SubscribeToFallbackFailed(handleFallbackFailedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to FallbackFailed: %w", err)
	}

	// Subscribe to retry record events
	if err := natsClient.SubscribeToPayoutRetryRecordCreated(handlePayoutRetryRecordCreatedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to PayoutRetryRecordCreated: %w", err)
	}

	if err := natsClient.SubscribeToFallbackRetryRecordCreated(handleFallbackRetryRecordCreatedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to FallbackRetryRecordCreated: %w", err)
	}

	// Subscribe to ManuallyResolved event
	if err := natsClient.SubscribeToManuallyResolved(handleManuallyResolvedEvent); err != nil {
		return fmt.Errorf("failed to subscribe to ManuallyResolved: %w", err)
	}

	return nil
}

// handleDepositReceivedEvent processdepositevent
func handleDepositReceivedEvent(depositReceived *clients.EventDepositReceivedResponse, subject string) {
	startTime := time.Now()
	eventType := "DepositReceived"

	// 记录 metrics
	services.RecordNATSMessageReceived(eventType)

	// NATSSubjectParseSLIP-44 ChainID
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		log.Printf("❌ [NATS] Subject %s Parsechain ID: %v", subject, err)
		// Useeventchain ID
		chainID = utils.EvmToSlip44(int(depositReceived.ChainID))
		log.Printf("⚠️ [NATS] useeventchain ID，Convertchain ID: %d", chainID)
	}

	log.Printf("🎉🏦 [NATS] DepositReceivedevent - LocalDepositId=%d, amount=%s, chain ID=%d (SLIP-44)",
		depositReceived.EventData.LocalDepositId, depositReceived.EventData.Amount, chainID)
	log.Printf("   deposit: %s, Token=%s", depositReceived.EventData.Depositor, depositReceived.EventData.Token)

	// saveDatabaseandCreateCheckbook - BlockchainEventProcessor
	processor := GetEventProcessor()
	if err := processor.ProcessDepositReceived(depositReceived); err != nil {
		log.Printf("❌ [NATS] processDepositReceivedeventfailed: %v", err)
		// 记录 metrics
		errorType := "process_error"
		services.RecordNATSMessageFailed(eventType, errorType)
		services.RecordEventListenerError(eventType, errorType)
		return
	}

	// 记录 metrics
	duration := time.Since(startTime)
	services.RecordNATSMessageProcessed(eventType)
	services.RecordEventProcessingDuration(eventType, duration)

	log.Printf("📈 DepositReceivedeventprocesscompleted")
}

// handleDepositRecordedEvent processdepositrecordevent
func handleDepositRecordedEvent(depositRecorded *clients.EventDepositRecordedResponse, subject string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("❌ [handleDepositRecordedEvent] PANIC recovered: %v", r)
		}
	}()

	log.Printf("🚀 [handleDepositRecordedEvent] Function called! LocalDepositId=%d", depositRecorded.EventData.LocalDepositId)

	// DepositRecordedeventUseeventdataChainID（Info）
	// depositRecorded.ChainID is already SLIP-44 Chain ID from ConvertScannerEventToDepositRecorded
	// Use SmartToSlip44 to handle both EVM Chain ID and SLIP-44 ChainID (smart conversion)
	log.Printf("🔍 [handleDepositRecordedEvent] Before SmartToSlip44, ChainID=%d", depositRecorded.ChainID)
	chainID := utils.SmartToSlip44(int(depositRecorded.ChainID))
	log.Printf("📋 [NATS] DepositRecordedeventuseeventdataSLIP44ChainID: %d -> %d (SLIP-44)", depositRecorded.ChainID, chainID)

	// Ensure tokenKey mapper is initialized
	log.Printf("🔍 [handleDepositRecordedEvent] Before InitTokenKeyHashMap")
	utils.InitTokenKeyHashMap()
	log.Printf("🔍 [handleDepositRecordedEvent] After InitTokenKeyHashMap")

	// Convert tokenKey hash to original string for logging
	log.Printf("🔍 [handleDepositRecordedEvent] Converting tokenKey hash: %s", depositRecorded.EventData.TokenKey)
	originalTokenKey := utils.GetTokenKeyFromHash(depositRecorded.EventData.TokenKey)
	log.Printf("🔍 [handleDepositRecordedEvent] Converted tokenKey: %s", originalTokenKey)

	log.Printf("🎉📋 [NATS] DepositRecordedevent - LocalDepositId=%d, GrossAmount=%s, chain ID=%d (SLIP-44)",
		depositRecorded.EventData.LocalDepositId, depositRecorded.EventData.GrossAmount, chainID)
	log.Printf("   : %d:%s, TokenKey=%s, AllocatableAmount=%s, FeeTotalLocked=%s",
		depositRecorded.EventData.Owner.ChainId, depositRecorded.EventData.Owner.Data,
		originalTokenKey, depositRecorded.EventData.AllocatableAmount, depositRecorded.EventData.FeeTotalLocked)

	// 记录 metrics
	startTime := time.Now()
	eventType := "DepositRecorded"
	services.RecordNATSMessageReceived(eventType)

	// saveDatabaseandUpdateCheckbook - BlockchainEventProcessor
	log.Printf("🔄 [NATS] Calling ProcessDepositRecorded...")
	processor := GetEventProcessor()
	if processor == nil {
		log.Printf("❌ [NATS] EventProcessor is nil!")
		services.RecordNATSMessageFailed(eventType, "processor_nil")
		services.RecordEventListenerError(eventType, "processor_nil")
		return
	}
	log.Printf("✅ [NATS] EventProcessor obtained, calling ProcessDepositRecorded...")
	if err := processor.ProcessDepositRecorded(depositRecorded); err != nil {
		log.Printf("❌ [NATS] processDepositRecordedeventfailed: %v", err)
		// 记录 metrics
		errorType := "process_error"
		services.RecordNATSMessageFailed(eventType, errorType)
		services.RecordEventListenerError(eventType, errorType)
		return
	}

	// 记录 metrics
	duration := time.Since(startTime)
	services.RecordNATSMessageProcessed(eventType)
	services.RecordEventProcessingDuration(eventType, duration)

	log.Printf("📈 DepositRecordedeventprocesscompleted")
}

// handleDepositUsedEvent processdepositUseevent
func handleDepositUsedEvent(depositUsed *clients.EventDepositUsedResponse, subject string) {
	// DepositUsedeventUseeventdataChainID（Info）
	chainID := utils.EvmToSlip44(int(depositUsed.ChainID))
	log.Printf("🔗 [NATS] DepositUsedeventuseeventdataSLIP44ChainID: %d -> %d (SLIP-44)", depositUsed.ChainID, chainID)

	log.Printf("🎉🔗 [NATS] DepositUsedevent - LocalDepositId=%d, Commitment=%s, chain ID=%d (SLIP-44)",
		depositUsed.EventData.LocalDepositId, depositUsed.EventData.Commitment, chainID)

	// eventprocessprocess
	processor := GetEventProcessor()
	if err := processor.ProcessDepositUsed(depositUsed); err != nil {
		log.Printf("❌ [NATS] processDepositUsedeventfailed: %v", err)
		return
	}

	log.Printf("📈 DepositUsedeventprocesscompleted")
}

// handleDepositEvent processdepositevent (already - delete)
func handleDepositEvent_DEPRECATED(deposit interface{}, subject string) {
	// already，Useeventprocess：
	// - handleDepositReceivedEvent()
	// - handleDepositRecordedEvent()
	// - handleDepositUsedEvent()
	log.Printf("⚠️ [NATS] alreadyhandleDepositEvent")
}

// === eventprocessalreadydelete，Use ===

// handleCommitmentRootUpdateEvent processUpdateevent (CommitmentRootUpdated)
func handleCommitmentRootUpdateEvent(queueRoot *clients.EventCommitmentRootUpdatedResponse, subject string) {
	startTime := time.Now()
	eventType := "CommitmentRootUpdated"

	// 记录 metrics
	services.RecordNATSMessageReceived(eventType)

	// CommitmentRootUpdatedeventUseeventdataChainID（Info）
	// Use SmartToSlip44 to handle both EVM Chain ID and SLIP-44 ChainID
	chainID := utils.SmartToSlip44(int(queueRoot.ChainID))
	log.Printf("🌳 [NATS] CommitmentRootUpdatedeventuseeventdataSLIP44ChainID: %d -> %d (SLIP-44)", queueRoot.ChainID, chainID)

	log.Printf("🌳 queue rootUpdateevent: Subject=%s, ChainID=%d (SLIP-44), =%d, TxHash=%s",
		subject, chainID, queueRoot.BlockNumber, queueRoot.TransactionHash)
	log.Printf("   eventdata: OldRoot=%s, Commitment=%s, NewRoot=%s",
		queueRoot.EventData.OldRoot, queueRoot.EventData.Commitment, queueRoot.EventData.NewRoot)

	// 🎯 1. ：Useeventprocessprocess
	processor := GetEventProcessor()
	if err := processor.ProcessCommitmentRootUpdated(queueRoot); err != nil {
		log.Printf("❌ eventprocessprocessfailed: %v", err)
		// 记录 metrics
		errorType := "process_error"
		services.RecordNATSMessageFailed(eventType, errorType)
		services.RecordEventListenerError(eventType, errorType)
	} else {
		// 记录 metrics
		duration := time.Since(startTime)
		services.RecordNATSMessageProcessed(eventType)
		services.RecordEventProcessingDuration(eventType, duration)
	}

	// 🏦 2. saveQueueRootV2Database
	if err := saveQueueRootToDatabase(queueRoot, chainID); err != nil {
		log.Printf("❌ savequeue rootDatabasefailed: %v", err)
	} else {
		log.Printf("✅ queue rootalreadysaveDatabase: NewRoot=%s, ChainID=%d", queueRoot.EventData.NewRoot, chainID)
	}
}

// handleWithdrawRequestedEvent processwithdrawrequestevent
func handleWithdrawRequestedEvent(withdrawRequested *clients.EventWithdrawRequestedResponse, subject string) {
	startTime := time.Now()
	eventType := "WithdrawRequested"

	// 记录 metrics
	services.RecordNATSMessageReceived(eventType)

	// WithdrawRequestedeventUseeventdataChainID（Info）
	// Try to get chain ID from subject first, fallback to ChainID field
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil || chainID == 0 {
		// Fallback to ChainID field and convert
		chainID = utils.SmartToSlip44(int(withdrawRequested.ChainID))
		log.Printf("💰 [NATS] WithdrawRequestedeventuseeventdataSLIP44ChainID: %d -> %d (SLIP-44)", withdrawRequested.ChainID, chainID)
	} else {
		log.Printf("💰 [NATS] WithdrawRequestedeventuseSubjectSLIP44ChainID: %d (SLIP-44)", chainID)
	}

	log.Printf("🎉💰 [NATS] WithdrawRequestedevent: RequestId=%s, amount=%s, chain ID=%d (SLIP-44)",
		withdrawRequested.EventData.RequestId, withdrawRequested.EventData.Amount, chainID)
	log.Printf("   address(hash): %s, TokenId=%d",
		withdrawRequested.EventData.Recipient, withdrawRequested.EventData.TokenId)

	// Step 1: Update Check status (handled by updateCheckStatusOnWithdrawRequested)
	// Step 2: Update WithdrawRequest status (handled by ProcessWithdrawRequested)

	// Step 1: Update Check status
	if err := updateCheckStatusOnWithdrawRequested(withdrawRequested); err != nil {
		log.Printf("❌ [NATS] WithdrawRequested Check update failed: %v", err)
		// Continue to Step 2 even if Check update failed
	} else {
		log.Printf("✅ [NATS] WithdrawRequested Check update success")
	}

	// Step 2: Update WithdrawRequest status (proof_status=completed, execute_status=success, payout_status=pending)
	processor := GetEventProcessor()
	if processor != nil {
		if err := processor.ProcessWithdrawRequested(withdrawRequested); err != nil {
			log.Printf("❌ [NATS] ProcessWithdrawRequested failed: %v", err)
			// 记录 metrics
			errorType := "process_error"
			services.RecordNATSMessageFailed(eventType, errorType)
			services.RecordEventListenerError(eventType, errorType)
		} else {
			log.Printf("✅ [NATS] ProcessWithdrawRequested success")
			// 记录 metrics
			duration := time.Since(startTime)
			services.RecordNATSMessageProcessed(eventType)
			services.RecordEventProcessingDuration(eventType, duration)
		}
	} else {
		log.Printf("⚠️ [NATS] EventProcessor not initialized, skipping WithdrawRequest status update")
		services.RecordNATSMessageFailed(eventType, "processor_nil")
		services.RecordEventListenerError(eventType, "processor_nil")
	}

	log.Printf("📈 WithdrawRequestedeventprocesscompleted")
}

// handleWithdrawExecutedEvent processwithdrawevent
func handleWithdrawExecutedEvent(withdrawExecuted *clients.EventWithdrawExecutedResponse, subject string) {
	startTime := time.Now()
	eventType := "WithdrawExecuted"

	// 记录 metrics
	services.RecordNATSMessageReceived(eventType)

	// 🎯 NATSSubjectParseSLIP-44 ChainID
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		log.Printf("❌ [NATS] Subject %s Parsechain ID: %v", subject, err)
		// ，UseeventdatachainIDattemptConvert
		chainID = utils.EvmToSlip44(int(withdrawExecuted.ChainID))
		log.Printf("⚠️ [NATS] use，Convertchain ID: %d", chainID)
	} else {
		log.Printf("✅ [NATS] SubjectsuccessParsechain ID: %s -> %d (SLIP-44)", subject, chainID)
	}

	// 🔧 eventdataChainIDDatabasestorage
	originalChainID := withdrawExecuted.ChainID
	withdrawExecuted.ChainID = int64(chainID)

	log.Printf("🎉💸 [NATS] WithdrawExecutedevent: RequestId=%s, amount=%s, chain ID=%d (SLIP-44)",
		withdrawExecuted.EventData.RequestId, withdrawExecuted.EventData.Amount, chainID)
	log.Printf("   address: %s, Token=%s", withdrawExecuted.EventData.Recipient, withdrawExecuted.EventData.Token)
	log.Printf("   🔧 ChainID: %d -> %d (SLIP-44)", originalChainID, withdrawExecuted.ChainID)

	// Step 1: Update Check status to 'used' (handled by updateCheckStatusOnWithdrawExecuted)
	// Step 2: Update WithdrawRequest status (handled by ProcessWithdrawExecuted)

	// Step 1: Update Check status
	if err := updateCheckStatusOnWithdrawExecuted(withdrawExecuted); err != nil {
		log.Printf("❌ [NATS] WithdrawExecuted Check update failed: %v", err)
		// Continue to Step 2 even if Check update failed
	} else {
		log.Printf("✅ [NATS] WithdrawExecuted Check update success")
	}

	// Step 2: Update WithdrawRequest status (execute_status=success, payout_status=completed)
	processor := GetEventProcessor()
	if processor != nil {
		if err := processor.ProcessWithdrawExecuted(withdrawExecuted); err != nil {
			log.Printf("❌ [NATS] ProcessWithdrawExecuted failed: %v", err)
			// 记录 metrics
			errorType := "process_error"
			services.RecordNATSMessageFailed(eventType, errorType)
			services.RecordEventListenerError(eventType, errorType)
		} else {
			log.Printf("✅ [NATS] ProcessWithdrawExecuted success")
		}
	} else {
		log.Printf("⚠️ [NATS] EventProcessor not initialized, skipping WithdrawRequest status update")
	}

	// 记录 metrics
	duration := time.Since(startTime)
	services.RecordNATSMessageProcessed(eventType)
	services.RecordEventProcessingDuration(eventType, duration)

	log.Printf("📈 WithdrawExecutedeventprocesscompleted")
}

// handleIntentManagerWithdrawExecutedEvent processIntentManager.WithdrawExecuted event
// This event indicates that payout (Stage 3) has completed
func handleIntentManagerWithdrawExecutedEvent(intentManagerWithdrawExecuted *clients.EventIntentManagerWithdrawExecutedResponse, subject string) {
	// 🎯 NATS Subject Parse SLIP-44 ChainID
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		log.Printf("❌ [NATS] Subject %s Parse chain ID: %v", subject, err)
		// ，Use event data chainID attempt Convert
		chainID = utils.EvmToSlip44(int(intentManagerWithdrawExecuted.ChainID))
		log.Printf("⚠️ [NATS] use，Convert chain ID: %d", chainID)
	} else {
		log.Printf("✅ [NATS] Subject success Parse chain ID: %s -> %d (SLIP-44)", subject, chainID)
	}

	// 🔧 event data ChainID Database storage
	originalChainID := intentManagerWithdrawExecuted.ChainID
	intentManagerWithdrawExecuted.ChainID = int64(chainID)

	log.Printf("🎉💸 [NATS] IntentManager.WithdrawExecuted event: WorkerType=%d, Success=%v, chain ID=%d (SLIP-44)",
		intentManagerWithdrawExecuted.EventData.WorkerType, intentManagerWithdrawExecuted.EventData.Success, chainID)
	log.Printf("   TransactionHash=%s, Message=%s", intentManagerWithdrawExecuted.TransactionHash, intentManagerWithdrawExecuted.EventData.Message)
	log.Printf("   🔧 ChainID: %d -> %d (SLIP-44)", originalChainID, intentManagerWithdrawExecuted.ChainID)

	// Process event - update WithdrawRequest payout status
	if eventProcessor != nil {
		if err := eventProcessor.ProcessIntentManagerWithdrawExecuted(intentManagerWithdrawExecuted); err != nil {
			log.Printf("❌ [NATS] IntentManager.WithdrawExecuted process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] IntentManager.WithdrawExecuted process success")
		}
	} else {
		log.Printf("⚠️ [NATS] EventProcessor not initialized, skipping IntentManager.WithdrawExecuted processing")
	}

	log.Printf("📈 IntentManager.WithdrawExecuted event process completed")
}

// handlePayoutExecutedEvent processes Treasury.PayoutExecuted event
func handlePayoutExecutedEvent(event *clients.EventPayoutExecutedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
		log.Printf("⚠️ [NATS] Use event data chain ID: %d", chainID)
	}

	log.Printf("🎉💰 [NATS] PayoutExecuted event: RequestId=%s, WorkerType=%d, chain ID=%d",
		event.EventData.RequestId, event.EventData.WorkerType, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessPayoutExecuted(event); err != nil {
			log.Printf("❌ [NATS] PayoutExecuted process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] PayoutExecuted process success")
		}
	}
}

// handlePayoutFailedEvent processes Treasury.PayoutFailed event
func handlePayoutFailedEvent(event *clients.EventPayoutFailedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("⚠️💰 [NATS] PayoutFailed event: RequestId=%s, WorkerType=%d, Error=%s, chain ID=%d",
		event.EventData.RequestId, event.EventData.WorkerType, event.EventData.ErrorReason, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessPayoutFailed(event); err != nil {
			log.Printf("❌ [NATS] PayoutFailed process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] PayoutFailed process success")
		}
	}
}

// handleHookExecutedEvent processes IntentManager.HookExecuted event
func handleHookExecutedEvent(event *clients.EventHookExecutedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("🎉🎣 [NATS] HookExecuted event: RequestId=%s, chain ID=%d",
		event.EventData.RequestId, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessHookExecuted(event); err != nil {
			log.Printf("❌ [NATS] HookExecuted process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] HookExecuted process success")
		}
	}
}

// handleHookFailedEvent processes IntentManager.HookFailed event
func handleHookFailedEvent(event *clients.EventHookFailedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("⚠️🎣 [NATS] HookFailed event: RequestId=%s, chain ID=%d",
		event.EventData.RequestId, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessHookFailed(event); err != nil {
			log.Printf("❌ [NATS] HookFailed process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] HookFailed process success")
		}
	}
}

// handleFallbackTransferredEvent processes IntentManager.FallbackTransferred event
func handleFallbackTransferredEvent(event *clients.EventFallbackTransferredResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("✅🔄 [NATS] FallbackTransferred event: RequestId=%s, chain ID=%d",
		event.EventData.RequestId, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessFallbackTransferred(event); err != nil {
			log.Printf("❌ [NATS] FallbackTransferred process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] FallbackTransferred process success")
		}
	}
}

// handleFallbackFailedEvent processes IntentManager.FallbackFailed event
func handleFallbackFailedEvent(event *clients.EventFallbackFailedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("⚠️🔄 [NATS] FallbackFailed event: RequestId=%s, Error=%s, chain ID=%d",
		event.EventData.RequestId, event.EventData.ErrorReason, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessFallbackFailed(event); err != nil {
			log.Printf("❌ [NATS] FallbackFailed process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] FallbackFailed process success")
		}
	}
}

// handlePayoutRetryRecordCreatedEvent processes Treasury.PayoutRetryRecordCreated event
func handlePayoutRetryRecordCreatedEvent(event *clients.EventPayoutRetryRecordCreatedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("📝🔄 [NATS] PayoutRetryRecordCreated event: RecordId=%s, RequestId=%s, chain ID=%d",
		event.EventData.RecordId, event.EventData.RequestId, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessPayoutRetryRecordCreated(event); err != nil {
			log.Printf("❌ [NATS] PayoutRetryRecordCreated process failed: %v", err)
		}
	}
}

// handleFallbackRetryRecordCreatedEvent processes Treasury.FallbackRetryRecordCreated event
func handleFallbackRetryRecordCreatedEvent(event *clients.EventFallbackRetryRecordCreatedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("📝🔄 [NATS] FallbackRetryRecordCreated event: RecordId=%s, RequestId=%s, chain ID=%d",
		event.EventData.RecordId, event.EventData.RequestId, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessFallbackRetryRecordCreated(event); err != nil {
			log.Printf("❌ [NATS] FallbackRetryRecordCreated process failed: %v", err)
		}
	}
}

// handleManuallyResolvedEvent processes ZKPayProxy.ManuallyResolved event
func handleManuallyResolvedEvent(event *clients.EventManuallyResolvedResponse, subject string) {
	chainID, err := utils.GetSlip44ChainIDFromSubject(subject)
	if err != nil {
		chainID = utils.EvmToSlip44(int(event.ChainID))
	}

	log.Printf("✅🔧 [NATS] ManuallyResolved event: RequestId=%s, Resolver=%s, Note=%s, chain ID=%d",
		event.EventData.RequestId, event.EventData.Resolver, event.EventData.Note, chainID)

	if eventProcessor != nil {
		if err := eventProcessor.ProcessManuallyResolved(event); err != nil {
			log.Printf("❌ [NATS] ManuallyResolved process failed: %v", err)
		} else {
			log.Printf("✅ [NATS] ManuallyResolved process success")
		}
	}
}

// GetNATSClient GetNATS client
func GetNATSClient() *clients.NATSClient {
	return natsClient
}

// PublishDepositEvent publishdepositevent
func PublishDepositEvent(deposit interface{}) error {
	if natsClient == nil {
		return fmt.Errorf("NATS client not initialized")
	}
	return natsClient.PublishDepositEvent(deposit)
}

// PublishQueueRootUpdateEvent publishqueue rootUpdateevent
func PublishQueueRootUpdateEvent(queueRoot interface{}) error {
	if natsClient == nil {
		return fmt.Errorf("NATS client not initialized")
	}
	// TODO: publishqueue rootevent
	return nil // returnSuccess
}

// PublishWithdrawalEvent publishwithdrawevent
func PublishWithdrawalEvent(withdrawal *clients.Withdrawal) error {
	if natsClient == nil {
		return fmt.Errorf("NATS client not initialized")
	}
	return natsClient.PublishWithdrawal(withdrawal)
}

// saveDepositToDatabase savedepositeventDatabase
func saveDepositToDatabase(deposit interface{}, owner, amount string, chainID int, depositID int64) error {
	// Checkwhetheralreadyexists ( chain_id + deposit_id )
	var existingCheckbook models.Checkbook
	result := db.DB.Where("chain_id = ? AND local_deposit_id = ?", chainID, depositID).First(&existingCheckbook)

	if result.Error == nil {
		// recordalreadyexists，Checkwhetherneedstatus
		log.Printf("📝 [NATS] Checkbookalreadyexists: ChainID=%d, DepositID=%d, currentstatus=%s",
			chainID, depositID, existingCheckbook.Status)

		// 🔄 whetherneedstatus
		needsStatusUpdate := false
		newStatus := existingCheckbook.Status
		statusReason := ""

		// whether（BSC，ChainID=714）DepositRecordedevent
		if chainID == 714 {
			// DepositRecordedeventready_for_commitment
			if shouldPromoteToReadyForCommitment(existingCheckbook.Status) {
				newStatus = models.CheckbookStatusReadyForCommitment
				needsStatusUpdate = true
				statusReason = "depositconfirm"
				log.Printf("🚀 [NATS] DepositRecorded - status: %s → %s",
					existingCheckbook.Status, newStatus)
			}
		} else {
			// DepositRecordedeventunsigned（ifcurrentstatus）
			if shouldPromoteToUnsigned(existingCheckbook.Status) {
				newStatus = models.CheckbookStatusUnsigned
				needsStatusUpdate = true
				statusReason = "depositconfirm"
				log.Printf("🔗 [NATS] DepositRecorded - status: %s → %s",
					existingCheckbook.Status, newStatus)
			}
		}

		// Updatestatusanddata（ifneed）
		if needsStatusUpdate {
			updates := map[string]interface{}{
				"status":     newStatus,
				"updated_at": time.Now(),
			}

			// ifDepositRecordedevent，neednewly added
			// TODO: DepositRecordedeventCheck
			if false {
				// updates["gross_amount"] = deposit.GetGrossAmount()
				// updates["allocatable_amount"] = deposit.GetAllocatableAmount()
				// updates["fee_total_locked"] = deposit.GetFeeTotalLocked()

				// ifdeposithash，Update
				// TODO: hashUpdate
				// TODO: hashUpdate
				// if false {
				//	updates["deposit_transaction_hash"] = depositTxHash
				// }

				// log.Printf("📊 [NATS] DepositRecordeddata: GrossAmount=%s, AllocatableAmount=%s, FeeLocked=%s",
				//	deposit.GetGrossAmount(), deposit.GetAllocatableAmount(), deposit.GetFeeTotalLocked())
			}

			// UsepushserviceUpdateDatabase
			dbWithPush := GetDatabaseWithPushService()
			if dbWithPush != nil {
				if err := dbWithPush.UpdateCheckbook(existingCheckbook.ID, updates, "DepositRecorded"); err != nil {
					return fmt.Errorf("Updatecheckbookstatusfailed: %w", err)
				}
				log.Printf("✅ [NATS] statusUpdatesuccessalreadypush: %s (%s)", newStatus, statusReason)
			} else {
				// ：UpdateDatabase
				if err := db.DB.Model(&existingCheckbook).Updates(updates).Error; err != nil {
					return fmt.Errorf("Updatecheckbookstatusfailed: %w", err)
				}
				log.Printf("✅ [NATS] statusUpdatesuccess: %s (%s)", newStatus, statusReason)
				log.Printf("⚠️ pushservicenotinitialize，push")
			}
		} else {
			// statusUpdate，eventprocessprocess
			log.Printf("ℹ️ [NATS] statusUpdate，: %s", existingCheckbook.Status)
		}

		return nil
	} else if result.Error != gorm.ErrRecordNotFound {
		// DatabasequeryError
		return fmt.Errorf("Databasequeryfailed: %w", result.Error)
	}

	// checkbook ID
	checkbookID := generateCheckbookID()

	// addressprocess - Convert
	normalizedOwner := strings.ToLower(owner)

	// Createcheckbookrecord
	// UniversalAddress
	userAddress := models.UniversalAddress{
		SLIP44ChainID: uint32(chainID),
		Data:          normalizedOwner,
	}
	withdrawRecipient := models.UniversalAddress{
		SLIP44ChainID: uint32(chainID),
		Data:          normalizedOwner,
	}

	checkbook := models.Checkbook{
		ID:                     checkbookID,
		UserAddress:            userAddress,
		Amount:                 amount,
		Status:                 models.CheckbookStatusUnsigned,
		DepositTransactionHash: "",
		SLIP44ChainID:          uint32(chainID),
		LocalDepositID:         uint64(depositID),
		TokenKey:               "USDT", // Default token key
		WithdrawRecipient:      withdrawRecipient,
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
	}

	// saveDatabase
	if err := db.DB.Create(&checkbook).Error; err != nil {
		return fmt.Errorf("Createcheckbookfailed: %w", err)
	}

	log.Printf("🎉 successCreatecheckbook: ID=%s, ChainID=%d, DepositID=%d",
		checkbookID, chainID, depositID)

	return nil
}

// generateCheckbookID checkbook ID
func generateCheckbookID() string {
	// UUID，canUUID
	return fmt.Sprintf("%X", time.Now().UnixNano())
}

// shouldPromoteToReadyForCommitment whetherready_for_commitmentstatus
func shouldPromoteToReadyForCommitment(currentStatus models.CheckbookStatus) bool {
	// status：pending → unsigned → ready_for_commitment
	// currentstatusready_for_commitment
	statusOrder := map[models.CheckbookStatus]int{
		models.CheckbookStatusPending:              10,
		models.CheckbookStatusUnsigned:             30,
		models.CheckbookStatusReadyForCommitment:   50,
		models.CheckbookStatusGeneratingProof:      70,
		models.CheckbookStatusSubmittingCommitment: 85,
		models.CheckbookStatusCommitmentPending:    95,
		models.CheckbookStatusWithCheckbook:        100,
		// status（note：，）
		// models.CheckbookStatusSignatured  ready_for_commitment
		// models.CheckbookStatusIssued  with_checkbook
	}

	currentOrder, exists := statusOrder[currentStatus]
	if !exists {
		return false // notstatus，
	}

	readyForCommitmentOrder := statusOrder[models.CheckbookStatusReadyForCommitment]
	return currentOrder < readyForCommitmentOrder
}

// saveQueueRootToDatabase savequeue rootUpdateeventDatabase
func saveQueueRootToDatabase(queueRoot interface{}, chainID int) error {
	// note：alreadyBlockchainEventProcessor
	// ，savealreadyeventprocesscompleted
	log.Printf("💾 [DB] savequeue rootrecord - chain ID=%d (alreadyBlockchainEventProcessorprocess)", chainID)
	return nil
}

// shouldPromoteToUnsigned whetherunsignedstatus
func shouldPromoteToUnsigned(currentStatus models.CheckbookStatus) bool {
	// pendingstatusunsigned
	return currentStatus == models.CheckbookStatusPending
}

// SetPushService SetWebSocketpushservice（main.go）
func SetPushService(svc *services.WebSocketPushService) {
	pushService = svc
	log.Printf("✅ NATSWebSocketpushservice")

	// Initializepushservice
	GetDatabaseWithPushService()
}

// GetPushService GetWebSocketpushservice
func GetPushService() *services.WebSocketPushService {
	return pushService
}

// GetDatabaseWithPushService GetpushDatabaseservice
func GetDatabaseWithPushService() *services.DatabaseWithPushService {
	databaseWithPushOnce.Do(func() {
		pushSvc := GetPushService()
		if pushSvc != nil {
			databaseWithPush = services.NewDatabaseWithPushService(db.DB, pushSvc)
			log.Printf("✅ NATSinitializepushDatabaseservice")
		}
	})
	return databaseWithPush
}

// GetEventProcessor Geteventprocess
func GetEventProcessor() *services.BlockchainEventProcessor {
	eventProcessorOnce.Do(func() {
		// pushservicealreadyInitialize
		pushSvc := GetPushService()
		dbWithPushSvc := GetDatabaseWithPushService()
		eventProcessor = services.NewBlockchainEventProcessor(db.DB, pushSvc, dbWithPushSvc)
		log.Printf("✅ NATSinitializeblockchaineventprocess（WebSocketpush）")
	})
	return eventProcessor
}

// updateCheckStatusOnWithdrawRequested processWithdrawRequestedevent
func updateCheckStatusOnWithdrawRequested(withdrawRequested *clients.EventWithdrawRequestedResponse) error {
	log.Printf("🔍 [WithdrawRequested] startcorresponding tocheck: RequestId=%s, Amount=%s, TokenId=%d",
		withdrawRequested.EventData.RequestId, withdrawRequested.EventData.Amount, withdrawRequested.EventData.TokenId)

	// ：user，WithdrawRequestedeventrequestIdwithdrawNullifier！
	// Use nullifier field to match check (request_id is DEPRECATED)
	// Try nullifier first, then fallback to request_id for backward compatibility
	var targetCheck models.Check
	requestId := withdrawRequested.EventData.RequestId

	// First try to match by nullifier (current field)
	err := db.DB.Where("nullifier = ?", requestId).First(&targetCheck).Error
	if err != nil && errors.Is(err, gorm.ErrRecordNotFound) {
		// Fallback to request_id (DEPRECATED) for backward compatibility
		log.Printf("🔍 [WithdrawRequested] Not found by nullifier, trying request_id (deprecated): %s", requestId)
		err = db.DB.Where("request_id = ?", requestId).First(&targetCheck).Error
	}

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("⚠️ [WithdrawRequested] notmatchcheck: RequestId(nullifier)=%s",
				requestId)
			log.Printf("   userWithdrawRequestedevent（fee）")
			return nil // Error，withdrawrequest
		}
		return fmt.Errorf("RequestIDquerycheckfailed: %w", err)
	}

	log.Printf("🎯 [WithdrawRequested] RequestIDmatchcheck: ID=%s, currentstatus=%s",
		targetCheck.ID, targetCheck.Status)
	log.Printf("   Verify: Amount=%s (event:%s)",
		targetCheck.Amount, withdrawRequested.EventData.Amount)

	// Verifyamountwhethermatch（Verify）
	log.Printf("🔍 [DEBUG] startVerifyamount: Check=%s, Event=%s", targetCheck.Amount, withdrawRequested.EventData.Amount)
	if targetCheck.Amount != withdrawRequested.EventData.Amount {
		log.Printf("❌ [WithdrawRequested] amountmatch: Check=%s, Event=%s",
			targetCheck.Amount, withdrawRequested.EventData.Amount)
		return fmt.Errorf("checkamountdifferent fromeventamountmatch")
	}
	log.Printf("✅ [DEBUG] amountVerify")

	// TokenID verification removed - now using TokenKey instead
	// TokenKey verification can be done via checkbook if needed

	// Verifycheckwhetheralreadycross_chain_processingstatus（process）
	log.Printf("🔍 [DEBUG] Checkcurrentstatus: %s", targetCheck.Status)
	if targetCheck.Status == "cross_chain_processing" {
		log.Printf("⚠️ [WithdrawRequested] Checkalreadyprocessstatus，process: ID=%s", targetCheck.ID)
		return nil
	}
	log.Printf("✅ [DEBUG] statusCheck，Update")

	// UsepushserviceUpdatecheckstatuspending
	log.Printf("🔍 [DEBUG] startDatabaseUpdate...")
	dbWithPush := GetDatabaseWithPushService()
	if dbWithPush != nil {
		if err := dbWithPush.UpdateCheckStatus(targetCheck.ID, models.AllocationStatusPending, "WithdrawRequested"); err != nil {
			log.Printf("❌ [DEBUG] pushUpdatefailed: %v", err)
			return fmt.Errorf("Updatecheckstatusfailed: %w", err)
		}
		log.Printf("✅ [DEBUG] DatabaseUpdatecompletedalreadypush")
	} else {
		// ：UpdateDatabase
		if err := db.DB.Model(&targetCheck).Updates(map[string]interface{}{
			"Status":    models.AllocationStatusPending,
			"UpdatedAt": time.Now(),
		}).Error; err != nil {
			log.Printf("❌ [DEBUG] DatabaseUpdatefailed: %v", err)
			return fmt.Errorf("Updatecheckstatusfailed: %w", err)
		}
		log.Printf("✅ [DEBUG] DatabaseUpdatecompleted")
		log.Printf("⚠️ pushservicenotinitialize，push")

		// Fallback: Push Checkbook update manually if pushService is not available through dbWithPush
		pushSvc := GetPushService()
		if pushSvc != nil && targetCheck.CheckbookID != "" {
			var checkbook models.Checkbook
			if err := db.DB.First(&checkbook, "id = ?", targetCheck.CheckbookID).Error; err == nil {
				pushSvc.PushCheckbookStatusUpdateDirect(&checkbook, string(checkbook.Status), "WithdrawRequested")
				log.Printf("✅ [WithdrawRequested] Pushed Checkbook update: ID=%s, Status=%s", checkbook.ID, checkbook.Status)
			}
		}
	}

	log.Printf("✅ [WithdrawRequested] CheckstatusUpdatesuccess: ID=%s, RequestId=%s, status=cross_chain_processing",
		targetCheck.ID, withdrawRequested.EventData.RequestId)

	return nil
}

// updateCheckStatusOnWithdrawExecuted processWithdrawExecutedevent
func updateCheckStatusOnWithdrawExecuted(withdrawExecuted *clients.EventWithdrawExecutedResponse) error {
	log.Printf("🔍 [WithdrawExecuted] startcorresponding tocheck: RequestId=%s",
		withdrawExecuted.EventData.RequestId)

	requestId := withdrawExecuted.EventData.RequestId

	// Correct approach: Find WithdrawRequest first, then find associated Checks
	// Step 1: Find WithdrawRequest by withdraw_nullifier or request_id (DEPRECATED)
	var withdrawRequest models.WithdrawRequest
	// 优先通过 withdraw_nullifier 查询
	err := db.DB.Where("withdraw_nullifier = ?", requestId).First(&withdrawRequest).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Fallback: 尝试通过 request_id (DEPRECATED) 查询
			log.Printf("🔍 [WithdrawExecuted] WithdrawRequest not found by withdraw_nullifier, trying request_id (DEPRECATED): RequestId=%s", requestId)
			err = db.DB.Where("request_id = ?", requestId).First(&withdrawRequest).Error
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					log.Printf("⚠️ [WithdrawExecuted] WithdrawRequest not found by withdraw_nullifier or request_id: RequestId=%s", requestId)

					// Debug: Check if there are any WithdrawRequests with similar nullifiers
					var similarRequests []models.WithdrawRequest
					db.DB.Where("withdraw_nullifier LIKE ?", requestId[:10]+"%").Find(&similarRequests)
					if len(similarRequests) > 0 {
						log.Printf("🔍 [DEBUG] Found %d WithdrawRequests with similar nullifiers (first 10 chars match)", len(similarRequests))
						for i, req := range similarRequests {
							if i < 3 { // Only log first 3
								log.Printf("   Similar nullifier: %s (ID=%s)", req.WithdrawNullifier, req.ID)
							}
						}
					}

					// Fallback 1: Try to find Check by nullifier field (commitment nullifier)
					// Note: In the Intent system, the RequestId might be the first Check's nullifier
					log.Printf("🔍 [WithdrawExecuted] Trying to find Check by nullifier field: %s", requestId)
					var checksByNullifier []models.Check
					err = db.DB.Where("nullifier = ?", requestId).Find(&checksByNullifier).Error
					if err == nil && len(checksByNullifier) > 0 {
						log.Printf("✅ [WithdrawExecuted] Found %d Checks by nullifier field", len(checksByNullifier))
						// Update all found checks
						return updateMultipleChecksStatus(checksByNullifier, "WithdrawExecuted")
					}

					// Fallback 2: Try to find Check by deprecated request_id field (for backward compatibility)
					log.Printf("🔍 [WithdrawExecuted] Trying to find Check by deprecated request_id field: %s", requestId)
					var checksByRequestID []models.Check
					err = db.DB.Where("request_id = ?", requestId).Find(&checksByRequestID).Error
					if err == nil && len(checksByRequestID) > 0 {
						log.Printf("✅ [WithdrawExecuted] Found %d Checks by request_id field", len(checksByRequestID))
						// Update all found checks
						return updateMultipleChecksStatus(checksByRequestID, "WithdrawExecuted")
					}

					log.Printf("⚠️ [WithdrawExecuted] Check not found by any method: RequestId=%s", requestId)
					log.Printf("   This may be a user-initiated withdraw or fee that doesn't have a WithdrawRequest record")
					return nil // Not an error, may be user-initiated withdraw or fee
				}
				return fmt.Errorf("query WithdrawRequest by request_id failed: %w", err)
			}
			// Found by request_id, continue below
		} else {
			return fmt.Errorf("query WithdrawRequest failed: %w", err)
		}
	}

	log.Printf("✅ [WithdrawExecuted] Found WithdrawRequest: ID=%s", withdrawRequest.ID)

	// Step 2: Find all Checks associated with this WithdrawRequest
	var checks []models.Check
	err = db.DB.Where("withdraw_request_id = ?", withdrawRequest.ID).Find(&checks).Error
	if err != nil {
		return fmt.Errorf("querychecksfailed: %w", err)
	}

	if len(checks) == 0 {
		log.Printf("⚠️ [WithdrawExecuted] No Checks found for WithdrawRequest ID=%s, trying deprecated request_id field", withdrawRequest.ID)
		// Fallback: Try to find by deprecated request_id field
		err = db.DB.Where("request_id = ?", requestId).Find(&checks).Error
		if err != nil {
			return fmt.Errorf("querychecksfailed: %w", err)
		}
		if len(checks) == 0 {
			log.Printf("⚠️ [WithdrawExecuted] No Checks found by request_id either: RequestId=%s", requestId)
			return nil // Not an error, may be user-initiated withdraw or fee
		}
	}

	log.Printf("🎯 [WithdrawExecuted] Found %d checks to update", len(checks))

	// Step 3: Update all associated Checks to 'used' status
	dbWithPush := GetDatabaseWithPushService()
	updatedCount := 0
	checkbookIDs := make(map[string]bool) // Track unique checkbook IDs

	for i := range checks {
		check := &checks[i]
		if err := updateSingleCheckStatusWithPush(dbWithPush, check, "WithdrawExecuted"); err != nil {
			log.Printf("❌ [WithdrawExecuted] Failed to update Check ID=%s: %v", check.ID, err)
			continue
		}
		updatedCount++

		// Track checkbook ID for push notification
		if check.CheckbookID != "" {
			checkbookIDs[check.CheckbookID] = true
		}
	}

	// Step 4: Push Checkbook status updates to frontend
	// Even if Checkbook status doesn't change, we need to notify frontend that Checks under it have changed
	pushSvc := GetPushService()
	if pushSvc != nil && len(checkbookIDs) > 0 {
		log.Printf("📡 [WithdrawExecuted] Pushing Checkbook status updates for %d checkbook(s)", len(checkbookIDs))
		for checkbookID := range checkbookIDs {
			// Query checkbook to get current status
			var checkbook models.Checkbook
			if err := db.DB.First(&checkbook, "id = ?", checkbookID).Error; err != nil {
				log.Printf("⚠️ [WithdrawExecuted] Failed to query Checkbook ID=%s: %v", checkbookID, err)
				continue
			}

			// Push checkbook update (status may not change, but Checks under it have changed)
			pushSvc.PushCheckbookStatusUpdateDirect(&checkbook, string(checkbook.Status), "WithdrawExecuted")
			log.Printf("✅ [WithdrawExecuted] Pushed Checkbook update: ID=%s, Status=%s", checkbookID, checkbook.Status)
		}
	}

	log.Printf("✅ [WithdrawExecuted] Updated %d/%d checks to 'used' status, pushed %d checkbook(s): RequestId=%s",
		updatedCount, len(checks), len(checkbookIDs), requestId)

	return nil
}

// updateMultipleChecksStatus updates multiple Checks status to 'used'
func updateMultipleChecksStatus(checks []models.Check, context string) error {
	log.Printf("🎯 [WithdrawExecuted] Updating %d checks to 'used' status", len(checks))

	dbWithPush := GetDatabaseWithPushService()
	updatedCount := 0
	checkbookIDs := make(map[string]bool) // Track unique checkbook IDs

	for i := range checks {
		check := &checks[i]
		if err := updateSingleCheckStatusWithPush(dbWithPush, check, context); err != nil {
			log.Printf("❌ [WithdrawExecuted] Failed to update Check ID=%s: %v", check.ID, err)
			continue
		}
		updatedCount++

		// Track checkbook ID for push notification
		if check.CheckbookID != "" {
			checkbookIDs[check.CheckbookID] = true
		}
	}

	// Push Checkbook status updates to frontend
	pushSvc := GetPushService()
	if pushSvc != nil && len(checkbookIDs) > 0 {
		log.Printf("📡 [WithdrawExecuted] Pushing Checkbook status updates for %d checkbook(s)", len(checkbookIDs))
		for checkbookID := range checkbookIDs {
			// Query checkbook to get current status
			var checkbook models.Checkbook
			if err := db.DB.First(&checkbook, "id = ?", checkbookID).Error; err != nil {
				log.Printf("⚠️ [WithdrawExecuted] Failed to query Checkbook ID=%s: %v", checkbookID, err)
				continue
			}

			// Push checkbook update (status may not change, but Checks under it have changed)
			pushSvc.PushCheckbookStatusUpdateDirect(&checkbook, string(checkbook.Status), context)
			log.Printf("✅ [WithdrawExecuted] Pushed Checkbook update: ID=%s, Status=%s", checkbookID, checkbook.Status)
		}
	}

	log.Printf("✅ [WithdrawExecuted] Updated %d/%d checks to 'used' status, pushed %d checkbook(s)",
		updatedCount, len(checks), len(checkbookIDs))
	return nil
}

// updateSingleCheckStatus updates a single Check status to 'used'
func updateSingleCheckStatus(check *models.Check, context string) error {
	dbWithPush := GetDatabaseWithPushService()
	return updateSingleCheckStatusWithPush(dbWithPush, check, context)
}

// updateSingleCheckStatusWithPush updates a single Check status to 'used' with push service support
func updateSingleCheckStatusWithPush(dbWithPush *services.DatabaseWithPushService, check *models.Check, context string) error {
	log.Printf("🔍 [DEBUG] Updating Check ID=%s to 'used' status...", check.ID)

	if dbWithPush != nil {
		// Use push service if available
		if err := dbWithPush.UpdateCheckStatus(check.ID, models.AllocationStatusUsed, context); err != nil {
			log.Printf("❌ [DEBUG] pushUpdatefailed: %v", err)
			return fmt.Errorf("Updatecheckstatusfailed: %w", err)
		}
		log.Printf("✅ [DEBUG] statusUpdateusedcompletedalreadypush: Check ID=%s", check.ID)
		return nil
	}

	// Fallback: Direct database update
	if err := db.DB.Model(check).Updates(map[string]interface{}{
		"Status":    models.AllocationStatusUsed,
		"UpdatedAt": time.Now(),
	}).Error; err != nil {
		log.Printf("❌ [DEBUG] DatabaseUpdatefailed: %v", err)
		return fmt.Errorf("Updatecheckstatusfailed: %w", err)
	}
	log.Printf("✅ [DEBUG] statusUpdatecompletedcompleted: Check ID=%s", check.ID)
	log.Printf("⚠️ pushservicenotinitialize，push")
	return nil
}
