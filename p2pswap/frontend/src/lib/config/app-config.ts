/**
 * 应用配置
 * 用于配置 LOGO、品牌名称等可自定义的内容
 * 可以通过环境变量覆盖，或直接修改此文件
 */

export interface AppConfig {
  /** 品牌名称 */
  brandName: string
  /** 品牌副标题 */
  brandSubtitle: string
  /** Logo 图标路径 */
  logoIcon: string
  /** Logo 图标宽度（像素） */
  logoWidth: number
  /** Logo 图标高度（像素） */
  logoHeight: number
  /** Favicon 路径 */
  favicon: string
}

/**
 * 默认应用配置
 */
export const defaultAppConfig: AppConfig = {
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME || 'Enclave',
  brandSubtitle: process.env.NEXT_PUBLIC_BRAND_SUBTITLE || '区块链上的私有银行',
  logoIcon: process.env.NEXT_PUBLIC_LOGO_ICON || '/icons/logo-icon.png',
  logoWidth: Number(process.env.NEXT_PUBLIC_LOGO_WIDTH) || 34,
  logoHeight: Number(process.env.NEXT_PUBLIC_LOGO_HEIGHT) || 34,
  favicon: process.env.NEXT_PUBLIC_FAVICON || '/icons/bunny.svg',
}

/**
 * 获取应用配置
 * 可以通过环境变量覆盖默认值
 */
export function getAppConfig(): AppConfig {
  return {
    brandName: process.env.NEXT_PUBLIC_BRAND_NAME || defaultAppConfig.brandName,
    brandSubtitle: process.env.NEXT_PUBLIC_BRAND_SUBTITLE || defaultAppConfig.brandSubtitle,
    logoIcon: process.env.NEXT_PUBLIC_LOGO_ICON || defaultAppConfig.logoIcon,
    logoWidth: Number(process.env.NEXT_PUBLIC_LOGO_WIDTH) || defaultAppConfig.logoWidth,
    logoHeight: Number(process.env.NEXT_PUBLIC_LOGO_HEIGHT) || defaultAppConfig.logoHeight,
    favicon: process.env.NEXT_PUBLIC_FAVICON || defaultAppConfig.favicon,
  }
}

/**
 * 应用配置单例
 */
export const appConfig = getAppConfig()










