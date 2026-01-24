// 策略验证工具函数

export const AMOUNT_TOLERANCE = 0.001 // ETH/BSC 金额容差
// 测试阶段：交叉时间为1分钟到10分钟
export const MIN_TIME_INTERVAL = 1 * 60 // 1分钟（秒）
export const MAX_TIME_INTERVAL = 10 * 60 // 10分钟（秒）

/**
 * 根据金额确定小数位数
 * - 1的倍数：4位小数
 * - 10的倍数：3位小数
 * - 100的倍数：2位小数
 * - 1000倍数：1位小数
 * - 10000倍数或以上：取整（0位小数）
 */
export function getDecimalPlaces(amount: number): number {
  const absAmount = Math.abs(amount)
  
  if (absAmount >= 10000) {
    return 0 // 10000倍数或以上，取整
  } else if (absAmount >= 1000) {
    return 1 // 1000倍数，1位小数
  } else if (absAmount >= 100) {
    return 2 // 100倍数，2位小数
  } else if (absAmount >= 10) {
    return 3 // 10倍数，3位小数
  } else {
    return 4 // 1的倍数，4位小数
  }
}

/**
 * 根据金额动态精确到相应的小数位数
 */
export function roundToDynamic(amount: number): number {
  const decimalPlaces = getDecimalPlaces(amount)
  const multiplier = Math.pow(10, decimalPlaces)
  return Math.round(amount * multiplier) / multiplier
}

/**
 * 将金额精确到0.01 USDT（两位小数）
 * @deprecated 使用 roundToDynamic 替代，根据金额动态调整小数位数
 */
export function roundToCent(amount: number): number {
  return Math.round(amount * 100) / 100
}

export interface StrategyValidation {
  amountMismatch: {
    passed: boolean
    failedCount: number
    details: Array<{ txId: string; difference: number; reason: string }>
  }
  timeExtension: {
    passed: boolean
    failedCount: number
    details: Array<{ txId: string; interval: number; reason: string }>
  }
  normalTransactionMix: {
    passed: boolean
    highRiskRatio: number
    normalRatio: number
    reason: string
  }
  riskControl: {
    passed: boolean
    highRiskCount: number
    totalCount: number
    highRiskRatio: number
    reason: string
  }
}

export interface TransactionPlan {
  id: string
  sourceAddress: string
  sourceAddressLabel?: string
  amount: number
  targetAddress: string
  chain: string
  chainId: number
  status: "pending" | "preprocess" | "enclave" | "completed"
  isHighRisk: boolean
  depositTime?: number
  withdrawTime?: number
  relatedDepositId?: string
  amountDifference?: number
  timeInterval?: number
  steps: Array<{
    step: "preprocess" | "enclave" | "transfer"
    status: "pending" | "processing" | "completed" | "failed"
    vaultAddress?: string
    targetAddress?: string
  }>
}

export interface StrategyConfig {
  enableAmountMismatch: boolean
  minAmountDifference: number
  enableTimeExtension: boolean
  minTimeInterval: number
  enableNormalTransactionMix: boolean
  normalTransactionRatio: number
  enableRiskControl: boolean
  maxHighRiskRatio: number
}

/**
 * 验证策略1：金额不匹配
 */
export function validateAmountMismatch(
  transactions: TransactionPlan[],
  config: StrategyConfig
): StrategyValidation["amountMismatch"] {
  const details: Array<{ txId: string; difference: number; reason: string }> = []
  let failedCount = 0

  for (const tx of transactions) {
    if (tx.relatedDepositId && tx.amountDifference !== undefined) {
      const difference = Math.abs(tx.amountDifference)
      
      if (difference <= config.minAmountDifference) {
        failedCount++
        details.push({
          txId: tx.id,
          difference,
          reason: `金额差异 ${difference} <= ${config.minAmountDifference}，可能被匹配`,
        })
      }
    }
  }

  return {
    passed: failedCount === 0,
    failedCount,
    details,
  }
}

/**
 * 验证策略2：时间延长
 * 确保时间间隔在 15分钟 到 12小时 之间
 */
export function validateTimeExtension(
  transactions: TransactionPlan[],
  config: StrategyConfig
): StrategyValidation["timeExtension"] {
  const details: Array<{ txId: string; interval: number; reason: string }> = []
  let failedCount = 0

  for (const tx of transactions) {
    if (tx.depositTime && tx.withdrawTime && tx.timeInterval !== undefined) {
      const interval = tx.timeInterval
      
      if (interval < MIN_TIME_INTERVAL) {
        failedCount++
        details.push({
          txId: tx.id,
          interval,
          reason: `时间间隔 ${interval}秒 (${(interval / 60).toFixed(1)}分钟) < ${MIN_TIME_INTERVAL}秒 (15分钟)，可能被匹配`,
        })
      } else if (interval > MAX_TIME_INTERVAL) {
        failedCount++
        details.push({
          txId: tx.id,
          interval,
          reason: `时间间隔 ${interval}秒 (${(interval / 3600).toFixed(2)}小时) > ${MAX_TIME_INTERVAL}秒 (12小时)，超出范围`,
        })
      }
    }
  }

  return {
    passed: failedCount === 0,
    failedCount,
    details,
  }
}

