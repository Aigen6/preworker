"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/hooks/use-translation"
import { useWithdrawRequestObserver } from "@/lib/hooks/use-withdraw-request"
import { useAllocationsDataObserver } from "@/lib/hooks/use-allocations-data"
import SvgIcon from "@/components/ui/SvgIcon"

interface ProcessingSheetProps {
  onClose?: () => void
  transactionHash?: string
  withdrawalId?: string
}

function ProcessingSheetComponent({ onClose, transactionHash, withdrawalId }: ProcessingSheetProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { getById } = useWithdrawRequestObserver()
  const { fetchList: fetchAllocations } = useAllocationsDataObserver()
  
  // 直接使用 getById() 获取 WithdrawRequest，通过 observer 自动响应 Store 变化
  // 不需要 useState，因为 observer 会自动在 Store 更新时重新渲染
  const withdrawal = withdrawalId ? getById(withdrawalId) : null
  
  // 自动关闭倒计时（15秒）
  const [countdown, setCountdown] = useState(15)
  const [isAutoClosing, setIsAutoClosing] = useState(true)
  const shouldCloseRef = useRef(false)
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 处理关闭：关闭弹窗并跳转到 Records 页面
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose()
    }
    // 跳转到 Records 页面，新创建的记录会显示在最上面（按 created_at 倒序）
    // 使用 replace 而不是 push，避免在浏览器历史中留下 ProcessingSheet 页面
    router.replace('/records')
  }, [onClose, router])
  
  // 如果用户手动关闭或点击按钮，取消自动关闭
  const handleManualClose = useCallback(() => {
    setIsAutoClosing(false)
    handleClose()
  }, [handleClose])
  
  // 自动关闭倒计时 - 从弹窗打开时开始，15秒后自动关闭
  useEffect(() => {
    if (!isAutoClosing) return
    
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // 倒计时结束，标记需要关闭
          shouldCloseRef.current = true
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [isAutoClosing])
  
  // 当倒计时结束时，在下一个渲染周期执行关闭操作
  useEffect(() => {
    if (shouldCloseRef.current && countdown === 0) {
      shouldCloseRef.current = false
      // 使用 setTimeout 确保在渲染周期外执行
      setTimeout(() => {
        handleClose()
      }, 0)
    }
  }, [countdown, handleClose])
  
  // 如果状态已完成或失败，重新开始15秒倒计时（让用户有时间查看结果）
  useEffect(() => {
    if (withdrawal && (
      withdrawal.frontendStatus === 'completed' || 
      withdrawal.frontendStatus === 'failed' || 
      withdrawal.frontendStatus === 'failed_permanent'
    )) {
      // 状态已完成或失败时，重新开始15秒倒计时（给用户时间查看结果）
      setCountdown(15)
      setIsAutoClosing(true)
    }
  }, [withdrawal])
  
  // 当 withdrawal 状态变为 pending 或更高状态时，刷新 allocations 数据
  useEffect(() => {
    if (!withdrawal) return
    
    const status = withdrawal.frontendStatus || withdrawal.status
    // 当状态变为 pending 或更高时，说明 allocations 状态已经从 idle 变为 pending
    if (status === 'pending' || status === 'processing' || status === 'proving' || status === 'submitting') {
      // 刷新 allocations 数据，同步后端状态
      fetchAllocations({ status: 'idle' }).catch((error) => {
        console.error('刷新 allocations 失败:', error)
      })
    }
  }, [withdrawal, fetchAllocations])
  const [progress, setProgress] = useState(0)
  
  // 获取交易哈希（从 withdrawal 或 props）
  const txHash = withdrawal?.executeTxHash || withdrawal?.payoutTxHash || transactionHash || ""

  // 获取当前状态
  const currentStatus = withdrawal ? (withdrawal.frontendStatus || withdrawal.status) : null
  const isCompleted = currentStatus === 'completed'
  
  // 模拟进度条动画 - 每秒增加10%，最多到90%
  useEffect(() => {
    // 清理之前的定时器
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }

    // 如果已完成，直接设置为100%
    if (isCompleted) {
      setProgress(100)
      return
    }

    // 重置进度条并启动定时器
    setProgress(0)

    // 否则，每秒增加10%，直到90%停止
    progressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        // 每秒增加10%，最多到90%
        if (prev >= 90) {
          // 达到90%后停止
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current)
            progressTimerRef.current = null
          }
          return 90
        }
        return prev + 10
      })
    }, 1000) as unknown as NodeJS.Timeout // 每秒执行一次

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [isCompleted])

  const handleViewTransaction = () => {
    if (!txHash) return
    
    // 根据链ID构建区块链浏览器链接
    const chainId = withdrawal?.beneficiary?.chainId || withdrawal?.owner?.chainId
    let explorerUrl = ''
    
    if (chainId === 1) {
      explorerUrl = `https://etherscan.io/tx/${txHash}`
    } else if (chainId === 56) {
      explorerUrl = `https://bscscan.com/tx/${txHash}`
    } else if (chainId === 714) {
      explorerUrl = `https://tronscan.org/#/transaction/${txHash}`
    }
    
    if (explorerUrl) {
      window.open(explorerUrl, '_blank')
    } else {
    console.log("Viewing transaction:", txHash)
    }
  }

  // 获取状态文本
  const getStatusText = () => {
    if (!withdrawal) return t('processing.processingExtract')
    
    const status = withdrawal.frontendStatus || withdrawal.status
    switch (status) {
      case 'proving':
        return t('processing.generatingProof')
      case 'submitting':
        return t('processing.submittingToChain')
      case 'pending':
        return t('processing.waitingConfirmation')
      case 'processing':
        return t('processing.executingTransfer')
      case 'completed':
        return t('processing.extractCompleted')
      case 'failed':
      case 'failed_permanent':
        return t('processing.extractFailed')
      default:
        return t('processing.processingExtract')
    }
  }

  return (
    <div className="bg-base text-white flex flex-col items-center p-6 relative">
      {/* 关闭按钮 - 右上角 */}
      <button
        onClick={handleManualClose}
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-[20%] bg-black-2 hover:bg-black-3 transition-colors z-10"
        title={t('processing.closeAndViewRecords')}
      >
        <SvgIcon
          src="/icons/common-close.svg"
          className="w-5 h-5 text-white"
        />
      </button>
      
      {/* 自动关闭倒计时提示 - 右上角，关闭按钮下方 */}
      {isAutoClosing && (
        <div className="absolute top-20 right-6 px-3 py-1.5 bg-black-2/80 backdrop-blur-sm rounded-[20%] text-xs text-white z-10">
          <span className="text-black-9">{t('processing.autoClose')}：</span>
          <span className="font-medium text-primary">{countdown}{t('processing.seconds')}</span>
        </div>
      )}
      
      {/* 主要加载动画区域 */}
      <div className="flex-1 flex flex-col items-center mt-16">
        <SvgIcon src="/icons/loading.svg" />

        {/* 进度条 */}
        <div className="w-64 mb-8 mt-6">
          <div className="w-full h-2 bg-surface rounded-[20%] overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-100 ease-out rounded-[20%]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 状态文本 */}
        <h2 className="text-lg font-medium text-black-9 mb-8">
          {getStatusText()}
        </h2>
      </div>

      {/* 底部信息区域 */}
      <div className="w-full max-w-md space-y-6">
        {/* 交易哈希 */}
        {txHash && (
        <div>
          <h3 className="text-sm text-black-9 mb-3">{t('processing.transactionHash')}：</h3>
          <div className="p-4 bg-black-2 rounded-xl border border-black-3">
            <p className="text-sm text-white font-mono break-all leading-relaxed">
              {txHash}
            </p>
          </div>
        </div>
        )}

        {/* 查看交易状态按钮 */}
        {txHash && (
        <Button
          onClick={handleViewTransaction}
          className="w-full bg-primary text-black py-4 rounded-xl font-medium text-base hover:bg-primary-dark"
        >
          {t('processing.viewTransactionStatus')}
        </Button>
        )}
        
        {/* 如果已完成，显示完成按钮 */}
        {withdrawal && (withdrawal.frontendStatus === 'completed' || withdrawal.status === 'completed') && (
          <Button
            onClick={handleManualClose}
            className="w-full bg-primary text-black py-4 rounded-xl font-medium text-base hover:bg-primary-dark"
          >
            {t('processing.completeAndViewRecords')} {isAutoClosing && `(${countdown}${t('processing.seconds')})`}
          </Button>
        )}
        
        {/* 如果失败，也显示关闭按钮 */}
        {withdrawal && (withdrawal.frontendStatus === 'failed' || withdrawal.frontendStatus === 'failed_permanent') && (
          <Button
            onClick={handleManualClose}
            className="w-full bg-primary text-black py-4 rounded-xl font-medium text-base hover:bg-primary-dark"
          >
            {t('processing.viewRecords')} {isAutoClosing && `(${countdown}${t('processing.seconds')})`}
          </Button>
        )}
      </div>
    </div>
  )
}

// 使用 observer 包装，自动响应 WithdrawalsStore 的变化
// 当 WebSocket 推送更新 Store 时，组件会自动重新渲染
export const ProcessingSheet = observer(ProcessingSheetComponent)
