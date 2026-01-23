/**
 * TRON Energy 估算工具
 * 根据交易类型和参数动态估算所需的 Energy
 * 
 * 提供三种估算方式：
 * 1. 使用 TRON 官方 API（最准确）
 * 2. 基于代码分析（理论估算）
 * 3. 使用配置的估算值（回退方案）
 */

/**
 * 估算授权操作所需的 Energy
 * 
 * 授权操作的 Energy 需求主要取决于：
 * 1. 合约的复杂度（USDT 标准合约相对简单）
 * 2. 交易的数据大小（approve 方法通常需要 ~200 bytes）
 * 3. 合约的存储操作（如果合约需要更新状态）
 * 
 * 基于 TRON 网络的实际情况：
 * - USDT (TRC20) 授权：通常需要 30,000-50,000 Energy
 * - 复杂合约授权：可能需要 50,000-80,000 Energy
 * 
 * @param tokenAddress Token 合约地址（可选，用于识别特定合约）
 * @param amount 授权金额（可选，用于更精确的估算）
 * @returns 估算的 Energy 需求
 */
export function estimateApproveEnergy(
  tokenAddress?: string,
  amount?: bigint | string
): number {
  // 如果配置了环境变量，优先使用
  const envEnergy = process.env.NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY
  if (envEnergy) {
    const parsed = parseInt(envEnergy, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }

  // 根据 Token 地址识别常见合约
  if (tokenAddress) {
    const address = tokenAddress.toLowerCase()
    
    // USDT (TRC20) - 标准合约，相对简单
    if (address === 'tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t' || 
        address === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') {
      // USDT 授权通常需要 30,000-40,000 Energy
      return 35000
    }
    
    // 其他标准 TRC20 合约
    // 可以根据实际测试结果添加更多合约的估算值
  }

  // 默认值：基于 USDT 标准合约的估算
  // 这个值比之前的 65000 更合理，因为授权操作通常比存入操作简单
  return 40000
}

/**
 * 估算授权操作所需的 Bandwidth
 * 
 * 授权操作的 Bandwidth 需求主要取决于：
 * 1. 交易的数据大小（approve 方法通常需要 ~200 bytes）
 * 2. 签名大小（~65 bytes）
 * 
 * @returns 估算的 Bandwidth 需求
 */
export function estimateApproveBandwidth(): number {
  // 如果配置了环境变量，优先使用
  const envBandwidth = process.env.NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH
  if (envBandwidth) {
    const parsed = parseInt(envBandwidth, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }

  // 默认值：授权操作通常需要 200-300 Bandwidth
  return 300
}

/**
 * 根据授权金额动态调整 Energy 需求
 * 
 * 虽然授权操作的 Energy 主要取决于合约复杂度，但某些合约可能会根据
 * 授权金额进行不同的处理，导致 Energy 需求略有变化。
 * 
 * @param baseEnergy 基础 Energy 需求
 * @param amount 授权金额
 * @returns 调整后的 Energy 需求
 */
export function adjustEnergyByAmount(
  baseEnergy: number,
  amount: bigint | string
): number {
  // 对于标准 TRC20 合约，授权金额通常不影响 Energy 需求
  // 但为了安全起见，可以添加一个小的缓冲（5%）
  return Math.ceil(baseEnergy * 1.05)
}

/**
 * Energy 估算结果
 */
export interface EnergyEstimateResult {
  energy: number // 估算的 Energy 需求
  bandwidth?: number // 估算的 Bandwidth 需求（如果可用）
  source: 'api' | 'fallback' // 数据来源：API 或回退值
  error?: string // 错误信息（如果估算失败）
}

/**
 * 使用 TRON 官方 API 估算 DepositVault.deposit 函数的 Energy 消耗
 * 
 * 优先使用 TronWeb 的 estimateEnergy API，如果不可用则回退到估算值
 * 
 * @param contractAddress DepositVault 合约地址（Base58 格式）
 * @param tokenAddress 代币地址（Base58 格式）
 * @param amount 存入金额（字符串格式，如 "1000000" 表示 1 USDT，6位精度）
 * @param intendedRecipient 预期接收地址（Base58 格式）
 * @param ownerAddress 调用者地址（Base58 格式，可选，如果不提供则从钱包获取）
 * @returns Energy 估算结果
 */
export async function estimateDepositEnergy(
  contractAddress: string,
  tokenAddress: string,
  amount: string | bigint,
  intendedRecipient: string,
  ownerAddress?: string
): Promise<EnergyEstimateResult> {
  // 回退值：从环境变量或默认值获取
  const fallbackEnergy = 
    parseInt(process.env.NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY || '0', 10) ||
    196201 // 默认值（根据代码注释）
  
  const fallbackBandwidth = 
    parseInt(process.env.NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH || '0', 10) ||
    400 // 默认值

  // 检查是否在浏览器环境
  if (typeof window === 'undefined') {
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: 'estimateDepositEnergy 只能在浏览器环境中使用'
    }
  }

  // 获取 TronWeb 实例
  const tronWeb = (window as any).tronWeb || (window as any).tronLink?.tronWeb
  if (!tronWeb) {
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: 'TronWeb 不可用。请确保已安装 TronLink 或其他 TronWeb 兼容的钱包。'
    }
  }

  // 获取调用者地址
  let callerAddress = ownerAddress
  if (!callerAddress) {
    try {
      callerAddress = tronWeb.defaultAddress?.base58
      if (!callerAddress) {
        // 尝试从钱包获取
        const accounts = await (window as any).tronLink?.request({ method: 'tron_requestAccounts' })
        if (accounts && accounts.length > 0) {
          callerAddress = accounts[0]
        }
      }
    } catch (err) {
      console.warn('无法获取调用者地址:', err)
    }
  }

  if (!callerAddress) {
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: '无法获取调用者地址'
    }
  }

  try {
    // 转换地址格式（Base58 -> hex）
    const contractAddressHex = tronWeb.address.toHex(contractAddress)
    const tokenAddressHex = tronWeb.address.toHex(tokenAddress)
    const recipientAddressHex = tronWeb.address.toHex(intendedRecipient)
    const ownerAddressHex = tronWeb.address.toHex(callerAddress)

    // 转换金额格式
    const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount
    const amountHex = '0x' + amountBigInt.toString(16).padStart(64, '0')

    // 准备函数参数
    // deposit(address token, uint256 amount, address intendedRecipient)
    const parameters = [
      { type: 'address', value: tokenAddressHex },
      { type: 'uint256', value: amountHex },
      { type: 'address', value: recipientAddressHex }
    ]

    // 尝试使用 estimateEnergy API（如果支持）
    if (tronWeb.transactionBuilder?.estimateEnergy) {
      try {
        const result = await tronWeb.transactionBuilder.estimateEnergy(
          contractAddressHex,
          'deposit(address,uint256,address)',
          {},
          parameters,
          ownerAddressHex
        )

        if (result?.result?.result && result.energy_required) {
          const energy = parseInt(result.energy_required.toString(), 10)
          // 添加 10% 的安全缓冲
          const energyWithBuffer = Math.ceil(energy * 1.1)

          return {
            energy: energyWithBuffer,
            bandwidth: fallbackBandwidth, // estimateEnergy 不返回 bandwidth
            source: 'api'
          }
        }
      } catch (estimateError: any) {
        console.warn('estimateEnergy API 不可用，尝试使用 triggerConstantContract:', estimateError.message)
        // 继续尝试 triggerConstantContract
      }
    }

    // 回退到 triggerConstantContract（更广泛支持）
    if (tronWeb.transactionBuilder?.triggerConstantContract) {
      try {
        const result = await tronWeb.transactionBuilder.triggerConstantContract(
          contractAddressHex,
          'deposit(address,uint256,address)',
          {},
          parameters,
          ownerAddressHex
        )

        if (result?.result?.result) {
          // triggerConstantContract 返回 energy_used
          const energyUsed = result.energy_used || result.EnergyUsed
          if (energyUsed) {
            const energy = parseInt(energyUsed.toString(), 10)
            // 添加 10% 的安全缓冲
            const energyWithBuffer = Math.ceil(energy * 1.1)

            return {
              energy: energyWithBuffer,
              bandwidth: fallbackBandwidth, // triggerConstantContract 可能不返回 bandwidth
              source: 'api'
            }
          }
        }
      } catch (triggerError: any) {
        console.warn('triggerConstantContract 调用失败:', triggerError.message)
        // 继续使用回退值
      }
    }

    // 如果所有 API 都失败，使用回退值
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: 'TRON API 不可用，使用回退估算值'
    }
  } catch (error: any) {
    console.error('估算 Energy 时发生错误:', error)
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: error.message || '未知错误'
    }
  }
}

