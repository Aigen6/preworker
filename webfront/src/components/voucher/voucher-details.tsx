"use client"

import SvgIcon from "@/components/ui/SvgIcon"

export interface VoucherData {
  id: string
  amount: number
  status: "已使用" | "未使用"
}

export interface VoucherDetailsData {
  totalAmount: number
  usedCount: number
  unusedCount: number
  vouchers: VoucherData[]
}

interface VoucherDetailsProps {
  data: VoucherDetailsData
  onClose?: () => void
}

export default function VoucherDetails({ data }: VoucherDetailsProps) {
  const { totalAmount, usedCount, unusedCount, vouchers } = data

  return (
    <div className="px-4 pb-4">
      {/* 总金额和使用状态 */}
      <div className="p-4 space-y-4 border border-black-3 rounded-xl mb-6">
        {/* 总金额 */}
        <div className="flex justify-between items-center">
          <span className="text-black-9 text-sm">总金额</span>
          <span className="text-white text-lg font-medium">
            {totalAmount.toFixed(3)} USDT
          </span>
        </div>

        {/* 使用状态 */}
        <div className="flex justify-between items-center">
          <span className="text-black-9 text-sm">凭证状态</span>
          <div className="flex items-center gap-2">
            <span className="text-white text-sm">已使用: {usedCount}</span>
            <div className="w-1 h-1 bg-black-9 rounded-[20%]"></div>
            <span className="text-primary text-sm">未使用: {unusedCount}</span>
          </div>
        </div>
      </div>

      {/* 所有凭证标题 */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-white text-base font-medium">所有凭证</h3>
        <span className="text-white text-xs px-2 py-0.5 border border-black-3 rounded-[6px]">
          {vouchers.length}
        </span>
      </div>

      {/* 凭证列表 */}
      <div className="space-y-3">
        {vouchers.map((voucher) => (
          <div
            key={voucher.id}
            className="border border-black-3 rounded-[12px] p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <SvgIcon
                src="/icons/voucher.svg"
                className="w-5 h-5 text-black-9"
              />
              <div>
                <div className="text-white text-sm font-medium">
                  凭证 #{voucher.id}
                </div>
                <div className="text-white text-sm">
                  {voucher.amount.toFixed(4)} USDT
                </div>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-sm font-medium ${
                  voucher.status === "已使用" ? "text-white" : "text-primary"
                }`}
              >
                {voucher.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
