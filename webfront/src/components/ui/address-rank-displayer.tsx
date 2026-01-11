'use client'

import React, { useState, useMemo, useContext } from 'react'
import SvgIcon from './SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useBottomSheetContext } from '@/components/providers/bottom-sheet-provider'
import { ToastContext } from '@/components/providers/toast-provider'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { getChainInfoByNative, getChainInfoBySlip44 } from '@enclave-hq/chain-utils'
import { getSlip44FromChainId } from '@enclave-hq/sdk'
import { AddressDisplay } from './address-display'

// 风险详情项类型
interface RiskDetail {
  entity: string
  risk_type: string
  exposure_type: string
  hop_num: number
  volume: number
  percent: number
}

// 恶意事件统计类型
interface MaliciousEvents {
  phishing: number
  ransom: number
  stealing: number
  laundering: number
  phishing_list?: string[]
  ransom_list?: string[]
  stealing_list?: string[]
  laundering_list?: string[]
}

// 平台信息类型
interface PlatformInfo {
  count: number
  list?: string[]
}

// 使用的平台类型
interface UsedPlatforms {
  exchange?: PlatformInfo
  dex?: PlatformInfo
  mixer?: PlatformInfo
  nft?: PlatformInfo
}

// 关联信息项类型
interface RelationItem {
  count: number
  list?: string[]
}

// 关联信息类型
interface RelationInfo {
  wallet?: RelationItem
  ens?: RelationItem
  twitter?: RelationItem
}

// 交易对手方项类型
interface CounterpartyItem {
  name: string
  amount: number
  percent: number
}

// 交易对手方类型
interface Counterparty {
  counterparty_list?: CounterpartyItem[]
  counterparty_count?: number
  address_counterparty_list?: CounterpartyItem[]
  [key: string]: any
}

// MistTrack 详细信息类型
interface MistTrackDetails {
  score: number
  hacking_event?: string
  detail_list?: string[]
  risk_level?: string
  risk_detail?: RiskDetail[]
  risk_report_url?: string
  // 新增字段
  labels?: string[]
  label_type?: string
  malicious_events?: MaliciousEvents
  used_platforms?: UsedPlatforms
  relation_info?: RelationInfo
  counterparty?: Counterparty
}

// 组件 Props
interface AddressRankDisplayerProps {
  address: string
  chainId?: number
  riskScore?: number | null
  riskLevel?: string | null
  metadata?: {
    mistTrackDetails?: MistTrackDetails
    queryTime?: string
    [key: string]: any
  }
  onRefresh?: () => Promise<void>
  loading?: boolean
  className?: string
  variant?: 'compact' | 'full' // 显示模式：compact=卡片内简化版，full=完整版（弹窗）
}

// 风险等级颜色映射
const getRiskLevelColor = (riskLevel: string | null | undefined, riskScore: number | null | undefined): string => {
  if (!riskLevel && !riskScore) return 'text-black-9'
  
  const level = riskLevel?.toLowerCase() || ''
  const score = riskScore || 0
  
  if (level === 'severe' || score >= 91) {
    return 'text-red-500'
  } else if (level === 'high' || score >= 71) {
    return 'text-orange-500'
  } else if (level === 'moderate' || score >= 31) {
    return 'text-yellow-500'
  } else {
    return 'text-green-500'
  }
}

// 风险等级背景色
const getRiskLevelBgColor = (riskLevel: string | null | undefined, riskScore: number | null | undefined): string => {
  if (!riskLevel && !riskScore) return 'bg-black-4'
  
  const level = riskLevel?.toLowerCase() || ''
  const score = riskScore || 0
  
  if (level === 'severe' || score >= 91) {
    return 'bg-red-500/20'
  } else if (level === 'high' || score >= 71) {
    return 'bg-orange-500/20'
  } else if (level === 'moderate' || score >= 31) {
    return 'bg-yellow-500/20'
  } else {
    return 'bg-green-500/20'
  }
}

// 风险等级进度条颜色
const getRiskProgressColor = (score: number): string => {
  if (score >= 91) return 'bg-red-500'
  if (score >= 71) return 'bg-orange-500'
  if (score >= 31) return 'bg-yellow-500'
  return 'bg-green-500'
}

