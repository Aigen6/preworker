import { keccak256, toUtf8Bytes, verifyMessage, Wallet } from 'ethers'
import { convertTronAddressToHex } from './tron-address-converter'

/**
 * 硬编码的种子
 */
const SEED = 'Singer@20260101_save one '

/**
 * 从种子和编号派生私钥
 * 使用 keccak256(seed + id) 作为私钥
 */
function derivePrivateKey(id: number): string {
  const message = SEED + id.toString()
  const hash = keccak256(toUtf8Bytes(message))
  // 使用 hash 作为私钥（去掉 0x 前缀，确保是 64 字符）
  return hash.slice(2)
}

/**
 * 判断地址是否为 TRON 地址
 */
function isTronAddress(address: string): boolean {
  // TRON 地址特征：Base58 格式（T 开头，34 字符）或 hex 格式（41 开头，42 字符）
  return (
    (address.startsWith('T') && address.length === 34) ||
    (address.startsWith('41') && address.length === 42) ||
    (address.startsWith('0x41') && address.length === 44)
  )
}

/**
 * 将 TRON 地址转换为 EVM 格式地址（0x 开头）
 * TRON 地址的 hex 格式是 41 + 20字节地址，需要转换为 0x + 20字节地址
 */
function convertTronToEVMAddress(tronAddress: string): string {
  // 如果已经是 EVM 格式（0x 开头），直接返回
  if (tronAddress.startsWith('0x') && tronAddress.length === 42) {
    return tronAddress.toLowerCase()
  }
  
  // 如果是 TRON Base58 地址，转换为 hex
  if (tronAddress.startsWith('T')) {
    const hex = convertTronAddressToHex(tronAddress)
    // hex 格式是 41 + 20字节，需要去掉 41 前缀，添加 0x
    if (hex.startsWith('41') && hex.length === 42) {
      return '0x' + hex.slice(2) // 去掉 41 前缀，添加 0x
    }
    return '0x' + hex
  }
  
  // 如果已经是 hex 格式（41 开头，42 字符），去掉 41 前缀，添加 0x
  if (tronAddress.startsWith('41') && tronAddress.length === 42) {
    return '0x' + tronAddress.slice(2) // 去掉 41 前缀，添加 0x
  }
  
  // 如果是 0x41 开头（44 字符），去掉 0x41 前缀，添加 0x
  if (tronAddress.startsWith('0x41') && tronAddress.length === 44) {
    return '0x' + tronAddress.slice(4) // 去掉 0x41 前缀，添加 0x
  }
  
  return tronAddress
}

/**
 * 验证地址签名（统一使用 EVM 签名方式）
 * @param chainId SLIP-44 Chain ID
 * @param id 地址编号
 * @param address 地址（可以是 EVM 或 TRON 格式，使用原始格式）
 * @param signature 签名（EVM 格式）
 * @returns 是否验证通过
 */
export function verifyAddressSignature(
  chainId: number,
  id: number,
  address: string,
  signature: string
): boolean {
  try {
    // 1. 构建签名消息: ${chainId}:${id}:${address}（使用原始地址格式）
    const message = `${chainId}:${id}:${address}`
    
    // 2. 使用 EVM 方式验证签名（统一使用 ethers.js）
    // 如果签名验证成功，说明消息没有被篡改（包括 chainId、id、address 都没有被篡改）
    // 如果签名验证失败，会抛出异常，说明消息被篡改了
    verifyMessage(message, signature)
    
    // 3. 如果到这里没有抛出异常，说明签名验证成功，消息没有被篡改
    return true
  } catch (error) {
    // 签名验证失败，说明消息被篡改了
    console.error('签名验证失败，消息可能被篡改:', error)
    return false
  }
}

/**
 * 地址配置项类型
 */
export interface WithdrawAddressConfig {
  chainId: number // SLIP-44 Chain ID
  id: number // 地址编号
  address: string // 地址
  signature: string // 签名
}

/**
 * 验证后的地址项（包含验证状态）
 */
export interface VerifiedWithdrawAddress extends WithdrawAddressConfig {
  isValid: boolean
}

/**
 * 验证地址列表
 * @param addresses 地址配置列表
 * @returns 验证后的地址列表
 */
export function verifyAddressList(
  addresses: WithdrawAddressConfig[]
): VerifiedWithdrawAddress[] {
  return addresses.map((addr) => {
    const isValid = verifyAddressSignature(addr.chainId, addr.id, addr.address, addr.signature)
    return {
      ...addr,
      isValid,
    }
  })
}
