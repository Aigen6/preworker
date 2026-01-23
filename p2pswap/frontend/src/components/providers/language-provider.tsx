"use client"

import { createContext, useContext, ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { languageStore, type Language } from "@/lib/stores/language-store"

interface LanguageContextType {
  currentLanguage: Language
  setLanguage: (language: Language) => void
  getLanguageName: (language: Language) => string
  getLanguageFlag: (language: Language) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

interface LanguageProviderProps {
  children: ReactNode
}

function LanguageProviderInner({ children }: LanguageProviderProps) {
  // observer 会自动响应 languageStore.currentLanguage 的变化
  return (
    <LanguageContext.Provider
      value={{
        currentLanguage: languageStore.currentLanguage,
        setLanguage: languageStore.setLanguage.bind(languageStore),
        getLanguageName: languageStore.getLanguageName.bind(languageStore),
        getLanguageFlag: languageStore.getLanguageFlag.bind(languageStore),
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export const LanguageProvider = observer(LanguageProviderInner)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
