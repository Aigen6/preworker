'use client'

import { useThemeStore } from '@/lib/stores/theme-store'
import { useEffect, useState, useCallback } from 'react'

// 缓存版本与键前缀（版本变更可强制刷新旧缓存）
const CACHE_VERSION = 'v2'
const CACHE_KEY_PREFIX = `translation_cache_${CACHE_VERSION}_`
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24小时缓存过期时间

// 从 localStorage 获取缓存的翻译
const getCachedTranslation = (lang: string): { data: any; timestamp: number } | null => {
  if (typeof window === 'undefined') return null
  
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${lang}`
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return null
    
    const parsed = JSON.parse(cached)
    const now = Date.now()
    
    // 检查缓存是否过期
    if (now - parsed.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(cacheKey)
      return null
    }
    
    return parsed
  } catch (error) {
    console.warn('读取翻译缓存失败:', error)
    return null
  }
}

// 保存翻译到 localStorage
const saveCachedTranslation = (lang: string, data: any) => {
  if (typeof window === 'undefined') return
  
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${lang}`
    const cacheData = {
      data,
      timestamp: Date.now(),
      version: '1.0'
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
  } catch (error) {
    console.warn('保存翻译缓存失败:', error)
    // 如果存储空间不足，尝试清理旧缓存
    try {
      const keys = Object.keys(localStorage)
      const translationKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX))
      if (translationKeys.length > 4) {
        // 只保留最新的4个语言的缓存
        translationKeys.slice(0, -4).forEach(key => localStorage.removeItem(key))
      }
    } catch (cleanupError) {
      console.warn('清理翻译缓存失败:', cleanupError)
    }
  }
}

// 简化的翻译 Hook，使用 fetch 加载翻译文件，支持 localStorage 缓存
export function useTranslation() {
  // 使用选择器函数确保响应式更新
  const language = useThemeStore((state) => state.language)
  const [translations, setTranslations] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 加载翻译文件的函数
  const loadTranslations = useCallback(async (lang: string) => {
    setIsLoading(true)
    
    // 先尝试从缓存加载
    const cached = getCachedTranslation(lang)
    if (cached) {
      setTranslations(cached.data)
      setIsLoading(false)
      
      // 在后台检查是否有更新（不阻塞UI）
      fetch(`/locales/${lang}/common.json?t=${Date.now()}`)
        .then(response => {
          if (response.ok) {
            return response.json()
          }
          return null
        })
        .then(data => {
          if (data) {
            // 比较数据是否有变化（简单比较）
            const cachedStr = JSON.stringify(cached.data)
            const newStr = JSON.stringify(data)
            if (cachedStr !== newStr) {
              // 数据有更新，保存新数据
              saveCachedTranslation(lang, data)
              setTranslations(data)
            }
          }
        })
        .catch(() => {
          // 静默失败，继续使用缓存
        })
      
      return
    }
    
    // 缓存不存在或已过期，从服务器加载
    try {
      const response = await fetch(`/locales/${lang}/common.json?t=${Date.now()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch translation')
      }
      const data = await response.json()
      setTranslations(data)
      // 保存到缓存
      saveCachedTranslation(lang, data)
      setIsLoading(false)
    } catch (error) {
      // 如果加载失败，使用默认的中文翻译
      try {
        const fallbackResponse = await fetch('/locales/zh/common.json')
        if (!fallbackResponse.ok) {
          throw new Error('Failed to fetch fallback translation')
        }
        const fallbackData = await fallbackResponse.json()
        setTranslations(fallbackData)
        // 保存 fallback 数据到缓存
        saveCachedTranslation('zh', fallbackData)
        setIsLoading(false)
      } catch (fallbackError) {
        // 最后的备用方案
        setTranslations({
          nav: { home: '首页', settings: '设置', about: '关于' },
          home: { 
            title: '欢迎使用 Next.js 模板',
            subtitle: '这是一个基于 Next.js 13 + Tailwind CSS 的完整前端项目模板',
            features: {
              title: '主要功能',
              theme: '主题系统',
              themeDesc: '支持亮/暗模式切换和自定义主题色',
              i18n: '国际化',
              i18nDesc: '支持中英日韩四种语言切换',
              responsive: '响应式设计',
              responsiveDesc: '完美适配移动端、平板和PC',
              components: '组件库',
              componentsDesc: '丰富的可复用组件'
            },
            getStarted: '开始使用',
            learnMore: '了解更多'
          },
          settings: {
            title: '设置',
            theme: {
              title: '主题设置',
              mode: '主题模式',
              light: '亮色模式',
              dark: '暗色模式',
              system: '跟随系统',
              primaryColor: '主题色',
              selectColor: '选择主题色'
            },
            language: {
              title: '语言设置',
              chinese: '中文',
              english: 'English',
              japanese: '日本語',
              korean: '한국어'
            }
          },
          common: {
            loading: '加载中...',
            error: '出错了',
            retry: '重试',
            save: '保存',
            cancel: '取消',
            confirm: '确认',
            close: '关闭'
          }
        })
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // 当语言改变时，重新加载翻译
    loadTranslations(language)
  }, [language, loadTranslations])

  const t = (key: string, params?: Record<string, string | number>) => {
    if (!translations) return key
    
    const keys = key.split('.')
    let result: any = translations
    
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k]
      } else {
        return key
      }
    }
    
    if (typeof result === 'string') {
      // 支持参数替换，例如 {min} -> params.min
      if (params) {
        return result.replace(/\{(\w+)\}/g, (match, paramKey) => {
          return params[paramKey]?.toString() || match
        })
      }
      return result
    }
    
    return key
  }

  return { t, language, isLoading }
}
