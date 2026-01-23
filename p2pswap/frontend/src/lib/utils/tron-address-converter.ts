/**
 * TRON 地址转换工具
 * 使用 TronWeb 进行地址格式转换（推荐方式）
 */

/**
 * 获取 TronWeb 实例（用于地址转换）
 * @returns TronWeb 实例或 null
 */
function getTronWeb(): any {
  if (typeof window === 'undefined') {
    return null
  }
  return (window as any)?.tronWeb || (window as any)?.tronLink?.tronWeb || null
}

/**
 * 将 TRON 地址转换为 Base58 格式
 * 支持多种输入格式：
 * - Base58 格式（如 TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9）：直接返回
 * - Hex 格式（如 41dd62a4d119c93eb3bc48fff45b43ead230d6b5fc）：转换为 Base58
 * - 0x 开头的 Hex（如 0x41dd62a4d119c93eb3bc48fff45b43ead230d6b5fc）：转换为 Base58
 * 
 * @param address 地址（可以是 Base58 或 hex 格式）
 * @returns TRON Base58 格式地址
 */
export function convertTronAddressToBase58(address: string): string {
  if (!address) {
    return address
  }

  // 如果已经是 Base58 格式（长度 34 且不是 hex 格式），直接返回
  if (address.length === 34 && !address.startsWith('0x') && !address.startsWith('41')) {
    return address
  }

  // 尝试使用 TronWeb 转换
  const tronWeb = getTronWeb()
  if (tronWeb && tronWeb.address) {
    try {
      // 如果是 hex 格式（以 41 开头，42 个字符），直接传入（不带 0x）
      // 注意：TronWeb.address.fromHex 对于 41 开头的地址，应该直接传入（不带 0x）
      // 如果传入 0x41...，会被当作 44 个字符的地址，导致转换错误
      if (address.startsWith('41') && address.length === 42) {
        return tronWeb.address.fromHex(address)
      }
      
      // 如果是 0x 开头的 hex 格式，去掉 0x 后转换
      if (address.startsWith('0x')) {
        const hexWithout0x = address.slice(2)
        // 如果去掉 0x 后是 42 个字符且以 41 开头，直接传入
        if (hexWithout0x.length === 42 && hexWithout0x.startsWith('41')) {
          return tronWeb.address.fromHex(hexWithout0x)
        }
        // 否则使用完整的 0x 地址
        return tronWeb.address.fromHex(address)
      }
      
      // 如果已经是 Base58 格式，直接返回
      return address
    } catch (error) {
      console.warn('[convertTronAddressToBase58] TronWeb 转换失败:', error, { address })
      // 转换失败时返回原始地址
      return address
    }
  }

  // 如果 TronWeb 不可用，返回原始地址
  console.warn('[convertTronAddressToBase58] TronWeb 不可用，返回原始地址')
  return address
}

/**
 * 将 TRON 地址转换为 Hex 格式
 * @param address 地址（可以是 Base58 或 hex 格式）
 * @returns TRON Hex 格式地址（41 开头，42 个字符，不带 0x）
 */
export function convertTronAddressToHex(address: string): string {
  if (!address) {
    return address
  }

  // 如果已经是 hex 格式（以 41 开头，42 个字符），直接返回
  if (address.startsWith('41') && address.length === 42) {
    return address
  }

  // 如果是 0x 开头的 hex 格式，去掉 0x 前缀
  if (address.startsWith('0x')) {
    const hexWithout0x = address.slice(2)
    if (hexWithout0x.length === 42 && hexWithout0x.startsWith('41')) {
      return hexWithout0x
    }
    return address
  }

  // 尝试使用 TronWeb 转换 Base58 到 hex
  const tronWeb = getTronWeb()
  if (tronWeb && tronWeb.address) {
    try {
      const hex = tronWeb.address.toHex(address)
      // toHex 返回的格式可能是 41... 或 0x41...，统一返回 41... 格式
      if (hex.startsWith('0x')) {
        return hex.slice(2)
      }
      return hex
    } catch (error) {
      console.warn('[convertTronAddressToHex] TronWeb 转换失败:', error, { address })
      return address
    }
  }

  // 如果 TronWeb 不可用，返回原始地址
  console.warn('[convertTronAddressToHex] TronWeb 不可用，返回原始地址')
  return address
}

/**
 * 规范化 TRON 地址（统一转换为 Base58 格式）
 * 这是推荐使用的函数，会自动处理各种格式
 * 
 * @param address 地址（可以是 Base58 或 hex 格式）
 * @returns TRON Base58 格式地址
 */
export function normalizeTronAddress(address: string): string {
  return convertTronAddressToBase58(address)
}

/**
 * 将十六进制地址转换为 TRON Base58 地址（兼容旧版本）
 * @deprecated 请使用 convertTronAddressToBase58 或 normalizeTronAddress
 * @param hexAddress 十六进制地址（可以是 0x 开头，也可以是纯十六进制字符串）
 * @returns TRON Base58 格式地址
 */
export function hexToTronAddress(hexAddress: string): string {
  return convertTronAddressToBase58(hexAddress)
}

