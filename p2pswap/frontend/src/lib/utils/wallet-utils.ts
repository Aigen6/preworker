// EVM 链类型
export type EVMNetwork = "ethereum" | "bnb" | "polygon"

// 非 EVM 链类型
export type NonEVMNetwork = "tron"

// 所有网络类型
export type Network = EVMNetwork | NonEVMNetwork

export interface NetworkInfo {
  id: string
  name: string
  chainId: number
  isEVM: boolean // 标识是否为 EVM 兼容链
}

// TRON 使用特殊的标识符（不是标准的 chainId）
export const TRON_CHAIN_ID = 195

// 所有 chainId 到 Network 的映射（包含 EVM 和非 EVM）
export const CHAIN_ID_TO_NETWORK: Record<number, Network> = {
  1: "ethereum",
  56: "bnb",
  137: "polygon",
  195: "tron", // TRON 不是 EVM 链，但使用 chainId 195 作为标识
}

// 所有支持的网络列表
export const NETWORKS: NetworkInfo[] = [
  {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    isEVM: true,
  },
  {
    id: "bnb",
    name: "BNB Chain",
    chainId: 56,
    isEVM: true,
  },
  {
    id: "polygon",
    name: "Polygon",
    chainId: 137,
    isEVM: true,
  },
  {
    id: "tron",
    name: "TRON",
    chainId: 195,
    isEVM: false,
  },
]

// 判断是否为 EVM 链
export function isEVMNetwork(network: Network): boolean {
  return network !== "tron"
}

// 判断 chainId 是否为 EVM 链
export function isEVMChainId(chainId: number): boolean {
  return chainId !== TRON_CHAIN_ID
}

// chainId 到 Network 的转换
export function chainIdToNetwork(chainId: number): Network | null {
  return CHAIN_ID_TO_NETWORK[chainId] || null
}

// 获取网络信息
export function getNetworkInfo(networkId: Network): NetworkInfo {
  return NETWORKS.find(n => n.id === networkId) || NETWORKS[0]
}

// MetaMask 网络配置（用于添加到钱包）
export interface MetaMaskChainConfig {
  chainId: string // 十六进制格式
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: string[]
  blockExplorerUrls: string[]
}

// 获取 MetaMask 网络配置（硬编码配置，不再依赖 wallet SDK）
export function getMetaMaskChainConfig(chainId: number): MetaMaskChainConfig | null {
  const configs: Record<number, MetaMaskChainConfig> = {
    1: {
      chainId: '0x1',
      chainName: 'Ethereum Mainnet',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://eth.llamarpc.com'],
      blockExplorerUrls: ['https://etherscan.io'],
    },
    56: {
      chainId: '0x38',
      chainName: 'BNB Smart Chain',
      nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18,
      },
      rpcUrls: ['https://bsc-dataseed1.binance.org'],
      blockExplorerUrls: ['https://bscscan.com'],
    },
    714: {
      chainId: '0x2ca',
      chainName: 'BNB Smart Chain',
      nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18,
      },
      rpcUrls: ['https://bsc-dataseed1.binance.org'],
      blockExplorerUrls: ['https://bscscan.com'],
    },
  }

  return configs[chainId] || null
}

// 格式化地址显示
export function formatAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
