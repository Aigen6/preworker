/**
 * 任务执行相关的类型定义
 */

import type { Task } from "@/lib/utils/task-manager"

/**
 * 任务执行状态
 * 
 * 注意：模块3和模块4的状态需要与SDK的CheckbookStatus和WithdrawRequestStatus保持一致
 */
export type TaskExecutionStatus = 
  | "idle"           // 空闲，未开始
  | "checking"       // 检查中（余额、资源等）
  | "approving"      // 授权中
  | "approved"       // 已授权
  | "depositing"     // 存入中
  | "deposited"      // 已存入
  | "claiming"       // 提取中
  | "claimed"        // 已提取
  // 模块3：隐私存入相关状态（对应CheckbookStatus）
  // 大状态1: 存入 -> 同步中 -> readyForCommitment
  | "depositing"                // 存入中（对应pending）
  | "syncing"                   // 同步中（对应unsigned）
  | "commitment_ready"          // readyForCommitment（对应ready_for_commitment）
  // 大状态2: 分配Allocation -> 签名 -> 提交Commitment -> 等待上链
  | "allocating"                // 分配Allocation中（在ready_for_commitment时调用createCommitment）
  | "signing"                   // 签名中（createCommitment的Step 2）
  | "generating_proof"          // 生成证明中（对应generating_proof）
  | "submitting_commitment"     // 提交Commitment到链上（对应submitting_commitment）
  | "commitment_pending_chain"  // 等待上链（对应commitment_pending）
  | "commitment_confirmed"      // 完成（对应with_checkbook）
  // 模块4：隐私提取相关状态（对应WithdrawRequestStatus）
  | "withdrawal_created"        // Withdrawal已创建（对应created）
  | "withdrawal_proving"        // 生成证明中（对应proving）
  | "withdrawal_proof_generated" // 证明已生成（对应proof_generated）
  | "withdrawal_submitting"     // 提交到链上（对应submitting）
  | "withdrawal_submitted"      // 已提交，等待确认（对应submitted）
  | "withdrawal_execute_confirmed" // 链上执行已确认（对应execute_confirmed）
  | "withdrawal_waiting_payout"    // 等待支付（对应waiting_for_payout）
  | "withdrawal_payout_processing" // 支付处理中（对应payout_processing）
  | "withdrawal_payout_completed"  // 支付完成（对应payout_completed）
  | "withdrawal_completed"         // Withdrawal完成（对应completed）
  | "completed"      // 已完成（通用）
  | "failed"         // 失败

/**
 * 任务执行结果
 */
export interface TaskExecutionResult {
  success: boolean
  status: TaskExecutionStatus
  error?: string
  txHash?: string
  depositId?: string
  commitment?: string
  allocationIds?: string[]
  withdrawalId?: string
  metadata?: Record<string, any>
}

/**
 * 任务执行上下文
 */
export interface TaskExecutionContext {
  task: Task
  chainId: number
  vaultAddress: string
  tokenAddress: string
  signerAddress: string
  sdk?: any // Enclave SDK实例（可选，用于enclave相关操作）
  onStatusUpdate?: (status: TaskExecutionStatus, metadata?: Record<string, any>) => void
  onProgress?: (progress: number, message?: string) => void
}

/**
 * 任务执行服务接口
 */
export interface ITaskExecutionService {
  /**
   * 执行任务
   */
  execute(context: TaskExecutionContext): Promise<TaskExecutionResult>
  
  /**
   * 获取当前状态
   */
  getStatus(): TaskExecutionStatus
  
  /**
   * 获取状态描述
   */
  getStatusDescription(): string
  
  /**
   * 取消执行
   */
  cancel(): void
}
