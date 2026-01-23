/**
 * CatFee.io 服务实现
 * API文档: https://docs.catfee.io
 */

import type { RentalEstimate, RentalOrder } from './types'
import { getProviderConfig } from '@/lib/config/tron-rental-config'
import crypto from 'crypto'

const API_KEY = process.env.CATFEE_API_KEY || ''
const API_SECRET = process.env.CATFEE_API_SECRET || ''
const BASE_URL = 'https://api.catfee.io'

/**
 * 生成时间戳（ISO 8601格式）
 */
function generateTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 构建请求路径（包含查询参数）
 */
function buildRequestPath(path: string, queryParams?: Record<string, string>): string {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return path
  }
  const queryString = new URLSearchParams(queryParams).toString()
  return `${path}?${queryString}`
}

/**
 * 生成签名（HMAC-SHA256）
 */
function generateSignature(timestamp: string, method: string, requestPath: string): string {
  const signString = timestamp + method + requestPath
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(signString)
    .digest('base64')
}

/**
 * 创建API请求
 */
async function createRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): Promise<any> {
  const timestamp = generateTimestamp()
  const requestPath = url.replace(BASE_URL, '')
  const signature = generateSignature(timestamp, method, requestPath)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'CF-ACCESS-KEY': API_KEY,
    'CF-ACCESS-SIGN': signature,
    'CF-ACCESS-TIMESTAMP': timestamp,
  }

  const response = await fetch(url, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.message || `API请求失败: ${response.statusText}`)
  }

  return response.json()
}

/**
 * 估算租赁费用
 */
export async function estimateCatFee(
  energyAmount: number,
  bandwidthAmount: number,
  duration: number = 1
): Promise<RentalEstimate> {
  const config = getProviderConfig('catfee')
  if (!config || !config.enabled) {
    throw new Error('CatFee 服务未启用')
  }

  if (!API_KEY || !API_SECRET) {
    throw new Error('CatFee API 密钥未配置')
  }

  try {
    // CatFee API: GET /v1/order/estimate
    // 参数: quantity (energy数量), receiver (地址), duration (时长: 1h, 24h等)
    const durationStr = duration >= 24 ? '24h' : duration >= 1 ? '1h' : '1h'
    
    const queryParams: Record<string, string> = {
      quantity: energyAmount.toString(),
      duration: durationStr,
    }

    const path = buildRequestPath('/v1/order/estimate', queryParams)
    const url = BASE_URL + path

    const data = await createRequest(url, 'GET')

    // 解析CatFee返回的数据
    const totalCost = parseFloat(data.payment || data.total_cost || '0')
    const energyCost = totalCost // CatFee主要按Energy计费

    // 估算节省（相比直接燃烧TRX）
    const directBurnCost = energyAmount * 0.0001
    const savings = Math.max(0, directBurnCost - totalCost)

    return {
      provider: 'catfee',
      energyCost,
      totalCost,
      estimatedTime: 30, // CatFee通常在30秒内完成
      savings,
    }
  } catch (error) {
    console.error('CatFee 费用估算失败:', error)
    // 如果API调用失败，返回估算值
    return {
      provider: 'catfee',
      energyCost: energyAmount * 0.000008, // CatFee通常价格较低
      totalCost: energyAmount * 0.000008,
      estimatedTime: 30,
      savings: (energyAmount * 0.0001) * 0.6, // 约节省60%
    }
  }
}

/**
 * 创建租赁订单
 */
export async function createCatFeeOrder(
  address: string,
  energyAmount: number,
  bandwidthAmount: number,
  duration: number
): Promise<RentalOrder> {
  const config = getProviderConfig('catfee')
  if (!config || !config.enabled) {
    throw new Error('CatFee 服务未启用')
  }

  if (!API_KEY || !API_SECRET) {
    throw new Error('CatFee API 密钥未配置')
  }

  try {
    // CatFee API: POST /v1/order
    // 参数: quantity, receiver, duration
    const durationStr = duration >= 24 ? '24h' : duration >= 1 ? '1h' : '1h'
    
    const body = {
      quantity: energyAmount.toString(),
      receiver: address,
      duration: durationStr,
    }

    const url = BASE_URL + '/v1/order'
    const data = await createRequest(url, 'POST', body)

    // CatFee返回订单ID
    const orderId = data.order_id || data.trade_no || data.id

    return {
      orderId,
      provider: 'catfee',
      address,
      energyAmount,
      bandwidthAmount,
      duration,
      cost: parseFloat(data.payment || data.total_cost || '0'),
      status: 'pending',
      createdAt: Date.now(),
    }
  } catch (error) {
    console.error('CatFee 订单创建失败:', error)
    throw error
  }
}

/**
 * 查询订单状态
 */
export async function checkCatFeeOrderStatus(orderId: string): Promise<RentalOrder> {
  const config = getProviderConfig('catfee')
  if (!config || !config.enabled) {
    throw new Error('CatFee 服务未启用')
  }

  if (!API_KEY || !API_SECRET) {
    throw new Error('CatFee API 密钥未配置')
  }

  try {
    // CatFee API: GET /v1/order/{orderId}
    const url = `${BASE_URL}/v1/order/${orderId}`
    const data = await createRequest(url, 'GET')

    // 映射状态
    let status: RentalOrderStatus = 'pending'
    if (data.status === 'completed' || data.status === 'success') {
      status = 'completed'
    } else if (data.status === 'failed' || data.status === 'error') {
      status = 'failed'
    } else if (data.status === 'processing') {
      status = 'processing'
    }

    return {
      orderId,
      provider: 'catfee',
      address: data.receiver || '',
      energyAmount: data.quantity,
      duration: data.duration,
      cost: parseFloat(data.payment || data.total_cost || '0'),
      status,
      txHash: data.tx_hash,
      createdAt: data.created_at || Date.now(),
    }
  } catch (error) {
    console.error('CatFee 订单状态查询失败:', error)
    return {
      orderId,
      provider: 'catfee',
      address: '',
      cost: 0,
      status: 'processing',
      createdAt: Date.now(),
    }
  }
}
