'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import SvgIcon from './SvgIcon'

interface InfoTooltipProps {
  content: string
  title?: string
  children: React.ReactNode
}

export function InfoTooltip({
  content,
  title,
  children,
}: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    // 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center"
      >
        {children}
      </div>
      {isOpen &&
        createPortal(
          <>
            {/* 遮罩层 */}
            <div
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setIsOpen(false)}
            />
            {/* 居中弹窗 */}
            <div
              ref={tooltipRef}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 p-4 bg-black-3 rounded-xl border border-black-3 shadow-lg min-w-[280px] max-w-[90vw] w-auto animate-in fade-in-0 zoom-in-95 duration-200"
            >
              {title && (
                <div className="flex items-center justify-between mb-3">
                  <span className="text-base font-medium text-main">
                    {title}
                  </span>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-5 h-5 flex items-center justify-center hover:opacity-70 transition-opacity shrink-0"
                    aria-label="关闭"
                  >
                    <SvgIcon
                      src="/icons/common-close.svg"
                      className="w-4 h-4 text-black-9"
                    />
                  </button>
                </div>
              )}
              <div>
                <p className="text-sm text-black-9 leading-relaxed">
                  {content}
                </p>
              </div>
              {/* 底部关闭按钮 */}
              <div className="mt-4 pt-4 border-t border-black-3">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full px-3 py-2 bg-black-3 text-black-9 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <span>关闭</span>
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}

