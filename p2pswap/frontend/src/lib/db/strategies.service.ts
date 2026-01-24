import { getDatabase } from './database'

export interface Strategy {
  id: string
  chainId: number
  planId: string
  totalAmount: number
  totalTasks: number
  generatedAt: string
  highRiskAddresses: any[]
  createdAt: number
}

export function createStrategy(strategy: Omit<Strategy, 'createdAt'>): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO strategies (id, chain_id, plan_id, total_amount, total_tasks, generated_at, high_risk_addresses)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    strategy.id,
    strategy.chainId,
    strategy.planId,
    strategy.totalAmount,
    strategy.totalTasks,
    strategy.generatedAt,
    JSON.stringify(strategy.highRiskAddresses)
  )
}

export function getStrategiesByChainId(chainId: number): Strategy[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM strategies WHERE chain_id = ? ORDER BY created_at DESC')
  const rows = stmt.all(chainId) as any[]
  
  return rows.map(row => ({
    id: row.id,
    chainId: row.chain_id,
    planId: row.plan_id,
    totalAmount: row.total_amount,
    totalTasks: row.total_tasks,
    generatedAt: row.generated_at,
    highRiskAddresses: JSON.parse(row.high_risk_addresses || '[]'),
    createdAt: row.created_at,
  }))
}

export function getStrategyById(strategyId: string): Strategy | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM strategies WHERE id = ?')
  const row = stmt.get(strategyId) as any
  
  if (!row) return null
  
  return {
    id: row.id,
    chainId: row.chain_id,
    planId: row.plan_id,
    totalAmount: row.total_amount,
    totalTasks: row.total_tasks,
    generatedAt: row.generated_at,
    highRiskAddresses: JSON.parse(row.high_risk_addresses || '[]'),
    createdAt: row.created_at,
  }
}

export function deleteStrategy(strategyId: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM strategies WHERE id = ?')
  stmt.run(strategyId)
}
