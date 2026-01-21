// ZKPay contract address configuration management - Go version
package config

import (
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

// ContractAddresses contract addresses structure
type ContractAddresses struct {
	Treasury        string `yaml:"treasury" json:"treasury"`
	ZKPayStorage    string `yaml:"zkpay_storage" json:"zkpay_storage"`
	ZKPayProxy      string `yaml:"zkpay_proxy" json:"zkpay_proxy"`
	SP1Verifier     string `yaml:"sp1_verifier" json:"sp1_verifier"`
	TreasuryConfig  string `yaml:"treasury_config" json:"treasury_config"`
	WithdrawManager string `yaml:"withdraw_manager" json:"withdraw_manager"`
}

// TokenAddresses token contract address mapping
type TokenAddresses map[string]string

// ContractNetworkConfig extended network configuration（including contract and token info）
type ContractNetworkConfig struct {
	ChainID      uint32            `yaml:"chain_id" json:"chain_id"`           // SLIP-44 Coin Type
	RpcChainID   *uint64           `yaml:"rpc_chain_id" json:"rpc_chain_id"`   // EVM RPC Chain ID (null for non-EVM)
	Name         string            `yaml:"name" json:"name"`
	NativeSymbol string            `yaml:"native_symbol" json:"native_symbol"`
	Explorer     string            `yaml:"explorer" json:"explorer"`
	RpcUrls      []string          `yaml:"rpc_urls" json:"rpc_urls"`
	Contracts    ContractAddresses `yaml:"contracts" json:"contracts"`
	Tokens       TokenAddresses    `yaml:"tokens" json:"tokens"`
}

// DefaultGasSettings GasSet
type DefaultGasSettings struct {
	GasPriceMultiplier float64 `yaml:"gas_price_multiplier" json:"gas_price_multiplier"`
	MaxGasPrice        string  `yaml:"max_gas_price" json:"max_gas_price"`
}

// Defaults DefaultConfiguration
type Defaults struct {
	PreferredNetwork    string                        `yaml:"preferred_network" json:"preferred_network"`
	DefaultTokenID      uint16                        `yaml:"default_token_id" json:"default_token_id"`
	DefaultLanguage     uint8                         `yaml:"default_language" json:"default_language"`
	DefaultGasSettings  map[string]DefaultGasSettings `yaml:"default_gas_settings" json:"default_gas_settings"`
}

// ContractsConfig Complete contractConfiguration
type ContractsConfig struct {
	Version          string                       `yaml:"version" json:"version"`
	Updated          string                       `yaml:"updated" json:"updated"`
	Networks         map[string]ContractNetworkConfig     `yaml:"networks" json:"networks"`
	Testnets         map[string]ContractNetworkConfig     `yaml:"testnets" json:"testnets"`
	AbiReferences    map[string]string            `yaml:"abi_references" json:"abi_references"`
	DeploymentStatus map[string]map[string]string `yaml:"deployment_status" json:"deployment_status"`
	Defaults         Defaults                     `yaml:"defaults" json:"defaults"`
}

// ContractsConfigManager contractconfigurationmanager
type ContractsConfigManager struct {
	config ContractsConfig
	mu     sync.RWMutex
}

var (
	globalContractsConfig *ContractsConfigManager
	once                  sync.Once
)

// GetGlobalContractsConfig Getcontractconfiguration
func GetGlobalContractsConfig() *ContractsConfigManager {
	once.Do(func() {
		globalContractsConfig = NewContractsConfigManager("")
	})
	return globalContractsConfig
}

// NewContractsConfigManager Createcontractconfigurationmanager
func NewContractsConfigManager(configPath string) *ContractsConfigManager {
	manager := &ContractsConfigManager{}
	
	// configuration file path
	if configPath == "" {
		// Default path: relative to go-backend config directory
		wd, _ := os.Getwd()
		configPath = filepath.Join(wd, "..", "config", "contracts.yaml")
	}
	
	// Loadconfiguration
	if err := manager.loadConfig(configPath); err != nil {
		fmt.Printf("⚠️ Unable to load contract configuration file %s: %v\n", configPath, err)
		// UseDefaultConfiguration
		manager.config = manager.getDefaultConfig()
	}
	
	return manager
}

// loadConfig LoadYAMLconfiguration file
func (m *ContractsConfigManager) loadConfig(configPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	data, err := ioutil.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("Failed to read configuration file: %w", err)
	}
	
	if err := yaml.Unmarshal(data, &m.config); err != nil {
		return fmt.Errorf("Failed to parse YAML configuration: %w", err)
	}
	
	return nil
}

