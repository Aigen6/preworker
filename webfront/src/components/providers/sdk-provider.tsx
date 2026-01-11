"use client"

import { useEffect, ReactNode } from "react"
import { useWallet } from "@/components/providers/wallet-provider"
import { useWallet as useSDKWallet } from "@enclave-hq/wallet-sdk/react"
import { useSDKStore } from "@/lib/stores/sdk-store"
import { extractAddress } from "@enclave-hq/sdk"

/**
 * SDK Provider 内部组件
 * 负责在钱包连接后自动连接 SDK
 */
function SDKProviderInner({ children }: { children: ReactNode }) {
  const { isConnected, account } = useWallet()
  const { walletManager } = useSDKWallet()
  const sdkStore = useSDKStore()

  // 获取当前账户地址和链 ID，用于检测账户或链切换
  const currentAddress = account?.nativeAddress || null
  const currentChainId = account?.chainId || null

  // 初始化 SDK 连接（只有在钱包连接后才连接 SDK）
  useEffect(() => {
    const initSDK = async () => {
      // 如果钱包未连接，不连接 SDK
      if (!isConnected || !walletManager) {
        // 如果钱包断开，也断开 SDK
        if (sdkStore.sdk && sdkStore.isConnected) {
          await sdkStore.disconnect()
        }
        return
      }

      // 检查钱包账户
      const account = walletManager.getPrimaryAccount()
      if (!account) {
        console.warn('[SDK Provider] 钱包未连接，跳过 SDK 连接')
        return
      }

      // 如果 SDK 已连接，检查地址或链 ID 是否变化
      if (sdkStore.sdk && sdkStore.isConnected) {
        // 获取 SDK 当前使用的地址和链 ID
        const sdkAddress = sdkStore.sdk.address ? extractAddress(sdkStore.sdk.address) : null
        const sdkChainId = sdkStore.sdk.address?.chainId || null
        const currentAddress = account.nativeAddress
        const currentChainId = account.chainId
        
        // 检查地址是否变化
        const addressChanged = sdkAddress && currentAddress && sdkAddress.toLowerCase() !== currentAddress.toLowerCase()
        
        // 检查链 ID 是否变化
        // 重要：SDK 使用 chainId 创建 UniversalAddress，如果链 ID 变化，必须重新初始化 SDK
        const chainIdChanged = sdkChainId && currentChainId && sdkChainId !== currentChainId
        
        if (addressChanged || chainIdChanged) {
          console.log('[SDK Provider] 检测到变化，需要重新初始化 SDK:', {
            reason: addressChanged ? '地址变化' : '链 ID 变化',
            oldAddress: sdkAddress,
            newAddress: currentAddress,
            oldChainId: sdkChainId,
            newChainId: currentChainId
          })
          // 清空 SDK store 的缓存数据（在断开之前）
          if (sdkStore.sdk) {
            try {
              // 清空 checkbooks store
              if (sdkStore.sdk.stores.checkbooks && typeof sdkStore.sdk.stores.checkbooks.clear === 'function') {
                sdkStore.sdk.stores.checkbooks.clear()
              } else if (sdkStore.sdk.stores.checkbooks?.all) {
                sdkStore.sdk.stores.checkbooks.all.length = 0
              }
              // 清空 allocations store
              if (sdkStore.sdk.stores.allocations && typeof sdkStore.sdk.stores.allocations.clear === 'function') {
                sdkStore.sdk.stores.allocations.clear()
              } else if (sdkStore.sdk.stores.allocations?.all) {
                sdkStore.sdk.stores.allocations.all.length = 0
              }
            } catch (error) {
              console.warn('[SDK Provider] 清空 SDK store 缓存失败:', error)
            }
          }
          
          // 完全断开连接，清除所有状态和 JWT token
          await sdkStore.disconnect()
          // 等待更长时间确保断开完成，包括清除所有缓存
          await new Promise(resolve => setTimeout(resolve, 500))
          // 继续执行下面的连接逻辑（强制重新连接）
        } else if (sdkAddress && currentAddress && sdkAddress.toLowerCase() === currentAddress.toLowerCase() && !chainIdChanged) {
          // 地址一致且链 ID 未变化，不需要重新连接
          return
        }
      }

      // 如果正在连接中，不重复连接
      if (sdkStore.isLoading) {
        return
      }

      try {
        // Type assertion needed due to different WalletManager type declarations
        // 强制重新连接，确保生成新的 JWT token
        await sdkStore.connect(walletManager as any, undefined, true)
      } catch (error) {
        // 如果是用户拒绝签名，静默处理（不显示错误）
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorDetails = error instanceof Error ? error.stack : String(error)
        const errorLower = errorMessage.toLowerCase()
        
        const isUserRejection = 
          errorLower.includes('rejected') || 
          errorLower.includes('user rejected') ||
          errorLower.includes('signature was rejected') ||
          errorLower.includes('user denied') ||
          errorLower.includes('user cancelled') ||
          errorLower.includes('user canceled') ||
          errorLower.includes('4001') || // MetaMask rejection code
          errorLower.includes('authentication cancelled') ||
          (error && typeof error === 'object' && (error as any).details?.userRejected === true)
        
        if (!isUserRejection) {
          // 提供更详细的错误信息
          let errorInfo: any = {
            message: errorMessage,
            details: errorDetails,
            error
          }
          
          // 检查是否是 SDK 错误类型
          if (error && typeof error === 'object') {
            const err = error as any
            if (err.code) {
              errorInfo.code = err.code
            }
            if (err.details) {
              errorInfo.step = err.details.step
              errorInfo.endpoint = err.details.endpoint
            }
            if (err.statusCode) {
              errorInfo.statusCode = err.statusCode
            }
          }
          
          console.error('[SDK Provider] SDK 连接失败:', errorInfo)
        } else {
          // 用户拒绝签名，静默处理
          console.debug('[SDK Provider] 用户拒绝了签名请求，SDK 连接已取消')
        }
        // 即使连接失败，也继续执行
      }
    }
    initSDK()
  }, [sdkStore, walletManager, isConnected, currentAddress, currentChainId]) // 添加 currentAddress 和 currentChainId 依赖，检测账户或链切换

  return <>{children}</>
}

/**
 * SDK Provider 主组件
 * 统一管理 SDK 连接，在钱包连接后自动连接 SDK
 * @param children 子组件
 */
export function SDKProvider({ children }: { children: ReactNode }) {
  return <SDKProviderInner>{children}</SDKProviderInner>
}

