/**
 * 租赁服务通用类型定义
 */

export type RentalProvider = 'gasstation' | 'catfee' | 'tronfuel' | 'tronxenergy'

export type RentalOrderStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface RentalEstimate {
  provider: RentalProvider
  energyCost?: number // Energy 费用（TRX）
  bandwidthCost?: number // Bandwidth 费用（TRX）
  totalCost: number // 总费用（TRX）
  estimatedTime: number // 预计完成时间（秒）
  savings: number // 相比直接燃烧TRX节省的费用（TRX）
}

export interface RentalOrder {
  orderId: string
  provider: RentalProvider
  address: string
  energyAmount?: number
  bandwidthAmount?: number
  duration?: number // 租赁时长（小时）
  cost: number // 费用（TRX）
  status: RentalOrderStatus
  txHash?: string
  createdAt: number
}
