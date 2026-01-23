"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/components/toast"
import { AddressInput } from "@/components/address-input"
import { TaskList } from "@/components/task-list"
import {
  AMOUNT_TOLERANCE,
  TIME_TOLERANCE,
  MIN_TIME_INTERVAL,
  validateAllStrategies,
  generateMismatchedAmount,
  generateWithdrawTime,
  type StrategyValidation,
  type TransactionPlan as StrategyTransactionPlan,
} from "@/lib/strategy-utils"
import {
  generateTasksFromPlan,
  type Task,
} from "@/lib/task-manager"
import {
  requestNotificationPermission,
  startTaskMonitoring,
} from "@/lib/task-notifier"

// 常量定义
const AMOUNT_TOLERANCE = 0.001 // ETH/BSC 金额容差
const TIME_TOLERANCE = 86400 // 24小时（秒）
const MIN_TIME_INTERVAL = TIME_TOLERANCE + 1 // 最小时间间隔（> 24小时）

// 类型定义
interface WhiteUAddress {
  id: string
  address: string
  chainId: number
  label?: string
  balance?: string
  isHighRisk?: boolean // 是否为高风险地址
}

interface AddressRequirement {
  addressIndex: number
  totalTransactions: number
  transactionAmounts: number[]
  targetAddress?: string // 目标地址
  isHighRisk?: boolean // 是否为高风险地址需求
}

interface StrategyConfig {
  // 策略1：金额不匹配
  enableAmountMismatch: boolean
  minAmountDifference: number // 最小金额差异（默认 > 0.001）
  
  // 策略2：时间延长
  enableTimeExtension: boolean
  minTimeInterval: number // 最小时间间隔（秒，默认 > 24小时）
  
  // 策略3：正常交易交叉
  enableNormalTransactionMix: boolean
  normalTransactionRatio: number // 正常交易占比（默认 > 80%）
  
  // 策略4：风险控制
  enableRiskControl: boolean
  maxHighRiskRatio: number // 最大高风险交易占比（默认 < 20%）
}

interface OperationPlan {
  planId: string
  totalAmount: number
  totalTransactions: number
  sourceAddresses: number
  transactions: TransactionPlan[]
  generatedAt: string
  strategyConfig: StrategyConfig
  strategyValidation: StrategyValidation
}

interface TransactionPlan {
  id: string
  sourceAddress: string
  sourceAddressLabel?: string
  amount: number
  targetAddress: string
  chain: string
  chainId: number
  status: "pending" | "preprocess" | "enclave" | "completed"
  isHighRisk: boolean // 是否为高风险交易
  depositTime?: number // 存入时间戳（秒）
  withdrawTime?: number // 提取时间戳（秒）
  relatedDepositId?: string // 关联的存入交易ID
  amountDifference?: number // 与关联存入的金额差异
  timeInterval?: number // 与关联存入的时间间隔（秒）
  steps: {
    step: "preprocess" | "enclave" | "transfer"
    status: "pending" | "processing" | "completed" | "failed"
    vaultAddress?: string
    targetAddress?: string
  }[]
}

interface StrategyValidation {
  amountMismatch: {
    passed: boolean
    failedCount: number
    details: Array<{ txId: string; difference: number; reason: string }>
  }
  timeExtension: {
    passed: boolean
    failedCount: number
    details: Array<{ txId: string; interval: number; reason: string }>
  }
  normalTransactionMix: {
    passed: boolean
    highRiskRatio: number
    normalRatio: number
    reason: string
  }
  riskControl: {
    passed: boolean
    highRiskCount: number
    totalCount: number
    highRiskRatio: number
    reason: string
  }
}

