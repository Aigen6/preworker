'use client'

import React, { useState, useEffect } from 'react'
import { usePoolStatistics, useMatchingSummary } from '@/lib/hooks/use-statistics-query'
import { useTranslation } from '@/lib/hooks/use-translation'
import SvgIcon from '@/components/ui/SvgIcon'
import { getChainName } from '@enclave-hq/sdk'

export default function StatisticsPage() {
  const { t } = useTranslation()
  const { data: poolStats, loading: poolStatsLoading, fetchStatistics } = usePoolStatistics()
  const { data: matchingSummary, loading: matchingLoading, fetchSummary } = useMatchingSummary()

  // 日期范围
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 7) // 默认最近7天
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  // 链ID过滤
  const [selectedChainId, setSelectedChainId] = useState<number | undefined>(undefined)

  // 当前标签页
  const [activeTab, setActiveTab] = useState<'overview' | 'matching'>('overview')

  // 加载数据
  useEffect(() => {
    fetchStatistics(selectedChainId, startDate, endDate)
  }, [selectedChainId, startDate, endDate, fetchStatistics])

  // 加载匹配分析摘要
  useEffect(() => {
    if (activeTab === 'matching') {
      fetchSummary(startDate, endDate, selectedChainId)
    }
  }, [activeTab, startDate, endDate, selectedChainId, fetchSummary])

  // 格式化金额（wei 转 USDT）
  const formatAmount = (amount: string) => {
    try {
      const wei = BigInt(amount || '0')
      const usdt = Number(wei) / 1e18
      return usdt.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    } catch {
      return '0.00'
    }
  }

  // 计算总计
  const totals = poolStats?.reduce(
    (acc, stat) => ({
      depositCount: acc.depositCount + stat.depositCount,
      totalDepositAmount: (BigInt(acc.totalDepositAmount) + BigInt(stat.totalDepositAmount || '0')).toString(),
      claimCount: acc.claimCount + stat.claimCount,
      totalClaimAmount: (BigInt(acc.totalClaimAmount) + BigInt(stat.totalClaimAmount || '0')).toString(),
      recoverCount: acc.recoverCount + stat.recoverCount,
      totalRecoverAmount: (BigInt(acc.totalRecoverAmount) + BigInt(stat.totalRecoverAmount || '0')).toString(),
      backendDepositCount: acc.backendDepositCount + stat.backendDepositCount,
      backendTotalDepositAmount: (BigInt(acc.backendTotalDepositAmount) + BigInt(stat.backendTotalDepositAmount || '0')).toString(),
      backendWithdrawCount: acc.backendWithdrawCount + stat.backendWithdrawCount,
      backendTotalWithdrawAmount: (BigInt(acc.backendTotalWithdrawAmount) + BigInt(stat.backendTotalWithdrawAmount || '0')).toString(),
    }),
    {
      depositCount: 0,
      totalDepositAmount: '0',
      claimCount: 0,
      totalClaimAmount: '0',
      recoverCount: 0,
      totalRecoverAmount: '0',
      backendDepositCount: 0,
      backendTotalDepositAmount: '0',
      backendWithdrawCount: 0,
      backendTotalWithdrawAmount: '0',
    },
  ) || {
    depositCount: 0,
    totalDepositAmount: '0',
    claimCount: 0,
    totalClaimAmount: '0',
    recoverCount: 0,
    totalRecoverAmount: '0',
    backendDepositCount: 0,
    backendTotalDepositAmount: '0',
    backendWithdrawCount: 0,
    backendTotalWithdrawAmount: '0',
  }

  return (
    <div className="mx-auto p-5">
      {/* 标题 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <SvgIcon
            src="/icons/home-time.svg"
            className="w-5 h-5 text-black-9"
          />
          <h1 className="text-xl font-medium text-white">统计查询</h1>
        </div>
        <p className="text-sm text-black-9">查看预处理池和 Backend 的统计数据</p>
      </div>

      {/* 标签页 */}
      <div className="flex gap-2 mb-6 border-b border-black-3">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'overview'
              ? 'text-primary border-b-2 border-primary'
              : 'text-black-9 hover:text-white'
          }`}
        >
          数据概览
        </button>
        <button
          onClick={() => setActiveTab('matching')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'matching'
              ? 'text-primary border-b-2 border-primary'
              : 'text-black-9 hover:text-white'
          }`}
        >
          匹配分析
        </button>
      </div>

      {/* 筛选器 */}
      <div className="bg-black-3 rounded-[12px] p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-black-9 mb-2">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-black-2 border border-black-4 rounded-lg text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-black-9 mb-2">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-black-2 border border-black-4 rounded-lg text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-black-9 mb-2">链ID（可选）</label>
            <select
              value={selectedChainId || ''}
              onChange={(e) => setSelectedChainId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full px-3 py-2 bg-black-2 border border-black-4 rounded-lg text-white text-sm"
            >
              <option value="">全部链</option>
              <option value="56">BSC (56)</option>
              <option value="1">Ethereum (1)</option>
              <option value="137">Polygon (137)</option>
              <option value="195">TRON (195)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 数据概览 */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 总计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-black-3 rounded-[12px] p-4">
              <div className="text-sm text-black-9 mb-1">预处理池存入</div>
              <div className="text-xl font-medium text-white">{totals.depositCount} 次</div>
              <div className="text-sm text-black-9 mt-1">{formatAmount(totals.totalDepositAmount)} USDT</div>
            </div>
            <div className="bg-black-3 rounded-[12px] p-4">
              <div className="text-sm text-black-9 mb-1">预处理池提取</div>
              <div className="text-xl font-medium text-white">{totals.claimCount + totals.recoverCount} 次</div>
              <div className="text-sm text-black-9 mt-1">
                {formatAmount((BigInt(totals.totalClaimAmount) + BigInt(totals.totalRecoverAmount)).toString())} USDT
              </div>
            </div>
            <div className="bg-black-3 rounded-[12px] p-4">
              <div className="text-sm text-black-9 mb-1">后端存入</div>
              <div className="text-xl font-medium text-white">{totals.backendDepositCount} 次</div>
              <div className="text-sm text-black-9 mt-1">{formatAmount(totals.backendTotalDepositAmount)} USDT</div>
            </div>
            <div className="bg-black-3 rounded-[12px] p-4">
              <div className="text-sm text-black-9 mb-1">后端提取</div>
              <div className="text-xl font-medium text-white">{totals.backendWithdrawCount} 次</div>
              <div className="text-sm text-black-9 mt-1">{formatAmount(totals.backendTotalWithdrawAmount)} USDT</div>
            </div>
          </div>

          {/* 详细数据表格 */}
          {poolStatsLoading ? (
            <div className="text-center text-black-9 py-8">加载中...</div>
          ) : poolStats && poolStats.length > 0 ? (
            <div className="bg-black-3 rounded-[12px] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-black-2 border-b border-black-4">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm text-black-9">日期</th>
                      <th className="px-4 py-3 text-left text-sm text-black-9">小时</th>
                      <th className="px-4 py-3 text-left text-sm text-black-9">链</th>
                      <th className="px-4 py-3 text-right text-sm text-black-9">预处理池存入</th>
                      <th className="px-4 py-3 text-right text-sm text-black-9">预处理池提取</th>
                      <th className="px-4 py-3 text-right text-sm text-black-9">后端存入</th>
                      <th className="px-4 py-3 text-right text-sm text-black-9">后端提取</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolStats.map((stat) => (
                      <tr key={stat.id} className="border-b border-black-4">
                        <td className="px-4 py-3 text-sm text-white">{stat.date}</td>
                        <td className="px-4 py-3 text-sm text-white">{stat.hour}:00</td>
                        <td className="px-4 py-3 text-sm text-white">
                          {getChainName(stat.poolChainId) || `Chain ${stat.poolChainId}`}
                        </td>
                        <td className="px-4 py-3 text-sm text-white text-right">
                          {stat.depositCount} 次<br />
                          <span className="text-black-9">{formatAmount(stat.totalDepositAmount)} USDT</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white text-right">
                          {stat.claimCount + stat.recoverCount} 次<br />
                          <span className="text-black-9">
                            {formatAmount((BigInt(stat.totalClaimAmount) + BigInt(stat.totalRecoverAmount)).toString())} USDT
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white text-right">
                          {stat.backendDepositCount} 次<br />
                          <span className="text-black-9">{formatAmount(stat.backendTotalDepositAmount)} USDT</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white text-right">
                          {stat.backendWithdrawCount} 次<br />
                          <span className="text-black-9">{formatAmount(stat.backendTotalWithdrawAmount)} USDT</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center text-black-9 py-8">暂无数据</div>
          )}
        </div>
      )}

      {/* 匹配分析 */}
      {activeTab === 'matching' && (
        <div className="space-y-6">
          {matchingLoading ? (
            <div className="text-center text-black-9 py-8">加载中...</div>
          ) : matchingSummary ? (
            <>
              {/* 摘要卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">预处理池存入</div>
                  <div className="text-xl font-medium text-white">{matchingSummary.summary.poolDepositsCount}</div>
                </div>
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">预处理池提取</div>
                  <div className="text-xl font-medium text-white">{matchingSummary.summary.poolWithdrawsCount}</div>
                </div>
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">后端存入（本机）</div>
                  <div className="text-xl font-medium text-white">{matchingSummary.summary.backendDepositsInThisServerCount}</div>
                </div>
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">后端存入（非本机）</div>
                  <div className="text-xl font-medium text-white">{matchingSummary.summary.backendDepositsNotInThisServerCount}</div>
                </div>
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">匹配成功</div>
                  <div className="text-xl font-medium text-primary">{matchingSummary.summary.matchedCount}</div>
                </div>
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">跨链提取</div>
                  <div className="text-xl font-medium text-white">{matchingSummary.summary.crossChainWithdrawsCount}</div>
                </div>
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">未匹配预处理池提取</div>
                  <div className="text-xl font-medium text-white">{matchingSummary.summary.unmatchedPoolWithdrawsCount}</div>
                </div>
                <div className="bg-black-3 rounded-[12px] p-4">
                  <div className="text-sm text-black-9 mb-1">未匹配后端存入</div>
                  <div className="text-xl font-medium text-white">{matchingSummary.summary.unmatchedBackendDepositsCount}</div>
                </div>
              </div>

              {/* 匹配详情 */}
              {matchingSummary.details.poolToBackendDepositMatches.length > 0 && (
                <div className="bg-black-3 rounded-[12px] p-4">
                  <h3 className="text-lg font-medium text-white mb-4">匹配详情</h3>
                  <div className="space-y-3">
                    {matchingSummary.details.poolToBackendDepositMatches.map((match: any, index: number) => (
                      <div key={index} className="bg-black-2 rounded-lg p-3 border border-black-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-sm text-white">
                            置信度: <span className="text-primary">{match.confidence.toFixed(1)}%</span>
                          </div>
                          <div className={`text-xs px-2 py-1 rounded ${
                            match.isInThisServer
                              ? 'bg-primary/20 text-primary'
                              : 'bg-black-9/20 text-black-9'
                          }`}>
                            {match.isInThisServer ? '本机服务输入' : '非本机服务输入'}
                          </div>
                        </div>
                        <div className="text-xs text-black-9 space-y-1">
                          <div>预处理池金额: {formatAmount(match.poolEventAmount)} USDT</div>
                          <div>后端存入金额: {formatAmount(match.backendDepositAmount)} USDT</div>
                          <div>匹配原因: {match.reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 跨链提取详情 */}
              {matchingSummary.details.crossChainWithdraws.length > 0 && (
                <div className="bg-black-3 rounded-[12px] p-4">
                  <h3 className="text-lg font-medium text-white mb-4">跨链提取详情</h3>
                  <div className="space-y-3">
                    {matchingSummary.details.crossChainWithdraws.map((crossChain: any, index: number) => (
                      <div key={index} className="bg-black-2 rounded-lg p-3 border border-black-4">
                        <div className="text-sm text-white mb-2">
                          执行链: {getChainName(crossChain.executeChainId) || `Chain ${crossChain.executeChainId}`} → 
                          支付链: {getChainName(crossChain.payoutChainId) || `Chain ${crossChain.payoutChainId}`}
                        </div>
                        <div className="text-xs text-black-9">
                          金额: {formatAmount(crossChain.amount)} USDT
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-black-9 py-8">暂无数据</div>
          )}
        </div>
      )}
    </div>
  )
}
