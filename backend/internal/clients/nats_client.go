package clients

import (
	"encoding/json"
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/metrics"
	"go-backend/internal/utils"
	"log"
	"strconv"
	"time"

	"github.com/nats-io/nats.go"
)

// NATSClient NATS client
type NATSClient struct {
	conn         *nats.Conn
	js           nats.JetStreamContext
	subjects     map[string]string
	streamName   string
	consumerName string
}

// NewNATSClient CreateNATS client
func NewNATSClient(url, streamName, consumerName string, subjects map[string]string) (*NATSClient, error) {
	// 获取配置的超时时间（如果配置了）
	var connectTimeout time.Duration = 10 * time.Second // 默认 10 秒
	if config.AppConfig != nil && config.AppConfig.NATS.Timeout > 0 {
		connectTimeout = time.Duration(config.AppConfig.NATS.Timeout) * time.Second
		log.Printf("🔌 Using configured NATS timeout: %v", connectTimeout)
	} else {
		log.Printf("🔌 Using default NATS timeout: %v", connectTimeout)
	}

	// connect to NATS server
	conn, err := nats.Connect(url,
		nats.Timeout(connectTimeout), // 使用配置的超时时间
		nats.ReconnectWait(5*time.Second),
		nats.MaxReconnects(-1),
		nats.DisconnectErrHandler(func(nc *nats.Conn, err error) {
			log.Printf("NATSconnection: %v", err)
			// 更新 metrics
			metrics.NATSConnectionStatus.Set(0)
		}),
		nats.ReconnectHandler(func(nc *nats.Conn) {
			log.Printf("NATSconnectionsuccess")
			// 更新 metrics
			metrics.NATSConnectionStatus.Set(1)
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("connectionNATSfailed: %w", err)
	}

	// CreateJetStream
	js, err := conn.JetStream()
	if err != nil {
		return nil, fmt.Errorf("CreateJetStreamfailed: %w", err)
	}

	client := &NATSClient{
		conn:         conn,
		js:           js,
		subjects:     subjects,
		streamName:   streamName,
		consumerName: consumerName,
	}

	//  JetStream Create，Use NATS
	log.Printf("✅ use NATS Subscription， JetStream Create")

	return client, nil
}

// ensureStream JetStreamexists
func (c *NATSClient) ensureStream() error {
	// Checkwhetherexists
	_, err := c.js.StreamInfo(c.streamName)
	if err == nil {
		log.Printf(" %s alreadyexists", c.streamName)
		return nil
	}

	// Create
	streamConfig := &nats.StreamConfig{
		Name: c.streamName,
		Subjects: []string{
			// V1 contract names
			"zkpay.*.Treasury.DepositReceived",
			"zkpay.bsc.ZKPayProxy.*",
			"zkpay.*.Treasury.WithdrawExecuted",
			// V2 contract names (Enclave V2)
			"zkpay.*.EnclaveTreasury.*",
			"zkpay.*.EnclavePay.*",
			"zkpay.*.IntentManager.*",
			// Match all events (fallback)
			"zkpay.*.*.*",
		},
		Retention: nats.LimitsPolicy,
		MaxAge:    24 * time.Hour, // 24hours
		Storage:   nats.FileStorage,
	}

	_, err = c.js.AddStream(streamConfig)
	if err != nil {
		return fmt.Errorf("Createfailed: %w", err)
	}

	log.Printf(" %s Createsuccess", c.streamName)
	return nil
}

// SubscribeToDepositReceived Subscriptiondepositevent
// Supports both V1 (Treasury) and V2 (EnclaveTreasury) contract names
func (c *NATSClient) SubscribeToDepositReceived(handler func(*EventDepositReceivedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.*.Treasury.DepositReceived",        // V1
		"zkpay.*.EnclaveTreasury.DepositReceived", // V2
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] DepositReceivedevent! Subject=%s, data=%d", msg.Subject, len(msg.Data))
		log.Printf("🔍 [NATS] Message: %s", string(msg.Data))

		// : attemptScanner（parseGenericEventreturnmap）
		var scannerEvent ScannerEventNotification
		if err := json.Unmarshal(msg.Data, &scannerEvent); err == nil && scannerEvent.EventName != "" {
			log.Printf("🔄 [NATS] Scanner，Convert")

			// NATS subjectParseSLIP-44 chain ID
			slip44ChainID, err := utils.GetSlip44ChainIDFromSubject(msg.Subject)
			if err != nil {
				log.Printf("❌ [NATS] SubjectParsechain ID: %v, subject: %s", err, msg.Subject)
				return
			}
			log.Printf("🔗 [NATS] subjectParseSLIP-44chain ID: %d", slip44ChainID)

			if converted, convErr := ConvertScannerEventToDepositReceived(&scannerEvent, int64(slip44ChainID)); convErr == nil {
				log.Printf("✅ [NATS] ScannerConvertsuccess: LocalDepositId=%d, Depositor=%s, ChainID=%d",
					converted.EventData.LocalDepositId, converted.EventData.Depositor, converted.ChainID)
				handler(converted, msg.Subject)
				msg.Ack()
				log.Printf("✅ [NATS] DepositReceivedMessageprocesscompleted")
				return
			} else {
				log.Printf("❌ [NATS] ScannerConvertfailed: %v", convErr)
			}
		}

		// : attemptConfigurableEventProcessor
		var notification ConfigurableEventNotification
		if err := json.Unmarshal(msg.Data, &notification); err == nil && notification.Chain != "" {
			log.Printf("🔄 [NATS] ConfigurableEventProcessor，Convert")
			if converted, convErr := ConvertConfigurableEventToDepositReceived(&notification); convErr == nil {
				log.Printf("✅ [NATS] ConfigurableEventConvertsuccess: LocalDepositId=%d, Depositor=%s",
					converted.EventData.LocalDepositId, converted.EventData.Depositor)
				handler(converted, msg.Subject)
				msg.Ack()
				log.Printf("✅ [NATS] DepositReceivedMessageprocesscompleted")
				return
			} else {
				log.Printf("❌ [NATS] ConfigurableEventConvertfailed: %v", convErr)
			}
		}

		// :
		var depositReceived EventDepositReceivedResponse
		if err := json.Unmarshal(msg.Data, &depositReceived); err != nil {
			log.Printf("❌ ParseDepositReceivedeventfailed（attempt）: %v", err)
			return
		}

		log.Printf("✅ [NATS] DepositReceivedeventParsesuccess（）: LocalDepositId=%d, Depositor=%s",
			depositReceived.EventData.LocalDepositId, depositReceived.EventData.Depositor)
		handler(&depositReceived, msg.Subject)
		msg.Ack()
		log.Printf("✅ [NATS] DepositReceivedMessageprocesscompleted")
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToDepositRecorded Subscriptiondepositrecordevent
// Supports both V1 (ZKPayProxy) and V2 (EnclavePay) contract names
func (c *NATSClient) SubscribeToDepositRecorded(handler func(*EventDepositRecordedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.bsc.ZKPayProxy.DepositRecorded",  // V1
		"zkpay.bsc.EnclavePay.DepositRecorded",  // V2
		"zkpay.*.ZKPayProxy.DepositRecorded",    // V1 (all chains)
		"zkpay.*.EnclavePay.DepositRecorded",   // V2 (all chains)
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] DepositRecordedevent! Subject=%s, data=%d", msg.Subject, len(msg.Data))
		log.Printf("🔍 [NATS] Message: %s", string(msg.Data))

		// : attemptScanner（parseGenericEventreturnmap）
		var scannerEvent ScannerEventNotification
		if err := json.Unmarshal(msg.Data, &scannerEvent); err == nil && scannerEvent.EventName != "" {
			log.Printf("🔄 [NATS] Scanner，Convert")

			// DepositRecordedeventUseeventdataChainID，UseSubject
			var slip44ChainID int64
			// First, try to parse ChainID from event data (owner.chainId)
			if owner, hasOwner := scannerEvent.EventData["owner"].(map[string]interface{}); hasOwner {
				// attemptParseChainID
				if chainIdStr, hasChainId := owner["chainId"].(string); hasChainId {
					if chainIdInt, err := strconv.Atoi(chainIdStr); err == nil {
						// Use SmartToSlip44 to handle both EVM Chain ID and SLIP-44 ChainID
						slip44ChainID = int64(utils.SmartToSlip44(chainIdInt))
						log.Printf("📋 [NATS] DepositRecordeduseeventdataChainID: %s -> %d (SLIP-44)", chainIdStr, slip44ChainID)
					}
				} else if chainIdFloat, hasChainId := owner["chainId"].(float64); hasChainId {
					// ChainID - Use SmartToSlip44 to handle both EVM Chain ID and SLIP-44 ChainID
					slip44ChainID = int64(utils.SmartToSlip44(int(chainIdFloat)))
					log.Printf("📋 [NATS] DepositRecordeduseeventdataChainID: %.0f -> %d (SLIP-44)", chainIdFloat, slip44ChainID)
				}
			}

			// If failed to parse from event data, try to parse from NATS subject (fallback)
			if slip44ChainID == 0 {
				log.Printf("⚠️ [NATS] eventdataParseChainIDfailed, attempting to parse from subject...")
				if subjectChainID, err := utils.GetSlip44ChainIDFromSubject(msg.Subject); err == nil {
					slip44ChainID = int64(subjectChainID)
					log.Printf("✅ [NATS] SubjectParseSLIP-44chainID: %s -> %d", msg.Subject, slip44ChainID)
				} else {
					log.Printf("❌ [NATS] Both eventdata and subjectParseChainIDfailed: %v", err)
					return
				}
			}

			if converted, convErr := ConvertScannerEventToDepositRecorded(&scannerEvent, int64(slip44ChainID)); convErr == nil {
				log.Printf("✅ [NATS] ScannerConvertsuccess: LocalDepositId=%d, GrossAmount=%s, ChainID=%d",
					converted.EventData.LocalDepositId, converted.EventData.GrossAmount, converted.ChainID)
				log.Printf("🔍 [NATS] Converted data - AllocatableAmount=%s, FeeTotalLocked=%s",
					converted.EventData.AllocatableAmount, converted.EventData.FeeTotalLocked)
				log.Printf("🔄 [NATS] Calling handler function...")
				// Use defer recover to catch any panics
				func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("❌ [NATS] Handler function panicked: %v", r)
						}
					}()
					handler(converted, msg.Subject)
				}()
				log.Printf("✅ [NATS] Handler function returned")
				msg.Ack()
				log.Printf("✅ [NATS] DepositRecordedMessageprocesscompleted")
				return
			} else {
				log.Printf("❌ [NATS] ScannerConvertfailed: %v", convErr)
			}
		}

		// : attemptConfigurableEventProcessor
		var notification ConfigurableEventNotification
		if err := json.Unmarshal(msg.Data, &notification); err == nil && notification.Chain != "" {
			log.Printf("🔄 [NATS] ConfigurableEventProcessor，Convert")
			if converted, convErr := ConvertConfigurableEventToDepositRecorded(&notification); convErr == nil {
				log.Printf("✅ [NATS] ConfigurableEventConvertsuccess: LocalDepositId=%d, GrossAmount=%s",
					converted.EventData.LocalDepositId, converted.EventData.GrossAmount)
				handler(converted, msg.Subject)
				msg.Ack()
				log.Printf("✅ [NATS] DepositRecordedMessageprocesscompleted")
				return
			} else {
				log.Printf("❌ [NATS] ConfigurableEventConvertfailed: %v", convErr)
			}
		}

		// :
		var depositRecorded EventDepositRecordedResponse
		if err := json.Unmarshal(msg.Data, &depositRecorded); err != nil {
			log.Printf("❌ ParseDepositRecordedeventfailed（attempt）: %v", err)
			return
		}

		log.Printf("✅ [NATS] DepositRecordedeventParsesuccess（）: LocalDepositId=%d, GrossAmount=%s",
			depositRecorded.EventData.LocalDepositId, depositRecorded.EventData.GrossAmount)
		handler(&depositRecorded, msg.Subject)
		msg.Ack()
		log.Printf("✅ [NATS] DepositRecordedMessageprocesscompleted")
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToDepositUsed SubscriptiondepositUseevent
// Supports both V1 (ZKPayProxy) and V2 (EnclavePay) contract names
func (c *NATSClient) SubscribeToDepositUsed(handler func(*EventDepositUsedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.bsc.ZKPayProxy.DepositUsed",  // V1
		"zkpay.bsc.EnclavePay.DepositUsed",  // V2
		"zkpay.*.ZKPayProxy.DepositUsed",    // V1 (all chains)
		"zkpay.*.EnclavePay.DepositUsed",    // V2 (all chains)
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] DepositUsedevent! Subject=%s, data=%d", msg.Subject, len(msg.Data))
		log.Printf("🔍 [NATS] Message: %s", string(msg.Data))

		// : attemptScanner（parseGenericEventreturnmap）
		var scannerEvent ScannerEventNotification
		if err := json.Unmarshal(msg.Data, &scannerEvent); err == nil && scannerEvent.EventName != "" {
			log.Printf("🔄 [NATS] Scanner，Convert")

			// DepositUsedeventUseeventdataChainID，UseSubject
			var slip44ChainID int
			// attemptParseChainID
			if chainIdStr, hasChainId := scannerEvent.EventData["chainId"].(string); hasChainId {
				if chainIdInt, err := strconv.Atoi(chainIdStr); err == nil {
					// Use SmartToSlip44 to handle both EVM Chain ID and SLIP-44 ChainID
					slip44ChainID = utils.SmartToSlip44(chainIdInt)
					log.Printf("🔗 [NATS] DepositUseduseeventdataChainID: %s -> %d (SLIP-44)", chainIdStr, slip44ChainID)
				}
			} else if chainIdFloat, hasChainId := scannerEvent.EventData["chainId"].(float64); hasChainId {
				// ChainID - Use SmartToSlip44 to handle both EVM Chain ID and SLIP-44 ChainID
				slip44ChainID = utils.SmartToSlip44(int(chainIdFloat))
				log.Printf("🔗 [NATS] DepositUseduseeventdataChainID: %.0f -> %d (SLIP-44)", chainIdFloat, slip44ChainID)
			}

			// If failed to parse from event data, try to parse from NATS subject (fallback)
			if slip44ChainID == 0 {
				log.Printf("⚠️ [NATS] eventdataParseChainIDfailed, attempting to parse from subject...")
				if subjectChainID, err := utils.GetSlip44ChainIDFromSubject(msg.Subject); err == nil {
					slip44ChainID = subjectChainID
					log.Printf("✅ [NATS] SubjectParseSLIP-44chainID: %s -> %d", msg.Subject, slip44ChainID)
				} else {
					log.Printf("❌ [NATS] Both eventdata and subjectParseChainIDfailed: %v", err)
				return
				}
			}

			if converted, convErr := ConvertScannerEventToDepositUsed(&scannerEvent, int64(slip44ChainID)); convErr == nil {
				log.Printf("✅ [NATS] ScannerConvertsuccess: LocalDepositId=%d, Commitment=%s, ChainID=%d",
					converted.EventData.LocalDepositId, converted.EventData.Commitment, converted.ChainID)
				handler(converted, msg.Subject)
				msg.Ack()
				log.Printf("✅ [NATS] DepositUsedMessageprocesscompleted")
				return
			} else {
				log.Printf("❌ [NATS] ScannerConvertfailed: %v", convErr)
			}
		}

		// : attemptConfigurableEventProcessor
		var notification ConfigurableEventNotification
		if err := json.Unmarshal(msg.Data, &notification); err == nil && notification.Chain != "" {
			log.Printf("🔄 [NATS] ConfigurableEventProcessor，Convert")
			if converted, convErr := ConvertConfigurableEventToDepositUsed(&notification); convErr == nil {
				log.Printf("✅ [NATS] ConfigurableEventConvertsuccess: LocalDepositId=%d, Commitment=%s",
					converted.EventData.LocalDepositId, converted.EventData.Commitment)
				handler(converted, msg.Subject)
				msg.Ack()
				log.Printf("✅ [NATS] DepositUsedMessageprocesscompleted")
				return
			} else {
				log.Printf("❌ [NATS] ConfigurableEventConvertfailed: %v", convErr)
			}
		}

		var depositUsed EventDepositUsedResponse
		if err := json.Unmarshal(msg.Data, &depositUsed); err != nil {
			log.Printf("❌ ParseDepositUsedeventfailed（attempt）: %v", err)
			return
		}

		log.Printf("✅ [NATS] DepositUsedeventParsesuccess（）: LocalDepositId=%d, Commitment=%s",
			depositUsed.EventData.LocalDepositId, depositUsed.EventData.Commitment)
		handler(&depositUsed, msg.Subject)
		msg.Ack()
		log.Printf("✅ [NATS] DepositUsedMessageprocesscompleted")
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToDeposits Subscriptiondepositevent (already，Use)
func (c *NATSClient) SubscribeToDeposits(handler func(interface{}, string), config interface{}) error {
	// ，UseSubscription
	log.Printf("⚠️ [NATS] SubscribeToDepositsalready，useSubscribeToDepositReceived, SubscribeToDepositRecorded, SubscribeToDepositUsed")
	return nil
}

// SubscribeToCommitmentRootUpdates SubscriptionCommitmentRootUpdatedevent
// Supports both V1 (ZKPayProxy) and V2 (EnclavePay) contract names
func (c *NATSClient) SubscribeToCommitmentRootUpdates(handler func(*EventCommitmentRootUpdatedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.bsc.ZKPayProxy.CommitmentRootUpdated",  // V1
		"zkpay.bsc.EnclavePay.CommitmentRootUpdated",  // V2
		"zkpay.*.ZKPayProxy.CommitmentRootUpdated",    // V1 (all chains)
		"zkpay.*.EnclavePay.CommitmentRootUpdated",     // V2 (all chains)
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] CommitmentRootUpdatedevent! Subject=%s, data=%d", msg.Subject, len(msg.Data))
		log.Printf("🔍 [NATS] Message: %s", string(msg.Data))

		// : attemptScanner（parseGenericEventreturnmap）
		var scannerEvent ScannerEventNotification
		if err := json.Unmarshal(msg.Data, &scannerEvent); err == nil && scannerEvent.EventName != "" {
			log.Printf("🔄 [NATS] Scanner，Convert")

			// CommitmentRootUpdatedeventneedChainID（Commitment）
			// UseDefaultChainID（BSC）
			slip44ChainID := 714 // BSC
			log.Printf("🌳 [NATS] CommitmentRootUpdateduseChainID: %d (BSC)", slip44ChainID)

			if converted, convErr := ConvertScannerEventToCommitmentRootUpdated(&scannerEvent, int64(slip44ChainID)); convErr == nil {
				log.Printf("✅ [NATS] ScannerConvertsuccess: OldRoot=%s, Commitment=%s, NewRoot=%s, ChainID=%d",
					converted.EventData.OldRoot, converted.EventData.Commitment, converted.EventData.NewRoot, converted.ChainID)
				handler(converted, msg.Subject)
				msg.Ack()
				log.Printf("✅ [NATS] CommitmentRootUpdatedMessageprocesscompleted")
				return
			} else {
				log.Printf("❌ [NATS] ScannerConvertfailed: %v", convErr)
			}
		}

		// : attemptParse（）
		var commitmentRootEvent EventCommitmentRootUpdatedResponse
		if err := json.Unmarshal(msg.Data, &commitmentRootEvent); err != nil {
			log.Printf("❌ ParseCommitmentRootUpdatedeventfailed: %v", err)
			return
		}

		log.Printf("✅ [NATS] CommitmentRootUpdatedeventParsesuccess: OldRoot=%s, Commitment=%s, NewRoot=%s",
			commitmentRootEvent.EventData.OldRoot, commitmentRootEvent.EventData.Commitment, commitmentRootEvent.EventData.NewRoot)
		handler(&commitmentRootEvent, msg.Subject)
		msg.Ack()
		log.Printf("✅ [NATS] CommitmentRootUpdatedMessageprocesscompleted")
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToWithdrawRequested Subscriptionwithdrawrequestevent
// Supports both V1 (ZKPayProxy) and V2 (EnclavePay) contract names
func (c *NATSClient) SubscribeToWithdrawRequested(handler func(*EventWithdrawRequestedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.bsc.ZKPayProxy.WithdrawRequested",  // V1
		"zkpay.bsc.EnclavePay.WithdrawRequested",  // V2
		"zkpay.*.ZKPayProxy.WithdrawRequested",    // V1 (all chains)
		"zkpay.*.EnclavePay.WithdrawRequested",    // V2 (all chains)
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] WithdrawRequestedevent! Subject=%s, data=%d", msg.Subject, len(msg.Data))
		log.Printf("🔍 [NATS] Message: %s", string(msg.Data))

		var withdrawRequested EventWithdrawRequestedResponse
		if err := json.Unmarshal(msg.Data, &withdrawRequested); err != nil {
			log.Printf("❌ ParseWithdrawRequestedeventfailed: %v", err)
			return
		}

		log.Printf("✅ [NATS] WithdrawRequestedeventParsesuccess: RequestId=%s, Amount=%s",
			withdrawRequested.EventData.RequestId, withdrawRequested.EventData.Amount)
		handler(&withdrawRequested, msg.Subject)
		msg.Ack()
		log.Printf("✅ [NATS] WithdrawRequestedMessageprocesscompleted")
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToWithdrawExecuted Subscriptionwithdrawevent
// Supports both V1 (Treasury) and V2 (EnclaveTreasury) contract names
func (c *NATSClient) SubscribeToWithdrawExecuted(handler func(*EventWithdrawExecutedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.*.Treasury.WithdrawExecuted",        // V1
		"zkpay.*.EnclaveTreasury.WithdrawExecuted", // V2
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] WithdrawExecutedevent! Subject=%s, data=%d", msg.Subject, len(msg.Data))
		log.Printf("🔍 [NATS] Message: %s", string(msg.Data))

		var withdrawExecuted EventWithdrawExecutedResponse
		if err := json.Unmarshal(msg.Data, &withdrawExecuted); err != nil {
			log.Printf("❌ ParseWithdrawExecutedeventfailed: %v", err)
			return
		}

		log.Printf("✅ [NATS] WithdrawExecutedeventParsesuccess: RequestId=%s, Amount=%s",
			withdrawExecuted.EventData.RequestId, withdrawExecuted.EventData.Amount)
		handler(&withdrawExecuted, msg.Subject)
		msg.Ack()
		log.Printf("✅ [NATS] WithdrawExecutedMessageprocesscompleted")
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToIntentManagerWithdrawExecuted SubscriptionIntentManager.WithdrawExecuted event
// This event indicates that payout (Stage 3) has completed successfully
func (c *NATSClient) SubscribeToIntentManagerWithdrawExecuted(handler func(*EventIntentManagerWithdrawExecutedResponse, string)) error {
	subject := "zkpay.*.IntentManager.WithdrawExecuted"

	return c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] IntentManager.WithdrawExecuted event! Subject=%s, data=%d", msg.Subject, len(msg.Data))
		log.Printf("🔍 [NATS] Message: %s", string(msg.Data))

		var intentManagerWithdrawExecuted EventIntentManagerWithdrawExecutedResponse
		if err := json.Unmarshal(msg.Data, &intentManagerWithdrawExecuted); err != nil {
			log.Printf("❌ Parse IntentManager.WithdrawExecuted event failed: %v", err)
			return
		}

		log.Printf("✅ [NATS] IntentManager.WithdrawExecuted event parse success: WorkerType=%d, Success=%v, Message=%s",
			intentManagerWithdrawExecuted.EventData.WorkerType, intentManagerWithdrawExecuted.EventData.Success, intentManagerWithdrawExecuted.EventData.Message)
		handler(&intentManagerWithdrawExecuted, msg.Subject)
		msg.Ack()
		log.Printf("✅ [NATS] IntentManager.WithdrawExecuted message process completed")
	})
}

// SubscribeToPayoutExecuted subscribes to Treasury.PayoutExecuted event
// Supports both V1 (Treasury) and V2 (EnclaveTreasury) contract names
func (c *NATSClient) SubscribeToPayoutExecuted(handler func(*EventPayoutExecutedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.*.Treasury.PayoutExecuted",        // V1
		"zkpay.*.EnclaveTreasury.PayoutExecuted", // V2
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] PayoutExecuted event! Subject=%s", msg.Subject)
		var event EventPayoutExecutedResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse PayoutExecuted event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToPayoutFailed subscribes to Treasury.PayoutFailed event
// Supports both V1 (Treasury) and V2 (EnclaveTreasury) contract names
func (c *NATSClient) SubscribeToPayoutFailed(handler func(*EventPayoutFailedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.*.Treasury.PayoutFailed",        // V1
		"zkpay.*.EnclaveTreasury.PayoutFailed", // V2
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] PayoutFailed event! Subject=%s", msg.Subject)
		var event EventPayoutFailedResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse PayoutFailed event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToHookExecuted subscribes to IntentManager.HookExecuted event
func (c *NATSClient) SubscribeToHookExecuted(handler func(*EventHookExecutedResponse, string)) error {
	subject := "zkpay.*.IntentManager.HookExecuted"
	if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] HookExecuted event! Subject=%s", msg.Subject)
		var event EventHookExecutedResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse HookExecuted event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
	}); err != nil {
		return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
	}
	return nil
}

// SubscribeToHookFailed subscribes to IntentManager.HookFailed event
func (c *NATSClient) SubscribeToHookFailed(handler func(*EventHookFailedResponse, string)) error {
	subject := "zkpay.*.IntentManager.HookFailed"
	if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] HookFailed event! Subject=%s", msg.Subject)
		var event EventHookFailedResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse HookFailed event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
	}); err != nil {
		return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
	}
	return nil
}

