/**
 * 部署配置工具
 * 从 result_xxx.json 文件读取合约地址
 */

/**
 * 部署结果 JSON 文件类型
 */
export interface DeploymentResult {
  network: string
  chainId: string
  deployer: string
  timestamp: string
  contracts: {
    DepositVault?: {
      address: string
      owner: string
      defaultLendingDelegate: string
      defaultLendingTarget: string
      recoveryDelay: string
    }
    AAVEv3Delegate?: {
      address: string
    }
    [key: string]: {
      address: string
      [key: string]: unknown
    } | undefined
  }
  configuration?: {
    [key: string]: string
  }
}

/**
 * ChainId 到网络名称的映射
 * 支持多种 chainId 格式（十进制、SLIP-44、EVM 兼容格式）
 */
const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  1: 'eth',        // Ethereum Mainnet
  56: 'bsc',       // BSC Mainnet
  137: 'polygon',  // Polygon
  195: 'tron',     // TRON (SLIP-44)
  714: 'bsc',      // BSC (SLIP-44)
  966: 'polygon',  // Polygon (SLIP-44)
  728126428: 'tron', // TRON (EVM-compatible: 0x2b6653dc)
}

/**
 * 根据 chainId 获取网络名称
 */
export function getNetworkNameFromChainId(chainId: number): string | null {
  return CHAIN_ID_TO_NETWORK[chainId] || null
}

/**
 * 从部署结果 JSON 文件读取合约地址
 * @param chainId 链 ID
 * @returns 部署结果对象，如果未找到则返回 null
 */
export async function loadDeploymentConfig(
  chainId: number
): Promise<DeploymentResult | null> {
  try {
    const networkName = getNetworkNameFromChainId(chainId)
    if (!networkName) {
      console.warn(`未找到 chainId ${chainId} 对应的网络名称`)
      return null
    }

    // 从 public/deployed/ 目录读取 JSON 文件
    const response = await fetch(`/deployed/result_${networkName}.json`)
    
    if (!response.ok) {
      console.warn(`未找到部署配置文件: result_${networkName}.json`)
      return null
    }

    const data = await response.json() as DeploymentResult
    return data
  } catch (error) {
    console.error(`加载部署配置失败 (chainId: ${chainId}):`, error)
    return null
  }
}

/**
 * 从部署配置获取 DepositVault 地址
 * @param chainId 链 ID
 * @returns DepositVault 地址，如果未找到则返回 null
 */
export async function getDepositVaultAddressFromConfig(
  chainId: number
): Promise<string | null> {
  const config = await loadDeploymentConfig(chainId)
  if (!config) {
    return null
  }

  return config.contracts.DepositVault?.address || null
}

/**
 * 从部署配置获取指定合约地址
 * @param chainId 链 ID
 * @param contractName 合约名称（如 "DepositVault", "AAVEv3Delegate"）
 * @returns 合约地址，如果未找到则返回 null
 */
export async function getContractAddressFromConfig(
  chainId: number,
  contractName: string
): Promise<string | null> {
  const config = await loadDeploymentConfig(chainId)
  if (!config) {
    return null
  }

  return config.contracts[contractName]?.address || null
}
