'use client'

import { useCallback, useState } from 'react'
import { useWalletConnection } from './use-wallet-connection'
import { useSDKStore } from '../stores/sdk-store'
import { getSlip44FromChainId } from '@enclave-hq/sdk'
import type { FeeInfoData } from '@enclave-hq/sdk'

export interface RiskFeeInfo {
  riskScore: number
  riskLevel: string
  finalFeeRatePercent: number
  baseFeeRatePercent: number
  riskBasedFeePercent: number
  feeRateBps: number
  baseFee: string
  invitationCode?: string
  invitationSource?: string
}

export interface RiskFeeMetadata {
  mistTrackDetails?: {
    score: number
    hacking_event?: string
    detail_list?: string[]
    risk_level?: string
    risk_detail?: Array<{
      entity: string
      risk_type: string
      exposure_type: string
      hop_num: number
      volume: number
      percent: number
    }>
    risk_report_url?: string
    // 新增字段
    labels?: string[]
    label_type?: string
    malicious_events?: {
      phishing: number
      ransom: number
      stealing: number
      laundering: number
      phishing_list?: string[]
      ransom_list?: string[]
      stealing_list?: string[]
      laundering_list?: string[]
    }
    used_platforms?: {
      exchange?: { count: number; list?: string[] }
      dex?: { count: number; list?: string[] }
      mixer?: { count: number; list?: string[] }
      nft?: { count: number; list?: string[] }
    }
    relation_info?: {
      wallet?: { count: number; list?: string[] }
      ens?: { count: number; list?: string[] }
      twitter?: { count: number; list?: string[] }
    }
  }
  queryTime?: string
  [key: string]: any
}

/**
 * useRiskFeeInfo - 获取地址风险评分和费率信息的 Hook
 * 使用 SDK 的 KYT Oracle API
 */
