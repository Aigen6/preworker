'use client'

import { useThemeStore } from '@/lib/stores/theme-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { themeColors } from '@/lib/utils/theme'

export function ThemeToggle() {
  const { theme, setTheme, primaryColor, setPrimaryColor } = useThemeStore()
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.theme.title')}</CardTitle>
        <CardDescription>
          {t('settings.theme.selectColor')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 主题模式切换 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('settings.theme.mode')}</label>
          <div className="flex space-x-2">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <Button
                key={mode}
                variant={theme === mode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme(mode)}
              >
                {t(`settings.theme.${mode}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* 主题色选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('settings.theme.primaryColor')}</label>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(themeColors).map(([name, color]) => (
              <button
                key={name}
                className={`h-10 w-full rounded-md border-2 transition-all hover:scale-105 ${
                  primaryColor === color ? 'border-primary-500 ring-2 ring-primary-200' : 'border-border'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setPrimaryColor(color)}
                title={name}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