// SubscribeToFallbackTransferred subscribes to IntentManager.FallbackTransferred event
func (c *NATSClient) SubscribeToFallbackTransferred(handler func(*EventFallbackTransferredResponse, string)) error {
	subject := "zkpay.*.IntentManager.FallbackTransferred"
	if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] FallbackTransferred event! Subject=%s", msg.Subject)
		var event EventFallbackTransferredResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse FallbackTransferred event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
	}); err != nil {
		return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
	}
	return nil
}

// SubscribeToFallbackFailed subscribes to IntentManager.FallbackFailed event
func (c *NATSClient) SubscribeToFallbackFailed(handler func(*EventFallbackFailedResponse, string)) error {
	subject := "zkpay.*.IntentManager.FallbackFailed"
	if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] FallbackFailed event! Subject=%s", msg.Subject)
		var event EventFallbackFailedResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse FallbackFailed event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
	}); err != nil {
		return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
	}
	return nil
}

// SubscribeToPayoutRetryRecordCreated subscribes to Treasury.PayoutRetryRecordCreated event
// Supports both V1 (Treasury) and V2 (EnclaveTreasury) contract names
func (c *NATSClient) SubscribeToPayoutRetryRecordCreated(handler func(*EventPayoutRetryRecordCreatedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.*.Treasury.PayoutRetryRecordCreated",        // V1
		"zkpay.*.EnclaveTreasury.PayoutRetryRecordCreated", // V2
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
			log.Printf("🎉📨 [NATS] PayoutRetryRecordCreated event! Subject=%s", msg.Subject)
			var event EventPayoutRetryRecordCreatedResponse
			if err := json.Unmarshal(msg.Data, &event); err != nil {
				log.Printf("❌ Parse PayoutRetryRecordCreated event failed: %v", err)
				return
			}
			handler(&event, msg.Subject)
			msg.Ack()
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToFallbackRetryRecordCreated subscribes to Treasury.FallbackRetryRecordCreated event
func (c *NATSClient) SubscribeToFallbackRetryRecordCreated(handler func(*EventFallbackRetryRecordCreatedResponse, string)) error {
	subject := "zkpay.*.Treasury.FallbackRetryRecordCreated"
	if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] FallbackRetryRecordCreated event! Subject=%s", msg.Subject)
		var event EventFallbackRetryRecordCreatedResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse FallbackRetryRecordCreated event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
	}); err != nil {
		return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
	}
	return nil
}

