'use client'

import { useState } from 'react'
import SvgIcon from '@/components/ui/SvgIcon'
import { TransactionProcessing } from './transaction-processing'
import { sumReadableAmounts } from '@/lib/utils/amount-calculator'
import { useTranslation } from '@/lib/hooks/use-translation'

interface VoucherItem {
  id: string
  amount: number
  selected: boolean
}

interface VoucherGroup {
  id: string
  name: string
  total: number
  vouchers: VoucherItem[]
  expanded: boolean
  allSelected: boolean
}

interface TokenOption {
  id: string
  name: string
  symbol: string
  balance: string
  icon: string
  bgColor: string
}

export function DepositVoucherSheet() {
  const { t } = useTranslation()
  const [selectedToken, setSelectedToken] = useState('USDT')
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false)
  const [isVoucherSelectorOpen, setIsVoucherSelectorOpen] = useState(false)
  const [beneficiaryAddress, setBeneficiaryAddress] = useState('')
  const [currentStep, setCurrentStep] = useState<
    'voucher' | 'confirm' | 'processing' | 'completed'
  >('voucher')

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
  const [voucherGroups, setVoucherGroups] = useState<VoucherGroup[]>([
    {
      id: 'D11',
      name: 'D11',
      total: 300,
      expanded: true,
      allSelected: true,
      vouchers: [
        { id: 'V1', amount: 150, selected: true },
        { id: 'V2', amount: 100, selected: true },
        { id: 'V3', amount: 50, selected: true },
      ],
    },
    {
      id: 'D12',
      name: 'D12',
      total: 300,
      expanded: false,
      allSelected: false,
      vouchers: [
        { id: 'V1', amount: 150, selected: true },
        { id: 'V2', amount: 100, selected: false },
        { id: 'V3', amount: 50, selected: false },
      ],
    },
  ])

  const toggleGroupExpansion = (groupId: string) => {
    setVoucherGroups((groups) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, expanded: !group.expanded } : group
      )
    )
  }

  const toggleGroupSelectAll = (groupId: string) => {
    setVoucherGroups((groups) =>
      groups.map((group) => {
        if (group.id === groupId) {
          const allSelected = !group.allSelected
          return {
            ...group,
            allSelected,
            vouchers: group.vouchers.map((voucher) => ({
              ...voucher,
              selected: allSelected,
            })),
          }
        }
        return group
      })
    )
  }

  const toggleVoucherSelection = (groupId: string, voucherId: string) => {
    setVoucherGroups((groups) =>
      groups.map((group) => {
        if (group.id === groupId) {
          const updatedVouchers = group.vouchers.map((voucher) =>
            voucher.id === voucherId
              ? { ...voucher, selected: !voucher.selected }
              : voucher
          )
          const allSelected = updatedVouchers.every(
            (voucher) => voucher.selected
          )
          return {
            ...group,
            vouchers: updatedVouchers,
            allSelected,
          }
        }
        return group
      })
    )
  }

  const handleConfirmDeposit = () => {
    setCurrentStep('confirm')
  }

  const handleBackToVoucher = () => {
    setCurrentStep('voucher')
  }

  const handleFinalConfirm = () => {
    setCurrentStep('processing')
  }

  const handleViewTransactionStatus = () => {
    setCurrentStep('completed')
  }

  // 计算选中的凭证数量和总金额
  const selectedVouchers = voucherGroups.flatMap((group) =>
    group.vouchers.filter((voucher) => voucher.selected)
  )
  // 使用精确计算避免浮点数精度问题
  const totalAmountStr = sumReadableAmounts(selectedVouchers.map(v => v.amount), 18)
  const totalAmount = parseFloat(totalAmountStr)
  const voucherCount = selectedVouchers.length

  // 计算所有凭证的总金额
  const totalVoucherAmountStr = sumReadableAmounts(voucherGroups.map(g => g.total), 18)
  const totalVoucherAmount = parseFloat(totalVoucherAmountStr)

  const renderContent = () => {
    if (currentStep === 'voucher') {
      return (
        <>
          {/* 选择凭证代币类型 */}
          <div className="mb-6">
            <label className="block text-sm text-main mb-3">
              {t('defi.selectVoucherTokenType')}
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
                          ({t('defi.deposited')}: {currentToken?.balance}
                          {currentToken?.symbol})
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
                          ({t('defi.deposited')}: {token.balance}
                          {token.symbol})
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 受益者地址 */}
          <div className="mb-6">
            <label className="block text-sm text-main mb-3">
              {t('extract.beneficiaryAddress')}
            </label>
            <div className="bg-surface rounded-xl px-4 h-11 flex items-center border border-primary">
              <input
                type="text"
                value={beneficiaryAddress}
                onChange={(e) => setBeneficiaryAddress(e.target.value)}
                placeholder="0x... (EVM 地址格式)"
                className="w-full bg-transparent text-main placeholder-black-9 focus:outline-none"
              />
            </div>
          </div>

          {/* 可用凭证 */}
          <div className="mb-6">
            <label className="block text-sm text-main mb-3">
              {t('defi.availableVouchers')}
            </label>

            {/* 当前凭证总计展示 */}
            <div
              className="border border-line rounded-xl px-4 h-11 flex items-center justify-between cursor-pointer hover:bg-surface transition-colors"
              onClick={() => setIsVoucherSelectorOpen(!isVoucherSelectorOpen)}
            >
              <div className="flex items-center gap-3">
                <SvgIcon
                  src={`/icons/${selectedToken}.svg`}
                  className="w-5 h-5"
                />
                <div>
                  <span className="text-main font-medium">
                    {selectedToken}
                  </span>
                  <span className="text-muted text-sm ml-2">
                    ({t('defi.total')}: {totalVoucherAmount}.00{selectedToken})
                  </span>
                </div>
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
              <div className="mt-2 overflow-hidden">
                <div className="space-y-3">
                  {voucherGroups.map((group) => (
                    <div
                      key={group.id}
                      className={`border rounded-xl p-4 ${
                        group.allSelected ? 'border-primary' : 'border-line'
                      }`}
                    >
                      {/* 凭证组头部 */}
                      <div className="flex items-center justify-between mb-4 border-b border-line pb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-main">
                            {group.name}
                          </span>
                          <span className="text-sm text-muted">
                            {t('defi.total')}: {group.total}.{selectedToken}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleGroupSelectAll(group.id)}
                          className="flex items-center gap-2 text-main"
                        >
                          <span>{t('defi.selectAll')}</span>
                          <SvgIcon
                            src={
                              group.allSelected
                                ? '/icons/checked.svg'
                                : '/icons/unchecked.svg'
                            }
                            className="w-6 h-6"
                          />
                        </button>
                      </div>

                      {/* 凭证列表 */}
                      <div className="space-y-3">
                        {group.vouchers.map((voucher) => (
                          <div
                            key={voucher.id}
                            className="flex items-center justify-between"
                          >
                            <span className="text-lg font-medium text-main">
                              {voucher.id}
                            </span>
                            <div className="flex items-center gap-4">
                              <span className="text-lg text-main">
                                {voucher.amount}.{selectedToken}
                              </span>
                              <button
                                onClick={() =>
                                  toggleVoucherSelection(group.id, voucher.id)
                                }
                                className="flex items-center justify-center"
                              >
                                <SvgIcon
                                  src={
                                    voucher.selected
                                      ? '/icons/checked.svg'
                                      : '/icons/unchecked.svg'
                                  }
                                  className="w-6 h-6"
                                />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 确认存入按钮 */}
          <div className="flex justify-center">
            <button
              onClick={handleConfirmDeposit}
              className="w-[230px] h-9 bg-primary text-on-primary rounded-[14px] font-bold"
            >
              {t('defi.confirmDeposit')}
            </button>
          </div>
        </>
      )
    }

    if (currentStep === 'confirm') {
      return (
        <>
          {/* 受益者地址 */}
          <div className="mb-6">
            <label className="block text-sm text-main mb-3">
              {t('extract.beneficiaryAddress')}
            </label>
            <div className="bg-black-1 rounded-xl p-4">
              <p className="text-sm text-main break-all leading-relaxed">
                {beneficiaryAddress ||
                  '0x45e5eD2206Fcc99d6B0361fb1aA22e565cb45444'}
              </p>
            </div>
          </div>

          {/* 存入金额 */}
          <div className="mb-2">
            <label className="block text-sm text-main mb-3">
              {t('defi.depositAmount')}
            </label>
            <div className="bg-black-1 rounded-xl p-4">
              <div className="text-center">
                <p className="text-lg font-medium text-main mb-2">
                  {totalAmount.toFixed(2)} {selectedToken}
                </p>
                <p className="text-sm text-muted">{voucherCount}个凭证</p>
              </div>
            </div>
          </div>

          {/* 预估Gas费用 */}
          <div className="mb-2 text-right">
            <p className="text-sm text-muted">{t('extract.estimatedGas')} : 0.05USDT</p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={handleBackToVoucher}
              className="flex-1 h-8 bg-transparent border rounded-[14px] border-primary text-primary font-medium text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleFinalConfirm}
              className="flex-1 h-8 bg-primary text-on-primary rounded-[14px] font-medium text-sm"
            >
              {t('extract.confirmExtract')}
            </button>
          </div>
        </>
      )
    }

    if (currentStep === 'processing') {
      return (
        <TransactionProcessing
          processingText="正在处理存入交易..."
          transactionHash="0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF"
          buttonText="查看交易状态"
          onButtonClick={handleViewTransactionStatus}
          progress={60}
        />
      )
    }

    if (currentStep === 'completed') {
      return (
        <>
          {/* 交易完成图标 */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 bg-primary rounded-[20%] flex items-center justify-center mb-6">
              <div className="relative">
                {/* 外层圆形 */}
                <div className="w-16 h-16 bg-surface rounded-[20%] flex items-center justify-center">
                  {/* 内层圆形 */}
                  <div className="w-10 h-10 bg-surface rounded-[20%] flex items-center justify-center">
                    {/* 星形图标 */}
                    <SvgIcon
                      src="/icons/home-core1.svg"
                      className="w-6 h-6 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 完成文本 */}
            <h3 className="text-xl font-medium text-main mb-8">
              {t('defi.transactionCompleted')}
            </h3>
          </div>

          {/* 交易哈希 */}
          <div className="bg-surface rounded-xl p-4 mb-8">
            <p className="text-sm text-muted mb-2">交易哈希：</p>
            <p className="text-sm text-main break-all leading-relaxed">
              0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF0xec7B67Ee52b317f71fC60fee7eF477130BD91EeF
            </p>
          </div>

          {/* 查看交易状态按钮 */}
          <button
            onClick={handleViewTransactionStatus}
            className="w-full bg-primary text-black py-4 rounded-xl font-bold text-base"
          >
            {t('processing.viewTransactionStatus')}
          </button>
        </>
      )
    }

    return null
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 text-muted">
        <span>
          {currentStep === 'voucher'
            ? t('defi.depositVoucher')
            : currentStep === 'confirm'
            ? t('extract.confirmInfo')
            : currentStep === 'processing'
            ? ''
            : t('defi.transactionCompleted')}
        </span>
        {currentStep != 'processing' && <span className="">AAVE</span>}
      </div>

      {renderContent()}
    </div>
  )
}
