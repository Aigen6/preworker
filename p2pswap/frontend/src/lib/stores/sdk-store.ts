import { makeAutoObservable } from 'mobx'
import { EnclaveClient, WalletSDKContractProvider, createUniversalAddress, parseUniversalAddress, extractAddress } from '@enclave-hq/sdk'
import type { WalletManager } from '@enclave-hq/wallet-sdk'

// SDK 数据类型定义
export interface Deposit {
  id: string
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
  timestamp: number
}

export interface Checkbook {
  id: string
  name: string
  balance: number
  currency: string
  isActive: boolean
}

export interface Allocation {
  id: string
  amount: number
  currency: string
  from: string
  to: string
  status: 'pending' | 'completed' | 'failed'
  timestamp: number
}

export interface Withdrawal {
  id: string
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
  timestamp: number
}

export interface Price {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  timestamp: number
}

export interface Pool {
  id: string
  name: string
  totalLiquidity: number
  apy: number
  tokens: string[]
}

export interface Token {
  symbol: string
  name: string
  decimals: number
  address: string
  logoUrl?: string
}

// SDK Store 类
export class SDKStore {
  // 数据状态
  deposits: Deposit[] = []
  checkbooks: Checkbook[] = []
  allocations: Allocation[] = []
  withdrawals: Withdrawal[] = []
  prices: Price[] = []
  pools: Pool[] = []
  tokens: Token[] = []

  // 连接状态
  isConnected = false
  isLoading = false
  error: string | null = null

  // Enclave SDK 实例
  private _sdk: EnclaveClient | null = null

  // 保存 WalletManager 引用，用于 token 刷新
  private _walletManager: WalletManager | null = null

  // JWT Token 过期时间（24小时）
  private tokenExpiryTime: number | null = null
  private tokenRefreshTimer: NodeJS.Timeout | null = null

  constructor() {
    makeAutoObservable(this)
    this.loadTokenExpiryFromStorage()
    this.startTokenRefreshTimer()
  }

  /**
   * 获取 SDK 实例（只读）
   */
  get sdk(): EnclaveClient | null {
    return this._sdk
  }

  /**
   * 设置 SDK 实例
   */
  setSDK(sdk: EnclaveClient | null) {
    // 如果已经有 SDK 实例，先断开连接（防止多个 WebSocket 连接）
    if (this._sdk && this._sdk !== sdk) {
      console.warn('[SDK Store] ⚠️ 检测到多个 SDK 实例，断开旧实例以避免重复 WebSocket 连接')
      try {
        this._sdk.disconnect()
      } catch (err) {
        console.error('[SDK Store] 断开旧 SDK 实例失败:', err)
      }
    }
    this._sdk = sdk
    this.isConnected = sdk !== null && sdk.isConnected
    if (sdk) {
      const wsUrl = (sdk as any)['wsClient']?.['config']?.['url']
    }
  }

