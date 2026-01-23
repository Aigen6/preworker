'use client'

import { useState, useCallback } from 'react'
import { useWalletConnection } from './use-wallet-connection'
import { TRON_CHAIN_ID } from '@/lib/utils/wallet-utils'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'

// 后端 API 基础 URL
// 如果设置为空字符串或 '/'，则使用相对路径（通过 Next.js rewrites 代理）
// 否则使用配置的绝对 URL
const ENERGY_RENTAL_API_URL = process.env.NEXT_PUBLIC_ENERGY_RENTAL_API_URL || 'http://localhost:4001'
// 在浏览器环境中，如果使用相对路径，直接使用空字符串（会使用当前域名）
// 在服务器环境中，需要完整的 URL
const API_BASE_URL = (ENERGY_RENTAL_API_URL === '' || ENERGY_RENTAL_API_URL === '/')
  ? (typeof window !== 'undefined' ? '' : 'http://localhost:4001') // 浏览器环境使用相对路径，服务器环境使用默认值
  : ENERGY_RENTAL_API_URL

/**
 * 租赁服务提供商类型
 */
export type RentalProvider = 'catfee' | 'gasstation' | 'tronfuel' | 'tronxenergy'

/**
 * 租赁订单状态
 */
export type RentalOrderStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * 租赁订单信息
 */
export interface RentalOrder {
  orderId: string
  provider: RentalProvider
  address?: string // 接收地址（兼容旧字段）
  receiverAddress?: string // 接收地址（新字段）
  energyAmount?: number
  bandwidthAmount?: number
  duration?: string | number // 租赁时长（'1h', '24h' 或小时数）
  cost: number // 费用（TRX）
  status: RentalOrderStatus
  txHash?: string
  createdAt: number
  expiresAt?: number
  // 支付信息（用于直接支付）
  paymentAddress?: string // 支付地址
  paymentAmount?: number // 支付金额（TRX）
  paymentAmountSun?: number // 支付金额（SUN）
  paymentMemo?: string // 支付备注
}

/**
 * 租赁估算结果
 */
export interface RentalEstimate {
  provider: RentalProvider
  energyCost?: number // Energy 费用（TRX）
  bandwidthCost?: number // Bandwidth 费用（TRX）
  totalCost: number // 总费用（TRX）
  estimatedTime: number // 预计完成时间（秒）
  savings: number // 相比直接燃烧TRX节省的费用（TRX）
}

/**
 * TRON Energy/Bandwidth 租赁服务
 * 支持多个租赁服务提供商的API集成
 */
