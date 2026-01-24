'use client'

import { useWalletConnection } from '@/lib/hooks/use-wallet-connection'
import { useTronResources } from '@/lib/hooks/use-tron-resources'
import { 
  type TronOperationType, 
  getTronEnergyRequirement,
  getMaxTronEnergyRequirement 
} from '@/lib/config/tron-energy-requirements'

interface TronSubleasingOptionProps {
  requiredEnergy?: number // 交易所需的 Energy（如果提供，将覆盖 operationType）
  requiredBandwidth?: number // 交易所需的 Bandwidth（如果提供，将覆盖 operationType）
  operationType?: TronOperationType | TronOperationType[] // 操作类型（用于自动获取能量需求）
}

/**
 * CatFee 能量转租服务组件
 * 用户向指定地址转账，CatFee 自动分配能量
 */
export function TronSubleasingOption({
  requiredEnergy: propRequiredEnergy,
  requiredBandwidth: propRequiredBandwidth,
  operationType,
}: TronSubleasingOptionProps) {
  // 根据 operationType 自动获取能量需求，或使用传入的值
  const getEnergyRequirement = () => {
    // 如果明确提供了能量值，优先使用
    if (propRequiredEnergy !== undefined && propRequiredBandwidth !== undefined) {
      return {
        energy: propRequiredEnergy,
        bandwidth: propRequiredBandwidth,
      }
    }

    // 如果提供了 operationType，使用配置的值
    if (operationType) {
      if (Array.isArray(operationType)) {
        return getMaxTronEnergyRequirement(operationType)
      } else {
        return getTronEnergyRequirement(operationType)
      }
    }

    // 默认值
    return getTronEnergyRequirement('default')
  }

  const { energy: requiredEnergy, bandwidth: requiredBandwidth } = getEnergyRequirement()
  const { address } = useWalletConnection()
  const { resources } = useTronResources()
  
  // CatFee 转租服务配置
  const RECEIVING_ADDRESS = 'TMb2g37APP2JTTkvDeE6tnXV6CLzaVrWXd' // 收款地址
  const BASE_PRICE = 2.5 // 基础价格（TRX）：2.5 TRX = 65,000 能量
  const BASE_ENERGY = 65000 // 基础能量
  
  // 计算实际缺少的 Energy（差价）
  const currentEnergy = resources?.energy || 0
  const neededEnergy = Math.max(0, requiredEnergy - currentEnergy)
  
  // 根据实际缺少的 Energy 计算价格（向上取整到 2.5 的倍数）
  const calculatePrice = (energy: number): number => {
    if (energy <= 0) {
      return 0 // 如果不需要 Energy，价格为 0
    }
    const multiplier = Math.ceil(energy / BASE_ENERGY)
    return multiplier * BASE_PRICE
  }
  
  const price = calculatePrice(neededEnergy)

  // 直接调用钱包转账
  const handleOpenWallet = async () => {
    // 优先使用 TronWeb（如果可用）
    if (typeof window !== 'undefined' && (window as any).tronWeb) {
      await handleSendWithTronWeb()
      return
    }

    // 如果 TronLink 可用，使用 TronLink
    if (typeof window !== 'undefined' && (window as any).tronLink) {
      try {
        const tronLink = (window as any).tronLink
        const tronWeb = tronLink.tronWeb
        
        if (tronWeb) {
          await handleSendWithTronWeb()
          return
        }
      } catch (err) {
        // 静默失败
      }
    }

    // 否则，尝试打开 TronLink 应用
    const tronLinkUrl = `tronlink://send?address=${RECEIVING_ADDRESS}&amount=${price}`
    window.location.href = tronLinkUrl
  }

  // 使用 TronWeb 发送转账
  const handleSendWithTronWeb = async () => {
    let tronWeb: any = null

    // 优先使用全局 TronWeb
    if (typeof window !== 'undefined' && (window as any).tronWeb) {
      tronWeb = (window as any).tronWeb
    }
    // 其次使用 TronLink 的 TronWeb
    else if (typeof window !== 'undefined' && (window as any).tronLink?.tronWeb) {
      tronWeb = (window as any).tronLink.tronWeb
    }

    if (!tronWeb || !address) {
      return
    }

    try {
      const amountSun = price * 1_000_000 // 转换为 SUN

      // 构建转账交易
      const transaction = await tronWeb.transactionBuilder.sendTrx(
        RECEIVING_ADDRESS,
        amountSun,
        address
      )

      // 签名并广播（这会直接弹出钱包确认窗口）
      const signedTransaction = await tronWeb.trx.sign(transaction)
      await tronWeb.trx.broadcast(signedTransaction)
    } catch (err: any) {
      // 静默失败
    }
  }

  if (price <= 0) {
    return null
  }

  return (
    <div className="w-full">
      <button
        onClick={handleOpenWallet}
        className="w-full group relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 hover:border-primary/50 hover:bg-primary/15 transition-all duration-300"
      >
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        
        <div className="relative flex items-center justify-between">
          {/* 左侧：图标和文字 */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <svg 
                className="w-5 h-5 text-primary transition-transform group-hover:scale-110" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-white group-hover:text-primary transition-colors">
                启动钱包转账
              </span>
              <span className="text-xs text-black-9 mt-0.5">
                获得 {neededEnergy.toLocaleString()} Energy
              </span>
            </div>
          </div>
          
          {/* 右侧：价格标签 */}
          <div className="flex-shrink-0">
            <div className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-semibold text-sm shadow-lg shadow-primary/30 group-hover:shadow-primary/50 transition-all group-hover:scale-105">
              {price} TRX
            </div>
          </div>
        </div>
      </button>
    </div>
  )
}
