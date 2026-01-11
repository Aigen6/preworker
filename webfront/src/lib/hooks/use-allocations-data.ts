'use client'

import { useCallback, useMemo } from 'react'
import { useSDKStore } from '../stores/sdk-store'

/**
 * useAllocationsData - 获取凭证数据 Hook
 */
export function useAllocationsData() {
  const sdkStore = useSDKStore()

  /**
   * 获取凭证列表
   */
  const fetchList = useCallback(
    async (params?: {
      checkbook_id?: string
      token_id?: number
      status?: 'idle' | 'pending' | 'used'
    }) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      // 使用 SDK 的 allocations store
      const allocations = await sdkStore.sdk.stores.allocations.fetchList(params)
      return allocations
    },
    [sdkStore.sdk]
  )

  /**
   * 获取所有凭证（响应式）
   */
  const all = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    return sdkStore.sdk.stores.allocations.all
  }, [sdkStore.sdk?.stores.allocations.all])

  /**
   * 获取 idle 状态的凭证
   */
  const idle = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    return sdkStore.sdk.stores.allocations.idle || []
  }, [sdkStore.sdk?.stores.allocations.idle])

  /**
   * 获取 pending 状态的凭证
   */
  const pending = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    return sdkStore.sdk.stores.allocations.pending || []
  }, [sdkStore.sdk?.stores.allocations.pending])

  /**
   * 按 checkbookId 分组
   */
  const byCheckbookId = useMemo(() => {
    if (!sdkStore.sdk) {
      return new Map()
    }
    // SDK uses 'byCheckbook' instead of 'byCheckbookId'
    return sdkStore.sdk.stores.allocations.byCheckbook || new Map()
  }, [sdkStore.sdk?.stores.allocations.byCheckbook])

  /**
   * 按 tokenId 分组
   */
  const byTokenId = useMemo(() => {
    if (!sdkStore.sdk) {
      return new Map()
    }
    // SDK uses 'byToken' instead of 'byTokenId'
    return sdkStore.sdk.stores.allocations.byToken || new Map()
  }, [sdkStore.sdk?.stores.allocations.byToken])

  return {
    fetchList,
    all,
    idle,
    pending,
    byCheckbookId,
    byTokenId,
    loading: sdkStore.sdk?.stores.allocations.loading || false,
  }
}

// 导出 observer 版本（实际上就是原函数，observer 应该在组件级别使用）
export const useAllocationsDataObserver = useAllocationsData

