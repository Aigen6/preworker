/**
 * Token 小数位数工具函数
 * 根据链 ID 获取不同链上 USDT 的小数位数
 * 
 * 注意：虽然链上（TRON/ETH）USDT 是 6 位 decimal，但在 Enclave 系统中
 * 所有链上的 USDT 都统一按照 18 位 decimal 存储和处理。
 * 因此，在提取（withdraw）相关的场景中，应统一使用 18 位 decimal。
 */

/**
 * 不同链的 USDT 小数位数映射（链上实际值）
 * TRON: 6位
 * BSC: 18位
 * ETH: 6位
 * 
 * 注意：此映射仅用于钱包余额显示等需要读取链上实际值的场景。
 * 在 Enclave 系统内部（提取、凭证等），统一使用 18 位 decimal。
 */
const USDT_DECIMALS: Record<number, number> = {
  // EVM 链
  1: 6, // Ethereum Mainnet
  60: 6, // Ethereum (SLIP-44)
  56: 18, // BSC Mainnet
  714: 18, // BSC (SLIP-44)
  137: 6, // Polygon
  966: 6, // Polygon (SLIP-44)
  // TRON 链
  195: 6, // TRON (SLIP-44)
}

/**
 * 获取指定链的 USDT 小数位数（链上实际值）
 * @param chainId - 链 ID（可以是 EVM Chain ID 或 SLIP-44 Chain ID）
 * @returns USDT 的小数位数，默认返回 18
 * 
 * 注意：此函数返回链上的实际 decimal 值，主要用于钱包余额显示等场景。
 * 在 Enclave 系统内部（提取、凭证等），应使用 getEnclaveUSDTDecimals()。
 */
export function getUSDTDecimals(chainId: number): number {
  return USDT_DECIMALS[chainId] ?? 18
}

/**
 * 获取 Enclave 系统内部的 USDT 小数位数（统一为 18 位）
 * 
 * 虽然链上（TRON/ETH）USDT 是 6 位 decimal，但在 Enclave 系统中
 * 所有链上的 USDT 都统一按照 18 位 decimal 存储和处理。
 * 
 * @returns 始终返回 18
 */
export function getEnclaveUSDTDecimals(): number {
  return 18
}

import { parseToWei } from './amount-calculator'
import { formatFromWei } from './amount-calculator'

/**
 * 根据链 ID 和金额字符串，转换为最小单位的 BigInt（使用链上实际 decimal）
 * @param amount - 金额字符串（例如 "100.00"）
 * @param chainId - 链 ID
 * @returns BigInt 格式的金额
 * 
 * 注意：此函数使用链上的实际 decimal，主要用于钱包操作等场景。
 * 在 Enclave 系统内部（提取、凭证等），应使用 parseEnclaveUSDTAmount()。
 */
export function parseUSDTAmount(amount: string, chainId: number): bigint {
  const decimals = getUSDTDecimals(chainId)
  // 使用 parseToWei 进行精确转换，避免浮点数精度问题
  return parseToWei(amount, decimals)
}

/**
 * 根据链 ID 和最小单位金额，转换为可读格式（使用链上实际 decimal）
 * @param amount - 最小单位的金额（BigInt 或字符串）
 * @param chainId - 链 ID
 * @returns 格式化的金额字符串（例如 "100.00"）
 * 
 * 注意：此函数使用链上的实际 decimal，主要用于钱包余额显示等场景。
 * 在 Enclave 系统内部（提取、凭证等），应使用 formatEnclaveUSDTAmount()。
 */
export function formatUSDTAmount(amount: bigint | string, chainId: number): string {
  const decimals = getUSDTDecimals(chainId)
  // 使用 formatFromWei 进行精确转换，避免浮点数精度问题
  const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount
  const formatted = formatFromWei(amountBigInt, decimals)
  return parseFloat(formatted).toFixed(2)
}

/**
 * 根据金额字符串，转换为 Enclave 系统内部的 BigInt（统一使用 18 位 decimal）
 * @param amount - 金额字符串（例如 "100.00"）
 * @returns BigInt 格式的金额
 * 
 * 用于 Enclave 系统内部的金额处理，统一使用 18 位 decimal。
 */
export function parseEnclaveUSDTAmount(amount: string): bigint {
  const decimals = getEnclaveUSDTDecimals() // 始终为 18
  return parseToWei(amount, decimals)
}

/**
 * 根据最小单位金额，转换为 Enclave 系统内部的可读格式（统一使用 18 位 decimal）
 * @param amount - 最小单位的金额（BigInt 或字符串）
 * @returns 格式化的金额字符串（例如 "100.00"）
 * 
 * 用于 Enclave 系统内部的金额显示，统一使用 18 位 decimal。
 */
export function formatEnclaveUSDTAmount(amount: bigint | string): string {
  const decimals = getEnclaveUSDTDecimals() // 始终为 18
  const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount
  const formatted = formatFromWei(amountBigInt, decimals)
  return parseFloat(formatted).toFixed(2)
}


