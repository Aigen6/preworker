/**
 * TRON 网络不同操作所需的 Energy 和 Bandwidth 配置
 * 
 * ⚠️ 重要提示：
 * 这些默认值是基于一般经验的估算值，并非从实际合约测试中获取。
 * 建议通过以下方式获取准确值：
 * 1. 在 TRON 浏览器（如 TronScan）上查询实际交易的 Energy 消耗
 * 2. 进行实际测试，记录真实交易的能量消耗
 * 3. 根据 JustLending 合约的实际调用情况调整
 * 
 * 这些值可以从环境变量读取（.env.local），如果没有配置则使用默认值
 * 环境变量格式：NEXT_PUBLIC_TRON_ENERGY_<OPERATION>_ENERGY 和 NEXT_PUBLIC_TRON_ENERGY_<OPERATION>_BANDWIDTH
 * 
 * 例如：
 * NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY=65000
 * NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH=300
 * 
 * 注意：修改 .env.local 后需要重启开发服务器才能生效
 */

export type TronOperationType =
  | 'approve' // 授权操作
  | 'justlending-supply' // JustLending 存入
  | 'justlending-withdraw' // JustLending 提取
  | 'treasury-deposit' // Treasury 存入
  | 'default' // 默认值（用于未知操作）

export interface TronEnergyRequirement {
  energy: number // 所需的 Energy
  bandwidth: number // 所需的 Bandwidth
  description?: string // 操作描述
}

/**
 * 从环境变量读取能量需求（运行时读取）
 * 
 * Next.js 环境变量说明：
 * - 只有以 NEXT_PUBLIC_ 开头的变量才会被注入到客户端代码
 * - 环境变量在构建时（或开发服务器启动时）被注入
 * - 修改 .env.local 后需要重启开发服务器才能生效
 * 
 * @param operationKey 操作键名（如 'APPROVE', 'JUSTLENDING_SUPPLY'）
 * @param defaultEnergy 默认 Energy 值
 * @param defaultBandwidth 默认 Bandwidth 值
 */
/**
 * 运行时读取环境变量
 * Next.js 会在构建时将 NEXT_PUBLIC_* 变量注入到客户端代码
 * 注意：这个函数在模块加载时执行，所以环境变量必须在构建时可用
 */
function getEnvVar(key: string): string | undefined {
  // 在 Next.js 中，NEXT_PUBLIC_* 变量会被注入到 process.env
  // 客户端和服务端都可以直接访问
  
  // 尝试多种读取方式，确保兼容性
  let value: string | undefined = undefined
  
  if (typeof window !== 'undefined') {
    // 客户端：直接读取 process.env（Next.js 已注入）
    value = process.env[key]
    
    // 如果直接访问失败，尝试其他方式
    if (!value) {
      value = (process.env as Record<string, string | undefined>)[key]
    }
    if (!value) {
      value = process.env[key as keyof typeof process.env] as string | undefined
    }
  } else {
    // 服务端：直接读取 process.env
    value = process.env[key]
  }
  
  return value
}

function getEnergyFromEnv(
  operationKey: string,
  defaultEnergy: number,
  defaultBandwidth: number
): TronEnergyRequirement {
  const energyKey = `NEXT_PUBLIC_TRON_ENERGY_${operationKey}_ENERGY`
  const bandwidthKey = `NEXT_PUBLIC_TRON_ENERGY_${operationKey}_BANDWIDTH`
  
  // 使用运行时读取函数
  const energyValue = getEnvVar(energyKey)
  const bandwidthValue = getEnvVar(bandwidthKey)
  
  // 计算最终值
  const parsedEnergy = energyValue 
    ? parseInt(energyValue, 10) 
    : defaultEnergy
  const parsedBandwidth = bandwidthValue
    ? parseInt(bandwidthValue, 10)
    : defaultBandwidth

  // 验证解析结果
  const finalEnergy = isNaN(parsedEnergy) ? defaultEnergy : parsedEnergy
  const finalBandwidth = isNaN(parsedBandwidth) ? defaultBandwidth : parsedBandwidth
  
  // 调试日志：打印环境变量读取情况
  console.log(`[TRON Energy Config] ${operationKey}:`, {
    环境变量键: energyKey,
    读取到的值: energyValue || '未设置',
    默认值: defaultEnergy,
    最终使用的值: finalEnergy,
    来源: energyValue ? '环境变量' : '默认值',
  })
  
  console.log(`[TRON Energy Config] ${operationKey} Bandwidth:`, {
    环境变量键: bandwidthKey,
    读取到的值: bandwidthValue || '未设置',
    默认值: defaultBandwidth,
    最终使用的值: finalBandwidth,
    来源: bandwidthValue ? '环境变量' : '默认值',
  })

  return {
    energy: finalEnergy,
    bandwidth: finalBandwidth,
  }
}

