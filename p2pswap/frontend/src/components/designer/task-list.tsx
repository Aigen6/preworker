"use client"

import { useState, useEffect } from "react"
import type { Task, TaskGroup } from "@/lib/utils/task-manager"
import { AddressDisplay } from "@/components/ui/address-display"
import { TaskStatusSteps } from "@/components/ui/task-status-steps"
import { TaskFlowDiagram } from "@/components/designer/task-flow-diagram"
import { getAddressPoolService } from "@/lib/services/address-pool.service"
import {
  formatTime,
  formatDateTime,
  getTaskStatusText,
  getTaskPriorityColor,
  isTaskReady,
  groupTasksByDate,
  groupTasksByRelatedTaskId,
  groupTasksByOperationType,
} from "@/lib/utils/task-manager"

// 任务开始按钮组件（检查审核状态）
function TaskStartButton({ 
  task, 
  allTasks, 
  onStart,
  reviewApprovalTrigger // 添加触发参数，当审核通过时触发重新检查
}: { 
  task: Task
  allTasks?: Task[]
  onStart: () => void
  reviewApprovalTrigger?: number
}) {
  const [isApproved, setIsApproved] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkApproval = async () => {
      try {
        // 找到根任务（deposit任务，没有relatedTaskId）
        let rootTaskId = task.id
        if (task.relatedTaskId && allTasks) {
          // 向上追溯找到根任务
          let currentTask = allTasks.find(t => t.id === task.relatedTaskId)
          while (currentTask?.relatedTaskId) {
            currentTask = allTasks.find(t => t.id === currentTask?.relatedTaskId)
          }
          rootTaskId = currentTask?.id || task.id
        } else if (!task.relatedTaskId) {
          // 当前任务就是根任务
          rootTaskId = task.id
        }

        const { taskChainReviewsAPI } = await import('@/lib/api/client')
        const approved = await taskChainReviewsAPI.isApproved(rootTaskId)
        setIsApproved(approved)
      } catch (error) {
        console.error('检查审核状态失败:', error)
        setIsApproved(false)
      } finally {
        setChecking(false)
      }
    }
    checkApproval()
  }, [task.id, task.relatedTaskId, task.chainId, allTasks, reviewApprovalTrigger]) // 添加 reviewApprovalTrigger 依赖

  if (checking) {
    return (
      <button
        disabled
        className="px-2 py-1 sm:px-3 sm:py-1 bg-gray-500 text-white text-[10px] sm:text-xs rounded-[6px] opacity-50 cursor-not-allowed whitespace-nowrap"
      >
        检查中...
      </button>
    )
  }

  if (!isApproved) {
    return (
      <button
        disabled
        className="px-2 py-1 sm:px-3 sm:py-1 bg-gray-500 text-white text-[10px] sm:text-xs rounded-[6px] opacity-50 cursor-not-allowed whitespace-nowrap"
        title="请先在任务链中审核"
      >
        请先在任务链中审核
      </button>
    )
  }

  return (
    <button
      onClick={onStart}
      className="px-2 py-1 sm:px-3 sm:py-1 bg-primary text-black text-[10px] sm:text-xs rounded-[6px] hover:opacity-80 whitespace-nowrap"
    >
      开始
    </button>
  )
}

interface TaskListProps {
  tasks: Task[]
  onTaskComplete: (taskId: string) => void
  onTaskStart: (taskId: string) => void
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void
}

