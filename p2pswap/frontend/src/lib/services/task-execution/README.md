# 任务执行服务模块

## 概述

这个模块提供了四个独立的功能模块，每个模块都有完整的状态管理和执行逻辑：

1. **Approve + Deposit Vault存入** (`ApproveAndDepositVaultService`)
   - 状态流程：`idle` -> `checking` -> `approving` -> `approved` -> `depositing` -> `deposited` -> `completed`
   
2. **Deposit Vault提出** (`ClaimFromDepositVaultService`)
   - 状态流程：`idle` -> `checking` -> `claiming` -> `claimed` -> `completed`

3. **Approve + 隐私存入 + 凭证生成** (`ApproveAndEnclaveDepositService`)
   - 状态流程（与SDK的CheckbookStatus保持一致）:
     - `idle` -> `checking` -> `approving` -> `approved` 
     - -> `creating_commitment` -> `commitment_pending` -> `commitment_ready` 
     - -> `generating_proof` -> `submitting_commitment` -> `commitment_pending_chain` 
     - -> `commitment_confirmed` -> `allocating` -> `allocation_completed` -> `completed`
   - **状态映射**:
     - `commitment_pending`: 对应 `pending`/`unsigned`
     - `commitment_ready`: 对应 `ready_for_commitment`
     - `generating_proof`: 对应 `generating_proof`
     - `submitting_commitment`: 对应 `submitting_commitment`
     - `commitment_pending_chain`: 对应 `commitment_pending`
     - `commitment_confirmed`: 对应 `with_checkbook`（可以创建Allocation）

4. **隐私提取** (`EnclaveWithdrawService`)
   - 状态流程（与SDK的WithdrawRequestStatus保持一致）:
     - `idle` -> `checking` 
     - -> `withdrawal_created` -> `withdrawal_proving` -> `withdrawal_proof_generated` 
     - -> `withdrawal_submitting` -> `withdrawal_submitted` -> `withdrawal_execute_confirmed` 
     - -> `withdrawal_waiting_payout` -> `withdrawal_payout_processing` -> `withdrawal_payout_completed` 
     - -> `withdrawal_completed` -> `completed`
   - **状态映射**:
     - `withdrawal_created`: 对应 `created`
     - `withdrawal_proving`: 对应 `proving`
     - `withdrawal_proof_generated`: 对应 `proof_generated`
     - `withdrawal_submitting`: 对应 `submitting`
     - `withdrawal_submitted`: 对应 `submitted`
     - `withdrawal_execute_confirmed`: 对应 `execute_confirmed`
     - `withdrawal_waiting_payout`: 对应 `waiting_for_payout`
     - `withdrawal_payout_processing`: 对应 `payout_processing`
     - `withdrawal_payout_completed`: 对应 `payout_completed`
     - `withdrawal_completed`: 对应 `completed`

## 使用方法

### 基本使用

```typescript
import { getTaskExecutor } from "@/lib/services/task-execution"
import { useSDKStore } from "@/lib/stores/sdk-store"

// 获取任务执行器
const executor = getTaskExecutor()

// 获取SDK实例（用于enclave相关操作）
const sdkStore = useSDKStore()
const sdk = sdkStore.sdk

// 执行任务
const result = await executor.execute(
  task,                    // Task对象
  chainId,                 // 链ID
  vaultAddress,            // Vault地址
  signerAddress,           // 签名者地址
  sdk,                     // SDK实例（可选，enclave操作需要）
  (status, metadata) => {  // 状态更新回调
    console.log("状态更新:", status, metadata)
    // 更新任务的subStatus
    updateTask(task.id, { subStatus: status })
  },
  (progress, message) => { // 进度更新回调
    console.log("进度:", progress, message)
  }
)

if (result.success) {
  console.log("任务执行成功:", result)
  // 更新任务状态
  updateTask(task.id, {
    status: "completed",
    depositId: result.depositId,
    commitment: result.commitment,
    // ... 其他结果数据
  })
} else {
  console.error("任务执行失败:", result.error)
  updateTask(task.id, { status: "pending" })
}
```

### 与弹窗集成

每个功能模块都可以与对应的弹窗组件配合使用：

```typescript
import { TaskOperationConfirmDialog } from "@/components/task/task-operation-confirm-dialog"
import { getTaskExecutor } from "@/lib/services/task-execution"

// 在任务页面中
const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
const [currentTask, setCurrentTask] = useState<Task | null>(null)

// 打开确认弹窗
const handleExecuteTask = (task: Task) => {
  setCurrentTask(task)
  setConfirmDialogOpen(true)
}

// 确认执行
const handleConfirmExecute = async () => {
  if (!currentTask) return
  
  setConfirmDialogOpen(false)
  
  const executor = getTaskExecutor()
  const sdkStore = useSDKStore()
  
  try {
    const result = await executor.execute(
      currentTask,
      chainId,
      vaultAddress,
      signerAddress,
      sdkStore.sdk,
      (status, metadata) => {
        // 更新任务子状态
        handleTaskUpdate(currentTask.id, { subStatus: status })
      },
      (progress, message) => {
        // 显示进度
        console.log(`进度: ${progress}% - ${message}`)
      }
    )
    
    if (result.success) {
      showSuccess("任务执行成功")
      handleTaskUpdate(currentTask.id, {
        status: "completed",
        ...result.metadata
      })
    } else {
      showError(`执行失败: ${result.error}`)
    }
  } catch (error: any) {
    showError(`执行失败: ${error.message}`)
  }
}

// 渲染弹窗
{confirmDialogOpen && currentTask && (
  <TaskOperationConfirmDialog
    task={currentTask}
    isOpen={confirmDialogOpen}
    onClose={() => setConfirmDialogOpen(false)}
    onConfirm={handleConfirmExecute}
    operationType={currentTask.type}
    allTasks={tasks}
  />
)}
```

## 任务类型映射

- `deposit` -> `ApproveAndDepositVaultService`
- `claim` -> `ClaimFromDepositVaultService`
- `enclave_deposit` -> `ApproveAndEnclaveDepositService`
- `enclave_withdraw` -> `EnclaveWithdrawService`

## 状态说明

每个服务模块都有详细的状态，可以通过 `getTaskStatusDescription()` 获取状态描述：

```typescript
const executor = getTaskExecutor()
const statusDescription = executor.getTaskStatusDescription(task)
console.log(statusDescription) // 例如: "存入Deposit Vault中"
```

## 取消执行

如果需要取消正在执行的任务：

```typescript
executor.cancelTask(task)
```

## 注意事项

1. **SDK实例**：对于 `enclave_deposit` 和 `enclave_withdraw` 类型的任务，必须传入SDK实例
2. **Signer初始化**：Signer会自动从环境变量 `NEXT_PUBLIC_PRIVATE_KEY` 初始化
3. **状态更新**：建议在状态更新回调中同步更新任务的 `subStatus` 字段，以便在UI中显示详细状态
4. **错误处理**：所有服务都会捕获错误并返回 `TaskExecutionResult`，包含 `success` 和 `error` 字段
5. **状态同步**：
   - 模块3会自动轮询Checkbook状态，等待其变为 `with_checkbook` 后才创建Allocation
   - 模块4会自动轮询Withdrawal状态，等待其变为 `completed` 后才标记任务完成
   - 状态更新会实时反映SDK的实际状态，确保与后端处理流程一致
6. **超时设置**：
   - 模块3等待Checkbook状态超时：5分钟
   - 模块4等待Withdrawal状态超时：10分钟
