'use client'

import { useCallback, useMemo } from 'react'
import { useSDKStore } from '../stores/sdk-store'

/**
 * 分页信息接口
 */
export interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

/**
 * useWithdrawRequest - 提款请求状态跟踪 Hook
 */
export function useWithdrawRequest() {
  const sdkStore = useSDKStore()

  /**
   * 获取提款请求列表（支持分页）
   */
  const fetchList = useCallback(
    async (params?: { 
      status?: string
      owner?: string
      page?: number
      limit?: number
    }) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      // 使用 SDK 的 withdrawals store
      const withdrawals = await sdkStore.sdk.stores.withdrawals.fetchList(params)
      return withdrawals
    },
    [sdkStore.sdk]
  )

  /**
   * 获取提款请求列表（带分页信息）
   */
  const fetchListWithPagination = useCallback(
    async (params?: {
      status?: string
      tokenId?: string
      targetChain?: number
      page?: number
      limit?: number
    }): Promise<{ data: any[]; pagination: PaginationInfo }> => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      const page = params?.page || 1
      const limit = params?.limit || 10

      // 直接使用 fetchList 获取数据
      const withdrawals = await sdkStore.sdk.stores.withdrawals.fetchList({
        status: params?.status,
        tokenId: params?.tokenId,
        targetChain: params?.targetChain,
        page,
        limit,
      })

      // 由于 fetchList 不返回分页信息，我们通过数据长度估算
      // 如果返回的数据长度等于 limit，可能还有下一页
      const hasNext = withdrawals.length === limit
      const hasPrev = page > 1

      // 估算总数（基于当前页和是否有下一页）
      // 这是一个近似值，实际总数需要从后端获取
      const estimatedTotal = hasNext ? page * limit + 1 : (page - 1) * limit + withdrawals.length
      const totalPages = Math.ceil(estimatedTotal / limit)

      return {
        data: withdrawals,
        pagination: {
          page,
          limit,
          total: estimatedTotal,
          totalPages,
          hasNext,
          hasPrev,
        },
      }
    },
    [sdkStore.sdk]
  )

  /**
   * 获取所有提款请求（响应式）
   */
  const all = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    return sdkStore.sdk.stores.withdrawals.all || []
  }, [sdkStore.sdk?.stores.withdrawals.all])

  /**
   * 获取进行中的提款请求
   */
  const pending = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    const withdrawals = sdkStore.sdk.stores.withdrawals.all || []
    return withdrawals.filter((w: any) => {
      const status = w.status || w.frontendStatus
      return status === 'pending' || status === 'proving' || status === 'submitting' || status === 'processing'
    })
  }, [sdkStore.sdk?.stores.withdrawals.all])

  /**
   * 获取已完成的提款请求
   */
  const completed = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    const withdrawals = sdkStore.sdk.stores.withdrawals.all || []
    return withdrawals.filter((w: any) => {
      const status = w.status || w.frontendStatus
      return status === 'completed'
    })
  }, [sdkStore.sdk?.stores.withdrawals.all])

  /**
   * 获取失败的提款请求
   */
  const failed = useMemo(() => {
    if (!sdkStore.sdk) {
      return []
    }
    const withdrawals = sdkStore.sdk.stores.withdrawals.all || []
    return withdrawals.filter((w: any) => {
      const status = w.status || w.frontendStatus
      return status === 'failed' || status === 'failed_permanent'
    })
  }, [sdkStore.sdk?.stores.withdrawals.all])

  /**
   * 根据 ID 获取提款请求
   */
  const getById = useCallback(
    (id: string) => {
      if (!sdkStore.sdk) {
        return null
      }
      return sdkStore.sdk.stores.withdrawals.get(id)
    },
    [sdkStore.sdk]
  )

  return {
    fetchList,
    fetchListWithPagination,
    all,
    pending,
    completed,
    failed,
    getById,
    loading: sdkStore.sdk?.stores.withdrawals.loading || false,
  }
}

// 导出 observer 版本（实际上就是原函数，observer 应该在组件级别使用）
export const useWithdrawRequestObserver = useWithdrawRequest