export function useTronEnergyRental() {
  const { address, chainId, isConnected } = useWalletConnection()
  const { walletManager } = useSDKWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentOrder, setCurrentOrder] = useState<RentalOrder | null>(null)

  /**
   * 估算租赁费用
   * 调用后端 API
   */
  const estimateRental = useCallback(async (
    energyAmount: number,
    bandwidthAmount: number,
    provider: RentalProvider = 'catfee',
    duration: string = '1h'
  ): Promise<RentalEstimate | null> => {
    if (chainId !== TRON_CHAIN_ID || !isConnected || !address) {
      throw new Error('请先连接 TRON 网络')
    }

    try {
      // 调用后端 API
      const params = new URLSearchParams({
        provider,
        energyAmount: energyAmount.toString(),
        bandwidthAmount: bandwidthAmount.toString(),
        duration,
      })

      // 构建完整的 API URL
      const apiUrl = API_BASE_URL 
        ? `${API_BASE_URL}/api/energy-rental/estimate?${params}`
        : `/api/energy-rental/estimate?${params}`
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `估算失败: ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '估算失败'
      console.error('租赁费用估算失败:', err)
      throw new Error(errorMessage)
    }
  }, [chainId, isConnected, address])

  /**
   * 创建租赁订单
   * 调用后端 API
   */
  const createRentalOrder = useCallback(async (
    energyAmount: number,
    bandwidthAmount: number,
    provider: RentalProvider = 'catfee',
    duration: string = '1h'
  ): Promise<RentalOrder> => {
    if (chainId !== TRON_CHAIN_ID || !isConnected || !address) {
      throw new Error('请先连接 TRON 网络钱包')
    }

    setLoading(true)
    setError(null)

    try {
      // 调用后端 API 创建订单
      // 构建完整的 API URL
      const apiUrl = API_BASE_URL 
        ? `${API_BASE_URL}/api/energy-rental/order`
        : `/api/energy-rental/order`
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          receiverAddress: address,
          energyAmount,
          bandwidthAmount,
          duration,
          useDirectPayment: true, // 使用"一单一付"模式，强制用户直接支付
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `创建订单失败: ${response.statusText}`)
      }

      const order = await response.json()
      setCurrentOrder(order)
      return order
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建租赁订单失败'
      setError(errorMessage)
      console.error('创建租赁订单失败:', err)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [chainId, isConnected, address, estimateRental])

  /**
   * 获取支付信息
   * 从后端获取支付地址和金额
   */
  const getPaymentInfo = useCallback(async (order: RentalOrder) => {
    try {
      // 构建完整的 API URL
      const apiUrl = API_BASE_URL 
        ? `${API_BASE_URL}/api/energy-rental/payment/${order.provider}/${order.orderId}`
        : `/api/energy-rental/payment/${order.provider}/${order.orderId}`
      
      const response = await fetch(apiUrl,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `获取支付信息失败: ${response.statusText}`)
      }

      const paymentInfo = await response.json()
      
      // 如果是 API 模式（费用已从账户扣除），返回特殊标记
      if (paymentInfo.isApiMode) {
        console.log('ℹ️  CatFee API 模式：费用已从账户余额扣除，无需用户直接支付')
        return {
          ...paymentInfo,
          requiresPayment: false, // 标记为不需要用户支付
        }
      }
      
      return paymentInfo
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取支付信息失败'
      console.error('获取支付信息失败:', err)
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * 直接支付租赁订单（使用TRX转账）
   * 前端直接使用TronWeb发送TRX转账到服务商的支付地址
   */
  const payRentalOrder = useCallback(async (order: RentalOrder): Promise<string> => {
    if (!address) {
      throw new Error('钱包未连接')
    }

    try {
      setLoading(true)
      setError(null)

      // 获取支付信息（如果订单中没有）
      let paymentAddress: string
      let paymentAmountSun: number
      let paymentMemo: string

      if (order.paymentAddress && (order.paymentAmount || order.paymentAmountSun)) {
        // 如果订单中已有支付信息，直接使用
        paymentAddress = order.paymentAddress
        paymentAmountSun = order.paymentAmountSun || Math.floor((order.paymentAmount || 0) * 1_000_000)
        paymentMemo = order.paymentMemo || order.orderId
      } else {
        // 否则从后端获取
        try {
          const paymentInfo = await getPaymentInfo(order)
          paymentAddress = paymentInfo.paymentAddress
          paymentAmountSun = paymentInfo.paymentAmountSun
          paymentMemo = paymentInfo.paymentMemo || order.orderId
        } catch (err) {
          console.error('获取支付信息失败:', err)
          throw new Error('无法获取支付信息，请稍后重试')
        }
      }

      // 检查是否是 API 模式（不需要用户支付）
      if (order.isApiMode || (paymentInfo as any)?.isApiMode || (paymentInfo as any)?.requiresPayment === false) {
        console.log('ℹ️  CatFee API 模式：费用已从账户余额扣除，无需用户支付')
        // 对于 API 模式，直接返回成功，不需要发送转账
        return 'API_MODE_NO_PAYMENT_REQUIRED'
      }

      if (!paymentAddress) {
        throw new Error('支付地址不可用，请稍后重试')
      }

      if (!paymentAmountSun || paymentAmountSun <= 0) {
        throw new Error('支付金额无效，请稍后重试')
      }

      // 使用TronWeb发送TRX转账
      if (typeof window !== 'undefined') {
        // 优先使用 TronWeb
        if ((window as any).tronWeb) {
          const tronWeb = (window as any).tronWeb
          
          console.log('准备发送TRX转账:', {
            to: paymentAddress,
            amount: paymentAmountSun,
            amountTRX: (paymentAmountSun / 1_000_000).toFixed(6),
            memo: paymentMemo,
          })
          
          // 构建TRX转账交易
          const transaction = await tronWeb.transactionBuilder.sendTrx(
            paymentAddress,
            paymentAmountSun,
            address
          )
          
          // 如果有备注，添加到交易中
          // 注意：TRON 转账的备注需要通过 data 字段添加
          if (paymentMemo) {
            // 将字符串转换为 hex（浏览器环境兼容）
            const memoHex = Array.from(new TextEncoder().encode(paymentMemo))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')
            transaction.raw_data.data = memoHex
          }
          
          // 签名交易
          const signedTransaction = await tronWeb.trx.sign(transaction)
          
          // 广播交易
          const result = await tronWeb.trx.broadcast(signedTransaction)
          
          if (result.result === true && result.txid) {
            const paymentTxHash = result.txid
            
            console.log('✅ TRX转账成功:', paymentTxHash)
            
            // 如果是一单一付模式，需要提交支付哈希到后端
            if ((order as any).isDirectPaymentMode && order.provider === 'catfee') {
              try {
                const submitApiUrl = API_BASE_URL 
                  ? `${API_BASE_URL}/api/energy-rental/payment/${order.provider}/${order.orderId}/submit`
                  : `/api/energy-rental/payment/${order.provider}/${order.orderId}/submit`
                
                const submitResponse = await fetch(submitApiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    paymentHash: paymentTxHash,
                  }),
                })
                
                if (!submitResponse.ok) {
                  const errorData = await submitResponse.json().catch(() => ({ message: '提交支付哈希失败' }))
                  console.warn('⚠️  提交支付哈希失败:', errorData)
                  // 不抛出错误，因为支付已经成功，只是提交哈希失败
                } else {
                  console.log('✅ 支付哈希提交成功')
                }
              } catch (err) {
                console.warn('⚠️  提交支付哈希时出错:', err)
                // 不抛出错误，因为支付已经成功
              }
            }
            
            // 更新订单状态
            setCurrentOrder({
              ...order,
              status: 'processing',
              txHash: paymentTxHash,
            })
            
            return paymentTxHash
          } else {
            throw new Error(result.message || '交易广播失败')
          }
        } 
        // 如果没有 TronWeb，尝试使用 TronLink
        else if ((window as any).tronLink && (window as any).tronLink.tronWeb) {
          const tronWeb = (window as any).tronLink.tronWeb
          
          const transaction = await tronWeb.transactionBuilder.sendTrx(
            paymentAddress,
            paymentAmountSun,
            address
          )
          
          if (paymentMemo) {
            // 将字符串转换为 hex（浏览器环境兼容）
            const memoHex = Array.from(new TextEncoder().encode(paymentMemo))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')
            transaction.raw_data.data = memoHex
          }
          
          const signedTransaction = await tronWeb.trx.sign(transaction)
          const result = await tronWeb.trx.broadcast(signedTransaction)
          
          if (result.result === true && result.txid) {
            const paymentTxHash = result.txid
            console.log('✅ TRX转账成功 (TronLink):', paymentTxHash)
            
            // 如果是一单一付模式，需要提交支付哈希到后端
            if ((order as any).isDirectPaymentMode && order.provider === 'catfee') {
              try {
                const submitApiUrl = API_BASE_URL 
                  ? `${API_BASE_URL}/api/energy-rental/payment/${order.provider}/${order.orderId}/submit`
                  : `/api/energy-rental/payment/${order.provider}/${order.orderId}/submit`
                
                const submitResponse = await fetch(submitApiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    paymentHash: paymentTxHash,
                  }),
                })
                
                if (!submitResponse.ok) {
                  const errorData = await submitResponse.json().catch(() => ({ message: '提交支付哈希失败' }))
                  console.warn('⚠️  提交支付哈希失败:', errorData)
                } else {
                  console.log('✅ 支付哈希提交成功')
                }
              } catch (err) {
                console.warn('⚠️  提交支付哈希时出错:', err)
              }
            }
            
            setCurrentOrder({
              ...order,
              status: 'processing',
              txHash: paymentTxHash,
            })
            return paymentTxHash
          } else {
            throw new Error(result.message || '交易广播失败')
          }
        } 
        else {
          throw new Error('未检测到TronWeb或TronLink，请使用TRON钱包')
        }
      } else {
        throw new Error('浏览器环境不可用')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '支付失败'
      setError(errorMessage)
      console.error('支付租赁订单失败:', err)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [address, getPaymentInfo])

  /**
   * 查询订单状态
   * 调用后端 API
   */
  const checkOrderStatus = useCallback(async (order: RentalOrder): Promise<RentalOrder> => {
    try {
      // 构建完整的 API URL
      const apiUrl = API_BASE_URL 
        ? `${API_BASE_URL}/api/energy-rental/order/${order.provider}/${order.orderId}`
        : `/api/energy-rental/order/${order.provider}/${order.orderId}`
      
      // 调用后端 API 查询订单状态
      const response = await fetch(apiUrl,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `查询订单状态失败: ${response.statusText}`)
      }

      const updatedOrder = await response.json()
      setCurrentOrder(updatedOrder)
      return updatedOrder
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '查询订单状态失败'
      setError(errorMessage)
      console.error('查询订单状态失败:', err)
      throw new Error(errorMessage)
    }
  }, [])

  return {
    loading,
    error,
    currentOrder,
    estimateRental,
    createRentalOrder,
    getPaymentInfo,
    payRentalOrder,
    checkOrderStatus,
    clearError: () => setError(null),
  }
}

// ==================== 以下代码已迁移到后端服务 ====================
// 前端现在通过后端 API 调用，不再直接调用服务商 API
// 保留这些函数作为备用（如果需要直接调用）

/**
 * GasStation API 实现（已迁移到后端）
 * API文档: https://gasdocs-en.gasstation.ai
 * @deprecated 使用后端 API 代替
 */
async function estimateGasStation(energyAmount: number, bandwidthAmount: number): Promise<RentalEstimate> {
  const config = getProviderConfig('gasstation')
  if (!config || !config.enabled) {
    throw new Error('GasStation 服务未启用')
  }

  try {
    // 获取价格信息
    // API: GET /api/mpc/tron/gas/order/price
    // service_charge_type: 10010 (10分钟), 20001 (1小时), 30001 (1天)
    const serviceChargeType = '30001' // 默认1天
    
    // 查询 Energy 价格
    const energyPriceUrl = new URL('https://api.gasstation.ai/api/mpc/tron/gas/order/price')
    energyPriceUrl.searchParams.set('resource_type', 'energy')
    energyPriceUrl.searchParams.set('service_charge_type', serviceChargeType)
    
    const energyPriceResponse = await fetch(energyPriceUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
    })

    if (!energyPriceResponse.ok) {
      throw new Error(`获取 Energy 价格失败: ${energyPriceResponse.statusText}`)
    }

    const energyPriceData = await energyPriceResponse.json()
    
    // 查询 Bandwidth 价格
    const bandwidthPriceUrl = new URL('https://api.gasstation.ai/api/mpc/tron/gas/order/price')
    bandwidthPriceUrl.searchParams.set('resource_type', 'bandwidth')
    bandwidthPriceUrl.searchParams.set('service_charge_type', serviceChargeType)
    
    const bandwidthPriceResponse = await fetch(bandwidthPriceUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
    })

    if (!bandwidthPriceResponse.ok) {
      throw new Error(`获取 Bandwidth 价格失败: ${bandwidthPriceResponse.statusText}`)
    }

    const bandwidthPriceData = await bandwidthPriceResponse.json()

    // 计算费用
    // 从价格数据中找到合适的价格档位
    const energyPriceBuilders = energyPriceData.price_builders || []
    const bandwidthPriceBuilders = bandwidthPriceData.price_builders || []
    
    // 找到最接近的价格档位（简化处理，使用第一个可用价格）
    const energyPrice = energyPriceBuilders[0]?.price || 0.00001
    const bandwidthPrice = bandwidthPriceBuilders[0]?.price || 0.000001
    
    // 确保 Energy 数量满足最小值 64,000
    const actualEnergyAmount = Math.max(energyAmount, 64000)
    
    const energyCost = (actualEnergyAmount / 1000) * energyPrice // 假设价格是按1000单位计算的
    const bandwidthCost = (bandwidthAmount / 1000) * bandwidthPrice
    const totalCost = energyCost + bandwidthCost
    
    // 估算节省（相比直接燃烧TRX，通常节省30-90%）
    const directBurnCost = actualEnergyAmount * 0.0001 + bandwidthAmount * 0.00001
    const savings = directBurnCost - totalCost

    return {
      provider: 'gasstation',
      energyCost,
      bandwidthCost,
      totalCost,
      estimatedTime: 30, // GasStation 通常30秒内完成
      savings: Math.max(0, savings),
    }
  } catch (err) {
    console.error('GasStation 价格查询失败:', err)
    // 如果API调用失败，返回估算值
    return {
      provider: 'gasstation',
      energyCost: energyAmount * 0.00001,
      bandwidthCost: bandwidthAmount * 0.000001,
      totalCost: energyAmount * 0.00001 + bandwidthAmount * 0.000001,
      estimatedTime: 30,
      savings: (energyAmount * 0.0001) * 0.5,
    }
  }
}

async function createGasStationOrder(
  address: string,
  energyAmount: number,
  bandwidthAmount: number,
  duration: number,
  cost: number
): Promise<RentalOrder> {
  const config = getProviderConfig('gasstation')
  if (!config || !config.enabled) {
    throw new Error('GasStation 服务未启用')
  }

  try {
    // API: POST /api/mpc/tron/gas/create_order
    // 参数要求：
    // - request_id: 唯一请求ID
    // - receive_address: 接收地址（需要资源的地址）
    // - service_charge_type: 服务时长代码 (10010=10分钟, 20001=1小时, 30001=1天)
    // - energy_num: Energy数量（最小值64,000）
    // - buy_type: 0=指定数量, 1=系统估算
    
    // 确保 Energy 数量满足最小值
    const actualEnergyAmount = Math.max(energyAmount, 64000)
    
    // 转换 duration（小时）到 service_charge_type
    let serviceChargeType = '30001' // 默认1天
    if (duration <= 0.17) { // 10分钟
      serviceChargeType = '10010'
    } else if (duration <= 1) { // 1小时
      serviceChargeType = '20001'
    } else if (duration <= 24) { // 1天
      serviceChargeType = '30001'
    }

    const requestId = `gs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const response = await fetch('https://api.gasstation.ai/api/mpc/tron/gas/create_order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify({
        request_id: requestId,
        receive_address: address,
        service_charge_type: serviceChargeType,
        energy_num: actualEnergyAmount,
        buy_type: 0, // 指定数量
        // 如果还需要 Bandwidth，可能需要额外的参数或单独的订单
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `创建订单失败: ${response.statusText}`)
    }

    const data = await response.json()
    
    // GasStation 返回 trade_no 作为订单ID
    const orderId = data.trade_no || requestId

    return {
      orderId,
      provider: 'gasstation',
      address,
      energyAmount: actualEnergyAmount,
      bandwidthAmount, // 注意：GasStation可能需要单独处理Bandwidth
      duration,
      cost,
      status: 'pending',
      createdAt: Date.now(),
    }
  } catch (err) {
    console.error('GasStation 订单创建失败:', err)
    throw err
  }
}

