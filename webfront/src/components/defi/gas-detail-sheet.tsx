'use client'

import { useState, useEffect } from 'react'
import SvgIcon from '@/components/ui/SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useQuoteRoute } from '@/lib/hooks/use-quote-route'

interface GasDetailSheetProps {
  onClose?: () => void
}

export function GasDetailSheet({ onClose }: GasDetailSheetProps) {
  const { t } = useTranslation()
  const { quoteResult, getRouteAndFees, loading } = useQuoteRoute()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [countdown, setCountdown] = useState(3)

  // 模拟倒计时
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsRefreshing(true)
          // 模拟刷新
          setTimeout(() => {
            setIsRefreshing(false)
          }, 1000)
          return 3
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setCountdown(3)
    // TODO: 重新查询路由和费用
    // 这里需要从父组件传递查询参数
    setTimeout(() => {
      setIsRefreshing(false)
    }, 1000)
  }

  // 从 quoteResult 中提取费用信息
  const fees = quoteResult?.fees
  const route = quoteResult?.route

  return (
    <div className="px-4 space-y-4">
      <h2 className="font-semibold text-muted">{t('defi.routeDetails')}</h2>

      {/* 实时更新提示 */}
      <div className="px-4 py-3 bg-surface border border-line rounded-xl flex items-center justify-between">
        <div>
          <span className="text-sm text-primary">{countdown}</span>
          <span className="text-sm text-muted">
            {t('defi.autoUpdateCountdown')}
          </span>
        </div>
        <button onClick={handleRefresh} className="w-5 h-5">
          <SvgIcon
            src="/icons/refresh.svg"
            className="w-5 h-5 text-primary"
            monochrome
          />
        </button>
      </div>

      {/* 可用路径 */}
      {route ? (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-medium text-main">{t('defi.availableRoutes')}</h3>
          <span className="text-white text-xs px-2 py-0.5 border border-black-3 rounded-[6px]">
              {route.steps?.length || 1}
          </span>
        </div>

        {/* 路径卡片 */}
        <div className="bg-black-1 rounded-xl p-4 border border-black-3">
          {/* 顶部费用信息 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-black-9">{t('defi.totalFee')}</span>
                <span className="text-sm text-white">
                  {fees?.summary?.totalCostUSD || '0.00'} USD
                </span>
            </div>
            <div className="bg-black-2 text-primary px-3 py-1 rounded-lg text-sm font-medium">
              {t('defi.optimal')}
            </div>
          </div>

          {/* 时间和价格影响 */}
          <div className="grid grid-cols-2 gap-2 mb-4 px-4">
            <div className=" bg-black-2 rounded-xl p-2">
              <div className="text-sm text-black-9 mb-1">{t('extract.estimatedTime')}</div>
              <div className="text-white font-medium text-center mt-2 mb-3">
                  {route.estimatedTime || '3-6 分钟'}
              </div>
            </div>
            <div className=" bg-black-2 rounded-xl p-2">
              <div className="text-sm text-black-9 mb-1">{t('defi.priceImpact')}</div>
              <div className="text-primary font-medium text-center mt-2 mb-3">
                  {fees?.summary?.priceImpact || '0.00'}%
              </div>
            </div>
          </div>

          {/* 路径流程 */}
          <div className="flex items-center gap-2 text-sm text-black-9">
              <span>{route.bridgeProtocol || route.bridge || 'Stargate'}</span>→<span>Enclave</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center text-black-9 py-4">
          {loading ? t('common.loading') : t('defi.noRouteInfo')}
      </div>
      )}

      {/* 路径详情 */}
      {route?.steps && route.steps.length > 0 && (
      <div className="mb-6">
        <h3 className="text-base font-medium text-main mb-4">{t('defi.routeDetails')}</h3>

        <div className="border border-black-3 rounded-xl py-2 px-4">
            {route.steps.map((step: any, index: number) => (
              <div key={index}>
          <div className="bg-black-2 rounded-xl">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1 text-white">
                        <span className="font-medium">{step.type || '跨链桥'}</span>
                  <span className="border border-black-3 rounded-[6px] px-2 py-1 text-sm">
                          {step.protocol || step.bridge || 'Stargate'}
                  </span>
                </div>
                <div className="text-sm text-black-9 flex items-center gap-2">
                        <span>{step.fromToken || 'USDT'}</span>→<span>{step.toToken || 'USDT'}</span>
                        {step.fromChain && step.toChain && (
                          <>
                  <span>•</span>
                            <span>{step.fromChain}</span>→<span>{step.toChain}</span>
                          </>
                        )}
                </div>
              </div>
              <div className="text-right text-sm">
                      <div className="text-black-9">
                        手续费{step.feeRate ? `${step.feeRate}%` : '0.06%'}
                      </div>
                      <div className="text-black-9">
                        Gas ≈ ${step.gasCost || '1.5'}
              </div>
            </div>
          </div>
                </div>
                {index < route.steps.length - 1 && (
                  <div className="h-8 w-[2px] bg-black-3 my-4 ml-5" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 费用汇总 */}
      {fees && (
        <div className="rounded-xl bg-black-1 py-2 px-4">
          {fees.proofGeneration && (
            <div className="flex justify-between items-center py-2 text-sm text-black-9">
              <span>Proof 生成 Gas</span>
              <span>≈ ${fees.proofGeneration.costUSD || '0.00'}</span>
            </div>
          )}
          {fees.executeWithdraw && (
            <div className="flex justify-between items-center py-2 text-sm text-black-9">
              <span>执行提款 Gas</span>
              <span>≈ ${fees.executeWithdraw.costUSD || '0.00'}</span>
            </div>
          )}
          {fees.bridge && (
        <div className="flex justify-between items-center py-2 text-sm text-black-9">
              <span>桥接费用</span>
              <span>≈ ${fees.bridge.costUSD || '0.00'}</span>
        </div>
          )}
          {fees.hookExecution && (
        <div className="flex justify-between items-center py-2 text-sm text-black-9">
              <span>Hook Gas</span>
              <span>≈ ${fees.hookExecution.costUSD || '0.00'}</span>
            </div>
          )}
          {fees.summary && (
            <>
              <div className="h-px bg-black-3 my-2" />
              <div className="flex justify-between items-center py-2 text-sm">
                <span className="text-white font-medium">总 Gas 费用</span>
                <span className="text-white font-medium">
                  ${fees.summary.totalGasCostUSD || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 text-sm">
                <span className="text-white font-medium">总桥接费用</span>
                <span className="text-white font-medium">
                  ${fees.summary.totalBridgeFeeUSD || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 text-sm">
                <span className="text-primary font-medium">总费用</span>
                <span className="text-primary font-medium">
                  ${fees.summary.totalCostUSD || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 text-sm">
                <span className="text-white font-medium">预计到账</span>
                <span className="text-white font-medium">
                  {fees.summary.estimatedReceived || '0.00'} USDT
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