/**
 * 验证策略3：正常交易交叉
 */
export function validateNormalTransactionMix(
  transactions: TransactionPlan[],
  config: StrategyConfig
): StrategyValidation["normalTransactionMix"] {
  const highRiskCount = transactions.filter((tx) => tx.isHighRisk).length
  const normalCount = transactions.filter((tx) => !tx.isHighRisk).length
  const totalCount = transactions.length

  const highRiskRatio = totalCount > 0 ? highRiskCount / totalCount : 0
  const normalRatio = totalCount > 0 ? normalCount / totalCount : 0

  const passed = normalRatio >= config.normalTransactionRatio

  return {
    passed,
    highRiskRatio,
    normalRatio,
    reason: passed
      ? `正常交易占比 ${(normalRatio * 100).toFixed(2)}% >= ${(config.normalTransactionRatio * 100).toFixed(2)}%`
      : `正常交易占比 ${(normalRatio * 100).toFixed(2)}% < ${(config.normalTransactionRatio * 100).toFixed(2)}%，需要增加正常交易`,
  }
}

/**
 * 验证策略4：风险控制
 */
export function validateRiskControl(
  transactions: TransactionPlan[],
  config: StrategyConfig
): StrategyValidation["riskControl"] {
  const highRiskCount = transactions.filter((tx) => tx.isHighRisk).length
  const totalCount = transactions.length
  const highRiskRatio = totalCount > 0 ? highRiskCount / totalCount : 0

  const passed = highRiskRatio <= config.maxHighRiskRatio

  return {
    passed,
    highRiskCount,
    totalCount,
    highRiskRatio,
    reason: passed
      ? `高风险交易占比 ${(highRiskRatio * 100).toFixed(2)}% <= ${(config.maxHighRiskRatio * 100).toFixed(2)}%`
      : `高风险交易占比 ${(highRiskRatio * 100).toFixed(2)}% > ${(config.maxHighRiskRatio * 100).toFixed(2)}%，需要减少高风险交易`,
  }
}

/**
 * 执行所有策略验证
 */
export function validateAllStrategies(
  transactions: TransactionPlan[],
  config: StrategyConfig
): StrategyValidation {
  return {
    amountMismatch: validateAmountMismatch(transactions, config),
    timeExtension: validateTimeExtension(transactions, config),
    normalTransactionMix: validateNormalTransactionMix(transactions, config),
    riskControl: validateRiskControl(transactions, config),
  }
}

/**
 * 生成金额不匹配的提取金额
 * 确保与存入金额的差异 > AMOUNT_TOLERANCE
 */
export function generateMismatchedAmount(
  depositAmount: number,
  minDifference: number = AMOUNT_TOLERANCE + 0.0001
): number {
  // 随机选择增加或减少
  const shouldIncrease = Math.random() > 0.5
  const difference = minDifference + Math.random() * depositAmount * 0.5 // 差异在 minDifference 到 50% 之间

  if (shouldIncrease) {
    return depositAmount + difference
  } else {
    return Math.max(0.001, depositAmount - difference) // 确保不为0
  }
}

/**
 * 生成多个金额不匹配的提取金额（用于分割交易）
 * 返回的金额数组总和应该等于或接近原始金额（使用动态小数位数）
 */
