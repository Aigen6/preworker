/**
 * 隐私提取服务
 * 
 * 功能模块4：从隐私池提取
 * 状态流程与SDK的WithdrawRequestStatus保持一致：
 * idle -> checking -> withdrawal_created -> withdrawal_proving -> 
 * withdrawal_proof_generated -> withdrawal_submitting -> withdrawal_submitted -> 
 * withdrawal_execute_confirmed -> withdrawal_waiting_payout -> withdrawal_payout_processing -> 
 * withdrawal_payout_completed -> withdrawal_completed -> completed
 */

import { BaseTaskExecutionService } from "./base-service"
import type { TaskExecutionContext, TaskExecutionResult } from "./types"
import { WithdrawRequestStatus } from "@enclave-hq/sdk"

export class EnclaveWithdrawService extends BaseTaskExecutionService {
  private withdrawalId: string | null = null

  async execute(context: TaskExecutionContext): Promise<TaskExecutionResult> {
    this.context = context
    this.cancelled = false
    this.withdrawalId = null

    try {
      // 1. 检查阶段
      this.setStatus("checking")
      this.checkCancelled()
      await this.updateProgress(10, "检查Allocation信息...")

      // 获取commitment（从relatedTask或task本身）
      const commitment = context.task.commitment || null

      if (!commitment) {
        throw new Error("未找到Commitment，请先完成存入和Allocation分配")
      }

      if (!context.task.targetAddress) {
        throw new Error("未找到目标地址")
      }

      await this.updateProgress(30, "Allocation检查完成")

      // 2. 提取阶段
      this.setStatus("withdrawing")
      await this.updateProgress(50, "从隐私池提取中...")

      // 获取SDK实例
      if (!context.sdk) {
        throw new Error("SDK 未初始化，请在TaskExecutionContext中传入SDK实例")
      }
      const sdk = context.sdk

      // 创建Withdrawal（从隐私池提取）
      const withdrawalResult = await sdk.createWithdrawal({
        commitment: commitment,
        recipient: context.task.targetAddress,
        amount: context.task.amount,
        currency: 'USDT',
      })

      this.withdrawalId = withdrawalResult.id
      this.setStatus("withdrawn", { withdrawalId: this.withdrawalId })
      await this.updateProgress(90, "提取完成")

      // 3. 完成
      this.setStatus("completed")
      await this.updateProgress(100, "操作完成")

      return {
        success: true,
        status: "completed",
        withdrawalId: this.withdrawalId,
        metadata: {
          commitment,
          withdrawalId: this.withdrawalId,
        }
      }
    } catch (error: any) {
      this.setStatus("failed")
      return {
        success: false,
        status: "failed",
        error: error.message,
        withdrawalId: this.withdrawalId || undefined,
      }
    }
  }

  /**
   * 根据WithdrawRequestStatus更新我们的状态
   */
  private updateStatusFromWithdrawal(withdrawalStatus: string): void {
    const statusMap: Record<string, TaskExecutionStatus> = {
      [WithdrawRequestStatus.Created]: "withdrawal_created",
      [WithdrawRequestStatus.Proving]: "withdrawal_proving",
      [WithdrawRequestStatus.ProofGenerated]: "withdrawal_proof_generated",
      [WithdrawRequestStatus.Submitting]: "withdrawal_submitting",
      [WithdrawRequestStatus.Submitted]: "withdrawal_submitted",
      [WithdrawRequestStatus.ExecuteConfirmed]: "withdrawal_execute_confirmed",
      [WithdrawRequestStatus.WaitingForPayout]: "withdrawal_waiting_payout",
      [WithdrawRequestStatus.PayoutProcessing]: "withdrawal_payout_processing",
      [WithdrawRequestStatus.PayoutCompleted]: "withdrawal_payout_completed",
      [WithdrawRequestStatus.Completed]: "withdrawal_completed",
      [WithdrawRequestStatus.CompletedWithHookFailed]: "withdrawal_completed",
      [WithdrawRequestStatus.ProofFailed]: "failed",
      [WithdrawRequestStatus.SubmitFailed]: "failed",
      [WithdrawRequestStatus.VerifyFailed]: "failed",
      [WithdrawRequestStatus.PayoutFailed]: "failed",
      [WithdrawRequestStatus.FailedPermanent]: "failed",
    }
    
    const mappedStatus = statusMap[withdrawalStatus] || "withdrawal_created"
    this.setStatus(mappedStatus)
  }

  /**
   * 等待Withdrawal状态变为目标状态
   */
  private async waitForWithdrawalStatus(
    withdrawalId: string,
    targetStatus: WithdrawRequestStatus,
    sdk: any,
    onStatusUpdate?: (status: string) => void,
    maxWaitTime: number = 600000 // 10分钟超时
  ): Promise<void> {
    const startTime = Date.now()
    const pollInterval = 3000 // 3秒轮询一次

    while (Date.now() - startTime < maxWaitTime) {
      this.checkCancelled()

      try {
        // 从SDK stores获取withdrawal
        const withdrawals = await sdk.stores.withdrawals.fetchList()
        const withdrawal = withdrawals.find((w: any) => w.id === withdrawalId)

        if (withdrawal) {
          const currentStatus = withdrawal.status
          
          if (onStatusUpdate) {
            onStatusUpdate(currentStatus)
          }

          if (currentStatus === targetStatus || 
              currentStatus === WithdrawRequestStatus.CompletedWithHookFailed) {
            return // 达到目标状态
          }

          // 检查是否失败
          if (currentStatus === WithdrawRequestStatus.ProofFailed ||
              currentStatus === WithdrawRequestStatus.SubmitFailed ||
              currentStatus === WithdrawRequestStatus.VerifyFailed ||
              currentStatus === WithdrawRequestStatus.PayoutFailed ||
              currentStatus === WithdrawRequestStatus.FailedPermanent) {
            throw new Error(`Withdrawal状态失败: ${currentStatus}`)
          }
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error: any) {
        if (error.message.includes("已取消")) {
          throw error
        }
        // 继续轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
    }

    throw new Error(`等待Withdrawal状态超时，目标状态: ${targetStatus}`)
  }

  getStatusDescription(): string {
    const statusMap: Record<TaskExecutionStatus, string> = {
      idle: "等待开始",
      checking: "检查Allocation信息",
      approving: "",
      approved: "",
      depositing: "",
      deposited: "",
      claiming: "",
      claimed: "",
      creating_commitment: "",
      commitment_pending: "",
      commitment_ready: "",
      generating_proof: "",
      submitting_commitment: "",
      commitment_pending_chain: "",
      commitment_confirmed: "",
      allocating: "",
      allocation_completed: "",
      withdrawal_created: "Withdrawal已创建",
      withdrawal_proving: "生成证明中",
      withdrawal_proof_generated: "证明已生成",
      withdrawal_submitting: "提交到链上",
      withdrawal_submitted: "已提交，等待确认",
      withdrawal_execute_confirmed: "链上执行已确认",
      withdrawal_waiting_payout: "等待支付",
      withdrawal_payout_processing: "支付处理中",
      withdrawal_payout_completed: "支付完成",
      withdrawal_completed: "Withdrawal完成",
      completed: "已完成",
      failed: "执行失败",
    }
    return statusMap[this.status] || "未知状态"
  }
}