async function checkGasStationOrderStatus(orderId: string): Promise<RentalOrder> {
  const config = getProviderConfig('gasstation')
  if (!config || !config.enabled) {
    throw new Error('GasStation 服务未启用')
  }

  try {
    // 注意：GasStation API文档中没有明确列出订单状态查询接口
    // 可能需要通过订单历史接口或联系支持获取
    // 这里提供一个基础实现框架
    
    // 可能的API端点（需要确认）:
    // GET /api/mpc/tron/gas/order/status?trade_no={orderId}
    // 或
    // GET /api/mpc/tron/gas/order/history
    
    const response = await fetch(`https://api.gasstation.ai/api/mpc/tron/gas/order/status?trade_no=${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
    })

    if (!response.ok) {
      // 如果状态查询接口不存在，返回待处理状态
      // 实际实现中可能需要轮询或使用Webhook
      return {
        orderId,
        provider: 'gasstation',
        address: '',
        cost: 0,
        status: 'processing', // 假设正在处理中
        createdAt: Date.now(),
      }
    }

    const data = await response.json()
    
    // 根据API返回的状态映射到我们的状态
    let status: RentalOrderStatus = 'pending'
    if (data.status === 'completed' || data.status === 'success') {
      status = 'completed'
    } else if (data.status === 'failed' || data.status === 'error') {
      status = 'failed'
    } else if (data.status === 'processing' || data.status === 'pending') {
      status = 'processing'
    }

    return {
      orderId,
      provider: 'gasstation',
      address: data.receive_address || '',
      energyAmount: data.energy_num,
      bandwidthAmount: data.bandwidth_num,
      duration: data.duration,
      cost: data.cost || 0,
      status,
      txHash: data.tx_hash,
      createdAt: data.created_at || Date.now(),
    }
  } catch (err) {
    console.error('GasStation 订单状态查询失败:', err)
    // 如果查询失败，返回处理中状态
    return {
      orderId,
      provider: 'gasstation',
      address: '',
      cost: 0,
      status: 'processing',
      createdAt: Date.now(),
    }
  }
}

/**
 * TronFuel API 实现
 */
async function estimateTronFuel(energyAmount: number, bandwidthAmount: number): Promise<RentalEstimate> {
  // TODO: 实现 TronFuel API 调用
  // API文档: https://tronfuel.dev
  return {
    provider: 'tronfuel',
    energyCost: energyAmount * 0.000008,
    bandwidthCost: bandwidthAmount * 0.0000008,
    totalCost: energyAmount * 0.000008 + bandwidthAmount * 0.0000008,
    estimatedTime: 20,
    savings: (energyAmount * 0.0001) * 0.6,
  }
}

async function createTronFuelOrder(
  address: string,
  energyAmount: number,
  bandwidthAmount: number,
  duration: number,
  cost: number
): Promise<RentalOrder> {
  // TODO: 实现 TronFuel 订单创建API
  const orderId = `tf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  return {
    orderId,
    provider: 'tronfuel',
    address,
    energyAmount,
    bandwidthAmount,
    duration,
    cost,
    status: 'pending',
    createdAt: Date.now(),
  }
}

async function checkTronFuelOrderStatus(orderId: string): Promise<RentalOrder> {
  // TODO: 实现 TronFuel 订单状态查询API
  throw new Error('TronFuel 订单状态查询API未实现')
}

/**
 * TronXEnergy API 实现
 */
async function estimateTronXEnergy(energyAmount: number, bandwidthAmount: number): Promise<RentalEstimate> {
  // TODO: 实现 TronXEnergy API 调用
  return {
    provider: 'tronxenergy',
    energyCost: energyAmount * 0.000009,
    bandwidthCost: bandwidthAmount * 0.0000009,
    totalCost: energyAmount * 0.000009 + bandwidthAmount * 0.0000009,
    estimatedTime: 25,
    savings: (energyAmount * 0.0001) * 0.55,
  }
}

async function createTronXEnergyOrder(
  address: string,
  energyAmount: number,
  bandwidthAmount: number,
  duration: number,
  cost: number
): Promise<RentalOrder> {
  // TODO: 实现 TronXEnergy 订单创建API
  const orderId = `txe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  return {
    orderId,
    provider: 'tronxenergy',
    address,
    energyAmount,
    bandwidthAmount,
    duration,
    cost,
    status: 'pending',
    createdAt: Date.now(),
  }
}

async function checkTronXEnergyOrderStatus(orderId: string): Promise<RentalOrder> {
  // TODO: 实现 TronXEnergy 订单状态查询API
  throw new Error('TronXEnergy 订单状态查询API未实现')
}

// 注意：支付流程现在由后端处理，前端只需要调用创建订单 API
// 订单创建后，用户需要按照服务商的要求进行支付（通常是通过 TRX 转账）
