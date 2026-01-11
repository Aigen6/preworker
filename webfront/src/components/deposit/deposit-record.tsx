"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import SvgIcon from "@/components/ui/SvgIcon"
import BottomSheet from "@/components/ui/bottom-sheet"
import { useTranslation } from "@/lib/hooks/use-translation"
import VoucherDetails, {
  VoucherDetailsData,
} from "@/components/voucher/voucher-details"
import CheckbookAllocationDetails from "./checkbook-allocation-details"

export interface DepositRecordData {
  id: string
  depositId?: string // Deposit ID for display
  originalAmount: number
  receivableAmount: number
  feeAmount: number
  status: "未分配" | "已分配" // 保持向后兼容
  statusText?: string // 状态显示文本
  statusType?: "normal" | "processing" | "failed" | "deleted" // 状态类型
  buttonText?: string // 按钮文本
  buttonEnabled?: boolean // 按钮是否可用
  date: string
  allocatedVouchers?: Array<{
    id: string
    amount: number
  }>
  checkbookStatus?: string // Checkbook status from backend
  canAllocate?: boolean // Whether allocation button should be shown
  allocations?: Array<{
    id: string
    amount: string | number
    status: string
    token?: {
      symbol?: string
      decimals?: number
    }
    createdAt?: string
    updatedAt?: string
  }> // Allocation 详情数据
}

interface DepositRecordProps {
  record: DepositRecordData
  onAllocateVoucher?: () => void
  onViewVoucherDetails?: () => void
  onRefresh?: () => void
  onClose?: () => void
  onRetry?: () => void // 重试回调
}

