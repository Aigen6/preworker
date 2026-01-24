/**
 * 地址池服务 - 管理低风险地址池（从 KeyManager 获取地址）
 * 
 * 用于策略生成时自动选择低风险地址作为源地址和目标地址
 */

import { getKeyManagerClient, chainIdToKeyManagerChain, type KeyManagerAddress } from './keymanager-client'

export interface AddressPoolAddress {
  id: string
  address: string
  chainId: number
  label?: string
  balance?: string
  usageCount?: number // 使用次数
  lastUsedAt?: number // 最后使用时间
  isActive?: boolean // 是否激活
  keyManagerIndex?: number // KeyManager 中的索引
}

export interface AddressPoolConfig {
  minAddresses: number // 最少地址数（默认 100）
  maxAddresses: number // 最多地址数（默认 1000）
  chainId: number // 链ID
}

export class AddressPoolService {
  private addresses: AddressPoolAddress[] = []
  private chainId: number
  private keyManagerClient = getKeyManagerClient()
  private loadingPromise: Promise<void> | null = null

  constructor(chainId: number = 714) {
    this.chainId = chainId
    // 异步从 KeyManager 加载地址
    if (typeof window !== 'undefined') {
      this.loadFromKeyManager()
    }
  }

  /**
   * 重新加载地址池（从 KeyManager）
   */
  async reload(): Promise<void> {
    await this.loadFromKeyManager()
  }

  /**
   * 从 KeyManager 加载地址池
   */
  private async loadFromKeyManager(): Promise<void> {
    if (typeof window === 'undefined') return

    // 如果正在加载，等待加载完成
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    this.loadingPromise = this._loadFromKeyManager()
    try {
      await this.loadingPromise
    } finally {
      this.loadingPromise = null
    }
  }

  private async _loadFromKeyManager(): Promise<void> {
    try {
      // 检查 KeyManager 服务是否可用
      const isHealthy = await this.keyManagerClient.healthCheck()
      if (!isHealthy) {
        console.warn('KeyManager 服务不可用，地址池将为空')
        this.addresses = []
        return
      }

      // 将 chainId 转换为 KeyManager 的 chain 名称
      const chain = chainIdToKeyManagerChain(this.chainId)
      if (!chain) {
        console.warn(`不支持的 chainId: ${this.chainId}`)
        this.addresses = []
        return
      }

      // 从 KeyManager 批量获取地址（从索引 1 开始，获取 1000 个）
      const batchSize = 100 // 每次请求 100 个
      const totalCount = 1000 // 总共获取 1000 个地址
      const batches = Math.ceil(totalCount / batchSize)

      const allAddresses: KeyManagerAddress[] = []

      for (let i = 0; i < batches; i++) {
        const startIndex = i * batchSize + 1 // 从索引 1 开始
        const count = Math.min(batchSize, totalCount - i * batchSize)

        try {
          const addresses = await this.keyManagerClient.exportBatch(chain, startIndex, count)
          allAddresses.push(...addresses)
        } catch (error) {
          console.warn(`获取地址批次 ${i + 1}/${batches} 失败:`, error)
          // 继续获取其他批次
        }
      }

      // 转换为 AddressPoolAddress 格式
      this.addresses = allAddresses.map((addr) => ({
        id: `keymanager_${this.chainId}_${addr.index}`,
        address: addr.address.trim().toLowerCase(), // 统一转换为小写，确保比较一致
        chainId: this.chainId,
        label: `低风险地址${addr.index}`,
        usageCount: 0,
        lastUsedAt: undefined,
        isActive: true,
        keyManagerIndex: addr.index,
      }))

      console.log(`✅ 从 KeyManager 加载了 ${this.addresses.length} 个地址 (${chain})`)
    } catch (error) {
      console.error('从 KeyManager 加载地址池失败:', error)
      this.addresses = []
    }
  }

  /**
   * 从本地存储加载地址池（已废弃，改用 KeyManager）
   */
  private loadFromStorage(): void {
    // 不再从 localStorage 加载，改为从 KeyManager 加载
    if (typeof window !== 'undefined') {
      this.loadFromKeyManager()
    }
  }

  /**
   * 保存地址池到本地存储
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return

    const key = `addressPool_${this.chainId}`
    localStorage.setItem(key, JSON.stringify(this.addresses))
  }

  /**
   * 添加地址到地址池
   */
  addAddress(address: string, label?: string): void {
    // 检查是否已存在（统一转换为小写比较）
    const exists = this.addresses.some(
      (addr) => addr.address.toLowerCase() === address.toLowerCase().trim()
    )
    if (exists) {
      throw new Error('地址已存在于地址池中')
    }

    const newAddr: AddressPoolAddress = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      address: address.trim().toLowerCase(), // 统一转换为小写
      chainId: this.chainId,
      label: label?.trim(),
      usageCount: 0,
      lastUsedAt: undefined,
      isActive: true,
    }

