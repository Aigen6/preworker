'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { TransactionProcessing } from './transaction-processing'
import { useQuoteRoute } from '@/lib/hooks/use-quote-route'
import { useGasEstimate } from '@/lib/hooks/use-gas-estimate'
import SvgIcon from '@/components/ui/SvgIcon'
import { AddressDisplay } from '@/components/ui/address-display'
import { sumReadableAmounts, formatFromWei } from '@/lib/utils/amount-calculator'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ExtractConfirmSheetProps {
  onClose?: () => void
  onConfirm?: () => void
  onBack?: () => void
  selectedAllocations?: Array<{ id: string; amount: number }>
  recipientAddress?: string
  targetChain?: number
  targetToken?: string
  // 用于刷新数据的参数
  quoteParams?: {
    ownerData: any
    depositToken: string
    intent: any
    amount: string
    includeHook?: boolean
    totalAmount?: number // 可读格式的总数量
    voucherCount?: number // 凭证数量
  }
  // BottomSheet 是否打开
  isOpen?: boolean
}

// 将 Wei 格式（18位小数）转换为可读格式
// 使用 formatFromWei 确保精度，避免使用 Number 除法导致的精度丢失
function weiToReadable(weiValue: string | number, decimals: number = 18): number {
  const weiStr = typeof weiValue === 'string' ? weiValue : weiValue.toString()
  // 如果是空字符串或无效值，返回 0
  if (!weiStr || weiStr === '0') {
    return 0
  }
  // 使用 formatFromWei 进行精确转换（使用 ethers.js 的 formatUnits，内部使用 BigInt）
  try {
    const weiBigInt = BigInt(weiStr.split('.')[0]) // 去掉小数部分（如果有）
    const readableStr = formatFromWei(weiBigInt, decimals)
    return parseFloat(readableStr)
  } catch (error) {
    console.error('Failed to convert wei to readable:', error)
    return 0
  }
}

// 格式化金额，最多显示6位小数，去掉末尾的0
function formatAmount(value: number): string {
  if (isNaN(value) || !isFinite(value)) {
    return '0'
  }
  // 使用 toFixed(6) 然后去掉末尾的0
  return value.toFixed(6).replace(/\.?0+$/, '')
}

/**
 * 格式化协议手续费百分比
 * 如果是0，显示 "0%"，否则最多显示两位小数
 */
function formatProtocolFeeRate(feeRate: number): string {
  const percentage = feeRate * 100
  if (percentage === 0) {
    return '0%'
  }
  return `${percentage.toFixed(2)}%`
}

