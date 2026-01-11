'use client'

/**
 * Enclave SDK 使用示例
 * 
 * 展示如何直接使用 SDK 的响应式 stores 获取数据
 */

import { usePools, useCheckbooks, useAllocations, usePrices, useConnection } from '@enclave-hq/sdk/react'

/**
 * 示例：获取推荐理财产品
 */
export function RecommendedProductsExample() {
  // 直接使用 SDK 的响应式 hook，数据自动更新
  const pools = usePools()
  const { isConnected } = useConnection()

  // 筛选活跃的池子（推荐理财产品）
  const activePools = pools.filter(pool => pool.isActive)

  if (!isConnected) {
    return <div>正在连接 SDK...</div>
  }

  return (
    <div>
      <h2>推荐理财产品</h2>
      {activePools.map(pool => (
        <div key={pool.id}>
          <h3>{pool.name}</h3>
          <p>APY: {pool.apy ? `${(pool.apy * 100).toFixed(2)}%` : 'N/A'}</p>
          <p>TVL: ${pool.tvl}</p>
          <p>代币: {pool.token.symbol}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * 示例：获取价格数据
 */
export function PricesExample() {
  const prices = usePrices()

  return (
    <div>
      <h2>代币价格</h2>
      {prices.map(price => (
        <div key={price.symbol}>
          <span>{price.symbol}: ${price.price}</span>
          {price.change24h && (
            <span className={price.change24h > 0 ? 'text-green-500' : 'text-red-500'}>
              {price.change24h > 0 ? '+' : ''}{price.change24h.toFixed(2)}%
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * 示例：获取支票簿和分配
 */
export function CheckbooksExample() {
  const checkbooks = useCheckbooks()
  const allocations = useAllocations()

  return (
    <div>
      <h2>支票簿 ({checkbooks.length})</h2>
      {checkbooks.map(checkbook => (
        <div key={checkbook.id}>
          <p>{checkbook.id} - {checkbook.token.symbol}</p>
        </div>
      ))}

      <h2>分配 ({allocations.length})</h2>
      {allocations.map(allocation => (
        <div key={allocation.id}>
          <p>{allocation.id} - {allocation.amount}</p>
        </div>
      ))}
    </div>
  )
}

