'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWalletConnection } from './use-wallet-connection'
import { TRON_CHAIN_ID } from '@/lib/utils/wallet-utils'
import { createQueryTronWeb, getTronQueryRpcUrl } from '@/lib/utils/tron-rpc-reader'

// 全局请求锁，防止多个组件同时发起请求
let globalFetching = false
let globalLastFetchTime = 0
let globalLastFetchAddress = ''
let globalLastResources: TronResources | null = null
const GLOBAL_MIN_FETCH_INTERVAL = 5000 // 全局最小调用间隔：5秒

/**
 * TRON 账户资源信息（Energy 和 Bandwidth）
 */
export interface TronResources {
  energy: number // Energy 余额
  bandwidth: number // Bandwidth 余额
  frozenEnergy: number // 冻结的 Energy
  frozenBandwidth: number // 冻结的 Bandwidth
  energyLimit: number // Energy 限制
  bandwidthLimit: number // Bandwidth 限制
}

/**
 * 检查 TRON 账户的 Energy 和 Bandwidth 余额
 * 直接使用 TronWeb 从链上读取，确保数据实时准确
 */
export function useTronResources() {
  const { address, chainId, isConnected } = useWalletConnection()
  const [resources, setResources] = useState<TronResources | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 使用 ref 防止重复调用
  const fetchingRef = useRef(false)

  // 检查账户资源
  const fetchResources = useCallback(async () => {
    // 全局防重复调用：如果正在请求或距离上次请求时间太短，直接返回缓存结果
    const now = Date.now()
    if (globalFetching || (now - globalLastFetchTime < GLOBAL_MIN_FETCH_INTERVAL && globalLastFetchAddress === address)) {
      // 如果有缓存的结果且地址相同，直接使用缓存
      if (globalLastResources && globalLastFetchAddress === address) {
        setResources(globalLastResources)
        return
      }
      return
    }
    
    // 防止本地重复调用
    if (fetchingRef.current) {
      return
    }
    
    globalFetching = true
    fetchingRef.current = true
    globalLastFetchTime = now
    globalLastFetchAddress = address || ''
    // 只在 TRON 网络且已连接时查询
    if (chainId !== TRON_CHAIN_ID || !isConnected || !address) {
      setResources(null)
      return
    }

    // 验证是否为 TRON 地址格式
    if (!address.startsWith('T') || address.length !== 34) {
      setError('无效的 TRON 地址格式')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 优先使用 TronWeb 直接读取链上数据
      let accountResource: any = null
      let dataSource = 'API' // 数据来源：'TronWeb' 或 'API'
      
      if (typeof window !== 'undefined') {
        // 尝试使用 TronWeb
        if ((window as any).tronWeb) {
          const tronWeb = (window as any).tronWeb
          console.log('📡 使用 TronWeb 直接读取链上资源数据')
          try {
            accountResource = await tronWeb.trx.getAccountResources(address)
            dataSource = 'TronWeb'
          } catch (err) {
            console.warn('TronWeb 读取失败，回退到 API:', err)
          }
        }
        // 如果没有 TronWeb，尝试使用 TronLink
        else if ((window as any).tronLink && (window as any).tronLink.tronWeb) {
          const tronWeb = (window as any).tronLink.tronWeb
          console.log('📡 使用 TronLink 直接读取链上资源数据')
          try {
            accountResource = await tronWeb.trx.getAccountResources(address)
            dataSource = 'TronLink'
          } catch (err) {
            console.warn('TronLink 读取失败，回退到 API:', err)
          }
        }
      }
      
      // 如果 TronWeb 不可用，尝试使用自定义 TronWeb 实例（使用自定义 RPC）
      // 如果自定义 RPC 失败（CORS 等），则抛出错误（因为没有钱包 RPC 可回退）
      if (!accountResource) {
        console.log('📡 TronWeb 不可用，尝试使用自定义查询 RPC')
        try {
          const queryTronWeb = createQueryTronWeb()
          accountResource = await queryTronWeb.trx.getAccountResources(address)
          dataSource = 'QueryRPC'
        } catch (err: any) {
          const errorMessage = err?.message || String(err)
          const isCorsError = errorMessage.includes('CORS') || 
                              errorMessage.includes('Network Error') ||
                              errorMessage.includes('Access-Control-Allow-Origin')
          
          if (isCorsError) {
            console.error('自定义查询 RPC 遇到 CORS 问题:', err)
            throw new Error('TRON RPC 遇到 CORS 问题。请使用 TronLink 钱包，或配置支持 CORS 的 RPC 服务。')
          } else {
            console.error('自定义查询 RPC 失败:', err)
            throw new Error(`TRON API 请求失败: ${errorMessage}`)
          }
        }
      }
      
      // 提取资源信息
      // 根据 TRON API 文档：
      // - EnergyUsed: 已使用的 Energy
      // - EnergyLimit: Energy 限制（包括冻结和委托的）
      // - NetUsed: 已使用的 Bandwidth
      // - NetLimit: Bandwidth 限制（包括冻结和委托的）
      // - FreeNetUsed: 已使用的免费 Bandwidth
      // - FreeNetLimit: 免费 Bandwidth 限制
      // - EnergyAvailable = EnergyLimit - EnergyUsed
      // - BandwidthAvailable = (FreeNetLimit - FreeNetUsed) + (NetLimit - NetUsed)
      
      const energyLimit = accountResource.EnergyLimit || 0
      const energyUsed = accountResource.EnergyUsed || 0
      const energyAvailable = Math.max(0, energyLimit - energyUsed)
      
      // Bandwidth 包括免费带宽和质押带宽
      // 注意：字段名可能是大小写混合，需要兼容多种格式
      const freeNetLimit = accountResource.FreeNetLimit || accountResource.freeNetLimit || accountResource.free_net_limit || 0
      const freeNetUsed = accountResource.FreeNetUsed || accountResource.freeNetUsed || accountResource.free_net_used || 0
      const freeNetAvailable = Math.max(0, freeNetLimit - freeNetUsed)
      
      const netLimit = accountResource.NetLimit || accountResource.netLimit || accountResource.net_limit || 0
      const netUsed = accountResource.NetUsed || accountResource.netUsed || accountResource.net_used || 0
      const netAvailable = Math.max(0, netLimit - netUsed)
      
      // 总可用带宽 = 免费带宽 + 质押带宽
      const bandwidthAvailable = freeNetAvailable + netAvailable
      const totalBandwidthLimit = freeNetLimit + netLimit
      
      console.log('📊 Bandwidth 详细计算:', {
        freeNetLimit,
        freeNetUsed,
        freeNetAvailable,
        netLimit,
        netUsed,
        netAvailable,
        bandwidthAvailable,
        totalBandwidthLimit,
        accountResourceKeys: Object.keys(accountResource),
      })
      
      // 冻结的资源（需要从账户信息获取）
      let frozenEnergy = 0
      let frozenBandwidth = 0
      
      // 尝试获取账户信息以获取冻结资源
      try {
        let accountInfo: any = null
        if (typeof window !== 'undefined') {
          if ((window as any).tronWeb) {
            accountInfo = await (window as any).tronWeb.trx.getAccount(address)
          } else if ((window as any).tronLink?.tronWeb) {
            accountInfo = await (window as any).tronLink.tronWeb.trx.getAccount(address)
          }
        }
        
        if (!accountInfo) {
          // 尝试使用自定义 TronWeb 实例（使用自定义 RPC）
          // 如果失败，静默忽略（不影响主要功能）
          try {
            const queryTronWeb = createQueryTronWeb()
            accountInfo = await queryTronWeb.trx.getAccount(address)
          } catch (err) {
            // 静默忽略错误，冻结资源信息将保持为 0
            console.warn('获取账户信息失败（不影响主要功能）:', err)
          }
        }
        
        if (accountInfo) {
          // 提取冻结的 Energy
          const frozenForEnergy = accountInfo.frozen?.find((f: any) => f.frozen_for_energy) || 
                                  accountInfo.account_resource?.frozen_balance_for_energy
          if (frozenForEnergy) {
            frozenEnergy = frozenForEnergy.frozen_balance || 0
          }
          
          // 提取冻结的 Bandwidth
          const frozenForBandwidth = accountInfo.frozen?.find((f: any) => !f.frozen_for_energy) ||
                                     accountInfo.account_resource?.frozen_balance_for_bandwidth
          if (frozenForBandwidth) {
            frozenBandwidth = frozenForBandwidth.frozen_balance || 0
          }
        }
      } catch (err) {
        console.warn('获取冻结资源信息失败:', err)
      }

      const resourcesData: TronResources = {
        energy: energyAvailable,
        bandwidth: bandwidthAvailable,
        frozenEnergy,
        frozenBandwidth,
        energyLimit,
        bandwidthLimit: totalBandwidthLimit,
      }

      console.log('📊 TRON 资源查询结果（链上直接读取）:', {
        address,
        energyAvailable,
        bandwidthAvailable,
        energyLimit,
        totalBandwidthLimit,
        energyUsed,
        netUsed,
        freeNetUsed,
        freeNetAvailable,
        netAvailable,
        source: dataSource,
        raw: accountResource,
      })

      // 缓存结果
      globalLastResources = resourcesData
      setResources(resourcesData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取 TRON 资源失败'
      setError(errorMessage)
      console.error('获取 TRON 资源失败:', err)
      
      // 如果 API 失败，设置默认值
      const defaultResources = {
        energy: 0,
        bandwidth: 0,
        frozenEnergy: 0,
        frozenBandwidth: 0,
        energyLimit: 0,
        bandwidthLimit: 0,
      }
      globalLastResources = defaultResources
      setResources(defaultResources)
    } finally {
      setLoading(false)
      fetchingRef.current = false
      globalFetching = false
    }
  }, [chainId, isConnected, address])

  // 使用 ref 存储最新的 fetchResources 函数，避免 useEffect 重复执行
  const fetchResourcesRef = useRef(fetchResources)
  useEffect(() => {
    fetchResourcesRef.current = fetchResources
  }, [fetchResources])

  // 当地址或链ID变化时自动刷新
  useEffect(() => {
    if (chainId === TRON_CHAIN_ID && isConnected && address) {
      // 延迟初始调用，避免组件挂载时立即调用
      const initialTimer = setTimeout(() => {
        fetchResourcesRef.current()
      }, 1000) // 延迟1秒后首次调用
      
      // 每 60 秒自动刷新一次（降低频率，减少 API 调用）
      const interval = setInterval(() => {
        fetchResourcesRef.current()
      }, 60000) // 从 30 秒改为 60 秒

      return () => {
        clearTimeout(initialTimer)
        clearInterval(interval)
      }
    } else {
      setResources(null)
    }
  }, [chainId, isConnected, address]) // 移除 fetchResources 依赖，使用 ref 访问

  // 检查是否有足够的资源进行交易
  // TRC-20 转账通常需要约 65,000 Energy（如果接收方已有代币）或 131,000 Energy（如果接收方没有代币）
  const hasEnoughEnergy = useCallback((requiredEnergy: number = 131000): boolean => {
    if (!resources) return false
    return resources.energy >= requiredEnergy
  }, [resources])

  // 检查是否有足够的 Bandwidth
  // 简单转账需要约 300-600 Bandwidth
  const hasEnoughBandwidth = useCallback((requiredBandwidth: number = 600): boolean => {
    if (!resources) return false
    return resources.bandwidth >= requiredBandwidth
  }, [resources])

  return {
    resources,
    loading,
    error,
    refresh: fetchResources,
    hasEnoughEnergy,
    hasEnoughBandwidth,
    isTronNetwork: chainId === TRON_CHAIN_ID && isConnected,
  }
}
