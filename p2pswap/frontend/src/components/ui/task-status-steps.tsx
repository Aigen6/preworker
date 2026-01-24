/**
 * 任务状态步骤组件
 * 根据任务类型和当前状态显示执行步骤
 */

'use client'

import { useEffect, useRef } from "react"
import type { Task } from "@/lib/utils/task-manager"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"

interface TaskStatusStepsProps {
  task: Task
}

interface Step {
  key: string
  label: string
  status: 'pending' | 'active' | 'completed' | 'failed'
}

/**
 * 获取任务步骤配置
 */
function getTaskSteps(task: Task): Step[] {
  const { type, status, subStatus } = task

  // 根据任务类型和状态确定步骤
  switch (type) {
    case 'deposit': {
      // Approve + Deposit Vault存入
      const steps: Step[] = [
        { key: 'checking', label: '检查资源', status: 'pending' },
        { key: 'approving', label: '授权Token', status: 'pending' },
        { key: 'depositing', label: '存入Vault', status: 'pending' },
        { key: 'completed', label: '完成', status: 'pending' },
      ]

      if (status === 'completed') {
        steps.forEach(step => step.status = 'completed')
      } else if (status === 'in_progress') {
        if (subStatus === 'checking') {
          steps[0].status = 'active'
        } else if (subStatus === 'approving' || subStatus === 'approved') {
          steps[0].status = 'completed'
          steps[1].status = subStatus === 'approving' ? 'active' : 'completed'
        } else if (subStatus === 'depositing' || subStatus === 'deposited') {
          steps[0].status = 'completed'
          steps[1].status = 'completed'
          steps[2].status = subStatus === 'depositing' ? 'active' : 'completed'
        } else {
          steps[0].status = 'active'
        }
      }

      return steps
    }

    case 'claim': {
      // Deposit Vault提出
      const steps: Step[] = [
        { key: 'checking', label: '检查Deposit', status: 'pending' },
        { key: 'claiming', label: '提取中', status: 'pending' },
        { key: 'completed', label: '完成', status: 'pending' },
      ]

      if (status === 'completed') {
        steps.forEach(step => step.status = 'completed')
      } else if (status === 'in_progress') {
        if (subStatus === 'checking') {
          steps[0].status = 'active'
        } else if (subStatus === 'claiming' || subStatus === 'claimed') {
          steps[0].status = 'completed'
          steps[1].status = subStatus === 'claiming' ? 'active' : 'completed'
        } else {
          steps[0].status = 'active'
        }
      }

      return steps
    }

    case 'enclave_deposit': {
      // 大状态1: 存入 -> 同步中 -> readyForCommitment
      // 大状态2: 分配Allocation -> 签名 -> 提交Commitment -> 等待上链
      const steps: Step[] = [
        { key: 'depositing', label: '存入', status: 'pending' },
        { key: 'syncing', label: '同步中', status: 'pending' },
        { key: 'ready_for_commitment', label: '就绪', status: 'pending' },
        { key: 'allocating', label: '分配凭证', status: 'pending' },
        { key: 'signing', label: '签名', status: 'pending' },
        { key: 'submitting', label: '提交Commitment', status: 'pending' },
        { key: 'waiting_chain', label: '等待上链', status: 'pending' },
        { key: 'completed', label: '完成', status: 'pending' },
      ]

      if (status === 'completed') {
        steps.forEach(step => step.status = 'completed')
      } else if (status === 'in_progress') {
        // 根据subStatus设置步骤状态
        // 大状态1: 存入 -> 同步中 -> readyForCommitment
        // 大状态2: 分配Allocation -> 签名 -> 提交Commitment -> 等待上链
        const statusMap: Record<string, number> = {
          // 大状态1
          'checking': 0,
          'approving': 0,
          'approved': 0,
          'depositing': 0, // 存入 (pending)
          'deposited': 0,
          'syncing': 1, // 同步中 (unsigned)
          'commitment_pending': 1, // 同步中 (pending/unsigned)
          'commitment_ready': 2, // readyForCommitment (ready_for_commitment)
          // 大状态2
          'allocating': 3, // 分配Allocation (在ready_for_commitment时调用createCommitment)
          'allocation_completed': 3,
          'signing': 4, // 签名 (createCommitment的Step 2)
          'generating_proof': 5, // 生成证明 (generating_proof)
          'submitting_commitment': 6, // 提交Commitment (submitting_commitment)
          'commitment_pending_chain': 7, // 等待上链 (commitment_pending)
          'commitment_confirmed': 8, // 完成 (with_checkbook)
        }

        const currentStepIndex = statusMap[subStatus || ''] ?? 0

        for (let i = 0; i < steps.length; i++) {
          if (i < currentStepIndex) {
            steps[i].status = 'completed'
          } else if (i === currentStepIndex) {
            steps[i].status = 'active'
          } else {
            steps[i].status = 'pending'
          }
        }
      }

      return steps
    }

    case 'enclave_withdraw': {
      // 隐私提取
      const steps: Step[] = [
        { key: 'checking', label: '检查Allocation', status: 'pending' },
        { key: 'withdrawal_created', label: '创建Withdrawal', status: 'pending' },
        { key: 'withdrawal_proving', label: '生成证明', status: 'pending' },
        { key: 'withdrawal_submitting', label: '提交到链上', status: 'pending' },
        { key: 'withdrawal_payout', label: '处理支付', status: 'pending' },
        { key: 'completed', label: '完成', status: 'pending' },
      ]

      if (status === 'completed') {
        steps.forEach(step => step.status = 'completed')
      } else if (status === 'in_progress') {
        // 根据subStatus设置步骤状态
        const statusMap: Record<string, number> = {
          'checking': 0,
          'withdrawal_created': 1,
          'withdrawal_proving': 2,
          'withdrawal_proof_generated': 2,
          'withdrawal_submitting': 3,
          'withdrawal_submitted': 3,
          'withdrawal_execute_confirmed': 3,
          'withdrawal_waiting_payout': 4,
          'withdrawal_payout_processing': 4,
          'withdrawal_payout_completed': 4,
          'withdrawal_completed': 5,
        }

        const currentStepIndex = statusMap[subStatus || ''] ?? 0

        for (let i = 0; i < steps.length; i++) {
          if (i < currentStepIndex) {
            steps[i].status = 'completed'
          } else if (i === currentStepIndex) {
            steps[i].status = 'active'
          } else {
            steps[i].status = 'pending'
          }
        }
      }

      return steps
    }

    default:
      return []
  }
}