    this.addresses.push(newAddr)
    this.saveToStorage()
  }

  /**
   * 批量添加地址
   */
  addAddresses(addresses: Array<{ address: string; label?: string }>): void {
    for (const addr of addresses) {
      try {
        this.addAddress(addr.address, addr.label)
      } catch (e) {
        // 忽略已存在的地址
        console.warn('地址已存在，跳过:', addr.address)
      }
    }
  }

  /**
   * 删除地址
   */
  removeAddress(addressId: string): void {
    this.addresses = this.addresses.filter((addr) => addr.id !== addressId)
    this.saveToStorage()
  }

  /**
   * 获取所有地址
   */
  getAllAddresses(): AddressPoolAddress[] {
    return this.addresses.filter((addr) => addr.isActive !== false)
  }

  /**
   * 获取地址数量
   */
  getAddressCount(): number {
    return this.addresses.filter((addr) => addr.isActive !== false).length
  }

  /**
   * 根据地址查找地址信息
   */
  getAddressByAddress(address: string): AddressPoolAddress | null {
    const normalizedAddress = address.trim().toLowerCase()
    return this.addresses.find(
      (addr) => addr.address.toLowerCase() === normalizedAddress && addr.isActive !== false
    ) || null
  }

  /**
   * 随机选择一个地址（用于源地址或目标地址）
   */
  getRandomAddress(excludeAddresses: string[] = []): AddressPoolAddress | null {
    const available = this.addresses.filter(
      (addr) =>
        addr.isActive !== false &&
        !excludeAddresses.some(
          (exclude) => exclude.toLowerCase() === addr.address.toLowerCase()
        )
    )

    if (available.length === 0) {
      return null
    }

    // 优先选择使用次数少的地址（负载均衡）
    const sorted = available.sort((a, b) => {
      const countA = a.usageCount || 0
      const countB = b.usageCount || 0
      return countA - countB
    })

    // 从前 20% 的地址中随机选择（负载均衡）
    const topPercent = Math.max(1, Math.floor(sorted.length * 0.2))
    const candidates = sorted.slice(0, topPercent)
    const selected = candidates[Math.floor(Math.random() * candidates.length)]

    // 更新使用统计
    selected.usageCount = (selected.usageCount || 0) + 1
    selected.lastUsedAt = Math.floor(Date.now() / 1000)
    this.saveToStorage()

    return selected
  }

  /**
   * 随机选择多个不同的地址
   */
  getRandomAddresses(count: number, excludeAddresses: string[] = []): AddressPoolAddress[] {
    const selected: AddressPoolAddress[] = []
    const exclude = [...excludeAddresses]

    for (let i = 0; i < count; i++) {
      const addr = this.getRandomAddress(exclude)
      if (!addr) {
        break // 地址池不足
      }
      selected.push(addr)
      exclude.push(addr.address)
    }

    return selected
  }

  /**
   * 检查地址池是否足够
   */
  isPoolSufficient(requiredCount: number): boolean {
    return this.getAddressCount() >= requiredCount
  }

  /**
   * 获取地址池统计信息
   */
  getStatistics(): {
    total: number
    active: number
    averageUsage: number
    leastUsed: AddressPoolAddress[]
    mostUsed: AddressPoolAddress[]
  } {
    const active = this.addresses.filter((addr) => addr.isActive !== false)
    const usageCounts = active.map((addr) => addr.usageCount || 0)
    const averageUsage =
      usageCounts.length > 0
        ? usageCounts.reduce((sum, count) => sum + count, 0) / usageCounts.length
        : 0

    const sorted = [...active].sort((a, b) => {
      const countA = a.usageCount || 0
      const countB = b.usageCount || 0
      return countA - countB
    })

    return {
      total: this.addresses.length,
      active: active.length,
      averageUsage,
      leastUsed: sorted.slice(0, 10), // 最少使用的10个
      mostUsed: sorted.slice(-10).reverse(), // 最多使用的10个
    }
  }

  /**
   * 清空地址池
   */
  clear(): void {
    this.addresses = []
    this.saveToStorage()
  }

  /**
   * 导出地址池
   */
  export(): string {
    return JSON.stringify(this.addresses, null, 2)
  }

  /**
   * 导入地址池
   */
  import(data: string): void {
    try {
      const imported = JSON.parse(data)
      if (Array.isArray(imported)) {
        this.addresses = imported
        this.saveToStorage()
      } else {
        throw new Error('无效的地址池数据格式')
      }
    } catch (e) {
      throw new Error('导入地址池失败: ' + (e as Error).message)
    }
  }
}

/**
 * 创建地址池服务实例（单例）
 */
const addressPoolInstances: Map<number, AddressPoolService> = new Map()

export function getAddressPoolService(chainId: number): AddressPoolService {
  if (!addressPoolInstances.has(chainId)) {
    addressPoolInstances.set(chainId, new AddressPoolService(chainId))
  }
  return addressPoolInstances.get(chainId)!
}