/**
 * TRON 操作能量需求配置
 * 优先从环境变量读取，如果没有配置则使用默认值
 */
export const TRON_ENERGY_REQUIREMENTS: Record<TronOperationType, TronEnergyRequirement> = {
  /**
   * 授权操作（Approve）
   * ⚠️ 注意：授权操作的实际 Energy 需求取决于：
   * 1. 合约的复杂度（USDT 合约相对简单，通常需要 30,000-50,000 Energy）
   * 2. 交易的数据大小
   * 3. 实际调用的方法
   * 
   * 默认值 40000 是基于 USDT 标准合约的估算值，实际值可能因合约而异。
   * 建议通过以下方式获取准确值：
   * 1. 在 TronScan 上查询实际授权交易的 Energy 消耗
   * 2. 进行实际测试，记录真实交易的能量消耗
   * 3. 使用环境变量 NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY 配置准确值
   * 
   * 环境变量：NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY, NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH
   */
  approve: getEnergyFromEnv('APPROVE', 40000, 300),

  /**
   * JustLending 存入操作
   * 基于实际测试数据：
   * - safeTransferFrom: 64,285 Energy
   * - forceApprove: 200,000 Energy
   * - JustLend mint: 300,000 Energy
   * - 代码可见操作（storage 读写、事件等）: ~73,500 Energy
   * 总消耗约 637,785 Energy，建议设置 700,000 Energy 作为安全上限
   * 环境变量：NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY, NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH
   */
  'justlending-supply': getEnergyFromEnv('JUSTLENDING_SUPPLY', 637785, 400),

  /**
   * JustLending 提取操作
   * ⚠️ 默认值 131000 是估算值，建议通过实际测试或查询链上交易确定准确值
   * 环境变量：NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_ENERGY, NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_BANDWIDTH
   * 
   * 获取准确值的方法：
   * 1. 在 TronScan 上查询 JustLending withdraw 交易的实际 Energy 消耗
   * 2. 进行实际测试，记录真实交易的能量消耗
   * 3. 查看 JustLending 合约文档或社区资料
   */
  'justlending-withdraw': getEnergyFromEnv('JUSTLENDING_WITHDRAW', 131000, 400),

  /**
   * Treasury 存入操作
   * 环境变量：NEXT_PUBLIC_TRON_ENERGY_TREASURY_DEPOSIT_ENERGY, NEXT_PUBLIC_TRON_ENERGY_TREASURY_DEPOSIT_BANDWIDTH
   */
  'treasury-deposit': getEnergyFromEnv('TREASURY_DEPOSIT', 196500, 600),

  /**
   * 默认值
   * 环境变量：NEXT_PUBLIC_TRON_ENERGY_DEFAULT_ENERGY, NEXT_PUBLIC_TRON_ENERGY_DEFAULT_BANDWIDTH
   */
  default: getEnergyFromEnv('DEFAULT', 131000, 600),
}

// 添加描述信息（仅用于文档，不影响功能）
TRON_ENERGY_REQUIREMENTS.approve.description = 'Token 授权操作'
TRON_ENERGY_REQUIREMENTS['justlending-supply'].description = 'JustLending 存入操作'
TRON_ENERGY_REQUIREMENTS['justlending-withdraw'].description = 'JustLending 提取操作'
TRON_ENERGY_REQUIREMENTS['treasury-deposit'].description = 'Treasury 存入操作'
TRON_ENERGY_REQUIREMENTS.default.description = '默认操作'

