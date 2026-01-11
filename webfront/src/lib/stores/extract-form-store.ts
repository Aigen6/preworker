import { makeAutoObservable } from 'mobx'

/**
 * 提取表单状态管理 Store
 * 管理：凭证详情（源代币）、提取到链、目标代币、收益地址
 */
class ExtractFormStore {
  // 提取到链（网络）
  selectedNetwork: string = ''
  
  // 目标代币（默认 USDT）
  selectedTargetToken: string = 'USDT'
  
  // 源代币（从凭证详情中获取）
  selectedSourceToken: string = ''
  
  // 收益地址
  receivingAddress: string = ''
  
  // 收益地址验证状态
  isReceivingAddressValid: boolean = false
  
  // 网络选择器打开状态
  isNetworkSelectorOpen: boolean = false

  constructor() {
    makeAutoObservable(this)
    this.loadFromLocalStorage()
  }

  setSelectedNetwork(network: string) {
    this.selectedNetwork = network
    this.saveToLocalStorage()
  }

  setSelectedTargetToken(token: string) {
    this.selectedTargetToken = token
    this.saveToLocalStorage()
  }

  setSelectedSourceToken(token: string) {
    this.selectedSourceToken = token
    this.saveToLocalStorage()
  }

  setReceivingAddress(address: string) {
    this.receivingAddress = address
    // 收益地址不保存到 localStorage，离开页面时清空
  }

  setReceivingAddressValid(isValid: boolean) {
    this.isReceivingAddressValid = isValid
  }

  setIsNetworkSelectorOpen(open: boolean) {
    this.isNetworkSelectorOpen = open
  }

  // 重置所有状态
  reset() {
    this.selectedNetwork = ''
    this.selectedTargetToken = 'USDT'
    this.selectedSourceToken = ''
    this.receivingAddress = ''
    this.isReceivingAddressValid = false
    this.isNetworkSelectorOpen = false
    this.saveToLocalStorage()
  }

  // 从 localStorage 加载
  private loadFromLocalStorage() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('extractFormState')
      if (stored) {
        try {
          const state = JSON.parse(stored)
          if (state.selectedNetwork) this.selectedNetwork = state.selectedNetwork
          if (state.selectedTargetToken) this.selectedTargetToken = state.selectedTargetToken
          if (state.selectedSourceToken) this.selectedSourceToken = state.selectedSourceToken
          // 收益地址不加载，离开页面时清空
        } catch (error) {
          console.error('Failed to load extract form state from localStorage:', error)
        }
      }
    }
  }

  // 保存到 localStorage
  private saveToLocalStorage() {
    if (typeof window !== 'undefined') {
      try {
        const state = {
          selectedNetwork: this.selectedNetwork,
          selectedTargetToken: this.selectedTargetToken,
          selectedSourceToken: this.selectedSourceToken,
          // 收益地址不保存，离开页面时清空
        }
        localStorage.setItem('extractFormState', JSON.stringify(state))
      } catch (error) {
        console.error('Failed to save extract form state to localStorage:', error)
      }
    }
  }
}

export const extractFormStore = new ExtractFormStore()

