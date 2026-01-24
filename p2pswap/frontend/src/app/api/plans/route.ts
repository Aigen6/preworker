import { NextRequest, NextResponse } from 'next/server'
import { createOperationPlan, getOperationPlanByStrategyId, deleteOperationPlan } from '@/lib/db/plans.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const strategyId = searchParams.get('strategyId')
    
    if (!strategyId) {
      return NextResponse.json({ success: false, error: 'strategyId is required' }, { status: 400 })
    }
    
    const plan = getOperationPlanByStrategyId(strategyId)
    return NextResponse.json({ success: true, data: plan })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { plan, chainId, strategyId } = body
    
    if (!plan || !chainId || !strategyId) {
      return NextResponse.json({ success: false, error: 'plan, chainId, and strategyId are required' }, { status: 400 })
    }
    
    createOperationPlan(plan, chainId, strategyId)
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
    
    deleteOperationPlan(strategyId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
