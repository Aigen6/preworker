'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSDKStore } from '../stores/sdk-store'

export interface AllocationInfo {
  id: string
  commitment: string
  recipient: string
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
}

/**
 * 检查是否存在对应的Allocation
 * 根据commitment和recipient查询
 */
export function useAllocationCheck(
  commitment: string | null | undefined,
  recipient: string | null | undefined
) {
  const sdkStore = useSDKStore()
  const [allocationInfo, setAllocationInfo] = useState<AllocationInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exists, setExists] = useState<boolean>(false)

  const checkAllocation = useCallback(async () => {
    if (!commitment || !recipient || !sdkStore.sdk) {
      setAllocationInfo(null)
      setExists(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const sdk = sdkStore.sdk

      // 获取所有Allocations
      await sdk.stores.allocations.fetchList()

      // 从store中查找匹配的Allocation
      const allocations = sdk.stores.allocations.all || []
      const matchingAllocation = allocations.find((alloc: any) => {
        return (
          alloc.commitment === commitment &&
          alloc.recipient?.toLowerCase() === recipient.toLowerCase()
        )
      })

      if (matchingAllocation) {
        const info: AllocationInfo = {
          id: matchingAllocation.id || '',
          commitment: matchingAllocation.commitment || commitment,
          recipient: matchingAllocation.recipient || recipient,
          amount: matchingAllocation.amount || 0,
          currency: matchingAllocation.currency || 'USDT',
          status: matchingAllocation.status || 'pending',
        }
        setAllocationInfo(info)
        setExists(true)
      } else {
        setAllocationInfo(null)
        setExists(false)
      }
    } catch (error: any) {
      console.error('查询Allocation失败:', error)
      setError(error.message)
      setAllocationInfo(null)
      setExists(false)
    } finally {
      setLoading(false)
    }
  }, [commitment, recipient, sdkStore.sdk])

  useEffect(() => {
    checkAllocation()
  }, [checkAllocation])

  return {
    allocationInfo,
    exists,
    loading,
    error,
    refresh: checkAllocation,
  }
}
