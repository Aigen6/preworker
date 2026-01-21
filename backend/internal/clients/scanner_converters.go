package clients

import (
	"fmt"
	"strconv"
	"time"

	"go-backend/internal/utils"
)

// ===== Scanner event format conversion functions =====

// ConvertScannerEventToDepositReceived Convert Scanner event to EventDepositReceivedResponse
func ConvertScannerEventToDepositReceived(notification *ScannerEventNotification, slip44ChainID int64) (*EventDepositReceivedResponse, error) {
	event := &EventDepositReceivedResponse{
		ChainID:         slip44ChainID,
		ContractAddress: notification.ContractAddr,
		ContractName:    "Treasury",
		EventName:       notification.EventName,
		BlockNumber:     notification.BlockNumber,
		TransactionHash: notification.TxHash,
		LogIndex:        notification.LogIndex,
		BlockTimestamp:  time.Now(),
	}

	if data := notification.EventData; data != nil {
		if v, ok := data["localDepositId"].(float64); ok {
			event.EventData.LocalDepositId = uint64(v)
		} else if v, ok := data["localDepositId"].(string); ok {
			if parsed, err := strconv.ParseUint(v, 10, 64); err == nil {
				event.EventData.LocalDepositId = parsed
			}
		}
		if v, ok := data["depositor"].(string); ok {
			event.EventData.Depositor = v
		}
		if v, ok := data["token"].(string); ok {
			event.EventData.Token = v
		}
		if v, ok := data["amount"].(string); ok {
			event.EventData.Amount = v
		}
		if v, ok := data["chainId"].(float64); ok {
			event.EventData.ChainId = uint32(v)
		}
		if v, ok := data["promoteCode"].(string); ok {
			event.EventData.PromoteCode = v
		}
	}

	return event, nil
}

// ConvertConfigurableEventToDepositReceived Convert ConfigurableEventNotification to EventDepositReceivedResponse
func ConvertConfigurableEventToDepositReceived(notification *ConfigurableEventNotification) (*EventDepositReceivedResponse, error) {
	chainID := utils.GetSlip44ChainIDFromName(notification.Chain)

	event := &EventDepositReceivedResponse{
		ChainID:         int64(chainID),
		ContractAddress: "",
		ContractName:    notification.Contract,
		EventName:       notification.Event,
		BlockNumber:     notification.BlockNumber,
		TransactionHash: notification.TransactionHash,
		LogIndex:        notification.LogIndex,
	}

	if timestamp, err := time.Parse(time.RFC3339, notification.Timestamp); err == nil {
		event.BlockTimestamp = timestamp
	}

	if data := notification.Data; data != nil {
		if v, ok := data["localDepositId"].(float64); ok {
			event.EventData.LocalDepositId = uint64(v)
		} else if v, ok := data["localDepositId"].(string); ok {
			if parsed, err := strconv.ParseUint(v, 10, 64); err == nil {
				event.EventData.LocalDepositId = parsed
			}
		}
		if v, ok := data["depositor"].(string); ok {
			event.EventData.Depositor = v
		}
		if v, ok := data["token"].(string); ok {
			event.EventData.Token = v
		}
		if v, ok := data["amount"].(string); ok {
			event.EventData.Amount = v
		}
		if v, ok := data["chainId"].(float64); ok {
			event.EventData.ChainId = uint32(v)
		}
		if v, ok := data["promoteCode"].(string); ok {
			event.EventData.PromoteCode = v
		}
	}

	return event, nil
}

