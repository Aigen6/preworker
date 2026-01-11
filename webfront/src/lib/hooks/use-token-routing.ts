'use client'

import { useCallback } from 'react'
import { useSDKStore } from '../stores/sdk-store'
import { tokenRoutingStore } from '../stores'

/**
 * useTokenRouting - Token路由配置管理 Hook
 */
export function useTokenRouting() {
  const sdkStore = useSDKStore()

  /**
   * 获取允许的目标链和Token
   */
  const getAllowedTargets = useCallback(
    async (params?: { 
      source_chain_id?: number
      source_token_key?: string
      intent?: {
        type: string
        beneficiary: {
          chainId: number
          address: string
        }
        tokenKey?: string
        tokenSymbol?: string
      }
    }) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      tokenRoutingStore.setSDK(sdkStore.sdk)
      return await tokenRoutingStore.getAllowedTargets(params)
    },
    [sdkStore.sdk]
  )

  /**
   * 获取所有池和代币
   */
  const getAllPoolsAndTokens = useCallback(async () => {
    if (!sdkStore.sdk) {
      throw new Error('SDK 未连接')
    }

    tokenRoutingStore.setSDK(sdkStore.sdk)
    return await tokenRoutingStore.getAllPoolsAndTokens()
  }, [sdkStore.sdk])

  /**
   * 获取特定源的目标
   */
  const getTargetsForSource = useCallback(
    async (sourceChainId: number, sourceTokenId: string) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      tokenRoutingStore.setSDK(sdkStore.sdk)
      return await tokenRoutingStore.getTargetsForSource(sourceChainId, sourceTokenId)
    },
    [sdkStore.sdk]
  )

  return {
    getAllowedTargets,
    getAllPoolsAndTokens,
    getTargetsForSource,
    loading: tokenRoutingStore.loading,
    error: tokenRoutingStore.error,
    allowedTargets: tokenRoutingStore.allowedTargets,
    routingResult: tokenRoutingStore.routingResult,
  }
}
