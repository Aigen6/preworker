"use client"

import { createContext, useContext, ReactNode, useState, useEffect, useRef, useMemo } from "react"
import {
  WalletProvider as SDKWalletProviderCore,
  useAccount as useSDKAccount,
  useConnect as useSDKConnect,
  useDisconnect as useSDKDisconnect,
  useWallet as useSDKWalletCore,
} from "@enclave-hq/wallet-sdk/react"
import { WalletType, Account, WalletManager } from "@enclave-hq/wallet-sdk"
import {
  NETWORKS,
  formatAddress,
  isEVMChainId,
  getMetaMaskChainConfig,
  TRON_CHAIN_ID,
  type NetworkInfo,
} from "@/lib/utils/wallet-utils"

/**
 * MetaMask 提供者类型定义
 * 用于与浏览器中的 window.ethereum 交互
 */
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

/**
 * 扩展全局 Window 接口，添加 ethereum 属性
 * 用于 TypeScript 类型检查
 */
declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

/**
 * 钱包上下文类型定义
 * 包含钱包连接状态、账户信息、网络信息以及相关操作方法
 */
interface WalletContextType {
  /** SDK 账户对象，包含地址(nativeAddress)、链ID(chainId)等信息 */
  account: Account | null
  /** 是否已连接钱包 */
  isConnected: boolean
  // 网络信息
  /** 支持的网络列表 */
  networks: NetworkInfo[]
  // 方法
  /** 连接 MetaMask 钱包，可指定目标链ID */
  connectMetaMask: (chainId?: number) => Promise<void>
  /** 连接 TronWeb 兼容钱包（支持 TronLink、TokenPocket 等），可指定目标链ID */
  connectTronLink: (chainId?: number) => Promise<void>
  /** 连接 WalletConnect（用于没有浏览器钱包时），可指定目标链ID */
  connectWalletConnect: (chainId?: number) => Promise<void>
  /** 连接 WalletConnect TRON（用于没有浏览器钱包时），可指定目标链ID */
  connectWalletConnectTron: (chainId?: number) => Promise<void>
  /** 断开钱包连接 */
  disconnectWallet: () => Promise<void>
  /** 切换到指定的链ID网络 */
  switchNetworkByChainId: (chainId: number) => Promise<void>
  /** 格式化地址显示（前6位...后4位） */
  formatAddress: (address: string) => string
  // 状态
  /** 是否正在连接中 */
  isConnecting: boolean
  /** 错误信息 */
  error: string | null
}

const WalletContext = createContext<WalletContextType | null>(null)

/**
 * 钱包 Provider 内部组件
 * 直接使用 SDK hooks，自动响应状态变化
 */
