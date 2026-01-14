'use client'

import { useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import SvgIcon from '@/components/ui/SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'
type NavItem = 'preprocess' | 'deposit' | 'difi' | 'records'

export function Footer({ isHidden = false }: { isHidden?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()

  // 根据当前路径计算活跃导航
  const navItems = [
    {
      id: 'preprocess' as NavItem,
      label: t('footer.preprocess'),
      path: '/preprocess',
      icon: '/icons/nav-preprocess-icon.svg',
    },
    {
      id: 'deposit' as NavItem,
      label: t('footer.deposit'),
      path: '/deposit',
      icon: '/icons/nav-deposit-icon.svg',
    },
    {
      id: 'difi' as NavItem,
      label: t('footer.defi'),
      path: '/defi',
      icon: '/icons/nav-withdraw-icon.svg',
    },
    {
      id: 'records' as NavItem,
      label: t('footer.records'),
      path: '/records',
      icon: '/icons/nav-history-icon.svg',
    },
  ]

  const activeNav = useMemo(() => {
    // 处理根路径重定向到 /preprocess
    if (pathname === '/') {
      return 'preprocess'
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
    
    // 默认返回 preprocess
    return 'preprocess'
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
                <SvgIcon
                  src={item.icon}
                  className="w-[20.75px] h-[20.75px] text-white"
                />
              </button>
            )
          })}
        </div>
      </footer>

      {/* 桌面端：左侧边栏 */}
      <aside className="hidden md:flex fixed left-0 top-[120px] bottom-0 z-40 w-[200px] flex-col py-6 bg-surface border-r border-line backdrop-blur-sm" style={{ transform: 'translateZ(0)' }}>
        <nav className="flex flex-col gap-2 px-4">
          {navItems.map((item) => {
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                onClick={(e) => handleNavClick(item, e)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-on-primary'
                    : 'bg-transparent text-main hover:bg-white/5'
                }`}
                aria-label={item.label}
                type="button"
              >
                <div className={`w-[24px] h-[24px] flex items-center justify-center shrink-0 ${
                  isActive ? 'text-on-primary' : 'text-white'
                }`}>
                  <SvgIcon
                    src={item.icon}
                    className="w-[20px] h-[20px]"
                  />
                </div>
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
