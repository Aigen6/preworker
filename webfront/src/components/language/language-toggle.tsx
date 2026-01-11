'use client'

import { useThemeStore } from '@/lib/stores/theme-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function LanguageToggle() {
  const { language, setLanguage } = useThemeStore()
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.language.title')}</CardTitle>
        <CardDescription>
          选择您的首选语言
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-2">
          {(['zh', 'en', 'ja', 'ko'] as const).map((lang) => {
            const langKey = lang === 'zh' ? 'chinese' : lang === 'en' ? 'english' : lang === 'ja' ? 'japanese' : 'korean'
            return (
              <Button
                key={lang}
                variant={language === lang ? 'default' : 'outline'}
                onClick={() => setLanguage(lang)}
              >
                {t(`settings.language.${langKey}`)}
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
