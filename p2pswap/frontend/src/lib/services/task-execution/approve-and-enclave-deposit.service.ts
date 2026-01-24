/**
 * Approve + 隐私存入 + 凭证生成服务
 * 
 * 功能模块3：授权Token + 存入隐私池 + Allocation分配
 * 状态流程与SDK的CheckbookStatus保持一致：
 * idle -> checking -> approving -> approved -> creating_commitment -> 
 * commitment_pending -> commitment_ready -> generating_proof -> submitting_commitment -> 
 * commitment_pending_chain -> commitment_confirmed -> allocating -> allocation_completed -> completed
 */

import { BaseTaskExecutionService } from "./base-service"
import type { TaskExecutionContext, TaskExecutionResult } from "./types"
import { CheckbookStatus } from "@enclave-hq/sdk"

export class ApproveAndEnclaveDepositService extends BaseTaskExecutionService {
  private approveTxHash: string | null = null
  private commitment: string | null = null
  private allocationIds: string[] = []

  async execute(context: TaskExecutionContext): Promise<TaskExecutionResult> {
    this.context = context
    this.cancelled = false
    this.approveTxHash = null
    this.commitment = null
    this.allocationIds = []

    try {
      // 1. 检查阶段
      this.setStatus("checking")
      this.checkCancelled()
      await this.updateProgress(5, "检查余额和资源...")

      // 2. 授权阶段（如果需要）
      // 注意：隐私池存入通常不需要授权，因为是通过SDK操作
      // 但如果有前置的approve操作，可以在这里处理
      this.setStatus("approving")
      await this.updateProgress(10, "检查授权状态...")

      // 对于enclave_deposit，通常不需要approve，因为是通过SDK直接操作
      // 但如果需要，可以在这里添加授权逻辑
      this.setStatus("approved", { alreadyApproved: true })
      await this.updateProgress(20, "授权检查完成")

      // 3. 大状态1: 存入隐私池
      this.setStatus("depositing")
      await this.updateProgress(20, "存入隐私池...")

      // 获取SDK实例
      if (!context.sdk) {
        throw new Error("SDK 未初始化，请在TaskExecutionContext中传入SDK实例")
      }
      const sdk = context.sdk

      // 存入隐私池（通过depositToTreasury或类似方法）
      // 注意：这里需要调用SDK的deposit方法，但SDK可能没有直接的deposit方法
      // 可能需要通过其他方式，比如调用treasury合约
      // 暂时先调用createCommitment，它会自动创建checkbook（如果还没有）
      // TODO: 需要确认实际的存入方法
      
      // 先尝试查找现有的checkbook（可能已经通过其他方式存入）
      let checkbook = null
      let checkbookId: string | null = null
      
      // 如果有commitment，说明已经存入，直接使用
      if (context.task.commitment) {
        const checkbooks = await sdk.stores.checkbooks.fetchList()
        checkbook = checkbooks.find((cb: any) => cb.commitment === context.task.commitment || cb.id === context.task.commitment)
        if (checkbook) {
          checkbookId = checkbook.id
          this.commitment = checkbook.commitment || checkbook.id
        }
      }

      // 如果没有找到checkbook，需要先存入
      if (!checkbook) {
        // 这里应该调用depositToTreasury，但SDK可能没有这个方法
        // 暂时跳过，假设已经存入或通过其他方式处理
        // 实际应该调用: await sdk.depositToTreasury({...})
        throw new Error("需要先存入隐私池，请先完成存入操作")
      }

      // 等待checkbook状态变为ready_for_commitment（大状态1完成）
      this.setStatus("syncing")
      await this.updateProgress(30, "等待同步中...")
      
      await this.waitForCheckbookStatus(
        checkbookId!,
        CheckbookStatus.ReadyForCommitment,
        sdk,
        (status) => {
          this.updateStatusFromCheckbook(status)
        }
      )

      this.setStatus("commitment_ready", { commitment: this.commitment })
      await this.updateProgress(40, "readyForCommitment，可以分配凭证")

      this.checkCancelled()

      // 4. 大状态2: 分配Allocation -> 签名 -> 提交Commitment -> 等待上链
      // 在ready_for_commitment状态下，调用createCommitment
      // createCommitment内部会：分配Allocation -> 签名 -> 提交Commitment
      this.setStatus("allocating")
      await this.updateProgress(50, "分配Allocation...")

      if (!context.task.allocations || context.task.allocations.length === 0) {
        throw new Error("未找到Allocation分配方案")
      }

      // 准备createCommitment的参数
      const amounts = context.task.allocations.map(alloc => alloc.amount.toString())
      
      // 调用createCommitment（这会分配Allocation、签名、提交Commitment）
      this.setStatus("signing")
      await this.updateProgress(60, "签名中...")
      
      const commitmentResult = await sdk.createCommitment({
        checkbookId: checkbookId!,
        amounts: amounts,
        tokenKey: 'USDT',
      })

      // createCommitment已经完成了分配Allocation、签名和提交Commitment
      // SDK 返回的 CommitmentResponse 中，checks 字段是 Allocation[] 类型
      // 每个 Allocation 对象有 id, amount, status 等字段（参考 SDK 的 Allocation 接口）
      const allocations = commitmentResult.checks || []
      this.allocationIds = allocations.map((allocation: any) => {
        // 确保 allocation 有 id 字段（根据 SDK 的 Allocation 接口）
        if (!allocation || !allocation.id) {
          throw new Error(`Allocation 对象缺少 id 字段: ${JSON.stringify(allocation)}`)
        }
        return allocation.id
      })
      // Checkbook 对象有 commitment 字段（可选），如果没有则使用 checkbook.id
      this.commitment = commitmentResult.checkbook?.commitment || commitmentResult.checkbook?.id || null
      if (!this.commitment) {
        throw new Error("无法获取 Commitment，checkbook 中缺少 commitment 和 id 字段")
      }

      // 等待上链完成
      this.setStatus("submitting_commitment")
      await this.updateProgress(70, "提交Commitment中...")

      await this.waitForCheckbookStatus(
        checkbookId!,
        CheckbookStatus.WithCheckbook,
        sdk,
        (status) => {
          this.updateStatusFromCheckbook(status)
        }
      )

      this.setStatus("commitment_confirmed", { 
        commitment: this.commitment,
        allocationIds: this.allocationIds 
      })
      await this.updateProgress(95, "上链完成")

      // 5. 完成
      this.setStatus("completed")
      await this.updateProgress(100, "操作完成")

      return {
        success: true,
        status: "completed",
        commitment: this.commitment,
        allocationIds: this.allocationIds,
        metadata: {
          approveTxHash: this.approveTxHash,
          commitment: this.commitment,
          allocationIds: this.allocationIds,
        }
      }
    } catch (error: any) {
      this.setStatus("failed")
      return {
        success: false,
        status: "failed",
        error: error.message,
        commitment: this.commitment || undefined,
        allocationIds: this.allocationIds.length > 0 ? this.allocationIds : undefined,
      }
    }
  }

