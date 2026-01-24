import { makeAutoObservable } from 'mobx'

/**
 * 选中的凭证项
 */
export interface SelectedVoucher {
  id: string
  amount: number
  allocationId?: string
}

/**
 * SelectedVouchersStore - 管理选中的凭证
 * 用于在 DeFi 页面中持久化选中的凭证状态
 */
export class SelectedVouchersStore {
  // 选中的凭证列表
  selectedVouchers: SelectedVoucher[] = []

  // 选中的源代币
  selectedSourceToken: string = ''

  constructor() {
    makeAutoObservable(this)
    // 从 localStorage 恢复数据
    this.loadFromStorage()
  }

  /**
   * 设置选中的凭证
   */
  setSelectedVouchers(vouchers: SelectedVoucher[]) {
    this.selectedVouchers = vouchers
    this.saveToStorage()
  }

  /**
   * 添加凭证
   */
  addVoucher(voucher: SelectedVoucher) {
    if (!this.selectedVouchers.find(v => v.id === voucher.id)) {
      this.selectedVouchers.push(voucher)
      this.saveToStorage()
    }
  }

  /**
   * 移除凭证
   */
  removeVoucher(voucherId: string) {
    this.selectedVouchers = this.selectedVouchers.filter(v => v.id !== voucherId)
    this.saveToStorage()
  }

  /**
   * 清空选中的凭证
   */
  clearVouchers() {
    this.selectedVouchers = []
    this.saveToStorage()
  }

  /**
   * 设置选中的源代币
   */
  setSelectedSourceToken(tokenId: string) {
    this.selectedSourceToken = tokenId
    this.saveToStorage()
  }

  /**
   * 保存到 localStorage
   */
  private saveToStorage() {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedVouchers', JSON.stringify(this.selectedVouchers))
        localStorage.setItem('selectedSourceToken', this.selectedSourceToken)
      }
    } catch (error) {
      console.error('保存选中凭证到 localStorage 失败:', error)
    }
  }

  /**
   * 从 localStorage 加载
   */
  private loadFromStorage() {
    try {
      if (typeof window !== 'undefined') {
        const savedVouchers = localStorage.getItem('selectedVouchers')
        if (savedVouchers) {
          this.selectedVouchers = JSON.parse(savedVouchers)
        }

        const savedToken = localStorage.getItem('selectedSourceToken')
        if (savedToken) {
          this.selectedSourceToken = savedToken
        }
      }
    } catch (error) {
      console.error('从 localStorage 加载选中凭证失败:', error)
    }
  }
}

// 创建单例实例
export const selectedVouchersStore = new SelectedVouchersStore()

