'use client'

import { useCheckbooks } from '@enclave-hq/sdk/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * 支票簿列表
 * 使用新的 SDK hooks 获取数据
 */
export function CheckbooksList() {
  const checkbooks = useCheckbooks()

  return (
    <Card>
      <CardHeader>
        <CardTitle>支票簿</CardTitle>
        <CardDescription>账户余额信息</CardDescription>
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
                  <div className="font-medium">{checkbook.token.symbol}</div>
                  <div className="text-sm text-muted-foreground">
                    {checkbook.token.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-lg">
                    {checkbook.depositAmount} {checkbook.token.symbol}
                  </div>
                  <Badge variant={checkbook.status === 'with_checkbook' ? 'default' : 'secondary'}>
                    {checkbook.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
