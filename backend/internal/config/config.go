package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// RootConfig project root directory configuration structure
type RootConfig struct {
	GoBackend GoBackendConfig `yaml:"goBackend"`
	ZKVM      ZKVMConfig      `yaml:"zkvm"`
	Scanner   ScannerConfig   `yaml:"scanner"`
}

// GoBackendConfig go-backendservice configuration
type GoBackendConfig struct {
	Server     ServerConfig     `yaml:"server"`
	Database   DatabaseConfig   `yaml:"database"`
	Blockchain BlockchainConfig `yaml:"blockchain"`
	ZKVM       ZKVMConfig       `yaml:"zkvm"`
	KMS        KMSConfig        `yaml:"kms"`
}

// Config application configuration structure（maintain backward compatibility）
type Config struct {
	Server     ServerConfig       `yaml:"server"`
	Database   DatabaseConfig     `yaml:"database"`
	NATS       NATSConfig         `yaml:"nats"`
	Redis      RedisConfig        `yaml:"redis"`
	Blockchain BlockchainConfig   `yaml:"blockchain"`
	ZKVM       ZKVMConfig         `yaml:"zkvm"`
	Scanner    ScannerConfig      `yaml:"scanner"`
	KMS        KMSConfig          `yaml:"kms"`
	Tokens     TokenDecimalConfig `yaml:"tokens"`     // new token configuration
	CORS       CORSConfig         `yaml:"cors"`       // CORS configuration
	KYTOracle  KYTOracleConfig    `yaml:"kyt_oracle"` // KYT Oracle service configuration
	Admin      AdminConfig        `yaml:"admin"`      // Admin API access control configuration
	Subgraph   SubgraphConfig     `yaml:"subgraph"`   // Subgraph sync configuration
	Statistics StatisticsConfig   `yaml:"statistics"` // Statistics API configuration
}

// ServerConfig server configuration
type ServerConfig struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
}

// DatabaseConfig Database configuration
type DatabaseConfig struct {
	DSN    string `yaml:"dsn"`
	Driver string `yaml:"driver"`
}

// NATSConfig NATSMessage server configuration
type NATSConfig struct {
	URL             string                  `yaml:"url"`
	Timeout         int                     `yaml:"timeout"`
	ReconnectWait   int                     `yaml:"reconnect_wait"`
	MaxReconnects   int                     `yaml:"max_reconnects"`
	EnableJetStream bool                    `yaml:"enable_jetstream"`
	Subscriptions   NATSSubscriptionsConfig `yaml:"subscriptions"`
}

// NATSSubscriptionsConfig NATSSubscription configuration
type NATSSubscriptionsConfig struct {
	Deposits    []NATSSubjectConfig `yaml:"deposits"`
	Commitments []NATSSubjectConfig `yaml:"commitments"`
	Withdrawals []NATSSubjectConfig `yaml:"withdrawals"`
}

// NATSSubjectConfig NATSSubject configuration
type NATSSubjectConfig struct {
	Subject     string `yaml:"subject"`
	Description string `yaml:"description"`
	Enabled     bool   `yaml:"enabled"`
}

// RedisConfig RedisCache configuration
type RedisConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
	Timeout  int    `yaml:"timeout"`
}

// BlockchainConfig Blockchain configuration
type BlockchainConfig struct {
	// Global ZKPay contract address (same for all chains)
	ZKPayProxy string `yaml:"zkpay_proxy"` // Global ZKPay Proxy contract address

	Networks map[string]NetworkConfig `yaml:"networks"`
}

// TokenConfig Token configuration (Maintain backward compatibility with old structure)
type TokenConfig struct {
	Symbol   string `yaml:"symbol"`   // Token symbol
	Decimals uint8  `yaml:"decimals"` // Decimal places
}

