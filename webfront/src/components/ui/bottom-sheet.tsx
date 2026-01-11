'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils/cn'
import SvgIcon from './SvgIcon'

// 全局计数器，跟踪打开的 BottomSheet 数量
let openBottomSheetCount = 0

// 全局清理函数，确保在页面卸载时恢复滚动
if (typeof window !== 'undefined') {
  // 页面加载时确保滚动状态正常
  const initializeScrollState = () => {
    // 强制重置计数器（页面加载时不应该有任何打开的 BottomSheet）
    // 如果 body 或 main 的 overflow 被设置为 hidden，恢复滚动
    if (document.body.style.overflow === 'hidden') {
      document.body.style.overflow = ''
      // 如果计数器不为 0，说明状态异常，重置它
      if (openBottomSheetCount > 0) {
        console.warn('[BottomSheet] 检测到异常状态：页面加载时计数器不为 0，已重置')
        openBottomSheetCount = 0
      }
    }
    const mainElement = document.querySelector('main') as HTMLElement
    if (mainElement) {
      // 如果 main 元素的 overflow 被设置为 hidden，恢复滚动
      // 移除内联样式，让 CSS 类（如 overflow-y-auto）生效
      if (mainElement.style.overflow === 'hidden' || mainElement.style.overflowY === 'hidden') {
        mainElement.style.overflow = ''
        mainElement.style.overflowY = ''
      }
    }
  }
  
  // 立即执行一次（防止脚本加载时状态异常）
  if (document.readyState === 'loading') {
    // 使用 setTimeout 确保在 DOM 构建后执行
    setTimeout(initializeScrollState, 0)
    document.addEventListener('DOMContentLoaded', initializeScrollState)
  } else {
    // 如果 DOM 已经加载完成，立即检查
    initializeScrollState()
  }
  
  // 页面完全加载后再次检查（防止异步加载导致的问题）
  window.addEventListener('load', initializeScrollState)
  
  // 使用 requestAnimationFrame 确保在下一帧执行（更可靠）
  requestAnimationFrame(() => {
    initializeScrollState()
  })
  
  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    document.body.style.overflow = ''
    const mainElement = document.querySelector('main') as HTMLElement
    if (mainElement) {
      mainElement.style.overflow = ''
    }
    openBottomSheetCount = 0
  })
  
  // 页面可见性变化时也恢复滚动（防止页面隐藏时状态异常）
  document.addEventListener('visibilitychange', () => {
    const mainElement = document.querySelector('main') as HTMLElement
    if (document.hidden && openBottomSheetCount > 0) {
      // 页面隐藏时，如果还有打开的 BottomSheet，暂时恢复滚动
      // 页面重新可见时会重新锁定（如果 BottomSheet 还在）
      document.body.style.overflow = ''
      if (mainElement) {
        mainElement.style.overflow = ''
        mainElement.style.overflowY = ''
      }
    } else if (!document.hidden && openBottomSheetCount > 0) {
      // 页面重新可见时，如果还有打开的 BottomSheet，重新锁定滚动
      document.body.style.overflow = 'hidden'
      if (mainElement) {
        mainElement.style.overflow = 'hidden'
        mainElement.style.overflowY = 'hidden'
      }
    } else if (!document.hidden && openBottomSheetCount === 0) {
      // 页面重新可见且没有打开的 BottomSheet，确保滚动恢复
      document.body.style.overflow = ''
      if (mainElement) {
        mainElement.style.overflow = ''
        mainElement.style.overflowY = ''
      }
    }
  })
}

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  onReset?: () => void
  onConfirm?: (data: any) => void
  children: React.ReactNode
  title?: string | React.ReactNode
  height?: 'auto' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
  overlayClassName?: string
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  showCloseButton?: boolean
  showResetButton?: boolean
  showConfirmButton?: boolean
  closeOnConfirm?: boolean
  resetButtonText?: string
  closeButtonText?: string
  closeButtonIcon?: string // 关闭按钮图标路径（如果提供，将使用图标而不是文字）
  showCloseButtonInFooter?: boolean // 是否在底部显示关闭按钮（默认 true）
  confirmButtonText?: string
  headerActions?: React.ReactNode // 标题栏自定义操作（显示在标题和关闭按钮之间）
  data?: any
  onDataChange?: (data: any) => void
}

