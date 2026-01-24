// 任务管理工具

export interface Task {
  id: string
  planId: string
  strategyId: string // 策略ID，用于区分和筛选不同策略生成的任务
  transactionId: string
  type: "deposit" | "claim" | "enclave_deposit" | "enclave_withdraw" | "normal"
  title: string
  description: string
  scheduledTime: number // 计划执行时间（Unix 时间戳，秒）
  sourceAddress: string
  targetAddress: string
  amount: number
  chain: string
  chainId: number
  status: "pending" | "ready" | "in_progress" | "completed" | "skipped"
  subStatus?: string // 子状态，用于显示详细的状态信息（如 "approving", "depositing", "allocating" 等）
  completedAt?: number
  completedBy?: string
  notes?: string
  steps: TaskStep[]
  relatedTaskId?: string // 关联的任务ID
  depositId?: string // Deposit Vault 的 depositId
  commitment?: string // Enclave 的 commitment
  intendedRecipients?: Array<{ recipient?: string; address?: string; amount: number; addressIndex?: number; allocationIndices?: number[]; feeIndex?: number }> // Deposit 阶段的接收者列表（addressIndex 为地址池中的编号），或 Enclave Deposit 阶段的最终目标地址（allocationIndices 记录该地址对应的 Allocation 索引，feeIndex 为手续费地址的序号，从1开始）
  allocations?: Array<{ amount: number }> // Enclave Deposit 阶段的分配方案
  finalTargets?: Array<{ address: string; amount: number; allocationIndices?: number[] }> // Enclave Deposit 阶段的最终目标地址（E/F），allocationIndices 记录该地址对应的 Allocation 索引（已废弃，使用 intendedRecipients）
  isHighRisk?: boolean // 是否为高风险交易
}

export interface TaskStep {
  step: "preprocess" | "enclave" | "transfer"
  status: "pending" | "processing" | "completed" | "failed"
  completedAt?: number
  txHash?: string
  notes?: string
}

export interface TaskGroup {
  id: string
  planId: string
  title: string
  tasks: Task[]
  startTime: number
  endTime: number
}

/**
 * 从操作计划生成任务列表
 */
export function generateTasksFromPlan(
  plan: any,
  baseTime: number = Math.floor(Date.now() / 1000)
): Task[] {
  const tasks: Task[] = []
  let taskId = 1

  // 按时间排序交易
  const sortedTransactions = [...plan.transactions].sort((a, b) => {
    const timeA = a.depositTime || a.withdrawTime || 0
    const timeB = b.depositTime || b.withdrawTime || 0
    return timeA - timeB
  })

  for (const tx of sortedTransactions) {
    // 如果是存入交易
    if (tx.depositTime) {
      const depositTask: Task = {
        id: `task-${taskId++}`,
        planId: plan.planId,
        transactionId: tx.id,
        type: tx.isHighRisk ? "deposit" : "normal",
        title: `${tx.isHighRisk ? "高风险" : "正常"}存入`,
        description: `从 ${tx.sourceAddress.slice(0, 8)}...${tx.sourceAddress.slice(-6)} 存入 ${Math.round(tx.amount)} USDT`,
        scheduledTime: tx.depositTime,
        sourceAddress: tx.sourceAddress,
        targetAddress: tx.targetAddress,
        amount: tx.amount,
        chain: tx.chain,
        chainId: tx.chainId,
        status: "pending", // 初始状态都是"未到时间"
        steps: (tx.steps || []).map((step: any) => ({
          step: step.step,
          status: step.status as any,
        })),
      }
      tasks.push(depositTask)
    }

    // 如果是提取交易
    if (tx.withdrawTime) {
      const withdrawTask: Task = {
        id: `task-${taskId++}`,
        planId: plan.planId,
        transactionId: tx.id,
        type: tx.isHighRisk ? "withdraw" : "normal",
        title: `${tx.isHighRisk ? "高风险" : "正常"}提取`,
        description: `提取 ${Math.round(tx.amount)} USDT 到 ${tx.targetAddress.slice(0, 8)}...${tx.targetAddress.slice(-6)}`,
        scheduledTime: tx.withdrawTime,
        sourceAddress: tx.sourceAddress,
        targetAddress: tx.targetAddress,
        amount: tx.amount,
        chain: tx.chain,
        chainId: tx.chainId,
        status: "pending", // 初始状态都是"未到时间"
        relatedTaskId: tx.relatedDepositId
          ? tasks.find((t) => t.transactionId === tx.relatedDepositId)?.id
          : undefined,
        steps: (tx.steps || []).map((step: any) => ({
          step: step.step,
          status: step.status as any,
        })),
      }
      tasks.push(withdrawTask)
    }
  }

  return tasks.sort((a, b) => a.scheduledTime - b.scheduledTime)
}