// TokenDecimalConfig Global token decimalConfiguration
type TokenDecimalConfig struct {
	ManagementDecimals int                 `yaml:"managementDecimals"` // Management chain decimals (fixed at 18)
	ChainDecimals      map[int]map[int]int `yaml:"chainDecimals"`      // Decimals for each token on each chain chainId->tokenId->decimals
}

// NetworkConfig NetworkConfiguration
type NetworkConfig struct {
	ChainID                int      `yaml:"chainId"`
	Name                   string   `yaml:"name"`
	RPCEndpoints           []string `yaml:"rpcEndpoints"`
	ZKPayContract          string   `yaml:"zkPayContract"`
	StorageContract        string   `yaml:"storageContract"`
	VaultContract          string   `yaml:"vaultContract"`          // Vault contract address
	ImplementationContract string   `yaml:"implementationContract"` // Implementation contract address
	SP1Verifier            string   `yaml:"sp1Verifier"`            // SP1verifier address
	USDTContract           string   `yaml:"usdtContract"`           // USDT contract address
	MultisigOwner          string   `yaml:"multisigOwner"`          // Multisig owner address

	// configuration - ：KMS or
	KMSKeyAlias   string `yaml:"kmsKeyAlias"`   // Key alias in KMS
	KMSEnabled    bool   `yaml:"kmsEnabled"`    // Whether to enable KMS
	PrivateKey    string `yaml:"privateKey"`    // Direct private key (hex format, without 0x prefix)
	UsePrivateKey bool   `yaml:"usePrivateKey"` // whetherUse direct private key（KMS）

	RelayerAddress    string                 `yaml:"relayerAddress"`    // Relayer address
	GasPrice          string                 `yaml:"gasPrice"`          // Gas price (wei)
	GasLimit          uint64                 `yaml:"gasLimit"`          // GasRestrict
	BaseFeeAmount     string                 `yaml:"baseFeeAmount"`     // Base fee amount
	SubmitVkeyHash    string                 `yaml:"submitVkeyHash"`    // verification key hash
	WithdrawVkeyHash  string                 `yaml:"withdrawVkeyHash"`  // withdrawverification key hash
	TokenConfigs      map[string]TokenConfig `yaml:"tokenConfigs"`      // token configuration mapping
	ContractAddresses map[string]string      `yaml:"contractAddresses"` // Contract address mapping
	Enabled           bool                   `yaml:"enabled"`
}

// ZKVMConfig ZKVMservice configuration
type ZKVMConfig struct {
	BaseURL string `yaml:"baseUrl"`
	Timeout int    `yaml:"timeout"`
}

// ScannerConfig ScannerConfiguration
type ScannerConfig struct {
	Type string     `yaml:"type"`
	NATS NATSConfig `yaml:"nats"`
	HTTP struct {
		BaseURL string `yaml:"baseUrl"`
		Timeout int    `yaml:"timeout"`
	} `yaml:"http"`
	Timeout int `yaml:"timeout"`
}

// SubgraphConfig SubgraphConfiguration
type SubgraphConfig struct {
	SyncInterval int `yaml:"syncInterval"` // 同步间隔（分钟），默认3分钟
}

// KMSConfig KMSservice configuration
type KMSConfig struct {
	Enabled    bool   `yaml:"enabled"`    // Whether to enable KMS
	ServiceURL string `yaml:"serviceUrl"` // KMS service address
	AuthToken  string `yaml:"authToken"`  // Authentication token
	Timeout    int    `yaml:"timeout"`    // request timeout (seconds)
}

// CORSConfig CORS configuration
type CORSConfig struct {
	AllowedOrigins   []string `yaml:"allowedOrigins"`   // List of allowed origins
	AllowCredentials bool     `yaml:"allowCredentials"` // Whether to allow credentials
	MaxAge           int      `yaml:"maxAge"`           // Max age for preflight requests (seconds)
}

// KYTOracleConfig KYT Oracle service configuration
type KYTOracleConfig struct {
	BaseURL string `yaml:"base_url"` // KYT Oracle service base URL
}

