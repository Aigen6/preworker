'use client'

import { useState, useEffect } from 'react'
import type { Task } from '@/lib/utils/task-manager'
import { AddressDisplay } from '@/components/ui/address-display'
import { useAddressResources } from '@/lib/hooks/use-address-resources'
import { useDepositCheck } from '@/lib/hooks/use-deposit-check'
import { useAllocationCheck } from '@/lib/hooks/use-allocation-check'
import { useTronEnergyRental } from '@/lib/hooks/use-tron-energy-rental'
import { getTronEnergyRequirement } from '@/lib/config/tron-energy-requirements'
import { TRON_CHAIN_ID } from '@/lib/utils/wallet-utils'
import { createQueryTronWeb } from '@/lib/utils/tron-rpc-reader'
import { X, RefreshCw, QrCode } from 'lucide-react'
import QRCode from 'qrcode'

interface TaskOperationConfirmDialogProps {
  task: Task
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  operationType: 'deposit' | 'claim' | 'enclave_deposit' | 'enclave_withdraw' | 'allocation'
  isLoading?: boolean
  allTasks?: Task[] // 用于查找relatedTask的depositId
}

export function TaskOperationConfirmDialog({
  task,
  isOpen,
  onClose,
  onConfirm,
  operationType,
  isLoading = false,
  allTasks = [],
}: TaskOperationConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showQrCode, setShowQrCode] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  
  // 获取地址资源信息（仅对需要检查余额的操作显示）
  // deposit和claim是合约操作，enclave_deposit也需要检查余额（虽然是通过SDK，但需要USDT余额）
  const isContractOperation = operationType === 'deposit' || operationType === 'claim' || operationType === 'enclave_deposit'
  const sourceAddress = task.sourceAddress || ''
  
  // 获取Vault地址
  const vaultAddress = 
    task.chainId === 714 || task.chainId === 56
      ? process.env.NEXT_PUBLIC_DEPOSIT_VAULT_714 || null
      : task.chainId === 195
      ? process.env.NEXT_PUBLIC_DEPOSIT_VAULT_195 || null
      : null
  
  // 地址资源检查（deposit和enclave_deposit需要检查USDT余额）
  const addressResources = useAddressResources({
    address: sourceAddress,
    chainId: task.chainId,
    requiredAmount: task.amount,
    operationType: operationType === 'allocation' ? 'enclave_deposit' : operationType,
  })
  
  // 从relatedTask中获取depositId（如果是claim操作）
  const relatedTask = operationType === 'claim' && task.relatedTaskId
    ? allTasks.find(t => t.id === task.relatedTaskId)
    : null
  const depositId = operationType === 'claim'
    ? (task.depositId || relatedTask?.depositId || relatedTask?.notes?.match(/DepositId:\s*(\w+)/)?.[1] || null)
    : null
  
  // Deposit检查（claim操作需要检查DepositVault中是否有对应的deposit）
  const depositCheck = useDepositCheck(
    operationType === 'claim' ? vaultAddress : null,
    depositId,
    task.chainId
  )
  
  // Allocation检查（enclave_withdraw操作需要检查是否有对应的Allocation）
  // 需要从relatedTask中获取commitment
  const relatedDepositTask = operationType === 'enclave_withdraw' && task.relatedTaskId
    ? allTasks.find(t => t.id === task.relatedTaskId)
    : null
  const commitment = operationType === 'enclave_withdraw'
    ? (task.commitment || relatedDepositTask?.commitment || null)
    : null
  
  const allocationCheck = useAllocationCheck(
    operationType === 'enclave_withdraw' ? commitment : null,
    operationType === 'enclave_withdraw' ? task.targetAddress : null
  )
  
  // TRON能量租用相关
  const isTron = task.chainId === TRON_CHAIN_ID
  const catfeeAddress = 'TMb2g37APP2JTTkvDeE6tnXV6CLzaVrWXd' // CatFee收款地址
  const [catfeeBalance, setCatfeeBalance] = useState<number | null>(null)
  const [catfeeBalanceLoading, setCatfeeBalanceLoading] = useState(false)
  const [rentalEstimate, setRentalEstimate] = useState<any>(null)
  const [rentalEstimateLoading, setRentalEstimateLoading] = useState(false)
  const energyRental = useTronEnergyRental()
  
  // 计算能量差值
  const currentEnergy = addressResources.energy ?? 0
  const requiredEnergy = addressResources.requiredEnergy ?? 0
  const energyDeficit = Math.max(0, requiredEnergy - currentEnergy)
  const needsEnergyRental = isTron && energyDeficit > 0 && (operationType === 'deposit' || operationType === 'claim')
  
  // 查询CatFee账户余额
  const fetchCatfeeBalance = async () => {
    if (!isTron) return
    
    setCatfeeBalanceLoading(true)
    try {
      const tronWeb = createQueryTronWeb()
      const account = await tronWeb.trx.getAccount(catfeeAddress)
      const balance = account.balance ? account.balance / 1_000_000 : 0 // 转换为TRX
      setCatfeeBalance(balance)
    } catch (error: any) {
      console.error('查询CatFee余额失败:', error)
      setCatfeeBalance(null)
    } finally {
      setCatfeeBalanceLoading(false)
    }
  }
  
  // 估算租用费用
  const estimateRental = async () => {
    if (!needsEnergyRental || energyDeficit <= 0) return
    
    setRentalEstimateLoading(true)
    try {
      const estimate = await energyRental.estimateRental(
        energyDeficit,
        0, // bandwidth
        'catfee',
        '1h'
      )
      setRentalEstimate(estimate)
    } catch (error: any) {
      console.error('估算租用费用失败:', error)
      setRentalEstimate(null)
    } finally {
      setRentalEstimateLoading(false)
    }
  }
  
  // 自动租用能量
  const handleAutoRentEnergy = async () => {
    if (!needsEnergyRental || energyDeficit <= 0) return
    
    try {
      // 创建租用订单
      const order = await energyRental.createRentalOrder(
        energyDeficit,
        0, // bandwidth
        'catfee',
        '1h'
      )
      
      // 如果是直接支付模式，执行支付
      if (order.paymentAddress && (order.paymentAmount || order.paymentAmountSun)) {
        await energyRental.payRentalOrder(order)
      }
      
      // 等待订单完成
      await energyRental.waitForOrderCompletion(order.orderId, 'catfee', 30000) // 30秒超时
      
      // 刷新资源信息
      addressResources.refresh()
    } catch (error: any) {
      console.error('自动租用能量失败:', error)
      throw error
    }
  }
  
  // 初始化时查询CatFee余额和估算租用费用
  useEffect(() => {
    if (needsEnergyRental && energyDeficit > 0) {
      fetchCatfeeBalance()
      estimateRental()
    } else {
      setCatfeeBalance(null)
      setRentalEstimate(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsEnergyRental, energyDeficit, isTron, operationType])
  
  // 生成二维码
  useEffect(() => {
    if (showQrCode && sourceAddress) {
      QRCode.toDataURL(sourceAddress, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
        .then((url) => {
          setQrCodeDataUrl(url)
        })
        .catch((err) => {
          console.error('生成二维码失败:', err)
        })
    }
  }, [showQrCode, sourceAddress])

  if (!isOpen) return null

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      // 如果是TRON链且能量不足，先自动租用能量
      if (needsEnergyRental && energyDeficit > 0) {
        try {
          await handleAutoRentEnergy()
          // 等待能量分配完成（给一些时间让能量生效）
          await new Promise(resolve => setTimeout(resolve, 2000))
          // 刷新资源信息
          addressResources.refresh()
        } catch (error: any) {
          console.error('自动租用能量失败:', error)
          // 即使租用失败，也继续执行操作（可能会失败，但让用户知道）
        }
      }
      
      await onConfirm()
    } finally {
      setIsSubmitting(false)
    }
  }

  const getOperationTitle = () => {
    switch (operationType) {
      case 'deposit':
        return '确认存入 Deposit Vault'
      case 'claim':
        return '确认从 Deposit Vault 提取'
      case 'enclave_deposit':
        return '确认存入隐私池'
      case 'enclave_withdraw':
        return '确认从隐私池提取'
      case 'allocation':
        return '确认进行 Allocation 分配'
      default:
        return '确认操作'
    }
  }

  const getOperationDescription = () => {
    switch (operationType) {
      case 'deposit':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">从地址：</span>
              <AddressDisplay address={task.sourceAddress || ''} chainId={task.chainId} showIndex={true} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">存入金额：</span>
              <span className="text-white font-semibold">{Math.round(task.amount)} USDT</span>
            </div>
            {task.intendedRecipients && task.intendedRecipients.length > 0 && (
              <div className="mt-3">
                <div className="text-gray-400 text-sm mb-2">指定接收者：</div>
                <div className="space-y-1 pl-4">
                  {task.intendedRecipients.map((recipient, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">•</span>
                      <AddressDisplay address={recipient.recipient || recipient.address || ''} chainId={task.chainId} showIndex={true} />
                      <span className="text-gray-400">: {Math.round(recipient.amount)} USDT</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      case 'claim':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">提取地址：</span>
              <AddressDisplay address={task.sourceAddress || ''} chainId={task.chainId} showIndex={true} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">提取金额：</span>
              <span className="text-white font-semibold">{Math.round(task.amount)} USDT</span>
            </div>
            {task.depositId && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-400">Deposit ID：</span>
                <span className="text-white font-mono text-sm">{task.depositId}</span>
              </div>
            )}
          </div>
        )
      case 'enclave_deposit':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">存入地址：</span>
              <AddressDisplay address={task.sourceAddress || ''} chainId={task.chainId} showIndex={true} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">存入金额：</span>
              <span className="text-white font-semibold">{Math.round(task.amount)} USDT</span>
            </div>
            <div className="text-yellow-500 text-sm mt-3">
              注意：存入后需要进行 Allocation 分配
            </div>
          </div>
        )
      case 'enclave_withdraw':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">提取到地址：</span>
              <AddressDisplay address={task.targetAddress || ''} chainId={task.chainId} showIndex={true} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">提取金额：</span>
              <span className="text-white font-semibold">{Math.round(task.amount)} USDT</span>
            </div>
            {task.commitment && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-400">Commitment：</span>
                <span className="text-white font-mono text-sm break-all">{task.commitment}</span>
              </div>
            )}
          </div>
        )
      case 'allocation':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Commitment：</span>
              <span className="text-white font-mono text-sm break-all">{task.commitment || '待生成'}</span>
            </div>
            {task.allocations && task.allocations.length > 0 && (
              <div className="mt-3">
                <div className="text-gray-400 text-sm mb-2">分配方案（共 {task.allocations.length} 个 Allocation）：</div>
                <div className="space-y-1 pl-4 max-h-40 overflow-y-auto">
                  {task.allocations.map((alloc, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">•</span>
                      <span className="text-white">Allocation {idx}: {Math.round(alloc.amount)} USDT</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {task.intendedRecipients && task.intendedRecipients.length > 0 && (
              <div className="mt-3">
                <div className="text-gray-400 text-sm mb-2">最终目标地址：</div>
                <div className="space-y-1 pl-4 max-h-40 overflow-y-auto">
                  {task.intendedRecipients.map((recipient, idx) => {
                    const address = recipient.address || recipient.recipient || ''
                    const allocationIndices = recipient.allocationIndices || []
                    return (
                      <div key={idx} className="flex items-center gap-2 text-sm flex-wrap">
                        <span className="text-gray-500">•</span>
                        <AddressDisplay address={address} chainId={task.chainId} showIndex={true} />
                        <span className="text-gray-400">: {Math.round(recipient.amount)} USDT</span>
                        {allocationIndices.length > 0 && (
                          <span className="text-gray-500 text-xs">(Allocation {allocationIndices.join(', ')})</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-black-2 border border-black-4 rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-black-4">
          <h2 className="text-lg font-semibold text-white">{getOperationTitle()}</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting || isLoading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          <div className="text-white">
            {getOperationDescription()}
          </div>

          {/* Deposit检查（claim操作） */}
          {operationType === 'claim' && (
            <div className="p-3 bg-black-3 rounded-lg border border-black-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Deposit检查</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={depositCheck.refresh}
                    disabled={depositCheck.loading}
                    className="p-1.5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    title="刷新Deposit信息"
                  >
                    <RefreshCw className={`w-4 h-4 ${depositCheck.loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              
              {!depositId ? (
                <div className="text-sm text-yellow-500">未找到Deposit ID，请先完成存入任务</div>
              ) : depositCheck.loading ? (
                <div className="text-sm text-gray-500">查询中...</div>
              ) : depositCheck.error ? (
                <div className="text-sm text-red-500">查询失败: {depositCheck.error}</div>
              ) : depositCheck.exists && depositCheck.depositInfo ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Deposit ID：</span>
                    <span className="text-white font-mono text-xs">{depositId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">状态：</span>
                    <span className={`font-semibold ${depositCheck.depositInfo.used ? 'text-red-500' : 'text-green-500'}`}>
                      {depositCheck.depositInfo.used ? '已使用' : '可提取'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">存入者：</span>
                    <AddressDisplay address={depositCheck.depositInfo.depositor} chainId={task.chainId} showIndex={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">接收者：</span>
                    <AddressDisplay address={depositCheck.depositInfo.intendedRecipient} chainId={task.chainId} showIndex={true} />
                  </div>
                  <div className={`pt-2 border-t border-black-4 text-sm font-semibold ${
                    !depositCheck.depositInfo.used ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {!depositCheck.depositInfo.used ? '✓ 可以提取' : '✗ 已使用，无法提取'}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-red-500">未找到对应的Deposit</div>
              )}
            </div>
          )}
          
          {/* Allocation检查（enclave_withdraw操作） */}
          {operationType === 'enclave_withdraw' && (
            <div className="p-3 bg-black-3 rounded-lg border border-black-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Allocation检查</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={allocationCheck.refresh}
                    disabled={allocationCheck.loading}
                    className="p-1.5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    title="刷新Allocation信息"
                  >
                    <RefreshCw className={`w-4 h-4 ${allocationCheck.loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              
              {!commitment ? (
                <div className="text-sm text-yellow-500">未找到Commitment，请先完成存入和Allocation分配</div>
              ) : !task.targetAddress ? (
                <div className="text-sm text-yellow-500">未找到目标地址</div>
              ) : allocationCheck.loading ? (
                <div className="text-sm text-gray-500">查询中...</div>
              ) : allocationCheck.error ? (
                <div className="text-sm text-red-500">查询失败: {allocationCheck.error}</div>
              ) : allocationCheck.exists && allocationCheck.allocationInfo ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Allocation ID：</span>
                    <span className="text-white font-mono text-xs">{allocationCheck.allocationInfo.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Commitment：</span>
                    <span className="text-white font-mono text-xs break-all">{allocationCheck.allocationInfo.commitment}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">接收者：</span>
                    <AddressDisplay address={allocationCheck.allocationInfo.recipient} chainId={task.chainId} showIndex={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">金额：</span>
                    <span className="text-white font-semibold">{allocationCheck.allocationInfo.amount} {allocationCheck.allocationInfo.currency}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">状态：</span>
                    <span className={`font-semibold ${
                      allocationCheck.allocationInfo.status === 'completed' ? 'text-green-500' :
                      allocationCheck.allocationInfo.status === 'pending' ? 'text-yellow-500' :
                      'text-red-500'
                    }`}>
                      {allocationCheck.allocationInfo.status === 'completed' ? '已完成' :
                       allocationCheck.allocationInfo.status === 'pending' ? '待处理' :
                       '失败'}
                    </span>
                  </div>
                  <div className={`pt-2 border-t border-black-4 text-sm font-semibold ${
                    allocationCheck.allocationInfo.status === 'completed' ? 'text-green-500' : 'text-yellow-500'
                  }`}>
                    {allocationCheck.allocationInfo.status === 'completed' ? '✓ 可以提取' : '⚠ Allocation未完成'}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-red-500">未找到对应的Allocation</div>
              )}
            </div>
          )}
          
          {/* 余额和资源检查（deposit和enclave_deposit需要检查USDT余额） */}
          {(operationType === 'deposit' || operationType === 'enclave_deposit') && sourceAddress && (
            <div className="p-3 bg-black-3 rounded-lg border border-black-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">地址资源检查</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowQrCode(!showQrCode)}
                    className="p-1.5 text-gray-400 hover:text-white transition-colors"
                    title="显示/隐藏二维码"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                  <button
                    onClick={addressResources.refresh}
                    disabled={addressResources.usdtBalanceLoading || addressResources.trxBalanceLoading || addressResources.nativeBalanceLoading}
                    className="p-1.5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    title="刷新余额和资源信息"
                  >
                    <RefreshCw className={`w-4 h-4 ${addressResources.usdtBalanceLoading || addressResources.trxBalanceLoading || addressResources.nativeBalanceLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              
              {/* 二维码显示 */}
              {showQrCode && qrCodeDataUrl && (
                <div className="flex justify-center p-2 bg-white rounded">
                  <img src={qrCodeDataUrl} alt="Address QR Code" className="w-48 h-48" />
                </div>
              )}
              
              {/* USDT余额 */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">USDT余额：</span>
                <div className="flex items-center gap-2">
                  {addressResources.usdtBalanceLoading ? (
                    <span className="text-gray-500">加载中...</span>
                  ) : addressResources.usdtBalanceError ? (
                    <span className="text-red-500">查询失败</span>
                  ) : (
                    <>
                      <span className={`font-semibold ${addressResources.hasEnoughBalance ? 'text-green-500' : 'text-red-500'}`}>
                        {addressResources.usdtBalance.toFixed(2)} USDT
                      </span>
                      <span className="text-gray-500">/ {Math.round(task.amount)} USDT</span>
                      {!addressResources.hasEnoughBalance && (
                        <span className="text-red-500 text-xs">余额不足</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* TRON能量租用信息（仅TRON链，能量不足时） */}
              {needsEnergyRental && (
                <div className="p-3 bg-black-2 rounded-lg border border-primary/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-primary">能量租用</h4>
                    <button
                      onClick={() => {
                        fetchCatfeeBalance()
                        estimateRental()
                      }}
                      disabled={catfeeBalanceLoading || rentalEstimateLoading}
                      className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                      title="刷新租用信息"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${catfeeBalanceLoading || rentalEstimateLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">能量差值：</span>
                      <span className="text-white font-mono">{energyDeficit.toLocaleString()} Energy</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">CatFee余额：</span>
                      {catfeeBalanceLoading ? (
                        <span className="text-gray-500">加载中...</span>
                      ) : catfeeBalance !== null ? (
                        <span className={`font-semibold ${catfeeBalance >= (rentalEstimate?.totalCost || 0) ? 'text-green-500' : 'text-red-500'}`}>
                          {catfeeBalance.toFixed(6)} TRX
                        </span>
                      ) : (
                        <span className="text-gray-500">查询失败</span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">本次租用费用：</span>
                      {rentalEstimateLoading ? (
                        <span className="text-gray-500">估算中...</span>
                      ) : rentalEstimate ? (
                        <span className="text-white font-semibold">{rentalEstimate.totalCost.toFixed(6)} TRX</span>
                      ) : (
                        <span className="text-gray-500">估算失败</span>
                      )}
                    </div>
                    
                    {rentalEstimate && catfeeBalance !== null && (
                      <div className={`pt-1.5 border-t border-black-4 text-xs ${
                        catfeeBalance >= rentalEstimate.totalCost ? 'text-green-500' : 'text-yellow-500'
                      }`}>
                        {catfeeBalance >= rentalEstimate.totalCost 
                          ? '✓ CatFee余额充足，可以自动租用' 
                          : '⚠ CatFee余额不足，无法自动租用'}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* TRON资源（仅TRON链，且非enclave_deposit操作） */}
              {task.chainId === 195 && operationType !== 'enclave_deposit' && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">TRX余额：</span>
                    <div className="flex items-center gap-2">
                      {addressResources.trxBalanceLoading ? (
                        <span className="text-gray-500">加载中...</span>
                      ) : (
                        <>
                          <span className={`font-semibold ${addressResources.trxBalance !== null && addressResources.trxBalance >= 1 ? 'text-green-500' : 'text-red-500'}`}>
                            {addressResources.trxBalance !== null ? addressResources.trxBalance.toFixed(6) : '0.000000'} TRX
                          </span>
                          {addressResources.trxBalance !== null && addressResources.trxBalance < 1 && (
                            <span className="text-red-500 text-xs">需要 ≥ 1 TRX</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Energy余额：</span>
                    <div className="flex items-center gap-2">
                      {addressResources.energyLoading ? (
                        <span className="text-gray-500">加载中...</span>
                      ) : (
                        <>
                          <span className={`font-semibold ${
                            addressResources.energy !== null && 
                            addressResources.requiredEnergy !== null && 
                            addressResources.energy >= addressResources.requiredEnergy
                              ? 'text-green-500' 
                              : 'text-red-500'
                          }`}>
                            {addressResources.energy !== null ? addressResources.energy.toLocaleString() : '0'}
                          </span>
                          {addressResources.requiredEnergy !== null && (
                            <>
                              <span className="text-gray-500">/ {addressResources.requiredEnergy.toLocaleString()}</span>
                              {addressResources.energy !== null && addressResources.energy < addressResources.requiredEnergy && (
                                <span className="text-red-500 text-xs">Energy不足</span>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
              
              {/* EVM资源（仅EVM链，且非enclave_deposit操作） */}
              {task.chainId !== 195 && operationType !== 'enclave_deposit' && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">原生代币余额：</span>
                    <div className="flex items-center gap-2">
                      {addressResources.nativeBalanceLoading ? (
                        <span className="text-gray-500">加载中...</span>
                      ) : (
                        <>
                          <span className="font-semibold text-white">
                            {addressResources.nativeBalance || '0.0000'} {task.chainId === 56 || task.chainId === 714 ? 'BNB' : task.chainId === 1 || task.chainId === 60 ? 'ETH' : 'Native'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {addressResources.estimatedGas && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">预估Gas费：</span>
                      <div className="flex items-center gap-2">
                        {addressResources.gasPriceLoading ? (
                          <span className="text-gray-500">加载中...</span>
                        ) : (
                          <>
                            <span className="font-semibold text-white">
                              {parseFloat(addressResources.estimatedGas).toFixed(6)} {task.chainId === 56 || task.chainId === 714 ? 'BNB' : task.chainId === 1 || task.chainId === 60 ? 'ETH' : 'Native'}
                            </span>
                            {addressResources.nativeBalance && parseFloat(addressResources.nativeBalance) < parseFloat(addressResources.estimatedGas) * 1.5 && (
                              <span className="text-red-500 text-xs">Gas费可能不足</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* 总体检查结果 */}
              <div className="pt-2 border-t border-black-4">
                <div className={`flex items-center justify-between text-sm font-semibold ${
                  addressResources.hasEnoughBalance && addressResources.hasEnoughResources
                    ? 'text-green-500'
                    : 'text-red-500'
                }`}>
                  <span>检查结果：</span>
                  <span>
                    {addressResources.hasEnoughBalance && addressResources.hasEnoughResources
                      ? '✓ 资源充足，可以执行'
                      : '✗ 资源不足，无法执行'}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* 总体检查结果（claim和enclave_withdraw） */}
          {operationType === 'claim' && (
            <div className="pt-2 border-t border-black-4">
              <div className={`flex items-center justify-between text-sm font-semibold ${
                depositCheck.exists && depositCheck.depositInfo && !depositCheck.depositInfo.used
                  ? 'text-green-500'
                  : 'text-red-500'
              }`}>
                <span>检查结果：</span>
                <span>
                  {depositCheck.exists && depositCheck.depositInfo && !depositCheck.depositInfo.used
                    ? '✓ Deposit存在且可提取'
                    : '✗ Deposit不存在或已使用'}
                </span>
              </div>
            </div>
          )}
          
          {operationType === 'enclave_withdraw' && (
            <div className="pt-2 border-t border-black-4">
              <div className={`flex items-center justify-between text-sm font-semibold ${
                allocationCheck.exists && allocationCheck.allocationInfo && allocationCheck.allocationInfo.status === 'completed'
                  ? 'text-green-500'
                  : 'text-red-500'
              }`}>
                <span>检查结果：</span>
                <span>
                  {allocationCheck.exists && allocationCheck.allocationInfo && allocationCheck.allocationInfo.status === 'completed'
                    ? '✓ Allocation存在且已完成'
                    : '✗ Allocation不存在或未完成'}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-gray-400 pt-2 border-t border-black-4">
            <span>链：</span>
            <span className="text-white">{task.chain}</span>
            <span className="mx-2">|</span>
            <span>任务ID：</span>
            <span className="text-white font-mono text-xs">{task.id.slice(0, 16)}...</span>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-3 p-4 border-t border-black-4">
          <button
            onClick={onClose}
            disabled={isSubmitting || isLoading}
            className="flex-1 px-4 py-2 bg-black-3 text-white rounded-lg hover:bg-black-4 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              isSubmitting || 
              isLoading || 
              (operationType === 'deposit' && (!addressResources.hasEnoughBalance || !addressResources.hasEnoughResources)) ||
              (operationType === 'enclave_deposit' && !addressResources.hasEnoughBalance) ||
              (operationType === 'claim' && (!depositCheck.exists || !depositCheck.depositInfo || depositCheck.depositInfo.used)) ||
              (operationType === 'enclave_withdraw' && (!allocationCheck.exists || !allocationCheck.allocationInfo || allocationCheck.allocationInfo.status !== 'completed'))
            }
            className="flex-1 px-4 py-2 bg-primary text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:bg-gray-500 disabled:text-gray-300 font-semibold"
          >
            {isSubmitting || isLoading ? '执行中...' : '确认执行'}
          </button>
        </div>
      </div>
    </div>
  )
}