/**
 * 将任务按日期分组
 */
export function groupTasksByDate(tasks: Task[]): TaskGroup[] {
  const groups: Map<string, Task[]> = new Map()

  for (const task of tasks) {
    const date = new Date(task.scheduledTime * 1000)
    const dateKey = date.toISOString().split("T")[0] // YYYY-MM-DD

    if (!groups.has(dateKey)) {
      groups.set(dateKey, [])
    }
    groups.get(dateKey)!.push(task)
  }

  const taskGroups: TaskGroup[] = []
  for (const [dateKey, groupTasks] of groups.entries()) {
    const sortedTasks = groupTasks.sort((a, b) => a.scheduledTime - b.scheduledTime)
    taskGroups.push({
      id: `group-${dateKey}`,
      planId: sortedTasks[0]?.planId || "",
      title: formatDate(dateKey),
      tasks: sortedTasks,
      startTime: sortedTasks[0]?.scheduledTime || 0,
      endTime: sortedTasks[sortedTasks.length - 1]?.scheduledTime || 0,
    })
  }

  return taskGroups.sort((a, b) => a.startTime - b.startTime)
}

/**
 * 将任务按 relatedTaskId 分组
 * 没有 relatedTaskId 的任务会被单独分组
 */
export function groupTasksByRelatedTaskId(tasks: Task[]): TaskGroup[] {
  const groups: Map<string, Task[]> = new Map()
  const processed = new Set<string>() // 已处理的任务ID

  // 找出所有根任务（没有 relatedTaskId 的任务）
  const rootTasks = tasks.filter(t => !t.relatedTaskId)
  
  // 为每个根任务创建一个组，包含它及其所有相关任务
  for (const rootTask of rootTasks) {
    if (processed.has(rootTask.id)) continue
    
    const relatedTasks = findRelatedTasks(rootTask.id, tasks)
    const allTasks = [rootTask, ...relatedTasks].sort((a, b) => a.scheduledTime - b.scheduledTime)
    
    // 标记所有任务为已处理
    allTasks.forEach(t => processed.add(t.id))
    
    groups.set(rootTask.id, allTasks)
  }

  // 处理有 relatedTaskId 但根任务不在当前任务列表中的任务
  for (const task of tasks) {
    if (processed.has(task.id)) continue
    
    if (task.relatedTaskId) {
      // 查找根任务
      const rootTaskId = findRootTaskId(task.id, tasks)
      if (rootTaskId && !groups.has(rootTaskId)) {
        const relatedTasks = findRelatedTasks(rootTaskId, tasks)
        const allTasks = relatedTasks.sort((a, b) => a.scheduledTime - b.scheduledTime)
        
        // 标记所有任务为已处理
        allTasks.forEach(t => processed.add(t.id))
        
        groups.set(rootTaskId, allTasks)
      }
    } else {
      // 没有 relatedTaskId 且未被处理的任务，单独成组
      groups.set(task.id, [task])
      processed.add(task.id)
    }
  }

  const taskGroups: TaskGroup[] = []
  for (const [groupId, groupTasks] of groups.entries()) {
    if (groupTasks.length > 0) {
      const rootTask = groupTasks.find(t => !t.relatedTaskId) || groupTasks[0]
      const title = groupTasks.length === 1 
        ? `独立任务 (${rootTask.type || '未知类型'})`
        : `任务链 (${groupTasks.length} 个任务)`
      
      taskGroups.push({
        id: `related-${groupId}`,
        planId: rootTask.planId || "",
        title,
        tasks: groupTasks,
        startTime: groupTasks[0]?.scheduledTime || 0,
        endTime: groupTasks[groupTasks.length - 1]?.scheduledTime || 0,
      })
    }
  }

  return taskGroups.sort((a, b) => a.startTime - b.startTime)
}

/**
 * 查找与指定任务相关的所有任务（递归查找）
 */
function findRelatedTasks(taskId: string, allTasks: Task[]): Task[] {
  const related: Task[] = []
  const visited = new Set<string>()

  const findRecursive = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)

    const relatedTasks = allTasks.filter(t => t.relatedTaskId === id)
    for (const task of relatedTasks) {
      related.push(task)
      findRecursive(task.id)
    }
  }

  findRecursive(taskId)
  return related
}

/**
 * 查找任务的根任务ID（向上追溯）
 */
function findRootTaskId(taskId: string, allTasks: Task[]): string | null {
  const task = allTasks.find(t => t.id === taskId)
  if (!task || !task.relatedTaskId) {
    return taskId
  }
  return findRootTaskId(task.relatedTaskId, allTasks)
}

/**
 * 将任务按操作类型分组（四种操作：deposit, claim, enclave_deposit, enclave_withdraw）
 */
