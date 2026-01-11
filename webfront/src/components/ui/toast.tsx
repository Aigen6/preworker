'use client'

import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  message: string
  type?: ToastType
  isVisible: boolean
  onHide: () => void
  duration?: number
}

const toastConfig = {
  success: {
    bgColor: 'bg-primary',
    textColor: 'text-black',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M13.5 4.5L6 12L2.5 8.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  error: {
    bgColor: 'bg-danger',
    textColor: 'text-main',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 4L4 12M4 4L12 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  warning: {
    bgColor: 'bg-primary',
    textColor: 'text-on-primary',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 4V8M8 10H8.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  info: {
    bgColor: 'bg-black-3',
    textColor: 'text-main',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" />
        <path
          d="M8 6V8M8 10H8.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
}

export function Toast({ message, type = 'info', isVisible, onHide, duration = 3000 }: ToastProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isVisible) {
      setShow(true)
      const timer = setTimeout(() => {
        setShow(false)
        setTimeout(onHide, 300) // 等待动画完成后再调用 onHide
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isVisible, duration, onHide])

  if (!show) return null

  const config = toastConfig[type]

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999]">
      <div
        className={`${config.bgColor} ${config.textColor} px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 duration-300`}
      >
        {config.icon}
        <span className="font-medium">{message}</span>
      </div>
    </div>
  )
}

