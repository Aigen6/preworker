/**
 * TRON RPC 读取工具
 * 使用自定义 RPC URL 读取 TRON 合约，避免使用钱包的默认 RPC（可能限流）
 */

/**
 * TRON API 速率限制器
 * 确保每次 API 调用之间至少间隔指定时间（默认 100ms）
 */
class TronApiRateLimiter {
  private lastCallTime = 0
  private readonly minInterval: number

  constructor(minIntervalMs: number = 100) {
    this.minInterval = minIntervalMs
  }

  /**
   * 等待直到可以进行下一次 API 调用
   */
  async waitForNextCall(): Promise<void> {
    const now = Date.now()
    const timeSinceLastCall = now - this.lastCallTime
    
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    
    this.lastCallTime = Date.now()
  }
}

// 全局速率限制器实例
const tronApiRateLimiter = new TronApiRateLimiter(100) // 100ms = 0.1秒

/**
 * 获取 TRON 查询 RPC URL
 * 优先从环境变量读取，如果没有则使用默认值
 * 
 * 支持的格式：
 * - REST API: https://api.trongrid.io (会自动添加 /wallet 前缀)
 * - JSON-RPC: https://api.trongrid.io/jsonrpc
 * - 其他 RPC: https://lb.drpc.live/tron/xxx
 * 
 * 注意：Pocket Network (https://tron.api.pocket.network) 可能不稳定，已移除
 */
export function getTronQueryRpcUrl(): string {
  // 静态访问环境变量，确保 webpack 可以正确注入
  const rpcUrl = 
    process.env.NEXT_PUBLIC_TRON_QUERY_RPC_URL ||
    'https://api.trongrid.io' // 使用 TronGrid 官方 RPC（最稳定）
  
  return rpcUrl
}

/**
 * 创建自定义 TronWeb 实例（用于查询，不用于交易）
 * 使用自定义 RPC URL，避免使用钱包的默认 RPC（可能限流）
 */
export function createQueryTronWeb(): any {
  if (typeof window === 'undefined') {
    throw new Error('createQueryTronWeb 只能在浏览器环境中使用')
  }

  const queryRpcUrl = getTronQueryRpcUrl()
  
  // 尝试从钱包实例获取 TronWeb 类
  const walletTronWeb = (window as any).tronWeb || (window as any).tronLink?.tronWeb
  
  if (walletTronWeb) {
    // 使用钱包的 TronWeb 类，但创建新实例（使用自定义 RPC）
    try {
      const TronWebClass = walletTronWeb.constructor
      const queryTronWeb = new TronWebClass({
        fullHost: queryRpcUrl,
      })
      return queryTronWeb
    } catch (err) {
      console.warn('无法从钱包实例创建 TronWeb，回退到钱包的默认实例:', err)
      // 如果创建失败，回退到钱包的默认实例
      return walletTronWeb
    }
  }
  
  // 尝试使用全局 TronWeb 类
  const TronWeb = (window as any).TronWeb
  if (TronWeb) {
    try {
      return new TronWeb({
        fullHost: queryRpcUrl,
      })
    } catch (err) {
      console.warn('无法使用全局 TronWeb 创建实例，尝试使用默认配置:', err)
      // 如果创建失败，尝试使用默认配置
      return new TronWeb()
    }
  }
  
  // 如果都不可用，抛出错误
  throw new Error('TronWeb 不可用。请确保已安装 TronLink 或其他 TronWeb 兼容的钱包。')
}

/**
 * 使用自定义 RPC 读取 TRON 合约
 * 通过直接调用 TRON API 的 triggerconstantcontract 方法
 */