// 风险类型图标和标签映射
const riskTypeConfig: Record<string, { icon: string; label: string }> = {
  sanctioned_entity: { icon: '🚫', label: '受制裁实体' },
  illicit_activity: { icon: '⚠️', label: '非法活动' },
  mixer: { icon: '🌀', label: '混币器' },
  gambling: { icon: '🎲', label: '赌博' },
  risk_exchange: { icon: '⚠️', label: '高风险交易所' },
  bridge: { icon: '🌉', label: '跨链桥' },
}

// 格式化金额
const formatCurrency = (amount: number): string => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(2)}K`
  }
  return `$${amount.toFixed(2)}`
}

// 风险等级映射（MistTrack 返回的格式 -> 翻译键）
const mapRiskLevel = (level: string | null | undefined): string => {
  if (!level) return 'unknown'
  const levelLower = level.toLowerCase()
  if (levelLower === 'low') return 'low'
  if (levelLower === 'moderate') return 'moderate'
  if (levelLower === 'high') return 'high'
  if (levelLower === 'severe') return 'severe'
  return 'unknown'
}

// 风险等级显示文本
const getRiskLevelText = (level: string | null | undefined, t: (key: string) => string): string => {
  const mappedLevel = mapRiskLevel(level)
  return t(`records.riskLevel.${mappedLevel}`) || level || t('records.riskLevel.unknown')
}

// 格式化时间（共享函数）
const formatTime = (timeStr?: string) => {
  if (!timeStr) return null
  try {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return timeStr
  }
}

// 交易对手方图表组件 - 使用 recharts
function CounterpartyChart({ data }: { data: CounterpartyItem[] }) {
  const { t } = useTranslation()
  
  // 颜色配置
  const COLORS = [
    '#3B82F6', // Blue - Stargate Finance
    '#10B981', // Green - Unknown
    '#F59E0B', // Yellow - Layerswap
    '#EF4444', // Red - UniswapX
    '#8B5CF6', // Purple - MetaMask
    '#06B6D4', // Cyan - LI.FI
    '#F97316', // Orange - StargateFinance
  ]
  
  // 准备图表数据
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      // 如果没有数据，返回一个空数据用于显示空圆环
      return [{
        name: 'empty',
        value: 100,
        amount: 0,
        color: '#374151', // 深灰色，表示空状态
      }]
    }
    return data.map((item, index) => ({
      name: item.name,
      value: item.percent,
      amount: item.amount,
      color: COLORS[index % COLORS.length],
    }))
  }, [data])
  
  const isEmpty = !data || data.length === 0
  
  // 自定义 Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length && !isEmpty) {
      const data = payload[0].payload
      return (
        <div className="bg-black-3 border border-black-4 rounded-lg p-2 text-xs">
          <p className="text-main font-medium">{data.name}</p>
          <p className="text-black-9">
            ${data.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ({data.value.toFixed(1)}%)
          </p>
        </div>
      )
    }
    return null
  }
  
  // 自定义 Legend - 直接使用 chartData 而不是依赖 recharts 的 payload
  const renderCustomLegend = () => {
    if (isEmpty) {
      return (
        <div className="flex flex-col gap-1 mt-2">
          <div className="text-black-9 text-xs">-</div>
        </div>
      )
    }
    
    const displayData = chartData.slice(0, 5)
    const remainingCount = chartData.length - 5
    
    return (
      <div className="flex flex-col gap-1 mt-2">
        {displayData.map((entry, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="w-2 h-2 rounded-[20%] shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-black-9 truncate">{entry.name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-main">
                ${entry.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-black-9">
                ({entry.value.toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="text-black-9 text-xs pt-1">
            +{remainingCount} {t('records.more') || '更多'}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <div className="mt-2">
      <div className="text-xs text-black-9 mb-2">{t('records.counterparty') || '交易对手'}</div>
      <div className="flex items-start gap-3">
        {/* 环形图 */}
        <div className="shrink-0" style={{ width: 80, height: 80 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={36}
                paddingAngle={isEmpty ? 0 : 2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* 图例 - 手动渲染，不依赖 recharts 的 Legend */}
        <div className="flex-1">
          {renderCustomLegend()}
        </div>
      </div>
    </div>
  )
}

// 恶意事件图表组件 - 使用 recharts 柱状图
function MaliciousEventsChart({ data }: { data: MaliciousEvents }) {
  const { t } = useTranslation()
  
  // 颜色配置 - 使用红色系表示危险
  const COLORS = {
    phishing: '#EF4444',    // Red
    ransom: '#F59E0B',      // Orange
    stealing: '#DC2626',    // Dark Red
    laundering: '#B91C1C',  // Deep Red
  }
  
  // 准备图表数据
  const chartData = useMemo(() => {
    return [
      {
        name: t('records.phishing') || '钓鱼',
        value: data.phishing || 0,
        color: COLORS.phishing,
      },
      {
        name: t('records.ransom') || '勒索',
        value: data.ransom || 0,
        color: COLORS.ransom,
      },
      {
        name: t('records.stealing') || '盗窃',
        value: data.stealing || 0,
        color: COLORS.stealing,
      },
      {
        name: t('records.laundering') || '洗钱',
        value: data.laundering || 0,
        color: COLORS.laundering,
      },
    ]
  }, [data, t])
  
  // 自定义 Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-black-3 border border-black-4 rounded-lg p-2 text-xs">
          <p className="text-main font-medium">{data.name}</p>
          <p className="text-black-9">
            {t('records.count') || '数量'}: {data.value}
          </p>
        </div>
      )
    }
    return null
  }
  
  // 计算最大值用于 Y 轴
  const maxValue = useMemo(() => {
    const values = chartData.map(item => item.value)
    const max = Math.max(...values)
    // 如果所有值都是 0，设置一个合理的显示范围（5）
    if (max === 0) {
      return 5
    }
    // 向上取整到最近的 5 的倍数
    return Math.ceil(max / 5) * 5
  }, [chartData])
  
  return (
    <div className="mt-2">
      <div className="text-xs text-black-9 mb-2">{t('records.maliciousEvents') || '恶意事件'}</div>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
          >
            <XAxis
              dataKey="name"
              tick={{ fill: '#6B7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              domain={[0, maxValue]}
              tick={{ fill: '#6B7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                fill="var(--text-main)"
                fontSize={11}
                formatter={(value) => value ?? ''}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// 完整版组件（用于弹窗）
function FullAddressRankDisplayer({
  address,
  chainId,
  riskScore,
  riskLevel,
  metadata,
  onRefresh,
  loading = false,
  className = '',
}: Omit<AddressRankDisplayerProps, 'variant'>) {
  const { t } = useTranslation()
  const { openBottomSheet } = useBottomSheetContext()
  
  // 安全地使用 Toast，如果不在 ToastProvider 内则使用 fallback
  const toastContext = useContext(ToastContext)
  const showInfo = useMemo(() => {
    if (toastContext) {
      return toastContext.showInfo
    }
    // Fallback: 如果不在 ToastProvider 内，使用 alert
    return (message: string) => {
      if (typeof window !== 'undefined') {
        alert(message)
      }
    }
  }, [toastContext])
  
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  
  // 触摸滑动处理
  const minSwipeDistance = 50
  
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }
  
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }
  
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance
    
    if (isLeftSwipe && activeTab < 3) {
      setActiveTab(activeTab + 1)
    }
    if (isRightSwipe && activeTab > 0) {
      setActiveTab(activeTab - 1)
    }
  }

  const mistTrackDetails = metadata?.mistTrackDetails
  const detailList = mistTrackDetails?.detail_list || []
  const riskDetailList = mistTrackDetails?.risk_detail || []
  const riskReportUrl = mistTrackDetails?.risk_report_url
  const hackingEvent = mistTrackDetails?.hacking_event
  
  // 新增字段
  const labels = mistTrackDetails?.labels || []
  const labelType = mistTrackDetails?.label_type
  const maliciousEvents = mistTrackDetails?.malicious_events
  const usedPlatforms = mistTrackDetails?.used_platforms
  const relationInfo = mistTrackDetails?.relation_info
  const counterparty = mistTrackDetails?.counterparty
  
  // 调试：检查交易对手数据
  if (process.env.NODE_ENV === 'development' && counterparty) {
    console.log('[AddressRankDisplayer] Counterparty data:', {
      counterparty,
      counterparty_list: counterparty.counterparty_list,
      address_counterparty_list: counterparty.address_counterparty_list,
      hasData: !!(counterparty.counterparty_list || counterparty.address_counterparty_list)
    })
  }

  // 使用 metadata 中的风险评分，如果没有则使用传入的 riskScore
  const displayScore = mistTrackDetails?.score ?? riskScore ?? null
  const displayLevel = mistTrackDetails?.risk_level ?? riskLevel ?? null

  // 处理刷新
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onRefresh && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }
  }

  const queryTime = metadata?.queryTime ? formatTime(metadata.queryTime) : null

  // 获取链名称
  const getChainName = useMemo(() => {
    if (!chainId) return null
    // 先尝试作为 native chain ID
    const nativeInfo = getChainInfoByNative(chainId)
    if (nativeInfo) {
      return nativeInfo.name
    }
    // 再尝试作为 SLIP-44 chain ID
    const slip44Info = getChainInfoBySlip44(chainId)
    if (slip44Info) {
      return slip44Info.name
    }
    // 如果都不匹配，尝试转换
    const slip44ChainId = getSlip44FromChainId(chainId)
    if (slip44ChainId) {
      const slip44Info2 = getChainInfoBySlip44(slip44ChainId)
      if (slip44Info2) {
        return slip44Info2.name
      }
    }
    return null
  }, [chainId])

  return (
    <div className={`bg-black-3 rounded-[12px] p-4 ${className}`}>
      {/* 地址和链信息 - 一行两列 */}
      {address && (
        <div className="mb-4 pb-3 border-b border-black-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-black-9 mb-1">{t('records.address') || '地址'}</div>
              <AddressDisplay address={address} chainId={chainId} />
            </div>
            {getChainName && (
              <div>
                <div className="text-xs text-black-9 mb-1">{t('records.chain') || '链'}</div>
                <div className="text-sm text-white">{getChainName}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="text-center text-black-9 text-sm py-4">
          {t('common.loading')}
        </div>
      )}

      {/* 无数据状态 */}
      {!loading && displayScore === null && (
        <div className="text-center text-black-9 text-sm py-4">
          {t('records.noRiskScore')}
        </div>
      )}

      {/* 有数据时显示 */}
      {!loading && displayScore !== null && (
        <>
          {/* 风险评分和等级（大号显示） */}
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`px-4 py-2 rounded-lg ${getRiskLevelBgColor(displayLevel, displayScore)}`}>
                <span className={`text-2xl font-bold ${getRiskLevelColor(displayLevel, displayScore)}`}>
                  {displayScore}
                </span>
                <span className={`text-sm ${getRiskLevelColor(displayLevel, displayScore)} ml-1`}>分</span>
              </div>
              <div className="flex-1">
                <div className={`text-lg font-semibold ${getRiskLevelColor(displayLevel, displayScore)} mb-1`}>
                  {getRiskLevelText(displayLevel, t)}
                </div>
                {queryTime && (
                  <div className="text-xs text-black-9">
                    {t('records.scoreTime')}: {queryTime}
                  </div>
                )}
              </div>
            </div>

            {/* 安全事件提示 */}
            {hackingEvent && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                <span className="font-medium">{t('records.securityEvent') || '安全事件'}: </span>
                {hackingEvent}
              </div>
            )}
          </div>

          {/* 风险描述和风险详情（一行显示） */}
          {(detailList.length > 0 || riskDetailList.length > 0) && (
            <div className="mb-4 pb-3 border-b border-black-4">
              <div className="flex items-start justify-between gap-3">
                {/* 左侧：风险描述 */}
                <div className="flex-1">
                  <div className="text-xs text-black-9 mb-2">{t('records.riskDescription')}:</div>
                  {detailList.length > 0 ? (
                    <div className="space-y-1">
                      {detailList.map((detail, index) => (
                        <div key={index} className="text-sm text-main flex items-start gap-2">
                          <span className="text-black-9">•</span>
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-black-9">-</div>
                  )}
                </div>
                
                {/* 右侧：风险详情按钮（只有图标） */}
                {riskDetailList.length > 0 && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-black-9 hover:text-white transition-colors"
                    title={t('records.riskDetail')}
                  >
                    <SvgIcon
                      src="/icons/arrow-right-gray-icon.svg"
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </button>
                )}
              </div>

              {/* 风险详情展开内容 */}
              {isExpanded && riskDetailList.length > 0 && (
                <div className="space-y-2 mt-3">
                  {riskDetailList.map((detail, index) => {
                    const typeConfig = riskTypeConfig[detail.risk_type] || { icon: '⚠️', label: detail.risk_type }
                    return (
                      <div
                        key={index}
                        className="bg-black-2 border border-black-4 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{typeConfig.icon}</span>
                            <span className="text-main font-medium">{detail.entity}</span>
                          </div>
                          <span className="text-black-9 text-xs">{typeConfig.label}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                          <div>
                            <span className="text-black-9">暴露类型: </span>
                            <span className="text-main">
                              {detail.exposure_type === 'direct' ? '直接' : '间接'} ({detail.hop_num}跳)
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-black-9">金额: </span>
                            <span className="text-main">
                              {formatCurrency(detail.volume)} ({detail.percent.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 可滑动的Tab布局：4个卡片 */}
          <div className="mb-4">
            {/* Tab指示器 */}
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
              {[
                { key: 'addressLabels', label: t('records.addressLabels') },
                { key: 'maliciousEvents', label: t('records.maliciousEvents') },
                { key: 'usedPlatforms', label: t('records.usedPlatforms') },
                { key: 'relationInfo', label: t('records.relationInfo') },
              ].map((tab, index) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(index)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                    activeTab === index
                      ? 'bg-primary text-black'
                      : 'bg-black-2 text-black-9 hover:bg-black-4'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab内容 - 可滑动容器 */}
            <div 
              className="relative overflow-hidden"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div
                className="flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${activeTab * 100}%)` }}
              >
                {/* Tab 1: 地址标签卡片 - 包含地址标签和交易对手方图表 */}
                <div className="w-full flex-shrink-0 bg-black-2 border border-black-4 rounded-lg p-3">
                  {/* 地址标签部分 */}
                  <div className="mb-3">
                    <div className="text-xs text-black-9 mb-2">{t('records.addressLabels')}</div>
                    {labels.length > 0 || labelType ? (
                      <div className="flex flex-wrap gap-1.5">
                        {labels.map((label, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-primary/20 text-primary rounded text-xs"
                          >
                            {label}
                          </span>
                        ))}
                        {labelType && (
                          <span className="px-2 py-1 bg-black-4 text-black-9 rounded text-xs">
                            {t(`records.labelType.${labelType}`) || labelType}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-black-9">-</div>
                    )}
                  </div>
                  
                  {/* 交易对手方图表 - 即使没有数据也显示空圆环 */}
                  <CounterpartyChart 
                    data={counterparty && (counterparty.counterparty_list || counterparty.address_counterparty_list) 
                      ? (counterparty.counterparty_list || counterparty.address_counterparty_list || [])
                      : []} 
                  />
                </div>

                {/* Tab 2: 恶意事件统计卡片 */}
                <div className="w-full flex-shrink-0 bg-black-2 border border-black-4 rounded-lg p-3">
                  {maliciousEvents ? (
                    <MaliciousEventsChart data={maliciousEvents} />
                  ) : (
                    <div>
                      <div className="text-xs text-black-9 mb-2">{t('records.maliciousEvents')}</div>
                      <div className="text-sm text-black-9">-</div>
                    </div>
                  )}
                </div>

                {/* Tab 3: 使用的平台卡片 */}
                <div className="w-full flex-shrink-0 bg-black-2 border border-black-4 rounded-lg p-3">
                  <div className="text-xs text-black-9 mb-2">{t('records.usedPlatforms')}</div>
                  {usedPlatforms ? (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-black-9">{t('records.exchange')}: </span>
                        {usedPlatforms.exchange && usedPlatforms.exchange.count > 0 ? (
                          <>
                            <span className="text-main">{usedPlatforms.exchange.count}</span>
                            {usedPlatforms.exchange.list && usedPlatforms.exchange.list.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {usedPlatforms.exchange.list.map((platform, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-black-4 text-main rounded text-xs">
                                    {platform}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-black-9">-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-black-9">{t('records.dex')}: </span>
                        {usedPlatforms.dex && usedPlatforms.dex.count > 0 ? (
                          <>
                            <span className="text-main">{usedPlatforms.dex.count}</span>
                            {usedPlatforms.dex.list && usedPlatforms.dex.list.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {usedPlatforms.dex.list.map((platform, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-black-4 text-main rounded text-xs">
                                    {platform}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-black-9">-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-black-9">{t('records.mixer')}: </span>
                        {usedPlatforms.mixer && usedPlatforms.mixer.count > 0 ? (
                          <>
                            <span className="text-orange-500">{usedPlatforms.mixer.count}</span>
                            {usedPlatforms.mixer.list && usedPlatforms.mixer.list.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {usedPlatforms.mixer.list.map((platform, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-orange-500/20 text-orange-500 rounded text-xs">
                                    {platform}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-black-9">-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-black-9">{t('records.nft')}: </span>
                        {usedPlatforms.nft && usedPlatforms.nft.count > 0 ? (
                          <>
                            <span className="text-main">{usedPlatforms.nft.count}</span>
                            {usedPlatforms.nft.list && usedPlatforms.nft.list.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {usedPlatforms.nft.list.map((platform, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-black-4 text-main rounded text-xs">
                                    {platform}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-black-9">-</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-black-9">-</div>
                  )}
                </div>

                {/* Tab 4: 关联信息卡片 */}
                <div className="w-full flex-shrink-0 bg-black-2 border border-black-4 rounded-lg p-3">
                  <div className="text-xs text-black-9 mb-2">{t('records.relationInfo')}</div>
                  {relationInfo ? (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-black-9">{t('records.wallet')}: </span>
                        {relationInfo.wallet && relationInfo.wallet.count > 0 ? (
                          <>
                            <span className="text-main">{relationInfo.wallet.count}</span>
                            {relationInfo.wallet.list && relationInfo.wallet.list.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {relationInfo.wallet.list.map((wallet, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-black-4 text-main rounded text-xs">
                                    {wallet}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-black-9">-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-black-9">{t('records.ens')}: </span>
                        {relationInfo.ens && relationInfo.ens.count > 0 ? (
                          <>
                            <span className="text-main">{relationInfo.ens.count}</span>
                            {relationInfo.ens.list && relationInfo.ens.list.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {relationInfo.ens.list.map((ens, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-black-4 text-main rounded text-xs">
                                    {ens}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-black-9">-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-black-9">{t('records.twitter')}: </span>
                        {relationInfo.twitter && relationInfo.twitter.count > 0 ? (
                          <>
                            <span className="text-main">{relationInfo.twitter.count}</span>
                            {relationInfo.twitter.list && relationInfo.twitter.list.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {relationInfo.twitter.list.map((twitter, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-black-4 text-main rounded text-xs">
                                    {twitter}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-black-9">-</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-black-9">-</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 风险报告链接 */}
          <div className="mt-4 pt-3 border-t border-black-4">
            <button
              onClick={() => {
                // 使用 Toast 显示"尚未提供"
                showInfo(t('records.notAvailable') || '尚未提供')
              }}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors text-sm"
            >
              <span>{t('records.payToViewReport') || '支付1799U 查看完整风险报告'}</span>
              <SvgIcon src="/icons/arrow-right-gray-icon.svg" className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// 简化版组件（用于卡片内显示）
function CompactAddressRankDisplayer({
  address,
  chainId,
  riskScore,
  riskLevel,
  metadata,
  onRefresh,
  loading = false,
  className = '',
}: Omit<AddressRankDisplayerProps, 'variant'>) {
  const { t } = useTranslation()
  const { openBottomSheet } = useBottomSheetContext()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const mistTrackDetails = metadata?.mistTrackDetails
  const displayScore = mistTrackDetails?.score ?? riskScore ?? null
  const displayLevel = mistTrackDetails?.risk_level ?? riskLevel ?? null
  const queryTime = metadata?.queryTime ? formatTime(metadata.queryTime) : null

  // 处理刷新
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onRefresh && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }
  }

  // 打开详情弹窗
  const handleOpenDetail = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    // 创建刷新按钮（如果提供了 onRefresh）
    const refreshButton = onRefresh ? (
      <button
        onClick={async (e) => {
          e.stopPropagation()
          if (!isRefreshing) {
            setIsRefreshing(true)
            try {
              await onRefresh()
            } finally {
              setIsRefreshing(false)
            }
          }
        }}
        disabled={loading || isRefreshing}
        className="w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        title={t('records.refreshRiskScore')}
      >
        <SvgIcon
          src="/icons/refresh.svg"
          className={`w-4 h-4 text-black-9 transition-transform ${(loading || isRefreshing) ? 'animate-spin' : ''}`}
        />
      </button>
    ) : undefined
    
    // 创建标题区域，包含 "by SLOWMIST"
    const titleWithBrand = (
      <div className="flex items-center gap-2">
        <span>{t('records.riskScore')}</span>
        <span className="text-xs text-black-9">by</span>
        <span className="text-xs font-semibold text-white">SLOWMIST</span>
      </div>
    )
    
    openBottomSheet({
      title: titleWithBrand,
      height: 'xl',
      closeOnOverlayClick: true,
      showCloseButton: true,
      closeButtonIcon: '/icons/common-close.svg',
      showCloseButtonInFooter: false, // 移除底部关闭按钮
      headerActions: refreshButton,
      children: (
        <FullAddressRankDisplayer
          address={address}
          chainId={chainId}
          riskScore={riskScore}
          riskLevel={riskLevel}
          metadata={metadata}
          onRefresh={onRefresh}
          loading={loading}
        />
      ),
    })
  }

  // 计算进度条位置（0-100分对应0-100%）
  const progressPercent = displayScore !== null ? Math.min(100, Math.max(0, displayScore)) : 0

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* 风险评分行 */}
      <div className="flex justify-between items-center">
        <span className="text-black-9 text-xs">{t('records.riskScore')}</span>
        <div className="flex items-center gap-2">
          {loading || isRefreshing ? (
            <span className="text-black-9 text-xs">{t('common.loading')}</span>
          ) : displayScore !== null ? (
            <>
              {/* 风险评分进度条 */}
              <div className="flex items-center gap-2">
                {/* 进度条 */}
                <div className="w-20 h-1.5 bg-black-4 rounded-[20%] overflow-hidden relative">
                  {/* 渐变背景：绿色 -> 黄色 -> 红色 */}
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 opacity-30" />
                  {/* 当前进度 */}
                  <div
                    className={`h-full ${getRiskProgressColor(displayScore)} transition-all duration-300 relative z-10`}
                    style={{ width: `${progressPercent}%` }}
                  />
                  {/* 指示器三角形 */}
                  <div
                    className={`absolute top-0 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[5px] border-transparent ${getRiskProgressColor(displayScore)} border-t-current z-20`}
                    style={{ left: `${Math.max(0, Math.min(100, progressPercent))}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                
                {/* 分数和等级 */}
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-medium ${getRiskLevelColor(displayLevel, displayScore)}`}>
                    {displayScore}
                  </span>
                  <span className={`text-xs ${getRiskLevelColor(displayLevel, displayScore)}`}>
                    {getRiskLevelText(displayLevel, t)}
                  </span>
                </div>
              </div>

              {/* 刷新图标 */}
              {onRefresh && (
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('records.refreshRiskScore')}
                >
                  <SvgIcon
                    src="/icons/refresh.svg"
                    className={`w-4 h-4 text-black-9 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
              )}

              {/* 详情图标 */}
              <button
                onClick={handleOpenDetail}
                className="w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity"
                title={t('records.viewRiskDetail')}
              >
                <SvgIcon
                  src="/icons/questionMark.svg"
                  className="w-4 h-4 text-black-9"
                />
              </button>
            </>
          ) : (
            <>
              <span className="text-black-9 text-xs">{t('records.noRiskScore')}</span>
              {onRefresh && (
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('records.refreshRiskScore')}
                >
                  <SvgIcon
                    src="/icons/refresh.svg"
                    className={`w-4 h-4 text-black-9 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* 最近读取时间行 */}
      {queryTime && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-black-9">
            {t('deposit.lastQueryTime') || '最近读取时间'}: {queryTime}
          </span>
        </div>
      )}
    </div>
  )
}

// 主组件
export function AddressRankDisplayer({
  variant = 'compact',
  ...props
}: AddressRankDisplayerProps) {
  if (variant === 'full') {
    return <FullAddressRankDisplayer {...props} />
  }
  return <CompactAddressRankDisplayer {...props} />
}
