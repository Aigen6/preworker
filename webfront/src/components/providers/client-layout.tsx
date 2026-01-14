"use client"

import { useEffect, useState, useRef } from "react"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { ThemeConfigProvider } from "@/components/providers/theme-config-provider"
import { BottomSheetProvider } from "@/components/providers/bottom-sheet-provider"
import { LanguageProvider } from "@/components/providers/language-provider"
import { WalletProvider } from "@/components/providers/wallet-provider"
import { SDKProvider } from "@/components/providers/sdk-provider"
import { ToastProvider } from "@/components/providers/toast-provider"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { PageLoading } from "@/components/ui/loading"
import { appConfig } from "@/lib/config"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isInputFocused, setIsInputFocused] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  // 设置页面元数据
  useEffect(() => {
    document.title = appConfig.brandName
    
    // 设置 meta description
    let metaDescription = document.querySelector('meta[name="description"]')
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.setAttribute('name', 'description')
      document.head.appendChild(metaDescription)
    }
    metaDescription.setAttribute('content', appConfig.brandSubtitle)
    
    // 设置 favicon
    let linkIcon = document.querySelector('link[rel="icon"]')
    if (!linkIcon) {
      linkIcon = document.createElement('link')
      linkIcon.setAttribute('rel', 'icon')
      document.head.appendChild(linkIcon)
    }
    linkIcon.setAttribute('href', appConfig.favicon)
    
    // 设置 shortcut icon
    let linkShortcut = document.querySelector('link[rel="shortcut icon"]')
    if (!linkShortcut) {
      linkShortcut = document.createElement('link')
      linkShortcut.setAttribute('rel', 'shortcut icon')
      document.head.appendChild(linkShortcut)
    }
    linkShortcut.setAttribute('href', appConfig.favicon)
    
    // 设置 apple-touch-icon
    let linkApple = document.querySelector('link[rel="apple-touch-icon"]')
    if (!linkApple) {
      linkApple = document.createElement('link')
      linkApple.setAttribute('rel', 'apple-touch-icon')
      document.head.appendChild(linkApple)
    }
    linkApple.setAttribute('href', appConfig.favicon)
  }, [])

  // 确保页面滚动正常 - 在组件挂载时检查并恢复滚动状态
  useEffect(() => {
    const ensureScrollEnabled = () => {
      // 检查是否有打开的 BottomSheet（通过检查是否有 BottomSheet 的遮罩层）
      // BottomSheet 使用 createPortal 渲染到 body，遮罩层有 fixed inset-0 z-50 类
      const bottomSheetOverlay = document.querySelector('.fixed.inset-0.z-50') as HTMLElement
      const hasOpenBottomSheet = bottomSheetOverlay && 
        window.getComputedStyle(bottomSheetOverlay).display !== 'none' &&
        bottomSheetOverlay.style.display !== 'none'
      
      // 如果有打开的 BottomSheet，不执行恢复操作（让 BottomSheet 自己管理滚动）
      if (hasOpenBottomSheet) {
        return
      }
      
      // 检查 body 的滚动状态
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = ''
      }
      
      // 使用 ref 直接访问 main 元素
      const mainElement = mainRef.current || (document.querySelector('main') as HTMLElement)
      if (mainElement) {
        // 强制恢复滚动：移除所有可能阻止滚动的内联样式
        const hasHiddenOverflow = 
          mainElement.style.overflow === 'hidden' || 
          mainElement.style.overflowY === 'hidden' ||
          (mainElement.getAttribute('style')?.includes('overflow') && 
          mainElement.getAttribute('style')?.includes('hidden'))
        
        if (hasHiddenOverflow) {
          // 完全移除 overflow 相关的内联样式
          mainElement.style.removeProperty('overflow')
          mainElement.style.removeProperty('overflow-y')
          mainElement.style.removeProperty('overflow-x')
        }
        
        // 确保 main 元素可以滚动（通过 CSS 类）
        if (!mainElement.classList.contains('overflow-y-auto')) {
          mainElement.classList.add('overflow-y-auto')
        }
        
        // 如果仍然无法滚动，强制设置样式（但不要使用 !important，避免覆盖其他样式）
        const computedStyle = window.getComputedStyle(mainElement)
        if (computedStyle.overflowY === 'hidden' || computedStyle.overflow === 'hidden') {
          // 只设置 overflow-y，不使用 !important
          mainElement.style.overflowY = 'auto'
        }
      }
    }
    
    // 立即执行一次
    ensureScrollEnabled()
    
    // 使用多种方式确保执行
    const timer1 = setTimeout(ensureScrollEnabled, 0)
    const timer2 = setTimeout(ensureScrollEnabled, 100)
    const timer3 = setTimeout(ensureScrollEnabled, 500)
    requestAnimationFrame(ensureScrollEnabled)
    
    // 定期检查（每 500ms 检查一次，确保滚动始终可用）
    const intervalId = setInterval(ensureScrollEnabled, 500)
    
    // 使用 MutationObserver 监听 main 元素的变化
    const observer = new MutationObserver(() => {
      ensureScrollEnabled()
    })
    
    // 观察 main 元素的变化（使用 ref 或查询）
    const mainElement = mainRef.current || document.querySelector('main')
    if (mainElement) {
      observer.observe(mainElement, {
        attributes: true,
        attributeFilter: ['style', 'class']
      })
    }
    
    // 页面可见性变化时也检查
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        ensureScrollEnabled()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // 页面聚焦时也检查
    const handleFocus = () => {
      ensureScrollEnabled()
    }
    window.addEventListener('focus', handleFocus)
    
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearInterval(intervalId)
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // 监听输入框焦点状态
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      // 检查是否是输入框（input, textarea, contenteditable元素）
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        setIsInputFocused(true)
      }
    }

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      // 检查是否是输入框
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // 使用 setTimeout 确保在下一个输入框获得焦点之前不会隐藏
        setTimeout(() => {
          // 检查当前焦点是否还在输入框上
          const activeElement = document.activeElement as HTMLElement
          if (
            !activeElement ||
            (activeElement.tagName !== 'INPUT' &&
              activeElement.tagName !== 'TEXTAREA' &&
              !activeElement.isContentEditable)
          ) {
            setIsInputFocused(false)
          }
        }, 100)
      }
    }

    // 使用捕获阶段监听，确保能捕获到所有输入框的事件
    document.addEventListener('focusin', handleFocus, true)
    document.addEventListener('focusout', handleBlur, true)

    return () => {
      document.removeEventListener('focusin', handleFocus, true)
      document.removeEventListener('focusout', handleBlur, true)
    }
  }, [])

  // 处理移动端键盘弹出时的底部 tab 位置调整
  /* useEffect(() => {
    const handleResize = () => {
      const fixedTab = document.querySelector('.fixed-tab') as HTMLElement
      if (fixedTab) {
        const isKeyboardOpen = window.innerHeight < 500 // 根据设备实际判断
        fixedTab.style.bottom = isKeyboardOpen ? '0' : 'env(safe-area-inset-bottom)'
      }
    }

    // 初始设置
    handleResize()

    // 监听 resize 事件
    window.addEventListener('resize', handleResize)

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, []) */

  return (
    <ThemeConfigProvider>
      <ThemeProvider>
        <LanguageProvider>
          <WalletProvider>
            <SDKProvider>
              <BottomSheetProvider>
                <ToastProvider>
                  <PageLoading />
                  <div className="relative flex h-screen min-h-screen flex-col bg-base text-white" style={{ height: '100dvh', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
                    <Header />
                    <main 
                      ref={mainRef}
                      className="flex-1 h-0 pt-[120px] pb-[67px] md:pb-0 md:pl-[200px] overflow-y-auto hide-scrollbar"
                    >
                      <div className="w-full md:max-w-[800px] md:mx-auto md:px-4">
                        {children}
                      </div>
                    </main>
                    <Footer isHidden={isInputFocused} />
                  </div>
                </ToastProvider>
              </BottomSheetProvider>
            </SDKProvider>
          </WalletProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ThemeConfigProvider>
  )
}




