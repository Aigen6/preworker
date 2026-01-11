'use client'

import { useTranslation } from '@/lib/hooks/use-translation'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { LanguageToggle } from '@/components/language/language-toggle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsPanel() {
  const { t } = useTranslation()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
          <p className="text-muted-foreground mt-2">
            自定义您的应用外观和语言设置
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 主题设置 */}
          <ThemeToggle />

          {/* 语言设置 */}
          <LanguageToggle />

          {/* 其他设置 */}
          <Card>
            <CardHeader>
              <CardTitle>其他设置</CardTitle>
              <CardDescription>
                更多个性化选项
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">动画效果</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="animations"
                    defaultChecked
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="animations" className="text-sm">
                    启用页面过渡动画
                  </label>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">通知设置</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="notifications"
                    defaultChecked
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="notifications" className="text-sm">
                    接收系统通知
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 关于信息 */}
          <Card>
            <CardHeader>
              <CardTitle>关于项目</CardTitle>
              <CardDescription>
                技术栈和版本信息
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">框架:</span>
                  <span className="ml-2 text-muted-foreground">Next.js 13</span>
                </div>
                <div>
                  <span className="font-medium">样式:</span>
                  <span className="ml-2 text-muted-foreground">Tailwind CSS</span>
                </div>
                <div>
                  <span className="font-medium">语言:</span>
                  <span className="ml-2 text-muted-foreground">TypeScript</span>
                </div>
                <div>
                  <span className="font-medium">状态管理:</span>
                  <span className="ml-2 text-muted-foreground">Zustand</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
