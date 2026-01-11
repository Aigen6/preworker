'use client'

import { useCallback, useMemo } from 'react'
import { useSDKStore } from '../stores/sdk-store'

/**
 * useCheckbooksData - 获取存款数据 Hook
 */
export function useCheckbooksData() {
  const sdkStore = useSDKStore()

  /**
   * 获取 Checkbooks 列表
   * @returns 返回 checkbooks 数组和分页信息
   */
  const fetchList = useCallback(
    async (params?: { 
      status?: string
      tokenId?: string
      deleted?: boolean
      page?: number
      limit?: number
    }): Promise<{ checkbooks: any[], pagination?: any }> => {
      if (!sdkStore.sdk) {
        console.warn('SDK 未连接，无法获取 Checkbooks 数据')
        return { checkbooks: [] }
      }

      try {
        // 使用 SDK 的 checkbooks store 获取数据
        // 注意：SDK 会使用 JWT token 中的地址，不需要传递 owner 参数
        // SDKProvider 会确保在账户切换时生成新的 JWT token
        const result = await sdkStore.sdk.stores.checkbooks.fetchList({
          status: params?.status,
          tokenId: params?.tokenId,
          deleted: params?.deleted,
          page: params?.page || 1,
          limit: params?.limit || 20,
        })
        
        // fetchList 现在返回 { data, pagination }，使用后端返回的真实分页信息
        const checkbooks = result.data || []
        const backendPagination = result.pagination
        
        // 如果后端返回了分页信息，使用它；否则使用估算值（向后兼容）
        if (backendPagination) {
          return {
            checkbooks,
            pagination: {
              page: backendPagination.page || params?.page || 1,
              limit: backendPagination.limit || params?.limit || 20,
              total: backendPagination.total || 0,
              totalPages: backendPagination.totalPages || backendPagination.pages || 1,
              hasNext: backendPagination.hasNext !== undefined ? backendPagination.hasNext : (backendPagination.page || 1) < (backendPagination.totalPages || backendPagination.pages || 1),
              hasPrev: backendPagination.hasPrev !== undefined ? backendPagination.hasPrev : (backendPagination.page || 1) > 1,
            }
          }
        }
        
        // 向后兼容：如果没有分页信息，使用估算值
        const limit = params?.limit || 20
        const page = params?.page || 1
        const hasNext = checkbooks.length === limit
        const hasPrev = page > 1
        const estimatedTotal = hasNext ? page * limit + 1 : (page - 1) * limit + checkbooks.length
        const totalPages = Math.ceil(estimatedTotal / limit)
        
        return {
          checkbooks,
          pagination: {
            page,
            limit,
            total: estimatedTotal,
            totalPages,
            hasNext,
            hasPrev,
          }
        }
      } catch (error) {
        console.error('获取 Checkbooks 数据失败:', error)
        return { checkbooks: [] }
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 获取所有 Checkbooks（响应式）
   */
  const all = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    return sdkStore.sdk.stores.checkbooks.all || []
  }, [sdkStore.sdk?.stores.checkbooks.all])

  /**
   * 获取单个 Checkbook
   */
  const getById = useCallback(
    (id: string) => {
      if (!sdkStore.sdk) {
        return null
      }
      return sdkStore.sdk.stores.checkbooks.get(id)
    },
    [sdkStore.sdk]
  )

  return {
    fetchList,
    all,
    getById,
    loading: sdkStore.sdk?.stores.checkbooks.loading || false,
  }
}

// 导出 observer 版本（实际上就是原函数，observer 应该在组件级别使用）
export const useCheckbooksDataObserver = useCheckbooksData

