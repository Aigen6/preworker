'use client'

import { useState } from 'react'
import Image from 'next/image'
import SvgIcon from '@/components/ui/SvgIcon'
import { GasDetailSheet } from './gas-detail-sheet'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useBottomSheet } from '@/hooks/use-bottom-sheet'
import { TransactionProcessing } from './transaction-processing'

interface BuyStockSheetProps {
  stock: {
    id: string
    name: string
    symbol: string
    logo: string
    price: string
    change: string
    changeType: 'up' | 'down'
  }
  onClose: () => void
}

export function BuyStockSheet({ stock, onClose }: BuyStockSheetProps) {
  // 凭证选项数据
  const voucherOptions = [
    {
      id: 'usdt',
      name: 'USDT',
      balance: '1,234.56',
      icon: 'usdt',
    },
    {
      id: 'eth',
      name: 'ETH',
      balance: '12.34',
      icon: 'eth',
    },
    {
      id: 'usdc',
      name: 'USDC',
      balance: '567.89',
      icon: 'usdc',
    },
  ]

  const [selectedVoucher, setSelectedVoucher] = useState('usdt')
  const [isVoucherSelectorOpen, setIsVoucherSelectorOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const gasDetailSheet = useBottomSheet()

  const handleBuy = () => {
    setIsConfirming(true)
  }

  const handleGasDetailClick = () => {
    gasDetailSheet.open({})
  }

  const handleGoBack = () => {
    setIsConfirming(false)
  }

  const handleConfirm = () => {
    setIsProcessing(true)
    // 模拟交易处理
    setTimeout(() => {
      console.log('交易处理完成')
      onClose()
    }, 5000)
  }

  const handleViewTransactionStatus = () => {
    console.log('查看交易状态')
    onClose()
  }

  if (isProcessing) {
    return (
      <TransactionProcessing
        processingText="正在处理买入交易..."
        transactionHash="0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF"
        buttonText="查看交易状态"
        onButtonClick={handleViewTransactionStatus}
        progress={60}
      />
    )
  }

  if (isConfirming) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="font-semibold text-muted">买入股票</h2>
        {/* 购买详情 */}
        <div className="flex justify-between items-center mb-4 border border-line rounded-xl p-4">
          <span className="text-sm text-muted">5个凭证</span>
          <span className="text-white font-semibold">
            500.00{voucherOptions.find((v) => v.id === selectedVoucher)?.name}
          </span>
        </div>

        {/* 受益者地址 */}
        <div className="text-white">
          <h4 className="text-sm font-medium  mb-3">受益者地址</h4>
          <p className="bg-base rounded-xl p-4">
            0×45e5eD2206Fcc99d6B0361fb1aA22e 565cb45444
          </p>
        </div>

        {/* 交易详情 */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex justify-between">
            <span className="text-sm text-muted">手续费 (0.06%)</span>
            <span className="text-sm text-white">-$1.80 USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted">实际购买金额</span>
            <span className="text-sm text-white">499.2 USDT</span>
          </div>
        </div>

        {/* 预计获得股数 */}
        <div>
          <h4 className="text-sm font-medium text-white mb-3">预计获得股数</h4>
          <div className="flex justify-center items-center bg-base rounded-xl p-4">
            <p className="text-lg font-semibold text-white">4.99股</p>
          </div>
        </div>

        {/* 预估Gas费用 */}
        <div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted">
              预估Gas: 0.05
              {voucherOptions.find((v) => v.id === selectedVoucher)?.name}
            </span>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 px-7">
          <button
            onClick={handleGoBack}
            className="flex-1 h-8 bg-transparent border rounded-[14px] border-primary text-primary font-medium text-sm"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 h-8 bg-primary text-on-primary rounded-[14px] font-medium text-sm"
          >
            确认购买
          </button>
        </div>

        {/* Gas详情弹框 */}
        <BottomSheet
          isOpen={gasDetailSheet.isOpen}
          onClose={gasDetailSheet.close}
          height="auto"
          showCloseButton={false}
          closeOnOverlayClick={true}
          className="bg-base"
        >
          <GasDetailSheet onClose={gasDetailSheet.close} />
        </BottomSheet>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 头部 */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-muted">买入股票</h2>
            <p className="text-sm text-muted mt-1">使用隐私凭证购买股票</p>
          </div>
        </div>
      </div>

      {/* 股票信息卡片 */}
      <div>
        <div className="bg-surface rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center">
              <Image
                src={stock.logo}
                alt={stock.name}
                width={28}
                height={28}
                className="rounded-lg"
              />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">{stock.name}</h3>
              <p className="text-sm text-muted">{stock.symbol}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-white">{stock.price}</p>
              <div
                className={`flex items-center gap-1 ${
                  stock.changeType === 'up' ? 'text-green-500' : 'text-red-500'
                }`}
              >
                <SvgIcon
                  src="/icons/arrow-right-gray-icon.svg"
                  className={`w-3 h-3 ${
                    stock.changeType === 'up' ? 'rotate-270' : 'rotate-90'
                  }`}
                  monochrome
                />
                <span className="text-sm font-medium">{stock.change}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 可用凭证选择 */}
      <div>
        <h4 className="font-medium text-white mb-3">可用凭证</h4>

        {/* 当前选中的凭证展示 */}
        <div
          className="border border-line rounded-xl px-4 h-11 flex items-center justify-between cursor-pointer hover:bg-surface transition-colors"
          onClick={() => setIsVoucherSelectorOpen(!isVoucherSelectorOpen)}
        >
          <div className="flex items-center gap-3">
            {(() => {
              const currentVoucher = voucherOptions.find(
                (voucher) => voucher.id === selectedVoucher
              )
              return (
                <>
                  <SvgIcon
                    src={`/icons/${currentVoucher?.icon}.svg`}
                    className="w-5 h-5"
                  />
                  <div>
                    <span className="text-main font-medium">
                      {currentVoucher?.name}
                    </span>
                    <span className="text-muted text-sm ml-2">
                      (可用: {currentVoucher?.balance})
                    </span>
                  </div>
                </>
              )
            })()}
          </div>
          <div className="flex items-center gap-2 text-muted">
            <SvgIcon
              src="/icons/arrow-right-gray-icon.svg"
              className={`w-4 h-4 transition-transform ${
                isVoucherSelectorOpen ? 'rotate-270' : 'rotate-90'
              }`}
            />
          </div>
        </div>

        {/* 凭证选择列表 */}
        {isVoucherSelectorOpen && (
          <div className="mt-2 rounded-xl border border-line overflow-hidden p-3 space-y-2">
            {voucherOptions.map((voucher) => (
              <div
                key={voucher.id}
                className={`px-4 h-11 flex items-center justify-between cursor-pointer border rounded-xl hover:bg-surface transition-colors
                  ${
                    selectedVoucher === voucher.id
                      ? ' border-primary'
                      : 'border-line'
                  }
                `}
                onClick={() => {
                  setSelectedVoucher(voucher.id)
                  setIsVoucherSelectorOpen(false)
                }}
              >
                <div className="flex items-center gap-3">
                  <SvgIcon
                    src={`/icons/${voucher.icon}.svg`}
                    className="w-5 h-5"
                  />
                  <div>
                    <span className="text-main font-medium">
                      {voucher.name}
                    </span>
                    <span className="text-muted text-sm ml-2">
                      (可用: {voucher.balance})
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 计算方式说明 */}
      <div>
        <div className="bg-surface rounded-xl p-4 text-sm text-muted">
          <p>计算方式</p>
          <p>凭证总额 - 手续费 = 实际购买金额</p>
          <p>实际购买金额 ÷ 股价 = 获得股数</p>
        </div>
      </div>

      {/* 预估Gas费用 */}
      <div>
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted">
            预估Gas : 0.05
            {voucherOptions.find((v) => v.id === selectedVoucher)?.name}
          </span>
          <button
            onClick={handleGasDetailClick}
            className="w-4 h-4 rounded-[20%] flex items-center justify-center hover:bg-surface transition-colors cursor-pointer"
          >
            <SvgIcon
              src="/icons/questionMark.svg"
              className="w-4 h-4 text-muted"
              monochrome
            />
          </button>
        </div>
      </div>

      {/* 确认买入按钮 */}
      <div className="flex justify-center">
        <button
          onClick={handleBuy}
          className="w-[230px] h-9 bg-primary text-on-primary rounded-[14px] font-bold"
        >
          确认买入
        </button>
      </div>

      {/* Gas详情弹框 */}
      <BottomSheet
        isOpen={gasDetailSheet.isOpen}
        onClose={gasDetailSheet.close}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-base"
      >
        <GasDetailSheet onClose={gasDetailSheet.close} />
      </BottomSheet>
    </div>
  )
}