export function useRiskFeeInfo() {
  const { address, chainId } = useWalletConnection()
  const sdkStore = useSDKStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [riskFeeInfo, setRiskFeeInfo] = useState<RiskFeeInfo | null>(null)
  const [lastQueryTime, setLastQueryTime] = useState<Date | null>(null)
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<RiskFeeMetadata | null>(null)

  /**
   * 获取风险评分和费率信息（从缓存读取，不刷新）
   */
  const fetchRiskFeeInfo = useCallback(
    async (tokenKey: string = 'USDT', forceRefresh: boolean = false) => {
      if (!address || !chainId) {
        throw new Error('钱包未连接')
      }

      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      setLoading(true)
      setError(null)
      setRateLimitError(null)

      try {
        // 转换 chain ID 为链名称
        const slip44ChainId = getSlip44FromChainId(chainId) || chainId
        let chainName = 'bsc' // 默认 BSC
        if (slip44ChainId === 60) {
          chainName = 'ethereum'
        } else if (slip44ChainId === 714) {
          chainName = 'bsc'
        } else if (slip44ChainId === 966) {
          chainName = 'polygon'
        } else if (slip44ChainId === 195) {
          chainName = 'tron'
        }

        // 使用 SDK 的 KYT Oracle API
        // forceRefresh=true 时使用 POST (refreshFeeInfoByAddress)，否则使用 GET (getFeeInfoByAddress)
        const response = forceRefresh
          ? await sdkStore.sdk.kytOracle.refreshFeeInfoByAddress({
              address: address,
              chain: chainName,
              tokenKey: tokenKey,
            })
          : await sdkStore.sdk.kytOracle.getFeeInfoByAddress({
              address: address,
              chain: chainName,
              tokenKey: tokenKey,
            })

        // 处理限流情况（success: false, memo: "每次存款前只能查询一次"）
        // 限流时，后端返回了完整的数据，只是 success: false，所以应该正常处理数据，不抛出错误
        // Type assertion needed because memo property may not be recognized in compiled types
        const responseWithMemo = response as typeof response & { memo?: string; metadata?: any }
        if (!response.success && responseWithMemo.memo && response.data) {
          const memoMsg = responseWithMemo.memo
          setRateLimitError(memoMsg)
          // 限流时，使用 data 更新 Store 中的数据（数据已正常返回）
          const data: FeeInfoData = response.data
          setRiskFeeInfo({
            riskScore: data.riskScore,
            riskLevel: data.riskLevel,
            finalFeeRatePercent: data.finalFeeRatePercent,
            baseFeeRatePercent: data.baseFeeRatePercent,
            riskBasedFeePercent: data.riskBasedFeePercent,
            feeRateBps: data.feeRateBps,
            baseFee: data.baseFee,
            invitationCode: data.invitationCode,
            invitationSource: data.invitationSource,
          })
          if (response.last_query_time) {
            setLastQueryTime(new Date(response.last_query_time))
          }
          // 保存 metadata
          if (responseWithMemo.metadata) {
            setMetadata({
              ...responseWithMemo.metadata,
              queryTime: responseWithMemo.metadata.queryTime || response.last_query_time || new Date().toISOString(),
            })
          } else if (response.last_query_time) {
            setMetadata({
              queryTime: response.last_query_time,
            })
          }
          // 限流时数据已正常返回，不抛出错误，静默处理
          // 如果需要提示用户，可以在调用者处根据 rateLimitError 状态决定是否显示
          return response
        }

        // 处理成功响应
        if (response.success && response.data) {
          const data: FeeInfoData = response.data
          setRiskFeeInfo({
            riskScore: data.riskScore,
            riskLevel: data.riskLevel,
            finalFeeRatePercent: data.finalFeeRatePercent,
            baseFeeRatePercent: data.baseFeeRatePercent,
            riskBasedFeePercent: data.riskBasedFeePercent,
            feeRateBps: data.feeRateBps,
            baseFee: data.baseFee,
            invitationCode: data.invitationCode,
            invitationSource: data.invitationSource,
          })
          if (response.last_query_time) {
            setLastQueryTime(new Date(response.last_query_time))
          }
          // 保存 metadata
          if (responseWithMemo.metadata) {
            setMetadata({
              ...responseWithMemo.metadata,
              queryTime: responseWithMemo.metadata.queryTime || response.last_query_time || new Date().toISOString(),
            })
          } else if (response.last_query_time) {
            setMetadata({
              queryTime: response.last_query_time,
            })
          }
        } else {
          throw new Error(response.error || '获取风险评分和费率失败')
        }

        return response
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '获取风险评分和费率失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [address, chainId, sdkStore.sdk]
  )

  /**
   * 直接更新费率信息（用于从绑定响应中更新）
   */
  const updateRiskFeeInfo = useCallback((data: FeeInfoData, lastQueryTime?: string, metadata?: RiskFeeMetadata) => {
    setRiskFeeInfo({
      riskScore: data.riskScore,
      riskLevel: data.riskLevel,
      finalFeeRatePercent: data.finalFeeRatePercent,
      baseFeeRatePercent: data.baseFeeRatePercent,
      riskBasedFeePercent: data.riskBasedFeePercent,
      feeRateBps: data.feeRateBps,
      baseFee: data.baseFee,
      invitationCode: data.invitationCode,
      invitationSource: data.invitationSource,
    })
    if (lastQueryTime) {
      setLastQueryTime(new Date(lastQueryTime))
    }
    if (metadata) {
      setMetadata({
        ...metadata,
        queryTime: metadata.queryTime || lastQueryTime || new Date().toISOString(),
      })
    } else if (lastQueryTime) {
      setMetadata({
        queryTime: lastQueryTime,
      })
    }
  }, [])

  /**
   * 清除错误和限流错误
   */
  const clearError = useCallback(() => {
    setError(null)
    setRateLimitError(null)
  }, [])

  return {
    riskFeeInfo,
    lastQueryTime,
    metadata,
    loading,
    error,
    rateLimitError,
    fetchRiskFeeInfo,
    updateRiskFeeInfo,
    clearError,
  }
}

