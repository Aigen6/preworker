import { NextRequest, NextResponse } from 'next/server'
import { createStrategy, getStrategiesByChainId, deleteStrategy } from '@/lib/db/strategies.service'
import { deleteTasksByStrategyId, canDeleteStrategy } from '@/lib/db/tasks.service'
import { deleteOperationPlan } from '@/lib/db/plans.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const chainId = parseInt(searchParams.get('chainId') || '714')
    
    const strategies = getStrategiesByChainId(chainId)
    return NextResponse.json({ success: true, data: strategies })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, chainId, planId, totalAmount, totalTasks, generatedAt, highRiskAddresses } = body
    
    createStrategy({
      id,
      chainId,
      planId,
      totalAmount,
      totalTasks,
      generatedAt,
      highRiskAddresses,
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const strategyId = searchParams.get('strategyId')
    
    if (!strategyId) {
      return NextResponse.json({ success: false, error: 'strategyId is required' }, { status: 400 })
    }
    
    // 检查是否可以删除（所有任务必须是 pending 状态）
    const checkResult = canDeleteStrategy(strategyId)
    if (!checkResult.canDelete) {
      return NextResponse.json({ 
        success: false, 
        error: checkResult.reason || '策略包含已开始的任务，无法删除' 
      }, { status: 400 })
    }
    
    // 删除策略、任务和操作计划
    deleteTasksByStrategyId(strategyId)
    deleteOperationPlan(strategyId)
    deleteStrategy(strategyId)
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