// getDefaultConfig GetDefaultConfiguration
func (m *ContractsConfigManager) getDefaultConfig() ContractsConfig {
	rpcChainID := uint64(56)
	
	return ContractsConfig{
		Version: "1.0",
		Updated: "2025-01-21",
		Networks: map[string]ContractNetworkConfig{
			"bsc": {
				ChainID:      714,
				RpcChainID:   &rpcChainID,
				Name:         "Binance Smart Chain",
				NativeSymbol: "BNB",
				Explorer:     "https://bscscan.com",
				RpcUrls:      []string{"https://bsc-dataseed1.binance.org/"},
				Contracts: ContractAddresses{
					Treasury:        "0xbA031be32Bea2279C0b1eDE942d8553B74Ae62DC",
					ZKPayStorage:    "0x8EFCbfdf976c03091475850D66eC0BBE6F149107",
					ZKPayProxy:      "0x8EFCbfdf976c03091475850D66eC0BBE6F149107",
					SP1Verifier:     "0x0000000000000000000000000000000000000000",
					TreasuryConfig:  "0x0000000000000000000000000000000000000000",
					WithdrawManager: "0x0000000000000000000000000000000000000000",
				},
				Tokens: TokenAddresses{
					"USDT": "0x55d398326f99059fF775485246999027B3197955",
					"USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
				},
			},
		},
		Testnets:         make(map[string]ContractNetworkConfig),
		AbiReferences:    make(map[string]string),
		DeploymentStatus: make(map[string]map[string]string),
		Defaults: Defaults{
			PreferredNetwork: "bsc",
			DefaultTokenID:   1,
			DefaultLanguage:  2,
			DefaultGasSettings: map[string]DefaultGasSettings{
				"bsc": {
					GasPriceMultiplier: 1.1,
					MaxGasPrice:        "10000000000",
				},
			},
		},
	}
}

// GetNetworkByChainID SLIP-44 Chain IDGetNetworkconfiguration
func (m *ContractsConfigManager) GetNetworkByChainID(chainID uint32, includeTestnets bool) (*ContractNetworkConfig, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	// Search in mainnet first
	for _, config := range m.config.Networks {
		if config.ChainID == chainID {
			return &config, true
		}
	}
	
	// If allowed, search in testnet
	if includeTestnets {
		for _, config := range m.config.Testnets {
			if config.ChainID == chainID {
				return &config, true
			}
		}
	}
	
	return nil, false
}

// GetNetworkByName NetworkGetconfiguration
func (m *ContractsConfigManager) GetNetworkByName(networkName string, includeTestnets bool) (*ContractNetworkConfig, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	// Search in mainnet first
	if config, exists := m.config.Networks[networkName]; exists {
		return &config, true
	}
	
	// If allowed, search in testnet
	if includeTestnets {
		if config, exists := m.config.Testnets[networkName]; exists {
			return &config, true
		}
	}
	
	return nil, false
}

// GetNetworkByRpcChainID RPC Chain IDGetNetworkconfiguration（）
func (m *ContractsConfigManager) GetNetworkByRpcChainID(rpcChainID uint64, includeTestnets bool) (*ContractNetworkConfig, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	// Search in mainnet first
	for _, config := range m.config.Networks {
		if config.RpcChainID != nil && *config.RpcChainID == rpcChainID {
			return &config, true
		}
	}
	
	// If allowed, search in testnet
	if includeTestnets {
		for _, config := range m.config.Testnets {
			if config.RpcChainID != nil && *config.RpcChainID == rpcChainID {
				return &config, true
			}
		}
	}
	
	return nil, false
}

// GetTreasuryAddress Get treasury contract address
func (m *ContractsConfigManager) GetTreasuryAddress(chainID uint32) (string, bool) {
	network, exists := m.GetNetworkByChainID(chainID, true)
	if !exists {
		return "", false
	}
	
	if network.Contracts.Treasury == "" || network.Contracts.Treasury == "0x0000000000000000000000000000000000000000" {
		return "", false
	}
	
	return network.Contracts.Treasury, true
}

// GetZKPayAddress Get ZKPay main contract address
func (m *ContractsConfigManager) GetZKPayAddress(chainID uint32) (string, bool) {
	network, exists := m.GetNetworkByChainID(chainID, true)
	if !exists {
		return "", false
	}
	
	// Use proxy address，Storageaddress
	if network.Contracts.ZKPayProxy != "" && network.Contracts.ZKPayProxy != "0x0000000000000000000000000000000000000000" {
		return network.Contracts.ZKPayProxy, true
	}
	
	if network.Contracts.ZKPayStorage != "" && network.Contracts.ZKPayStorage != "0x0000000000000000000000000000000000000000" {
		return network.Contracts.ZKPayStorage, true
	}
	
	return "", false
}

// GetTokenAddress Get token contract address
func (m *ContractsConfigManager) GetTokenAddress(chainID uint32, tokenSymbol string) (string, bool) {
	network, exists := m.GetNetworkByChainID(chainID, true)
	if !exists {
		return "", false
	}
	
	address, exists := network.Tokens[tokenSymbol]
	if !exists || address == "" {
		return "", false
	}
	
	return address, true
}