// AdminConfig Admin API access control configuration
type AdminConfig struct {
	AllowedIPs []string `yaml:"allowedIPs"` // List of allowed IP addresses or CIDR ranges
}

// StatisticsConfig Statistics API configuration
type StatisticsConfig struct {
	WhitelistIPs []string `yaml:"whitelistIPs"` // List of IP addresses or CIDR ranges allowed to access statistics without JWT
}

var AppConfig *Config

// LoadConfig Load configuration file
func LoadConfig(configPath string) error {
	// ifconfiguration file pathempty，Use default path
	if configPath == "" {
		configPath = "config.yaml"
		// Checkwhetherexistsconfiguration file
		if _, err := os.Stat("config.local.yaml"); err == nil {
			configPath = "config.local.yaml"
			log.Printf("🔧 Using local configuration file: config.local.yaml")
		}
	}

	// Readconfiguration file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	// whetherconfiguration file
	var config Config

	// attemptParseconfiguration
	var rootConfig RootConfig
	if err := yaml.Unmarshal(data, &rootConfig); err == nil && rootConfig.GoBackend.Server.Host != "" {
		// Successfully parsedconfiguration，Use go-backendconfiguration
		// First parse as direct config to get all fields including KYT Oracle and Admin
		var directConfig Config
		if err := yaml.Unmarshal(data, &directConfig); err == nil {
			config = directConfig
			// Override with root config values for specific fields
			config.Server = rootConfig.GoBackend.Server
			config.Database = rootConfig.GoBackend.Database
			config.Blockchain = rootConfig.GoBackend.Blockchain
			config.ZKVM = rootConfig.ZKVM
			config.KMS = rootConfig.GoBackend.KMS
			// Admin config is already loaded from directConfig
		} else {
			// Fallback to basic config
			config = Config{
				Server:     rootConfig.GoBackend.Server,
				Database:   rootConfig.GoBackend.Database,
				Blockchain: rootConfig.GoBackend.Blockchain,
				ZKVM:       rootConfig.ZKVM,
				KMS:        rootConfig.GoBackend.KMS,
			}
			// Try to load Admin config from direct parse
			var tempConfig Config
			if err := yaml.Unmarshal(data, &tempConfig); err == nil {
				config.Admin = tempConfig.Admin
			}
		}
		fmt.Printf("✅ [%s] Loading go-backend configuration from root config file: %s\n", time.Now().Format("2006-01-02 15:04:05"), configPath)
	} else {
		// Parseconfiguration
		if err := yaml.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("failed to parse config file: %w", err)
		}
		fmt.Printf("✅ [%s] Loading configuration from local config file: %s\n", time.Now().Format("2006-01-02 15:04:05"), configPath)
	}

	// Overrideconfiguration
	overrideFromEnv(&config)

	// Debug：ZKVMconfiguration
	fmt.Printf("📋 [Config] ZKVM configuration loaded: BaseURL=%s, Timeout=%d\n", config.ZKVM.BaseURL, config.ZKVM.Timeout)

	// Debug: Admin configuration
	if len(config.Admin.AllowedIPs) > 0 {
		fmt.Printf("📋 [Config] Admin IP whitelist loaded: %d IPs/CIDRs configured\n", len(config.Admin.AllowedIPs))
		for i, ip := range config.Admin.AllowedIPs {
			fmt.Printf("   [%d] %s\n", i+1, ip)
		}
	} else {
		fmt.Printf("📋 [Config] Admin IP whitelist: not configured (localhost-only mode)\n")
	}

	// Debug: CORS configuration
	if len(config.CORS.AllowedOrigins) > 0 {
		fmt.Printf("📋 [Config] CORS allowed origins loaded: %d origins configured\n", len(config.CORS.AllowedOrigins))
		for i, origin := range config.CORS.AllowedOrigins {
			fmt.Printf("   [%d] %s\n", i+1, origin)
		}
		fmt.Printf("📋 [Config] CORS allowCredentials: %v, maxAge: %d seconds\n", config.CORS.AllowCredentials, config.CORS.MaxAge)
	} else {
		fmt.Printf("📋 [Config] CORS: not configured (will allow all origins *)\n")
	}

	AppConfig = &config
	return nil
}

