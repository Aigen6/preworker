'use client'

import { useState, useEffect } from 'react'
import SvgIcon from '@/components/ui/SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useTronResources } from '@/lib/hooks/use-tron-resources'
import { useTronEnergyRental, type RentalProvider } from '@/lib/hooks/use-tron-energy-rental'
import { useToast } from '@/components/providers/toast-provider'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useBottomSheet } from '@/hooks/use-bottom-sheet'
import { TronSubleasingOption } from './tron-subleasing-option'
import { 
  type TronOperationType, 
  getTronEnergyRequirement,
  getMaxTronEnergyRequirement 
} from '@/lib/config/tron-energy-requirements'

interface TronGasRentalOptionProps {
  onRentClick?: () => void
  requiredEnergy?: number // 交易所需的 Energy（如果提供，将覆盖 operationType）
  requiredBandwidth?: number // 交易所需的 Bandwidth（如果提供，将覆盖 operationType）
  operationType?: TronOperationType | TronOperationType[] // 操作类型（用于自动获取能量需求）
}

/**
 * TRON Gas 租赁选项组件
 * 当用户连接 TRON 网络时，显示 Energy/Bandwidth 余额和租赁选项
 */
export function TronGasRentalOption({
  onRentClick,
  requiredEnergy: propRequiredEnergy,
  requiredBandwidth: propRequiredBandwidth,
  operationType,
}: TronGasRentalOptionProps) {
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
  
  // 先获取 hooks，确保在 useEffect 之前定义
  const { t } = useTranslation()
  const { showSuccess, showError, showWarning } = useToast()
  const { resources, loading, error, hasEnoughEnergy, hasEnoughBandwidth, isTronNetwork, refresh: refreshResources } = useTronResources()
  
  // 调试：打印当前状态和能量需求
  useEffect(() => {
    console.log('=== TRON Gas 费用配置 ===')
    console.log('操作类型 (operationType):', operationType)
    console.log('传入的 Energy (propRequiredEnergy):', propRequiredEnergy)
    console.log('传入的 Bandwidth (propRequiredBandwidth):', propRequiredBandwidth)
    console.log('最终使用的 Energy (requiredEnergy):', requiredEnergy)
    console.log('最终使用的 Bandwidth (requiredBandwidth):', requiredBandwidth)
    console.log('当前资源状态:', {
      energy: resources?.energy || 0,
      bandwidth: resources?.bandwidth || 0,
    })
    console.log('需要的 Energy (差价):', Math.max(0, requiredEnergy - (resources?.energy || 0)))
    console.log('需要的 Bandwidth (差价):', Math.max(0, requiredBandwidth - (resources?.bandwidth || 0)))
    console.log('========================')
  }, [operationType, requiredEnergy, requiredBandwidth, propRequiredEnergy, propRequiredBandwidth, resources])
  const {
    loading: rentalLoading,
    error: rentalError,
    currentOrder,
    estimateRental,
    createRentalOrder,
    getPaymentInfo,
    payRentalOrder,
    checkOrderStatus,
  } = useTronEnergyRental()
  
  const rentalSheet = useBottomSheet()
  const [selectedProvider, setSelectedProvider] = useState<RentalProvider>('catfee')
  const [estimate, setEstimate] = useState<{ provider: RentalProvider; cost: number; savings: number } | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)

  // 如果不在 TRON 网络，不显示
  if (!isTronNetwork) {
    return null
  }

  const energySufficient = hasEnoughEnergy(requiredEnergy)
  const bandwidthSufficient = hasEnoughBandwidth(requiredBandwidth)
  const resourcesSufficient = energySufficient && bandwidthSufficient

  // 计算需要租赁的资源量
  const neededEnergy = Math.max(0, requiredEnergy - (resources?.energy || 0))
  const neededBandwidth = Math.max(0, requiredBandwidth - (resources?.bandwidth || 0))

  // 处理租赁按钮点击
  const handleRentClick = async () => {
    if (onRentClick) {
      onRentClick()
      return
    }

    // 打开租赁弹窗
    rentalSheet.open({})
    
      // 自动估算费用
      try {
        setIsEstimating(true)
        const estimateResult = await estimateRental(neededEnergy, neededBandwidth, selectedProvider, '1h')
      if (estimateResult) {
        setEstimate({
          provider: selectedProvider,
          cost: estimateResult.totalCost,
          savings: estimateResult.savings,
        })
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : '估算失败')
    } finally {
      setIsEstimating(false)
    }
  }

  // 处理确认租赁
  const handleConfirmRental = async () => {
    try {
      if (!estimate) {
        showWarning('请先估算费用')
        return
      }

      showSuccess('正在创建租赁订单...')
      
      // 创建订单
      const order = await createRentalOrder(
        neededEnergy,
        neededBandwidth,
        selectedProvider,
        '1h' // 默认租赁1小时
      )

      showSuccess('订单已创建，准备支付...')

      // 直接使用TRX支付
      // 如果订单中已有支付信息，直接支付；否则先获取支付信息
      let orderToPay: typeof order = order
      let isApiMode = false
      
      if (!order.paymentAddress || (!order.paymentAmount && !order.paymentAmountSun)) {
        showSuccess('正在获取支付信息...')
        const paymentInfo = await getPaymentInfo(order)
        
        // 检查是否是 API 模式
        if ((paymentInfo as any)?.isApiMode || (paymentInfo as any)?.requiresPayment === false) {
          isApiMode = true
          showSuccess('订单已创建，费用已从账户余额扣除，无需支付')
          
          // 关闭弹窗
          rentalSheet.close()
          
          // 等待一段时间后刷新资源状态
          setTimeout(() => {
            refreshResources()
          }, 5000)
          return
        }
        
        orderToPay = {
          ...order,
          paymentAddress: paymentInfo.paymentAddress,
          paymentAmount: paymentInfo.paymentAmount,
          paymentAmountSun: paymentInfo.paymentAmountSun,
          paymentMemo: paymentInfo.paymentMemo,
        }
      }

      // 显示支付信息
      const paymentAmount = orderToPay.paymentAmount || (orderToPay.paymentAmountSun ? orderToPay.paymentAmountSun / 1_000_000 : 0)
      showSuccess(`请在钱包中确认TRX转账: ${paymentAmount.toFixed(6)} TRX`)
      
      // 使用TronWeb直接发送TRX转账
      const txHash = await payRentalOrder(orderToPay)
      
      // 如果是 API 模式（费用已从账户扣除），显示特殊提示
      if (txHash === 'API_MODE_NO_PAYMENT_REQUIRED') {
        showSuccess('订单已创建，费用已从账户余额扣除，无需支付')
        
        // 关闭弹窗
        rentalSheet.close()
        
        // 等待一段时间后刷新资源状态
        setTimeout(() => {
          refreshResources()
        }, 5000)
        return
      }
      
      showSuccess('支付成功，等待资源委托完成...')
      
      // 关闭弹窗
      rentalSheet.close()
      
      // 等待一段时间后刷新资源状态
      setTimeout(() => {
        refreshResources()
      }, 5000)
    } catch (err) {
      showError(err instanceof Error ? err.message : '租赁失败')
    }
  }

  return (
    <div className="w-full bg-black-1 border border-black-3 rounded-xl p-4 space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SvgIcon
            src="/icons/network-tron.svg"
            className="w-5 h-5"
            monochrome={false}
          />
          <h3 className="text-sm font-medium text-main">
            {t('deposit.tronGasRental.title')}
          </h3>
        </div>
        {resourcesSufficient ? (
          <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-lg">
            {t('deposit.tronGasRental.sufficient')}
          </span>
        ) : (
          <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg">
            {t('deposit.tronGasRental.insufficient')}
          </span>
        )}
      </div>

      {/* 资源状态 */}
      {loading ? (
        <div className="text-sm text-black-9 text-center py-2">
          {t('common.loading')}...
        </div>
      ) : error ? (
        <div className="text-sm text-red-400 text-center py-2">
          {error}
        </div>
      ) : resources ? (
        <div className="space-y-2">
          {/* Energy 状态 */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-black-9">
              {t('deposit.tronGasRental.energy')}
            </span>
            <div className="flex items-center gap-2">
              <span className={energySufficient ? 'text-green-400' : 'text-yellow-400'}>
                {resources.energy.toLocaleString()} / {requiredEnergy.toLocaleString()}
              </span>
              {!energySufficient && (
                <span className="text-xs text-black-9">
                  ({t('deposit.tronGasRental.needMore')})
                </span>
              )}
            </div>
          </div>

          {/* Bandwidth 状态 */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-black-9">
              {t('deposit.tronGasRental.bandwidth')}
            </span>
            <div className="flex items-center gap-2">
              <span className={bandwidthSufficient ? 'text-green-400' : 'text-yellow-400'}>
                {resources.bandwidth.toLocaleString()} / {requiredBandwidth.toLocaleString()}
              </span>
              {!bandwidthSufficient && (
                <span className="text-xs text-black-9">
                  ({t('deposit.tronGasRental.needMore')})
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 能量转租服务（优先显示） */}
      {!resourcesSufficient && (
        <TronSubleasingOption
          requiredEnergy={requiredEnergy}
          requiredBandwidth={requiredBandwidth}
        />
      )}

      {/* 原租赁按钮（作为备选） */}
      {false && !resourcesSufficient && (
        <button
          onClick={handleRentClick}
          disabled={rentalLoading || isEstimating}
          className="w-full h-10 bg-primary text-on-primary rounded-lg font-medium text-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {rentalLoading || isEstimating ? (
            <>
              <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
              {t('deposit.tronGasRental.processing')}
            </>
          ) : (
            <>
              <SvgIcon
                src="/icons/refresh.svg"
                className="w-4 h-4"
                monochrome
              />
              {t('deposit.tronGasRental.rentButton')}
            </>
          )}
        </button>
      )}

      {/* 租赁弹窗 */}
      <BottomSheet
        isOpen={rentalSheet.isOpen}
        onClose={() => {
          rentalSheet.close()
          setEstimate(null)
        }}
        height="auto"
        showCloseButton={false}
        showCloseButtonInFooter={false}
        className="bg-black-2"
      >
        <div className="p-4 space-y-4">
          {/* 标题栏：标题和关闭按钮在同一行 */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-main">
              {t('deposit.tronGasRental.rentalTitle')}
            </h3>
            <button
              onClick={() => {
                rentalSheet.close()
                setEstimate(null)
              }}
              className="px-3 py-1 text-sm text-black-9 hover:text-white hover:bg-black-3 rounded-md transition-colors"
            >
              {t('common.close') || '关闭'}
            </button>
          </div>

          {/* 资源需求显示 */}
          <div className="p-4 bg-black-3 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-black-9">{t('deposit.tronGasRental.energy')}</span>
              <span className="text-white">{neededEnergy.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-black-9">{t('deposit.tronGasRental.bandwidth')}</span>
              <span className="text-white">{neededBandwidth.toLocaleString()}</span>
            </div>
          </div>

          {/* 服务商选择 */}
          <div>
            <label className="block text-sm text-black-9 mb-2">
              {t('deposit.tronGasRental.selectProvider')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['catfee', 'gasstation', 'tronfuel', 'tronxenergy'] as RentalProvider[]).map((provider) => (
                <button
                  key={provider}
                  onClick={() => {
                    setSelectedProvider(provider)
                    setEstimate(null)
                  }}
                  className={`p-3 rounded-lg border-2 transition-colors ${
                    selectedProvider === provider
                      ? 'border-primary bg-primary/10'
                      : 'border-black-3 bg-black-1 hover:border-black-4'
                  }`}
                >
                  <div className="text-xs font-medium text-white capitalize">
                    {provider === 'catfee' ? 'CatFee' : 
                     provider === 'gasstation' ? 'GasStation' : 
                     provider === 'tronfuel' ? 'TronFuel' : 
                     'TronXEnergy'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 费用估算 */}
          {isEstimating ? (
            <div className="text-center py-4">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm text-black-9">{t('deposit.tronGasRental.estimating')}</p>
            </div>
          ) : estimate ? (
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-black-9">{t('deposit.tronGasRental.estimatedCost')}</span>
                <span className="text-primary font-medium">{estimate.cost.toFixed(6)} TRX</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black-9">{t('deposit.tronGasRental.estimatedSavings')}</span>
                <span className="text-green-400 font-medium">~{estimate.savings.toFixed(6)} TRX</span>
              </div>
            </div>
          ) : (
            <button
              onClick={async () => {
                try {
                  setIsEstimating(true)
                  const estimateResult = await estimateRental(neededEnergy, neededBandwidth, selectedProvider, '1h')
                  if (estimateResult) {
                    setEstimate({
                      provider: selectedProvider,
                      cost: estimateResult.totalCost,
                      savings: estimateResult.savings,
                    })
                  }
                } catch (err) {
                  showError(err instanceof Error ? err.message : '估算失败')
                } finally {
                  setIsEstimating(false)
                }
              }}
              disabled={isEstimating}
              className="w-full h-10 bg-black-3 text-white rounded-lg font-medium text-sm hover:bg-black-4 transition-colors disabled:opacity-50"
            >
              {t('deposit.tronGasRental.estimateCost')}
            </button>
          )}

          {/* 错误提示 */}
          {rentalError && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{rentalError}</p>
            </div>
          )}

          {/* 支付信息显示 */}
          {estimate && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-black-9">{t('deposit.tronGasRental.paymentAmount')}</span>
                <span className="text-primary font-medium">{estimate.cost.toFixed(6)} TRX</span>
              </div>
              <p className="text-xs text-black-9">
                {t('deposit.tronGasRental.paymentNote')}
              </p>
            </div>
          )}

          {/* 确认按钮 */}
          {estimate && (
            <button
              onClick={handleConfirmRental}
              disabled={rentalLoading}
              className="w-full h-12 bg-primary text-on-primary rounded-lg font-medium text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {rentalLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
                  {t('deposit.tronGasRental.processing')}
                </>
              ) : (
                <>
                  <SvgIcon
                    src="/icons/network-tron.svg"
                    className="w-4 h-4"
                    monochrome={false}
                  />
                  {t('deposit.tronGasRental.payWithTRX')}
                </>
              )}
            </button>
          )}
        </div>
      </BottomSheet>

    </div>
  )
}
