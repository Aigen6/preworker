'use client'

import { useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { FileText, List, BarChart } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
type NavItem = 'designer' | 'tasks' | 'statistics'

export function Footer({ isHidden = false }: { isHidden?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()

  // 根据当前路径计算活跃导航
  const navItems = [
    {
      id: 'designer' as NavItem,
      label: '任务计划',
      path: '/designer',
      icon: FileText,
    },
    {
      id: 'tasks' as NavItem,
      label: '任务列表',
      path: '/tasks',
      icon: List,
    },
    {
      id: 'statistics' as NavItem,
      label: '结果统计',
      path: '/statistics',
      icon: BarChart,
    },
  ]

  const activeNav = useMemo(() => {
    // 处理根路径重定向到 /designer
    if (pathname === '/') {
      return 'designer'
    }
    
    // 精确匹配路径
    const exactMatch = navItems.find((item) => item.path === pathname)
    if (exactMatch) {
      return exactMatch.id
    }
    
    // 处理子路由：如果路径以某个导航项开头，则高亮该导航项
    // 例如：/defi/aave 应该高亮 /defi
    for (const item of navItems) {
      if (pathname.startsWith(item.path + '/') || pathname === item.path) {
        return item.id
      }
    }
    
    // 默认返回 designer
    return 'designer'
  }, [pathname, navItems])

  const handleNavClick = (item: (typeof navItems)[0], e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 如果已经在当前页面，不执行导航
    if (pathname === item.path) {
      return
    }
    
    // 触发全局导航开始事件，显示全屏loading
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:navigation-start'))
    }
    
    // 使用客户端路由，不会刷新页面
    // 使用 replace: false 确保是 push 而不是 replace
    // 这样可以保持浏览器历史记录
    router.push(item.path, { scroll: false })
  }

  return (
    <>
      {/* 移动端：底部导航栏 */}
      <footer 
        className={`fixed-tab fixed bottom-0 left-0 right-0 z-50 flex justify-center md:hidden transition-transform duration-300 ease-in-out`}
        style={{ 
          transform: isHidden ? 'translateY(100%)' : 'translateZ(0)',
        }}
      >
        <div className="w-auto flex items-center gap-6 px-4 h-[67.92px] bg-surface border border-line rounded-[14px] backdrop-blur-sm">
          {navItems.map((item) => {
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                onClick={(e) => handleNavClick(item, e)}
                className={`w-[41.48px] h-[41.48px] flex items-center justify-center rounded-[20%] transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary'
                    : 'bg-transparent hover:bg-white/5'
                }`}
                aria-label={item.label}
                type="button"
              >
                <item.icon className="w-[20.75px] h-[20.75px] text-white" />
              </button>
            )
          })}
        </div>
      </footer>

      {/* 桌面端：左侧边栏导航 */}
      <aside className="hidden md:flex fixed left-0 top-[71.27px] bottom-0 w-[200px] bg-surface border-r border-line z-40 flex-col">
        <nav className="flex flex-col p-4 gap-2">
          {navItems.map((item) => {
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                onClick={(e) => handleNavClick(item, e)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary text-black'
                    : 'bg-transparent text-white hover:bg-white/5'
                }`}
                type="button"
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