export function TaskStatusSteps({ task }: TaskStatusStepsProps) {
  const steps = getTaskSteps(task)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastScrolledIndexRef = useRef<number>(-1)

  // 找到当前活跃的步骤索引
  const activeStepIndex = steps.findIndex(step => step.status === 'active')
  const lastCompletedStepIndex = steps.findIndex(
    (step, index) => step.status === 'completed' && 
    (index === steps.length - 1 || steps[index + 1].status !== 'completed')
  )
  // 如果有活跃步骤，使用活跃步骤；否则使用最后一个完成的步骤
  const targetStepIndex = activeStepIndex >= 0 ? activeStepIndex : lastCompletedStepIndex

  // 自动滚动到当前步骤（居中显示）
  useEffect(() => {
    // 如果目标步骤索引无效，或者与上次滚动的是同一个步骤，则跳过
    if (targetStepIndex < 0 || targetStepIndex === lastScrolledIndexRef.current || !scrollContainerRef.current) {
      return
    }

    const container = scrollContainerRef.current
    const targetStep = stepRefs.current[targetStepIndex]

    if (!targetStep) {
      // 如果步骤元素还未渲染，等待下一个渲染周期
      return
    }

    // 使用 requestAnimationFrame 确保 DOM 已更新
    requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect()
      const stepRect = targetStep.getBoundingClientRect()
      
      // 计算步骤相对于容器的位置
      const stepLeft = stepRect.left - containerRect.left + container.scrollLeft
      const stepWidth = stepRect.width
      const containerWidth = containerRect.width
      
      // 计算目标滚动位置（使步骤居中）
      const targetScrollLeft = stepLeft - (containerWidth / 2) + (stepWidth / 2)
      
      // 限制滚动范围
      const maxScrollLeft = container.scrollWidth - containerWidth
      const finalScrollLeft = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft))
      
      // 检查是否需要滚动（如果已经在可见区域内，可能不需要滚动）
      const currentScrollLeft = container.scrollLeft
      const scrollThreshold = 20 // 如果距离目标位置小于20px，不滚动
      
      if (Math.abs(currentScrollLeft - finalScrollLeft) > scrollThreshold) {
        // 平滑滚动到目标位置
        container.scrollTo({
          left: finalScrollLeft,
          behavior: 'smooth'
        })
        lastScrolledIndexRef.current = targetStepIndex
      }
    })
  }, [targetStepIndex, task.status, task.subStatus])

  if (steps.length === 0) {
    return null
  }

  return (
    <div className="mt-3">
      <div 
        ref={scrollContainerRef}
        className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-black-4 scrollbar-track-transparent scroll-smooth"
        style={{
          scrollbarWidth: 'thin',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {steps.map((step, index) => (
          <div 
            key={step.key} 
            ref={(el) => { stepRefs.current[index] = el }}
            className="flex items-center gap-1 flex-shrink-0"
          >
            {/* 步骤连接线 */}
            {index > 0 && (
              <div
                className={`w-4 sm:w-6 h-0.5 transition-colors flex-shrink-0 ${
                  steps[index - 1].status === 'completed'
                    ? 'bg-primary'
                    : 'bg-black-4'
                }`}
              />
            )}

            {/* 步骤节点 */}
            <div className="flex flex-col items-center gap-0.5 sm:gap-1 min-w-[50px] sm:min-w-[60px] flex-shrink-0">
              <div
                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                  step.status === 'completed'
                    ? 'bg-primary text-black'
                    : step.status === 'active'
                    ? 'bg-primary/20 text-primary border-2 border-primary animate-pulse'
                    : 'bg-black-4 text-black-9 border-2 border-black-4'
                }`}
              >
                {step.status === 'completed' ? (
                  <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
                ) : step.status === 'active' ? (
                  <Loader2 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 animate-spin" />
                ) : (
                  <Circle className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />
                )}
              </div>
              <span
                className={`text-[9px] sm:text-[10px] whitespace-nowrap text-center max-w-[50px] sm:max-w-[60px] truncate ${
                  step.status === 'completed'
                    ? 'text-primary'
                    : step.status === 'active'
                    ? 'text-primary font-semibold'
                    : 'text-black-9'
                }`}
                title={step.label}
              >
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 当前状态描述 */}
      {task.status === 'in_progress' && task.subStatus && (
        <div className="mt-2 px-2 py-1 bg-primary/10 text-primary text-xs rounded text-center">
          {getStatusDescription(task.subStatus)}
        </div>
      )}
    </div>
  )
}

/**
 * 获取状态描述
 */
function getStatusDescription(subStatus: string): string {
  const descriptions: Record<string, string> = {
    checking: '检查中',
    approving: '授权中',
    approved: '已授权',
    depositing: '存入中',
    deposited: '已存入',
    syncing: '同步中',
    claiming: '提取中',
    claimed: '已提取',
    creating_commitment: '创建Commitment中',
    commitment_pending: '同步中',
    commitment_ready: '就绪',
    ready_for_commitment: '就绪',
    generating_proof: '生成证明中',
    submitting_commitment: '提交Commitment中',
    commitment_pending_chain: '等待上链',
    commitment_confirmed: '已完成',
    allocating: '分配凭证中',
    allocation_completed: '分配完成',
    signing: '签名中',
    withdrawal_created: 'Withdrawal已创建',
    withdrawal_proving: '生成证明中',
    withdrawal_proof_generated: '证明已生成',
    withdrawal_submitting: '提交到链上',
    withdrawal_submitted: '已提交，等待确认',
    withdrawal_execute_confirmed: '链上执行已确认',
    withdrawal_waiting_payout: '等待支付',
    withdrawal_payout_processing: '支付处理中',
    withdrawal_payout_completed: '支付完成',
    withdrawal_completed: 'Withdrawal完成',
  }

  return descriptions[subStatus] || subStatus
}