export async function readTronContractWithCustomRpc(
  contractAddress: string,
  functionName: string,
  args: any[] = [],
  abi?: any[]
): Promise<any> {
  // 等待速率限制（每次 TRON API 调用之间至少间隔 0.1 秒）
  await tronApiRateLimiter.waitForNextCall()
  
  const rpcUrl = getTronQueryRpcUrl()
  
  // 如果没有 ABI，尝试使用标准的 ERC20/TRC20 函数选择器
  // 这里我们使用 TRON API 的 triggerconstantcontract
  // 需要将函数名和参数编码为 data
  
  // 对于常见的 ERC20/TRC20 函数，我们可以直接使用函数选择器
  const functionSelectors: Record<string, string> = {
    'balanceOf': '0x70a08231', // balanceOf(address)
    'allowance': '0xdd62ed3e', // allowance(address,address)
    'decimals': '0x313ce567', // decimals()
    'symbol': '0x95d89b41', // symbol()
    'name': '0x06fdde03', // name()
    'totalSupply': '0x18160ddd', // totalSupply()
  }
  
  // 获取函数选择器
  const selector = functionSelectors[functionName]
  if (!selector) {
    throw new Error(`不支持的函数: ${functionName}。请提供 ABI 以支持更多函数。`)
  }
  
  // 编码参数（简单实现，仅支持 address 类型）
  let data = selector
  if (args.length > 0) {
    // 对于 address 参数，转换为 hex 格式（移除 0x，补齐到 64 字符）
    for (const arg of args) {
      let hexArg: string
      if (typeof arg === 'string') {
        // 如果是 TRON Base58 地址，需要转换为 hex
        // 这里假设已经是 hex 格式或 Base58 格式
        if (arg.startsWith('T') && arg.length === 34) {
          // Base58 地址，需要转换（这里简化处理，实际应该使用 tronweb 转换）
          // 为了简化，我们假设前端已经提供了 hex 格式
          throw new Error('Base58 地址需要转换为 hex 格式。请使用 tronWeb.address.toHex() 转换。')
        } else if (arg.startsWith('0x')) {
          hexArg = arg.slice(2).padStart(64, '0')
        } else {
          hexArg = arg.padStart(64, '0')
        }
      } else {
        // 数字类型，转换为 hex
        hexArg = BigInt(arg).toString(16).padStart(64, '0')
      }
      data += hexArg
    }
  }
  
  // 调用 TRON API 的 triggerconstantcontract
  // 注意：这里需要调用者的地址，但我们只是查询，可以使用零地址
  const callerAddress = '410000000000000000000000000000000000000000' // 零地址的 hex 格式
  
  const response = await fetch(`${rpcUrl}/wallet/triggerconstantcontract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      owner_address: callerAddress,
      contract_address: contractAddress,
      function_selector: functionName,
      parameter: data.slice(10), // 移除 0x 前缀
      visible: true,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`TRON API 请求失败: ${response.status}`)
  }
  
  const result = await response.json()
  
  if (result.result && result.constant_result && result.constant_result.length > 0) {
    // 返回解码后的结果（这里简化处理，实际应该根据 ABI 解码）
    return result.constant_result[0]
  }
  
  throw new Error('合约调用失败: ' + JSON.stringify(result))
}

/**
 * 使用自定义 RPC 读取 TRON 账户余额（USDT/TRC20）
 * 优先使用自定义 RPC，如果失败（CORS 等）则回退到钱包的默认 RPC
 */
export async function readTronTokenBalance(
  tokenAddress: string,
  ownerAddress: string
): Promise<bigint> {
  // 等待速率限制（每次 TRON API 调用之间至少间隔 0.1 秒）
  await tronApiRateLimiter.waitForNextCall()
  
  // 获取钱包的 TronWeb 实例（用于地址转换和回退）
  let walletTronWeb: any = null
  if (typeof window !== 'undefined') {
    walletTronWeb = (window as any).tronWeb || (window as any).tronLink?.tronWeb
  }
  
  if (!walletTronWeb) {
    throw new Error('需要 TronWeb 来转换地址格式。请确保已安装 TronLink 或其他 TronWeb 兼容的钱包。')
  }
  
  // 将 Base58 地址转换为 hex（使用钱包的 TronWeb 实例）
  const ownerAddressHex = walletTronWeb.address.toHex(ownerAddress)
  const contractAddressHex = walletTronWeb.address.toHex(tokenAddress)
  
  // 优先尝试使用自定义 RPC（如果配置了且不是默认值）
  const queryRpcUrl = getTronQueryRpcUrl()
  const defaultRpcUrl = 'https://api.trongrid.io'
  const useCustomRpc = queryRpcUrl && queryRpcUrl !== defaultRpcUrl
  
  if (useCustomRpc) {
    try {
      // 创建用于查询的自定义 TronWeb 实例（使用自定义 RPC）
      const queryTronWeb = createQueryTronWeb()
      
      // 使用自定义 TronWeb 实例读取合约余额
      const contract = await queryTronWeb.contract().at(tokenAddress)
      const balance = await contract.balanceOf(ownerAddress).call()
      
      // 转换为 BigInt
      return BigInt(balance.toString())
    } catch (error: any) {
      // 如果自定义 RPC 失败（可能是 CORS 问题、400 错误等），回退到钱包的默认 RPC
      const errorMessage = error?.message || String(error)
      const errorString = String(error)
      const isCorsError = errorMessage.includes('CORS') || 
                          errorMessage.includes('Network Error') ||
                          errorMessage.includes('Access-Control-Allow-Origin')
      const isBadRequest = errorMessage.includes('400') || 
                          errorString.includes('400') ||
                          errorMessage.includes('Bad Request')
      
      if (isCorsError) {
        console.warn('⚠️ 自定义 RPC 遇到 CORS 问题，回退到钱包的默认 RPC:', errorMessage)
      } else if (isBadRequest) {
        console.warn('⚠️ 自定义 RPC 返回 400 错误（可能不支持该端点），回退到钱包的默认 RPC:', errorMessage)
      } else {
        console.warn('⚠️ 自定义 RPC 失败，回退到钱包的默认 RPC:', errorMessage)
      }
      
      // 回退到使用钱包的默认 RPC
      try {
        const contract = await walletTronWeb.contract().at(tokenAddress)
        const balance = await contract.balanceOf(ownerAddress).call()
        return BigInt(balance.toString())
      } catch (fallbackError: any) {
        throw new Error(`读取余额失败（自定义 RPC 和钱包 RPC 都失败）: ${fallbackError?.message || '未知错误'}`)
      }
    }
  } else {
    // 如果没有配置自定义 RPC，直接使用钱包的默认 RPC
    try {
      const contract = await walletTronWeb.contract().at(tokenAddress)
      const balance = await contract.balanceOf(ownerAddress).call()
      return BigInt(balance.toString())
    } catch (error: any) {
      throw new Error(`读取余额失败: ${error?.message || '未知错误'}`)
    }
  }
}