// ConvertScannerEventToDepositRecorded Convert Scanner event to EventDepositRecordedResponse
func ConvertScannerEventToDepositRecorded(notification *ScannerEventNotification, slip44ChainID int64) (*EventDepositRecordedResponse, error) {
	event := &EventDepositRecordedResponse{
		ChainID:         slip44ChainID,
		ContractAddress: notification.ContractAddr,
		ContractName:    "ZKPayProxy",
		EventName:       notification.EventName,
		BlockNumber:     notification.BlockNumber,
		TransactionHash: notification.TxHash,
		LogIndex:        notification.LogIndex,
		BlockTimestamp:  time.Now(),
	}

	if data := notification.EventData; data != nil {
		if v, ok := data["localDepositId"].(float64); ok {
			event.EventData.LocalDepositId = uint64(v)
		} else if v, ok := data["localDepositId"].(string); ok {
			if parsed, err := strconv.ParseUint(v, 10, 64); err == nil {
				event.EventData.LocalDepositId = parsed
			}
		}
		if v, ok := data["tokenKey"].(string); ok {
			event.EventData.TokenKey = v
		}
		if v, ok := data["tokenId"].(float64); ok {
			event.EventData.TokenId = uint16(v)
		}
		if ownerData, ok := data["owner"].(map[string]interface{}); ok {
			if chainId, ok := ownerData["chainId"].(float64); ok {
				event.EventData.Owner.ChainId = uint16(chainId)
			}
			if dataStr, ok := ownerData["data"].(string); ok {
				event.EventData.Owner.Data = dataStr
			} else if dataArray, ok := ownerData["data"].([]interface{}); ok {
				bytes := make([]byte, len(dataArray))
				for i, v := range dataArray {
					if byteVal, ok := v.(float64); ok {
						bytes[i] = byte(byteVal)
					}
				}
				event.EventData.Owner.Data = fmt.Sprintf("0x%x", bytes)
			}
		}
		if v, ok := data["grossAmount"].(string); ok {
			event.EventData.GrossAmount = v
		}
		if v, ok := data["feeTotalLocked"].(string); ok {
			event.EventData.FeeTotalLocked = v
		}
		if v, ok := data["allocatableAmount"].(string); ok {
			event.EventData.AllocatableAmount = v
		}
		if v, ok := data["promoteCode"].(string); ok {
			event.EventData.PromoteCode = v
		}
		if v, ok := data["addressRank"].(float64); ok {
			event.EventData.AddressRank = uint8(v)
		}
		if v, ok := data["depositTxHash"].(string); ok {
			event.EventData.DepositTxHash = v
		}
		if v, ok := data["blockNumber"].(float64); ok {
			event.EventData.BlockNumber = uint64(v)
		}
		if v, ok := data["timestamp"].(float64); ok {
			event.EventData.Timestamp = uint64(v)
		}
	}

	return event, nil
}

// ConvertConfigurableEventToDepositRecorded Convert ConfigurableEventNotification to EventDepositRecordedResponse
func ConvertConfigurableEventToDepositRecorded(notification *ConfigurableEventNotification) (*EventDepositRecordedResponse, error) {
	chainID := utils.GetSlip44ChainIDFromName(notification.Chain)

	event := &EventDepositRecordedResponse{
		ChainID:         int64(chainID),
		ContractAddress: notification.Contract,
		ContractName:    notification.Contract,
		EventName:       notification.Event,
		BlockNumber:     notification.BlockNumber,
		TransactionHash: notification.TransactionHash,
		LogIndex:        notification.LogIndex,
	}

	if timestamp, err := time.Parse(time.RFC3339, notification.Timestamp); err == nil {
		event.BlockTimestamp = timestamp
	} else {
		event.BlockTimestamp = time.Now()
	}

	if data := notification.Data; data != nil {
		if v, ok := data["localDepositId"].(float64); ok {
			event.EventData.LocalDepositId = uint64(v)
		}
		if v, ok := data["tokenKey"].(string); ok {
			event.EventData.TokenKey = v
		}
		if v, ok := data["tokenId"].(float64); ok {
			event.EventData.TokenId = uint16(v)
		}
		if ownerData, ok := data["owner"].(map[string]interface{}); ok {
			if chainId, ok := ownerData["chainId"].(float64); ok {
				event.EventData.Owner.ChainId = uint16(chainId)
			}
			if dataStr, ok := ownerData["data"].(string); ok {
				event.EventData.Owner.Data = dataStr
			} else if dataArray, ok := ownerData["data"].([]interface{}); ok {
				bytes := make([]byte, len(dataArray))
				for i, v := range dataArray {
					if byteVal, ok := v.(float64); ok {
						bytes[i] = byte(byteVal)
					}
				}
				event.EventData.Owner.Data = fmt.Sprintf("0x%x", bytes)
			}
		}
		if v, ok := data["grossAmount"].(string); ok {
			event.EventData.GrossAmount = v
		}
		if v, ok := data["feeTotalLocked"].(string); ok {
			event.EventData.FeeTotalLocked = v
		}
		if v, ok := data["allocatableAmount"].(string); ok {
			event.EventData.AllocatableAmount = v
		}
		if v, ok := data["promoteCode"].(string); ok {
			event.EventData.PromoteCode = v
		}
		if v, ok := data["addressRank"].(float64); ok {
			event.EventData.AddressRank = uint8(v)
		}
		if v, ok := data["depositTxHash"].(string); ok {
			event.EventData.DepositTxHash = v
		}
		if v, ok := data["blockNumber"].(float64); ok {
			event.EventData.BlockNumber = uint64(v)
		}
		if v, ok := data["timestamp"].(float64); ok {
			event.EventData.Timestamp = uint64(v)
		}
	}

	return event, nil
}

