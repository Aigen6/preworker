/**
 * TRON 地址转换工具
 * 将十六进制地址转换为 TRON Base58 格式地址
 */

import bs58 from 'bs58'

/**
 * 将十六进制地址转换为 TRON Base58 地址
 * @param hexAddress 十六进制地址（可以是 0x 开头，也可以是纯十六进制字符串）
 * @returns TRON Base58 格式地址（以 T 开头）
 */
export function hexToTronAddress(hexAddress: string): string {
  if (!hexAddress) {
    return hexAddress
  }

  // 如果已经是 Base58 格式（以 T 开头），直接返回
  if (hexAddress.startsWith('T') || hexAddress.startsWith('t')) {
    return hexAddress
  }

  try {
    // 去掉 0x 前缀和前导零，提取后40个字符（20字节）
    let cleanAddr = hexAddress.replace(/^0x/i, '').replace(/^0+/, '')
    if (cleanAddr.length > 40) {
      cleanAddr = cleanAddr.slice(-40)
    }
    cleanAddr = cleanAddr.padStart(40, '0')

    // 将十六进制字符串转换为字节数组
    const addressBytes = Buffer.from(cleanAddr, 'hex')

    // TRON 地址格式：版本字节(0x41) + 20字节地址 + 4字节校验和
    const versionByte = Buffer.from([0x41]) // TRON 地址版本字节
    const payload = Buffer.concat([versionByte, addressBytes])

    // 计算双重 SHA256 校验和
    // 注意：TRON 使用 SHA256，不是 Keccak256
    const crypto = require('crypto')
    const hash1 = crypto.createHash('sha256').update(payload).digest()
    const hash2 = crypto.createHash('sha256').update(hash1).digest()
    const checksum = hash2.slice(0, 4) // 取前4字节作为校验和

    // 组合：版本字节 + 地址字节 + 校验和
    const finalBytes = Buffer.concat([payload, checksum])

    // Base58 编码
    const base58Address = bs58.encode(finalBytes)

    return base58Address
  } catch (error) {
    console.error('[hexToTronAddress] 转换失败:', error, { hexAddress })
    // 转换失败时返回原始地址
    return hexAddress
  }
}

