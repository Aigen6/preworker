'use client'

import { useState } from 'react'
import Image from 'next/image'
import SvgIcon from '@/components/ui/SvgIcon'
import { GasDetailSheet } from './gas-detail-sheet'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useBottomSheet } from '@/hooks/use-bottom-sheet'
import { TransactionProcessing } from './transaction-processing'

interface RedeemStockSheetProps {
  stock: {
    id: string
    name: string
    symbol: string
    logo: string
    price: string
    change: string
    changeType: 'up' | 'down'
    shares: string
    value: string
  }
  onClose: () => void
}

export function RedeemStockSheet({ stock, onClose }: RedeemStockSheetProps) {
  const [redeemAmount, setRedeemAmount] = useState('')
  const [beneficiaryAddress, setBeneficiaryAddress] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const gasDetailSheet = useBottomSheet()

  const handleMaxClick = () => {
    setRedeemAmount(stock.shares)
  }

  const handleRedeem = () => {
    setIsConfirming(true)
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

  const handleGasDetailClick = () => {
    gasDetailSheet.open({})
  }

  const calculateValue = () => {
    if (redeemAmount && !isNaN(Number(redeemAmount))) {
      const price = parseFloat(stock.price.replace('$', ''))
      return (Number(redeemAmount) * price).toFixed(2)
    }
    return '0.00'
  }

  const calculateActualAmount = () => {
    const currentValue = parseFloat(calculateValue())
    const fee = currentValue * 0.0006 // 0.06% fee
    return (currentValue - fee).toFixed(2)
  }

  if (isProcessing) {
    return (
      <TransactionProcessing
        processingText="正在处理赎回交易..."
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
        <h2 className="font-semibold text-muted">确认信息</h2>
        {/* 赎回详情 */}
        <div className="flex justify-between items-center mb-4 border border-line rounded-xl p-4">
          <span className="text-sm text-muted">赎回股数</span>
          <span className="text-white font-semibold">{redeemAmount}股</span>
        </div>

        {/* 受益者地址 */}
        <div className="text-white">
          <h4 className="text-sm font-medium  mb-3">受益者地址</h4>
          <p className="bg-base rounded-xl p-4">{beneficiaryAddress}</p>
        </div>

        {/* 交易详情 */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex justify-between">
            <span className="text-sm text-muted">当前价值</span>
            <span className="text-sm text-white">
              ${calculateValue()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted">手续费0.06%</span>
            <span className="text-sm text-white">
              -{(parseFloat(calculateValue()) * 0.0006).toFixed(2)} USDT
            </span>
          </div>
        </div>

        {/* 预计获得金额 */}
        <div>
          <h4 className="text-sm font-medium text-white mb-3">实际到账</h4>
          <div className="flex justify-center items-center bg-base rounded-xl p-4">
            <p className="text-lg font-semibold text-white">
              {calculateActualAmount()} USDT
            </p>
          </div>
        </div>

        {/* 预估Gas费用 */}
        <div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted">预估Gas: 0.05USDT</span>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-center">
          <button
            onClick={handleConfirm}
            className="w-[230px] h-9 bg-primary text-on-primary rounded-[14px] font-bold"
          >
            确认赎回
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
        <h2 className="text-sm font-semibold text-muted">赎回股票</h2>
        <p className="text-sm text-muted mt-1">将股票赎回为USDT到钱包</p>
      </div>

      {/* 股票信息卡片 */}
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

      {/* 赎回股数输入 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-white">赎回股数</h4>
          <span className="text-sm text-muted">
            持有股数 : {stock.shares}
          </span>
        </div>
        <div className="relative">
          <input
            type="number"
            value={redeemAmount}
            onChange={(e) => setRedeemAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-surface border border-primary rounded-xl px-4 py-4 text-white text-lg font-medium placeholder-black-9 focus:border-primary focus:outline-none"
          />
          <button
            onClick={handleMaxClick}
            className="absolute right-4 top-1/2 transform -translate-y-1/2  text-muted px-3 py-1 rounded text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            最大
          </button>
        </div>
      </div>

      {/* 计算方式说明 */}
      <div className="bg-surface rounded-xl p-4">
        <div className="text-sm text-muted">
          <p>计算方式</p>
          <p>股数*股价=当前价值</p>
          <p>当前价值-手续费=实际到账</p>
        </div>
      </div>

      {/* 受益者地址输入 */}
      <div>
        <h4 className="text-sm font-medium text-white mb-3">受益者地址</h4>
        <div className="relative">
          <input
            type="text"
            value={beneficiaryAddress}
            onChange={(e) => setBeneficiaryAddress(e.target.value)}
            placeholder="0x... (EVM 地址格式)"
            className="w-full bg-surface border border-primary rounded-xl px-4 py-4 text-white text-lg font-medium placeholder-black-9 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* 预估Gas费用 */}
      <div>
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted">预估Gas: 0.05USDT</span>
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

      {/* 确认赎回按钮 */}
      <div className="flex justify-center">
        <button
          onClick={handleRedeem}
          disabled={!redeemAmount || !beneficiaryAddress}
          className="w-[230px] h-9 bg-primary text-on-primary rounded-[14px] font-bold"
        >
          确认赎回
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
