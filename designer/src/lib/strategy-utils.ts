// 策略验证工具函数

export const AMOUNT_TOLERANCE = 0.001 // ETH/BSC 金额容差
export const TIME_TOLERANCE = 86400 // 24小时（秒）
export const MIN_TIME_INTERVAL = TIME_TOLERANCE + 1 // 最小时间间隔（> 24小时）

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
      
      if (interval <= config.minTimeInterval) {
        failedCount++
        details.push({
          txId: tx.id,
          interval,
          reason: `时间间隔 ${interval}秒 (${(interval / 3600).toFixed(2)}小时) <= ${config.minTimeInterval}秒，可能被匹配`,
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
 * 生成时间戳，确保时间间隔 > 24小时
 */
export function generateWithdrawTime(
  depositTime: number,
  minInterval: number = MIN_TIME_INTERVAL
): number {
  // 随机间隔在 minInterval 到 minInterval * 3 之间
  const interval = minInterval + Math.random() * minInterval * 2
  return depositTime + interval
}
