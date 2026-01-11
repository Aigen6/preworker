/**
 * 精确金额计算工具函数
 * 使用 ethers.js 的 formatUnits 和 parseUnits，它们内部使用 BigInt 避免浮点数精度问题
 */

import { formatUnits, parseUnits } from 'ethers'

/**
 * 将可读格式的金额转换为 wei 格式（BigInt）
 * 使用 ethers.js 的 parseUnits，内部使用 BigInt 确保精度
 * @param amount 可读格式的金额（如 "1.5" 或 1.5）
 * @param decimals 代币精度（默认 18）
 * @returns wei 格式的 BigInt
 */
export function parseToWei(amount: number | string, decimals: number = 18): bigint {
  // 转换为字符串（ethers.js parseUnits 需要字符串）
  const amountStr = typeof amount === 'number' ? amount.toString() : amount.trim()
  // 使用 ethers.js 的 parseUnits，内部使用 BigInt 确保精度
  return parseUnits(amountStr, decimals)
}

/**
 * 将 wei 格式转换为可读格式
 * 使用 ethers.js 的 formatUnits，内部使用 BigInt 确保精度
 * @param weiAmount wei 格式的 BigInt 或字符串
 * @param decimals 代币精度（默认 18）
 * @returns 可读格式的字符串
 */
export function formatFromWei(weiAmount: bigint | string, decimals: number = 18): string {
  // 使用 ethers.js 的 formatUnits，内部使用 BigInt 确保精度
  return formatUnits(weiAmount, decimals)
}

/**
 * 格式化金额用于显示（保留指定小数位数）
 * 直接使用字符串操作，避免 parseFloat 的精度问题
 * @param amount 金额字符串（来自 formatFromWei）
 * @param decimals 要保留的小数位数（默认 2）
 * @returns 格式化后的字符串
 */
export function formatAmountForDisplay(amount: string, decimals: number = 2): string {
  const parts = amount.split('.')
  if (parts.length === 1) {
    // 没有小数部分，添加 .00
    return `${parts[0]}.${'0'.repeat(decimals)}`
  }
  
  const integerPart = parts[0]
  const decimalPart = parts[1]
  
  if (decimalPart.length === decimals) {
    return amount
  } else if (decimalPart.length > decimals) {
    // 截断到指定小数位数（不四舍五入，避免浮点数问题）
    return `${integerPart}.${decimalPart.slice(0, decimals)}`
  } else {
    // 补齐到指定小数位数
    return `${integerPart}.${decimalPart.padEnd(decimals, '0')}`
  }
}

/**
 * 统一格式化 USDT 金额用于显示
 * - 最多显示 6 位小数
 * - 自动去掉末尾的 0
 * - 整数部分不显示小数点
 * @param amount 金额（数字或字符串）
 * @returns 格式化后的字符串（例如 "0.737713", "0.5", "1"）
 */
export function formatUSDTAmount(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num) || !isFinite(num)) {
    return '0'
  }
  // 使用 toFixed(6) 然后去掉末尾的 0
  return num.toFixed(6).replace(/\.?0+$/, '')
}

/**
 * 比较两个金额字符串（使用 BigInt 精确比较）
 * @param amount1 第一个金额字符串
 * @param amount2 第二个金额字符串
 * @param decimals 代币精度（默认 18）
 * @returns -1 如果 amount1 < amount2, 0 如果相等, 1 如果 amount1 > amount2
 */
export function compareAmounts(
  amount1: string,
  amount2: string,
  decimals: number = 18
): -1 | 0 | 1 {
  const wei1 = parseToWei(amount1, decimals)
  const wei2 = parseToWei(amount2, decimals)
  
  if (wei1 < wei2) return -1
  if (wei1 > wei2) return 1
  return 0
}

/**
 * 精确相加多个可读格式的金额
 * @param amounts 可读格式的金额数组
 * @param decimals 代币精度（默认 18）
 * @returns 可读格式的总和字符串
 */
export function sumReadableAmounts(amounts: (number | string)[], decimals: number = 18): string {
  if (amounts.length === 0) return '0'
  
  let totalWei = 0n
  for (const amount of amounts) {
    if (!amount && amount !== 0) continue
    const wei = parseToWei(amount, decimals)
    totalWei += wei
  }
  
  return formatFromWei(totalWei, decimals)
}

/**
 * 精确相加多个 wei 格式的金额
 * @param amounts wei 格式的金额数组（字符串或 BigInt）
 * @returns wei 格式的总和字符串
 */
export function sumWeiAmounts(amounts: (string | bigint)[]): string {
  if (amounts.length === 0) return '0'
  
  let total = 0n
  for (const amount of amounts) {
    if (!amount && amount !== 0n) continue
    const wei = typeof amount === 'string' ? BigInt(amount) : amount
    total += wei
  }
  
  return total.toString()
}

/**
 * 从 allocation 对象中提取 wei 格式的金额并相加
 * @param allocations allocation 对象数组
 * @param decimals 代币精度（默认 18）
 * @returns 可读格式的总和字符串
 */
export function sumAllocationAmounts(
  allocations: Array<{ amount: string | number | bigint }>,
  decimals: number = 18
): string {
  if (allocations.length === 0) return '0'
  
  let totalWei = 0n
  for (const alloc of allocations) {
    if (!alloc.amount) continue
    
    let wei: bigint
    if (typeof alloc.amount === 'bigint') {
      wei = alloc.amount
    } else if (typeof alloc.amount === 'string') {
      // 如果是字符串，可能是 wei 格式或可读格式
      // 如果包含小数点，则是可读格式
      if (alloc.amount.includes('.')) {
        wei = parseToWei(alloc.amount, decimals)
      } else {
        wei = BigInt(alloc.amount)
      }
    } else {
      // 如果是数字，假设是可读格式
      wei = parseToWei(alloc.amount, decimals)
    }
    
    totalWei += wei
  }
  
  return formatFromWei(totalWei, decimals)
}

