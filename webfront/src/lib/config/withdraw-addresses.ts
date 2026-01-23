import { verifyAddressList, type WithdrawAddressConfig, type VerifiedWithdrawAddress } from '../utils/address-signature'

/**
 * 地址列表 Store
 */
class WithdrawAddressStore {
  private addresses: VerifiedWithdrawAddress[] = []
  private isValid: boolean = false
  private isLoading: boolean = false
  private error: string | null = null

  /**
   * 加载地址列表
   */
  async loadAddresses(): Promise<void> {
    this.isLoading = true
    this.error = null

    try {
      // 从 public/config/withdraw-addresses.json 加载
      const response = await fetch('/config/withdraw-addresses.json')
      
      if (!response.ok) {
        // 如果文件不存在（404），视为空列表，允许手工输入
        if (response.status === 404) {
          console.log('地址列表配置文件不存在，允许手工输入')
          this.addresses = []
          this.isValid = true // 空列表视为有效
          return
        }
        throw new Error(`加载地址列表失败: ${response.status} ${response.statusText}`)
      }

      const addresses: WithdrawAddressConfig[] = await response.json()

      if (!Array.isArray(addresses)) {
        throw new Error('地址列表格式错误: 必须是数组')
      }

      // 如果地址列表为空，视为有效（允许手工输入）
      if (addresses.length === 0) {
        console.log('地址列表为空，允许手工输入')
        this.addresses = []
        this.isValid = true
        return
      }

      // 验证每个地址的签名
      const verifiedAddresses = verifyAddressList(addresses)

      // 检查是否有验证失败的地址
      const invalidAddresses = verifiedAddresses.filter((addr) => !addr.isValid)
      if (invalidAddresses.length > 0) {
        console.error('以下地址签名验证失败:', invalidAddresses)
        this.error = `${invalidAddresses.length} 个地址签名验证失败`
        // 仍然保存地址列表，但标记为无效
        this.isValid = false
      } else {
        this.isValid = true
        console.log(`✅ 成功加载并验证 ${verifiedAddresses.length} 个地址`)
      }

      this.addresses = verifiedAddresses
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      console.error('加载地址列表失败:', errorMessage)
      this.error = errorMessage
      this.isValid = false
      this.addresses = []
    } finally {
      this.isLoading = false
    }
  }

  /**
   * 获取所有验证通过的地址
   */
  getValidAddresses(): VerifiedWithdrawAddress[] {
    return this.addresses.filter((addr) => addr.isValid)
  }

  /**
   * 获取所有地址（包括验证失败的）
   */
  getAllAddresses(): VerifiedWithdrawAddress[] {
    return this.addresses
  }

  /**
   * 根据 ID 获取地址
   */
  getAddressById(id: number): VerifiedWithdrawAddress | undefined {
    return this.addresses.find((addr) => addr.id === id)
  }

  /**
   * 检查地址列表是否有效
   */
  getIsValid(): boolean {
    return this.isValid
  }

  /**
   * 获取加载状态
   */
  getIsLoading(): boolean {
    return this.isLoading
  }

  /**
   * 获取错误信息
   */
  getError(): string | null {
    return this.error
  }

  /**
   * 重置状态
   */
  reset() {
    this.addresses = []
    this.isValid = false
    this.isLoading = false
    this.error = null
  }
}

// 创建全局 Store 实例
export const withdrawAddressStore = new WithdrawAddressStore()
