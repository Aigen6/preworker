'use client'

import { useState } from 'react'
import SvgIcon from '@/components/ui/SvgIcon'
import { TransactionProcessing } from './transaction-processing'

interface TokenOption {
  id: string
  name: string
  symbol: string
  balance: string
  icon: string
  bgColor: string
}

interface RedeemAssetSheetProps {
  onClose?: () => void
}

export function RedeemAssetSheet({ onClose }: RedeemAssetSheetProps) {
  const [selectedToken, setSelectedToken] = useState('USDT')
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false)
  const [redeemAmount, setRedeemAmount] = useState('')
  const [beneficiaryAddress, setBeneficiaryAddress] = useState('')
  const [currentStep, setCurrentStep] = useState<
    'redeem' | 'confirm' | 'processing'
  >('redeem')

  // 代币选项数据
  const tokenOptions: TokenOption[] = [
    {
      id: 'USDT',
      name: 'USDT',
      symbol: 'USDT',
      balance: '1,250.00',
      icon: 'T',
      bgColor: 'bg-green-500',
    },
    {
      id: 'ETH',
      name: 'ETH',
      symbol: 'ETH',
      balance: '1,250.00',
      icon: 'E',
      bgColor: 'bg-blue-500',
    },
    {
      id: 'USDC',
      name: 'USDC',
      symbol: 'USDC',
      balance: '1,250.00',
      icon: '$',
      bgColor: 'bg-blue-400',
    },
  ]

  // 根据选中代币获取可用金额
  const getAvailableAmount = () => {
    const currentToken = tokenOptions.find(
      (token) => token.id === selectedToken
    )
    return parseFloat(currentToken?.balance.replace(',', '') || '0')
  }

  const availableAmount = getAvailableAmount()

  const handleMaxAmount = () => {
    setRedeemAmount(availableAmount.toString())
  }

  const handleConfirmRedeem = () => {
    setCurrentStep('confirm')
  }

  const handleBackToRedeem = () => {
    setCurrentStep('redeem')
  }

  const handleFinalConfirm = () => {
    setCurrentStep('processing')
  }

  const handleViewTransactionStatus = () => {
    // 处理查看交易状态逻辑
    console.log('查看交易状态')
    onClose?.()
  }

  const isValidAmount =
    parseFloat(redeemAmount) > 0 && parseFloat(redeemAmount) <= availableAmount
  const isValidAddress = beneficiaryAddress.length > 0

  const renderContent = () => {
    if (currentStep === 'redeem') {
      return (
        <>
          {/* 选择凭证代币类型 */}
          <div>
            <label className="block text-sm text-main mb-3">
              选择凭证代币类型
            </label>

            {/* 当前选中的代币展示 */}
            <div
              className="border border-line rounded-xl px-4 h-11 flex items-center justify-between cursor-pointer hover:bg-surface transition-colors"
              onClick={() => setIsTokenSelectorOpen(!isTokenSelectorOpen)}
            >
              <div className="flex items-center gap-3">
                {(() => {
                  const currentToken = tokenOptions.find(
                    (token) => token.id === selectedToken
                  )
                  return (
                    <>
                      <SvgIcon
                        src={`/icons/${currentToken?.id}.svg`}
                        className="w-5 h-5"
                      />
                      <div>
                        <span className="text-main font-medium">
                          {currentToken?.name}
                        </span>
                        <span className="text-muted text-sm ml-2">
                          (已存: {currentToken?.balance}
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
                    isTokenSelectorOpen ? 'rotate-270' : 'rotate-90'
                  }`}
                />
              </div>
            </div>

            {/* 代币选择列表 */}
            {isTokenSelectorOpen && (
              <div className="mt-2 rounded-xl border border-line overflow-hidden p-3 space-y-2">
                {tokenOptions.map((token) => (
                  <div
                    key={token.id}
                    className={`px-4 h-11 flex items-center justify-between cursor-pointer border rounded-xl hover:bg-surface transition-colors
                      ${
                        selectedToken === token.id
                          ? ' border-primary'
                          : 'border-line'
                      }
                    `}
                    onClick={() => {
                      setSelectedToken(token.id)
                      setRedeemAmount('') // 清空赎回金额，避免不同代币金额混淆
                      setIsTokenSelectorOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <SvgIcon
                        src={`/icons/${token.id}.svg`}
                        className="w-5 h-5"
                      />
                      <div>
                        <span className="text-main font-medium">
                          {token.name}
                        </span>
                        <span className="text-muted text-sm ml-2">
                          (已存: {token.balance}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 赎回数量 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-main">赎回数量</label>
              <span className="text-sm text-muted">
                可赎回: {availableAmount.toFixed(2)}
                {selectedToken}
              </span>
            </div>
            <div className="bg-surface rounded-xl px-4 h-11 flex items-center justify-between border border-primary">
              <input
                type="number"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                placeholder="请输入赎回数量"
                className="flex-1 bg-transparent text-sm text-main placeholder-black-9 focus:outline-none"
              />
              <button
                onClick={handleMaxAmount}
                className="text-sm text-primary hover:text-primary/80 transition-colors shrink-0"
              >
                最大
              </button>
            </div>
          </div>

          {/* 受益者地址 */}
          <div>
            <label className="block text-sm text-main mb-3">
              受益者地址
            </label>
            <div className="bg-surface rounded-xl px-4 h-11 flex items-center justify-between border border-primary">
              <input
                type="text"
                value={beneficiaryAddress}
                onChange={(e) => setBeneficiaryAddress(e.target.value)}
                placeholder="0x... (EVM 地址格式)"
                className="w-full bg-transparent text-sm text-main placeholder-black-9 focus:outline-none"
              />
            </div>
          </div>

          {/* 预估Gas费用 */}
          <div className="text-right">
            <p className="text-sm text-muted">预估Gas: 0.05{selectedToken}</p>
          </div>

          {/* 确认赎回按钮 */}
          <div className="flex justify-center">
            <button
              onClick={handleConfirmRedeem}
              className="w-[230px] h-9 bg-primary text-on-primary rounded-[14px] font-bold"
            >
              确认赎回
            </button>
          </div>
        </>
      )
    }

    if (currentStep === 'confirm') {
      return (
        <>
          {/* 受益者地址 */}
          <div>
            <label className="block text-sm text-main mb-3">
              受益者地址
            </label>
            <div className="bg-black-1 rounded-xl p-4">
              <p className="text-sm text-main break-all leading-relaxed">
                {beneficiaryAddress ||
                  '0x45e5eD2206Fcc99d6B0361fb1aA22e565cb45444'}
              </p>
            </div>
          </div>

          {/* 赎回金额 */}
          <div>
            <label className="block text-sm text-main mb-3">
              赎回金额
            </label>
            <div className="bg-black-1 rounded-xl p-4">
              <div className="text-center">
                <p className="text-lg font-medium text-main">
                  {redeemAmount || '300.00'} {selectedToken}
                </p>
              </div>
            </div>
          </div>

          {/* 预估Gas费用 */}
          <div className="text-right">
            <p className="text-sm text-muted">预估Gas: 0.05{selectedToken}</p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 px-7">
            <button
              onClick={handleBackToRedeem}
              className="flex-1 h-8 bg-transparent border rounded-[14px] border-primary text-primary font-medium text-sm"
            >
              取消
            </button>
            <button
              onClick={handleFinalConfirm}
              className="flex-1 h-8 bg-primary text-on-primary rounded-[14px] font-medium text-sm"
            >
              确认赎回
            </button>
          </div>
        </>
      )
    }

    if (currentStep === 'processing') {
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

    return null
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between text-muted">
        <span>
          {currentStep === 'redeem'
            ? '赎回资产'
            : currentStep === 'confirm'
            ? '确认信息'
            : ''}
        </span>
        {currentStep != 'processing' && <span className="">AAVE</span>}
      </div>

      {renderContent()}
    </div>
  )
}
