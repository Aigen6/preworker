"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import SvgIcon from "@/components/ui/SvgIcon"
import { useTranslation } from "@/lib/hooks/use-translation"

interface VoucherGeneratingSheetProps {
  onClose?: () => void
  status?: "generating" | "success" | "error"
  errorMessage?: string
}

export function VoucherGeneratingSheet({
  onClose,
  status = "generating",
  errorMessage,
}: VoucherGeneratingSheetProps) {
  const { t } = useTranslation()
  const [progress, setProgress] = useState(0)
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  const isCompleted = status === "success"

  // 模拟进度条动画 - 每秒增加10%，最多到90%
  useEffect(() => {
    // 清理之前的定时器
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }

    // 如果已完成，直接设置为100%
    if (isCompleted) {
      setProgress(100)
      return
    }

    // 重置进度条并启动定时器
    setProgress(0)

    // 否则，每秒增加10%，直到90%停止
    progressTimerRef.current = setInterval(() => {
        setProgress((prev) => {
        // 每秒增加10%，最多到90%
          if (prev >= 90) {
          // 达到90%后停止
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current)
            progressTimerRef.current = null
          }
          return 90
          }
        return prev + 10
        })
    }, 1000) as unknown as NodeJS.Timeout // 每秒执行一次

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [isCompleted])

  // 5秒后自动关闭（仅在 generating 状态）
  useEffect(() => {
    if (status === "generating" && onClose) {
      const autoCloseTimer = setTimeout(() => {
        console.log("⏰ [VoucherGeneratingSheet] 5秒自动关闭")
        onClose()
      }, 5000) // 5秒

      return () => clearTimeout(autoCloseTimer)
    }
  }, [status, onClose])

  // 获取状态文本
  const getStatusText = () => {
    switch (status) {
      case "generating":
        return t("voucher.generating")
      case "success":
        return t("voucher.generated")
      case "error":
        return t("voucher.generationFailed")
      default:
        return t("voucher.generating")
    }
  }

  return (
    <div className="bg-black-1 text-white flex flex-col justify-center items-center p-4 relative">
      {/* 关闭按钮 - 右上角 */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:opacity-70 transition-opacity z-10"
          title="关闭"
        >
          <SvgIcon
            src="/icons/common-close.svg"
            className="w-5 h-5 text-white"
          />
        </button>
      )}

      {/* 主要加载动画区域 */}
      <div className="flex flex-col items-center mt-16">
        <SvgIcon src="/icons/loading.svg" className="text-primary" />

        {/* 进度条 */}
        <div className="w-64 mb-8 mt-6">
          <div className="w-full h-2 bg-surface rounded-[20%] overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-100 ease-out rounded-[20%]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 状态文本 */}
        <h2 className="text-base font-medium text-black-9 mb-4">
          {getStatusText()}
        </h2>

        {/* 错误信息 */}
        {status === "error" && errorMessage && (
          <div className="w-full max-w-xs mb-4">
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
              <p className="text-xs text-danger break-all">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮区域 */}
      <div className="w-full max-w-xs space-y-3">
        {/* 完成/关闭按钮 */}
        {(status === "success" || status === "error") && (
          <button
            onClick={onClose}
            className="w-full bg-primary text-black py-3 rounded-xl font-medium text-sm hover:bg-primary-dark"
          >
            {status === "success" ? t("common.complete") : t("common.close")}
          </button>
        )}
        {/* 生成中状态也显示关闭按钮 */}
        {status === "generating" && onClose && (
          <button
            onClick={onClose}
            className="w-full bg-black-3 text-white py-3 rounded-xl font-medium text-sm hover:bg-black-2 border border-black-3"
          >
            {t("common.cancel")}
          </button>
        )}
      </div>
    </div>
  )
}