function WalletProviderInner({ children }: { children: ReactNode }) {
  // 使用 SDK hooks 获取钱包状态和方法
  const { account, isConnected } = useSDKAccount()
  const { connect, isConnecting } = useSDKConnect()
  const { disconnect } = useSDKDisconnect()
  const { walletManager } = useSDKWalletCore()
  const [error, setError] = useState<string | null>(null)
  const hasAttemptedAutoConnectRef = useRef(false)
  const isUserConnectingRef = useRef(false) // 标记用户是否正在主动连接

  // 保存连接信息到 localStorage
  const saveConnectionInfo = (walletType: WalletType, chainId?: number) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('walletConnection', JSON.stringify({
          walletType,
          chainId,
          timestamp: Date.now(),
        }))
      } catch (error) {
        console.error('保存钱包连接信息失败:', error)
      }
    }
  }

  // 清除连接信息
  const clearConnectionInfo = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('walletConnection')
      } catch (error) {
        console.error('清除钱包连接信息失败:', error)
      }
    }
  }

  // 从 localStorage 加载连接信息
  const loadConnectionInfo = () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('walletConnection')
        if (saved) {
          return JSON.parse(saved) as { walletType: WalletType; chainId?: number; timestamp: number }
        }
      } catch (error) {
        console.error('加载钱包连接信息失败:', error)
      }
    }
    return null
  }

  // 自动重连逻辑（只在组件首次加载时执行一次）
  useEffect(() => {
    // 如果已经尝试过自动重连，不再执行
    if (hasAttemptedAutoConnectRef.current) {
      return
    }

    // 如果已经连接或正在连接，标记为已尝试，不需要自动重连
    if (isConnected || isConnecting || account) {
      hasAttemptedAutoConnectRef.current = true
      return
    }

    // 如果用户正在主动连接，不执行自动重连
    if (isUserConnectingRef.current) {
      hasAttemptedAutoConnectRef.current = true
      return
    }

    // 尝试自动重连
    const attemptAutoConnect = async () => {
      // 再次检查用户是否正在连接
      if (isUserConnectingRef.current) {
        hasAttemptedAutoConnectRef.current = true
        return
      }
      
      hasAttemptedAutoConnectRef.current = true
      
      const savedConnection = loadConnectionInfo()
      if (!savedConnection) {
        return
      }

      // 检查保存的连接信息是否过期（24小时）
      const isExpired = Date.now() - savedConnection.timestamp > 24 * 60 * 60 * 1000
      if (isExpired) {
        clearConnectionInfo()
        return
      }

      try {
        // 根据保存的钱包类型自动重连
        if (savedConnection.walletType === WalletType.METAMASK) {
          await connect(WalletType.METAMASK, savedConnection.chainId)
        } else if (savedConnection.walletType === WalletType.TRONLINK) {
          await connect(WalletType.TRONLINK, savedConnection.chainId)
        }
      } catch (error) {
        // 自动重连失败，清除保存的信息
        console.warn('自动重连失败:', error)
        clearConnectionInfo()
      }
    }

    // 延迟执行，确保组件完全初始化
    const timer = setTimeout(() => {
      attemptAutoConnect()
    }, 100)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只在组件挂载时执行一次，connect 函数来自 SDK hook，是稳定的

  // 当连接状态改变时，更新保存的连接信息
  useEffect(() => {
    if (isConnected && account) {
      // 根据账户信息判断钱包类型
      const isTron = account.chainId === 195 || account.chainType === 'tron'
      const walletType = isTron ? WalletType.TRONLINK : WalletType.METAMASK
      saveConnectionInfo(walletType, account.chainId)
    } else if (!isConnected) {
      // 如果断开连接，不清除保存的信息（允许自动重连）
      // clearConnectionInfo()
    }
  }, [isConnected, account])


  /**
   * 添加网络到 MetaMask
   * 如果网络不存在，会弹出 MetaMask 添加网络确认框
   * @param chainId 链ID
   */
  const addNetworkToMetaMask = async (chainId: number): Promise<void> => {
    const chainConfig = getMetaMaskChainConfig(chainId)
    if (!chainConfig) {
      throw new Error(`不支持的网络 chainId: ${chainId}`)
    }

    // 检查 window.ethereum 是否存在
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask 未安装")
    }

    try {
      // 尝试添加网络
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [chainConfig],
      })
    } catch (addErr: unknown) {
      // 如果网络已存在（错误代码 4902），这是正常的，可以继续
      // 其他错误需要抛出
      const error = addErr as { code?: number; message?: string }
      if (error.code !== 4902) {
        throw addErr
      }
      // 网络已存在，继续执行
    }
  }

  /**
   * 检测浏览器钱包是否可用
   */
  const isBrowserWalletAvailable = (chainId?: number): boolean => {
    if (typeof window === 'undefined') {
      return false
    }
    
    if (chainId === TRON_CHAIN_ID) {
      // TRON 链：检测 window.tronWeb 或 window.tronLink
      const w = window as any
      return !!(w.tronWeb || w.tronLink?.tronWeb)
    } else {
      // EVM 链：检测 window.ethereum
      return !!window.ethereum
    }
  }

  /**
   * 连接 MetaMask 钱包
   * 如果提供了 chainId，连接成功后会尝试添加并切换到该网络
   * 如果没有检测到浏览器钱包，会自动使用 WalletConnect
   * @param chainId 可选的目标链ID，如果提供则连接后自动切换
   */
  const connectMetaMask = async (chainId?: number) => {
    try {
      setError(null)
      
      // 标记用户正在主动连接，阻止自动重连
      isUserConnectingRef.current = true
      
      // 如果正在连接中，等待连接完成或失败
      if (isConnecting) {
        console.log('检测到正在连接中，等待连接完成...')
        // 等待最多 5 秒
        let waitCount = 0
        while (isConnecting && waitCount < 50) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          waitCount++
        }
      }
      
      // 如果当前已连接的是 TRON 链，先断开连接
      // 这样可以确保 TokenPocket 等同时支持 EVM 和 TRON 的钱包能正确连接到 EVM 链
      if (account && !isEVMChainId(account.chainId)) {
        console.log('检测到当前连接的是非 EVM 链，先断开连接')
        await disconnect()
        // 等待断开完成，确保 provider 完全清理
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      
      // 检查浏览器钱包是否可用
      const hasBrowserWallet = isBrowserWalletAvailable(chainId)
      
      if (!hasBrowserWallet) {
        // 没有检测到浏览器钱包，使用 WalletConnect
        console.log('未检测到浏览器钱包，使用 WalletConnect 连接')
        
        // 检查 WalletConnect 适配器是否已注册
        if (!walletManager || !walletManager.hasAdapter(WalletType.WALLETCONNECT)) {
          isUserConnectingRef.current = false
          throw new Error('WalletConnect 未配置，请设置 NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID 环境变量')
        }
        
        await connect(WalletType.WALLETCONNECT, chainId)
        
        // 等待连接完成后再保存连接信息
        await new Promise((resolve) => setTimeout(resolve, 500))
        saveConnectionInfo(WalletType.WALLETCONNECT, chainId)
      } else {
        // 有浏览器钱包，使用 MetaMask 连接
        // 等待钱包提供者就绪
        await new Promise((resolve) => setTimeout(resolve, 100))
        
        await connect(WalletType.METAMASK, chainId)
        
        // 等待连接完成后再保存连接信息
        await new Promise((resolve) => setTimeout(resolve, 500))
        saveConnectionInfo(WalletType.METAMASK, chainId)
      }

      // 如果提供了 chainId 且是 EVM 链，连接成功后添加并切换到选中的网络
      if (chainId !== undefined && isEVMChainId(chainId)) {
        // 等待一下确保连接完成和状态更新
        await new Promise((resolve) => setTimeout(resolve, 300))

        // 检查当前链是否已经是目标链
        if (account?.chainId !== chainId) {
          try {
            // 直接调用 switchNetworkByChainId，它会智能处理网络添加
            // 如果网络已存在，不会弹出添加网络确认框
            await switchNetworkByChainId(chainId)
          } catch (switchErr) {
            // 如果切换失败，记录错误但不抛出，因为连接已经成功
            console.warn("切换到选中网络失败:", switchErr)
          }
        }
      }
      
      // 连接完成后，重置标记
      isUserConnectingRef.current = false
    } catch (err) {
      // 连接失败时，重置标记
      isUserConnectingRef.current = false
      const errorMessage =
        err instanceof Error ? err.message : "连接 MetaMask 失败"
      setError(errorMessage)
      throw err
    }
  }

  /**
   * 连接 TronWeb 兼容钱包（支持 TronLink、TokenPocket 等）
   * 如果没有检测到浏览器钱包，会自动使用 WalletConnect TRON
   * @param chainId 可选的目标链ID，如果提供则使用该 chainId（默认使用 TRON 主网）
   */
  const connectTronLink = async (chainId?: number) => {
    try {
      setError(null)
      
      // 标记用户正在主动连接，阻止自动重连
      isUserConnectingRef.current = true
      
      // 如果正在连接中，等待连接完成或失败
      if (isConnecting) {
        console.log('检测到正在连接中，等待连接完成...')
        // 等待最多 5 秒
        let waitCount = 0
        while (isConnecting && waitCount < 50) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          waitCount++
        }
      }
      
      // 检查浏览器钱包是否可用
      const hasBrowserWallet = isBrowserWalletAvailable(chainId || TRON_CHAIN_ID)
      
      if (!hasBrowserWallet) {
        // 没有检测到浏览器钱包，使用 WalletConnect TRON
        console.log('未检测到浏览器钱包，使用 WalletConnect TRON 连接')
        
        // 检查 WalletConnect TRON 适配器是否已注册
        if (!walletManager || !walletManager.hasAdapter(WalletType.WALLETCONNECT_TRON)) {
          isUserConnectingRef.current = false
          throw new Error('WalletConnect TRON 未配置，请设置 NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID 环境变量')
        }
        
        await connect(WalletType.WALLETCONNECT_TRON, chainId)
        
        // 等待连接完成后再保存连接信息
        await new Promise((resolve) => setTimeout(resolve, 500))
        saveConnectionInfo(WalletType.WALLETCONNECT_TRON, chainId)
      } else {
        // 有浏览器钱包，使用 TronLink 连接
        // 等待钱包提供者就绪
        await new Promise((resolve) => setTimeout(resolve, 100))
        
        await connect(WalletType.TRONLINK, chainId)
        
        // 等待连接完成后再保存连接信息
        await new Promise((resolve) => setTimeout(resolve, 500))
        saveConnectionInfo(WalletType.TRONLINK, chainId)
      }
      
      // 连接完成后，重置标记
      isUserConnectingRef.current = false
    } catch (err) {
      // 连接失败时，重置标记
      isUserConnectingRef.current = false
      const errorMessage =
        err instanceof Error ? err.message : "连接 TronWeb 兼容钱包失败"
      setError(errorMessage)
      throw err
    }
  }

  /**
   * 断开钱包连接
   */
  const disconnectWallet = async () => {
    try {
      setError(null)
      // 重置用户连接标记
      isUserConnectingRef.current = false
      await disconnect()
      // 清除保存的连接信息
      clearConnectionInfo()
    } catch (err) {
      // 即使断开失败，也重置标记
      isUserConnectingRef.current = false
      const errorMessage = err instanceof Error ? err.message : "断开连接失败"
      setError(errorMessage)
      throw err
    }
  }

  /**
   * 切换网络（使用 chainId）
   * 对于 EVM 链：先尝试添加网络（如果不存在），然后切换
   * 对于 TRON：需要重新连接 TronWeb 兼容钱包
   * @param chainId 目标链ID
   */
  const switchNetworkByChainId = async (chainId: number) => {
    try {
      setError(null)
      
      // 检查当前连接的网络类型
      const currentIsEVM = account ? isEVMChainId(account.chainId) : null
      const targetIsEVM = isEVMChainId(chainId)
      
      // 如果从 EVM 切换到 TRON，或从 TRON 切换到 EVM，需要断开并重新连接
      // 如果已经在目标网络，不需要切换
      if (account && account.chainId === chainId) {
        console.log('已经在目标网络，无需切换')
        return
      }
      
      // TRON 不是 EVM 链，不能使用 requestSwitchChain
      // 对于 TRON，需要重新连接 TronWeb 兼容钱包
      if (!targetIsEVM) {
        // 如果当前连接的是 EVM 链，需要先断开
        if (currentIsEVM) {
          await disconnect()
          // 等待断开完成，确保 provider 完全清理
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        // 连接 TronWeb 兼容钱包
        // 注意：如果用户拒绝连接，TronLinkAdapter 会先检查是否已授权，避免不必要的弹窗
        try {
        await connect(WalletType.TRONLINK, chainId)
        } catch (err: any) {
          // 如果是用户拒绝连接的错误，不抛出，静默处理
          // 因为用户可能只是想取消操作
          if (err?.name === 'ConnectionRejectedError' || err?.message?.includes('rejected')) {
            console.log('用户取消了 TRON 网络连接')
            // 不设置错误，不抛出，让用户可以继续操作
            return
          }
          // 其他错误正常抛出
          throw err
        }
      } else {
        // 对于 EVM 链
        // 如果当前连接的是 TRON，需要先断开
        if (currentIsEVM === false) {
          await disconnect()
          // 等待断开完成，确保 provider 完全清理
          await new Promise((resolve) => setTimeout(resolve, 500))
          // 断开后需要重新连接
          // 检查浏览器钱包是否可用，如果不可用则使用 WalletConnect
          const hasBrowserWallet = isBrowserWalletAvailable(chainId)
          
          if (!hasBrowserWallet) {
            // 没有检测到浏览器钱包，使用 WalletConnect
            if (!walletManager || !walletManager.hasAdapter(WalletType.WALLETCONNECT)) {
              throw new Error('WalletConnect 未配置，请设置 NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID 环境变量')
            }
            await connect(WalletType.WALLETCONNECT, chainId)
          } else {
            await connect(WalletType.METAMASK, chainId)
          }
        } else {
          // 当前已经是 EVM 链，使用标准的切换方法
          // 先尝试切换网络，如果网络不存在（错误代码 4902），再添加网络
          
          // 检查 walletManager 是否存在
          if (!walletManager) {
            throw new Error('钱包管理器未初始化，请先连接钱包')
          }
          
          try {
            // 先尝试直接切换网络（如果网络已存在，不会弹出添加网络确认框）
            await walletManager.requestSwitchChain(chainId)
            
            // 对于 EVM 链之间切换，等待 account.chainId 和 RPC provider 都更新到目标链
            // 这确保 SDK 能正确检测到链变化并重新初始化
            console.log('[switchNetworkByChainId] 等待链切换完成，目标链:', chainId)
            
            // 1. 等待 walletManager 的 account.chainId 更新
            let waitCount = 0
            const maxWaitCount = 50 // 最多等待 5 秒
            
            while (waitCount < maxWaitCount) {
              const updatedAccount = walletManager.getPrimaryAccount()
              if (updatedAccount && updatedAccount.chainId === chainId) {
                console.log('[switchNetworkByChainId] ✅ walletManager account.chainId 已更新到目标链:', chainId)
                break
              }
              await new Promise((resolve) => setTimeout(resolve, 100))
              waitCount++
            }
            
            // 2. 验证 RPC provider 的链 ID（对于 EVM 链）
            if (typeof window !== 'undefined' && window.ethereum) {
              try {
                const rpcChainIdHex = await window.ethereum.request({
                  method: 'eth_chainId',
                }) as string
                const rpcChainId = parseInt(rpcChainIdHex, 16)
                
                if (rpcChainId !== chainId) {
                  console.warn('[switchNetworkByChainId] ⚠️ RPC provider 链 ID 与目标链不一致:', {
                    rpcChainId,
                    targetChainId: chainId,
                    note: 'RPC provider 可能还在切换中'
                  })
                } else {
                  console.log('[switchNetworkByChainId] ✅ RPC provider 链 ID 已更新到目标链:', chainId)
                }
              } catch (rpcErr) {
                console.warn('[switchNetworkByChainId] 无法验证 RPC provider 链 ID:', rpcErr)
              }
            }
            
            // 如果等待超时，记录警告但不抛出错误（因为 MetaMask 可能已经切换成功）
            if (waitCount >= maxWaitCount) {
              const finalAccount = walletManager.getPrimaryAccount()
              console.warn('[switchNetworkByChainId] ⚠️ 等待 account.chainId 更新超时:', {
                targetChainId: chainId,
                currentChainId: finalAccount?.chainId,
                note: 'SDK 可能会在后续检测到链变化并自动重新初始化'
              })
            }
            
            // 3. 额外等待一小段时间，确保所有状态同步完成
            // 同时触发一次 account 刷新（通过重新获取 account）
            await new Promise((resolve) => setTimeout(resolve, 300))
            
            // 4. 再次验证 account.chainId 是否已更新（用于调试）
            const finalAccount = walletManager.getPrimaryAccount()
            if (finalAccount && finalAccount.chainId === chainId) {
              console.log('[switchNetworkByChainId] ✅ 最终验证：account.chainId 已正确更新到目标链:', chainId)
            } else {
              console.warn('[switchNetworkByChainId] ⚠️ 最终验证：account.chainId 仍未更新:', {
                targetChainId: chainId,
                currentChainId: finalAccount?.chainId,
                note: 'SDK 可能会在后续自动检测并更新'
              })
            }
          } catch (switchErr: unknown) {
            // 如果切换失败，检查是否是网络不存在的错误（错误代码 4902）
            const error = switchErr as { code?: number; message?: string }
            if (error.code === 4902) {
              // 网络不存在，需要先添加网络
              console.log('网络不存在，尝试添加网络:', chainId)
              try {
                await addNetworkToMetaMask(chainId)
                // 添加成功后，延迟一秒再切换，确保 MetaMask 准备好显示弹窗
                await new Promise((resolve) => setTimeout(resolve, 1000))
                // 再次尝试切换
                // 再次检查 walletManager 是否存在
                if (!walletManager) {
                  throw new Error('钱包管理器未初始化')
                }
                await walletManager.requestSwitchChain(chainId)
                
                // 等待 account.chainId 和 RPC provider 都更新到目标链
                console.log('[switchNetworkByChainId] 等待链切换完成，目标链:', chainId)
                
                // 1. 等待 walletManager 的 account.chainId 更新
                let waitCount = 0
                const maxWaitCount = 50
                
                while (waitCount < maxWaitCount) {
                  const updatedAccount = walletManager.getPrimaryAccount()
                  if (updatedAccount && updatedAccount.chainId === chainId) {
                    console.log('[switchNetworkByChainId] ✅ walletManager account.chainId 已更新到目标链:', chainId)
                    break
                  }
                  await new Promise((resolve) => setTimeout(resolve, 100))
                  waitCount++
                }
                
                // 2. 验证 RPC provider 的链 ID（对于 EVM 链）
                if (typeof window !== 'undefined' && window.ethereum) {
                  try {
                    const rpcChainIdHex = await window.ethereum.request({
                      method: 'eth_chainId',
                    }) as string
                    const rpcChainId = parseInt(rpcChainIdHex, 16)
                    
                    if (rpcChainId !== chainId) {
                      console.warn('[switchNetworkByChainId] ⚠️ RPC provider 链 ID 与目标链不一致:', {
                        rpcChainId,
                        targetChainId: chainId,
                        note: 'RPC provider 可能还在切换中'
                      })
                    } else {
                      console.log('[switchNetworkByChainId] ✅ RPC provider 链 ID 已更新到目标链:', chainId)
                    }
                  } catch (rpcErr) {
                    console.warn('[switchNetworkByChainId] 无法验证 RPC provider 链 ID:', rpcErr)
                  }
                }
                
                if (waitCount >= maxWaitCount) {
                  const finalAccount = walletManager.getPrimaryAccount()
                  console.warn('[switchNetworkByChainId] ⚠️ 等待 account.chainId 更新超时:', {
                    targetChainId: chainId,
                    currentChainId: finalAccount?.chainId,
                    note: 'SDK 可能会在后续检测到链变化并自动重新初始化'
                  })
                }
                
                // 3. 额外等待一小段时间，确保所有状态同步完成
                await new Promise((resolve) => setTimeout(resolve, 300))
              } catch (addErr) {
                // 添加网络失败，抛出错误
                throw addErr
              }
            } else {
              // 其他错误，直接抛出
              throw switchErr
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "切换网络失败"
      setError(errorMessage)
      throw err
    }
  }

  return (
    <WalletContext.Provider
      value={{
        account,
        isConnected,
        networks: NETWORKS,
        connectMetaMask,
        connectTronLink,
        disconnectWallet,
        switchNetworkByChainId,
        formatAddress,
        isConnecting,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

/**
 * 钱包 Provider 主组件
 * 包装 SDK 的 WalletProvider，提供额外的功能（如自动添加网络）
 * @param children 子组件
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  // 从环境变量获取 WalletConnect Project ID
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''
  
  // 如果配置了 Project ID，创建带配置的 WalletManager
  const walletManager = useMemo(() => {
    if (walletConnectProjectId) {
      return new WalletManager({
        walletConnectProjectId,
      })
    }
    return undefined
  }, [walletConnectProjectId])
  
  return (
    <SDKWalletProviderCore walletManager={walletManager}>
      <WalletProviderInner>{children}</WalletProviderInner>
    </SDKWalletProviderCore>
  )
}

/**
 * 使用钱包上下文的 Hook
 * 必须在 WalletProvider 内部使用
 * @returns 钱包上下文对象
 * @throws 如果不在 WalletProvider 内部使用会抛出错误
 */
export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider")
  }
  return context
}
