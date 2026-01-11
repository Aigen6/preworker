'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/lib/stores/theme-store'
import { applyTheme } from '@/lib/utils/theme'

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { theme, primaryColor } = useThemeStore()

  useEffect(() => {
    // 应用主题
    applyTheme(theme, primaryColor)
  }, [theme, primaryColor])

  useEffect(() => {
    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme(theme, primaryColor)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, primaryColor])

  return <>{children}</>
}