// ConvertScannerEventToDepositUsed Convert Scanner event to EventDepositUsedResponse
func ConvertScannerEventToDepositUsed(notification *ScannerEventNotification, slip44ChainID int64) (*EventDepositUsedResponse, error) {
	event := &EventDepositUsedResponse{
		ChainID:         slip44ChainID,
		ContractAddress: notification.ContractAddr,
		ContractName:    "ZKPayProxy",
		EventName:       notification.EventName,
		BlockNumber:     notification.BlockNumber,
		TransactionHash: notification.TxHash,
		LogIndex:        notification.LogIndex,
		BlockTimestamp:  time.Now(),
	}

	if data := notification.EventData; data != nil {
		if v, ok := data["chainId"].(float64); ok {
			event.EventData.ChainId = uint32(v)
		}
		if v, ok := data["localDepositId"].(float64); ok {
			event.EventData.LocalDepositId = uint64(v)
		} else if v, ok := data["localDepositId"].(string); ok {
			if parsed, err := strconv.ParseUint(v, 10, 64); err == nil {
				event.EventData.LocalDepositId = parsed
			}
		}
		if v, ok := data["commitment"].(string); ok {
			event.EventData.Commitment = v
		}
		if v, ok := data["promoteCode"].(string); ok {
			event.EventData.PromoteCode = v
		}
	}

	return event, nil
}

// ConvertConfigurableEventToDepositUsed Convert ConfigurableEventNotification to EventDepositUsedResponse
func ConvertConfigurableEventToDepositUsed(notification *ConfigurableEventNotification) (*EventDepositUsedResponse, error) {
	chainID := utils.GetSlip44ChainIDFromName(notification.Chain)

	event := &EventDepositUsedResponse{
		ChainID:         int64(chainID),
		ContractAddress: "",
		ContractName:    notification.Contract,
		EventName:       notification.Event,
		BlockNumber:     notification.BlockNumber,
		TransactionHash: notification.TransactionHash,
		LogIndex:        notification.LogIndex,
	}

	if timestamp, err := time.Parse(time.RFC3339, notification.Timestamp); err == nil {
		event.BlockTimestamp = timestamp
	}

	if data := notification.Data; data != nil {
		if v, ok := data["chainId"].(float64); ok {
			event.EventData.ChainId = uint32(v)
		}
		if v, ok := data["localDepositId"].(float64); ok {
			event.EventData.LocalDepositId = uint64(v)
		} else if v, ok := data["localDepositId"].(string); ok {
			if parsed, err := strconv.ParseUint(v, 10, 64); err == nil {
				event.EventData.LocalDepositId = parsed
			}
		}
		if v, ok := data["commitment"].(string); ok {
			event.EventData.Commitment = v
		}
		if v, ok := data["promoteCode"].(string); ok {
			event.EventData.PromoteCode = v
		}
	}

	return event, nil
}

// ConvertScannerEventToCommitmentRootUpdated Convert Scanner event to CommitmentRootUpdated structure
func ConvertScannerEventToCommitmentRootUpdated(notification *ScannerEventNotification, slip44ChainID int64) (*EventCommitmentRootUpdatedResponse, error) {
	event := &EventCommitmentRootUpdatedResponse{
		ChainID:         slip44ChainID,
		ContractAddress: notification.ContractAddr,
		ContractName:    "ZKPayProxy",
		EventName:       notification.EventName,
		BlockNumber:     notification.BlockNumber,
		TransactionHash: notification.TxHash,
		LogIndex:        notification.LogIndex,
		BlockTimestamp:  time.Now(),
		EventData: struct {
			OldRoot    string `json:"oldRoot"`
			Commitment string `json:"commitment"`
			NewRoot    string `json:"newRoot"`
		}{
			OldRoot:    "",
			Commitment: "",
			NewRoot:    "",
		},
	}

	if notification.EventData != nil {
		if v, ok := notification.EventData["oldRoot"].(string); ok {
			event.EventData.OldRoot = v
		}
		if v, ok := notification.EventData["commitment"].(string); ok {
			event.EventData.Commitment = v
		}
		if v, ok := notification.EventData["newRoot"].(string); ok {
			event.EventData.NewRoot = v
		}
	}

	return event, nil
}
