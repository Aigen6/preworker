/**
 * 任务执行服务基类
 */

import type { 
  TaskExecutionStatus, 
  TaskExecutionResult, 
  TaskExecutionContext,
  ITaskExecutionService 
} from "./types"

export abstract class BaseTaskExecutionService implements ITaskExecutionService {
  protected status: TaskExecutionStatus = "idle"
  protected context: TaskExecutionContext | null = null
  protected cancelled = false

  abstract execute(context: TaskExecutionContext): Promise<TaskExecutionResult>
  
  getStatus(): TaskExecutionStatus {
    return this.status
  }

  abstract getStatusDescription(): string

  cancel(): void {
    this.cancelled = true
  }

  protected setStatus(status: TaskExecutionStatus, metadata?: Record<string, any>): void {
    this.status = status
    if (this.context?.onStatusUpdate) {
      this.context.onStatusUpdate(status, metadata)
    }
  }

  protected checkCancelled(): void {
    if (this.cancelled) {
      throw new Error("任务执行已取消")
    }
  }

  protected async updateProgress(progress: number, message?: string): Promise<void> {
    if (this.context?.onProgress) {
      this.context.onProgress(progress, message)
    }
  }
}
