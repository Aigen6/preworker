export type RentalProvider = 'catfee' | 'gasstation' | 'tronfuel' | 'tronxenergy';

export type RentalOrderStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface RentalEstimate {
  provider: RentalProvider;
  energyCost?: number; // TRX
  bandwidthCost?: number; // TRX
  totalCost: number; // TRX
  estimatedTime: number; // seconds
  savings: number; // TRX
}

export interface RentalOrder {
  orderId: string;
  provider: RentalProvider;
  receiverAddress: string;
  energyAmount?: number;
  bandwidthAmount?: number;
  duration?: string;
  cost: number; // TRX
  status: RentalOrderStatus;
  txHash?: string;
  createdAt: number;
  expiresAt?: number;
  // 支付信息（用于直接支付）
  paymentAddress?: string; // 支付地址
  paymentAmount?: number; // 支付金额（TRX）
  paymentAmountSun?: number; // 支付金额（SUN，1 TRX = 1,000,000 SUN）
  paymentMemo?: string; // 支付备注（用于订单关联）
  // 一单一付模式相关
  isDirectPaymentMode?: boolean; // 是否为一单一付模式
  proxyTransactionHash?: string; // 代理交易哈希（一单一付模式）
  proxyTransactionHex?: string; // 代理交易十六进制（一单一付模式）
}