function DesignerPage() {
  const { showError, showWarning, showSuccess } = useToast()
  const [chainId] = useState(195) // 默认 TRON

  // 白U地址列表
  const [whiteUAddresses, setWhiteUAddresses] = useState<WhiteUAddress[]>([])
  const [newAddress, setNewAddress] = useState("")
  const [newAddressLabel, setNewAddressLabel] = useState("")
  const [newAddressChainId, setNewAddressChainId] = useState(chainId || 195)

  // 输入参数
  const [totalAmountA, setTotalAmountA] = useState("")
  const [addressCountM, setAddressCountM] = useState("")
  const [requirements, setRequirements] = useState<AddressRequirement[]>([])

  // 策略配置
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>({
    enableAmountMismatch: true,
    minAmountDifference: AMOUNT_TOLERANCE + 0.0001, // 默认 > 0.001
    enableTimeExtension: true,
    minTimeInterval: MIN_TIME_INTERVAL, // 默认 > 24小时
    enableNormalTransactionMix: true,
    normalTransactionRatio: 0.8, // 默认 > 80%
    enableRiskControl: true,
    maxHighRiskRatio: 0.2, // 默认 < 20%
  })

  // 操作计划
  const [operationPlan, setOperationPlan] = useState<OperationPlan | null>(null)
  
  // 任务管理
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeTab, setActiveTab] = useState<"plan" | "tasks">("plan")

  // 从本地存储加载白U地址
  useEffect(() => {
    const saved = localStorage.getItem("whiteUAddresses")
    if (saved) {
      try {
        setWhiteUAddresses(JSON.parse(saved))
      } catch (e) {
        console.error("加载白U地址失败:", e)
      }
    }
  }, [])

  // 保存白U地址到本地存储
  const saveWhiteUAddresses = (addresses: WhiteUAddress[]) => {
    localStorage.setItem("whiteUAddresses", JSON.stringify(addresses))
    setWhiteUAddresses(addresses)
  }

  // 添加白U地址
  const handleAddAddress = () => {
    if (!newAddress.trim()) {
      showWarning("请输入地址")
      return
    }

    const exists = whiteUAddresses.some(
      (addr) => addr.address.toLowerCase() === newAddress.toLowerCase()
    )
    if (exists) {
      showWarning("地址已存在")
      return
    }

    const newAddr: WhiteUAddress = {
      id: Date.now().toString(),
      address: newAddress.trim(),
      chainId: newAddressChainId,
      label: newAddressLabel.trim() || undefined,
    }

    saveWhiteUAddresses([...whiteUAddresses, newAddr])
    setNewAddress("")
    setNewAddressLabel("")
    showSuccess("地址已添加")
  }

  // 删除白U地址
  const handleDeleteAddress = (id: string) => {
    saveWhiteUAddresses(whiteUAddresses.filter((addr) => addr.id !== id))
    showSuccess("地址已删除")
  }

  // 添加地址需求
  const handleAddRequirement = () => {
    const index = requirements.length
    setRequirements([
      ...requirements,
      {
        addressIndex: index,
        totalTransactions: 0,
        transactionAmounts: [],
      },
    ])
  }

  // 更新地址需求
  const handleUpdateRequirement = (
    index: number,
    field: keyof AddressRequirement,
    value: any
  ) => {
    const updated = [...requirements]
    if (field === "transactionAmounts") {
      updated[index].transactionAmounts = value
      updated[index].totalTransactions = value.length
    } else {
      ;(updated[index] as any)[field] = value
    }
    setRequirements(updated)
  }

  // 添加交易金额
  const handleAddTransactionAmount = (reqIndex: number, amount: string) => {
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      showWarning("请输入有效的金额")
      return
    }

    const updated = [...requirements]
    updated[reqIndex].transactionAmounts.push(numAmount)
    updated[reqIndex].totalTransactions = updated[reqIndex].transactionAmounts.length
    setRequirements(updated)
  }

  // 删除交易金额
  const handleDeleteTransactionAmount = (reqIndex: number, txIndex: number) => {
    const updated = [...requirements]
    updated[reqIndex].transactionAmounts.splice(txIndex, 1)
    updated[reqIndex].totalTransactions = updated[reqIndex].transactionAmounts.length
    setRequirements(updated)
  }

  // 生成操作计划
  const handleGeneratePlan = () => {
    // 验证输入
    const A = parseFloat(totalAmountA)
    const M = parseInt(addressCountM)

    if (isNaN(A) || A <= 0) {
      showError("请输入有效的总量 A")
      return
    }

    if (isNaN(M) || M <= 0) {
      showError("请输入有效的地址数 M")
      return
    }

    if (requirements.length === 0) {
      showError("请至少添加一个地址需求")
      return
    }

    // 计算总需求
    const totalRequired = requirements.reduce(
      (sum, req) => sum + req.transactionAmounts.reduce((s, a) => s + a, 0),
      0
    )

    if (Math.abs(totalRequired - A) > 0.01) {
      showWarning(
        `需求总量 (${totalRequired}) 与输入总量 A (${A}) 不一致，将使用需求总量`
      )
    }

    // 计算所需的白U总量（A * 5）
    const requiredWhiteUAmount = A * 5

    // 计算所需的总笔数（X * 3，其中 X 是所有地址的总笔数）
    const totalX = requirements.reduce((sum, req) => sum + req.totalTransactions, 0)
    const requiredTransactionCount = totalX * 3

    // 计算所需的地址数（M * 2）
    const requiredAddressCount = M * 2

    // 检查白U地址是否足够
    if (whiteUAddresses.length < requiredAddressCount) {
      showError(
        `白U地址不足，需要至少 ${requiredAddressCount} 个地址，当前只有 ${whiteUAddresses.length} 个`
      )
      return
    }

    // 生成交易计划（应用策略）
    let transactionId = 1

    // 应用策略：生成存入和提取交易对
    const depositTransactions: TransactionPlan[] = []
    const withdrawTransactions: TransactionPlan[] = []
    const normalTransactions: TransactionPlan[] = [] // 正常交易（用于交叉）

    const baseTime = Math.floor(Date.now() / 1000) // 当前时间戳（秒）

    // 1. 生成存入交易（高风险）
    for (let reqIndex = 0; reqIndex < requirements.length; reqIndex++) {
      const req = requirements[reqIndex]
      const isHighRisk = req.isHighRisk !== false // 默认为高风险

      for (let txIndex = 0; txIndex < req.transactionAmounts.length; txIndex++) {
        const depositAmount = req.transactionAmounts[txIndex]
        const sourceAddrIndex = Math.floor(Math.random() * whiteUAddresses.length)
        const sourceAddr = whiteUAddresses[sourceAddrIndex]

        // 存入时间：第1天开始，随机分布
        const depositTime = baseTime + Math.random() * 86400 // 第1天内随机

        const depositTx: TransactionPlan = {
          id: `deposit-${transactionId++}`,
          sourceAddress: sourceAddr.address,
          sourceAddressLabel: sourceAddr.label,
          amount: depositAmount,
          targetAddress: req.targetAddress || `target-${reqIndex}-${txIndex}`,
          chain: getChainName(sourceAddr.chainId),
          chainId: sourceAddr.chainId,
          status: "pending",
          isHighRisk,
          depositTime,
          steps: [
            {
              step: "preprocess",
              status: "pending",
              vaultAddress: "待获取",
            },
            {
              step: "enclave",
              status: "pending",
            },
            {
              step: "transfer",
              status: "pending",
              targetAddress: req.targetAddress || `target-${reqIndex}-${txIndex}`,
            },
          ],
        }

        depositTransactions.push(depositTx)

        // 2. 生成对应的提取交易（应用策略）
        if (strategyConfig.enableAmountMismatch) {
          // 策略1：金额不匹配
          const withdrawAmount = generateMismatchedAmount(
            depositAmount,
            strategyConfig.minAmountDifference
          )

          // 策略2：时间延长
          const withdrawTime = generateWithdrawTime(
            depositTime,
            strategyConfig.minTimeInterval
          )

          const withdrawTx: TransactionPlan = {
            id: `withdraw-${transactionId++}`,
            sourceAddress: sourceAddr.address,
            sourceAddressLabel: sourceAddr.label,
            amount: withdrawAmount,
            targetAddress: req.targetAddress || `target-${reqIndex}-${txIndex}`,
            chain: getChainName(sourceAddr.chainId),
            chainId: sourceAddr.chainId,
            status: "pending",
            isHighRisk,
            depositTime,
            withdrawTime,
            relatedDepositId: depositTx.id,
            amountDifference: Math.abs(withdrawAmount - depositAmount),
            timeInterval: withdrawTime - depositTime,
            steps: [
              {
                step: "preprocess",
                status: "pending",
                vaultAddress: "待获取",
              },
              {
                step: "enclave",
                status: "pending",
              },
              {
                step: "transfer",
                status: "pending",
                targetAddress: req.targetAddress || `target-${reqIndex}-${txIndex}`,
              },
            ],
          }

          withdrawTransactions.push(withdrawTx)
        }
      }
    }

    // 3. 生成正常交易（用于交叉和稀释高风险交易）
    // 计算需要的正常交易数量
    const highRiskCount = depositTransactions.length + withdrawTransactions.length
    const requiredNormalCount = Math.ceil(
      (highRiskCount * strategyConfig.normalTransactionRatio) /
        (1 - strategyConfig.normalTransactionRatio)
    )

    for (let i = 0; i < requiredNormalCount; i++) {
      const sourceAddrIndex = Math.floor(Math.random() * whiteUAddresses.length)
      const sourceAddr = whiteUAddresses[sourceAddrIndex]
      const normalAmount = 1000 + Math.random() * 9000 // 1000-10000 USDT
      const normalTime = baseTime + Math.random() * 86400 * 3 // 3天内随机

      const normalTx: TransactionPlan = {
        id: `normal-${transactionId++}`,
        sourceAddress: sourceAddr.address,
        sourceAddressLabel: sourceAddr.label,
        amount: normalAmount,
        targetAddress: `normal-target-${i}`,
        chain: getChainName(sourceAddr.chainId),
        chainId: sourceAddr.chainId,
        status: "pending",
        isHighRisk: false,
        depositTime: normalTime,
        steps: [
          {
            step: "preprocess",
            status: "pending",
            vaultAddress: "待获取",
          },
          {
            step: "enclave",
            status: "pending",
          },
          {
            step: "transfer",
            status: "pending",
            targetAddress: `normal-target-${i}`,
          },
        ],
      }

      normalTransactions.push(normalTx)
    }

    // 4. 合并所有交易并按时间排序（实现时间交叉）
    const allTransactions = [
      ...depositTransactions,
      ...withdrawTransactions,
      ...normalTransactions,
    ].sort((a, b) => {
      const timeA = a.depositTime || a.withdrawTime || 0
      const timeB = b.depositTime || b.withdrawTime || 0
      return timeA - timeB
    })

    // 5. 执行策略验证
    const strategyValidation = validateAllStrategies(
      allTransactions as StrategyTransactionPlan[],
      strategyConfig
    )

    const plan: OperationPlan = {
      planId: `plan-${Date.now()}`,
      totalAmount: allTransactions.reduce((sum, tx) => sum + tx.amount, 0),
      totalTransactions: allTransactions.length,
      sourceAddresses: new Set(allTransactions.map((tx) => tx.sourceAddress)).size,
      transactions: allTransactions,
      generatedAt: new Date().toISOString(),
      strategyConfig,
      strategyValidation,
    }

    setOperationPlan(plan)

    // 生成任务列表
    const generatedTasks = generateTasksFromPlan(plan, baseTime)
    setTasks(generatedTasks)
    
    // 保存任务到本地存储
    localStorage.setItem(`tasks-${plan.planId}`, JSON.stringify(generatedTasks))

    // 显示验证结果
    const allPassed =
      strategyValidation.amountMismatch.passed &&
      strategyValidation.timeExtension.passed &&
      strategyValidation.normalTransactionMix.passed &&
      strategyValidation.riskControl.passed

    if (allPassed) {
      showSuccess("操作计划生成成功，所有策略验证通过 ✅")
    } else {
      showWarning("操作计划已生成，但部分策略验证未通过，请检查详情 ⚠️")
    }
    
    // 切换到任务标签页
    setActiveTab("tasks")
  }
  
  // 从本地存储加载任务
  useEffect(() => {
    if (operationPlan) {
      const saved = localStorage.getItem(`tasks-${operationPlan.planId}`)
      if (saved) {
        try {
          setTasks(JSON.parse(saved))
        } catch (e) {
          console.error("加载任务失败:", e)
        }
      }
    }
  }, [operationPlan])
  
  // 请求通知权限并启动任务监控
  useEffect(() => {
    if (tasks.length === 0) return

    let cleanup: (() => void) | null = null

    const setupMonitoring = async () => {
      // 请求通知权限
      await requestNotificationPermission()

      // 启动任务监控
      cleanup = startTaskMonitoring(
        tasks,
        (task) => {
          showSuccess(`任务就绪: ${task.title}`)
          // 更新任务状态为就绪
          handleTaskUpdate(task.id, { status: "ready" })
        },
        30000 // 每30秒检查一次
      )
    }

    setupMonitoring()

    return () => {
      if (cleanup) {
        cleanup()
      }
    }
  }, [tasks.length]) // 只在任务列表变化时重新设置
  
  // 任务操作处理函数
  const handleTaskComplete = (taskId: string) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: "completed" as const,
            completedAt: Math.floor(Date.now() / 1000),
          }
        : task
    )
    setTasks(updatedTasks)
    if (operationPlan) {
      localStorage.setItem(`tasks-${operationPlan.planId}`, JSON.stringify(updatedTasks))
    }
    showSuccess("任务已完成 ✅")
  }
  
  const handleTaskSkip = (taskId: string) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, status: "skipped" as const } : task
    )
    setTasks(updatedTasks)
    if (operationPlan) {
      localStorage.setItem(`tasks-${operationPlan.planId}`, JSON.stringify(updatedTasks))
    }
    showWarning("任务已跳过")
  }
  
  const handleTaskStart = (taskId: string) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, status: "in_progress" as const } : task
    )
    setTasks(updatedTasks)
    if (operationPlan) {
      localStorage.setItem(`tasks-${operationPlan.planId}`, JSON.stringify(updatedTasks))
    }
    showSuccess("任务已开始")
  }
  
  const handleTaskUpdate = (taskId: string, updates: Partial<Task>) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, ...updates } : task
    )
    setTasks(updatedTasks)
    if (operationPlan) {
      localStorage.setItem(`tasks-${operationPlan.planId}`, JSON.stringify(updatedTasks))
    }
  }

  // 获取链名称
  const getChainName = (chainId: number): string => {
    const chainMap: Record<number, string> = {
      1: "Ethereum",
      60: "Ethereum",
      56: "BSC",
      714: "BSC",
      195: "TRON",
    }
    return chainMap[chainId] || `Chain ${chainId}`
  }

  // 导出计划为JSON
  const handleExportJSON = () => {
    if (!operationPlan) {
      showWarning("没有可导出的计划")
      return
    }

    const dataStr = JSON.stringify(operationPlan, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `operation-plan-${operationPlan.planId}.json`
    link.click()
    URL.revokeObjectURL(url)
    showSuccess("计划已导出")
  }

  // 导出计划为CSV
  const handleExportCSV = () => {
    if (!operationPlan) {
      showWarning("没有可导出的计划")
      return
    }

    const headers = [
      "交易ID",
      "源地址",
      "源地址标签",
      "金额(USDT)",
      "目标地址",
      "链",
      "状态",
    ]
    const rows = operationPlan.transactions.map((tx) => [
      tx.id,
      tx.sourceAddress,
      tx.sourceAddressLabel || "",
      tx.amount.toString(),
      tx.targetAddress,
      tx.chain,
      tx.status,
    ])

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const dataBlob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `operation-plan-${operationPlan.planId}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showSuccess("计划已导出")
  }

  return (
    <div className="mx-auto p-5 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-main text-2xl font-bold mb-2">白U操作计划生成工具</h1>
        <p className="text-black-9 text-sm">
          用于生成和管理白U操作计划，确保资金经过预处理和Enclave隐私化处理
        </p>
      </div>

      {/* 白U地址管理 */}
      <div className="bg-black-2 rounded-[12px] p-6 mb-6">
        <h2 className="text-main text-lg font-medium mb-4">白U地址列表</h2>

        {/* 添加地址表单 */}
        <div className="mb-4 p-4 bg-black-3 rounded-[8px]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-black-9 mb-2">地址</label>
              <AddressInput
                value={newAddress}
                onChange={setNewAddress}
                chainId={newAddressChainId}
                placeholder="输入白U地址"
              />
            </div>
            <div>
              <label className="block text-sm text-black-9 mb-2">标签（可选）</label>
              <input
                type="text"
                value={newAddressLabel}
                onChange={(e) => setNewAddressLabel(e.target.value)}
                className="w-full p-3 bg-black-2 border border-black-4 rounded-[8px] text-white text-sm focus:outline-none focus:border-primary"
                placeholder="地址标签"
              />
            </div>
            <div>
              <label className="block text-sm text-black-9 mb-2">链</label>
              <select
                value={newAddressChainId}
                onChange={(e) => setNewAddressChainId(parseInt(e.target.value))}
                className="w-full p-3 bg-black-2 border border-black-4 rounded-[8px] text-white text-sm focus:outline-none focus:border-primary"
              >
                <option value={195}>TRON</option>
                <option value={56}>BSC</option>
                <option value={714}>BSC (SLIP-44)</option>
                <option value={1}>Ethereum</option>
                <option value={60}>Ethereum (SLIP-44)</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleAddAddress}
            className="px-4 py-2 bg-primary text-black text-sm font-medium rounded-[8px] hover:opacity-80"
          >
            添加地址
          </button>
        </div>

        {/* 地址列表 */}
        <div className="space-y-2">
          {whiteUAddresses.length === 0 ? (
            <p className="text-black-9 text-sm text-center py-4">暂无白U地址</p>
          ) : (
            whiteUAddresses.map((addr) => (
              <div
                key={addr.id}
                className="flex items-center justify-between p-3 bg-black-3 rounded-[8px]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-sm font-medium">
                      {addr.label || "未命名地址"}
                    </span>
                    <span className="text-black-9 text-xs">
                      ({getChainName(addr.chainId)})
                    </span>
                  </div>
                  <span className="text-black-9 text-xs font-mono">
                    {addr.address.slice(0, 10)}...{addr.address.slice(-8)}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteAddress(addr.id)}
                  className="px-3 py-1 bg-red-500/20 text-red-500 text-xs rounded-[6px] hover:bg-red-500/30"
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 策略配置 */}
      <div className="bg-black-2 rounded-[12px] p-6 mb-6">
        <h2 className="text-main text-lg font-medium mb-4">策略配置</h2>
        <p className="text-black-9 text-sm mb-4">
          配置防匹配策略，确保生成的计划不会被系统匹配算法识别
        </p>

        <div className="space-y-4">
          {/* 策略1：金额不匹配 */}
          <div className="p-4 bg-black-3 rounded-[8px]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-white text-sm font-medium">
                策略1：金额不匹配
              </label>
              <input
                type="checkbox"
                checked={strategyConfig.enableAmountMismatch}
                onChange={(e) =>
                  setStrategyConfig({
                    ...strategyConfig,
                    enableAmountMismatch: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
            </div>
            <p className="text-black-9 text-xs mb-2">
              确保提取金额与存入金额的差异 &gt; {AMOUNT_TOLERANCE} ETH/BSC
            </p>
            {strategyConfig.enableAmountMismatch && (
              <div className="mt-2">
                <label className="block text-xs text-black-9 mb-1">
                  最小金额差异
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={strategyConfig.minAmountDifference}
                  onChange={(e) =>
                    setStrategyConfig({
                      ...strategyConfig,
                      minAmountDifference: parseFloat(e.target.value) || AMOUNT_TOLERANCE + 0.0001,
                    })
                  }
                  className="w-full p-2 bg-black-2 border border-black-4 rounded-[6px] text-white text-xs"
                />
              </div>
            )}
          </div>

          {/* 策略2：时间延长 */}
          <div className="p-4 bg-black-3 rounded-[8px]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-white text-sm font-medium">
                策略2：时间延长
              </label>
              <input
                type="checkbox"
                checked={strategyConfig.enableTimeExtension}
                onChange={(e) =>
                  setStrategyConfig({
                    ...strategyConfig,
                    enableTimeExtension: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
            </div>
            <p className="text-black-9 text-xs mb-2">
              确保存入和提取的时间间隔 &gt; 24小时
            </p>
            {strategyConfig.enableTimeExtension && (
              <div className="mt-2">
                <label className="block text-xs text-black-9 mb-1">
                  最小时间间隔（小时）
                </label>
                <input
                  type="number"
                  step="1"
                  value={strategyConfig.minTimeInterval / 3600}
                  onChange={(e) =>
                    setStrategyConfig({
                      ...strategyConfig,
                      minTimeInterval: (parseFloat(e.target.value) || 24) * 3600,
                    })
                  }
                  className="w-full p-2 bg-black-2 border border-black-4 rounded-[6px] text-white text-xs"
                />
              </div>
            )}
          </div>

          {/* 策略3：正常交易交叉 */}
          <div className="p-4 bg-black-3 rounded-[8px]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-white text-sm font-medium">
                策略3：正常交易交叉
              </label>
              <input
                type="checkbox"
                checked={strategyConfig.enableNormalTransactionMix}
                onChange={(e) =>
                  setStrategyConfig({
                    ...strategyConfig,
                    enableNormalTransactionMix: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
            </div>
            <p className="text-black-9 text-xs mb-2">
              确保正常交易占比 &gt; {(strategyConfig.normalTransactionRatio * 100).toFixed(0)}%
            </p>
            {strategyConfig.enableNormalTransactionMix && (
              <div className="mt-2">
                <label className="block text-xs text-black-9 mb-1">
                  正常交易占比（%）
                </label>
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="95"
                  value={strategyConfig.normalTransactionRatio * 100}
                  onChange={(e) =>
                    setStrategyConfig({
                      ...strategyConfig,
                      normalTransactionRatio: (parseFloat(e.target.value) || 80) / 100,
                    })
                  }
                  className="w-full p-2 bg-black-2 border border-black-4 rounded-[6px] text-white text-xs"
                />
              </div>
            )}
          </div>

          {/* 策略4：风险控制 */}
          <div className="p-4 bg-black-3 rounded-[8px]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-white text-sm font-medium">
                策略4：风险控制
              </label>
              <input
                type="checkbox"
                checked={strategyConfig.enableRiskControl}
                onChange={(e) =>
                  setStrategyConfig({
                    ...strategyConfig,
                    enableRiskControl: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
            </div>
            <p className="text-black-9 text-xs mb-2">
              确保高风险交易占比 &lt; {(strategyConfig.maxHighRiskRatio * 100).toFixed(0)}%
            </p>
            {strategyConfig.enableRiskControl && (
              <div className="mt-2">
                <label className="block text-xs text-black-9 mb-1">
                  最大高风险交易占比（%）
                </label>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="30"
                  value={strategyConfig.maxHighRiskRatio * 100}
                  onChange={(e) =>
                    setStrategyConfig({
                      ...strategyConfig,
                      maxHighRiskRatio: (parseFloat(e.target.value) || 20) / 100,
                    })
                  }
                  className="w-full p-2 bg-black-2 border border-black-4 rounded-[6px] text-white text-xs"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 参数输入 */}
      <div className="bg-black-2 rounded-[12px] p-6 mb-6">
        <h2 className="text-main text-lg font-medium mb-4">输入参数</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm text-black-9 mb-2">
              每天需要处理的总量 A (USDT)
            </label>
            <input
              type="number"
              value={totalAmountA}
              onChange={(e) => setTotalAmountA(e.target.value)}
              className="w-full p-3 bg-black-3 border border-black-4 rounded-[8px] text-white text-sm focus:outline-none focus:border-primary"
              placeholder="10000"
            />
          </div>
          <div>
            <label className="block text-sm text-black-9 mb-2">
              需要处理的地址数 M
            </label>
            <input
              type="number"
              value={addressCountM}
              onChange={(e) => setAddressCountM(e.target.value)}
              className="w-full p-3 bg-black-3 border border-black-4 rounded-[8px] text-white text-sm focus:outline-none focus:border-primary"
              placeholder="5"
            />
          </div>
        </div>

        {/* 地址需求列表 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-base font-medium">每个地址的需求</h3>
            <button
              onClick={handleAddRequirement}
              className="px-4 py-2 bg-primary text-black text-sm font-medium rounded-[8px] hover:opacity-80"
            >
              添加地址需求
            </button>
          </div>

          <div className="space-y-4">
            {requirements.map((req, reqIndex) => (
              <div
                key={reqIndex}
                className="p-4 bg-black-3 rounded-[8px] border border-black-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white text-sm font-medium">
                    地址需求 #{reqIndex + 1}
                  </h4>
                  <button
                    onClick={() => {
                      setRequirements(requirements.filter((_, i) => i !== reqIndex))
                    }}
                    className="px-2 py-1 bg-red-500/20 text-red-500 text-xs rounded-[6px] hover:bg-red-500/30"
                  >
                    删除
                  </button>
                </div>

                <div className="mb-3">
                  <label className="block text-xs text-black-9 mb-2">
                    总笔数: {req.totalTransactions}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {req.transactionAmounts.map((amount, txIndex) => (
                      <div
                        key={txIndex}
                        className="flex items-center gap-2 px-3 py-1 bg-black-2 rounded-[6px]"
                      >
                        <span className="text-white text-xs">{amount} USDT</span>
                        <button
                          onClick={() => handleDeleteTransactionAmount(reqIndex, txIndex)}
                          className="text-red-500 text-xs hover:text-red-400"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="交易金额 (USDT)"
                    className="flex-1 p-2 bg-black-2 border border-black-4 rounded-[6px] text-white text-xs focus:outline-none focus:border-primary"
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        const input = e.currentTarget
                        handleAddTransactionAmount(reqIndex, input.value)
                        input.value = ""
                      }
                    }}
                  />
                  <button
                    onClick={(e) => {
                      const input = e.currentTarget
                        .previousElementSibling as HTMLInputElement
                      if (input) {
                        handleAddTransactionAmount(reqIndex, input.value)
                        input.value = ""
                      }
                    }}
                    className="px-3 py-2 bg-primary text-black text-xs font-medium rounded-[6px] hover:opacity-80"
                  >
                    添加
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleGeneratePlan}
          disabled={!totalAmountA || !addressCountM || requirements.length === 0}
          className="w-full md:w-auto px-6 py-3 bg-primary text-black text-sm font-medium rounded-[8px] hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          生成操作计划
        </button>
      </div>

      {/* 操作计划展示 */}
      {operationPlan && (
        <>
          {/* 标签页切换 */}
          <div className="flex gap-2 mb-6 border-b border-black-3">
            <button
              onClick={() => setActiveTab("plan")}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "plan"
                  ? "text-primary border-b-2 border-primary"
                  : "text-black-9 hover:text-white"
              }`}
            >
              计划详情
            </button>
            <button
              onClick={() => setActiveTab("tasks")}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "tasks"
                  ? "text-primary border-b-2 border-primary"
                  : "text-black-9 hover:text-white"
              }`}
            >
              任务列表 ({tasks.filter((t) => t.status === "completed").length} / {tasks.length})
            </button>
          </div>

          {activeTab === "tasks" ? (
            /* 任务列表视图 */
            <div className="bg-black-2 rounded-[12px] p-6">
              <h2 className="text-main text-lg font-medium mb-4">任务列表</h2>
              <TaskList
                tasks={tasks}
                onTaskComplete={handleTaskComplete}
                onTaskSkip={handleTaskSkip}
                onTaskStart={handleTaskStart}
                onTaskUpdate={handleTaskUpdate}
              />
            </div>
          ) : (
            /* 计划详情视图 */
            <div>
        <div className="bg-black-2 rounded-[12px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-main text-lg font-medium">操作计划</h2>
            <div className="flex gap-2">
              <button
                onClick={handleExportJSON}
                className="px-4 py-2 bg-black-3 text-white text-sm rounded-[8px] hover:bg-black-4 border border-black-4"
              >
                导出 JSON
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-black-3 text-white text-sm rounded-[8px] hover:bg-black-4 border border-black-4"
              >
                导出 CSV
              </button>
            </div>
          </div>

          {/* 计划摘要 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-black-3 rounded-[8px]">
              <div className="text-black-9 text-xs mb-1">计划ID</div>
              <div className="text-white text-sm font-medium">{operationPlan.planId}</div>
            </div>
            <div className="p-4 bg-black-3 rounded-[8px]">
              <div className="text-black-9 text-xs mb-1">总金额 (USDT)</div>
              <div className="text-white text-sm font-medium">
                {operationPlan.totalAmount.toLocaleString()}
              </div>
            </div>
            <div className="p-4 bg-black-3 rounded-[8px]">
              <div className="text-black-9 text-xs mb-1">总笔数</div>
              <div className="text-white text-sm font-medium">
                {operationPlan.totalTransactions}
              </div>
            </div>
            <div className="p-4 bg-black-3 rounded-[8px]">
              <div className="text-black-9 text-xs mb-1">源地址数</div>
              <div className="text-white text-sm font-medium">
                {operationPlan.sourceAddresses}
              </div>
            </div>
          </div>

          {/* 策略验证结果 */}
          <div className="mb-6">
            <h3 className="text-white text-base font-medium mb-4">策略验证结果</h3>
            <div className="space-y-3">
              {/* 策略1：金额不匹配 */}
              <div className={`p-4 rounded-[8px] ${
                operationPlan.strategyValidation.amountMismatch.passed
                  ? "bg-green-500/10 border border-green-500/30"
                  : "bg-red-500/10 border border-red-500/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">
                    策略1：金额不匹配
                  </span>
                  <span className={`px-2 py-1 rounded-[4px] text-xs ${
                    operationPlan.strategyValidation.amountMismatch.passed
                      ? "bg-green-500/20 text-green-500"
                      : "bg-red-500/20 text-red-500"
                  }`}>
                    {operationPlan.strategyValidation.amountMismatch.passed ? "通过" : "失败"}
                  </span>
                </div>
                <p className="text-black-9 text-xs">
                  {operationPlan.strategyValidation.amountMismatch.failedCount === 0
                    ? "所有交易的金额差异都满足要求"
                    : `有 ${operationPlan.strategyValidation.amountMismatch.failedCount} 笔交易的金额差异不满足要求`}
                </p>
              </div>

              {/* 策略2：时间延长 */}
              <div className={`p-4 rounded-[8px] ${
                operationPlan.strategyValidation.timeExtension.passed
                  ? "bg-green-500/10 border border-green-500/30"
                  : "bg-red-500/10 border border-red-500/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">
                    策略2：时间延长
                  </span>
                  <span className={`px-2 py-1 rounded-[4px] text-xs ${
                    operationPlan.strategyValidation.timeExtension.passed
                      ? "bg-green-500/20 text-green-500"
                      : "bg-red-500/20 text-red-500"
                  }`}>
                    {operationPlan.strategyValidation.timeExtension.passed ? "通过" : "失败"}
                  </span>
                </div>
                <p className="text-black-9 text-xs">
                  {operationPlan.strategyValidation.timeExtension.failedCount === 0
                    ? "所有交易的时间间隔都满足要求"
                    : `有 ${operationPlan.strategyValidation.timeExtension.failedCount} 笔交易的时间间隔不满足要求`}
                </p>
              </div>

              {/* 策略3：正常交易交叉 */}
              <div className={`p-4 rounded-[8px] ${
                operationPlan.strategyValidation.normalTransactionMix.passed
                  ? "bg-green-500/10 border border-green-500/30"
                  : "bg-red-500/10 border border-red-500/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">
                    策略3：正常交易交叉
                  </span>
                  <span className={`px-2 py-1 rounded-[4px] text-xs ${
                    operationPlan.strategyValidation.normalTransactionMix.passed
                      ? "bg-green-500/20 text-green-500"
                      : "bg-red-500/20 text-red-500"
                  }`}>
                    {operationPlan.strategyValidation.normalTransactionMix.passed ? "通过" : "失败"}
                  </span>
                </div>
                <p className="text-black-9 text-xs">
                  正常交易占比: {(operationPlan.strategyValidation.normalTransactionMix.normalRatio * 100).toFixed(2)}% | 
                  高风险交易占比: {(operationPlan.strategyValidation.normalTransactionMix.highRiskRatio * 100).toFixed(2)}%
                </p>
                <p className="text-black-9 text-xs mt-1">
                  {operationPlan.strategyValidation.normalTransactionMix.reason}
                </p>
              </div>

              {/* 策略4：风险控制 */}
              <div className={`p-4 rounded-[8px] ${
                operationPlan.strategyValidation.riskControl.passed
                  ? "bg-green-500/10 border border-green-500/30"
                  : "bg-red-500/10 border border-red-500/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">
                    策略4：风险控制
                  </span>
                  <span className={`px-2 py-1 rounded-[4px] text-xs ${
                    operationPlan.strategyValidation.riskControl.passed
                      ? "bg-green-500/20 text-green-500"
                      : "bg-red-500/20 text-red-500"
                  }`}>
                    {operationPlan.strategyValidation.riskControl.passed ? "通过" : "失败"}
                  </span>
                </div>
                <p className="text-black-9 text-xs">
                  高风险交易: {operationPlan.strategyValidation.riskControl.highRiskCount} / {operationPlan.strategyValidation.riskControl.totalCount} 
                  ({(operationPlan.strategyValidation.riskControl.highRiskRatio * 100).toFixed(2)}%)
                </p>
                <p className="text-black-9 text-xs mt-1">
                  {operationPlan.strategyValidation.riskControl.reason}
                </p>
              </div>
            </div>
          </div>

          {/* 交易列表 */}
          <div className="max-h-96 overflow-y-auto">
            <div className="space-y-2">
              {operationPlan.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-4 bg-black-3 rounded-[8px] border border-black-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{tx.id}</span>
                      <span className="px-2 py-1 bg-primary/20 text-primary text-xs rounded-[4px]">
                        {tx.chain}
                      </span>
                      <span className="px-2 py-1 bg-black-4 text-black-9 text-xs rounded-[4px]">
                        {tx.status}
                      </span>
                    </div>
                    <span className="text-white text-sm font-medium">
                      {tx.amount} USDT
                    </span>
                  </div>
                  <div className="text-xs text-black-9 space-y-1">
                    <div>
                      源地址:{" "}
                      <span className="text-white font-mono">
                        {tx.sourceAddress.slice(0, 10)}...{tx.sourceAddress.slice(-8)}
                      </span>
                      {tx.sourceAddressLabel && (
                        <span className="ml-2 text-primary">
                          ({tx.sourceAddressLabel})
                        </span>
                      )}
                    </div>
                    <div>
                      目标地址:{" "}
                      <span className="text-white font-mono">{tx.targetAddress}</span>
                    </div>
                    {tx.isHighRisk !== undefined && (
                      <div className="mt-1">
                        <span className={`px-2 py-1 rounded-[4px] text-xs ${
                          tx.isHighRisk
                            ? "bg-red-500/20 text-red-500"
                            : "bg-green-500/20 text-green-500"
                        }`}>
                          {tx.isHighRisk ? "高风险" : "正常"}
                        </span>
                      </div>
                    )}
                    {tx.amountDifference !== undefined && tx.timeInterval !== undefined && (
                      <div className="mt-1 text-xs text-black-9">
                        金额差异: {tx.amountDifference.toFixed(4)} USDT | 
                        时间间隔: {(tx.timeInterval / 3600).toFixed(2)} 小时
                      </div>
                    )}
                    {tx.depositTime && (
                      <div className="mt-1 text-xs text-black-9">
                        存入时间: {new Date(tx.depositTime * 1000).toLocaleString()}
                      </div>
                    )}
                    {tx.withdrawTime && (
                      <div className="mt-1 text-xs text-black-9">
                        提取时间: {new Date(tx.withdrawTime * 1000).toLocaleString()}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      {tx.steps.map((step, stepIndex) => (
                        <span
                          key={stepIndex}
                          className={`px-2 py-1 rounded-[4px] text-xs ${
                            step.status === "completed"
                              ? "bg-green-500/20 text-green-500"
                              : step.status === "processing"
                              ? "bg-primary/20 text-primary"
                              : "bg-black-4 text-black-9"
                          }`}
                        >
                          {step.step}: {step.status}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DesignerPage