// GetRpcUrls GetNetworkRPC URL
func (m *ContractsConfigManager) GetRpcUrls(chainID uint32) []string {
	network, exists := m.GetNetworkByChainID(chainID, true)
	if !exists {
		return []string{}
	}
	
	return network.RpcUrls
}

// GetExplorerUrl GetURL
func (m *ContractsConfigManager) GetExplorerUrl(chainID uint32) (string, bool) {
	network, exists := m.GetNetworkByChainID(chainID, true)
	if !exists {
		return "", false
	}
	
	return network.Explorer, true
}

// IsEvmCompatible CheckwhetherEVMNetwork
func (m *ContractsConfigManager) IsEvmCompatible(chainID uint32) bool {
	network, exists := m.GetNetworkByChainID(chainID, true)
	if !exists {
		return false
	}
	
	return network.RpcChainID != nil
}

// Slip44ToRpcChainID Convert SLIP-44 Chain ID to RPC Chain ID
func (m *ContractsConfigManager) Slip44ToRpcChainID(slip44ChainID uint32) (uint64, bool) {
	network, exists := m.GetNetworkByChainID(slip44ChainID, true)
	if !exists || network.RpcChainID == nil {
		return 0, false
	}
	
	return *network.RpcChainID, true
}

// RpcToSlip44ChainID Convert RPC Chain ID to SLIP-44 Chain ID
func (m *ContractsConfigManager) RpcToSlip44ChainID(rpcChainID uint64) (uint32, bool) {
	network, exists := m.GetNetworkByRpcChainID(rpcChainID, true)
	if !exists {
		return 0, false
	}
	
	return network.ChainID, true
}

// GetNetworkDisplayName GetNetwork
func (m *ContractsConfigManager) GetNetworkDisplayName(chainID uint32) string {
	network, exists := m.GetNetworkByChainID(chainID, true)
	if !exists {
		return fmt.Sprintf("Unknown Network (%d)", chainID)
	}
	
	return network.Name
}

// IsNetworkDeployed CheckNetworkwhetheralready
func (m *ContractsConfigManager) IsNetworkDeployed(networkName string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	status, exists := m.config.DeploymentStatus[networkName]
	if !exists {
		return false
	}
	
	// Check if main contracts are deployed
	requiredContracts := []string{"treasury", "zkpay_storage", "zkpay_proxy"}
	for _, contract := range requiredContracts {
		if status[contract] != "deployed" {
			return false
		}
	}
	
	return true
}

// GetContractStatus Getcontractstatus
func (m *ContractsConfigManager) GetContractStatus(networkName, contractName string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	if status, exists := m.config.DeploymentStatus[networkName]; exists {
		if contractStatus, exists := status[contractName]; exists {
			return contractStatus
		}
	}
	
	return "unknown"
}

// GetSupportedNetworks GetSupportNetwork
func (m *ContractsConfigManager) GetSupportedNetworks(includeTestnets bool) map[string]ContractNetworkConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	result := make(map[string]ContractNetworkConfig)
	
	// Add mainnet
	for name, config := range m.config.Networks {
		result[name] = config
	}
	
	// If allowed, add testnet
	if includeTestnets {
		for name, config := range m.config.Testnets {
			result[name+"_testnet"] = config
		}
	}
	
	return result
}

// GetConfig Getconfiguration（Debug）
func (m *ContractsConfigManager) GetConfig() ContractsConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	return m.config
}

// Convenience functions
func GetTreasuryAddress(chainID uint32) (string, bool) {
	return GetGlobalContractsConfig().GetTreasuryAddress(chainID)
}

func GetZKPayAddress(chainID uint32) (string, bool) {
	return GetGlobalContractsConfig().GetZKPayAddress(chainID)
}

func GetTokenAddress(chainID uint32, tokenSymbol string) (string, bool) {
	return GetGlobalContractsConfig().GetTokenAddress(chainID, tokenSymbol)
}

func GetRpcUrls(chainID uint32) []string {
	return GetGlobalContractsConfig().GetRpcUrls(chainID)
}

func GetNetworkDisplayName(chainID uint32) string {
	return GetGlobalContractsConfig().GetNetworkDisplayName(chainID)
}

func IsEvmCompatible(chainID uint32) bool {
	return GetGlobalContractsConfig().IsEvmCompatible(chainID)
}

func Slip44ToRpcChainID(slip44ChainID uint32) (uint64, bool) {
	return GetGlobalContractsConfig().Slip44ToRpcChainID(slip44ChainID)
}

func RpcToSlip44ChainID(rpcChainID uint64) (uint32, bool) {
	return GetGlobalContractsConfig().RpcToSlip44ChainID(rpcChainID)
}
