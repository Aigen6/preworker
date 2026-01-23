/**
 * 地址验证工具函数
 * 根据 SLIP-44 Chain ID 验证地址格式
 */

import { isValidEVMAddress, isValidTronAddress } from '@enclave-hq/wallet-sdk'

/**
 * 根据 SLIP-44 Chain ID 验证地址
 * @param address 要验证的地址
 * @param slip44ChainId SLIP-44 Chain ID (字符串或数字)
 * @returns 地址是否有效
 */
export function validateAddressForSlip44(
  address: string,
  slip44ChainId: string | number | null | undefined
): boolean {
  // 如果没有地址或链ID，返回 false
  if (!address || !slip44ChainId) {
    return false
  }

  // 转换为数字
  const chainId = typeof slip44ChainId === 'string' ? parseInt(slip44ChainId, 10) : slip44ChainId

  // 如果转换失败，返回 false
  if (isNaN(chainId)) {
    return false
  }

  // 根据 SLIP-44 Chain ID 验证地址
  // 60 = Ethereum (EVM)
  // 714 = BNB Chain (EVM)
  // 195 = TRON
  // 其他 EVM 链也使用 EVM 地址格式
  if (chainId === 195) {
    // TRON 地址验证
    return isValidTronAddress(address)
  } else {
    // EVM 地址验证（包括 Ethereum, BNB Chain 等）
    return isValidEVMAddress(address)
  }
}

/**
 * 获取地址格式提示文本
 * @param slip44ChainId SLIP-44 Chain ID
 * @param t 可选的翻译函数，如果提供则返回翻译后的文本
 * @returns 提示文本
 */
export function getAddressPlaceholder(
  slip44ChainId: string | number | null | undefined,
  t?: (key: string) => string
): string {
  const getEVMPlaceholder = () => {
    if (t) {
      return `0x... (${t('defi.evmAddressFormat')})`
    }
    return '0x... (EVM Address Format)'
  }

  const getTronPlaceholder = () => {
    if (t) {
      return `T... (${t('defi.tronAddressFormat')})`
    }
    return 'T... (TRON Address Format)'
  }

  if (!slip44ChainId) {
    return getEVMPlaceholder()
  }

  const chainId = typeof slip44ChainId === 'string' ? parseInt(slip44ChainId, 10) : slip44ChainId

  if (isNaN(chainId)) {
    return getEVMPlaceholder()
  }

  if (chainId === 195) {
    return getTronPlaceholder()
  } else {
    return getEVMPlaceholder()
  }
}