// SubscribeToManuallyResolved subscribes to ZKPayProxy.ManuallyResolved event
// Supports both V1 (ZKPayProxy) and V2 (EnclavePay) contract names
func (c *NATSClient) SubscribeToManuallyResolved(handler func(*EventManuallyResolvedResponse, string)) error {
	// Subscribe to both V1 and V2 contract names
	subjects := []string{
		"zkpay.*.ZKPayProxy.ManuallyResolved",  // V1
		"zkpay.*.EnclavePay.ManuallyResolved",   // V2
	}
	
	for _, subject := range subjects {
		if err := c.subscribe(subject, func(msg *nats.Msg) {
		log.Printf("🎉📨 [NATS] ManuallyResolved event! Subject=%s", msg.Subject)
		var event EventManuallyResolvedResponse
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			log.Printf("❌ Parse ManuallyResolved event failed: %v", err)
			return
		}
		handler(&event, msg.Subject)
		msg.Ack()
		}); err != nil {
			return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
		}
	}
	return nil
}

// SubscribeToWithdrawals Subscriptionwithdrawevent (already，Use)
func (c *NATSClient) SubscribeToWithdrawals(handler func(*Withdrawal, string)) error {
	// ，UseSubscription
	log.Printf("⚠️ [NATS] SubscribeToWithdrawalsalready，useSubscribeToWithdrawRequestedSubscribeToWithdrawExecuted")
	return nil
}

