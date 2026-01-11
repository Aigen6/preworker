import { makeAutoObservable } from 'mobx'

/**
 * WalletStore - 钱包连接状态管理
 * 包装 wallet-sdk 的状态，提供响应式更新
 */
export class WalletStore {
  // 当前连接的链ID
  chainId: number | null = null
  
  // 当前连接的地址
  address: string | null = null
  
  // 是否已连接
  isConnected = false
  
  // 是否正在连接
  isConnecting = false
  
  // 错误信息
  error: string | null = null

  constructor() {
    makeAutoObservable(this)
  }

  /**
   * 更新连接状态
   */
  updateConnection(chainId: number | null, address: string | null) {
    this.chainId = chainId
    this.address = address
    this.isConnected = chainId !== null && address !== null
  }

  /**
   * 设置连接中状态
   */
  setConnecting(isConnecting: boolean) {
    this.isConnecting = isConnecting
  }

  /**
   * 设置错误
   */
  setError(error: string | null) {
    this.error = error
  }

  /**
   * 清除错误
   */
  clearError() {
    this.error = null
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.chainId = null
    this.address = null
    this.isConnected = false
    this.error = null
  }
}