/**
 * 使用 TRON 官方 API 估算 ERC20 approve 函数的 Energy 消耗
 * 
 * @param tokenAddress 代币合约地址（Base58 格式）
 * @param spenderAddress 授权给的目标地址（Base58 格式）
 * @param amount 授权金额（字符串格式）
 * @param ownerAddress 调用者地址（Base58 格式，可选）
 * @returns Energy 估算结果
 */
export async function estimateApproveEnergyWithAPI(
  tokenAddress: string,
  spenderAddress: string,
  amount: string | bigint,
  ownerAddress?: string
): Promise<EnergyEstimateResult> {
  // 回退值
  const fallbackEnergy = estimateApproveEnergy(tokenAddress, amount)
  const fallbackBandwidth = estimateApproveBandwidth()

  // 检查是否在浏览器环境
  if (typeof window === 'undefined') {
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: 'estimateApproveEnergyWithAPI 只能在浏览器环境中使用'
    }
  }

  // 获取 TronWeb 实例
  const tronWeb = (window as any).tronWeb || (window as any).tronLink?.tronWeb
  if (!tronWeb) {
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: 'TronWeb 不可用'
    }
  }

  // 获取调用者地址
  let callerAddress = ownerAddress
  if (!callerAddress) {
    try {
      callerAddress = tronWeb.defaultAddress?.base58
    } catch (err) {
      console.warn('无法获取调用者地址:', err)
    }
  }

  if (!callerAddress) {
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: '无法获取调用者地址'
    }
  }

  try {
    // 转换地址格式
    const tokenAddressHex = tronWeb.address.toHex(tokenAddress)
    const spenderAddressHex = tronWeb.address.toHex(spenderAddress)
    const ownerAddressHex = tronWeb.address.toHex(callerAddress)

    // 转换金额格式
    const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount
    const amountHex = '0x' + amountBigInt.toString(16).padStart(64, '0')

    // approve(address spender, uint256 amount)
    const parameters = [
      { type: 'address', value: spenderAddressHex },
      { type: 'uint256', value: amountHex }
    ]

    // 尝试使用 estimateEnergy API
    if (tronWeb.transactionBuilder?.estimateEnergy) {
      try {
        const result = await tronWeb.transactionBuilder.estimateEnergy(
          tokenAddressHex,
          'approve(address,uint256)',
          {},
          parameters,
          ownerAddressHex
        )

        if (result?.result?.result && result.energy_required) {
          const energy = parseInt(result.energy_required.toString(), 10)
          const energyWithBuffer = Math.ceil(energy * 1.1)

          return {
            energy: energyWithBuffer,
            bandwidth: fallbackBandwidth,
            source: 'api'
          }
        }
      } catch (estimateError: any) {
        console.warn('estimateEnergy API 不可用:', estimateError.message)
      }
    }

    // 回退到 triggerConstantContract
    if (tronWeb.transactionBuilder?.triggerConstantContract) {
      try {
        const result = await tronWeb.transactionBuilder.triggerConstantContract(
          tokenAddressHex,
          'approve(address,uint256)',
          {},
          parameters,
          ownerAddressHex
        )

        if (result?.result?.result) {
          const energyUsed = result.energy_used || result.EnergyUsed
          if (energyUsed) {
            const energy = parseInt(energyUsed.toString(), 10)
            const energyWithBuffer = Math.ceil(energy * 1.1)

            return {
              energy: energyWithBuffer,
              bandwidth: fallbackBandwidth,
              source: 'api'
            }
          }
        }
      } catch (triggerError: any) {
        console.warn('triggerConstantContract 调用失败:', triggerError.message)
      }
    }

    // 使用回退值
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: 'TRON API 不可用，使用回退估算值'
    }
  } catch (error: any) {
    console.error('估算 approve Energy 时发生错误:', error)
    return {
      energy: fallbackEnergy,
      bandwidth: fallbackBandwidth,
      source: 'fallback',
      error: error.message || '未知错误'
    }
  }
}