const heightClasses = {
  auto: 'h-auto max-h-[90vh]',
  sm: 'h-[35vh] md:h-[40vh] lg:h-[45vh]',
  md: 'h-[60vh] md:h-[55vh] lg:h-[50vh]',
  lg: 'h-[80vh] md:h-[70vh] lg:h-[65vh]',
  xl: 'h-[92vh] md:h-[82vh] lg:h-[75vh]',
  full: 'h-[96vh] md:h-[90vh] lg:h-[85vh]',
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  onReset,
  onConfirm,
  children,
  title,
  height = 'auto',
  className,
  overlayClassName,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  showResetButton = false,
  showConfirmButton = false,
  closeOnConfirm = true,
  resetButtonText = '重置',
  closeButtonText = '关闭',
  closeButtonIcon,
  showCloseButtonInFooter = true,
  confirmButtonText = '确认',
  headerActions,
  data,
  onDataChange,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const currentY = useRef(0)
  const isDragging = useRef(false)
  
  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // 处理键盘事件
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnEscape, handleClose])

  // 处理滚动锁定 - 使用全局计数器确保多个 BottomSheet 同时打开时也能正确处理
  useEffect(() => {
    if (isOpen) {
      // 增加计数器
      openBottomSheetCount++
        // 只有当第一个 BottomSheet 打开时才锁定滚动
        if (openBottomSheetCount === 1) {
          // 锁定 body 和 main 元素的滚动
          document.body.style.overflow = 'hidden'
          const mainElement = document.querySelector('main') as HTMLElement
          if (mainElement) {
            mainElement.style.overflow = 'hidden'
            mainElement.style.overflowY = 'hidden'
          }
        }
      
      return () => {
        // 减少计数器
        openBottomSheetCount--
        // 只有当所有 BottomSheet 都关闭时才恢复滚动
        if (openBottomSheetCount === 0) {
          // 立即恢复滚动（不使用 setTimeout，避免延迟）
          document.body.style.overflow = ''
          const mainElement = document.querySelector('main') as HTMLElement
          if (mainElement) {
            // 恢复 main 元素的滚动（移除内联样式，让 CSS 类生效）
            mainElement.style.removeProperty('overflow')
            mainElement.style.removeProperty('overflow-y')
            mainElement.style.removeProperty('overflow-x')
            // 确保 CSS 类生效
            if (!mainElement.classList.contains('overflow-y-auto')) {
              mainElement.classList.add('overflow-y-auto')
            }
            // 强制设置 overflow-y 为 auto（确保滚动可用）
            mainElement.style.overflowY = 'auto'
          }
          
          // 使用 requestAnimationFrame 确保在下一帧再次检查（防止其他代码覆盖）
          requestAnimationFrame(() => {
            document.body.style.overflow = ''
            const mainElement = document.querySelector('main') as HTMLElement
            if (mainElement) {
              mainElement.style.removeProperty('overflow')
              mainElement.style.removeProperty('overflow-y')
              mainElement.style.removeProperty('overflow-x')
              mainElement.style.overflowY = 'auto'
            }
          })
        }
      }
    }
  }, [isOpen])

  // 显示/隐藏动画
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 300)
      return () => clearTimeout(timer)
    } else {
      setIsAnimating(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setIsAnimating(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleReset = useCallback(() => {
    if (onReset) {
      onReset()
    }
    if (onDataChange && data) {
      onDataChange(null)
    }
  }, [onReset, onDataChange, data])

  const handleConfirm = useCallback(() => {
    if (onConfirm) {
      onConfirm(data ?? null)
    }
    if (closeOnConfirm) {
      onClose()
    }
  }, [onConfirm, data, closeOnConfirm, onClose])

  // 触摸事件处理
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    isDragging.current = true
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return

    currentY.current = e.touches[0].clientY
    const deltaY = currentY.current - startY.current

    if (deltaY > 0 && sheetRef.current) {
      const translateY = Math.min(deltaY, 100)
      sheetRef.current.style.transform = `translateY(${translateY}px)`
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging.current) return

    isDragging.current = false
    const deltaY = currentY.current - startY.current

    if (sheetRef.current) {
      sheetRef.current.style.transform = ''
    }

    // 如果向下滑动超过50px，关闭弹窗
    if (deltaY > 50) {
      handleClose()
    }
  }

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    startY.current = e.clientY
    isDragging.current = true
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return

    currentY.current = e.clientY
    const deltaY = currentY.current - startY.current

    if (deltaY > 0 && sheetRef.current) {
      const translateY = Math.min(deltaY, 100)
      sheetRef.current.style.transform = `translateY(${translateY}px)`
    }
  }

  const handleMouseUp = () => {
    if (!isDragging.current) return

    isDragging.current = false
    const deltaY = currentY.current - startY.current

    if (sheetRef.current) {
      sheetRef.current.style.transform = ''
    }

    if (deltaY > 50) {
      handleClose()
    }
  }

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) {
      handleClose()
    }
  }

  if (!isVisible) return null

  return createPortal(
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center',
        isAnimating
          ? isOpen
            ? 'animate-sheet-fade-in'
            : 'animate-sheet-fade-out'
          : '',
        overlayClassName
      )}
    >
      {/* 背景遮罩 - 点击这里关闭弹窗 */}
      <div 
        className={cn('absolute inset-0 bg-black/50')} 
        onClick={handleOverlayClick}
      />

      {/* 底部弹出内容 */}
      <div
        ref={sheetRef}
        className={cn(
          // 响应式宽度：移动端全宽；桌面端按视口宽度占比放大
          'relative w-full md:w-[80vw] lg:w-[70vw] xl:w-[60vw] 2xl:w-[50vw] max-w-full sm:max-w-none mx-auto bg-surface rounded-t-xl shadow-2xl',
          isAnimating
            ? isOpen
              ? 'animate-sheet-slide-in'
              : 'animate-sheet-slide-out'
            : isOpen
            ? ''
            : '',
          heightClasses[height],
          className
        )}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onClick={(e) => e.stopPropagation()} // 阻止事件冒泡，防止点击弹窗内容时关闭
      >
        {/* 拖拽指示器 */}
        <div 
          className="flex justify-center py-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            isDragging.current = false
            if (sheetRef.current) {
              sheetRef.current.style.transform = ''
            }
          }}
        >
          <div className="w-[134px] h-[6px] bg-black rounded-[20%]" />
        </div>

        {/* 头部 */}
        {(title || showCloseButton || showResetButton || headerActions) && (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex-1">
              {title && (
                typeof title === 'string' ? (
                  <h3 className="text-sm text-muted">{title}</h3>
                ) : (
                  <div className="text-sm text-muted">{title}</div>
                )
              )}
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
              {showResetButton && (
                <button
                  onClick={handleReset}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                >
                  {resetButtonText}
                </button>
              )}
              {showCloseButton && (
                <button
                  onClick={handleClose}
                  className={cn(
                    "transition-colors",
                    closeButtonIcon
                      ? "w-6 h-6 flex items-center justify-center hover:opacity-70"
                      : "px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md"
                  )}
                >
                  {closeButtonIcon ? (
                    <SvgIcon src={closeButtonIcon} className="w-5 h-5 text-black-9" />
                  ) : (
                    closeButtonText
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 内容 + 操作区容器（内容滚动，操作区固定） */}
        <div
          className={cn(
            'flex flex-col overflow-y-auto pb-4',
            height === 'auto'
              ? // 自适应模式：内容区域高度自适应，但不超过最大高度
                title || showCloseButton || showResetButton || headerActions
                  ? 'max-h-[calc(90vh-66px)]'
                  : 'max-h-[calc(90vh-22px)]'
              : // 固定高度模式：使用计算高度
                title || showCloseButton || showResetButton || headerActions
                  ? 'h-[calc(100%-66px)]'
                  : 'h-[calc(100%-44px)]'
          )}
        >
          {children}
          {(showConfirmButton || (showCloseButton && showCloseButtonInFooter)) && (
            <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
              {showCloseButton && showCloseButtonInFooter && (
                <button
                  onClick={handleClose}
                  className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  {closeButtonText}
                </button>
              )}
              {showConfirmButton && (
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  {confirmButtonText}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default BottomSheet
