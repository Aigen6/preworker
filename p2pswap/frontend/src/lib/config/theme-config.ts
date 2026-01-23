/**
 * 主题样式配置
 * 统一管理所有样式变量，可以通过环境变量或配置文件修改
 */

export interface ThemeColors {
  // 背景色
  bgBase: string
  bgSurface: string
  bgOverlay: string
  bgHairline: string
  
  // 文字颜色
  textMain: string
  textMuted: string
  textDanger: string
  textOnPrimary: string
  
  // 边框颜色
  borderLine: string
  
  // 主色
  primary: string
  
  // 黑色系列
  black1: string
  black2: string
  black3: string
  black4: string
  black9: string
}

export interface LightThemeColors extends ThemeColors {}

export interface DarkThemeColors extends ThemeColors {}

/**
 * 默认深色主题配置
 */
export const defaultDarkTheme: DarkThemeColors = {
  // 背景色
  bgBase: process.env.NEXT_PUBLIC_THEME_BG_BASE || '#151515',
  bgSurface: process.env.NEXT_PUBLIC_THEME_BG_SURFACE || '#242424',
  bgOverlay: process.env.NEXT_PUBLIC_THEME_BG_OVERLAY || '#1515154d',
  bgHairline: process.env.NEXT_PUBLIC_THEME_BG_HAIRLINE || '#FFFFFF0d',
  
  // 文字颜色
  textMain: process.env.NEXT_PUBLIC_THEME_TEXT_MAIN || '#F4F4F4',
  textMuted: process.env.NEXT_PUBLIC_THEME_TEXT_MUTED || '#939393',
  textDanger: process.env.NEXT_PUBLIC_THEME_TEXT_DANGER || '#B73C3C',
  textOnPrimary: process.env.NEXT_PUBLIC_THEME_TEXT_ON_PRIMARY || '#000000',
  
  // 边框颜色
  borderLine: process.env.NEXT_PUBLIC_THEME_BORDER_LINE || '#3A3A3A',
  
  // 主色 - 使用青绿色（类似 ChangeNOW 风格）
  primary: process.env.NEXT_PUBLIC_THEME_PRIMARY || '#00FF88',
  
  // 黑色系列
  black1: process.env.NEXT_PUBLIC_THEME_BLACK_1 || '#1D1D1D',
  black2: process.env.NEXT_PUBLIC_THEME_BLACK_2 || '#242424',
  black3: process.env.NEXT_PUBLIC_THEME_BLACK_3 || '#2A2A2A',
  black4: process.env.NEXT_PUBLIC_THEME_BLACK_4 || '#3A3A3A',
  black9: process.env.NEXT_PUBLIC_THEME_BLACK_9 || '#939393',
}

/**
 * 默认浅色主题配置
 */
export const defaultLightTheme: LightThemeColors = {
  // 背景色
  bgBase: process.env.NEXT_PUBLIC_THEME_LIGHT_BG_BASE || '#FFFFFF',
  bgSurface: process.env.NEXT_PUBLIC_THEME_LIGHT_BG_SURFACE || '#F5F5F5',
  bgOverlay: process.env.NEXT_PUBLIC_THEME_LIGHT_BG_OVERLAY || '#0000000d',
  bgHairline: process.env.NEXT_PUBLIC_THEME_LIGHT_BG_HAIRLINE || '#0000000d',
  
  // 文字颜色
  textMain: process.env.NEXT_PUBLIC_THEME_LIGHT_TEXT_MAIN || '#13131C',
  textMuted: process.env.NEXT_PUBLIC_THEME_LIGHT_TEXT_MUTED || '#3A3A3A',
  textDanger: process.env.NEXT_PUBLIC_THEME_LIGHT_TEXT_DANGER || '#B73C3C',
  textOnPrimary: process.env.NEXT_PUBLIC_THEME_LIGHT_TEXT_ON_PRIMARY || '#000000',
  
  // 边框颜色
  borderLine: process.env.NEXT_PUBLIC_THEME_LIGHT_BORDER_LINE || '#D1D1D1',
  
  // 主色 - 使用青绿色（类似 ChangeNOW 风格）
  primary: process.env.NEXT_PUBLIC_THEME_LIGHT_PRIMARY || '#00FF88',
  
  // 黑色系列
  black1: process.env.NEXT_PUBLIC_THEME_LIGHT_BLACK_1 || '#1D1D1D',
  black2: process.env.NEXT_PUBLIC_THEME_LIGHT_BLACK_2 || '#242424',
  black3: process.env.NEXT_PUBLIC_THEME_LIGHT_BLACK_3 || '#2A2A2A',
  black4: process.env.NEXT_PUBLIC_THEME_LIGHT_BLACK_4 || '#3A3A3A',
  black9: process.env.NEXT_PUBLIC_THEME_LIGHT_BLACK_9 || '#939393',
}

/**
 * 主题配置
 */
export interface ThemeConfig {
  dark: DarkThemeColors
  light: LightThemeColors
}

/**
 * 获取主题配置
 */
export function getThemeConfig(): ThemeConfig {
  return {
    dark: defaultDarkTheme,
    light: defaultLightTheme,
  }
}

/**
 * 主题配置单例
 */
export const themeConfig = getThemeConfig()






