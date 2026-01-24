"use client"

import { useState, useEffect } from "react"
import { type Task } from "@/lib/utils/task-manager"
import { type OperationPlan } from "@/app/designer/page"
import { useToast } from "@/components/providers/toast-provider"
import { strategiesAPI } from "@/lib/api/client"
import { getKeyManagerClient, chainIdToKeyManagerChain } from "@/lib/services/keymanager-client"
import { Clock, CheckCircle2, CircleCheck } from "lucide-react"

type StrategyStatus = "in_progress" | "completed" | "settled"

function StatisticsPage() {
  const { showSuccess, showError, showWarning } = useToast()
  const [chainId] = useState(714)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null) // 选中的策略ID（用于表格行点击）
  const [strategies, setStrategies] = useState<Array<{
    id: string
    planId: string
    totalAmount: number
    totalTasks: number
    generatedAt: string
    highRiskAddresses: any[]
  }>>([])
  const [settledStrategies, setSettledStrategies] = useState<Set<string>>(new Set()) // 已结算的策略ID集合
  const [settledTimestamps, setSettledTimestamps] = useState<Map<string, number>>(new Map()) // 已结算策略的时间戳
  const [detailModalOpen, setDetailModalOpen] = useState(false) // 详情卡片弹窗状态
  const [detailStrategyId, setDetailStrategyId] = useState<string | null>(null) // 当前查看详情的策略ID
  
  // 筛选条件
  const [statusFilter, setStatusFilter] = useState<StrategyStatus | "all">("all") // 状态筛选
  const [completedDateFrom, setCompletedDateFrom] = useState<string>("") // 完成时间起始
  const [completedDateTo, setCompletedDateTo] = useState<string>("") // 完成时间结束
  const [settledDateFrom, setSettledDateFrom] = useState<string>("") // 结算时间起始
  const [settledDateTo, setSettledDateTo] = useState<string>("") // 结算时间结束

  // 从 localStorage 加载已结算策略和时间戳
  useEffect(() => {
    const stored = localStorage.getItem(`settled_strategies_${chainId}`)
    const timestampsStored = localStorage.getItem(`settled_timestamps_${chainId}`)
    if (stored) {
      try {
        const settledIds = JSON.parse(stored) as string[]
        setSettledStrategies(new Set(settledIds))
      } catch (e) {
        console.error("加载已结算策略失败:", e)
      }
    }
    if (timestampsStored) {
      try {
        const timestamps = JSON.parse(timestampsStored) as Record<string, number>
        setSettledTimestamps(new Map(Object.entries(timestamps)))
      } catch (e) {
        console.error("加载结算时间戳失败:", e)
      }
    }
  }, [chainId])

  // 从数据库加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const { strategiesAPI, tasksAPI } = await import('@/lib/api/client')
        
        // 加载策略列表
        const strategiesList = await strategiesAPI.get(chainId)
        setStrategies(strategiesList)
        
        // 加载任务
        const tasksData = await tasksAPI.get(chainId)
        setTasks(tasksData)
      } catch (e) {
        console.error("加载数据失败:", e)
      }
    }
    loadData()
  }, [chainId])


  // 计算策略状态
  const getStrategyStatus = (strategyId: string): StrategyStatus => {
    // 如果已标记为已结算，直接返回
    if (settledStrategies.has(strategyId)) {
      return "settled"
    }
    
    const strategyTasks = tasks.filter(t => t.strategyId === strategyId)
    if (strategyTasks.length === 0) {
      return "in_progress"
    }
    
    // 检查是否有进行中的任务
    const hasInProgress = strategyTasks.some(t => 
      t.status === "in_progress" || t.status === "ready"
    )
    if (hasInProgress) {
      return "in_progress"
    }
    
    // 检查是否所有任务都已完成
    const allCompleted = strategyTasks.every(t => t.status === "completed")
    if (allCompleted) {
      return "completed"
    }
    
    return "in_progress"
  }

  // 获取状态对应的底色类名
  const getStatusBgColor = (status: StrategyStatus): string => {
    switch (status) {
      case "in_progress":
        return "bg-yellow-500/10 hover:bg-yellow-500/15"
      case "completed":
        return "bg-green-500/10 hover:bg-green-500/15"
      case "settled":
        return "bg-blue-500/10 hover:bg-blue-500/15"
      default:
        return "hover:bg-black-3/30"
    }
  }

  // 获取状态文本
  const getStatusText = (status: StrategyStatus): string => {
    switch (status) {
      case "in_progress":
        return "进行中"
      case "completed":
        return "已完成"
      case "settled":
        return "已结算"
      default:
        return "未知"
    }
  }

  // 获取状态图标
  const getStatusIcon = (status: StrategyStatus) => {
    switch (status) {
      case "in_progress":
        return <Clock className="w-5 h-5 text-yellow-400" />
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-green-400" />
      case "settled":
        return <CircleCheck className="w-5 h-5 text-blue-400" />
      default:
        return null
    }
  }

  // 标记策略为已结算
  const handleMarkSettled = (strategyId: string) => {
    const newSettled = new Set(settledStrategies)
    newSettled.add(strategyId)
    setSettledStrategies(newSettled)
    
    // 记录结算时间戳
    const newTimestamps = new Map(settledTimestamps)
    newTimestamps.set(strategyId, Date.now())
    setSettledTimestamps(newTimestamps)
    
    // 保存到 localStorage
    localStorage.setItem(
      `settled_strategies_${chainId}`,
      JSON.stringify(Array.from(newSettled))
    )
    localStorage.setItem(
      `settled_timestamps_${chainId}`,
      JSON.stringify(Object.fromEntries(newTimestamps))
    )
    
    showSuccess("策略已标记为已结算")
    setDetailModalOpen(false)
  }

  // 计算策略完成时间（所有任务都完成的时间）
  const getStrategyCompletedTime = (strategyId: string): number | null => {
    const strategyTasks = tasks.filter(t => t.strategyId === strategyId)
    if (strategyTasks.length === 0) return null
    
    // 检查是否所有任务都已完成
    const allCompleted = strategyTasks.every(t => t.status === "completed")
    if (!allCompleted) return null
    
    // 返回最后一个任务的完成时间
    const completedTasks = strategyTasks.filter(t => t.completedAt)
    if (completedTasks.length === 0) return null
    
    return Math.max(...completedTasks.map(t => t.completedAt || 0))
  }

  // 获取策略结算时间
  const getStrategySettledTime = (strategyId: string): number | null => {
    return settledTimestamps.get(strategyId) || null
  }

  // 应用筛选
  const applyFilters = (strategyStats: typeof strategyStatsList) => {
    return strategyStats.filter(stat => {
      // 状态筛选
      if (statusFilter !== "all" && stat.status !== statusFilter) {
        return false
      }
      
      // 完成时间筛选
      if (completedDateFrom || completedDateTo) {
        const completedTime = getStrategyCompletedTime(stat.strategyId)
        if (!completedTime) {
          // 如果没有完成时间，且筛选了完成时间，则过滤掉
          if (completedDateFrom || completedDateTo) return false
        } else {
          const completedDate = new Date(completedTime)
          const fromDate = completedDateFrom ? new Date(completedDateFrom) : null
          const toDate = completedDateTo ? new Date(completedDateTo + "T23:59:59") : null
          
          if (fromDate && completedDate < fromDate) return false
          if (toDate && completedDate > toDate) return false
        }
      }
      
      // 结算时间筛选
      if (settledDateFrom || settledDateTo) {
        const settledTime = getStrategySettledTime(stat.strategyId)
        if (!settledTime) {
          // 如果没有结算时间，且筛选了结算时间，则过滤掉
          return false
        } else {
          const settledDate = new Date(settledTime)
          const fromDate = settledDateFrom ? new Date(settledDateFrom) : null
          const toDate = settledDateTo ? new Date(settledDateTo + "T23:59:59") : null
          
          if (fromDate && settledDate < fromDate) return false
          if (toDate && settledDate > toDate) return false
        }
      }
      
      return true
    })
  }

  // 打开详情卡片
  const handleOpenDetail = (strategyId: string) => {
    setDetailStrategyId(strategyId)
    setDetailModalOpen(true)
  }

  // 关闭详情卡片
  const handleCloseDetail = () => {
    setDetailModalOpen(false)
    setDetailStrategyId(null)
  }

  // 生成策略友好名称
  const generateStrategyName = (strategy: typeof strategies[0], index: number) => {
    const amount = strategy.totalAmount || 0
    const taskCount = strategy.totalTasks || 0
    
    // 尝试从生成时间提取日期
    let dateStr = ""
    if (strategy.generatedAt) {
      try {
        const date = new Date(strategy.generatedAt)
        dateStr = `${date.getMonth() + 1}/${date.getDate()}`
      } catch (e) {
        // 忽略日期解析错误
      }
    }
    
    // 组合名称：策略 #序号 - 金额 - 日期
    const parts: string[] = []
    parts.push(`策略 #${index + 1}`)
    if (amount > 0) {
      parts.push(`${Math.round(amount)} USDT`)
    }
    if (taskCount > 0) {
      parts.push(`${taskCount}任务`)
    }
    if (dateStr) {
      parts.push(dateStr)
    }
    
    return parts.join(' - ')
  }

  // 为每个策略计算统计数据
  const strategyStatsList = strategies.map((strategy, index) => {
    const strategyTasks = tasks.filter(t => t.strategyId === strategy.id)
    const status = getStrategyStatus(strategy.id)

    // 任务统计
    const taskStats = {
      totalTasks: strategyTasks.length,
      completedTasks: strategyTasks.filter(t => t.status === "completed").length,
      pendingTasks: strategyTasks.filter(t => t.status === "pending").length,
      inProgressTasks: strategyTasks.filter(t => t.status === "in_progress").length,
      completionRate: strategyTasks.length > 0 
        ? (strategyTasks.filter(t => t.status === "completed").length / strategyTasks.length * 100).toFixed(1)
        : "0",
      totalAmount: strategy.totalAmount || 0,
    }

    // 手续费统计
    const highRiskAddresses = new Set<string>()
    strategyTasks.forEach(task => {
      if (task.isHighRisk && task.sourceAddress) {
        highRiskAddresses.add(task.sourceAddress.toLowerCase())
      }
    })

    const allEnclaveDeposits = strategyTasks.filter(t => t.type === "enclave_deposit")
    const totalEnclaveDepositAmount = allEnclaveDeposits.reduce((sum, t) => sum + (t.amount || 0), 0)
    const totalWillCollectFee = totalEnclaveDepositAmount * 0.01

    const completedWithdraws = strategyTasks.filter(t => 
      t.type === "enclave_withdraw" && 
      t.status === "completed" &&
      t.targetAddress
    )
    
    let alreadyCollectedFee = 0
    completedWithdraws.forEach(withdrawTask => {
      const targetAddress = (withdrawTask.targetAddress || "").toLowerCase()
      if (feeRecipientAddresses.includes(targetAddress)) {
        alreadyCollectedFee += withdrawTask.amount || 0
      }
    })

    const highRiskDeposits = strategyTasks.filter(t => 
      t.type === "deposit" && t.isHighRisk
    )
    const totalHighRiskDepositAmount = highRiskDeposits.reduce((sum, t) => sum + (t.amount || 0), 0)
    const expectedFee = totalHighRiskDepositAmount * 0.05

    return {
      strategyId: strategy.id,
      strategyName: generateStrategyName(strategy, index),
      status,
      ...taskStats,
      highRiskAddressCount: highRiskAddresses.size,
      totalWillCollectFee,
      alreadyCollectedFee,
      expectedFee,
      strategyTasks, // 保存任务列表用于详情显示
      strategy, // 保存策略对象用于详情显示
    }
  })

  

  // 从KeyManager加载手续费接收地址（从索引20050118开始，获取10个）
  const [feeRecipientAddresses, setFeeRecipientAddresses] = useState<string[]>([])
  useEffect(() => {
    const loadFeeRecipients = async () => {
      try {
        const keyManagerClient = getKeyManagerClient()
        const chain = chainIdToKeyManagerChain(chainId)
        if (!chain) {
          console.warn(`不支持的 chainId: ${chainId}`)
          return
        }

        // 从索引19050118开始，获取10个地址
        const startIndex = 19050118
        const count = 10
        const addresses = await keyManagerClient.exportBatch(chain, startIndex, count)
        const addressList = addresses.map(addr => addr.address.trim().toLowerCase())
        setFeeRecipientAddresses(addressList)
        console.log(`✅ 从KeyManager加载了 ${addressList.length} 个手续费接收地址`)
      } catch (error) {
        console.error('从KeyManager加载手续费接收地址失败:', error)
      }
    }
    loadFeeRecipients()
  }, [chainId])


  if (strategies.length === 0 && tasks.length === 0) {
    return (
      <div className="min-h-screen bg-base" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw', maxWidth: '100vw' }}>
        <div className="w-full p-4 md:px-6">
          <h1 className="text-2xl font-bold text-white mb-6">结果统计</h1>
          <div className="bg-black-2 rounded-lg p-8 text-center">
            <p className="text-gray-400">暂无统计数据</p>
          </div>
        </div>
      </div>
    )
  }

  // 获取当前查看详情的策略数据
  const detailStrategy = detailStrategyId 
    ? strategyStatsList.find(s => s.strategyId === detailStrategyId)
    : null

  // 应用筛选
  const filteredStrategyStatsList = applyFilters(strategyStatsList)

  return (
    <div className="min-h-screen bg-base" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw', maxWidth: '100vw' }}>
      <div className="w-full p-4 md:px-6">
        <h1 className="text-2xl font-bold text-white mb-6">统计页面</h1>

        {/* 筛选栏 */}
        <div className="bg-black-2 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* 状态筛选 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">状态筛选</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StrategyStatus | "all")}
                className="w-full h-10 px-3 bg-black-3 border-2 border-black-3 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
              >
                <option value="all">全部状态</option>
                <option value="in_progress">进行中</option>
                <option value="completed">已完成</option>
                <option value="settled">已结算</option>
              </select>
            </div>

            {/* 完成时间起始 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">完成时间（起始）</label>
              <input
                type="date"
                value={completedDateFrom}
                onChange={(e) => setCompletedDateFrom(e.target.value)}
                className="w-full h-10 px-3 bg-black-3 border-2 border-black-3 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* 完成时间结束 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">完成时间（结束）</label>
              <input
                type="date"
                value={completedDateTo}
                onChange={(e) => setCompletedDateTo(e.target.value)}
                className="w-full h-10 px-3 bg-black-3 border-2 border-black-3 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* 结算时间起始 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">结算时间（起始）</label>
              <input
                type="date"
                value={settledDateFrom}
                onChange={(e) => setSettledDateFrom(e.target.value)}
                className="w-full h-10 px-3 bg-black-3 border-2 border-black-3 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* 结算时间结束 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">结算时间（结束）</label>
              <input
                type="date"
                value={settledDateTo}
                onChange={(e) => setSettledDateTo(e.target.value)}
                className="w-full h-10 px-3 bg-black-3 border-2 border-black-3 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* 清除筛选按钮 */}
          {(statusFilter !== "all" || completedDateFrom || completedDateTo || settledDateFrom || settledDateTo) && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setStatusFilter("all")
                  setCompletedDateFrom("")
                  setCompletedDateTo("")
                  setSettledDateFrom("")
                  setSettledDateTo("")
                }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                清除筛选
              </button>
            </div>
          )}
        </div>

        {/* 统计表格 - 二维表格，每行一个策略 */}
        <div className="bg-black-2 rounded-lg overflow-hidden mb-6">
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
            <table className="w-full" style={{ minWidth: '1200px' }}>
              <thead>
                <tr className="border-b border-gray-700 bg-black-3">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400 sticky left-0 bg-black-3 z-10 border-r border-gray-700">策略</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">状态</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">总任务数</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">已完成</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">进行中</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">待处理</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">完成率</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">总金额 (USDT)</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">高风险地址</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">总共会收取 (USDT)</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">已经收取 (USDT)</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">应收取 (USDT)</th>
                </tr>
              </thead>
              <tbody>
                {/* 各策略数据行 */}
                {filteredStrategyStatsList.map((strategyStat) => {
                  const status = strategyStat.status
                  const bgColor = getStatusBgColor(status)
                  const isSelected = selectedStrategyId === strategyStat.strategyId
                  
                  return (
                    <tr 
                      key={strategyStat.strategyId}
                      onClick={() => handleOpenDetail(strategyStat.strategyId)}
                      className={`border-b border-gray-700/50 cursor-pointer transition-colors ${bgColor} ${
                        isSelected ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-sm text-white sticky left-0 z-10 bg-black-2">
                        {strategyStat.strategyName}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <div 
                          className="inline-flex items-center justify-center cursor-help"
                          title={getStatusText(status)}
                        >
                          {getStatusIcon(status)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-white font-semibold">{strategyStat.totalTasks}</td>
                      <td className="px-4 py-3 text-sm text-center text-green-400 font-semibold">{strategyStat.completedTasks}</td>
                      <td className="px-4 py-3 text-sm text-center text-yellow-400 font-semibold">{strategyStat.inProgressTasks}</td>
                      <td className="px-4 py-3 text-sm text-center text-gray-400 font-semibold">{strategyStat.pendingTasks}</td>
                      <td className="px-4 py-3 text-sm text-center text-white font-semibold">{strategyStat.completionRate}%</td>
                      <td className="px-4 py-3 text-sm text-center text-white font-semibold">{Math.round(strategyStat.totalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-center text-white font-semibold">{strategyStat.highRiskAddressCount} 个</td>
                      <td className="px-4 py-3 text-sm text-center text-white font-semibold">{strategyStat.totalWillCollectFee.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-center text-white font-semibold">{strategyStat.alreadyCollectedFee.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-center text-white font-semibold">{strategyStat.expectedFee.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 详情卡片弹窗 */}
        {detailModalOpen && detailStrategy && (
          <div 
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={handleCloseDetail}
          >
            <div 
              className="bg-black-2 rounded-lg border-2 border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                {/* 标题栏 */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">{detailStrategy.strategyName}</h2>
                  <button
                    onClick={handleCloseDetail}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* 策略信息 */}
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-400">策略ID</label>
                      <p className="text-white font-mono text-sm">{detailStrategy.strategyId}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">状态</label>
                      <p className="text-white flex items-center gap-2">
                        <span 
                          className="inline-flex items-center justify-center cursor-help"
                          title={getStatusText(detailStrategy.status)}
                        >
                          {getStatusIcon(detailStrategy.status)}
                        </span>
                        <span className="text-sm text-gray-500">{getStatusText(detailStrategy.status)}</span>
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">总任务数</label>
                      <p className="text-white font-semibold">{detailStrategy.totalTasks}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">完成率</label>
                      <p className="text-white font-semibold">{detailStrategy.completionRate}%</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">总金额</label>
                      <p className="text-white font-semibold">{Math.round(detailStrategy.totalAmount)} USDT</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">高风险地址数</label>
                      <p className="text-white font-semibold">{detailStrategy.highRiskAddressCount} 个</p>
                    </div>
                  </div>

                  {/* 任务状态统计 */}
                  <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-sm font-semibold text-gray-400 mb-3">任务状态</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-gray-500">已完成</label>
                        <p className="text-green-400 font-semibold">{detailStrategy.completedTasks}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">进行中</label>
                        <p className="text-yellow-400 font-semibold">{detailStrategy.inProgressTasks}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">待处理</label>
                        <p className="text-gray-400 font-semibold">{detailStrategy.pendingTasks}</p>
                      </div>
                    </div>
                  </div>

                  {/* 手续费统计 */}
                  <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-sm font-semibold text-gray-400 mb-3">手续费统计</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-500">总共会收取（隐私存款×1%）</label>
                        <p className="text-white font-semibold">{detailStrategy.totalWillCollectFee.toFixed(2)} USDT</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">已经收取（已提取到手续费地址）</label>
                        <p className="text-white font-semibold">{detailStrategy.alreadyCollectedFee.toFixed(2)} USDT</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">应收取手续费（高风险存款×5%）</label>
                        <p className="text-white font-semibold">{detailStrategy.expectedFee.toFixed(2)} USDT</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="border-t border-gray-700 pt-4 flex justify-end">
                  <button
                    onClick={() => handleMarkSettled(detailStrategy.strategyId)}
                    disabled={detailStrategy.status !== "completed"}
                    className="px-6 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                  >
                    标记为已结算
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StatisticsPage
