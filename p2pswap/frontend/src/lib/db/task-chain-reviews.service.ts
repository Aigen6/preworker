import { getDatabase } from './database'

export interface TaskChainReview {
  chainRootTaskId: string
  chainId: number
  approvedAt: number
  reviewedBy?: string
  createdAt: number
}

export function createTaskChainReview(review: Omit<TaskChainReview, 'createdAt' | 'approvedAt'>): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO task_chain_reviews (chain_root_task_id, chain_id, approved_at, reviewed_by, created_at)
    VALUES (?, ?, strftime('%s', 'now'), ?, strftime('%s', 'now'))
  `)
  stmt.run(
    review.chainRootTaskId,
    review.chainId,
    review.reviewedBy || null
  )
}

export function getTaskChainReview(chainRootTaskId: string): TaskChainReview | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM task_chain_reviews WHERE chain_root_task_id = ?')
  const row = stmt.get(chainRootTaskId) as any
  
  if (!row) return null
  
  return {
    chainRootTaskId: row.chain_root_task_id,
    chainId: row.chain_id,
    approvedAt: row.approved_at,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
  }
}

export function getTaskChainReviewsByChainId(chainId: number): TaskChainReview[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM task_chain_reviews WHERE chain_id = ?')
  const rows = stmt.all(chainId) as any[]
  
  return rows.map(row => ({
    chainRootTaskId: row.chain_root_task_id,
    chainId: row.chain_id,
    approvedAt: row.approved_at,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
  }))
}

export function isTaskChainApproved(chainRootTaskId: string): boolean {
  const review = getTaskChainReview(chainRootTaskId)
  return review !== null
}

export function deleteTaskChainReview(chainRootTaskId: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM task_chain_reviews WHERE chain_root_task_id = ?')
  stmt.run(chainRootTaskId)
}
