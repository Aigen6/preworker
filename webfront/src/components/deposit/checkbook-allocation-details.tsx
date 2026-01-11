"use client"

import SvgIcon from "@/components/ui/SvgIcon"
import { useTranslation } from "@/lib/hooks/use-translation"

export interface AllocationDetail {
  id: string
  amount: number
  status: string
  token?: {
    symbol?: string
    decimals?: number
  }
  createdAt?: string
  updatedAt?: string
}

export interface CheckbookAllocationDetailsData {
  localDepositId: string
  totalAmount: number
  allocations: AllocationDetail[]
}

interface CheckbookAllocationDetailsProps {
  data: CheckbookAllocationDetailsData
  onClose?: () => void
}

export default function CheckbookAllocationDetails({
  data,
  onClose,
}: CheckbookAllocationDetailsProps) {
  const { t } = useTranslation()
  const { localDepositId, totalAmount, allocations } = data

  // 获取状态显示文本和颜色
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "idle":
        return { text: t('voucher.available'), color: "text-primary" }
      case "pending":
        return { text: t('voucher.processing'), color: "text-yellow-400" }
      case "used":
        return { text: t('voucher.used'), color: "text-gray-400" }
      default:
        return { text: status, color: "text-gray-400" }
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* 标题和关闭按钮 */}
      <div className="flex items-center justify-between">
        <h2 className="text-black-9">{t('deposit.voucherDetails')}</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-black-3 rounded transition-colors"
            aria-label="关闭"
          >
            <SvgIcon
              src="/icons/common-close.svg"
              className="w-5 h-5 text-black-9"
            />
          </button>
        )}
      </div>

      {/* Deposit ID - 小字显示在标题和总金额之间 */}
      <div className="text-xs text-black-9">
        Deposit ID: <span className="text-white font-mono">#{localDepositId}</span>
      </div>

      {/* 总金额 */}
      <div className="flex justify-between items-center bg-black-2 rounded-lg p-4 border border-black-3">
        <span className="text-black-9">{t('voucher.totalAmount')}</span>
        <span className="text-white font-medium">
          {totalAmount.toFixed(3)}USDT
        </span>
      </div>

      {/* 凭证预览 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-white">{t('voucher.voucherPreview')}</span>
          <span className="text-white text-xs px-2 py-0.5 border border-black-3 rounded-[6px]">
            {allocations.length}
          </span>
        </div>

        <div className="space-y-3">
          {allocations.length === 0 ? (
            <div className="text-center text-black-9 py-8">{t('voucher.noVouchers')}</div>
          ) : (
            allocations.map((alloc, index) => {
              const statusDisplay = getStatusDisplay(alloc.status)
              return (
                <div
                  key={alloc.id}
                  className="border rounded-lg p-4 h-12 flex items-center justify-between border-black-3 bg-transparent"
                >
                  <div className="flex items-center gap-3">
                    <SvgIcon
                      src="/icons/voucher.svg"
                      className="w-4 h-4 transition-all text-black-9"
                    />
                    <span className="text-white">{t('voucher.voucher')} {index + 1}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${statusDisplay.color} border ${
                        alloc.status === "idle"
                          ? "border-primary/30"
                          : "border-gray-500/30"
                      }`}
                    >
                      {statusDisplay.text}
                    </span>
                  </div>
                  <span className="text-white font-medium">
                    {alloc.amount.toFixed(4)}USDT
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

