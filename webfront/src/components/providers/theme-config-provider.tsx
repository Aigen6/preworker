'use client'

import { useEffect } from 'react'
import { themeConfig } from '@/lib/config'

/**
 * 主题配置提供者
 * 将主题配置注入为 CSS 变量，使样式表可以统一管理
 */
export function ThemeConfigProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    
    // 注入深色主题 CSS 变量
    const darkTheme = themeConfig.dark
    root.style.setProperty('--bg-base', darkTheme.bgBase)
    root.style.setProperty('--bg-surface', darkTheme.bgSurface)
    root.style.setProperty('--bg-overlay', darkTheme.bgOverlay)
    root.style.setProperty('--bg-hairline', darkTheme.bgHairline)
    root.style.setProperty('--text-main', darkTheme.textMain)
    root.style.setProperty('--text-muted', darkTheme.textMuted)
    root.style.setProperty('--text-danger', darkTheme.textDanger)
    root.style.setProperty('--text-on-primary', darkTheme.textOnPrimary)
    root.style.setProperty('--border-line', darkTheme.borderLine)
    root.style.setProperty('--primary', darkTheme.primary)
    root.style.setProperty('--black-1', darkTheme.black1)
    root.style.setProperty('--black-2', darkTheme.black2)
    root.style.setProperty('--black-3', darkTheme.black3)
    root.style.setProperty('--black-4', darkTheme.black4)
    root.style.setProperty('--black-9', darkTheme.black9)
    
    // 注入浅色主题 CSS 变量（在 .light 类下使用）
    const lightTheme = themeConfig.light
    const lightStyle = document.createElement('style')
    lightStyle.id = 'light-theme-vars'
    lightStyle.textContent = `
      .light {
        --bg-base: ${lightTheme.bgBase};
        --bg-surface: ${lightTheme.bgSurface};
        --bg-overlay: ${lightTheme.bgOverlay};
        --bg-hairline: ${lightTheme.bgHairline};
        --text-main: ${lightTheme.textMain};
        --text-muted: ${lightTheme.textMuted};
        --text-danger: ${lightTheme.textDanger};
        --text-on-primary: ${lightTheme.textOnPrimary};
        --border-line: ${lightTheme.borderLine};
        --primary: ${lightTheme.primary};
        --black-1: ${lightTheme.black1};
        --black-2: ${lightTheme.black2};
        --black-3: ${lightTheme.black3};
        --black-4: ${lightTheme.black4};
        --black-9: ${lightTheme.black9};
      }
    `
    
    // 移除旧的样式（如果存在）
    const oldStyle = document.getElementById('light-theme-vars')
    if (oldStyle) {
      oldStyle.remove()
    }
    
    document.head.appendChild(lightStyle)
    
    return () => {
      // 清理
      const style = document.getElementById('light-theme-vars')
      if (style) {
        style.remove()
      }
    }
  }, [])
  
  return <>{children}</>
}

