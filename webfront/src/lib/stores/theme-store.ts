import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'zh' | 'en' | 'ja' | 'ko'

export interface ThemeState {
  theme: Theme
  language: Language
  primaryColor: string
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
  setPrimaryColor: (color: string) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      language: 'zh',
      primaryColor: '#3b82f6', // 默认蓝色
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      toggleTheme: () => {
        const currentTheme = get().theme
        const newTheme = currentTheme === 'light' ? 'dark' : 'light'
        set({ theme: newTheme })
      },
    }),
    {
      name: 'theme-storage',
    }
  )
)