// overrideFromEnv Overrideconfiguration
func overrideFromEnv(config *Config) {
	// DatabaseDSN
	if dsn := os.Getenv("DATABASE_DSN"); dsn != "" {
		config.Database.DSN = dsn
	}

	// server configuration
	if host := os.Getenv("SERVER_HOST"); host != "" {
		config.Server.Host = host
	}
	if port := os.Getenv("SERVER_PORT"); port != "" {
		if p, err := strconv.Atoi(port); err == nil {
			config.Server.Port = p
		}
	}

	// ZKVMConfiguration
	if zkvm := os.Getenv("ZKVM_BASE_URL"); zkvm != "" {
		config.ZKVM.BaseURL = zkvm
	}

	// NATSConfiguration
	if natsURL := os.Getenv("NATS_URL"); natsURL != "" {
		config.NATS.URL = natsURL
	}
	if natsTimeout := os.Getenv("NATS_TIMEOUT"); natsTimeout != "" {
		if t, err := strconv.Atoi(natsTimeout); err == nil {
			config.NATS.Timeout = t
		}
	}

	// RedisConfiguration
	if redisHost := os.Getenv("REDIS_HOST"); redisHost != "" {
		config.Redis.Host = redisHost
	}
	if redisPort := os.Getenv("REDIS_PORT"); redisPort != "" {
		if p, err := strconv.Atoi(redisPort); err == nil {
			config.Redis.Port = p
		}
	}
	if redisPassword := os.Getenv("REDIS_PASSWORD"); redisPassword != "" {
		config.Redis.Password = redisPassword
	}

	// ScannerConfiguration
	if scannerType := os.Getenv("SCANNER_TYPE"); scannerType != "" {
		config.Scanner.Type = scannerType
	}
	if scanner := os.Getenv("SCANNER_BASE_URL"); scanner != "" {
		config.Scanner.HTTP.BaseURL = scanner
	}

	// KMSConfiguration
	if kmsEnabled := os.Getenv("KMS_ENABLED"); kmsEnabled != "" {
		config.KMS.Enabled = kmsEnabled == "true"
	}
	if kmsServiceURL := os.Getenv("KMS_SERVICE_URL"); kmsServiceURL != "" {
		config.KMS.ServiceURL = kmsServiceURL
	}
	if kmsAuthToken := os.Getenv("KMS_AUTH_TOKEN"); kmsAuthToken != "" {
		config.KMS.AuthToken = kmsAuthToken
	}
	if kmsTimeout := os.Getenv("KMS_TIMEOUT"); kmsTimeout != "" {
		if t, err := strconv.Atoi(kmsTimeout); err == nil {
			config.KMS.Timeout = t
		}
	}

	// blockchainNetworkconfiguration
	for networkName, networkConfig := range config.Blockchain.Networks {
		// KMSconfigurationRead
		if kmsKeyAlias := os.Getenv("KMS_KEY_ALIAS"); kmsKeyAlias != "" {
			networkConfig.KMSKeyAlias = kmsKeyAlias
		} else {
			envKMSKey := fmt.Sprintf("%s_KMS_KEY_ALIAS", strings.ToUpper(networkName))
			if kmsKeyAlias := os.Getenv(envKMSKey); kmsKeyAlias != "" {
				networkConfig.KMSKeyAlias = kmsKeyAlias
			}
		}

		if kmsEnabled := os.Getenv("NETWORK_KMS_ENABLED"); kmsEnabled != "" {
			networkConfig.KMSEnabled = kmsEnabled == "true"
		}

		// Private key from environment variables (if KMS is not enabled)
		// Support both generic PRIVATE_KEY and network-specific (e.g., BSC_PRIVATE_KEY)
		if !networkConfig.KMSEnabled {
			// Try network-specific private key first (e.g., BSC_PRIVATE_KEY)
			envPrivateKey := fmt.Sprintf("%s_PRIVATE_KEY", strings.ToUpper(networkName))
			if privateKey := os.Getenv(envPrivateKey); privateKey != "" {
				networkConfig.PrivateKey = privateKey
				fmt.Printf("✅ [Config] Loaded private key for network '%s' from environment variable: %s\n", networkName, envPrivateKey)
			} else if privateKey := os.Getenv("PRIVATE_KEY"); privateKey != "" {
				// Fallback to generic PRIVATE_KEY
				networkConfig.PrivateKey = privateKey
				fmt.Printf("✅ [Config] Loaded private key for network '%s' from environment variable: PRIVATE_KEY\n", networkName)
			}
		}

		// RPC endpoints read from environment variables
		if rpcURL := os.Getenv("BSC_RPC_URL"); rpcURL != "" && networkName == "bsc" {
			networkConfig.RPCEndpoints = []string{rpcURL}
		} else {
			envRPC := fmt.Sprintf("%s_RPC_ENDPOINTS", strings.ToUpper(networkName))
			if rpcEndpoints := os.Getenv(envRPC); rpcEndpoints != "" {
				networkConfig.RPCEndpoints = strings.Split(rpcEndpoints, ",")
			}
		}

		// Get ZKPay address from global config first (it's the same for all chains)
		// Priority: Environment Variable > Global Config > Network-specific Config
		zkpayProxy := ""

		// 1. Try environment variable (highest priority)
		if envZKPay := os.Getenv("ZKPAY_PROXY"); envZKPay != "" {
			zkpayProxy = envZKPay
		} else if config.Blockchain.ZKPayProxy != "" {
			// 2. Try global blockchain config
			zkpayProxy = config.Blockchain.ZKPayProxy
		} else if networkConfig.ContractAddresses != nil {
			// 3. Fallback to network-specific config (for backward compatibility)
			if networkZKPay, exists := networkConfig.ContractAddresses["zkpay_proxy"]; exists {
				zkpayProxy = networkZKPay
			}
		}

		// Set ZKPayContract for this network
		if zkpayProxy != "" {
			networkConfig.ZKPayContract = zkpayProxy
		}
		if zkpayStorage := os.Getenv("ZKPAY_STORAGE"); zkpayStorage != "" {
			networkConfig.StorageContract = zkpayStorage
		}
		if zkpayVault := os.Getenv("ZKPAY_VAULT"); zkpayVault != "" {
			networkConfig.VaultContract = zkpayVault
		}
		if zkpayImpl := os.Getenv("ZKPAY_IMPLEMENTATION_CURRENT"); zkpayImpl != "" {
			networkConfig.ImplementationContract = zkpayImpl
		}
		if sp1Verifier := os.Getenv("SP1_VERIFIER"); sp1Verifier != "" {
			networkConfig.SP1Verifier = sp1Verifier
		}
		if usdtContract := os.Getenv("BSC_USDT"); usdtContract != "" {
			networkConfig.USDTContract = usdtContract
		}
		if multisigOwner := os.Getenv("MULTISIG_OWNER"); multisigOwner != "" {
			networkConfig.MultisigOwner = multisigOwner
		}

		// verification key hashRead
		if submitVkey := os.Getenv("SUBMIT_VKEY_HASH"); submitVkey != "" {
			networkConfig.SubmitVkeyHash = submitVkey
		}
		if withdrawVkey := os.Getenv("WITHDRAW_VKEY_HASH"); withdrawVkey != "" {
			networkConfig.WithdrawVkeyHash = withdrawVkey
		}

		// Base fee read from environment variables
		if baseFee := os.Getenv("BASE_FEE_AMOUNT"); baseFee != "" {
			networkConfig.BaseFeeAmount = baseFee
		}

		// Gas price read from environment variables
		envGasPrice := fmt.Sprintf("%s_GAS_PRICE", strings.ToUpper(networkName))
		if gasPrice := os.Getenv(envGasPrice); gasPrice != "" {
			networkConfig.GasPrice = gasPrice
		}

		// Gas limit read from environment variables
		envGasLimit := fmt.Sprintf("%s_GAS_LIMIT", strings.ToUpper(networkName))
		if gasLimit := os.Getenv(envGasLimit); gasLimit != "" {
			if limit, err := strconv.ParseUint(gasLimit, 10, 64); err == nil {
				networkConfig.GasLimit = limit
			}
		}

		// Updateconfiguration
		config.Blockchain.Networks[networkName] = networkConfig
	}

	// CORS Configuration
	if corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); corsOrigins != "" {
		// Override YAML config with environment variable
		// Split comma-separated origins
		origins := strings.Split(corsOrigins, ",")
		config.CORS.AllowedOrigins = make([]string, 0, len(origins))
		for _, origin := range origins {
			trimmed := strings.TrimSpace(origin)
			if trimmed != "" {
				config.CORS.AllowedOrigins = append(config.CORS.AllowedOrigins, trimmed)
			}
		}
	}

	// KYT Oracle Configuration
	if kytOracleURL := os.Getenv("KYT_ORACLE_BASE_URL"); kytOracleURL != "" {
		config.KYTOracle.BaseURL = kytOracleURL
	}
}

