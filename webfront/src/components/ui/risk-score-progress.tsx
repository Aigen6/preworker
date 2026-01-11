'use client'

import React from 'react'

interface RiskScoreProgressProps {
  /** 风险评分 (0-100)，分数越低风险越低 */
  score: number
  /** 是否显示分数文本 */
  showScore?: boolean
  /** 进度条高度 */
  height?: number
  /** 进度条宽度 */
  width?: string | number
  /** 自定义类名 */
  className?: string
}

/**
 * 风险评分进度条组件
 * 分数越低，风险越低，进度条越靠左（绿色区域）
 * 分数越高，风险越高，进度条越靠右（红色区域）
 */
export function RiskScoreProgress({
  score,
  showScore = true,
  height = 8,
  width = '100%',
  className = '',
}: RiskScoreProgressProps) {
  // 将分数转换为进度条位置（分数低在左边，分数高在右边）
  // 分数 0-100 映射到位置 0%-100%
  const position = Math.max(0, Math.min(100, score))

  // 根据分数确定颜色和风险等级
  // 分级标准：
  // - 0-30分：低风险（绿色）
  // - 30-70分：中风险（绿橙色）
  // - 70-90分：高风险（橙色）
  // - 90-100分：极高风险（红色）
  const getRiskInfo = (score: number) => {
    if (score <= 30) {
      return {
        color: '#28A745', // 绿色
        level: 'low',
        label: '低风险',
      }
    } else if (score <= 70) {
      return {
        color: '#FFC107', // 黄绿色/绿橙色
        level: 'medium',
        label: '中风险',
      }
    } else if (score <= 90) {
      return {
        color: '#FD7E14', // 橙色
        level: 'high',
        label: '高风险',
      }
    } else {
      return {
        color: '#DC3545', // 红色
        level: 'critical',
        label: '极高风险',
      }
    }
  }

  const riskInfo = getRiskInfo(score)

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* 进度条容器 */}
      <div className="relative" style={{ width: typeof width === 'number' ? `${width}px` : width }}>
        {/* 4段颜色进度条：从左到右为绿色(低风险) -> 绿橙色(中风险) -> 橙色(高风险) -> 红色(极高风险) */}
        <div
          className="relative rounded-[20%] overflow-hidden border border-black-4"
          style={{
            height: `${height}px`,
            // 进度条分段：0-30%绿色(低风险0-30分), 30-70%绿橙色(中风险30-70分), 70-90%橙色(高风险70-90分), 90-100%红色(极高风险90-100分)
            background: 'linear-gradient(to right, #28A745 0%, #28A745 30%, #FFC107 30%, #FFC107 70%, #FD7E14 70%, #FD7E14 90%, #DC3545 90%, #DC3545 100%)',
          }}
        />
        
        {/* 指示器：根据分数位置显示一个三角形指示器 */}
        <div
          className="absolute top-0"
          style={{
            left: `calc(${position}% - 4px)`,
            height: `${height}px`,
            width: '8px',
            pointerEvents: 'none',
          }}
        >
          {/* 三角形指示器 */}
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: `6px solid ${riskInfo.color}`,
            }}
          />
          {/* 垂直指示线 */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full"
            style={{
              backgroundColor: riskInfo.color,
              boxShadow: `0 0 4px ${riskInfo.color}`,
            }}
          />
        </div>
      </div>

      {/* 分数显示 */}
      {showScore && (
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-medium"
            style={{ color: riskInfo.color }}
          >
            {score}
          </span>
          <span
            className="text-xs text-black-9"
          >
            {riskInfo.label}
          </span>
        </div>
      )}
    </div>
  )
}

