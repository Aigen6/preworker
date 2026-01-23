"use client"

import { createContext, useContext, useState, useCallback, ReactNode } from "react"

interface ToastContextType {
  showError: (message: string) => void
  showWarning: (message: string) => void
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string
    type: "error" | "warning" | "success"
  } | null>(null)

  const showToast = useCallback(
    (message: string, type: "error" | "warning" | "success") => {
      setToast({ message, type })
      setTimeout(() => setToast(null), 3000)
    },
    []
  )

  const showError = useCallback((message: string) => showToast(message, "error"), [showToast])
  const showWarning = useCallback((message: string) => showToast(message, "warning"), [showToast])
  const showSuccess = useCallback((message: string) => showToast(message, "success"), [showToast])

  return (
    <ToastContext.Provider value={{ showError, showWarning, showSuccess }}>
      {children}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md">
          <div
            className={`${
              toast.type === "error"
                ? "bg-red-500"
                : toast.type === "warning"
                ? "bg-yellow-500"
                : "bg-green-500"
            } text-white p-3 rounded-lg`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return context
}