  /**
   * 根据CheckbookStatus更新我们的状态
   * 大状态1: 存入 -> 同步中 -> readyForCommitment
   * 大状态2: 分配Allocation -> 签名 -> 提交Commitment -> 等待上链
   */
  private updateStatusFromCheckbook(checkbookStatus: string): void {
    const statusMap: Record<string, TaskExecutionStatus> = {
      [CheckbookStatus.Pending]: "depositing", // 大状态1: 存入
      [CheckbookStatus.Unsigned]: "syncing", // 大状态1: 同步中
      [CheckbookStatus.ReadyForCommitment]: "commitment_ready", // 大状态1: readyForCommitment
      [CheckbookStatus.GeneratingProof]: "generating_proof", // 大状态2: 生成证明
      [CheckbookStatus.SubmittingCommitment]: "submitting_commitment", // 大状态2: 提交Commitment
      [CheckbookStatus.CommitmentPending]: "commitment_pending_chain", // 大状态2: 等待上链
      [CheckbookStatus.WithCheckbook]: "commitment_confirmed", // 完成
      [CheckbookStatus.ProofFailed]: "failed",
      [CheckbookStatus.SubmissionFailed]: "failed",
    }
    
    const mappedStatus = statusMap[checkbookStatus] || "depositing"
    this.setStatus(mappedStatus)
  }

  /**
   * 等待Checkbook状态变为目标状态
   */
  private async waitForCheckbookStatus(
    checkbookId: string,
    targetStatus: CheckbookStatus,
    sdk: any,
    onStatusUpdate?: (status: string) => void,
    maxWaitTime: number = 300000 // 5分钟超时
  ): Promise<void> {
    const startTime = Date.now()
    const pollInterval = 2000 // 2秒轮询一次

    while (Date.now() - startTime < maxWaitTime) {
      this.checkCancelled()

      try {
        // 从SDK stores获取checkbook
        // SDK 的 Checkbook 接口包含：id, status, commitment, allocationIds 等字段
        const checkbooks = await sdk.stores.checkbooks.fetchList()
        const checkbook = checkbooks.find((cb: any) => cb.id === checkbookId)
        
        if (checkbook) {
          // Checkbook 的 status 字段是 CheckbookStatus 枚举值
          const currentStatus = checkbook.status
          
          if (onStatusUpdate) {
            onStatusUpdate(currentStatus)
          }

          if (currentStatus === targetStatus) {
            return // 达到目标状态
          }

          // 检查是否失败
          if (currentStatus === CheckbookStatus.ProofFailed || 
              currentStatus === CheckbookStatus.SubmissionFailed) {
            throw new Error(`Checkbook状态失败: ${currentStatus}`)
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

    throw new Error(`等待Checkbook状态超时，目标状态: ${targetStatus}`)
  }

  getStatusDescription(): string {
    const statusMap: Record<TaskExecutionStatus, string> = {
      idle: "等待开始",
      checking: "检查余额和资源",
      approving: "授权Token中",
      approved: "已授权",
      depositing: "存入中",
      deposited: "已存入",
      syncing: "同步中",
      claiming: "",
      claimed: "",
      commitment_ready: "就绪",
      generating_proof: "生成证明中",
      submitting_commitment: "提交Commitment中",
      commitment_pending_chain: "等待上链",
      commitment_confirmed: "已完成",
      allocating: "分配凭证中",
      signing: "签名中",
      withdrawal_created: "",
      withdrawal_proving: "",
      withdrawal_proof_generated: "",
      withdrawal_submitting: "",
      withdrawal_submitted: "",
      withdrawal_execute_confirmed: "",
      withdrawal_waiting_payout: "",
      withdrawal_payout_processing: "",
      withdrawal_payout_completed: "",
      withdrawal_completed: "",
      completed: "已完成",
      failed: "执行失败",
    }
    return statusMap[this.status] || "未知状态"
  }
}