  /**
   * 从 WalletManager 创建 signer adapter
   * 
   * 注意：现在可以直接使用 Wallet SDK 的适配器作为 signer（因为适配器实现了 ISigner 接口）
   * 但为了保持兼容性，这里仍然使用自定义 signer 对象
   * 
   * 新的 SDK 可以直接处理 TRON 的 Base58 地址，不需要转换
   */
  private createWalletSigner(walletManager: WalletManager) {
    return {
      getAddress: async (): Promise<string> => {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          console.error('[SDK Store] ❌ Signer.getAddress: 没有账户连接')
          throw new Error('No account connected')
        }
        
        console.log('[SDK Store] 📋 Signer.getAddress 返回地址:', {
          nativeAddress: account.nativeAddress,
          chainId: account.chainId,
          universalAddress: account.universalAddress,
        })
        
        // 直接返回 nativeAddress，让 SDK 的 createUniversalAddress 来处理地址格式
        // SDK 现在可以自动识别 EVM (0x...) 和 TRON (T...) 地址格式
        return account.nativeAddress
      },
      signMessage: async (message: string | Uint8Array): Promise<string> => {
        try {
          // 检查钱包是否连接
          const account = walletManager.getPrimaryAccount()
          if (!account) {
            throw new Error('Wallet is not connected. Please connect wallet first.')
          }

          let messageStr: string
          if (typeof message === 'string') {
            messageStr = message
          } else {
            // Convert Uint8Array to hex string (browser compatible)
            messageStr = Array.from(message)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')
          }
          
          console.log('🔐 [Withdraw] 开始签名消息...')
          console.log('📝 [Withdraw] 签名消息内容:')
          console.log('─'.repeat(60))
          // 如果是多行消息，分行打印
          if (messageStr.includes('\n')) {
            const lines = messageStr.split('\n').filter(line => line.length > 0)
            lines.forEach(line => {
              console.log(line)
            })
          } else {
            console.log(messageStr.substring(0, 200) + (messageStr.length > 200 ? '...' : ''))
          }
          console.log('─'.repeat(60))
          
          const signature = await walletManager.signMessage(messageStr)
          console.log('✅ [Withdraw] 签名成功:', signature.substring(0, 20) + '...' + signature.substring(signature.length - 10))
          return signature
        } catch (error) {
          console.error('[SDK Store] Sign message error:', error)
          // 重新抛出错误，让上层处理
          throw error
        }
      },
    }
  }

  // 连接 SDK（使用 WalletManager）
  async connect(walletManager?: WalletManager, config?: { apiUrl?: string; wsUrl?: string }, forceReconnect: boolean = false) {
    this.isLoading = true
    this.error = null
    try {
      // 如果没有 walletManager，无法连接（前端使用钱包连接，不是 signer）
      if (!walletManager) {
        throw new Error('WalletManager is required. Please connect wallet first.')
      }

      // 检查钱包是否已连接
      const account = walletManager.getPrimaryAccount()
      if (!account) {
        throw new Error('Wallet is not connected. Please connect wallet first.')
      }

      // 如果已有 SDK 实例且已连接，检查地址或链 ID 是否变化
      if (this._sdk && this._sdk.isConnected && !forceReconnect) {
        // 获取 SDK 当前使用的地址和链 ID
        const sdkAddress = this._sdk.address ? extractAddress(this._sdk.address) : null
        const sdkChainId = this._sdk.address?.chainId || null
        const currentAddress = account.nativeAddress
        const currentChainId = account.chainId
        
        // 检查地址是否变化
        const addressChanged = sdkAddress && currentAddress && sdkAddress.toLowerCase() !== currentAddress.toLowerCase()
        
        // 检查链 ID 是否变化
        // 重要：SDK 使用 chainId 创建 UniversalAddress，如果链 ID 变化，必须重新连接
        const chainIdChanged = sdkChainId && currentChainId && sdkChainId !== currentChainId
        
        // 如果地址和链 ID 都一致，直接返回
        if (!addressChanged && !chainIdChanged && sdkAddress && currentAddress && sdkAddress.toLowerCase() === currentAddress.toLowerCase()) {
          this.isConnected = true
          this.isLoading = false
          return
        }
        
        // 如果地址或链 ID 变化，记录日志
        if (addressChanged || chainIdChanged) {
          console.log('[SDK Store] 检测到变化，需要重新连接:', {
            reason: addressChanged ? '地址变化' : '链 ID 变化',
            oldAddress: sdkAddress,
            newAddress: currentAddress,
            oldChainId: sdkChainId,
            newChainId: currentChainId
          })
        }
        
        // 如果地址不一致，需要完全断开并重新连接（清除所有 JWT token）
        // 使用 disconnect 方法完全清除所有状态和 JWT token
        await this.disconnect()
        // 等待更长时间确保所有清理操作完成，包括：
        // 1. SDK 断开连接
        // 2. 清除所有 token
        // 3. 清除所有存储
        // 4. 确保 SDK 实例完全销毁
        await new Promise(resolve => setTimeout(resolve, 500))
      } else if (this._sdk && this._sdk.isConnected && forceReconnect) {
        // 强制重新连接，即使地址一致也要断开并重新连接
        await this.disconnect()
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // 创建新的 SDK 实例
      const apiUrl = config?.apiUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const wsUrl = config?.wsUrl || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws'

      // 从 WalletManager 创建 signer
      const signer = this.createWalletSigner(walletManager)

      // 使用钱包账户的 chainId 创建 UniversalAddress
      // account.chainId 是原生链ID，createUniversalAddress 会自动转换为 SLIP-44
      // 这样 SDK 就能正确识别 TRON 地址（chainId=195）和 EVM 地址
      // 先检查地址格式
      const isTronFormat = account.nativeAddress.length === 34 && account.nativeAddress.startsWith('T')
      
      console.log('[SDK Store] 📋 创建 UniversalAddress 前的信息:', {
        nativeAddress: account.nativeAddress,
        chainId: account.chainId,
        universalAddress: account.universalAddress,
        isTronFormat,
        accountType: typeof account,
        accountKeys: Object.keys(account),
      })
      
      let universalAddress
      try {
        let baseAddress: any
        
        // 检查 account.universalAddress 是否是字符串格式 (chainId:address)
        // 如果是，使用 parseUniversalAddress 解析；否则使用 createUniversalAddress 创建
        if (account.universalAddress && typeof account.universalAddress === 'string' && account.universalAddress.includes(':')) {
          // 字符串格式：'195:TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9'
          console.log('[SDK Store] 🔧 使用 parseUniversalAddress 解析:', account.universalAddress)
          universalAddress = parseUniversalAddress(account.universalAddress)
          console.log('[SDK Store] ✅ parseUniversalAddress 结果:', {
            chainId: universalAddress.chainId,
            data: universalAddress.data,
            extractedAddress: extractAddress(universalAddress),
          })
        } else {
          // 使用 nativeAddress 和 chainId 创建 UniversalAddress
          console.log('[SDK Store] 🔧 使用 createUniversalAddress 创建:', {
            nativeAddress: account.nativeAddress,
            chainId: account.chainId,
          })
          universalAddress = createUniversalAddress(account.nativeAddress, account.chainId)
          console.log('[SDK Store] ✅ createUniversalAddress 结果:', {
            chainId: universalAddress.chainId,
            data: universalAddress.data,
            extractedAddress: extractAddress(universalAddress),
          })
        }
      } catch (error) {
        console.error('[SDK Store] UniversalAddress 创建/解析失败:', {
          error,
          nativeAddress: account.nativeAddress,
          universalAddress: account.universalAddress,
          chainId: account.chainId,
          addressType: typeof account.nativeAddress,
          universalAddressType: typeof account.universalAddress,
          addressValue: JSON.stringify(account.nativeAddress),
          universalAddressValue: JSON.stringify(account.universalAddress),
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        })
        throw error
      }

      console.log('[SDK Store] 🔧 创建 EnclaveClient 配置:', {
        apiUrl,
        wsUrl,
        universalAddress: {
          chainId: universalAddress.chainId,
          data: universalAddress.data,
          extractedAddress: extractAddress(universalAddress),
        },
        expectedNativeAddress: account.nativeAddress,
      })

      const sdk = new EnclaveClient({
        apiUrl,
        wsUrl,
        signer,
        address: universalAddress, // 传递正确的地址，让 SDK 使用正确的 chainId
        autoReconnect: true, // 启用自动重连
        maxReconnectAttempts: 5, // 最大重连次数
        reconnectDelay: 1000, // 重连延迟（毫秒）
        cacheAuth: false, // 禁用认证缓存，确保每次连接都重新认证
      })
      
      console.log('[SDK Store] ✅ EnclaveClient 创建完成，SDK 初始地址:', {
        sdkAddress: sdk.address ? {
          chainId: sdk.address.chainId,
          data: sdk.address.data,
          extractedAddress: extractAddress(sdk.address),
        } : null,
      })

      // 在连接之前，强制清除 SDK 内部可能存在的任何 token
      // 确保 SDK 不会使用任何缓存的 token
      const apiClient = (sdk as any).apiClient
      if (apiClient) {
        // 清除 apiClient 中的 token
        if (typeof apiClient.clearAuthToken === 'function') {
          apiClient.clearAuthToken()
        }
        // 清除所有可能的 token 属性
        const tokenProperties = ['authToken', 'token', '_authToken', '_token', 'jwtToken', 'accessToken']
        tokenProperties.forEach(prop => {
          if (apiClient[prop]) {
            apiClient[prop] = null
            delete apiClient[prop]
          }
        })
      }
      
      const wsClient = (sdk as any).wsClient
      if (wsClient) {
        // 清除 wsClient 中的 token
        if (wsClient.authToken) {
          wsClient.authToken = null
        }
        if (wsClient.token) {
          wsClient.token = null
        }
      }

      // 连接 SDK（强制重新认证，不使用缓存的 token）
      try {
        console.log('[SDK Store] 🔗 开始连接 SDK...')
        await sdk.connect()
        console.log('[SDK Store] ✅ SDK 连接成功')
      } catch (error) {
        console.error('[SDK Store] ❌ SDK 连接失败:', error)
        throw error
      }
      
      // 验证 SDK 使用的地址是否正确
      const connectedAddress = sdk.address ? extractAddress(sdk.address) : null
      console.log('[SDK Store] 🔍 验证 SDK 连接后的地址:', {
        expected: account.nativeAddress,
        actual: connectedAddress,
        sdkAddressObject: sdk.address ? {
          chainId: sdk.address.chainId,
          data: sdk.address.data,
          extractedAddress: extractAddress(sdk.address),
        } : null,
        match: connectedAddress && connectedAddress.toLowerCase() === account.nativeAddress.toLowerCase(),
      })
      
      if (connectedAddress && connectedAddress.toLowerCase() !== account.nativeAddress.toLowerCase()) {
        console.error('[SDK Store] ⚠️ SDK 连接后地址不匹配:', {
          expected: account.nativeAddress,
          actual: connectedAddress,
          expectedChainId: account.chainId,
          actualChainId: sdk.address?.chainId,
          expectedUniversalAddress: universalAddress ? {
            chainId: universalAddress.chainId,
            data: universalAddress.data,
          } : null,
          actualUniversalAddress: sdk.address ? {
            chainId: sdk.address.chainId,
            data: sdk.address.data,
          } : null,
        })
        throw new Error(`SDK 连接后地址不匹配: 期望 ${account.nativeAddress}, 实际 ${connectedAddress}`)
      }
      
      // 验证 apiClient 的认证 token 是否已更新
      const apiClientAfterConnect = (sdk as any).apiClient
      if (apiClientAfterConnect) {
        const token = apiClientAfterConnect.getAuthToken?.() || apiClientAfterConnect.authToken || apiClientAfterConnect.token
        if (token) {
          
          // 验证 token 是否是新生成的（通过检查 token 是否与当前地址相关）
          // 如果 SDK 使用了旧 token，这里可以检测到
          try {
            // JWT token 的 payload 部分（base64 编码）可能包含地址信息
            // 但为了不破坏 token，我们只验证 token 是否存在
            // 实际的地址验证由后端完成
          } catch (error) {
            console.warn('[SDK Store] ⚠️ Token 验证失败:', error)
          }
        } else {
          console.warn('[SDK Store] ⚠️ SDK 连接后未找到认证 token，可能需要重新连接')
          // 如果没有 token，说明 SDK 可能使用了缓存的 token，需要强制重新认证
          throw new Error('SDK 连接后未生成认证 token，可能使用了缓存的 token')
        }
      }

      // 保存 SDK 实例和 WalletManager 引用
      this.setSDK(sdk)
      this._walletManager = walletManager
      
      // 设置 JWT Token 过期时间（24小时）
      this.setTokenExpiry(24 * 60 * 60 * 1000) // 24小时 = 24 * 60 * 60 * 1000 毫秒
      
      // 拉取初始数据
      await this.fetchInitialData()
      
      this.isConnected = true
    } catch (error) {
      // 检查是否是用户拒绝签名
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorLower = errorMessage.toLowerCase()
      
      const isUserRejection = 
        errorLower.includes('rejected') || 
        errorLower.includes('user rejected') ||
        errorLower.includes('signature was rejected') ||
        errorLower.includes('user denied') ||
        errorLower.includes('user cancelled') ||
        errorLower.includes('user canceled') ||
        errorLower.includes('4001') || // MetaMask rejection code
        errorLower.includes('authentication cancelled')
      
      if (isUserRejection) {
        // 用户拒绝签名，不设置错误状态，静默处理
        this.error = null
      } else {
        // 其他错误，提供更详细的错误信息
        let errorMsg = 'SDK 连接失败'
        
        // 检查是否是 SDK 错误类型（通过检查 error 对象的属性）
        if (error && typeof error === 'object') {
          const err = error as any
          
          // 网络错误
          if (err.code === 'NETWORK_ERROR' || errorMessage.includes('network') || errorMessage.includes('连接')) {
            errorMsg = `网络连接失败: ${errorMessage}. 请检查您的网络连接和 API 地址。`
          }
          // API 错误
          else if (err.code === 'API_ERROR' || err.statusCode) {
            errorMsg = `服务器错误: ${errorMessage}. 请稍后重试或联系支持。`
          }
          // 认证错误（非用户拒绝）
          else if (err.code === 'AUTH_ERROR' && !isUserRejection) {
            // 检查错误详情中的步骤
            if (err.details?.step === 'get_nonce') {
              errorMsg = `无法连接到认证服务器: ${errorMessage}. 请检查您的网络连接和 API 地址。`
            } else if (err.details?.step === 'sign_message') {
              errorMsg = `签名失败: ${errorMessage}. 请确保钱包已解锁。`
            } else if (err.details?.step === 'authenticate') {
              errorMsg = `认证失败: ${errorMessage}. 请重试。`
            } else {
              errorMsg = `认证错误: ${errorMessage}`
            }
          }
          // 其他错误
          else {
            errorMsg = error instanceof Error ? error.message : String(error)
          }
        } else {
          errorMsg = error instanceof Error ? error.message : String(error)
        }
        
        this.error = errorMsg
        console.error('SDK 连接错误:', {
          message: errorMsg,
          originalError: error,
          errorDetails: error && typeof error === 'object' ? (error as any).details : undefined
        })
      }
      throw error
    } finally {
      this.isLoading = false
    }
  }

  // 断开连接（完全清除所有状态，包括 JWT token）
  async disconnect() {
    // 停止 token 刷新定时器
    this.stopTokenRefreshTimer()
    
    // 清除 token 过期时间（必须在断开 SDK 之前清除）
    this.clearTokenExpiry()
    
    if (this._sdk) {
      try {
        // 尝试清除 SDK 内部的认证缓存（如果存在）
        if (typeof (this._sdk as any).clearAuthCache === 'function') {
          ;(this._sdk as any).clearAuthCache()
        }
        
        // 尝试清除 SDK 的 auth token（如果存在）
        if (typeof (this._sdk as any).clearAuthToken === 'function') {
          ;(this._sdk as any).clearAuthToken()
        }
        
        // 尝试清除 apiClient 中的认证 token（如果存在）
        const apiClient = (this._sdk as any).apiClient
        if (apiClient) {
          // 尝试清除 apiClient 的 token
          if (typeof apiClient.clearAuthToken === 'function') {
            apiClient.clearAuthToken()
          }
          // 尝试清除 apiClient 的认证缓存
          if (typeof apiClient.clearAuthCache === 'function') {
            apiClient.clearAuthCache()
          }
          // 尝试直接清除 token 属性（多种可能的属性名）
          const tokenProperties = ['authToken', 'token', '_authToken', '_token', 'jwtToken', 'accessToken']
          tokenProperties.forEach(prop => {
            if (apiClient[prop]) {
              apiClient[prop] = null
              delete apiClient[prop]
            }
          })
          
          // 尝试清除 apiClient 的配置中的 token
          if (apiClient.config) {
            tokenProperties.forEach(prop => {
              if (apiClient.config[prop]) {
                apiClient.config[prop] = null
                delete apiClient.config[prop]
              }
            })
          }
        }
        
        // 尝试清除 wsClient 中的认证信息（如果存在）
        const wsClient = (this._sdk as any).wsClient
        if (wsClient) {
          if (wsClient.authToken) {
            wsClient.authToken = null
          }
          if (wsClient.token) {
            wsClient.token = null
          }
        }
        
        // 断开 SDK 连接
        await this._sdk.disconnect()
        
        // 等待一小段时间，确保 SDK 内部的清理操作完成
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error('[SDK Store] SDK 断开连接错误:', error)
      }
      
      // 清除 SDK 实例引用
      this.setSDK(null)
    }
    
    // 清除 WalletManager 引用
    this._walletManager = null
    this.isConnected = false
    this.isLoading = false
    
    // 确保清除所有存储的 token 相关信息
    try {
      if (typeof window !== 'undefined') {
        // 清除可能存储的 JWT token
        localStorage.removeItem('jwtToken')
        localStorage.removeItem('jwtTokenExpiry')
        localStorage.removeItem('enclave_auth_token')
        
        // 清除 sessionStorage 中可能存储的 token
        sessionStorage.removeItem('jwtToken')
        sessionStorage.removeItem('enclave_auth_token')
        
        // 清除 SDK 可能存储的其他认证信息
        const localStorageKeys = Object.keys(localStorage)
        localStorageKeys.forEach(key => {
          if (key.includes('enclave') && (key.includes('auth') || key.includes('token'))) {
            localStorage.removeItem(key)
          }
        })
        
        const sessionStorageKeys = Object.keys(sessionStorage)
        sessionStorageKeys.forEach(key => {
          if (key.includes('enclave') && (key.includes('auth') || key.includes('token'))) {
            sessionStorage.removeItem(key)
          }
        })
        
        // 尝试清除 IndexedDB 中的认证信息（如果 SDK 使用了 IndexedDB）
        if (typeof indexedDB !== 'undefined') {
          try {
            // 尝试删除可能的 IndexedDB 数据库
            const dbNames = ['enclave', 'enclave-auth', 'enclave-sdk']
            for (const dbName of dbNames) {
              try {
                const deleteReq = indexedDB.deleteDatabase(dbName)
                deleteReq.onsuccess = () => {
                }
                deleteReq.onerror = () => {
                  // 忽略错误，可能数据库不存在
                }
              } catch (err) {
                // 忽略错误
              }
            }
          } catch (err) {
            console.warn('[SDK Store] 清除 IndexedDB 失败:', err)
          }
        }
      }
    } catch (error) {
      console.warn('[SDK Store] 清除存储中的 token 失败:', error)
    }
    
  }

  /**
   * 设置 JWT Token 过期时间
   * @param durationMs 过期时长（毫秒），默认 24 小时
   */
  private setTokenExpiry(durationMs: number = 24 * 60 * 60 * 1000) {
    this.tokenExpiryTime = Date.now() + durationMs
    this.saveTokenExpiryToStorage()
    this.startTokenRefreshTimer()
  }

  /**
   * 清除 token 过期时间
   */
  private clearTokenExpiry() {
    this.tokenExpiryTime = null
    this.clearTokenExpiryFromStorage()
    this.stopTokenRefreshTimer()
  }

  /**
   * 保存 token 过期时间到 localStorage
   */
  private saveTokenExpiryToStorage() {
    if (typeof window !== 'undefined' && this.tokenExpiryTime) {
      try {
        localStorage.setItem('jwtTokenExpiry', this.tokenExpiryTime.toString())
      } catch (error) {
        console.error('保存 JWT token 过期时间失败:', error)
      }
    }
  }

  /**
   * 从 localStorage 加载 token 过期时间
   */
  private loadTokenExpiryFromStorage() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('jwtTokenExpiry')
        if (saved) {
          const expiryTime = parseInt(saved, 10)
          // 检查是否已过期
          if (expiryTime > Date.now()) {
            this.tokenExpiryTime = expiryTime
            this.startTokenRefreshTimer()
          } else {
            // 已过期，清除
            this.clearTokenExpiryFromStorage()
          }
        }
      } catch (error) {
        console.error('加载 JWT token 过期时间失败:', error)
      }
    }
  }

  /**
   * 从 localStorage 清除 token 过期时间
   */
  private clearTokenExpiryFromStorage() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('jwtTokenExpiry')
      } catch (error) {
        console.error('清除 JWT token 过期时间失败:', error)
      }
    }
  }

  /**
   * 启动 token 刷新定时器
   * 在过期前 5 分钟自动重新认证
   */
  private startTokenRefreshTimer() {
    // 清除之前的定时器
    this.stopTokenRefreshTimer()

    if (!this.tokenExpiryTime || !this._sdk || !this.isConnected) {
      return
    }

    const now = Date.now()
    const timeUntilExpiry = this.tokenExpiryTime - now
    const refreshBeforeExpiry = 5 * 60 * 1000 // 提前 5 分钟刷新

    // 如果已经过期或即将过期（5分钟内），立即刷新
    if (timeUntilExpiry <= refreshBeforeExpiry) {
      this.refreshToken()
      return
    }

    // 设置在过期前 5 分钟刷新
    const delay = timeUntilExpiry - refreshBeforeExpiry
    this.tokenRefreshTimer = setTimeout(() => {
      this.refreshToken()
    }, delay) as unknown as NodeJS.Timeout
  }

  /**
   * 停止 token 刷新定时器
   */
  private stopTokenRefreshTimer() {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }
  }

  /**
   * 刷新 token（重新认证）
   */
  private async refreshToken() {
    if (!this._sdk || !this.isConnected || !this._walletManager) {
      return
    }

    try {
      // 重新连接 SDK 以获取新的 token
      await this.connect(this._walletManager)
    } catch (error) {
      console.error('[SDK Store] JWT token 刷新失败:', error)
      // 刷新失败，清除过期时间，让用户重新连接
      this.clearTokenExpiry()
    }
  }

  // 拉取初始数据
  private async fetchInitialData() {
    if (!this._sdk) {
      // SDK 未初始化时，不抛出错误，允许使用模拟数据
      console.warn('SDK 未初始化，跳过数据获取')
      return
    }

    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取初始数据')
      return
    }

    // 保存 SDK 引用到局部变量，确保在 Promise 回调中类型安全
    const sdk = this._sdk

    try {
      // 使用真实的 SDK stores 获取数据
      // SDK 的 stores 会自动通过 WebSocket 更新，这里只需要触发初始加载
      await Promise.all([
        sdk.stores.checkbooks.fetchList().catch(err => {
          console.warn('获取 Checkbooks 失败:', err)
        }),
        sdk.stores.allocations.fetchList().catch(err => {
          console.warn('获取 Allocations 失败:', err)
        }),
        sdk.stores.withdrawals.fetchList().catch(err => {
          console.warn('获取 Withdrawals 失败:', err)
        }),
        sdk.stores.prices.fetchPrices().catch(err => {
          console.warn('获取 Prices 失败:', err)
        }),
        sdk.stores.pools.fetchPools().catch(err => {
          console.warn('获取 Pools 失败:', err)
        }),
        // 获取链配置
        sdk.stores.chainConfig.fetchChains()
          .catch(err => {
            console.warn('获取 Chain Config 失败:', err)
          }),
      ])
    } catch (error) {
      console.error('获取初始数据失败:', error)
      // 不抛出错误，允许继续使用
    }
  }

  // 获取存款数据（已废弃，使用 SDK stores.checkbooks 代替）
  async fetchDeposits() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取存款数据')
      return
    }

    try {
      // 使用 SDK 的 checkbooks store
      await this._sdk.stores.checkbooks.fetchList()
      // 可以在这里转换格式，或者直接使用 SDK stores
    } catch (error) {
      console.error('获取存款数据失败:', error)
    }
  }

  // 获取支票簿数据（使用 SDK stores）
  async fetchCheckbooks() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取支票簿数据')
      return
    }

    try {
      // 使用 SDK 的 checkbooks store
      await this._sdk.stores.checkbooks.fetchList()
      // SDK stores 会自动更新，这里不需要手动更新本地状态
    } catch (error) {
      console.error('获取支票簿数据失败:', error)
    }
  }

  // 获取分配数据（使用 SDK stores）
  async fetchAllocations() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取分配数据')
      return
    }

    try {
      // 使用 SDK 的 allocations store
      await this._sdk.stores.allocations.fetchList()
      // SDK stores 会自动更新
    } catch (error) {
      console.error('获取分配数据失败:', error)
    }
  }

  // 获取提款数据（使用 SDK stores）
  async fetchWithdrawals() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取提款数据')
      return
    }

    try {
      // 使用 SDK 的 withdrawals store
      await this._sdk.stores.withdrawals.fetchList()
      // SDK stores 会自动更新
    } catch (error) {
      console.error('获取提款数据失败:', error)
    }
  }

  // 获取价格数据（使用 SDK stores）
  async fetchPrices() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取价格数据')
      return
    }

    try {
      // 使用 SDK 的 prices store
      await this._sdk.stores.prices.fetchPrices()
      // SDK stores 会自动更新
    } catch (error) {
      console.error('获取价格数据失败:', error)
    }
  }

  // 获取池数据（使用 SDK stores）
  async fetchPools() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取池数据')
      return
    }

    try {
      // 使用 SDK 的 pools store
      await this._sdk.stores.pools.fetchPools()
      // SDK stores 会自动更新
    } catch (error) {
      console.error('获取池数据失败:', error)
    }
  }

  // 获取代币数据（使用 SDK API）
  async fetchTokens() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法获取代币数据')
      return
    }

    try {
      // 使用 SDK 的 pools API 获取代币信息
      // 代币信息通常包含在 pools 中，或者可以通过 pools API 获取
      await this._sdk.stores.pools.fetchPools()
      // 可以从 pools 中提取 tokens 信息
    } catch (error) {
      console.error('获取代币数据失败:', error)
    }
  }

  // 建立 WebSocket 连接（已废弃，SDK 会自动建立连接）
  private establishWebSocketConnection() {
    if (!this._sdk) {
      console.warn('SDK 未初始化，无法建立 WebSocket 连接')
      return
    }

    try {
      // SDK 的 stores 会自动处理 WebSocket 更新
      // 我们只需要监听 store 的变化
    } catch (error) {
      console.error('建立 WebSocket 连接失败:', error)
    }
  }

  // 更新价格数据
  private updatePrices(priceData?: any) {
    if (priceData) {
      // 使用 SDK 提供的实时价格数据
      const existingPriceIndex = this.prices.findIndex(p => p.symbol === priceData.symbol)
      if (existingPriceIndex >= 0) {
        this.prices[existingPriceIndex] = {
          ...this.prices[existingPriceIndex],
          price: priceData.price,
          change24h: priceData.change24h,
          volume24h: priceData.volume24h,
          timestamp: Date.now()
        }
      } else {
        this.prices.push({
          symbol: priceData.symbol,
          price: priceData.price,
          change24h: priceData.change24h,
          volume24h: priceData.volume24h,
          timestamp: Date.now()
        })
      }
    }
  }

  // 更新存款数据
  private updateDeposits(depositData: any) {
    const existingDepositIndex = this.deposits.findIndex(d => d.id === depositData.id)
    if (existingDepositIndex >= 0) {
      this.deposits[existingDepositIndex] = {
        ...this.deposits[existingDepositIndex],
        ...depositData
      }
    } else {
      this.deposits.unshift({
        id: depositData.id,
        amount: depositData.amount,
        currency: depositData.currency,
        status: depositData.status,
        timestamp: depositData.timestamp || Date.now()
      })
    }
  }

  // 添加新存款（已废弃，使用 SDK createCommitment 代替）
  async addDeposit(deposit: Omit<Deposit, 'id' | 'timestamp'>) {
    if (!this._sdk) {
      throw new Error('SDK 未初始化')
    }

    console.warn('addDeposit 已废弃，请使用 SDK createCommitment 方法')
    // 这里可以保留作为兼容性方法，但建议使用 SDK 的 createCommitment
  }

  // 更新存款状态（已废弃，SDK stores 会自动更新）
  async updateDepositStatus(id: string, status: Deposit['status']) {
    if (!this._sdk) {
      throw new Error('SDK 未初始化')
    }

    console.warn('updateDepositStatus 已废弃，SDK stores 会自动更新状态')
    // SDK stores 会通过 WebSocket 自动更新，不需要手动更新
  }
}

// 创建全局 Store 实例
export const sdkStore = new SDKStore()

// Hook 用于获取 Store（为了保持 API 一致性，可选）
export function useSDKStore() {
  return sdkStore
}
