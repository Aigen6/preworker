import { getDatabase } from './database'
import { Task } from '@/lib/utils/task-manager'

export function createTask(task: Task): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, strategy_id, plan_id, transaction_id, chain_id, type, title, description,
      scheduled_time, source_address, target_address, amount, chain, status,
      completed_at, completed_by, notes, steps, related_task_id, deposit_id,
      commitment, intended_recipients, allocations, final_targets, is_high_risk
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  stmt.run(
    task.id,
    task.strategyId || null,
    task.planId,
    task.transactionId,
    task.chainId,
    task.type,
    task.title,
    task.description,
    task.scheduledTime,
    task.sourceAddress,
    task.targetAddress || null,
    task.amount,
    task.chain,
    task.status,
    task.completedAt || null,
    task.completedBy || null,
    task.notes || null,
    JSON.stringify(task.steps || []),
    task.relatedTaskId || null,
    task.depositId || null,
    task.commitment || null,
    task.intendedRecipients ? JSON.stringify(task.intendedRecipients) : null,
    task.allocations ? JSON.stringify(task.allocations) : null,
    task.finalTargets ? JSON.stringify(task.finalTargets) : null,
    task.isHighRisk ? 1 : 0
  )
}

export function createTasks(tasks: Task[]): void {
  const db = getDatabase()
  const insert = db.prepare(`
    INSERT INTO tasks (
      id, strategy_id, plan_id, transaction_id, chain_id, type, title, description,
      scheduled_time, source_address, target_address, amount, chain, status,
      completed_at, completed_by, notes, steps, related_task_id, deposit_id,
      commitment, intended_recipients, allocations, final_targets, is_high_risk
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  const insertMany = db.transaction((tasks: Task[]) => {
    for (const task of tasks) {
      insert.run(
        task.id,
        task.strategyId || null,
        task.planId,
        task.transactionId,
        task.chainId,
        task.type,
        task.title,
        task.description,
        task.scheduledTime,
        task.sourceAddress,
        task.targetAddress || null,
        task.amount,
        task.chain,
        task.status,
        task.completedAt || null,
        task.completedBy || null,
        task.notes || null,
        JSON.stringify(task.steps || []),
        task.relatedTaskId || null,
        task.depositId || null,
        task.commitment || null,
        task.intendedRecipients ? JSON.stringify(task.intendedRecipients) : null,
        task.allocations ? JSON.stringify(task.allocations) : null,
        task.finalTargets ? JSON.stringify(task.finalTargets) : null,
        task.isHighRisk ? 1 : 0
      )
    }
  })
  
  insertMany(tasks)
}

export function getTasksByChainId(chainId: number): Task[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM tasks WHERE chain_id = ? ORDER BY scheduled_time ASC')
  const rows = stmt.all(chainId) as any[]
  
  return rows.map(row => mapRowToTask(row))
}

export function getTasksByStrategyId(strategyId: string): Task[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM tasks WHERE strategy_id = ? ORDER BY scheduled_time ASC')
  const rows = stmt.all(strategyId) as any[]
  
  return rows.map(row => mapRowToTask(row))
}

export function getTaskById(taskId: string): Task | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?')
  const row = stmt.get(taskId) as any
  
  if (!row) return null
  return mapRowToTask(row)
}

export function updateTask(taskId: string, updates: Partial<Task>): void {
  const db = getDatabase()
  const fields: string[] = []
  const values: any[] = []
  
  if (updates.status !== undefined) {
    fields.push('status = ?')
    values.push(updates.status)
  }
  if (updates.completedAt !== undefined) {
    fields.push('completed_at = ?')
    values.push(updates.completedAt)
  }
  if (updates.completedBy !== undefined) {
    fields.push('completed_by = ?')
    values.push(updates.completedBy)
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?')
    values.push(updates.notes)
  }
  if (updates.depositId !== undefined) {
    fields.push('deposit_id = ?')
    values.push(updates.depositId)
  }
  if (updates.commitment !== undefined) {
    fields.push('commitment = ?')
    values.push(updates.commitment)
  }
  if (updates.steps !== undefined) {
    fields.push('steps = ?')
    values.push(JSON.stringify(updates.steps))
  }
  
  if (fields.length === 0) return
  
  fields.push('updated_at = ?')
  values.push(Math.floor(Date.now() / 1000))
  values.push(taskId)
  
  const stmt = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)
}

export function deleteTask(taskId: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?')
  stmt.run(taskId)
}

export function deleteTasksByStrategyId(strategyId: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM tasks WHERE strategy_id = ?')
  stmt.run(strategyId)
}

export function canDeleteStrategy(strategyId: string): { canDelete: boolean; reason?: string } {
  const db = getDatabase()
  const stmt = db.prepare('SELECT status FROM tasks WHERE strategy_id = ?')
  const rows = stmt.all(strategyId) as Array<{ status: string }>
  
  if (rows.length === 0) {
    return { canDelete: true }
  }
  
  // 检查是否所有任务都是 pending 或 ready 状态
  // Ready 和审核不属于被执行过，只有 in_progress 和 completed 才算执行过
  const allowedStatuses = ['pending', 'ready']
  const allAllowed = rows.every(row => allowedStatuses.includes(row.status))
  
  if (allAllowed) {
    return { canDelete: true }
  }
  
  // 统计不同状态的任务数量（只统计不允许删除的状态）
  const disallowedStatuses = rows.filter(row => !allowedStatuses.includes(row.status))
  const statusCounts = disallowedStatuses.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const statusList = Object.entries(statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ')
  
  return {
    canDelete: false,
    reason: `策略包含已开始的任务 (${statusList})，无法删除`
  }
}

function mapRowToTask(row: any): Task {
  return {
    id: row.id,
    planId: row.plan_id,
    strategyId: row.strategy_id || '',
    transactionId: row.transaction_id,
    type: row.type as Task['type'],
    title: row.title,
    description: row.description,
    scheduledTime: row.scheduled_time,
    sourceAddress: row.source_address,
    targetAddress: row.target_address || '',
    amount: row.amount,
    chain: row.chain,
    chainId: row.chain_id,
    status: row.status as Task['status'],
    completedAt: row.completed_at || undefined,
    completedBy: row.completed_by || undefined,
    notes: row.notes || undefined,
    steps: row.steps ? JSON.parse(row.steps) : [],
    relatedTaskId: row.related_task_id || undefined,
    depositId: row.deposit_id || undefined,
    commitment: row.commitment || undefined,
    intendedRecipients: row.intended_recipients ? JSON.parse(row.intended_recipients) : undefined,
    allocations: row.allocations ? JSON.parse(row.allocations) : undefined,
    finalTargets: row.final_targets ? JSON.parse(row.final_targets) : undefined,
    isHighRisk: row.is_high_risk === 1,
  }
}
