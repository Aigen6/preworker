/**
 * 任务执行器
 * 
 * 根据任务类型，将任务映射到对应的服务模块
 */

import type { Task } from "@/lib/utils/task-manager"
import type { TaskExecutionContext, TaskExecutionResult, ITaskExecutionService } from "./types"
import { ApproveAndDepositVaultService } from "./approve-and-deposit-vault.service"
import { ClaimFromDepositVaultService } from "./claim-from-deposit-vault.service"
import { ApproveAndEnclaveDepositService } from "./approve-and-enclave-deposit.service"
import { EnclaveWithdrawService } from "./enclave-withdraw.service"
import { getUSDTAddress } from "@/lib/utils/wallet-utils"

/**
 * 任务执行器类
 */
export class TaskExecutor {
  private services: Map<string, ITaskExecutionService> = new Map()

  /**
   * 获取任务对应的服务实例
   */
  private getService(task: Task): ITaskExecutionService {
    const key = task.type

    if (!this.services.has(key)) {
      let service: ITaskExecutionService

      switch (task.type) {
        case "deposit":
          service = new ApproveAndDepositVaultService()
          break
        case "claim":
          service = new ClaimFromDepositVaultService()
          break
        case "enclave_deposit":
          service = new ApproveAndEnclaveDepositService()
          break
        case "enclave_withdraw":
          service = new EnclaveWithdrawService()
          break
        default:
          throw new Error(`不支持的任务类型: ${task.type}`)
      }

      this.services.set(key, service)
    }

    return this.services.get(key)!
  }

  /**
   * 执行任务
   */
  async execute(
    task: Task,
    chainId: number,
    vaultAddress: string,
    signerAddress: string,
    sdk?: any, // Enclave SDK实例（可选）
    onStatusUpdate?: (status: string, metadata?: Record<string, any>) => void,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<TaskExecutionResult> {
    const service = this.getService(task)

    const tokenAddress = getUSDTAddress(chainId)
    if (!tokenAddress) {
      throw new Error(`链 ${chainId} 的USDT地址未配置`)
    }

    const context: TaskExecutionContext = {
      task,
      chainId,
      vaultAddress,
      tokenAddress,
      signerAddress,
      sdk, // 传入SDK实例
      onStatusUpdate: (status, metadata) => {
        if (onStatusUpdate) {
          onStatusUpdate(status, metadata)
        }
      },
      onProgress,
    }

    return await service.execute(context)
  }

  /**
   * 获取任务当前状态
   */
  getTaskStatus(task: Task): string {
    const service = this.getService(task)
    return service.getStatus()
  }

  /**
   * 获取任务状态描述
   */
  getTaskStatusDescription(task: Task): string {
    const service = this.getService(task)
    return service.getStatusDescription()
  }

  /**
   * 取消任务执行
   */
  cancelTask(task: Task): void {
    const service = this.getService(task)
    service.cancel()
  }
}

// 单例实例
let executorInstance: TaskExecutor | null = null

/**
 * 获取任务执行器实例
 */
export function getTaskExecutor(): TaskExecutor {
  if (!executorInstance) {
    executorInstance = new TaskExecutor()
  }
  return executorInstance
}
