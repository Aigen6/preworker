'use client'

import { useCallback, useState } from 'react'
import { useSDKStore } from '../stores/sdk-store'
// Intent type is not exported from SDK main entry, define locally
// Use 'any' type to match SDK's internal Intent type
type Intent = any

/**
 * Withdraw 参数
 * 参考 tests/integration/deposit-commitment-withdraw.test.ts
 * 使用新的 intent 格式，包含 beneficiary 对象
 */
export interface WithdrawParams {
  allocationIds: string[]
  intent: Intent // intent 对象包含 beneficiary (chainId, address, universalFormat) 和 tokenSymbol
}

/**
 * useWithdrawActions - 提现操作 Hook
 */
export function useWithdrawActions() {
  const sdkStore = useSDKStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 创建提款请求
   */
  const withdraw = useCallback(
    async (params: WithdrawParams) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)

      try {
        console.log('🚀 [Withdraw] 开始创建提款请求')
        console.log('📋 [Withdraw] 提款参数:', {
          allocationIds: params.allocationIds,
          intent: params.intent,
        })
        
        // 使用新的 API: 只传递 allocationIds 和 intent
        // intent 对象包含 beneficiary (chainId, address, universalFormat) 和 tokenSymbol
        const result = await sdkStore.sdk.withdraw({
          allocationIds: params.allocationIds,
          intent: params.intent,
        })

        console.log('✅ [Withdraw] 提款请求创建成功:', {
          withdrawalId: result.id,
          onChainRequestId: result.onChainRequestId,
        })
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '提款失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 重试失败的提款
   */
  const retryWithdraw = useCallback(
    async (withdrawalId: string) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)

      try {
        const result = await sdkStore.sdk.retryWithdraw(withdrawalId)
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '重试提款失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 取消提款请求
   */
  const cancelWithdraw = useCallback(
    async (withdrawalId: string) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)

      try {
        const result = await sdkStore.sdk.cancelWithdraw(withdrawalId)
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '取消提款失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    withdraw,
    retryWithdraw,
    cancelWithdraw,
    loading,
    error,
    clearError,
  }
}
