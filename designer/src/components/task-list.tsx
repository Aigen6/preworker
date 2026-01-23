"use client"

import { useState, useEffect } from "react"
import type { Task, TaskGroup } from "@/lib/task-manager"
import {
  formatTime,
  formatDateTime,
  getTaskStatusText,
  getTaskPriorityColor,
  isTaskReady,
  groupTasksByDate,
} from "@/lib/task-manager"

interface TaskListProps {
  tasks: Task[]
  onTaskComplete: (taskId: string) => void
  onTaskSkip: (taskId: string) => void
  onTaskStart: (taskId: string) => void
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void
}

export function TaskList({
  tasks,
  onTaskComplete,
  onTaskSkip,
  onTaskStart,
  onTaskUpdate,
}: TaskListProps) {
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000))
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<"all" | "pending" | "ready" | "completed">("all")

  // 更新当前时间
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000))
    }, 1000) // 每秒更新

    return () => clearInterval(interval)
  }, [])

  // 过滤任务
  const filteredTasks = tasks.filter((task) => {
    if (filter === "all") return true
    if (filter === "pending") return task.status === "pending"
    if (filter === "ready") return task.status === "ready" || isTaskReady(task, currentTime)
    if (filter === "completed") return task.status === "completed"
    return true
  })

  // 按日期分组
  const taskGroups = groupTasksByDate(filteredTasks)

  // 展开/折叠组
  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  // 展开所有组
  useEffect(() => {
    const allGroupIds = new Set(taskGroups.map((g) => g.id))
    setExpandedGroups(allGroupIds)
  }, [taskGroups.length])

  return (
    <div className="space-y-4">
      {/* 过滤器 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "all"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          全部
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "pending"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          待处理
        </button>
        <button
          onClick={() => setFilter("ready")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "ready"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          就绪
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`px-4 py-2 rounded-[8px] text-sm ${
            filter === "completed"
              ? "bg-primary text-black"
              : "bg-black-3 text-white hover:bg-black-4"
          }`}
        >
          已完成
        </button>
      </div>

      {/* 任务组列表 */}
      {taskGroups.length === 0 ? (
        <div className="text-center py-8 text-black-9">
          暂无任务
        </div>
      ) : (
        taskGroups.map((group) => (
          <TaskGroup
            key={group.id}
            group={group}
            isExpanded={expandedGroups.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            currentTime={currentTime}
            onTaskComplete={onTaskComplete}
            onTaskSkip={onTaskSkip}
            onTaskStart={onTaskStart}
            onTaskUpdate={onTaskUpdate}
          />
        ))
      )}
    </div>
  )
}

interface TaskGroupProps {
  group: TaskGroup
  isExpanded: boolean
  onToggle: () => void
  currentTime: number
  onTaskComplete: (taskId: string) => void
  onTaskSkip: (taskId: string) => void
  onTaskStart: (taskId: string) => void
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void
}