/**
 * 使用代码分析估算 DepositVault.deposit 的 Energy
 * 
 * 基于对 Solidity 代码的分析，计算理论上的 Energy 消耗
 * 这是一个静态分析，不依赖网络调用
 * 
 * @param includeDelegatecallSupply 是否包含 delegatecall supply 的消耗（默认 true）
 * @returns Energy 估算值
 */
export function estimateDepositEnergyByCodeAnalysis(
  includeDelegatecallSupply: boolean = true
): number {
  // 动态导入代码分析工具（避免循环依赖）
  try {
    const { getCodeBasedEnergyEstimate } = require('./tron-energy-code-analyzer')
    return getCodeBasedEnergyEstimate('deposit', { includeDelegatecallSupply })
  } catch (error) {
    // 如果导入失败，使用回退值
    console.warn('代码分析工具不可用，使用回退值:', error)
    return parseInt(
      process.env.NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY || '196201',
      10
    )
  }
}

/**
 * 使用代码分析估算 approve 的 Energy
 * 
 * @param tokenComplexity 代币合约复杂度
 * @returns Energy 估算值
 */
export function estimateApproveEnergyByCodeAnalysis(
  tokenComplexity: 'simple' | 'standard' | 'complex' = 'standard'
): number {
  try {
    const { getCodeBasedEnergyEstimate } = require('./tron-energy-code-analyzer')
    return getCodeBasedEnergyEstimate('approve', { tokenComplexity })
  } catch (error) {
    console.warn('代码分析工具不可用，使用回退值:', error)
    return estimateApproveEnergy()
  }
}