export function groupTasksByOperationType(tasks: Task[]): TaskGroup[] {
  const typeGroups: Map<string, Task[]> = new Map()
  
  const typeLabels: Record<string, string> = {
    deposit: "存入 (Deposit)",
    claim: "提取 (Claim)",
    enclave_deposit: "隐私存入 (Enclave Deposit)",
    enclave_withdraw: "隐私提取 (Enclave Withdraw)",
  }

  // 只处理四种操作类型
  const validTypes = ["deposit", "claim", "enclave_deposit", "enclave_withdraw"]

  for (const task of tasks) {
    const type = task.type
    // 只处理有效的操作类型，忽略 "normal" 和其他类型
    if (type && validTypes.includes(type)) {
      if (!typeGroups.has(type)) {
        typeGroups.set(type, [])
      }
      typeGroups.get(type)!.push(task)
    }
  }

  const taskGroups: TaskGroup[] = []
  for (const [type, groupTasks] of typeGroups.entries()) {
    const sortedTasks = groupTasks.sort((a, b) => a.scheduledTime - b.scheduledTime)
    taskGroups.push({
      id: `type-${type}`,
      planId: sortedTasks[0]?.planId || "",
      title: `${typeLabels[type] || type} (${sortedTasks.length} 个)`,
      tasks: sortedTasks,
      startTime: sortedTasks[0]?.scheduledTime || 0,
      endTime: sortedTasks[sortedTasks.length - 1]?.scheduledTime || 0,
    })
  }

  // 按类型顺序排序：deposit -> claim -> enclave_deposit -> enclave_withdraw
  const typeOrder = ["deposit", "claim", "enclave_deposit", "enclave_withdraw"]
  return taskGroups.sort((a, b) => {
    const aType = a.id.replace("type-", "")
    const bType = b.id.replace("type-", "")
    const aIndex = typeOrder.indexOf(aType)
    const bIndex = typeOrder.indexOf(bType)
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex
    }
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return a.startTime - b.startTime
  })
}

/**
 * 格式化日期
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (dateString === today.toISOString().split("T")[0]) {
    return "今天"
  } else if (dateString === tomorrow.toISOString().split("T")[0]) {
    return "明天"
  } else {
    return date.toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long",
    })
  }
}

/**
 * 格式化时间
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * 格式化完整时间
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * 检查任务是否就绪（时间到了，可以启动）
 * 任务状态为"ready"表示已到期，可以启动
 */
export function isTaskReady(task: Task, currentTime: number = Math.floor(Date.now() / 1000)): boolean {
  // 如果时间到了且状态是pending，应该先更新为ready
  if (task.scheduledTime <= currentTime && task.status === "pending") {
    return true // 时间到了，应该显示为"已到期"，可以启动
  }
  // 状态为ready表示已到期，可以启动
  return task.status === "ready"
}

/**
 * 获取任务状态文本
 */
export function getTaskStatusText(task: Task): string {
  const now = Math.floor(Date.now() / 1000)
  const timeUntil = task.scheduledTime - now

  if (task.status === "completed") {
    return "已完成"
  } else if (task.status === "in_progress") {
    return "进行中"
  } else if (task.status === "skipped") {
    return "已跳过"
  } else if (task.status === "ready") {
    return "已到期" // 已到期，可以启动
  } else if (timeUntil <= 0 && task.status === "pending") {
    // 时间到了但状态还是pending，应该显示"已到期"（实际应该更新为ready）
    return "已到期"
  } else if (timeUntil > 0) {
    // 时间未到，显示"未到时间"或倒计时
    if (timeUntil < 3600) {
      return `还有 ${Math.floor(timeUntil / 60)} 分钟`
    } else if (timeUntil < 86400) {
      return `还有 ${Math.floor(timeUntil / 3600)} 小时`
    } else {
      return `还有 ${Math.floor(timeUntil / 86400)} 天`
    }
  } else {
    return "未到时间"
  }
}

/**
 * 获取任务优先级颜色
 */
export function getTaskPriorityColor(task: Task): string {
  const now = Math.floor(Date.now() / 1000)
  const timeUntil = task.scheduledTime - now

  if (task.status === "completed") {
    return "text-green-500"
  } else if (task.status === "in_progress") {
    return "text-primary"
  } else if (task.status === "skipped") {
    return "text-gray-500"
  } else if (task.status === "ready") {
    return "text-red-500" // 已到期，红色提示
  } else if (timeUntil <= 0 && task.status === "pending") {
    return "text-red-500" // 时间到了但状态还是pending，应该显示红色（实际应该更新为ready）
  } else if (timeUntil < 3600) {
    return "text-yellow-500"
  } else {
    return "text-white"
  }
}
