// 任务管理工具

export interface Task {
  id: string
  planId: string
  transactionId: string
  type: "deposit" | "withdraw" | "normal"
  title: string
  description: string
  scheduledTime: number // 计划执行时间（Unix 时间戳，秒）
  sourceAddress: string
  targetAddress: string
  amount: number
  chain: string
  chainId: number
  status: "pending" | "ready" | "in_progress" | "completed" | "skipped"
  completedAt?: number
  completedBy?: string
  notes?: string
  steps: TaskStep[]
  relatedTaskId?: string // 关联的任务ID（如提取任务关联存入任务）
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
        description: `从 ${tx.sourceAddress.slice(0, 8)}...${tx.sourceAddress.slice(-6)} 存入 ${tx.amount} USDT`,
        scheduledTime: tx.depositTime,
        sourceAddress: tx.sourceAddress,
        targetAddress: tx.targetAddress,
        amount: tx.amount,
        chain: tx.chain,
        chainId: tx.chainId,
        status: tx.depositTime <= baseTime ? "ready" : "pending",
        steps: tx.steps.map((step) => ({
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
        description: `提取 ${tx.amount} USDT 到 ${tx.targetAddress.slice(0, 8)}...${tx.targetAddress.slice(-6)}`,
        scheduledTime: tx.withdrawTime,
        sourceAddress: tx.sourceAddress,
        targetAddress: tx.targetAddress,
        amount: tx.amount,
        chain: tx.chain,
        chainId: tx.chainId,
        status: tx.withdrawTime <= baseTime ? "ready" : "pending",
        relatedTaskId: tx.relatedDepositId
          ? tasks.find((t) => t.transactionId === tx.relatedDepositId)?.id
          : undefined,
        steps: tx.steps.map((step) => ({
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
 * 检查任务是否就绪（时间到了）
 */
export function isTaskReady(task: Task, currentTime: number = Math.floor(Date.now() / 1000)): boolean {
  return task.scheduledTime <= currentTime && task.status === "pending"
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
    return "待执行"
  } else if (timeUntil <= 0) {
    return "已到期"
  } else if (timeUntil < 3600) {
    return `还有 ${Math.floor(timeUntil / 60)} 分钟`
  } else if (timeUntil < 86400) {
    return `还有 ${Math.floor(timeUntil / 3600)} 小时`
  } else {
    return `还有 ${Math.floor(timeUntil / 86400)} 天`
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
  } else if (timeUntil <= 0) {
    return "text-red-500"
  } else if (timeUntil < 3600) {
    return "text-yellow-500"
  } else {
    return "text-white"
  }
}
