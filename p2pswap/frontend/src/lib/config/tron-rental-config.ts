/**
 * TRON Energy/Bandwidth 租赁服务配置
 * 
 * 使用说明：
 * 1. 根据实际使用的服务商，配置API密钥和支付地址
 * 2. 在生产环境中，这些配置应该从环境变量中读取
 * 3. 每个服务商的API文档：
 *    - GasStation: https://www.gasstation.ai/en-US
 *    - TronFuel: https://tronfuel.dev
 *    - TronXEnergy: https://tronxenergy.com
 */

export interface RentalProviderConfig {
  name: string
  apiKey?: string // API密钥（如果需要）
  paymentAddress: string // 服务商收款地址
  apiBaseUrl?: string // API基础URL
  enabled: boolean // 是否启用
}

/**
 * 租赁服务商配置
 * TODO: 从环境变量或配置文件中读取实际值
 */
export const RENTAL_PROVIDER_CONFIG: Record<string, RentalProviderConfig> = {
  gasstation: {
    name: 'GasStation',
    apiKey: process.env.NEXT_PUBLIC_GASSTATION_API_KEY,
    paymentAddress: process.env.NEXT_PUBLIC_GASSTATION_PAYMENT_ADDRESS || '',
    apiBaseUrl: 'https://api.gasstation.ai',
    enabled: true,
  },
  tronfuel: {
    name: 'TronFuel',
    // apiKey: process.env.NEXT_PUBLIC_TRONFUEL_API_KEY,
    paymentAddress: process.env.NEXT_PUBLIC_TRONFUEL_PAYMENT_ADDRESS || '',
    apiBaseUrl: 'https://api.tronfuel.dev',
    enabled: true,
  },
  tronxenergy: {
    name: 'TronXEnergy',
    // apiKey: process.env.NEXT_PUBLIC_TRONXENERGY_API_KEY,
    paymentAddress: process.env.NEXT_PUBLIC_TRONXENERGY_PAYMENT_ADDRESS || '',
    apiBaseUrl: 'https://api.tronxenergy.com',
    enabled: true,
  },
}

/**
 * 获取服务商配置
 */
export function getProviderConfig(provider: string): RentalProviderConfig | null {
  return RENTAL_PROVIDER_CONFIG[provider] || null
}

/**
 * 检查服务商是否启用
 */
export function isProviderEnabled(provider: string): boolean {
  const config = getProviderConfig(provider)
  return config?.enabled === true
}
