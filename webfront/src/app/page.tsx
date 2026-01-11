"use client"

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()
  const pathname = usePathname()
  
  useEffect(() => {
    // 只在根路径时重定向到存入隐私池页面
    // 使用 replace 而不是 push，避免在历史记录中留下根路径
    if (pathname === '/') {
      router.replace('/deposit')
    }
  }, [router, pathname])
  
  return null
}
