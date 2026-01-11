'use client'

import { useEffect, useMemo } from 'react'
import { useSDKStore } from '../stores/sdk-store'

/**
 * useStatistics - 获取全局统计数据 Hook
 */
export function useStatistics() {
  const sdkStore = useSDKStore()

  // 加载统计数据（只有在 SDK 连接后才加载）
  useEffect(() => {
    if (!sdkStore.sdk) {
      return
    }

    // 检查 statistics store 是否存在（兼容旧版本 SDK）
    if (!sdkStore.sdk.stores.statistics) {
      console.warn('Statistics store not available. Please update SDK to latest version.')
      return
    }

    // 获取统计数据
    sdkStore.sdk.stores.statistics.fetchOverview().catch(err => {
      console.error('加载统计数据失败:', err)
    })
  }, [sdkStore.sdk])

  // 直接访问 statistics store（MobX 会自动追踪变化）
  // 兼容旧版本 SDK（如果没有 statistics store，返回默认值）
  const statistics = sdkStore.sdk?.stores.statistics

  return {
    totalLockedValue: statistics?.totalLockedValue || '0',
    totalVolume: statistics?.totalVolume || '0',
    privateTxCount: statistics?.privateTxCount || 0,
    activeUsers: statistics?.activeUsers || 0,
    loading: statistics?.loading || false,
    error: statistics?.error,
    refresh: () => {
      if (sdkStore.sdk?.stores.statistics) {
        return sdkStore.sdk.stores.statistics.fetchOverview()
      }
      return Promise.resolve()
    },
  }
}

// 导出 observer 版本（实际上就是原函数，observer 应该在组件级别使用）
export const useStatisticsObserver = useStatistics

