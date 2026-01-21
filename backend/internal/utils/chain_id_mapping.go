package utils

import (
	"fmt"
	"strings"
)

// ChainIDMapping chain ID
type ChainIDMapping struct{}

// NewChainIDMapping createchain ID
func NewChainIDMapping() *ChainIDMapping {
	return &ChainIDMapping{}
}

// SLIP44ToEVM SLIP-44 Chain IDEVM Chain ID
func (c *ChainIDMapping) SLIP44ToEVM(slip44ChainID uint32) (uint32, error) {
	switch slip44ChainID {
	case 714: // BSC
		return 56, nil
	case 60: // Ethereum
		return 1, nil
	case 966: // Polygon
		return 137, nil
	case 195: // TRON
		return 0, fmt.Errorf("TRON does not have EVM Chain ID")
	default:
		return 0, fmt.Errorf("unsupported SLIP-44 Chain ID: %d", slip44ChainID)
	}
}

// EVMToSLIP44 EVM Chain IDSLIP-44 Chain ID
func (c *ChainIDMapping) EVMToSLIP44(evmChainID uint32) (uint32, error) {
	switch evmChainID {
	case 56: // BSC
		return 714, nil
	case 1: // Ethereum
		return 60, nil
	case 137: // Polygon
		return 966, nil
	default:
		return 0, fmt.Errorf("unsupported EVM Chain ID: %d", evmChainID)
	}
}

// GetChainName SLIP-44 Chain IDgetchain name
func (c *ChainIDMapping) GetChainName(slip44ChainID uint32) string {
	switch slip44ChainID {
	case 714:
		return "BSC"
	case 60:
		return "Ethereum"
	case 966:
		return "Polygon"
	case 195:
		return "TRON"
	default:
		return fmt.Sprintf("Unknown(%d)", slip44ChainID)
	}
}

// IsEVMCompatible checkwhetherEVM
func (c *ChainIDMapping) IsEVMCompatible(slip44ChainID uint32) bool {
	switch slip44ChainID {
	case 714, 60, 966: // BSC, Ethereum, Polygon
		return true
	case 195: // TRON
		return false
	default:
		return false
	}
}

// ValidateSLIP44ChainID verifySLIP-44 Chain IDwhethersupport
func (c *ChainIDMapping) ValidateSLIP44ChainID(slip44ChainID uint32) error {
	switch slip44ChainID {
	case 714, 60, 966, 195:
		return nil
	default:
		return fmt.Errorf("unsupported SLIP-44 Chain ID: %d", slip44ChainID)
	}
}

// ValidateEVMChainID verifyEVM Chain IDwhethersupport
func (c *ChainIDMapping) ValidateEVMChainID(evmChainID uint32) error {
	switch evmChainID {
	case 56, 1, 137:
		return nil
	default:
		return fmt.Errorf("unsupported EVM Chain ID: %d", evmChainID)
	}
}

// GetSupportedSLIP44ChainIDs getsupportSLIP-44 Chain ID
func (c *ChainIDMapping) GetSupportedSLIP44ChainIDs() []uint32 {
	return []uint32{714, 60, 966, 195} // BSC, Ethereum, Polygon, TRON
}

// GetSupportedEVMChainIDs getsupportEVM Chain ID
func (c *ChainIDMapping) GetSupportedEVMChainIDs() []uint32 {
	return []uint32{56, 1, 137} // BSC, Ethereum, Polygon
}

// ChainIDPair chain ID
type ChainIDPair struct {
	SLIP44ChainID   uint32  `json:"slip44_chain_id"`
	EVMChainID      *uint32 `json:"evm_chain_id,omitempty"`
	ChainName       string  `json:"chain_name"`
	IsEVMCompatible bool    `json:"is_evm_compatible"`
}

// GetAllChainIDPairs getchain ID
func (c *ChainIDMapping) GetAllChainIDPairs() []ChainIDPair {
	pairs := []ChainIDPair{
		{
			SLIP44ChainID:   714,
			EVMChainID:      uint32Ptr(56),
			ChainName:       "BSC",
			IsEVMCompatible: true,
		},
		{
			SLIP44ChainID:   60,
			EVMChainID:      uint32Ptr(1),
			ChainName:       "Ethereum",
			IsEVMCompatible: true,
		},
		{
			SLIP44ChainID:   966,
			EVMChainID:      uint32Ptr(137),
			ChainName:       "Polygon",
			IsEVMCompatible: true,
		},
		{
			SLIP44ChainID:   195,
			EVMChainID:      nil,
			ChainName:       "TRON",
			IsEVMCompatible: false,
		},
	}
	return pairs
}

// uint32Ptr createuint32
func uint32Ptr(v uint32) *uint32 {
	return &v
}


var GlobalChainIDMapping = NewChainIDMapping()

// ===== （） =====

// Slip44ToEvm  SLIP-44 ID  EVM Chain ID（）
func Slip44ToEvm(slip44ChainID int) int {
	evmID, err := GlobalChainIDMapping.SLIP44ToEVM(uint32(slip44ChainID))
	if err != nil {
		return 0
	}
	return int(evmID)
}

// EvmToSlip44  EVM Chain ID  SLIP-44 ID（）
func EvmToSlip44(evmChainID int) int {
	slip44ID, err := GlobalChainIDMapping.EVMToSLIP44(uint32(evmChainID))
	if err != nil {
		return 0
	}
	return int(slip44ID)
}

// SmartToSlip44 智能转换 ChainID 到 SLIP-44
// 如果输入是 EVM Chain ID，转换为 SLIP-44
// 如果输入已经是 SLIP-44 ChainID，直接返回
func SmartToSlip44(chainID int) int {
	// 首先检查是否是支持的 SLIP-44 ChainID
	if err := GlobalChainIDMapping.ValidateSLIP44ChainID(uint32(chainID)); err == nil {
		// 已经是 SLIP-44 ChainID，直接返回
		return chainID
	}
	
	// 如果不是 SLIP-44，尝试作为 EVM Chain ID 转换
	return EvmToSlip44(chainID)
}

// GetSlip44ChainIDFromName chain name SLIP-44 Chain ID
func GetSlip44ChainIDFromName(chainName string) int {
	switch chainName {
	case "BSC", "bsc":
		return 714
	case "Ethereum", "ethereum", "ETH", "eth":
		return 60
	case "Polygon", "polygon", "MATIC", "matic":
		return 966
	case "TRON", "tron", "TRX", "trx":
		return 195
	default:
		return 0
	}
}

// GetSlip44ChainIDFromSubject  NATS subject return SLIP-44 ID
func GetSlip44ChainIDFromSubject(subject string) (int, error) {
	// ： subject 
	lowerSubject := strings.ToLower(subject)
	chainNames := []string{"bsc", "ethereum", "polygon", "tron"}
	for _, name := range chainNames {
		if strings.Contains(lowerSubject, name) {
			chainID := GetSlip44ChainIDFromName(name)
			if chainID > 0 {
				return chainID, nil
			}
		}
	}

	return 0, fmt.Errorf(" subject chain ID: %s", subject)
}
