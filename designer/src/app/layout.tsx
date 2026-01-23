import type { Metadata } from "next"
import "./globals.css"
import { ToastProvider } from "@/components/toast"

export const metadata: Metadata = {
  title: "白U操作计划生成工具",
  description: "用于生成和管理白U操作计划，确保资金经过预处理和Enclave隐私化处理",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
