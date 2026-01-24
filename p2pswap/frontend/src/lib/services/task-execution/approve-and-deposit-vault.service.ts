/**
 * Approve + Deposit Vault 存入服务
 * 
 * 功能模块1：授权Token + 存入Deposit Vault
 * 状态流程：idle -> checking -> approving -> approved -> depositing -> deposited -> completed
 */

import { BaseTaskExecutionService } from "./base-service"
import type { TaskExecutionContext, TaskExecutionResult } from "./types"
import { getSignerService } from "../signer-service"
import { DEPOSIT_VAULT_ABI } from "@/lib/abis/deposit-vault"
import { ERC20_ABI } from "@/lib/abis/erc20"
import { parseToWei } from "@/lib/utils/amount-calculator"
import { getUSDTDecimals } from "@/lib/utils/token-decimals"

export class ApproveAndDepositVaultService extends BaseTaskExecutionService {
  private approveTxHash: string | null = null
  private depositTxHash: string | null = null
  private depositId: string | null = null

  async execute(context: TaskExecutionContext): Promise<TaskExecutionResult> {
    this.context = context
    this.cancelled = false
    this.approveTxHash = null
    this.depositTxHash = null
    this.depositId = null

    try {
      // 1. 检查阶段
      this.setStatus("checking")
      this.checkCancelled()
      await this.updateProgress(10, "检查余额和资源...")

      // 2. 授权阶段
      this.setStatus("approving")
      await this.updateProgress(20, "授权Token...")
      
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
      const decimals = getUSDTDecimals(context.chainId)
      
      // 计算总金额
      const intendedRecipients = context.task.intendedRecipients || [{
        recipient: context.task.targetAddress,
        amount: context.task.amount.toString(),
      }]
      
      const totalAmount = intendedRecipients.reduce(
        (sum, r) => sum + parseToWei(r.amount.toString(), decimals),
        BigInt(0)
      )

      // 检查当前授权额度
      const allowance = await signer.readContract(
        context.tokenAddress,
        ERC20_ABI,
        'allowance',
        [context.signerAddress, context.vaultAddress]
      )

      if (BigInt(allowance.toString()) < totalAmount) {
        // 需要授权
        this.approveTxHash = await signer.callContract(
          context.tokenAddress,
          ERC20_ABI,
          'approve',
          [context.vaultAddress, totalAmount],
          { gas: BigInt(100000) }
        )

        // 等待授权确认
        await signer.waitForTransaction(this.approveTxHash)
        this.setStatus("approved", { approveTxHash: this.approveTxHash })
      } else {
        this.setStatus("approved", { alreadyApproved: true })
      }

      await this.updateProgress(50, "授权完成")
      this.checkCancelled()

      // 3. 存入阶段
      this.setStatus("depositing")
      await this.updateProgress(60, "存入Deposit Vault...")

      const allocations = intendedRecipients.map((r) => ({
        recipient: r.recipient || r.address || context.task.targetAddress,
        amount: parseToWei(r.amount.toString(), decimals).toString(),
      }))

      this.depositTxHash = await signer.callContract(
        context.vaultAddress,
        DEPOSIT_VAULT_ABI,
        'deposit',
        [context.tokenAddress, totalAmount.toString(), allocations],
        { gas: BigInt(500000) }
      )

      // 等待交易确认
      const receipt = await signer.waitForTransaction(this.depositTxHash)
      
      // 从receipt中提取depositId（从事件日志中）
      // depositId通常在Deposit事件中
      const depositId = receipt?.logs?.[0]?.topics?.[1] || null
      this.depositId = depositId ? depositId.toString() : null

      this.setStatus("deposited", { 
        depositTxHash: this.depositTxHash,
        depositId: this.depositId 
      })
      await this.updateProgress(90, "存入完成")

      // 4. 完成
      this.setStatus("completed")
      await this.updateProgress(100, "操作完成")

      return {
        success: true,
        status: "completed",
        txHash: this.depositTxHash,
        depositId: this.depositId,
        metadata: {
          approveTxHash: this.approveTxHash,
          depositTxHash: this.depositTxHash,
        }
      }
    } catch (error: any) {
      this.setStatus("failed")
      return {
        success: false,
        status: "failed",
        error: error.message,
        txHash: this.depositTxHash || this.approveTxHash || undefined,
        depositId: this.depositId || undefined,
      }
    }
  }

  getStatusDescription(): string {
    const statusMap: Record<TaskExecutionStatus, string> = {
      idle: "等待开始",
      checking: "检查余额和资源",
      approving: "授权Token中",
      approved: "已授权",
      depositing: "存入Deposit Vault中",
      deposited: "已存入",
      claiming: "",
      claimed: "",
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
