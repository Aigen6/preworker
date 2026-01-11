'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { Toast, ToastType } from '@/components/ui/toast'

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  showSuccess: (message: string, duration?: number) => void
  showError: (message: string, duration?: number) => void
  showWarning: (message: string, duration?: number) => void
  showInfo: (message: string, duration?: number) => void
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toast, setToast] = useState<{
    message: string
    type: ToastType
    isVisible: boolean
    duration?: number
  }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3000) => {
      setToast({
        message,
        type,
        isVisible: true,
        duration,
      })
    },
    []
  )

  const showSuccess = useCallback(
    (message: string, duration = 3000) => {
      showToast(message, 'success', duration)
    },
    [showToast]
  )

  const showError = useCallback(
    (message: string, duration = 3000) => {
      showToast(message, 'error', duration)
    },
    [showToast]
  )

  const showWarning = useCallback(
    (message: string, duration = 3000) => {
      showToast(message, 'warning', duration)
    },
    [showToast]
  )

  const showInfo = useCallback(
    (message: string, duration = 3000) => {
      showToast(message, 'info', duration)
    },
    [showToast]
  )

  const handleHide = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }))
  }, [])

  return (
    <ToastContext.Provider
      value={{ showToast, showSuccess, showError, showWarning, showInfo }}
    >
      {children}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onHide={handleHide}
        duration={toast.duration}
      />
    </ToastContext.Provider>
  )
}









