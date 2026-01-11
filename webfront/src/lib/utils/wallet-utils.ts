import { getChainInfo } from '@enclave-hq/wallet-sdk'

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

// 获取 MetaMask 网络配置（从 SDK 获取配置）
export function getMetaMaskChainConfig(chainId: number): MetaMaskChainConfig | null {
  const chainInfo = getChainInfo(chainId)
  
  if (!chainInfo) {
    return null
  }

  // 将 chainId 转换为十六进制格式（MetaMask 要求）
  const hexChainId = `0x${chainId.toString(16)}`

  return {
    chainId: hexChainId,
    chainName: chainInfo.name,
    nativeCurrency: chainInfo.nativeCurrency,
    rpcUrls: chainInfo.rpcUrls,
    blockExplorerUrls: chainInfo.blockExplorerUrls || [],
  }
}

// 格式化地址显示
export function formatAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
