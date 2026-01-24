"use client"

import { useState, useRef, useEffect } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { X, QrCode } from "lucide-react"
import { validateAddressForSlip44, getAddressPlaceholder } from "@/lib/utils/address-validation"
import { useTranslation } from "@/lib/hooks/use-translation"
import { useToast } from "@/components/providers/toast-provider"

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  chainId: number | null | undefined
  placeholder?: string
  className?: string
  errorMessage?: string
  showValidation?: boolean
}

export function AddressInput({
  value,
  onChange,
  chainId,
  placeholder,
  className = "",
  errorMessage,
  showValidation = true,
}: AddressInputProps) {
  const { t } = useTranslation()
  const [isScanning, setIsScanning] = useState(false)
  const [isValid, setIsValid] = useState(true)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scanContainerRef = useRef<HTMLDivElement>(null)

  // 验证地址
  useEffect(() => {
    if (!value || !chainId) {
      setIsValid(true)
      return
    }
    setIsValid(validateAddressForSlip44(value, chainId))
  }, [value, chainId])

  // 获取占位符
  const defaultPlaceholder = getAddressPlaceholder(chainId, t)

  // 清除地址
  const handleClear = () => {
    onChange("")
  }

  // 开始扫描
  const handleStartScan = async () => {
    if (isScanning) {
      return
    }

    try {
      setIsScanning(true)
      const scanner = new Html5Qrcode("qr-reader")
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // 扫描成功，提取地址
          // 可能扫描到的是完整的 URL，需要提取地址部分
          let address = decodedText.trim()

          // 如果是 URL，尝试提取地址
          // 例如: ethereum:0x123... 或 https://...?address=0x123...
          const addressMatch = address.match(/(?:ethereum:|address=)(0x[a-fA-F0-9]{40})/i)
          if (addressMatch) {
            address = addressMatch[1]
          } else {
            // 尝试直接匹配地址格式
            const evmMatch = address.match(/0x[a-fA-F0-9]{40}/i)
            const tronMatch = address.match(/T[A-Za-z1-9]{33}/)
            if (evmMatch) {
              address = evmMatch[0]
            } else if (tronMatch) {
              address = tronMatch[0]
            }
          }

          // 验证地址
          if (validateAddressForSlip44(address, chainId)) {
            onChange(address)
            stopScan()
          } else {
            // 地址格式无效，但仍然设置（让用户看到）
            onChange(address)
            // 延迟停止，让用户看到错误提示
            setTimeout(() => {
              stopScan()
            }, 1000)
          }
        },
        (errorMessage) => {
          // 忽略扫描错误（持续扫描）
          // 只在非预期的错误时记录
          if (errorMessage && !errorMessage.includes("NotFoundException")) {
            // 静默处理
          }
        }
      )
    } catch (error: any) {
      console.error("启动二维码扫描失败:", error)
      setIsScanning(false)
      // 使用 Toast 显示错误提示
      if (error?.message?.includes("Permission denied") || error?.name === "NotAllowedError") {
        showError("无法访问摄像头，请检查浏览器权限设置")
      } else if (error?.message?.includes("NotFound") || error?.name === "NotFoundError") {
        showError("未找到摄像头设备")
      } else {
        showError("无法启动二维码扫描，请重试")
      }
    }
  }

  // 停止扫描
  const stopScan = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        await scannerRef.current.clear()
      } catch (error) {
        console.error("停止扫描失败:", error)
      }
      scannerRef.current = null
    }
    setIsScanning(false)
  }

  // 清理
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current?.clear()
          })
          .catch(() => {})
      }
    }
  }, [])

  const displayError = showValidation && value && !isValid
  const displayErrorMessage = errorMessage || (displayError ? "地址格式无效" : "")

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-10 px-3 pr-20 bg-black-2 border-2 rounded-lg text-white text-sm focus:outline-none focus:border-primary ${
            displayError ? "border-red-500" : "border-black-3"
          } ${className}`}
          placeholder={placeholder || defaultPlaceholder}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* 清除按钮 */}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 hover:bg-black-3 rounded-lg transition-colors"
              aria-label="清除"
            >
              <X className="w-4 h-4 text-white opacity-70 hover:opacity-100" />
            </button>
          )}
          {/* 二维码扫描按钮 */}
          <button
            type="button"
            onClick={isScanning ? stopScan : handleStartScan}
            className="p-1.5 hover:bg-black-3 rounded-lg transition-colors"
            aria-label={isScanning ? "停止扫描" : "扫描二维码"}
          >
            {isScanning ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <QrCode className="w-4 h-4 text-white opacity-70 hover:opacity-100" />
            )}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {displayErrorMessage && (
        <p className="text-xs text-red-500 mt-2">{displayErrorMessage}</p>
      )}

      {/* 二维码扫描器（隐藏） */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-black-2 rounded-[12px] p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white text-lg font-medium">扫描二维码</h3>
              <button
                onClick={stopScan}
                className="p-2 hover:bg-black-3 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div
              id="qr-reader"
              ref={scanContainerRef}
              className="w-full rounded-lg overflow-hidden"
            />
            <p className="text-sm text-black-9 mt-4 text-center">
              将二维码对准摄像头
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