export function TaskList({
  tasks,
  onTaskComplete,
  onTaskStart,
  onTaskUpdate,
}: TaskListProps) {
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000))
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<"all" | "pending" | "ready" | "completed">("all")
  const [groupMode, setGroupMode] = useState<"date" | "relatedTaskId" | "operationType">("date")
  const [addressPools, setAddressPools] = useState<Map<number, any>>(new Map())
  // 用于触发 TaskStartButton 重新检查审核状态
  const [reviewApprovalTrigger, setReviewApprovalTrigger] = useState(0)
  
  // 预加载地址池（按 chainId）
  useEffect(() => {
    const loadAddressPools = async () => {
      const chainIds = new Set(tasks.map(t => t.chainId || 714))
      const pools = new Map()
      for (const chainId of chainIds) {
        const pool = getAddressPoolService(chainId)
        await pool.reload()
        pools.set(chainId, pool)
      }
      setAddressPools(pools)
    }
    if (tasks.length > 0) {
      loadAddressPools()
    }
  }, [tasks])
  
  // 更新当前时间
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000))
    }, 1000) // 每秒更新

    return () => clearInterval(interval)
  }, [])

  // 过滤任务（只按状态筛选，策略ID筛选在页面级别完成）
  const filteredTasks = tasks.filter((task) => {
    // 按状态筛选
    if (filter === "all") return true
    if (filter === "pending") return task.status === "pending"
    if (filter === "ready") return task.status === "ready" || isTaskReady(task, currentTime)
    if (filter === "completed") return task.status === "completed"
    return true
  })

  // 根据分组模式分组任务
  const taskGroups = (() => {
    switch (groupMode) {
      case "relatedTaskId":
        return groupTasksByRelatedTaskId(filteredTasks)
      case "operationType":
        return groupTasksByOperationType(filteredTasks)
      case "date":
      default:
        return groupTasksByDate(filteredTasks)
    }
  })()

  // 展开/折叠组
  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  // 展开所有组
  useEffect(() => {
    const allGroupIds = new Set(taskGroups.map((g) => g.id))
    setExpandedGroups(allGroupIds)
  }, [taskGroups.length])

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="p-4 bg-black-2 rounded-lg border border-black-4 space-y-3">
        {/* 分类模式选择器 */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-300 whitespace-nowrap">分类方式：</label>
            <select
              value={groupMode}
              onChange={(e) => setGroupMode(e.target.value as "date" | "relatedTaskId" | "operationType")}
              className="px-3 py-1.5 bg-black-3 border border-gray-700 rounded-lg text-white text-sm"
            >
              <option value="date">按日期</option>
              <option value="relatedTaskId">按任务链 (relatedTaskId)</option>
              <option value="operationType">按操作类型</option>
            </select>
          </div>
        </div>

        {/* 状态过滤器 */}
        <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "all"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          全部
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "pending"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          待处理
        </button>
        <button
          onClick={() => setFilter("ready")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "ready"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          就绪
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "completed"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          已完成
        </button>
        </div>
      </div>

      {/* 任务组列表 */}
      {taskGroups.length === 0 ? (
        <div className="text-center py-8 text-black-9">
          暂无任务
        </div>
      ) : (
        taskGroups.map((group) => (
          <TaskGroup
            key={group.id}
            group={group}
            isExpanded={expandedGroups.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            currentTime={currentTime}
            allTasks={filteredTasks} // 传递所有任务（使用 filteredTasks，因为这是当前可见的任务列表）
            groupMode={groupMode} // 传递分组模式
            onTaskComplete={onTaskComplete}
            onTaskStart={onTaskStart}
            onTaskUpdate={onTaskUpdate}
            reviewApprovalTrigger={reviewApprovalTrigger}
          />
        ))
      )}
    </div>
  )
}

interface TaskGroupProps {
  group: TaskGroup
  isExpanded: boolean
  onToggle: () => void
  currentTime: number
  allTasks: Task[] // 添加所有任务列表
  groupMode: "date" | "relatedTaskId" | "operationType" // 分组模式
  onTaskComplete: (taskId: string) => void
  onTaskStart: (taskId: string) => void
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void
  reviewApprovalTrigger?: number // 添加审核触发参数
}

function TaskGroup({
  group,
  isExpanded,
  onToggle,
  currentTime,
  allTasks,
  groupMode,
  onTaskComplete,
  onTaskStart,
  onTaskUpdate,
  reviewApprovalTrigger,
}: TaskGroupProps) {
  const completedCount = group.tasks.filter((t) => t.status === "completed").length
  const totalCount = group.tasks.length

  return (
    <div className="bg-black-2 rounded-[12px] border border-black-4">
      {/* 组标题 */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-black-3 transition-colors rounded-t-[12px]"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-medium">{group.title}</span>
          <span className="text-black-9 text-sm">
            {completedCount} / {totalCount}
          </span>
          {group.tasks[0]?.strategyId && (
            <span className="text-xs text-gray-500 font-mono">
              [{group.tasks[0].strategyId.slice(0, 12)}...]
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black-9 text-xs">
            {formatTime(group.startTime)} - {formatTime(group.endTime)}
          </span>
          <svg
            className={`w-5 h-5 text-black-9 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* 任务列表 */}
      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-black-4">
          {/* 逻辑流向图（只在按任务链展示时显示） */}
          {groupMode === "relatedTaskId" && group.tasks.length > 0 && group.tasks[0].chainId && (
            <TaskFlowDiagram 
              tasks={group.tasks} 
              chainId={group.tasks[0].chainId}
              onReviewApproved={(chainRootTaskId) => {
                // 审核通过后，触发所有 TaskStartButton 重新检查审核状态
                console.log(`任务链 ${chainRootTaskId} 审核通过`)
                setReviewApprovalTrigger(prev => prev + 1)
              }}
            />
          )}
          
          {/* 任务项 */}
          <div className="space-y-2">
            {group.tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                currentTime={currentTime}
                allTasks={allTasks} // 传递所有任务，用于查找关联的高风险任务
                onComplete={() => onTaskComplete(task.id)}
                onStart={() => onTaskStart(task.id)}
                onUpdate={(updates) => onTaskUpdate(task.id, updates)}
                reviewApprovalTrigger={reviewApprovalTrigger}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface TaskItemProps {
  task: Task
  currentTime: number
  onComplete: () => void
  onStart: () => void
  onUpdate: (updates: Partial<Task>) => void
  reviewApprovalTrigger?: number // 添加审核触发参数
}

function TaskItem({
  task,
  currentTime,
  onComplete,
  onStart,
  onUpdate,
  allTasks, // 添加所有任务列表，用于查找关联的高风险任务
  reviewApprovalTrigger,
}: TaskItemProps & { allTasks?: Task[] }) {
  // 检查时间是否到了，如果到了且状态还是pending，自动更新为ready（已到期）
  useEffect(() => {
    if (task.status === "pending" && task.scheduledTime <= currentTime) {
      onUpdate({ status: "ready" })
    }
  }, [task.status, task.scheduledTime, currentTime, onUpdate])

  const isReady = task.status === "ready" // 已到期，可以启动
  const statusText = getTaskStatusText(task)
  const statusColor = getTaskPriorityColor(task)
  
  // 检查是否是高风险地址相关的任务
  // 1. 任务本身标记为高风险
  // 2. 或者通过 relatedTaskId 追溯到高风险任务
  const isHighRiskRelated = (() => {
    if (task.isHighRisk) return true
    
    if (!allTasks || !task.relatedTaskId) return false
    
    // 递归查找关联的高风险任务
    const findHighRiskAncestor = (taskId: string, visited: Set<string> = new Set()): boolean => {
      if (visited.has(taskId)) return false // 防止循环
      visited.add(taskId)
      
      const relatedTask = allTasks!.find(t => t.id === taskId)
      if (!relatedTask) return false
      
      if (relatedTask.isHighRisk) return true
      
      if (relatedTask.relatedTaskId) {
        return findHighRiskAncestor(relatedTask.relatedTaskId, visited)
      }
      
      return false
    }
    
    return findHighRiskAncestor(task.relatedTaskId)
  })()

  return (
    <div
      className={`p-3 sm:p-4 rounded-[8px] border ${
        task.status === "completed"
          ? "bg-green-500/10 border-green-500/30"
          : task.status === "in_progress"
          ? "bg-primary/10 border-primary/30"
          : task.status === "ready"
          ? "bg-red-500/10 border-red-500/30"
          : "bg-black-3 border-black-4"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
        {/* 左侧：任务信息 */}
        <div className="flex-1 w-full sm:w-auto min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 flex-wrap">
            <input
              type="checkbox"
              checked={task.status === "completed"}
              onChange={(e) => {
                if (e.target.checked) {
                  onComplete()
                } else {
                  onUpdate({ status: "pending" })
                }
              }}
              className="w-4 h-4 sm:w-5 sm:h-5 rounded border-black-4 bg-black-2 text-primary focus:ring-primary flex-shrink-0"
            />
            <span className="text-white font-medium text-sm sm:text-base">{task.title}</span>
            <span
              className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-[4px] text-[10px] sm:text-xs flex-shrink-0 ${
                task.type === "deposit"
                  ? "bg-blue-500/20 text-blue-500"
                  : task.type === "claim"
                  ? "bg-green-500/20 text-green-500"
                  : task.type === "enclave_deposit"
                  ? "bg-yellow-500/20 text-yellow-500"
                  : task.type === "enclave_withdraw"
                  ? "bg-purple-500/20 text-purple-500"
                  : "bg-gray-500/20 text-gray-500"
              }`}
            >
              {task.type === "deposit" ? "存入" 
               : task.type === "claim" ? "提取"
               : task.type === "enclave_deposit" ? "隐私存入"
               : task.type === "enclave_withdraw" ? "隐私提取"
               : "正常"}
            </span>
            {(task.isHighRisk || isHighRiskRelated) && (
              <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-[4px] text-[10px] sm:text-xs bg-red-500/20 text-red-500 flex-shrink-0">
                高风险相关
              </span>
            )}
          </div>

          <p className="text-black-9 text-xs sm:text-sm mb-2 break-words">
            {/* 统一使用AddressDisplay组件显示From地址，不依赖description字符串 */}
            <span>
              {task.type === 'deposit' ? (
                <>
                  从{' '}
                  <AddressDisplay address={task.sourceAddress || ''} className="text-black-9 text-xs sm:text-sm" chainId={task.chainId} showIndex={true} />
                  {' '}存入 {task.amount != null ? task.amount.toFixed(2) : '0.00'} USDT 到 Deposit Vault
                </>
              ) : task.type === 'claim' ? (
                <>
                  <AddressDisplay address={task.sourceAddress || ''} className="text-black-9 text-xs sm:text-sm" chainId={task.chainId} showIndex={true} />
                  {' '}从 Deposit Vault 提取 {task.amount != null ? task.amount.toFixed(2) : '0.00'} USDT
                </>
              ) : task.type === 'enclave_deposit' ? (
                <>
                  <AddressDisplay address={task.sourceAddress || ''} className="text-black-9 text-xs sm:text-sm" chainId={task.chainId} showIndex={true} />
                  {' '}存入 {task.amount != null ? task.amount.toFixed(2) : '0.00'} USDT 到隐私池
                </>
              ) : task.type === 'enclave_withdraw' ? (
                <>
                  <AddressDisplay address={task.sourceAddress || ''} className="text-black-9 text-xs sm:text-sm" chainId={task.chainId} showIndex={true} />
                  {' '}从隐私池提取 {task.amount != null ? task.amount.toFixed(2) : '0.00'} USDT
                  {task.targetAddress && (
                    <>
                      {' '}到{' '}
                      <AddressDisplay address={task.targetAddress} className="text-black-9 text-xs sm:text-sm" chainId={task.chainId} showIndex={true} />
                    </>
                  )}
                </>
              ) : (
                task.description || '未知任务类型'
              )}
            </span>
          </p>
          {task.type === "deposit" && task.intendedRecipients && task.intendedRecipients.length > 0 && (
            <div className="mt-2 p-1.5 sm:p-2 bg-black-4 rounded text-[10px] sm:text-xs text-gray-400">
              <div className="font-semibold text-gray-300 mb-1">指定接收者：</div>
              {task.intendedRecipients.map((recipient, idx) => (
                <div key={idx} className="ml-2 flex items-center gap-1 flex-wrap">
                  • <AddressDisplay address={recipient.recipient} className="text-gray-400 text-[10px] sm:text-xs" chainId={task.chainId} showIndex={true} />
                  <span>: {recipient.amount.toFixed(2)} USDT</span>
                </div>
              ))}
            </div>
          )}
          {task.type === "enclave_deposit" && (
            <>
              {/* 两阶段状态显示 */}
              <div className="mt-2 p-1.5 sm:p-2 bg-black-4 rounded text-[10px] sm:text-xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-gray-400">存入阶段：</span>
                    <span className={`font-semibold ${
                      task.commitment && task.commitment !== '待生成'
                        ? 'text-green-500'
                        : task.status === 'in_progress'
                        ? 'text-primary'
                        : 'text-gray-500'
                    }`}>
                      {task.commitment && task.commitment !== '待生成' ? '✓ 已完成' : task.status === 'in_progress' ? '执行中...' : '待执行'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-gray-400">分配阶段：</span>
                    <span className={`font-semibold ${
                      task.status === 'completed' && task.notes?.includes('Allocation')
                        ? 'text-green-500'
                        : task.commitment && task.commitment !== '待生成'
                        ? 'text-yellow-500'
                        : 'text-gray-500'
                    }`}>
                      {task.status === 'completed' && task.notes?.includes('Allocation')
                        ? '✓ 已完成'
                        : task.commitment && task.commitment !== '待生成'
                        ? '待执行'
                        : '等待存入'}
                    </span>
                  </div>
                </div>
                {task.commitment && task.commitment !== '待生成' && (
                  <div className="mt-1 text-gray-500 break-all">
                    Commitment: <span className="font-mono text-[10px] sm:text-xs">{task.commitment}</span>
                  </div>
                )}
              </div>
              
              {task.allocations && task.allocations.length > 0 && (
                <div className="mt-2 p-1.5 sm:p-2 bg-black-4 rounded text-[10px] sm:text-xs text-gray-400">
                  <div className="font-semibold text-gray-300 mb-1">分配方案（共 {task.allocations.length} 个 Allocation）：</div>
                  {task.allocations.map((alloc, idx) => (
                    <div key={idx} className="ml-2">
                      • Allocation {idx}: {alloc.amount.toFixed(2)} USDT
                    </div>
                  ))}
                </div>
              )}
              {task.intendedRecipients && task.intendedRecipients.length > 0 && (
                <div className="mt-2 p-1.5 sm:p-2 bg-black-4 rounded text-[10px] sm:text-xs text-gray-400">
                  <div className="font-semibold text-gray-300 mb-1">最终目标地址：</div>
                  {task.intendedRecipients.map((recipient, idx) => {
                    const address = recipient.address || recipient.recipient
                    const allocationIndices = recipient.allocationIndices || []
                    // allocationIndices 是从0开始的数组索引（0, 1, 2...）
                    const allocationText = allocationIndices.length > 0
                      ? ` (Allocation ${allocationIndices.join(', ')})`
                      : ''
                    return (
                      <div key={idx} className="ml-2 flex items-center gap-1 flex-wrap">
                        • <AddressDisplay address={address || ''} className="text-gray-400 text-[10px] sm:text-xs" chainId={task.chainId} showIndex={true} />
                        <span>: {recipient.amount.toFixed(2)} USDT{allocationText}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-black-9 mb-2">
            <span>金额: {task.amount != null ? task.amount.toFixed(2) : '0.00'} USDT</span>
            <span>链: {task.chain}</span>
            <span className={statusColor}>{statusText}</span>
            <span className="break-all sm:break-normal">时间: {formatDateTime(task.scheduledTime)}</span>
          </div>

          {/* 任务状态步骤 */}
          <TaskStatusSteps task={task} />

          {/* 备注 */}
          {task.notes && (
            <div className="mt-2 p-1.5 sm:p-2 bg-black-4 rounded-[4px] text-[10px] sm:text-xs text-black-9 break-words">
              {task.notes}
            </div>
          )}
        </div>

        {/* 右侧：操作按钮和状态 - 移动端显示在下方 */}
        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto justify-end sm:justify-start">
          {/* 操作状态显示 */}
          {task.status === "in_progress" && (
            <div className="px-2 py-1 sm:px-3 sm:py-1 bg-primary/20 text-primary text-[10px] sm:text-xs rounded-[6px] text-center">
              执行中
            </div>
          )}
          {task.status === "completed" && (
            <div className="px-2 py-1 sm:px-3 sm:py-1 bg-green-500/20 text-green-500 text-[10px] sm:text-xs rounded-[6px] text-center">
              已完成
            </div>
          )}
          {task.status === "pending" && (
            <div className="px-2 py-1 sm:px-3 sm:py-1 bg-gray-500/20 text-gray-500 text-[10px] sm:text-xs rounded-[6px] text-center">
              未到时间
            </div>
          )}
          
          {/* 操作按钮 */}
          {task.status === "ready" && (
            <TaskStartButton
              task={task}
              allTasks={allTasks}
              onStart={onStart}
              reviewApprovalTrigger={reviewApprovalTrigger}
            />
          )}
          {task.status === "in_progress" && (
            <button
              onClick={onComplete}
              className="px-2 py-1 sm:px-3 sm:py-1 bg-green-500 text-white text-[10px] sm:text-xs rounded-[6px] hover:opacity-80"
            >
              完成
            </button>
          )}
          
          {/* 完成信息 */}
          {task.status === "completed" && task.completedAt && (
            <div className="text-[10px] sm:text-xs text-gray-500 text-center mt-1">
              {new Date(task.completedAt * 1000).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
