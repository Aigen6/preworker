'use client'

import { useCheckbooks } from '@enclave-hq/sdk/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 存款记录列表
 * 注意：SDK 中没有直接的存款 API，存款通过支票簿（Checkbook）管理
 * 这里显示支票簿作为存款记录
 */
export function DepositsList() {
  const checkbooks = useCheckbooks()

  return (
    <Card>
      <CardHeader>
        <CardTitle>支票簿记录</CardTitle>
        <CardDescription>最近的支票簿（存款）交易</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {checkbooks.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              暂无支票簿记录
            </div>
          ) : (
            checkbooks.map((checkbook) => (
              <div key={checkbook.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">
                    {checkbook.depositAmount} {checkbook.token.symbol}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {checkbook.token.name} · {checkbook.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
