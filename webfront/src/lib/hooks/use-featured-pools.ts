'use client'

import { useCallback, useMemo } from 'react'
import { useSDKStore } from '../stores/sdk-store'

/**
 * useFeaturedPools - 获取特色池子 Hook
 */
export function useFeaturedPools() {
  const sdkStore = useSDKStore()

  /**
   * 获取池子列表
   */
  const fetchPools = useCallback(
    async (params?: { featured?: boolean } | boolean) => {
      if (!sdkStore.sdk) {
        console.warn('SDK 未连接，无法获取池子数据')
        return []
      }

      try {
        // 使用 SDK 的 pools store
        // SDK may expect boolean or object, normalize the parameter
        const normalizedParams = typeof params === 'boolean' 
          ? params 
          : params?.featured
        const pools = await sdkStore.sdk.stores.pools.fetchPools(normalizedParams)
        return pools
      } catch (error) {
        console.error('获取池子数据失败:', error)
        return []
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 获取所有池子（响应式）
   */
  const all = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    return sdkStore.sdk.stores.pools.all || []
  }, [sdkStore.sdk?.stores.pools.all])

  /**
   * 获取特色池子（标记为 featured 的池子）
   */
  const featured = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    const pools = sdkStore.sdk.stores.pools.all || []
    // 根据实际 SDK 实现，可能需要检查池子的 featured 属性
    return pools.filter((pool: any) => pool.featured === true)
  }, [sdkStore.sdk?.stores.pools.all])

  /**
   * 获取单个池子
   */
  const getById = useCallback(
    (id: string | number) => {
      if (!sdkStore.sdk) {
        return null
      }
      // SDK expects string, convert number to string if needed
      const idStr = typeof id === 'number' ? String(id) : id
      return sdkStore.sdk.stores.pools.get(idStr)
    },
    [sdkStore.sdk]
  )

  return {
    fetchPools,
    all,
    featured,
    getById,
    loading: sdkStore.sdk?.stores.pools.loading || false,
  }
}

// 导出 observer 版本（实际上就是原函数，observer 应该在组件级别使用）
export const useFeaturedPoolsObserver = useFeaturedPools

