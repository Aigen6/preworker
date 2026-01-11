'use client'

import { useEffect, useState } from 'react'

interface SuccessToastProps {
  message: string
  isVisible: boolean
  onHide: () => void
  duration?: number
}

export function SuccessToast({ message, isVisible, onHide, duration = 1000 }: SuccessToastProps) {
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

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-9999">
      <div className="bg-primary text-black px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
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
        <span className="font-medium">{message}</span>
      </div>
    </div>
  )
}
