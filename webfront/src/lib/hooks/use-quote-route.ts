'use client'

import { useCallback, useState } from 'react'
import { useSDKStore } from '../stores/sdk-store'
import type { UniversalAddress } from '@enclave-hq/sdk'

type RawTokenIntent = {
  type: 'RawToken'
  beneficiary: UniversalAddress
  tokenSymbol: string
}

type AssetTokenIntent = {
  type: 'AssetToken'
  assetId: string
  beneficiary: UniversalAddress
  assetTokenSymbol: string
}

/**
 * Quote 路由查询参数
 */
export interface QuoteRouteParams {
  ownerData: UniversalAddress
  depositToken: string
  intent: RawTokenIntent | AssetTokenIntent
  amount: string
  includeHook?: boolean
}

/**
 * useQuoteRoute - 路由查询 Hook
 */
export function useQuoteRoute() {
  const sdkStore = useSDKStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quoteResult, setQuoteResult] = useState<any>(null)

  /**
   * 查询路由和费用
   */
  const getRouteAndFees = useCallback(
    async (params: QuoteRouteParams) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)

      try {
        const result = await sdkStore.sdk.quote.getRouteAndFees({
          ownerData: params.ownerData,
          depositToken: params.depositToken,
          intent: params.intent,
          amount: params.amount,
          includeHook: params.includeHook || false,
        })

        setQuoteResult(result)
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '查询路由失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 查询 Hook 资产信息
   */
  const getHookAsset = useCallback(
    async (params: {
      chain: number
      protocol: 'aave' | 'compound' | 'yearn' | 'lido' | string
      baseToken: string
      amount: string
    }) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)

      try {
        // Type assertion for protocol parameter
        const result = await sdkStore.sdk.quote.getHookAsset({
          ...params,
          protocol: params.protocol as 'aave' | 'compound' | 'yearn' | 'lido'
        })
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '查询 Hook 资产失败'
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

  /**
   * 清除查询结果
   */
  const clearResult = useCallback(() => {
    setQuoteResult(null)
  }, [])

  return {
    getRouteAndFees,
    getHookAsset,
    loading,
    error,
    quoteResult,
    clearError,
    clearResult,
  }
}