function TaskGroup({
  group,
  isExpanded,
  onToggle,
  currentTime,
  onTaskComplete,
  onTaskSkip,
  onTaskStart,
  onTaskUpdate,
}: TaskGroupProps) {
  const completedCount = group.tasks.filter((t) => t.status === "completed").length
  const totalCount = group.tasks.length

  return (
    <div className="bg-black-2 rounded-[12px] border border-black-4">
      {/* 组标题 */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-black-3 transition-colors rounded-t-[12px]"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-medium">{group.title}</span>
          <span className="text-black-9 text-sm">
            {completedCount} / {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black-9 text-xs">
            {formatTime(group.startTime)} - {formatTime(group.endTime)}
          </span>
          <svg
            className={`w-5 h-5 text-black-9 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* 任务列表 */}
      {isExpanded && (
        <div className="p-4 space-y-2 border-t border-black-4">
          {group.tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              currentTime={currentTime}
              onComplete={() => onTaskComplete(task.id)}
              onSkip={() => onTaskSkip(task.id)}
              onStart={() => onTaskStart(task.id)}
              onUpdate={(updates) => onTaskUpdate(task.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TaskItemProps {
  task: Task
  currentTime: number
  onComplete: () => void
  onSkip: () => void
  onStart: () => void
  onUpdate: (updates: Partial<Task>) => void
}

function TaskItem({
  task,
  currentTime,
  onComplete,
  onSkip,
  onStart,
  onUpdate,
}: TaskItemProps) {
  const isReady = isTaskReady(task, currentTime) || task.status === "ready"
  const statusText = getTaskStatusText(task)
  const statusColor = getTaskPriorityColor(task)

  return (
    <div
      className={`p-4 rounded-[8px] border ${
        task.status === "completed"
          ? "bg-green-500/10 border-green-500/30"
          : task.status === "in_progress"
          ? "bg-primary/10 border-primary/30"
          : isReady
          ? "bg-yellow-500/10 border-yellow-500/30"
          : "bg-black-3 border-black-4"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* 左侧：任务信息 */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={task.status === "completed"}
              onChange={(e) => {
                if (e.target.checked) {
                  onComplete()
                } else {
                  onUpdate({ status: "pending" })
                }
              }}
              className="w-5 h-5 rounded border-black-4 bg-black-2 text-primary focus:ring-primary"
            />
            <span className="text-white font-medium">{task.title}</span>
            <span
              className={`px-2 py-1 rounded-[4px] text-xs ${
                task.type === "deposit"
                  ? "bg-blue-500/20 text-blue-500"
                  : task.type === "withdraw"
                  ? "bg-purple-500/20 text-purple-500"
                  : "bg-gray-500/20 text-gray-500"
              }`}
            >
              {task.type === "deposit" ? "存入" : task.type === "withdraw" ? "提取" : "正常"}
            </span>
            {task.type === "deposit" && (
              <span className="px-2 py-1 rounded-[4px] text-xs bg-red-500/20 text-red-500">
                高风险
              </span>
            )}
          </div>

          <p className="text-black-9 text-sm mb-2">{task.description}</p>

          <div className="flex items-center gap-4 text-xs text-black-9 mb-2">
            <span>金额: {task.amount} USDT</span>
            <span>链: {task.chain}</span>
            <span className={statusColor}>{statusText}</span>
            <span>时间: {formatDateTime(task.scheduledTime)}</span>
          </div>

          {/* 步骤进度 */}
          <div className="flex gap-2 mt-2">
            {task.steps.map((step, index) => (
              <div
                key={index}
                className={`px-2 py-1 rounded-[4px] text-xs ${
                  step.status === "completed"
                    ? "bg-green-500/20 text-green-500"
                    : step.status === "processing"
                    ? "bg-primary/20 text-primary"
                    : "bg-black-4 text-black-9"
                }`}
              >
                {step.step === "preprocess"
                  ? "预处理"
                  : step.step === "enclave"
                  ? "隐私化"
                  : "转入"}
              </div>
            ))}
          </div>

          {/* 备注 */}
          {task.notes && (
            <div className="mt-2 p-2 bg-black-4 rounded-[4px] text-xs text-black-9">
              {task.notes}
            </div>
          )}
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex flex-col gap-2">
          {task.status === "pending" && isReady && (
            <button
              onClick={onStart}
              className="px-3 py-1 bg-primary text-black text-xs rounded-[6px] hover:opacity-80"
            >
              开始
            </button>
          )}
          {task.status === "in_progress" && (
            <button
              onClick={onComplete}
              className="px-3 py-1 bg-green-500 text-white text-xs rounded-[6px] hover:opacity-80"
            >
              完成
            </button>
          )}
          {task.status !== "completed" && task.status !== "skipped" && (
            <button
              onClick={onSkip}
              className="px-3 py-1 bg-gray-500 text-white text-xs rounded-[6px] hover:opacity-80"
            >
              跳过
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
