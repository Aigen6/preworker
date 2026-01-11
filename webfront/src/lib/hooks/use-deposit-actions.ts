'use client'

import { useCallback, useState } from 'react'
import { useSDKStore } from '../stores/sdk-store'

/**
 * CreateCommitment 参数
 * 参考 tests/integration/deposit-commitment-withdraw.test.ts
 */
export interface CreateCommitmentParams {
  checkbookId: string
  amounts: string[]
  tokenKey: string // 使用 tokenKey 而不是 tokenId (tokenKey = token.symbol)
  recipients?: Array<{
    chainId: number
    data: string
  }>
}

/**
 * useDepositActions - 存款操作 Hook
 */
export function useDepositActions() {
  const sdkStore = useSDKStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 创建 Commitment（凭证）
   */
  const createCommitment = useCallback(
    async (params: CreateCommitmentParams) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)

      try {
        const result = await sdkStore.sdk.createCommitment({
          checkbookId: params.checkbookId,
          amounts: params.amounts,
          tokenKey: params.tokenKey, // 使用 tokenKey 而不是 tokenId
          // recipients 参数已废弃，不再使用
        })

        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '创建凭证失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [sdkStore.sdk]
  )


  /**
   * 直接重新提交 commitment（不重新生成证明）
   * 用于 submission_failed 状态，当证明数据存在时可以直接重新提交
   * @param checkbookId - Checkbook ID
   */
  const resubmitCommitment = useCallback(
    async (checkbookId: string) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)

      try {
        // 获取 API URL
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
        
        // 获取认证 token (通过内部 API 客户端)
        const apiClient = (sdkStore.sdk as any).apiClient
        const token = apiClient?.getAuthToken?.()
        if (!token) {
          throw new Error('未认证，请先连接钱包')
        }

        // 调用 retry API - 只重新提交，不重新生成证明
        const response = await fetch(`${apiUrl}/api/retry/checkbook/${checkbookId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            from_step: 'submitting_commitment', // 指定从提交步骤开始
            force_restart: false,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: '重新提交失败' }))
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '重新提交失败'
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
    createCommitment,
    resubmitCommitment,
    loading,
    error,
    clearError,
  }
}