/**
 * 运行时动态获取指定操作的能量需求
 * 使用静态访问方式，确保 webpack 可以正确替换环境变量
 * @param operationType 操作类型
 * @returns 能量需求配置
 */
export function getTronEnergyRequirement(
  operationType: TronOperationType = 'default'
): TronEnergyRequirement {
  // 定义默认值映射
  const defaultValues: Record<TronOperationType, { energy: number; bandwidth: number }> = {
    approve: { energy: 40000, bandwidth: 300 },
    'justlending-supply': { energy: 637785, bandwidth: 400 }, // 实际测试值：transferFrom(64,285) + approve(200,000) + mint(300,000) + 其他(73,500)
    'justlending-withdraw': { energy: 131000, bandwidth: 400 },
    'treasury-deposit': { energy: 196500, bandwidth: 600 },
    default: { energy: 131000, bandwidth: 600 },
  }
  
  const defaults = defaultValues[operationType] || defaultValues.default
  
  // ⚠️ 关键：使用静态访问方式，让 webpack 的 DefinePlugin 可以正确替换
  // 不能使用动态构建的变量名（如 process.env[key]），因为 webpack 无法静态分析
  let energyValue: string | undefined = undefined
  let bandwidthValue: string | undefined = undefined
  
  // 根据 operationType 直接访问对应的环境变量（静态访问）
  switch (operationType) {
    case 'approve':
      energyValue = process.env.NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY
      bandwidthValue = process.env.NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH
      break
    case 'justlending-supply':
      energyValue = process.env.NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY
      bandwidthValue = process.env.NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH
      break
    case 'justlending-withdraw':
      energyValue = process.env.NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_ENERGY
      bandwidthValue = process.env.NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_BANDWIDTH
      break
    case 'treasury-deposit':
      energyValue = process.env.NEXT_PUBLIC_TRON_ENERGY_TREASURY_DEPOSIT_ENERGY
      bandwidthValue = process.env.NEXT_PUBLIC_TRON_ENERGY_TREASURY_DEPOSIT_BANDWIDTH
      break
    case 'default':
    default:
      energyValue = process.env.NEXT_PUBLIC_TRON_ENERGY_DEFAULT_ENERGY
      bandwidthValue = process.env.NEXT_PUBLIC_TRON_ENERGY_DEFAULT_BANDWIDTH
      break
  }
  
  // 计算最终值
  const parsedEnergy = energyValue ? parseInt(energyValue, 10) : defaults.energy
  const parsedBandwidth = bandwidthValue ? parseInt(bandwidthValue, 10) : defaults.bandwidth
  
  const finalEnergy = isNaN(parsedEnergy) ? defaults.energy : parsedEnergy
  const finalBandwidth = isNaN(parsedBandwidth) ? defaults.bandwidth : parsedBandwidth
  
  const requirement: TronEnergyRequirement = {
    energy: finalEnergy,
    bandwidth: finalBandwidth,
  }
  
  // 调试日志已移除（日志输出过多）
  // if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  //   console.log(`[getTronEnergyRequirement] ${operationType}:`, {
  //     读取到的环境变量值: { energy: energyValue || '未设置', bandwidth: bandwidthValue || '未设置' },
  //     默认值: defaults,
  //     最终使用的值: requirement,
  //     来源: {
  //       energy: energyValue ? '环境变量' : '默认值',
  //       bandwidth: bandwidthValue ? '环境变量' : '默认值',
  //     },
  //   })
  // }
  
  return requirement
}

/**
 * 获取多个操作的最大能量需求
 * @param operationTypes 操作类型数组
 * @returns 最大能量需求配置
 */
export function getMaxTronEnergyRequirement(
  operationTypes: TronOperationType[]
): TronEnergyRequirement {
  if (operationTypes.length === 0) {
    return TRON_ENERGY_REQUIREMENTS.default
  }

  const requirements = operationTypes.map(type => getTronEnergyRequirement(type))
  
  return {
    energy: Math.max(...requirements.map(r => r.energy)),
    bandwidth: Math.max(...requirements.map(r => r.bandwidth)),
    description: `多个操作（${operationTypes.join(', ')}）`,
  }
}
