"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/components/providers/toast-provider"
import { TaskList } from "@/components/designer/task-list"
import { useSignerDepositVault } from "@/lib/hooks/use-signer-deposit-vault"
import { useSDKStore } from "@/lib/stores/sdk-store"
import { TaskOperationConfirmDialog } from "@/components/task/task-operation-confirm-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { type Task } from "@/lib/utils/task-manager"
import { useRouter } from "next/navigation"

function TasksPage() {
  const { showError, showSuccess, showWarning } = useToast()
  const router = useRouter()
  const [chainId] = useState(714)
  const [vaultAddress, setVaultAddress] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("all") // 选中的策略ID
  const [deletingStrategyId, setDeletingStrategyId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const {
    deposit: signerDeposit,
    claim: signerClaim,
    loading: signerLoading,
    signerAddress,
  } = useSignerDepositVault(chainId)
  
  const sdkStore = useSDKStore()
  
  // 操作确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    task: Task
    operationType: 'deposit' | 'claim' | 'enclave_deposit' | 'enclave_withdraw' | 'allocation'
  } | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  // 获取 Vault 地址
  useEffect(() => {
    const fetchVaultAddress = async () => {
      try {
        const vaultAddr = process.env.NEXT_PUBLIC_DEPOSIT_VAULT_714 || null
        setVaultAddress(vaultAddr)
      } catch (error) {
        console.error('获取 Vault 地址失败:', error)
      }
    }
    fetchVaultAddress()
  }, [chainId])

  // 从数据库加载任务
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const { tasksAPI } = await import('@/lib/api/client')
        const data = await tasksAPI.get(chainId)
        setTasks(data)
      } catch (e) {
        console.error("加载任务失败:", e)
      }
    }
    loadTasks()
  }, [chainId])

  // 获取所有策略ID列表（包括 undefined 的任务，可能没有 strategyId）
  const strategyIds = Array.from(new Set(tasks.map(t => t.strategyId).filter(Boolean)))
  
  // 根据策略ID筛选任务
  const filteredTasks = selectedStrategyId === "all" 
    ? tasks 
    : tasks.filter(t => t.strategyId === selectedStrategyId)
  
  // 调试：输出策略ID信息
  useEffect(() => {
    if (tasks.length > 0) {
      console.log("任务列表:", tasks.length, "个任务")
      console.log("策略ID列表:", strategyIds)
      console.log("任务示例:", tasks[0])
    }
  }, [tasks, strategyIds])
  
  // 删除策略
  const handleDeleteStrategy = async () => {
    if (!selectedStrategyId || selectedStrategyId === "all") {
      showWarning("请先选择一个策略")
      return
    }
    
    try {
      setDeletingStrategyId(selectedStrategyId)
      
      // 检查是否可以删除
      const { strategiesAPI } = await import('@/lib/api/client')
      const checkResult = await strategiesAPI.checkDelete(selectedStrategyId)
      if (!checkResult.canDelete) {
        showError(checkResult.reason || "策略包含已开始的任务，无法删除")
        setDeletingStrategyId(null)
        return
      }
      
      // 显示确认对话框
      setShowDeleteConfirm(true)
    } catch (error: any) {
      showError(`检查删除条件失败: ${error.message}`)
      setDeletingStrategyId(null)
    }
  }

  // 确认删除策略
  const handleConfirmDeleteStrategy = async () => {
    if (!selectedStrategyId || selectedStrategyId === "all") {
      return
    }
    
    try {
      setDeletingStrategyId(selectedStrategyId)
      
      // 执行删除
      const { strategiesAPI } = await import('@/lib/api/client')
      await strategiesAPI.delete(selectedStrategyId)
      
      // 重新加载任务
      const { tasksAPI } = await import('@/lib/api/client')
      const tasksData = await tasksAPI.get(chainId)
      setTasks(tasksData)
      
      // 切换到"全部"
      setSelectedStrategyId("all")
      
      showSuccess("策略删除成功")
      setShowDeleteConfirm(false)
    } catch (error: any) {
      showError(`删除失败: ${error.message}`)
    } finally {
      setDeletingStrategyId(null)
    }
  }

  // 获取 USDT 地址
  const getUSDTAddress = (chainId: number): string | null => {
    const USDT_ADDRESSES: Record<number, string> = {
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      56: '0x55d398326f99059fF775485246999027B3197955',
      714: '0x55d398326f99059fF775485246999027B3197955',
    }
    return USDT_ADDRESSES[chainId] || null
  }

  // 更新任务
  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    try {
      const { tasksAPI } = await import('@/lib/api/client')
      await tasksAPI.update(taskId, updates)
      
      // 更新本地状态
      const updated = tasks.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      )
      setTasks(updated)
    } catch (error: any) {
      console.error("更新任务失败:", error)
      showError(`更新任务失败: ${error.message}`)
    }
  }

  // 完成任务
  const handleTaskComplete = (taskId: string) => {
    handleTaskUpdate(taskId, {
      status: "completed",
      completedAt: Math.floor(Date.now() / 1000),
    })
  }


  // 开始任务 - 显示确认弹窗
  const handleTaskStart = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    
    // 确定操作类型
    let operationType: 'deposit' | 'claim' | 'enclave_deposit' | 'enclave_withdraw' | 'allocation' = 'deposit'
    
    if (task.type === 'deposit') {
      operationType = 'deposit'
    } else if (task.type === 'claim') {
      operationType = 'claim'
    } else if (task.type === 'enclave_deposit') {
      // 检查是否已经存入（有commitment），如果有则显示allocation确认，否则显示deposit确认
      if (task.commitment && task.commitment !== '待生成') {
        operationType = 'allocation'
      } else {
        operationType = 'enclave_deposit'
      }
    } else if (task.type === 'enclave_withdraw') {
      operationType = 'enclave_withdraw'
    }
    
    setConfirmDialog({ task, operationType })
  }
  
  // 关闭确认弹窗
  const handleCloseConfirmDialog = () => {
    if (!isExecuting) {
      setConfirmDialog(null)
    }
  }
  
  // 确认执行操作
  const handleConfirmExecute = async () => {
    if (!confirmDialog) return
    
    const { task, operationType } = confirmDialog
    
    // 如果是allocation操作，需要从enclave_deposit任务中获取信息
    if (operationType === 'allocation' && task.type === 'enclave_deposit') {
      await handleExecuteAllocation(task)
    } else {
      await handleExecuteTask(task, operationType)
    }
    
    setConfirmDialog(null)
  }

  // 执行Allocation分配
  const handleExecuteAllocation = async (task: Task) => {
    if (!sdkStore.sdk) {
      showError("SDK 未初始化")
      return
    }
    
    if (!task.commitment || task.commitment === '待生成') {
      showError("Commitment 未生成，请先完成存入操作")
      return
    }
    
    if (!task.allocations || task.allocations.length === 0) {
      showError("分配方案未配置")
      return
    }
    
    if (!task.intendedRecipients || task.intendedRecipients.length === 0) {
      showError("目标地址未配置")
      return
    }
    
    setIsExecuting(true)
    try {
      handleTaskUpdate(task.id, { status: "in_progress" })
      
      const sdk = sdkStore.sdk
      
      // 为每个目标地址创建Allocation
      const allocationPromises = task.intendedRecipients.map(async (recipient) => {
        const address = recipient.address || recipient.recipient || ''
        const allocationIndices = recipient.allocationIndices || []
        
        // 计算该地址对应的总金额（可能对应多个allocation）
        const totalAmount = allocationIndices.reduce((sum, idx) => {
          const alloc = task.allocations?.[idx]
          return sum + (alloc?.amount || 0)
        }, 0)
        
        if (totalAmount === 0) {
          console.warn(`地址 ${address} 的分配金额为0，跳过`)
          return null
        }
        
        try {
          // 使用SDK创建Allocation
          const allocation = await sdk.createAllocation({
            commitment: task.commitment!,
            recipient: address,
            amount: totalAmount,
            currency: 'USDT',
          })
          
          return allocation
        } catch (error: any) {
          console.error(`创建Allocation失败 (${address}):`, error)
          throw error
        }
      })
      
      const allocations = await Promise.all(allocationPromises)
      const successfulAllocations = allocations.filter(Boolean)
      
      showSuccess(`成功创建 ${successfulAllocations.length} 个 Allocation`)
      
      // Allocation分配完成后，任务才真正完成
      handleTaskUpdate(task.id, {
        status: "completed",
        completedAt: Math.floor(Date.now() / 1000),
        notes: `Commitment: ${task.commitment}，成功创建 ${successfulAllocations.length} 个 Allocation`,
      })
    } catch (error: any) {
      showError(`Allocation 分配失败: ${error.message}`)
      handleTaskUpdate(task.id, { status: "pending" })
    } finally {
      setIsExecuting(false)
    }
  }
  
  // 执行任务
  const handleExecuteTask = async (task: Task) => {
    if (!vaultAddress) {
      showError("Vault 地址未配置")
      return
    }

    if (!signerAddress) {
      showError("Signer 未初始化，请检查环境变量 NEXT_PUBLIC_PRIVATE_KEY")
      return
    }

    setIsExecuting(true)
    try {
      handleTaskUpdate(task.id, { status: "in_progress" })

      if (task.type === "deposit") {
        // 阶段1: Deposit - 使用 intendedRecipients
        const intendedRecipients = task.intendedRecipients || [{
          recipient: task.targetAddress,
          amount: task.amount.toString(),
        }]
        
        const result = await signerDeposit({
          vaultAddress,
          tokenAddress: getUSDTAddress(chainId)!,
          amount: task.amount.toString(),
          intendedRecipients: intendedRecipients.map(r => ({
            recipient: r.recipient,
            amount: r.amount.toString(),
          })),
        })

        showSuccess(`存入成功: ${result.txHash}`)
        
        const depositId = result.receipt?.logs?.[0]?.topics?.[1] || "待解析"
        
        handleTaskUpdate(task.id, {
          status: "completed",
          completedAt: Math.floor(Date.now() / 1000),
          notes: `DepositId: ${depositId}, TxHash: ${result.txHash}`,
          depositId,
        })
      } else if (task.type === "claim") {
        // 阶段2: Claim - 从 Deposit Vault 提取
        const relatedTask = tasks.find((t) => t.id === task.relatedTaskId)
        if (!relatedTask) {
          showError("未找到关联的存入任务")
          return
        }
        
        const depositId = relatedTask.depositId || relatedTask.notes?.match(/DepositId:\s*(\w+)/)?.[1]
        
        if (!depositId) {
          showError("未找到 depositId，请先完成存入任务")
          return
        }

        const result = await signerClaim(vaultAddress, depositId)
        showSuccess(`提取成功: ${result.txHash}`)
        
        handleTaskUpdate(task.id, {
          status: "completed",
          completedAt: Math.floor(Date.now() / 1000),
          notes: `TxHash: ${result.txHash}`,
        })
      } else if (task.type === "enclave_deposit") {
        // 阶段3: Enclave Deposit - 通过 SDK 存入隐私池
        if (!sdkStore.sdk) {
          throw new Error("SDK 未初始化")
        }
        
        const sdk = sdkStore.sdk
        
        // 创建Commitment（存入隐私池）
        const commitment = await sdk.createCommitment({
          amount: task.amount,
          currency: 'USDT',
          sourceAddress: task.sourceAddress,
        })
        
        showSuccess(`存入隐私池成功: Commitment ${commitment.id}`)
        
        // 存入完成后，任务状态保持pending，等待Allocation分配
        // 用户需要再次点击"开始"按钮进行Allocation分配
        handleTaskUpdate(task.id, {
          status: "pending", // 保持pending状态，等待Allocation分配
          notes: `Commitment: ${commitment.id}，等待Allocation分配`,
          commitment: commitment.id,
        })
      } else if (task.type === "enclave_withdraw") {
        // 阶段4: Enclave Withdraw - 从隐私池提取
        if (!sdkStore.sdk) {
          throw new Error("SDK 未初始化")
        }
        
        // 需要找到关联的enclave_deposit任务以获取commitment
        const relatedDepositTask = tasks.find((t) => t.id === task.relatedTaskId)
        if (!relatedDepositTask || !relatedDepositTask.commitment) {
          throw new Error("未找到关联的存入任务或Commitment")
        }
        
        const sdk = sdkStore.sdk
        
        // 创建Withdrawal（从隐私池提取）
        const withdrawal = await sdk.createWithdrawal({
          commitment: relatedDepositTask.commitment,
          recipient: task.targetAddress,
          amount: task.amount,
          currency: 'USDT',
        })
        
        showSuccess(`从隐私池提取成功: Withdrawal ${withdrawal.id}`)
        
        handleTaskUpdate(task.id, {
          status: "completed",
          completedAt: Math.floor(Date.now() / 1000),
          notes: `Withdrawal: ${withdrawal.id}`,
        })
      }
    } catch (error: any) {
      showError(`执行失败: ${error.message}`)
      handleTaskUpdate(task.id, { status: "pending" })
    } finally {
      setIsExecuting(false)
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="min-h-screen bg-base p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">任务列表</h1>
          <div className="bg-black-2 rounded-lg p-8 text-center">
            <p className="text-gray-400 mb-4">暂无任务</p>
            <button
              onClick={() => router.push("/designer")}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80"
            >
              前往任务计划生成策略
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">任务页面</h1>
        
        {/* 策略ID筛选 - 始终显示 */}
        <div className="mb-6 p-4 bg-black-2 rounded-lg border border-black-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-semibold text-gray-300 whitespace-nowrap">策略筛选：</label>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className="px-4 py-2 bg-black-3 border border-gray-700 rounded-lg text-white text-sm min-w-[200px]"
            >
              <option value="all">全部策略 ({tasks.length} 个任务)</option>
              {strategyIds.length > 0 ? (
                strategyIds.map((strategyId) => {
                  const count = tasks.filter(t => t.strategyId === strategyId).length
                  const completed = tasks.filter(t => t.strategyId === strategyId && t.status === "completed").length
                  return (
                    <option key={strategyId} value={strategyId}>
                      {strategyId.slice(0, 16)}... ({completed}/{count} 完成)
                    </option>
                  )
                })
              ) : (
                <option value="all" disabled>暂无策略</option>
              )}
            </select>
              {selectedStrategyId !== "all" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">当前策略:</span>
                  <span className="text-white font-mono text-xs">{selectedStrategyId}</span>
                  <span className="text-gray-500">({filteredTasks.length} 个任务)</span>
                  {filteredTasks.length > 0 && filteredTasks.every(t => t.status === 'pending' || t.status === 'ready') && (
                    <button
                      onClick={handleDeleteStrategy}
                      disabled={deletingStrategyId === selectedStrategyId}
                      className="ml-2 px-2 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingStrategyId === selectedStrategyId ? '删除中...' : '删除'}
                    </button>
                  )}
                </div>
              )}
          </div>
        </div>
        
        <TaskList
          tasks={filteredTasks}
          onTaskUpdate={handleTaskUpdate}
          onTaskComplete={handleTaskComplete}
          onTaskStart={handleTaskStart}
        />
      </div>
      
      {/* 操作确认弹窗 */}
      {confirmDialog && (
        <TaskOperationConfirmDialog
          task={confirmDialog.task}
          isOpen={!!confirmDialog}
          onClose={handleCloseConfirmDialog}
          onConfirm={handleConfirmExecute}
          operationType={confirmDialog.operationType}
          isLoading={isExecuting}
          allTasks={tasks}
        />
      )}

      {/* 删除策略确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除策略"
        message={`确定要删除策略 ${selectedStrategyId !== "all" ? selectedStrategyId.slice(0, 20) + "..." : ""} 及其所有任务吗？此操作不可恢复。`}
        confirmText="确定删除"
        cancelText="取消"
        confirmButtonClass="bg-red-500 text-white hover:bg-red-600"
        onConfirm={handleConfirmDeleteStrategy}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setDeletingStrategyId(null)
        }}
      />
    </div>
  )
}

export default TasksPage
