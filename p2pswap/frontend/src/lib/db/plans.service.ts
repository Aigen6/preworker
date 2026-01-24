import { getDatabase } from './database'
import { OperationPlan } from '@/app/designer/page'

export function createOperationPlan(plan: OperationPlan, chainId: number, strategyId: string): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO operation_plans (
      id, chain_id, plan_id, total_amount, total_transactions, source_addresses,
      transactions, generated_at, strategy_config, strategy_validation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  stmt.run(
    strategyId, // id = strategyId
    chainId,
    plan.planId,
    plan.totalAmount,
    plan.totalTransactions,
    plan.sourceAddresses,
    JSON.stringify(plan.transactions || []),
    plan.generatedAt,
    JSON.stringify(plan.strategyConfig),
    JSON.stringify(plan.strategyValidation)
  )
}

export function getOperationPlanByStrategyId(strategyId: string): OperationPlan | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM operation_plans WHERE id = ?')
  const row = stmt.get(strategyId) as any
  
  if (!row) return null
  
  return {
    planId: row.plan_id,
    totalAmount: row.total_amount,
    totalTransactions: row.total_transactions,
    sourceAddresses: row.source_addresses,
    transactions: row.transactions ? JSON.parse(row.transactions) : [],
    generatedAt: row.generated_at,
    strategyConfig: JSON.parse(row.strategy_config),
    strategyValidation: JSON.parse(row.strategy_validation),
  }
}

export function deleteOperationPlan(strategyId: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM operation_plans WHERE id = ?')
  stmt.run(strategyId)
}
