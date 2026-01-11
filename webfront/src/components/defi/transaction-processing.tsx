'use client'

import { useRouter } from 'next/navigation'
import SvgIcon from '@/components/ui/SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'

interface TransactionProcessingProps {
  /** 处理状态文本，如 "正在处理存入交易..." */
  processingText: string
  /** 交易哈希 */
  transactionHash?: string
  /** 按钮文本，如 "查看交易状态" */
  buttonText: string
  /** 按钮点击事件 */
  onButtonClick: () => void
  /** 进度百分比，默认60% */
  progress?: number
}

export function TransactionProcessing({
  processingText,
  transactionHash,
  buttonText,
  onButtonClick,
  progress = 60,
}: TransactionProcessingProps) {
  const router = useRouter()
  const { t } = useTranslation()

  const handleClose = () => {
    router.push('/records')
  }

  return (
    <div className="p-4 space-y-4">
      {/* 关闭按钮 - 右上角 */}
      <div className="flex justify-end mb-2">
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity"
          title={t('common.close')}
        >
          <SvgIcon
            src="/icons/common-close.svg"
            className="w-5 h-5 text-black-9"
          />
        </button>
      </div>

      <div className="flex flex-col items-center mb-4">
        {/* 动画图标 */}
        <div className="relative mb-6">
          <SvgIcon src="/icons/loading.svg" className="w-[151px] h-[141px]" />
        </div>

        {/* 进度条 */}
        <div className="w-64 h-2 bg-surface rounded-[20%] mb-4">
          <div
            className="h-full bg-primary rounded-[20%] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-sm text-center text-muted">{processingText}</p>
      </div>

      {/* 交易哈希 */}
      {transactionHash && (
        <div className="border border-line rounded-xl p-4 mb-4 text-muted text-sm">
          <p>{t('processing.transactionHash')}：</p>
          <p className="break-all leading-relaxed">{transactionHash}</p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-center">
        <button
          onClick={onButtonClick}
          className="w-[230px] h-9 bg-primary text-on-primary rounded-[14px] font-bold text-sm"
        >
          {buttonText}
        </button>
      </div>
    </div>
  )
}
