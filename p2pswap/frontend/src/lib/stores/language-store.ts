import { makeAutoObservable } from "mobx"
import { useThemeStore } from "./theme-store"

export type Language = "zh" | "en" | "ja" | "ko"

class LanguageStore {
  currentLanguage: Language = "zh"

  constructor() {
    makeAutoObservable(this)
    this.loadLanguageFromStorage()
  }

  // 从localStorage加载语言设置
  private loadLanguageFromStorage() {
    if (typeof window !== "undefined") {
      // 优先从 theme-storage 读取（因为 useTranslation 使用它）
      try {
        const themeStorage = localStorage.getItem("theme-storage")
        if (themeStorage) {
          const parsed = JSON.parse(themeStorage)
          if (parsed?.state?.language) {
            const savedLanguage = parsed.state.language as Language
            if (savedLanguage && (savedLanguage === "zh" || savedLanguage === "en" || savedLanguage === "ja" || savedLanguage === "ko")) {
              this.currentLanguage = savedLanguage
              return
            }
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
      
      // 回退到 app-language
      const savedLanguage = localStorage.getItem("app-language") as Language
      if (savedLanguage && (savedLanguage === "zh" || savedLanguage === "en" || savedLanguage === "ja" || savedLanguage === "ko")) {
        this.currentLanguage = savedLanguage
      }
    }
  }

  // 设置语言并保存到localStorage，同时同步到 themeStore
  setLanguage(language: Language) {
    this.currentLanguage = language
    if (typeof window !== "undefined") {
      localStorage.setItem("app-language", language)
      // 同步到 themeStore（useTranslation 使用它）
      const themeStore = useThemeStore.getState()
      themeStore.setLanguage(language)
    }
  }

  // 获取语言显示名称
  getLanguageName(language: Language): string {
    const names = {
      zh: "中文",
      en: "English",
      ja: "日本語",
      ko: "한국어",
    }
    return names[language]
  }

  // 获取语言对应的国旗
  getLanguageFlag(language: Language): string {
    const flags = {
      zh: "🇨🇳",
      en: "🇺🇸",
      ja: "🇯🇵",
      ko: "🇰🇷",
    }
    return flags[language]
  }
}

export const languageStore = new LanguageStore()
