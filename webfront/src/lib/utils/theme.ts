import { useThemeStore } from '@/lib/stores/theme-store'

// 主题色预设
export const themeColors = {
  blue: '#3b82f6',
  green: '#10b981',
  purple: '#8b5cf6',
  red: '#ef4444',
  orange: '#f59e0b',
  pink: '#ec4899',
  indigo: '#6366f1',
  teal: '#14b8a6',
}

// 生成主题色 CSS 变量
export const generateThemeCSS = (primaryColor: string) => {
  const color = primaryColor.replace('#', '')
  const r = parseInt(color.substr(0, 2), 16)
  const g = parseInt(color.substr(2, 2), 16)
  const b = parseInt(color.substr(4, 2), 16)

  return {
    '--color-primary-50': `rgb(${r + 200}, ${g + 200}, ${b + 200})`,
    '--color-primary-100': `rgb(${r + 150}, ${g + 150}, ${b + 150})`,
    '--color-primary-200': `rgb(${r + 100}, ${g + 100}, ${b + 100})`,
    '--color-primary-300': `rgb(${r + 50}, ${g + 50}, ${b + 50})`,
    '--color-primary-400': `rgb(${r + 25}, ${g + 25}, ${b + 25})`,
    '--color-primary-500': primaryColor,
    '--color-primary-600': `rgb(${Math.max(0, r - 25)}, ${Math.max(0, g - 25)}, ${Math.max(0, b - 25)})`,
    '--color-primary-700': `rgb(${Math.max(0, r - 50)}, ${Math.max(0, g - 50)}, ${Math.max(0, b - 50)})`,
    '--color-primary-800': `rgb(${Math.max(0, r - 75)}, ${Math.max(0, g - 75)}, ${Math.max(0, b - 75)})`,
    '--color-primary-900': `rgb(${Math.max(0, r - 100)}, ${Math.max(0, g - 100)}, ${Math.max(0, b - 100)})`,
  }
}

// 应用主题到 DOM
export const applyTheme = (theme: string, primaryColor: string) => {
  const root = document.documentElement
  
  // 设置主题模式
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  
  // 设置主题色
  const themeCSS = generateThemeCSS(primaryColor)
  Object.entries(themeCSS).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}