export function ExtractConfirmSheet({
  onClose,
  onConfirm,
  onBack,
  selectedAllocations = [],
  recipientAddress = '',
  targetChain,
  targetToken,
  quoteParams,
  isOpen = false,
}: ExtractConfirmSheetProps) {
  const { t } = useTranslation()
  const [isProcessing, setIsProcessing] = useState(false)
  const { quoteResult, getRouteAndFees, loading: quoteLoading } = useQuoteRoute()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshCountdown, setRefreshCountdown] = useState(15)
  const isRefreshingRef = useRef(false)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 获取目标链 ID
  const targetChainId = quoteParams?.intent?.beneficiary?.chainId || targetChain
  // 使用前端实时获取的 Gas 费用
  const { gasEstimate: realTimeGasEstimate, refresh: refreshGasEstimate } = useGasEstimate(
    targetChainId ? parseInt(String(targetChainId)) : undefined,
    '21000'
  )

  // 刷新数据 - 仅调用 API 获取最新路由和费用，不刷新整个页面
  const refreshData = useCallback(async () => {
    if (!quoteParams) {
      console.log('refreshData: quoteParams 为空，跳过刷新')
      return
    }
    
    // 验证 intent 中是否有 tokenSymbol
    console.log('refreshData: quoteParams.intent:', JSON.stringify(quoteParams.intent, null, 2))
    if (!quoteParams.intent?.tokenSymbol) {
      console.error('❌ refreshData: intent 中缺少 tokenSymbol!', quoteParams.intent)
      console.error('完整的 quoteParams:', JSON.stringify(quoteParams, null, 2))
    }
    
    console.log('refreshData: 开始刷新数据（仅调用 API，不刷新页面）', quoteParams)
    isRefreshingRef.current = true
    setIsRefreshing(true)
    try {
      // 只调用 API: api/quote/route-and-fees，更新 quoteResult 状态
      const result = await getRouteAndFees(quoteParams)
      console.log('refreshData: API 调用成功，数据已更新', result)
    } catch (error) {
      console.error('刷新数据失败:', error)
      // 如果错误是因为缺少 tokenSymbol，输出详细信息
      if (error instanceof Error && error.message.includes('tokenSymbol')) {
        console.error('❌ 错误详情: intent 中缺少 tokenSymbol')
        console.error('当前 quoteParams.intent:', JSON.stringify(quoteParams.intent, null, 2))
      }
    } finally {
      isRefreshingRef.current = false
      setIsRefreshing(false)
    }
  }, [quoteParams, getRouteAndFees])

  // 当 BottomSheet 打开时，先读取路由和费用，然后启动倒计时
  // 当 BottomSheet 关闭时，清除倒计时
  useEffect(() => {
    console.log('useEffect: isOpen =', isOpen, 'quoteParams =', quoteParams)
    
    // BottomSheet 关闭时，清除倒计时
    if (!isOpen) {
      console.log('useEffect: BottomSheet 关闭，清除倒计时')
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      // 重置倒计时显示
      setRefreshCountdown(15)
      return
    }

    // 如果没有 quoteParams，不启动倒计时，但也不阻止刷新按钮
    if (!quoteParams) {
      console.log('useEffect: quoteParams 为空，不启动倒计时')
      return
    }

    // BottomSheet 打开时，立即执行一次初始加载
    const initialLoad = async () => {
      console.log('useEffect: 开始初始加载')
      await refreshData()
      setRefreshCountdown(15)
      
      // 清除之前的倒计时（如果有）
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      
      // 开始倒计时
      console.log('useEffect: 启动倒计时')
      countdownIntervalRef.current = setInterval(() => {
        setRefreshCountdown((prev) => {
          // 如果正在刷新，暂停倒计时
          if (isRefreshingRef.current) {
            return prev
          }
          
          if (prev <= 1) {
            // 倒计时到0时触发自动刷新（仅调用 API，不刷新页面）
            console.log('倒计时到0，触发自动刷新 API')
            refreshData().then(() => {
              setRefreshCountdown(15) // 刷新后重置为15秒
            }).catch(() => {
              setRefreshCountdown(15) // 即使失败也重置
            })
            return 15 // 先重置，避免显示0
          }
          return prev - 1
        })
      }, 1000)
    }

    initialLoad()

    return () => {
      // 清理倒计时
      console.log('useEffect: 清理倒计时')
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
  }, [isOpen, quoteParams, refreshData])

  // 手动刷新时，重置倒计时
  const handleManualRefresh = useCallback(async () => {
    console.log('handleManualRefresh: 手动刷新', { isOpen, quoteParams: !!quoteParams })
    if (!quoteParams || !isOpen) {
      console.log('handleManualRefresh: 条件不满足，跳过刷新')
      return
    }
    
    // 重置倒计时
    setRefreshCountdown(15)
    
    // 执行刷新（包括 Gas 费用和路由费用）
    await Promise.all([
      refreshGasEstimate(),
      refreshData(),
    ])
  }, [quoteParams, isOpen, refreshData, refreshGasEstimate])

  // 计算提取数据 - 优先从 quoteParams 中获取，如果没有则从 selectedAllocations 计算
  // 使用精确计算避免浮点数精度问题
  const totalAmount = quoteParams?.totalAmount 
    ? (typeof quoteParams.totalAmount === 'number' ? quoteParams.totalAmount : parseFloat(String(quoteParams.totalAmount)))
    : parseFloat(sumReadableAmounts(selectedAllocations.map(v => v.amount), 18))
  const voucherCount = quoteParams?.voucherCount ?? selectedAllocations.length
  
  // 使用后端提供的协议手续费信息
  const protocolFeeRate = quoteResult?.fees?.summary?.protocolFeeRate
    ? parseFloat(quoteResult.fees.summary.protocolFeeRate)
    : 0
  const protocolFeeAmount = quoteResult?.fees?.summary?.protocolFeeAmount
    ? weiToReadable(quoteResult.fees.summary.protocolFeeAmount)
    : 0
  const protocolFeeUnit = quoteResult?.fees?.summary?.protocolFeeUnit || 'USDT'
  
  // 后端返回的 estimatedReceived 是 Wei 格式，需要转换为可读格式
  const actualAmount = quoteResult?.fees?.summary?.estimatedReceived 
    ? weiToReadable(quoteResult.fees.summary.estimatedReceived)
    : parseFloat(sumReadableAmounts([totalAmount, -protocolFeeAmount], 18))
  
  // 使用后端提供的预估时间
  const estimatedTime = quoteResult?.route?.estimatedTime || '2-5分钟'
  
  // 优先使用前端实时获取的 Gas 费用，否则使用后端提供的值
  const gasEstimate = realTimeGasEstimate?.gasCostInUSD
    ? parseFloat(realTimeGasEstimate.gasCostInUSD)
    : (quoteResult?.fees?.summary?.totalGasCostUSD 
        ? parseFloat(quoteResult.fees.summary.totalGasCostUSD) 
        : 0.05)
  
  // Gas 费用单位：从实时估算中获取原生代币符号，或使用后端提供的单位
  const gasEstimateUnit = realTimeGasEstimate?.gasCostInNative?.split(' ')[1] 
    || quoteResult?.fees?.summary?.gasEstimateUnit 
    || 'USDT'
  
  // Gas 费用显示文本（仅显示 USDT，小于 0.01 显示 <0.01USDT）
  const gasEstimateInUSDT = realTimeGasEstimate?.gasCostInUSD
    ? parseFloat(realTimeGasEstimate.gasCostInUSD)
    : gasEstimate
  
  const gasEstimateDisplay = gasEstimateInUSDT < 0.01
    ? '<0.01USDT'
    : `${formatAmount(gasEstimateInUSDT)}USDT`

  const extractData = {
    voucherCount: voucherCount,
    totalAmount,
    recipientAddress: recipientAddress || '0x...',
    protocolFeeRate,
    protocolFeeAmount: -protocolFeeAmount,
    protocolFeeUnit,
    actualAmount,
    estimatedTime,
    gasEstimate,
    gasEstimateUnit,
  }

  const handleBack = () => {
    onBack?.()
    onClose?.()
  }

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await onConfirm?.()
      // 如果 onConfirm 成功，不关闭弹窗，让 ProcessingSheet 显示
      // 如果失败，onConfirm 会抛出错误，这里捕获
    } catch (error) {
      setIsProcessing(false)
      console.error('确认失败:', error)
    }
  }

  const handleViewTransactionStatus = () => {
    console.log('查看交易状态')
    onClose?.()
  }

  if (isProcessing) {
    return (
      <TransactionProcessing
        processingText={t('processing.processingExtract')}
        transactionHash="0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF"
        buttonText={t('processing.viewTransactionStatus')}
        onButtonClick={handleViewTransactionStatus}
        progress={60}
      />
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between text-black-9 font-medium">
        <h1>{t('extract.confirmInfo')}</h1>
        <span>{t('extract.seamlessDefi')}</span>
      </div>

      {/* 凭证信息 */}
      <div className="mb-6 p-4 bg-black-2 rounded-xl border border-black-3">
        <div className="flex items-center justify-between">
          <span className="text-black-9">{extractData.voucherCount}{t('voucher.voucherCount')}</span>
          <span className="text-lg font-bold text-white">
            {formatAmount(extractData.totalAmount)}USDT
          </span>
        </div>
      </div>

      {/* 受益者地址 */}
      <div className="mb-6">
        <h3 className="text-base font-medium text-main mb-3">
          {t('extract.beneficiaryAddress')}
        </h3>
        <div className="p-4 bg-black-1 rounded-xl">
          <AddressDisplay 
            address={extractData.recipientAddress} 
            chainId={targetChainId ? parseInt(String(targetChainId)) : undefined}
          />
        </div>
      </div>

      {/* 实际到账 */}
      <div className="mb-6">
        <h3 className="text-base font-medium text-main mb-3">{t('extract.actualReceived')}</h3>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">
            {formatAmount(extractData.actualAmount)} USDT
          </p>
        </div>
      </div>

      {/* 协议手续费、预计时间、预估Gas卡片 */}
      <div className="mb-8 p-4 bg-black-2 rounded-xl border border-black-3">
        {/* 协议手续费 + 刷新按钮和倒计时 */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-black-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-black-9">
              {t('extract.protocolFee')}{formatProtocolFeeRate(extractData.protocolFeeRate)}
            </span>
            <span className="text-sm text-white">
              {formatAmount(extractData.protocolFeeAmount)} {extractData.protocolFeeUnit}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {quoteLoading || isRefreshing ? (
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-[20%] animate-spin"></div>
            ) : (
              <button
                onClick={handleManualRefresh}
                className="w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('extract.refresh')}
                disabled={!isOpen || !quoteParams}
              >
                <SvgIcon
                  src="/icons/refresh.svg"
                  className="w-4 h-4 text-primary"
                />
              </button>
            )}
            {isOpen && quoteParams && (
              <span className="text-xs text-black-9">({refreshCountdown}s)</span>
            )}
          </div>
        </div>

        {/* 预计时间和预估Gas */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-black-9">{t('extract.estimatedTime')}{extractData.estimatedTime}</span>
          <span className="text-sm text-black-9">{t('extract.estimatedGas')}：{gasEstimateDisplay}</span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 px-7">
        <button
          onClick={handleBack}
          className="flex-1 h-[50px] bg-transparent border rounded-[14px] border-primary text-primary font-medium text-sm"
        >
          {t('extract.back')}
        </button>
        <button
          onClick={handleConfirm}
          className="flex-1 h-[50px] bg-primary text-black-2 rounded-[14px] font-medium text-sm"
        >
          {t('extract.confirmExtract')}
        </button>
      </div>
    </div>
  )
}
