'use client'

import { useCallback, useMemo } from 'react'
import { useSDKStore } from '../stores/sdk-store'
import { useAllocationsData } from './use-allocations-data'

/**
 * useUserAssets - 获取用户资产 Hook
 */
export function useUserAssets() {
  const sdkStore = useSDKStore()
  const { all: allocations } = useAllocationsData()

  /**
   * 获取价格数据
   */
  const fetchPrices = useCallback(
    async (tokenIds?: number[]) => {
      if (!sdkStore.sdk) {
        console.warn('SDK 未连接，无法获取价格数据')
        return []
      }

      try {
        // 使用 SDK 的 prices store
        // Convert tokenIds from number[] to string[] if needed
        const tokenIdStrings = tokenIds?.map(id => String(id))
        const prices = await sdkStore.sdk.stores.prices.fetchPrices(tokenIdStrings)
        return prices
      } catch (error) {
        console.error('获取价格数据失败:', error)
        return []
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 计算总锁仓量
   */
  const totalLockedValue = useMemo(() => {
    if (!sdkStore.sdk) {
      return 0
    }

    // 获取所有 idle 状态的 allocations
    const idleAllocations = allocations.filter((a: any) => a.status === 'idle')
    
    // 获取价格数据
    const prices = sdkStore.sdk.stores.prices.all || []
    
    // 计算总价值
    let total = 0
    for (const allocation of idleAllocations) {
      // Allocation uses 'token' object with 'id' property, not 'tokenId'
      const tokenId = (allocation as any).token?.id || (allocation as any).tokenId
      const price = prices.find((p: any) => p.tokenId === tokenId || p.id === tokenId)
      if (price && allocation.amount) {
        // 注意：amount 可能是字符串格式（wei），需要转换
        // Enclave 系统中统一使用 18 位 decimal
        const tokenDecimals = 18
        const amount = typeof allocation.amount === 'string' 
          ? parseFloat(allocation.amount) / Math.pow(10, tokenDecimals)
          : allocation.amount
        total += amount * price.price
      }
    }
    
    return total
  }, [allocations, sdkStore.sdk?.stores.prices.all])

  /**
   * 获取所有价格（响应式）
   */
  const prices = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    return sdkStore.sdk.stores.prices.all || []
  }, [sdkStore.sdk?.stores.prices.all])

  return {
    fetchPrices,
    totalLockedValue,
    prices,
    allocations,
    loading: sdkStore.sdk?.stores.prices.loading || false,
  }
}

// 导出 observer 版本（实际上就是原函数，observer 应该在组件级别使用）
export const useUserAssetsObserver = useUserAssets

