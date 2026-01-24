/**
 * Deposit Vault 提出服务
 * 
 * 功能模块2：从Deposit Vault提取
 * 状态流程：idle -> checking -> claiming -> claimed -> completed
 */

import { BaseTaskExecutionService } from "./base-service"
import type { TaskExecutionContext, TaskExecutionResult } from "./types"
import { getSignerService } from "../signer-service"
import { DEPOSIT_VAULT_ABI } from "@/lib/abis/deposit-vault"

export class ClaimFromDepositVaultService extends BaseTaskExecutionService {
  private claimTxHash: string | null = null

  async execute(context: TaskExecutionContext): Promise<TaskExecutionResult> {
    this.context = context
    this.cancelled = false
    this.claimTxHash = null

    try {
      // 1. 检查阶段
      this.setStatus("checking")
      this.checkCancelled()
      await this.updateProgress(10, "检查Deposit信息...")

      // 获取depositId（从relatedTask或task本身）
      const depositId = context.task.depositId || 
        context.task.notes?.match(/DepositId:\s*(\w+)/)?.[1] ||
        null

      if (!depositId) {
        throw new Error("未找到Deposit ID，请先完成存入任务")
      }

      await this.updateProgress(30, "Deposit检查完成")

      // 2. 提取阶段
      this.setStatus("claiming")
      await this.updateProgress(50, "从Deposit Vault提取中...")

      const signerService = getSignerService()
      // 初始化signer（如果还未初始化）
      const privateKey = process.env.NEXT_PUBLIC_PRIVATE_KEY
      if (!privateKey) {
        throw new Error("未配置 NEXT_PUBLIC_PRIVATE_KEY")
      }
      await signerService.initialize({
        privateKey,
        chainId: context.chainId,
      })
      const signer = signerService

      this.claimTxHash = await signer.callContract(
        context.vaultAddress,
        DEPOSIT_VAULT_ABI,
        'claim',
        [depositId],
        { gas: BigInt(300000) }
      )

      // 等待交易确认
      await signer.waitForTransaction(this.claimTxHash)

      this.setStatus("claimed", { claimTxHash: this.claimTxHash })
      await this.updateProgress(90, "提取完成")

      // 3. 完成
      this.setStatus("completed")
      await this.updateProgress(100, "操作完成")

      return {
        success: true,
        status: "completed",
        txHash: this.claimTxHash,
        metadata: {
          depositId,
          claimTxHash: this.claimTxHash,
        }
      }
    } catch (error: any) {
      this.setStatus("failed")
      return {
        success: false,
        status: "failed",
        error: error.message,
        txHash: this.claimTxHash || undefined,
      }
    }
  }

  getStatusDescription(): string {
    const statusMap: Record<TaskExecutionStatus, string> = {
      idle: "等待开始",
      checking: "检查Deposit信息",
      approving: "",
      approved: "",
      depositing: "",
      deposited: "",
      claiming: "从Deposit Vault提取中",
      claimed: "已提取",
      creating_commitment: "",
      commitment_created: "",
      allocating: "",
      allocation_completed: "",
      withdrawing: "",
      withdrawn: "",
      completed: "已完成",
      failed: "执行失败",
    }
    return statusMap[this.status] || "未知状态"
  }
}
