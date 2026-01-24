import { NextRequest, NextResponse } from 'next/server'
import { canDeleteStrategy } from '@/lib/db/tasks.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const strategyId = searchParams.get('strategyId')
    
    if (!strategyId) {
      return NextResponse.json({ success: false, error: 'strategyId is required' }, { status: 400 })
    }
    
    const result = canDeleteStrategy(strategyId)
    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
