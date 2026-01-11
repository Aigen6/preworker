'use client'

import { usePrices } from '@enclave-hq/sdk/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 价格列表
 * 使用新的 SDK hooks 获取数据
 */
export function PricesList() {
  const prices = usePrices()

  return (
    <Card>
      <CardHeader>
        <CardTitle>实时价格</CardTitle>
        <CardDescription>加密货币价格信息</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {prices.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              暂无价格数据
            </div>
          ) : (
            prices.map((price) => (
              <div key={price.symbol} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium text-lg">{price.symbol}</div>
                  <div className="text-sm text-muted-foreground">
                    {price.timestamp ? new Date(price.timestamp).toLocaleString() : '实时'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-lg">
                    ${price.price.toLocaleString()}
                  </div>
                  {price.change24h !== undefined && (
                    <div className={`text-sm ${
                      price.change24h >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
