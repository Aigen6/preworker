'use client'

import { useLanguage } from '@/components/providers/language-provider'
import type { Language } from '@/lib/stores/language-store'

export interface LanguageOption {
  code: Language
  name: string
  flag: string
}

interface LanguageSelectorProps {
  currentLanguage: Language
  onLanguageChange: (language: Language) => void
  onClose?: () => void
}

export function LanguageSelector({
  currentLanguage,
  onLanguageChange,
  onClose,
}: LanguageSelectorProps) {
  const { getLanguageName, getLanguageFlag } = useLanguage()

  const languages: LanguageOption[] = [
    { code: 'zh', name: getLanguageName('zh'), flag: getLanguageFlag('zh') },
    { code: 'en', name: getLanguageName('en'), flag: getLanguageFlag('en') },
    { code: 'ja', name: getLanguageName('ja'), flag: getLanguageFlag('ja') },
    { code: 'ko', name: getLanguageName('ko'), flag: getLanguageFlag('ko') },
  ]

  const handleLanguageSelect = (languageCode: Language) => {
    onLanguageChange(languageCode)
    // 选择语言后关闭弹窗
    if (onClose) {
      setTimeout(() => {
        onClose()
      }, 100) // 稍微延迟，确保状态更新完成
    }
  }

  return (
    <div className="w-full">
      {/* 语言选项 */}
      <div className="px-4 pb-6 space-y-3">
        {languages.map((language) => (
          <button
            key={language.code}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleLanguageSelect(language.code)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={`w-full flex items-center justify-between p-4 rounded-lg transition-all cursor-pointer ${
              currentLanguage === language.code
                ? 'bg-base border-2 border-primary'
                : 'bg-base border-2 border-transparent hover:border-line'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{language.flag}</span>
              <span className="text-main text-base font-medium">
                {language.name}
              </span>
            </div>
            {currentLanguage === language.code && (
              <div className="w-6 h-6 rounded-[20%] bg-primary flex items-center justify-center">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M10 3L4.5 8.5L2 6"
                    stroke="black"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
