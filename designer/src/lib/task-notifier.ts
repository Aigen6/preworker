// 任务提醒工具

import type { Task } from "./task-manager"
import { isTaskReady } from "./task-manager"

/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("浏览器不支持通知")
    return false
  }

  if (Notification.permission === "granted") {
    return true
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission()
    return permission === "granted"
  }

  return false
}

/**
 * 发送通知
 */
export function sendNotification(title: string, options?: NotificationOptions) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return
  }

  new Notification(title, {
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    ...options,
  })
}

/**
 * 检查并提醒就绪的任务
 */
export function checkAndNotifyReadyTasks(
  tasks: Task[],
  notifiedTaskIds: Set<string>,
  onNewReadyTask: (task: Task) => void
): Set<string> {
  const currentTime = Math.floor(Date.now() / 1000)
  const newNotified = new Set(notifiedTaskIds)

  for (const task of tasks) {
    // 只提醒待处理且就绪的任务
    if (
      task.status === "pending" &&
      isTaskReady(task, currentTime) &&
      !newNotified.has(task.id)
    ) {
      newNotified.add(task.id)
      onNewReadyTask(task)
    }
  }

  return newNotified
}

/**
 * 启动任务监控
 */
export function startTaskMonitoring(
  tasks: Task[],
  onReadyTask: (task: Task) => void,
  checkInterval: number = 60000 // 默认每分钟检查一次
): () => void {
  let notifiedTaskIds = new Set<string>()
  let intervalId: NodeJS.Timeout | null = null

  const checkTasks = () => {
    notifiedTaskIds = checkAndNotifyReadyTasks(tasks, notifiedTaskIds, (task) => {
      // 发送浏览器通知
      sendNotification(`任务就绪: ${task.title}`, {
        body: task.description,
        tag: task.id,
      })
      // 调用回调
      onReadyTask(task)
    })
  }

  // 立即检查一次
  checkTasks()

  // 定期检查
  intervalId = setInterval(checkTasks, checkInterval)

  // 返回清理函数
  return () => {
    if (intervalId) {
      clearInterval(intervalId)
    }
  }
}
