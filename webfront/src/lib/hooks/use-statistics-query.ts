'use client'

import { useState, useEffect, useCallback } from 'react'

// Statistics Service API 配置
const STATISTICS_API_URL = process.env.NEXT_PUBLIC_STATISTICS_API_URL || 'http://localhost:4000'

export interface PoolStatistics {
  id: string
  poolChainId: number
  poolContractAddress: string
  poolName: string
  date: string
  hour: number
  depositCount: number
  totalDepositAmount: string
  claimCount: number
  totalClaimAmount: string
  recoverCount: number
  totalRecoverAmount: string
  backendDepositCount: number
  backendTotalDepositAmount: string
  backendWithdrawCount: number
  backendTotalWithdrawAmount: string
  createdAt: string
  updatedAt: string
}

export interface MatchingResult {
  poolDeposits: any[]
  poolWithdraws: any[]
  backendDeposits: any[]
  backendDepositsInThisServer: any[]
  backendDepositsNotInThisServer: any[]
  backendWithdraws: any[]
  poolToBackendDepositMatches: Array<{
    poolEvent: any
    backendDeposit: any
    confidence: number
    reason: string
    isInThisServer: boolean
  }>
  crossChainWithdraws: Array<{
    withdraw: any
    executeChainId: number
    payoutChainId: number
  }>
  unmatchedPoolWithdraws: any[]
  unmatchedBackendDeposits: any[]
}

export interface MatchingSummary {
  poolDepositsCount: number
  poolWithdrawsCount: number
  backendDepositsCount: number
  backendDepositsInThisServerCount: number
  backendDepositsNotInThisServerCount: number
  backendWithdrawsCount: number
  matchedCount: number
  crossChainWithdrawsCount: number
  unmatchedPoolWithdrawsCount: number
  unmatchedBackendDepositsCount: number
}

/**
 * 查询池统计数据
 */
export function usePoolStatistics() {
  const [data, setData] = useState<PoolStatistics[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchStatistics = useCallback(async (
    chainId?: number,
    startDate?: string,
    endDate?: string,
  ) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (chainId) params.append('chainId', chainId.toString())
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(
        `${STATISTICS_API_URL}/statistics/pools?${params.toString()}`,
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      console.error('Failed to fetch pool statistics:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    data,
    loading,
    error,
    fetchStatistics,
  }
}

/**
 * 执行匹配分析
 */
export function useMatchingAnalysis() {
  const [data, setData] = useState<MatchingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const analyze = useCallback(async (
    startDate: string,
    endDate: string,
    chainId?: number,
  ) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.append('startDate', startDate)
      params.append('endDate', endDate)
      if (chainId) params.append('chainId', chainId.toString())

      const response = await fetch(
        `${STATISTICS_API_URL}/matching/analyze?${params.toString()}`,
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      console.error('Failed to analyze matching:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    data,
    loading,
    error,
    analyze,
  }
}

/**
 * 获取匹配分析摘要
 */
export function useMatchingSummary() {
  const [data, setData] = useState<{
    summary: MatchingSummary
    details: any
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchSummary = useCallback(async (
    startDate: string,
    endDate: string,
    chainId?: number,
  ) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.append('startDate', startDate)
      params.append('endDate', endDate)
      if (chainId) params.append('chainId', chainId.toString())

      const response = await fetch(
        `${STATISTICS_API_URL}/matching/summary?${params.toString()}`,
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      if (result.success) {
        setData(result)
      } else {
        throw new Error(result.error || 'Failed to fetch summary')
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      console.error('Failed to fetch matching summary:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    data,
    loading,
    error,
    fetchSummary,
  }
}

/**
 * 记录本机服务输入的 Deposit
 */
export function useDepositInThisServer() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createDeposit = useCallback(async (depositData: {
    chainId: number
    checkbookId: string
    depositTxHash?: string
    depositAmount?: string
    tokenAddress?: string
    userAddress?: string
    source?: string
    metadata?: Record<string, any>
  }) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${STATISTICS_API_URL}/api/deposit-in-this-server`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(depositData),
        },
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to create deposit')
      }

      return result.data
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      console.error('Failed to create deposit in this server:', err)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    createDeposit,
  }
}
