"use client"

import { useEffect, ReactNode, useState } from "react"
import { useSDKStore } from "@/lib/stores/sdk-store"
import { extractAddress } from "@enclave-hq/sdk"

/**
 * SDK Provider 内部组件
 * 负责使用 KeyManager 自动连接 SDK
 */
function SDKProviderInner({ children }: { children: ReactNode }) {
  const sdkStore = useSDKStore()
  
  // 从环境变量或配置获取 chainId 和 addressIndex
  // 默认使用 BSC (714) 和地址索引 1
  const [chainId] = useState(() => {
    const envChainId = process.env.NEXT_PUBLIC_CHAIN_ID
    return envChainId ? parseInt(envChainId, 10) : 714
  })
  const [addressIndex] = useState(() => {
    const envAddressIndex = process.env.NEXT_PUBLIC_KEYMANAGER_ADDRESS_INDEX
    return envAddressIndex ? parseInt(envAddressIndex, 10) : 1
  })

  // 初始化 SDK 连接（使用 KeyManager）
  useEffect(() => {
    const initSDK = async () => {
      // 如果 SDK 已连接，检查链 ID 是否变化
      if (sdkStore.sdk && sdkStore.isConnected) {
        const sdkChainId = sdkStore.sdk.address?.chainId || null
        
        // 检查链 ID 是否变化
        const chainIdChanged = sdkChainId && chainId && sdkChainId !== chainId
        
        if (chainIdChanged) {
          console.log('[SDK Provider] 检测到链 ID 变化，需要重新初始化 SDK:', {
            oldChainId: sdkChainId,
            newChainId: chainId
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
        } else if (!chainIdChanged) {
          // 链 ID 未变化，不需要重新连接
          return
        }
      }

      // 如果正在连接中，不重复连接
      if (sdkStore.isLoading) {
        return
      }

      try {
        // 使用 KeyManager 连接 SDK（不再需要用户签名）
        await sdkStore.connect(chainId, addressIndex, undefined, true)
      } catch (error) {
        // 记录错误（不再有用户拒绝签名的情况）
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorDetails = error instanceof Error ? error.stack : String(error)
        
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
      }
    }
    initSDK()
  }, [sdkStore, chainId, addressIndex])

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