// GetNetworkConfig GetNetworkconfiguration
func GetNetworkConfig(networkName string) (*NetworkConfig, error) {
	if AppConfig == nil {
		return nil, fmt.Errorf("config not loaded")
	}

	network, exists := AppConfig.Blockchain.Networks[networkName]
	if !exists {
		return nil, fmt.Errorf("network %s not found in config", networkName)
	}

	if !network.Enabled {
		return nil, fmt.Errorf("network %s is disabled", networkName)
	}

	return &network, nil
}

// GetNetworkConfigByChainID chain IDGetNetworkconfiguration
func GetNetworkConfigByChainID(chainID int) (*NetworkConfig, error) {
	if AppConfig == nil {
		return nil, fmt.Errorf("config not loaded")
	}

	for _, network := range AppConfig.Blockchain.Networks {
		if network.ChainID == chainID && network.Enabled {
			return &network, nil
		}
	}

	return nil, fmt.Errorf("network with chainID %d not found or disabled", chainID)
}

// GetScannerURL Get Scanner service URL - configurationinterface
func GetScannerURL() string {
	if AppConfig == nil {
		// configurationnotLoadDefault
		return "http://localhost:18080"
	}

	// configuration fileRead
	if AppConfig.Scanner.HTTP.BaseURL != "" {
		return AppConfig.Scanner.HTTP.BaseURL
	}

	// Then read from environment variables
	if scannerURL := os.Getenv("SCANNER_BASE_URL"); scannerURL != "" {
		return scannerURL
	}

	// Default：Use Docker service name，Use localhost
	if os.Getenv("GIN_MODE") == "release" {
		return "http://zkpay-blockscanner:18080"
	}
	return "http://localhost:18080"
}

// GetZKVMURL Get ZKVM service URL - configurationinterface
func GetZKVMURL() string {
	if AppConfig == nil {
		return "http://localhost:18081"
	}

	if AppConfig.ZKVM.BaseURL != "" {
		return AppConfig.ZKVM.BaseURL
	}

	if zkvmURL := os.Getenv("ZKVM_BASE_URL"); zkvmURL != "" {
		return zkvmURL
	}

	if os.Getenv("GIN_MODE") == "release" {
		return "http://zkpay-zkvm:18081"
	}
	return "http://localhost:18081"
}