// subscribe Subscription
func (c *NATSClient) subscribe(subject string, handler nats.MsgHandler) error {
	// attemptNATSSubscription（different frommultisigner）
	log.Printf("🔍 attemptNATSSubscriptionSubject: %s", subject)
	_, err := c.conn.Subscribe(subject, handler)
	if err == nil {
		log.Printf("✅ NATSSubscriptionsuccess: %s", subject)
		return nil
	}

	log.Printf("⚠️ NATSSubscriptionfailed，attemptJetStream: %v", err)

	// ifSubscriptionFailed，attemptJetStreamSubscription
	_, err = c.js.Subscribe(subject, handler)
	if err != nil {
		return fmt.Errorf("SubscriptionMessagefailed: %w", err)
	}

	log.Printf("✅ JetStreamSubscriptionsuccess: %s", subject)
	return nil
}

// PublishDepositEvent publishdepositevent（SupportEventDepositReceivedandEventDepositRecorded）
func (c *NATSClient) PublishDepositEvent(depositEvent interface{}) error {
	data, err := json.Marshal(depositEvent)
	if err != nil {
		return fmt.Errorf("depositdatafailed: %w", err)
	}

	// eventsubject
	var subject string
	switch event := depositEvent.(type) {
	case *EventDepositReceivedResponse:
		subject = fmt.Sprintf("%s.%d.%d", c.subjects["deposits"], event.ChainID, event.EventData.LocalDepositId)
	case *EventDepositRecordedResponse:
		subject = fmt.Sprintf("%s.%d.%d", c.subjects["deposits"], event.ChainID, event.EventData.LocalDepositId)
	default:
		subject = c.subjects["deposits"] // fallback
	}

	_, err = c.js.Publish(subject, data)
	if err != nil {
		return fmt.Errorf("publishdepositeventfailed: %w", err)
	}

	log.Printf("publishdepositevent: %s", subject)
	return nil
}

