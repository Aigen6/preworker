package utils

import "fmt"

// ChainInfo 链信息
type ChainInfo struct {
	SLIP44ChainID uint32   `json:"slip44_chain_id"` // SLIP-44 Chain ID (数据库使用)
	NativeChainID uint32   `json:"native_chain_id"` // Native Chain ID (RPC 使用)
	Name          string   `json:"name"`            // 链名称
	Symbol        string   `json:"symbol"`          // 原生代币符号
	IsEVM         bool     `json:"is_evm"`          // 是否 EVM 兼容
	RPCEndpoints  []string `json:"rpc_endpoints"`   // RPC 端点列表
	ExplorerURL   string   `json:"explorer_url"`    // 区块链浏览器
}

// ChainRegistry 链注册表
type ChainRegistry struct {
	bySlip44 map[uint32]*ChainInfo
	byNative map[uint32]*ChainInfo
}

// GlobalChainRegistry 全局链注册表
var GlobalChainRegistry *ChainRegistry

func init() {
	GlobalChainRegistry = &ChainRegistry{
		bySlip44: make(map[uint32]*ChainInfo),
		byNative: make(map[uint32]*ChainInfo),
	}

	// 注册所有支持的链
	chains := []*ChainInfo{
		// 官方 SLIP-44
		{
			SLIP44ChainID: 60,
			NativeChainID: 1,
			Name:          "Ethereum",
			Symbol:        "ETH",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://eth.llamarpc.com", "https://rpc.ankr.com/eth"},
			ExplorerURL:   "https://etherscan.io",
		},
		{
			SLIP44ChainID: 714,
			NativeChainID: 56,
			Name:          "BSC",
			Symbol:        "BNB",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://bsc-dataseed1.binance.org", "https://bsc-dataseed2.binance.org"},
			ExplorerURL:   "https://bscscan.com",
		},
		{
			SLIP44ChainID: 966,
			NativeChainID: 137,
			Name:          "Polygon",
			Symbol:        "MATIC",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://polygon-rpc.com", "https://rpc.ankr.com/polygon"},
			ExplorerURL:   "https://polygonscan.com",
		},
		{
			SLIP44ChainID: 195,
			NativeChainID: 195,
			Name:          "Tron",
			Symbol:        "TRX",
			IsEVM:         false,
			RPCEndpoints:  []string{"https://api.trongrid.io"},
			ExplorerURL:   "https://tronscan.org",
		},

		// 自定义 SLIP-44 (Layer 2: 1000000 + Native Chain ID)
		{
			SLIP44ChainID: 1042161,
			NativeChainID: 42161,
			Name:          "Arbitrum",
			Symbol:        "ETH",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://arb1.arbitrum.io/rpc", "https://rpc.ankr.com/arbitrum"},
			ExplorerURL:   "https://arbiscan.io",
		},
		{
			SLIP44ChainID: 1000010,
			NativeChainID: 10,
			Name:          "Optimism",
			Symbol:        "ETH",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://mainnet.optimism.io", "https://rpc.ankr.com/optimism"},
			ExplorerURL:   "https://optimistic.etherscan.io",
		},
		{
			SLIP44ChainID: 1008453,
			NativeChainID: 8453,
			Name:          "Base",
			Symbol:        "ETH",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://mainnet.base.org", "https://base.llamarpc.com"},
			ExplorerURL:   "https://basescan.org",
		},
		{
			SLIP44ChainID: 1000324,
			NativeChainID: 324,
			Name:          "zkSync Era",
			Symbol:        "ETH",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://mainnet.era.zksync.io"},
			ExplorerURL:   "https://explorer.zksync.io",
		},
		{
			SLIP44ChainID: 9000,
			NativeChainID: 43114,
			Name:          "Avalanche",
			Symbol:        "AVAX",
			IsEVM:         true,
			RPCEndpoints:  []string{"https://api.avax.network/ext/bc/C/rpc"},
			ExplorerURL:   "https://snowtrace.io",
		},
	}

	// 构建索引
	for _, chain := range chains {
		GlobalChainRegistry.bySlip44[chain.SLIP44ChainID] = chain
		GlobalChainRegistry.byNative[chain.NativeChainID] = chain
	}
}

// GetBySlip44 通过 SLIP-44 Chain ID 查询
func (r *ChainRegistry) GetBySlip44(slip44 uint32) (*ChainInfo, bool) {
	info, ok := r.bySlip44[slip44]
	return info, ok
}

// GetByNative 通过 Native Chain ID 查询
func (r *ChainRegistry) GetByNative(native uint32) (*ChainInfo, bool) {
	info, ok := r.byNative[native]
	return info, ok
}

// SLIP44ToNative SLIP-44 转 Native Chain ID
func (r *ChainRegistry) SLIP44ToNative(slip44 uint32) (uint32, error) {
	info, ok := r.GetBySlip44(slip44)
	if !ok {
		return 0, fmt.Errorf("unsupported SLIP-44 chain ID: %d", slip44)
	}
	return info.NativeChainID, nil
}

// NativeToSLIP44 Native 转 SLIP-44 Chain ID
func (r *ChainRegistry) NativeToSLIP44(native uint32) (uint32, error) {
	info, ok := r.GetByNative(native)
	if !ok {
		return 0, fmt.Errorf("unsupported native chain ID: %d", native)
	}
	return info.SLIP44ChainID, nil
}

// GetRPCEndpoint 获取 RPC 端点
func (r *ChainRegistry) GetRPCEndpoint(slip44 uint32) (string, error) {
	info, ok := r.GetBySlip44(slip44)
	if !ok || len(info.RPCEndpoints) == 0 {
		return "", fmt.Errorf("no RPC endpoint for chain: %d", slip44)
	}
	return info.RPCEndpoints[0], nil
}

// GetAllChains 获取所有链信息
func (r *ChainRegistry) GetAllChains() []*ChainInfo {
	chains := make([]*ChainInfo, 0, len(r.bySlip44))
	for _, chain := range r.bySlip44 {
		chains = append(chains, chain)
	}
	return chains
}

// IsEVMCompatible 检查是否 EVM 兼容
func (r *ChainRegistry) IsEVMCompatible(slip44 uint32) bool {
	info, ok := r.GetBySlip44(slip44)
	return ok && info.IsEVM
}

