"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import type { Task } from "@/lib/utils/task-manager"
import { getAddressPoolService } from "@/lib/services/address-pool.service"
import { getKeyManagerClient, chainIdToKeyManagerChain } from "@/lib/services/keymanager-client"
import { X, CheckCircle2, XCircle, Eye, CircleCheck } from "lucide-react"
import { AddressDisplay } from "@/components/ui/address-display"

interface TaskChainReviewDialogProps {
  isOpen: boolean
  onClose: () => void
  tasks: Task[]
  chainId: number
  onApprove: (chainRootTaskId: string) => void
}

interface ReviewItem {
  id: string
  label: string
  passed: boolean | null // null = 未检查, true = 通过, false = 未通过
  details?: string
  detailData?: any // 详细信息数据
}

export function TaskChainReviewDialog({
  isOpen,
  onClose,
  tasks,
  chainId,
  onApprove,
}: TaskChainReviewDialogProps) {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [viewingDetail, setViewingDetail] = useState<string | null>(null)
  const [feeRecipientAddresses, setFeeRecipientAddresses] = useState<string[]>([])
  // 用于跟踪审核项ID，避免不必要的状态重置
  const reviewItemsIdsRef = useRef<string>('')

  // 获取根任务（deposit任务，没有relatedTaskId）
  const rootTask = useMemo(() => {
    return tasks.find(t => t.type === "deposit" && !t.relatedTaskId) || tasks[0]
  }, [tasks])

  const isHighRisk = rootTask?.isHighRisk || false

  // 加载手续费接收地址
  useEffect(() => {
    const loadFeeRecipients = async () => {
      try {
        const keyManagerClient = getKeyManagerClient()
        const chain = chainIdToKeyManagerChain(chainId)
        if (!chain) return

        const startIndex = 19050118
        const count = 10
        const addresses = await keyManagerClient.exportBatch(chain, startIndex, count)
        const addressList = addresses.map(addr => addr.address.trim().toLowerCase())
        setFeeRecipientAddresses(addressList)
      } catch (error) {
        console.error('加载手续费接收地址失败:', error)
      }
    }
    if (isOpen) {
      loadFeeRecipients()
    }
  }, [isOpen, chainId])

  // 执行审核检查
  useEffect(() => {
    if (!isOpen || tasks.length === 0 || !rootTask) return

    const performReview = () => {
      const items: ReviewItem[] = []
      const addressPool = getAddressPoolService(chainId)

      // 1. 确认总量一致
      const totalAmountCheck = checkTotalAmount(tasks, rootTask)
      items.push({
        id: "total-amount",
        label: "确认总量一致",
        passed: totalAmountCheck.passed,
        details: totalAmountCheck.details,
        detailData: totalAmountCheck.data,
      })

      // 2. 中间地址必须是列表中的地址
      const intermediateAddressCheck = checkIntermediateAddresses(tasks, addressPool)
      items.push({
        id: "intermediate-addresses",
        label: "中间地址必须是列表中的地址",
        passed: intermediateAddressCheck.passed,
        details: intermediateAddressCheck.details,
        detailData: intermediateAddressCheck.data,
      })

      if (isHighRisk) {
        // 3. 最终地址不是列表中的地址
        const finalAddressCheck = checkFinalAddressesNotInPool(tasks, addressPool)
        items.push({
          id: "final-addresses-not-in-pool",
          label: "最终地址不是列表中的地址",
          passed: finalAddressCheck.passed,
          details: finalAddressCheck.details,
          detailData: finalAddressCheck.data,
        })

        // 4. 4%的手续费单独的Allocation，目标地址是手续费地址
        const feeAllocationCheck = checkFeeAllocation(tasks, feeRecipientAddresses, addressPool)
        items.push({
          id: "fee-allocation",
          label: "4%的手续费单独的Allocation，目标地址是手续费地址",
          passed: feeAllocationCheck.passed,
          details: feeAllocationCheck.details,
          detailData: feeAllocationCheck.data,
        })
      } else {
        // 3. 最终地址必须是列表中的地址
        const finalAddressCheck = checkFinalAddressesInPool(tasks, addressPool)
        items.push({
          id: "final-addresses-in-pool",
          label: "最终地址必须是列表中的地址",
          passed: finalAddressCheck.passed,
          details: finalAddressCheck.details,
          detailData: finalAddressCheck.data,
        })

        // 4. 最终地址不是手续费地址
        const finalAddressNotFeeCheck = checkFinalAddressesNotFee(tasks, feeRecipientAddresses, addressPool)
        items.push({
          id: "final-addresses-not-fee",
          label: "最终地址不是手续费地址",
          passed: finalAddressNotFeeCheck.passed,
          details: finalAddressNotFeeCheck.details,
          detailData: finalAddressNotFeeCheck.data,
        })
      }

      // 检查审核项ID是否真的变化了（避免因依赖项变化而重置状态）
      const newItemIds = items.map(item => item.id).sort().join(',')
      const oldItemIds = reviewItemsIdsRef.current
      
      setReviewItems(items)
      
      // 只有当审核项ID真正变化时才重置确认状态
      if (newItemIds !== oldItemIds) {
        console.log('[审核] 审核项ID变化，重置确认状态', { old: oldItemIds, new: newItemIds })
        reviewItemsIdsRef.current = newItemIds
        setConfirmedItems(new Set())
        setViewedItems(new Set())
      } else {
        console.log('[审核] 审核项ID未变化，保留确认状态')
      }
    }

    performReview()
  }, [isOpen, tasks, rootTask, isHighRisk, chainId, feeRecipientAddresses])

  // 检查总量一致
  const checkTotalAmount = (tasks: Task[], rootTask: Task) => {
    const depositAmount = rootTask.amount || 0
    
    // 计算所有最终目标地址的金额总和
    let totalFinalAmount = 0
    const enclaveDepositTasks = tasks.filter(t => t.type === "enclave_deposit")
    
    for (const depositTask of enclaveDepositTasks) {
      if (depositTask.intendedRecipients) {
        for (const recipient of depositTask.intendedRecipients) {
          totalFinalAmount += recipient.amount || 0
        }
      }
    }

    const passed = Math.abs(depositAmount - totalFinalAmount) < 0.01
    return {
      passed,
      details: passed 
        ? `总量一致：${depositAmount.toFixed(2)} USDT = ${totalFinalAmount.toFixed(2)} USDT`
        : `总量不一致：存入 ${depositAmount.toFixed(2)} USDT，最终目标 ${totalFinalAmount.toFixed(2)} USDT`,
      data: {
        depositAmount,
        totalFinalAmount,
        difference: Math.abs(depositAmount - totalFinalAmount),
      }
    }
  }

  // 检查中间地址是否在地址池中
  const checkIntermediateAddresses = (tasks: Task[], addressPool: any) => {
    const claimTasks = tasks.filter(t => t.type === "claim")
    const issues: string[] = []
    const validAddresses: Array<{ address: string; index: number | null }> = []
    const invalidAddresses: string[] = []

      for (const claimTask of claimTasks) {
        const targetAddress = (claimTask.targetAddress || "").toLowerCase()
        const addressInfo = addressPool.getAddressByAddress(targetAddress)
        
        if (addressInfo) {
          validAddresses.push({ address: targetAddress, index: addressInfo.keyManagerIndex || null })
        } else {
          invalidAddresses.push(targetAddress)
          issues.push(`中间地址 ${targetAddress.slice(0, 10)}... 不在地址列表中`)
        }
      }

    return {
      passed: invalidAddresses.length === 0,
      details: invalidAddresses.length === 0
        ? `所有中间地址都在列表中（共 ${validAddresses.length} 个）`
        : `有 ${invalidAddresses.length} 个中间地址不在列表中`,
      data: {
        validAddresses,
        invalidAddresses,
        issues,
      }
    }
  }

  // 检查最终地址不在地址池中（高风险）
  const checkFinalAddressesNotInPool = (tasks: Task[], addressPool: any) => {
    const enclaveDepositTasks = tasks.filter(t => t.type === "enclave_deposit")
    const issues: string[] = []
    const validAddresses: Array<{ address: string; amount: number; index: number | null }> = []
    const invalidAddresses: Array<{ address: string; amount: number; index: number | null }> = []

    for (const depositTask of enclaveDepositTasks) {
      if (depositTask.intendedRecipients) {
        for (const recipient of depositTask.intendedRecipients) {
          const address = (recipient.address || "").toLowerCase()
          const addressInfo = addressPool.getAddressByAddress(address)
          const index = addressInfo?.keyManagerIndex || null
          
          if (addressInfo) {
            invalidAddresses.push({ address, amount: recipient.amount || 0, index })
            issues.push(`最终地址 ${address.slice(0, 10)}... 在地址列表中（不应在列表中）`)
          } else {
            validAddresses.push({ address, amount: recipient.amount || 0, index: null })
          }
        }
      }
    }

    return {
      passed: invalidAddresses.length === 0,
      details: invalidAddresses.length === 0
        ? `所有最终地址都不在列表中（共 ${validAddresses.length} 个）`
        : `有 ${invalidAddresses.length} 个最终地址在列表中（不应在列表中）`,
      data: {
        validAddresses,
        invalidAddresses,
        issues,
      }
    }
  }

  // 检查最终地址在地址池中（非高风险）
  const checkFinalAddressesInPool = (tasks: Task[], addressPool: any) => {
    const enclaveDepositTasks = tasks.filter(t => t.type === "enclave_deposit")
    const issues: string[] = []
    const validAddresses: Array<{ address: string; amount: number; index: number | null }> = []
    const invalidAddresses: Array<{ address: string; amount: number }> = []

    for (const depositTask of enclaveDepositTasks) {
      if (depositTask.intendedRecipients) {
        for (const recipient of depositTask.intendedRecipients) {
          const address = (recipient.address || "").toLowerCase()
          const addressInfo = addressPool.getAddressByAddress(address)
          
          if (addressInfo) {
            validAddresses.push({ 
              address, 
              amount: recipient.amount || 0,
              index: addressInfo.keyManagerIndex || null
            })
          } else {
            invalidAddresses.push({ address, amount: recipient.amount || 0 })
            issues.push(`最终地址 ${address.slice(0, 10)}... 不在地址列表中`)
          }
        }
      }
    }

    return {
      passed: invalidAddresses.length === 0,
      details: invalidAddresses.length === 0
        ? `所有最终地址都在列表中（共 ${validAddresses.length} 个）`
        : `有 ${invalidAddresses.length} 个最终地址不在列表中`,
      data: {
        validAddresses,
        invalidAddresses,
        issues,
      }
    }
  }

  // 检查最终地址不是手续费地址（非高风险）
  const checkFinalAddressesNotFee = (tasks: Task[], feeRecipientAddresses: string[], addressPool: any) => {
    const enclaveDepositTasks = tasks.filter(t => t.type === "enclave_deposit")
    const issues: string[] = []
    const validAddresses: Array<{ address: string; amount: number; index: number | null }> = []
    const invalidAddresses: Array<{ address: string; amount: number; index: number | null }> = []

    for (const depositTask of enclaveDepositTasks) {
      if (depositTask.intendedRecipients) {
        for (const recipient of depositTask.intendedRecipients) {
          const address = (recipient.address || "").toLowerCase()
          const addressInfo = addressPool.getAddressByAddress(address)
          const index = addressInfo?.keyManagerIndex || null
          
          if (feeRecipientAddresses.includes(address)) {
            invalidAddresses.push({ address, amount: recipient.amount || 0 })
            issues.push(`最终地址 ${address.slice(0, 10)}... 是手续费地址（不应该是手续费地址）`)
          } else {
            validAddresses.push({ address, amount: recipient.amount || 0 })
          }
        }
      }
    }

    return {
      passed: invalidAddresses.length === 0,
      details: invalidAddresses.length === 0
        ? `所有最终地址都不是手续费地址（共 ${validAddresses.length} 个）`
        : `有 ${invalidAddresses.length} 个最终地址是手续费地址（不应该是手续费地址）`,
      data: {
        validAddresses,
        invalidAddresses,
        issues,
      }
    }
  }

  // 检查手续费Allocation（高风险）
  const checkFeeAllocation = (tasks: Task[], feeRecipientAddresses: string[], addressPool: any) => {
    const rootTask = tasks.find(t => t.type === "deposit" && !t.relatedTaskId) || tasks[0]
    const depositAmount = rootTask?.amount || 0
    const expectedFee = depositAmount * 0.04
    
    const enclaveDepositTasks = tasks.filter(t => t.type === "enclave_deposit")
    let feeAmount = 0
    let feeAllocationFound = false
    let feeAllocationAddress: string | null = null
    const issues: string[] = []

    // 查找手续费Allocation（通过 intendedRecipients 中地址是手续费地址的项）
    // 注意：Task 中的 allocations 是分配方案数组，每个元素有 amount 字段
    // 这与 SDK 中的 Allocation 对象不同，SDK 的 Allocation 需要通过 allocationIds 从 stores 获取
    let feeAllocationIndex: number | null = null
    for (const depositTask of enclaveDepositTasks) {
      // 安全检查：确保 intendedRecipients 和 allocations 都存在
      if (!depositTask.intendedRecipients || !Array.isArray(depositTask.intendedRecipients)) {
        continue
      }
      if (!depositTask.allocations || !Array.isArray(depositTask.allocations)) {
        continue
      }
      
      for (const recipient of depositTask.intendedRecipients) {
        const address = (recipient.address || recipient.recipient || "").toLowerCase().trim()
        if (!address) continue
          
        // 检查是否是手续费地址
        if (feeRecipientAddresses.includes(address)) {
          feeAllocationFound = true
          feeAllocationAddress = address
          // 查找地址在地址池中的编号
          if (addressPool && typeof addressPool.getAddressByAddress === 'function') {
            const addressInfo = addressPool.getAddressByAddress(address)
            feeAllocationIndex = addressInfo?.keyManagerIndex || null
          }
          
          // 计算该地址对应的allocation总金额
          // allocationIndices 是数组，包含该地址对应的 allocation 索引
          const allocationIndices = recipient.allocationIndices || []
          for (const idx of allocationIndices) {
            // 安全检查：确保索引有效且 allocations 数组中有对应元素
            if (typeof idx === 'number' && idx >= 0 && idx < depositTask.allocations.length) {
              const allocation = depositTask.allocations[idx]
              if (allocation && typeof allocation.amount === 'number') {
                feeAmount += allocation.amount
              }
            }
          }
        }
      }
    }

    const feePassed = feeAllocationFound && Math.abs(feeAmount - expectedFee) < 0.01
    const addressPassed = feeAllocationAddress !== null && feeRecipientAddresses.includes(feeAllocationAddress)

    if (!feeAllocationFound) {
      issues.push("未找到手续费Allocation（没有目标地址是手续费地址）")
    }
    if (feeAllocationFound && !feePassed) {
      issues.push(`手续费金额不匹配：期望 ${expectedFee.toFixed(2)} USDT (4%)，实际 ${feeAmount.toFixed(2)} USDT`)
    }
    if (feeAllocationAddress && !addressPassed) {
      issues.push(`手续费地址不在手续费地址列表中：${feeAllocationAddress.slice(0, 10)}...`)
    }

    return {
      passed: feeAllocationFound && feePassed && addressPassed,
      details: feeAllocationFound && feePassed && addressPassed
        ? `手续费Allocation正确：${feeAmount.toFixed(2)} USDT (4%)，目标地址是手续费地址`
        : issues.join("; "),
      data: {
        depositAmount,
        totalAmount: depositAmount, // 添加 totalAmount 的别名，保持兼容性
        expectedFee,
        feeAmount,
        feePassed, // 添加 feePassed 字段
        feeAllocationFound,
        feeAllocationAddress,
        feeAllocationIndex,
        issues,
      }
    }
  }

  // 跟踪已查看的审核项
  const [viewedItems, setViewedItems] = useState<Set<string>>(new Set())
  // 跟踪已手动确认的审核项
  const [confirmedItems, setConfirmedItems] = useState<Set<string>>(new Set())

  // 处理查看详情
  const handleViewDetail = (itemId: string) => {
    setViewingDetail(itemId === viewingDetail ? null : itemId)
    if (itemId !== viewingDetail) {
      setViewedItems(prev => new Set([...prev, itemId]))
    }
  }

  // 处理手动确认审核项
  const handleConfirmItem = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation() // 阻止事件冒泡
    }
    
    // 检查是否已查看详情
    if (!viewedItems.has(itemId)) {
      console.warn(`[审核] 请先查看详情再确认: ${itemId}`)
      return
    }
    
    console.log(`[审核] 切换确认状态: ${itemId}`, {
      currentState: confirmedItems.has(itemId),
      viewed: viewedItems.has(itemId)
    })
    
    setConfirmedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId) // 取消确认
        console.log(`[审核] 取消确认: ${itemId}`)
      } else {
        newSet.add(itemId) // 确认
        console.log(`[审核] 确认: ${itemId}`)
      }
      return newSet
    })
  }

  // 检查是否所有项都通过、已查看且已手动确认
  const allPassedAndConfirmed = useMemo(() => {
    if (reviewItems.length === 0) return false
    const allPassed = reviewItems.every(item => item.passed === true)
    const allViewed = reviewItems.every(item => viewedItems.has(item.id))
    const allConfirmed = reviewItems.every(item => confirmedItems.has(item.id))
    return allPassed && allViewed && allConfirmed
  }, [reviewItems, viewedItems, confirmedItems])

  // 处理确认通过
  const handleApprove = () => {
    if (rootTask) {
      onApprove(rootTask.id)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-black-2 rounded-lg border-2 border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">
              任务链审核 {isHighRisk ? "(高风险)" : "(普通)"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* 审核项列表 */}
          <div className="space-y-3 mb-6">
            {reviewItems.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-lg border-2 ${
                  // 已确认：主色调边框（最明显）
                  item.passed === true && confirmedItems.has(item.id)
                    ? "border-primary/50 bg-primary/10"
                    // 已通过但未确认：绿色边框（系统检查通过）
                    : item.passed === true
                    ? "border-green-500/50 bg-green-500/10"
                    // 未通过：红色边框
                    : item.passed === false
                    ? "border-red-500/50 bg-red-500/10"
                    // 待检查：灰色边框
                    : "border-gray-700 bg-black-3"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* 系统检查状态：已通过/未通过 */}
                    {item.passed === true ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" title="系统检查：已通过" />
                    ) : item.passed === false ? (
                      <XCircle className="w-5 h-5 text-red-400" title="系统检查：未通过" />
                    ) : (
                      <div className="w-5 h-5 border-2 border-gray-500 rounded-full" title="系统检查：待检查" />
                    )}
                    <span className="text-white font-semibold">{item.label}</span>
                    {/* 操作者确认状态 */}
                    {confirmedItems.has(item.id) ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-md border border-primary/30" title="操作者已手动确认">
                        <CircleCheck className="w-3 h-3" />
                        已确认
                      </span>
                    ) : item.passed === true ? (
                      <span className="text-xs text-gray-500" title="系统检查已通过，等待操作者确认">待确认</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewDetail(item.id)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-black-3 hover:bg-black-4 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      查看详情
                    </button>
                    {item.passed === true && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleConfirmItem(item.id, e)
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          confirmedItems.has(item.id)
                            ? "bg-primary text-black hover:bg-primary/80"
                            : !viewedItems.has(item.id)
                            ? "bg-black-3 text-gray-500 opacity-50 cursor-not-allowed"
                            : "bg-black-3 text-gray-400 hover:bg-black-4 hover:text-white"
                        }`}
                        disabled={!viewedItems.has(item.id)}
                        title={
                          !viewedItems.has(item.id)
                            ? "请先查看详情"
                            : confirmedItems.has(item.id)
                            ? "已确认（点击可取消）"
                            : "点击确认"
                        }
                      >
                        {confirmedItems.has(item.id) ? (
                          <>
                            <CircleCheck className="w-4 h-4" />
                            已确认
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            确认
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {item.details && (
                  <div className="mt-2 ml-8">
                    <p className="text-sm text-gray-400">{item.details}</p>
                    {/* 状态说明 */}
                    <div className="mt-1 text-xs text-gray-500">
                      {item.passed === true && confirmedItems.has(item.id) && (
                        <span>✓ 系统检查：已通过 | ✓ 操作者：已确认</span>
                      )}
                      {item.passed === true && !confirmedItems.has(item.id) && (
                        <span>✓ 系统检查：已通过 | ⏳ 操作者：待确认</span>
                      )}
                      {item.passed === false && (
                        <span>✗ 系统检查：未通过</span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* 详细信息 */}
                {viewingDetail === item.id && item.detailData && (
                  <div className="mt-4 ml-8 p-4 bg-black-1 rounded-lg border border-gray-700">
                    {renderDetailContent(item.id, item.detailData, chainId)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 border-t border-gray-700 pt-4">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleApprove}
              disabled={!allPassedAndConfirmed}
              className="px-6 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              title={
                !allPassedAndConfirmed
                  ? "请确保所有审核项都已通过、已查看详情并已手动确认"
                  : "所有审核项已确认，可以审核通过"
              }
            >
              确认通过
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 渲染详细信息内容
function renderDetailContent(itemId: string, data: any, chainId: number) {
  switch (itemId) {
    case "total-amount":
      return (
        <div className="space-y-2">
          <div className="text-sm text-gray-400">
            <span className="text-white">存入金额：</span>
            {data.depositAmount.toFixed(2)} USDT
          </div>
          <div className="text-sm text-gray-400">
            <span className="text-white">最终目标总额：</span>
            {data.totalFinalAmount.toFixed(2)} USDT
          </div>
          <div className="text-sm text-gray-400">
            <span className="text-white">差额：</span>
            <span className={data.difference < 0.01 ? "text-green-400" : "text-red-400"}>
              {data.difference.toFixed(2)} USDT
            </span>
          </div>
        </div>
      )

    case "intermediate-addresses":
      return (
        <div className="space-y-3">
          {data.validAddresses.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-green-400 mb-2">
                有效地址 ({data.validAddresses.length} 个)
              </div>
              <div className="space-y-1">
                {data.validAddresses.map((addr: any, idx: number) => (
                  <div key={idx} className="text-sm text-gray-300">
                    <AddressDisplay address={addr.address} chainId={chainId} showIndex={addr.index !== null} addressIndex={addr.index} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.invalidAddresses.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-400 mb-2">
                无效地址 ({data.invalidAddresses.length} 个)
              </div>
              <div className="space-y-1">
                {data.invalidAddresses.map((addr: string | { address: string; index?: number | null }, idx: number) => {
                  const address = typeof addr === 'string' ? addr : addr.address
                  const index = typeof addr === 'string' ? null : (addr.index ?? null)
                  return (
                    <div key={idx} className="text-sm text-gray-300">
                      <AddressDisplay 
                        address={address} 
                        chainId={chainId}
                        showIndex={index !== null && index !== undefined}
                        addressIndex={index}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )

    case "final-addresses-not-in-pool":
    case "final-addresses-in-pool":
      return (
        <div className="space-y-3">
          {data.validAddresses.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-green-400 mb-2">
                有效地址 ({data.validAddresses.length} 个)
              </div>
              <div className="space-y-1">
                {data.validAddresses.map((addr: any, idx: number) => (
                  <div key={idx} className="text-sm text-gray-300">
                    <AddressDisplay 
                      address={addr.address} 
                      chainId={chainId} 
                      showIndex={addr.index !== null && addr.index !== undefined}
                      addressIndex={addr.index}
                    />
                    <span className="ml-2 text-gray-500">({addr.amount.toFixed(2)} USDT)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.invalidAddresses.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-400 mb-2">
                无效地址 ({data.invalidAddresses.length} 个)
              </div>
              <div className="space-y-1">
                {data.invalidAddresses.map((addr: any, idx: number) => (
                  <div key={idx} className="text-sm text-gray-300">
                    <AddressDisplay 
                      address={addr.address} 
                      chainId={chainId}
                      showIndex={addr.index !== null && addr.index !== undefined}
                      addressIndex={addr.index}
                    />
                    <span className="ml-2 text-gray-500">({addr.amount.toFixed(2)} USDT)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )

    case "final-addresses-not-fee":
      return (
        <div className="space-y-3">
          {data.validAddresses.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-green-400 mb-2">
                有效地址 ({data.validAddresses.length} 个)
              </div>
              <div className="space-y-1">
                {data.validAddresses.map((addr: any, idx: number) => (
                  <div key={idx} className="text-sm text-gray-300">
                    <AddressDisplay 
                      address={addr.address} 
                      chainId={chainId}
                      showIndex={addr.index !== null && addr.index !== undefined}
                      addressIndex={addr.index}
                    />
                    <span className="ml-2 text-gray-500">({addr.amount.toFixed(2)} USDT)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.invalidAddresses.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-400 mb-2">
                无效地址（是手续费地址） ({data.invalidAddresses.length} 个)
              </div>
              <div className="space-y-1">
                {data.invalidAddresses.map((addr: any, idx: number) => (
                  <div key={idx} className="text-sm text-gray-300">
                    <AddressDisplay 
                      address={addr.address} 
                      chainId={chainId}
                      showIndex={addr.index !== null && addr.index !== undefined}
                      addressIndex={addr.index}
                    />
                    <span className="ml-2 text-gray-500">({addr.amount.toFixed(2)} USDT)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )

    case "fee-allocation":
      // 安全检查：确保所有必需的字段都存在
      const totalAmount = data?.depositAmount ?? data?.totalAmount ?? 0
      const expectedFee = data?.expectedFee ?? 0
      const feeAmount = data?.feeAmount ?? 0
      const feePassed = data?.feePassed ?? false
      const issues = data?.issues ?? []
      
      return (
        <div className="space-y-2">
          <div className="text-sm text-gray-400">
            <span className="text-white">总金额：</span>
            {totalAmount.toFixed(2)} USDT
          </div>
          <div className="text-sm text-gray-400">
            <span className="text-white">期望手续费（4%）：</span>
            {expectedFee.toFixed(2)} USDT
          </div>
          <div className="text-sm text-gray-400">
            <span className="text-white">实际手续费：</span>
            <span className={feePassed ? "text-green-400" : "text-red-400"}>
              {feeAmount.toFixed(2)} USDT
            </span>
          </div>
          {data?.feeAllocationAddress && (
            <div className="text-sm text-gray-400">
              <span className="text-white">手续费地址：</span>
              <AddressDisplay 
                address={data.feeAllocationAddress} 
                chainId={chainId}
                showIndex={data.feeAllocationIndex !== null && data.feeAllocationIndex !== undefined}
                addressIndex={data.feeAllocationIndex}
              />
            </div>
          )}
          {issues.length > 0 && (
            <div className="mt-2">
              <div className="text-sm font-semibold text-red-400 mb-1">问题：</div>
              <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
                {issues.map((issue: string, idx: number) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )

    default:
      return <div className="text-sm text-gray-400">暂无详细信息</div>
  }
}
