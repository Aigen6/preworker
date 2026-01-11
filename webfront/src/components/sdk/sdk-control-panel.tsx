'use client'

import { useConnection, useCheckbooks, usePrices, usePools } from '@enclave-hq/sdk/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * SDK 控制面板
 * 使用新的 SDK hooks 获取数据
 */
export function SDKControlPanel() {
  const { isConnected, isConnecting, error } = useConnection()
  const checkbooks = useCheckbooks()
  const prices = usePrices()
  const pools = usePools()

  return (
    <Card>
      <CardHeader>
        <CardTitle>SDK 控制面板</CardTitle>
        <CardDescription>查看 SDK 连接状态和数据</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-[20%] ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm">
              {isConnected ? '已连接' : '未连接'}
            </span>
          </div>
          
          {isConnecting && (
            <span className="text-sm text-muted-foreground">连接中...</span>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">错误: {error.message}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">支票簿:</span>
            <span className="ml-2 font-medium">{checkbooks.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">价格数据:</span>
            <span className="ml-2 font-medium">{prices.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">资金池:</span>
            <span className="ml-2 font-medium">{pools.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">活跃池子:</span>
            <span className="ml-2 font-medium">{pools.filter(p => p.isActive).length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