// PublishQueueRoot publishqueue rootUpdateevent
func (c *NATSClient) PublishQueueRoot(queueRoot *EventCommitmentRootUpdatedResponse) error {
	data, err := json.Marshal(queueRoot)
	if err != nil {
		return fmt.Errorf("queue rootdatafailed: %w", err)
	}

	// UseeventdataSubject
	subject := fmt.Sprintf("%s.%d.%s", c.subjects["commitments"], queueRoot.ChainID, queueRoot.EventData.NewRoot)
	_, err = c.js.Publish(subject, data)
	if err != nil {
		return fmt.Errorf("publishqueue rootUpdateeventfailed: %w", err)
	}

	log.Printf("publishqueue rootUpdateevent: %s", subject)
	return nil
}

// PublishWithdrawal publishwithdrawevent
func (c *NATSClient) PublishWithdrawal(withdrawal *Withdrawal) error {
	data, err := json.Marshal(withdrawal)
	if err != nil {
		return fmt.Errorf("withdrawdatafailed: %w", err)
	}

	subject := fmt.Sprintf("%s.%d.%s", c.subjects["withdrawals"], withdrawal.ChainID, withdrawal.NullifierHash)
	_, err = c.js.Publish(subject, data)
	if err != nil {
		return fmt.Errorf("publishwithdraweventfailed: %w", err)
	}

	log.Printf("publishwithdrawevent: %s", subject)
	return nil
}

// Close connection
func (c *NATSClient) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}

// GetConnection GetNATSconnection
func (c *NATSClient) GetConnection() *nats.Conn {
	return c.conn
}

// GetJetStream GetJetStream
func (c *NATSClient) GetJetStream() nats.JetStreamContext {
	return c.js
}