export function generateMismatchedAmounts(
  depositAmount: number,
  splitCount: number,
  minDifference: number = AMOUNT_TOLERANCE + 0.0001,
  decimalPlaces?: number // 可选：指定小数位数，如果不提供则根据金额自动确定
): number[] {
  const amounts: number[] = []
  // 确定小数位数
  const places = decimalPlaces !== undefined ? decimalPlaces : getDecimalPlaces(depositAmount)
  const roundToPrecision = (amt: number) => {
    const multiplier = Math.pow(10, places)
    return Math.round(amt * multiplier) / multiplier
  }
  const minAmount = Math.pow(10, -places) // 最小金额根据小数位数确定
  
  // 使用动态小数位数
  const roundedDepositAmount = roundToPrecision(depositAmount)
  const baseAmount = roundedDepositAmount / splitCount
  
  // 生成 splitCount 个金额，总和等于 roundedDepositAmount（使用动态小数位数）
  let remaining = roundedDepositAmount
  
  for (let i = 0; i < splitCount - 1; i++) {
    // 每个金额在 baseAmount 基础上随机变化 ±30%
    const variation = (Math.random() - 0.5) * 0.6 // -0.3 到 +0.3
    const amount = baseAmount * (1 + variation)
    
    // 使用动态小数位数，确保金额不为负且不超过剩余金额
    const minRemainingForOthers = (splitCount - i - 1) * minAmount // 为其他分配保留最小金额
    const maxAmount = remaining - minRemainingForOthers
    const finalAmount = roundToPrecision(Math.max(minAmount, Math.min(amount, maxAmount)))
    amounts.push(finalAmount)
    remaining = roundToPrecision(remaining - finalAmount)
  }
  
  // 最后一个金额使用剩余金额（使用动态小数位数）
  amounts.push(roundToPrecision(Math.max(minAmount, remaining)))
  
  // 确保总和等于原始金额（处理四舍五入误差，使用动态小数位数）
  const sum = roundToPrecision(amounts.reduce((a, b) => a + b, 0))
  const tolerance = Math.pow(10, -places)
  if (Math.abs(sum - roundedDepositAmount) > tolerance) {
    const diff = roundToPrecision(roundedDepositAmount - sum)
    amounts[0] = roundToPrecision(amounts[0] + diff) // 将差值加到第一个金额
  }
  
  // 确保至少有一个金额与 baseAmount 的差异 > minDifference
  const hasValidDifference = amounts.some(amt => Math.abs(amt - baseAmount) > minDifference)
  if (!hasValidDifference) {
    // 如果所有金额都太接近 baseAmount，随机调整一个
    const index = Math.floor(Math.random() * amounts.length)
    const adjustment = roundToPrecision(Math.max(minAmount, minDifference + Math.random() * baseAmount * 0.2))
    
    // 确保调整后不会导致总和变化（从另一个金额中扣除）
    const otherIndex = (index + 1) % amounts.length
    
    if (Math.random() > 0.5) {
      // 增加当前金额，减少另一个金额
      const maxAdjustment = roundToPrecision(amounts[otherIndex] - minAmount)
      const actualAdjustment = roundToPrecision(Math.min(adjustment, maxAdjustment))
      amounts[index] = roundToPrecision(amounts[index] + actualAdjustment)
      amounts[otherIndex] = roundToPrecision(Math.max(minAmount, amounts[otherIndex] - actualAdjustment))
    } else {
      // 减少当前金额，增加另一个金额
      const maxAdjustment = roundToPrecision(amounts[index] - minAmount)
      const actualAdjustment = roundToPrecision(Math.min(adjustment, maxAdjustment))
      amounts[index] = roundToPrecision(Math.max(minAmount, amounts[index] - actualAdjustment))
      amounts[otherIndex] = roundToPrecision(amounts[otherIndex] + actualAdjustment)
    }
    
    // 重新调整总和以确保精确（调整后总和应该不变，但为了安全起见还是验证一下）
    const adjustedSum = roundToPrecision(amounts.reduce((a, b) => a + b, 0))
    if (Math.abs(adjustedSum - roundedDepositAmount) > tolerance) {
      const diff = roundToPrecision(roundedDepositAmount - adjustedSum)
      amounts[0] = roundToPrecision(amounts[0] + diff)
      
      // 最终验证
      const finalSum = roundToPrecision(amounts.reduce((a, b) => a + b, 0))
      if (Math.abs(finalSum - roundedDepositAmount) > tolerance) {
        console.error(`[generateMismatchedAmounts] 调整后总和仍不匹配: 原始=${roundedDepositAmount.toFixed(places)}, 当前=${finalSum.toFixed(places)}`)
      }
    }
  }
  
  // 最终验证：确保总和等于原始金额
  const finalSum = roundToPrecision(amounts.reduce((a, b) => a + b, 0))
  if (Math.abs(finalSum - roundedDepositAmount) > tolerance) {
    console.error(`[generateMismatchedAmounts] 最终总和不匹配: 原始=${roundedDepositAmount.toFixed(places)}, 当前=${finalSum.toFixed(places)}, amounts=`, amounts)
    // 强制修正：将差值加到第一个金额
    const diff = roundToPrecision(roundedDepositAmount - finalSum)
    amounts[0] = roundToPrecision(amounts[0] + diff)
  }
  
  return amounts
}

/**
 * 生成时间戳，确保时间间隔在 15分钟 到 12小时 之间
 */
export function generateWithdrawTime(
  depositTime: number,
  minInterval: number = MIN_TIME_INTERVAL,
  maxInterval: number = MAX_TIME_INTERVAL
): number {
  // 随机间隔在 minInterval 到 maxInterval 之间
  const interval = minInterval + Math.random() * (maxInterval - minInterval)
  return depositTime + Math.round(interval)
}