export default function DepositRecord({
  record,
  onAllocateVoucher,
  onViewVoucherDetails,
  onRefresh,
  onClose,
  onRetry,
}: DepositRecordProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isVoucherDetailsOpen, setIsVoucherDetailsOpen] = useState(false)
  const [isAllocationDetailsOpen, setIsAllocationDetailsOpen] = useState(false)

  // 模拟凭证数据 - 实际项目中应该从 props 或 API 获取
  const mockVoucherData: VoucherDetailsData = {
    totalAmount: 1.058,
    usedCount: 3,
    unusedCount: 5,
    vouchers: [
      { id: "1", amount: 0.132, status: "已使用" },
      { id: "2", amount: 0.132, status: "已使用" },
      { id: "3", amount: 0.132, status: "已使用" },
      { id: "4", amount: 0.132, status: "未使用" },
      { id: "5", amount: 0.132, status: "未使用" },
      { id: "6", amount: 0.132, status: "未使用" },
      { id: "7", amount: 0.132, status: "未使用" },
      { id: "8", amount: 0.1338, status: "未使用" },
    ],
  }

  const handleCloseVoucherDetails = () => {
    setIsVoucherDetailsOpen(false)
  }

  return (
    <div className="bg-black-2 p-4 rounded-[12px]">
      {/* 头部信息 */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm">ID: #{record.depositId || record.id}</span>
        <div className="flex space-x-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1 hover:bg-black-3 rounded transition-colors"
            >
              <SvgIcon src="/icons/refresh.svg" className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-black-3 rounded transition-colors"
            >
              <SvgIcon
                src="/icons/common-close.svg"
                className="w-4 h-4 text-primary"
              />
            </button>
          )}
        </div>
      </div>

      {/* 金额信息 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-white text-lg font-medium">
            {record.originalAmount}
          </p>
          <p className="text-black-9 text-xs">{t('deposit.originalDeposit')}</p>
        </div>
        <div className="text-center">
          <p className="text-white text-lg font-medium">
            {record.receivableAmount}
          </p>
          <p className="text-black-9 text-xs">{t('deposit.receivableAmount')}</p>
        </div>
        <div className="text-center">
          <p className="text-white text-lg font-medium">{record.feeAmount}</p>
          <p className="text-black-9 text-xs">{t('deposit.feeAmount')}</p>
        </div>
      </div>

      {/* 状态信息 - 可点击查看详情 */}
      <button
        onClick={() => {
          if (record.allocations && record.allocations.length > 0) {
            setIsAllocationDetailsOpen(true)
          }
        }}
        disabled={!record.allocations || record.allocations.length === 0}
        className={`group w-full flex justify-between items-center rounded-[12px] border p-3 mb-3 transition-all ${
          record.allocations && record.allocations.length > 0
            ? "border-primary/30 hover:border-primary hover:bg-primary/5 cursor-pointer active:bg-primary/10"
            : "border-black-3 cursor-default"
        }`}
      >
        <span className="text-black-9 text-sm">{t('deposit.usageStatus')}</span>
        <div className="flex items-center gap-2">
        <span className={`text-sm ${
          record.statusType === "normal" ? "text-white" :
          record.statusType === "processing" ? "text-yellow-400" :
          record.statusType === "failed" ? "text-red-400" :
          record.statusType === "deleted" ? "text-gray-400" :
          "text-white"
        }`}>
          {record.statusText || record.status || "--"}
        </span>
          {record.allocations && record.allocations.length > 0 && (
            <SvgIcon
              src="/icons/arrow-right-gray-icon.svg"
              className="w-4 h-4 text-primary transition-transform group-hover:translate-x-0.5"
            />
          )}
      </div>
      </button>

      {/* 日期时间 */}
      <p className="text-right text-sm mb-4">{record.date}</p>

      {/* 操作按钮 */}
      <div className="flex justify-center">
        {record.checkbookStatus === 'with_checkbook' && record.buttonEnabled ? (
          // with_checkbook: 按钮显示"在defi页面中提取"，点击后跳转到 /defi 页面
          <button
            onClick={() => {
              console.log('🔄 [DepositRecord] 点击"在defi页面中提取"，跳转到 /defi')
              router.push('/defi')
            }}
            className="w-full bg-primary text-black py-3 rounded-[12px] font-medium transition-colors hover:bg-primary/90"
          >
            {record.buttonText || t('deposit.extractInDefi')}
          </button>
        ) : record.checkbookStatus === 'with_checkbook' ? (
          // with_checkbook: 按钮显示"在defi页面中提取"，按钮失效（向后兼容）
          <button
            disabled
            className="w-full bg-gray-500/20 text-gray-400 py-3 rounded-[12px] font-medium cursor-not-allowed border border-gray-500/30"
          >
            {record.buttonText || t('deposit.extractInDefi')}
          </button>
        ) : record.buttonEnabled && record.checkbookStatus === 'ready_for_commitment' && onAllocateVoucher ? (
          // ready_for_commitment: 按钮可用，可以分配凭证
          <button
            onClick={onAllocateVoucher}
            className="w-full bg-primary text-black py-3 rounded-[12px] font-medium transition-colors hover:bg-primary/90"
          >
            {record.buttonText || t('deposit.allocateVoucher')}
          </button>
        ) : record.statusType === "deleted" ? (
          // DELETED: 已删除
          <button
            disabled
            className="w-full bg-gray-500/20 text-gray-400 py-3 rounded-[12px] font-medium cursor-not-allowed border border-gray-500/30"
          >
            {record.buttonText || t('deposit.deleted')}
          </button>
        ) : record.statusType === "failed" && onRetry ? (
          // proof_failed 或 submission_failed: 失败状态，可以重试
          <button
            onClick={onRetry}
            className="w-full bg-red-500/20 text-red-400 py-3 rounded-[12px] font-medium transition-colors hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50"
          >
            {record.buttonText || t('deposit.processingFailed')}
          </button>
        ) : record.statusType === "failed" ? (
          // proof_failed 或 submission_failed: 失败状态，但没有重试回调
          <button
            disabled
            className="w-full bg-red-500/20 text-red-400 py-3 rounded-[12px] font-medium cursor-not-allowed border border-red-500/30"
          >
            {record.buttonText || t('deposit.processingFailed')}
          </button>
        ) : (
          // 其他处理中状态: 显示对应的按钮文本，按钮禁用
          <button
            disabled
            className="w-full bg-gray-500/20 text-gray-400 py-3 rounded-[12px] font-medium cursor-not-allowed border border-gray-500/30"
          >
            {record.buttonText || t('deposit.processing')}
          </button>
        )}
      </div>

      {/* 凭证详情底部弹出 */}
      <BottomSheet
        isOpen={isVoucherDetailsOpen}
        onClose={handleCloseVoucherDetails}
        height="lg"
        showCloseButton={false}
        closeOnOverlayClick={true}
        closeOnEscape={true}
        title={t('deposit.voucherDetails')}
      >
        <VoucherDetails data={mockVoucherData} />
      </BottomSheet>

      {/* Allocation 详情底部弹出 */}
      {record.allocations && record.allocations.length > 0 && (
        <BottomSheet
          isOpen={isAllocationDetailsOpen}
          onClose={() => setIsAllocationDetailsOpen(false)}
          height="auto"
          showCloseButton={false}
          closeOnOverlayClick={true}
          closeOnEscape={true}
          className="bg-black-2"
        >
          <CheckbookAllocationDetails
            data={{
              localDepositId: record.depositId || record.id,
              totalAmount: record.receivableAmount,
              allocations: record.allocations.map((alloc) => ({
                id: alloc.id,
                amount:
                  typeof alloc.amount === "string"
                    ? parseFloat(alloc.amount) /
                      Math.pow(
                        10,
                        18 // Enclave 系统中统一使用 18 位 decimal
                      )
                    : alloc.amount,
                status: alloc.status,
                token: alloc.token,
                createdAt: alloc.createdAt,
                updatedAt: alloc.updatedAt,
              })),
            }}
            onClose={() => setIsAllocationDetailsOpen(false)}
          />
        </BottomSheet>
      )}
    </div>
  )
}
