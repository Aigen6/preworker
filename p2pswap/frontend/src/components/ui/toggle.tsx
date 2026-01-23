'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  className,
  size = 'md',
}: ToggleProps) {
  const sizeClasses = {
    sm: 'w-9 h-5',
    md: 'w-11 h-6',
    lg: 'w-14 h-7',
  }

  const thumbSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  // 计算滑块位置：轨道宽度 - 滑块宽度 - 右边距（2px）
  // sm: 36px (w-9) - 16px (w-4) - 2px = 18px
  // md: 44px (w-11) - 20px (w-5) - 2px = 22px
  // lg: 56px (w-14) - 24px (w-6) - 2px = 30px
  const translateClasses = {
    sm: checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5', // 18px
    md: checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5', // 22px
    lg: checked ? 'translate-x-[1.875rem]' : 'translate-x-0.5', // 30px
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex items-center rounded-[20%] transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black-2 disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-primary' : 'bg-black-4',
        sizeClasses[size],
        className
      )}
    >
      <span
        className={cn(
          'inline-block rounded-[20%] bg-white transition-transform duration-200 ease-in-out',
          thumbSizeClasses[size],
          translateClasses[size]
        )}
      />
    </button>
  )
}

