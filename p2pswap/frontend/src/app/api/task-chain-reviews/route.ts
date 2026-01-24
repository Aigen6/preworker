import { NextRequest, NextResponse } from 'next/server'
import { 
  createTaskChainReview, 
  getTaskChainReview, 
  getTaskChainReviewsByChainId,
  isTaskChainApproved,
  deleteTaskChainReview
} from '@/lib/db/task-chain-reviews.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const chainId = searchParams.get('chainId')
    const chainRootTaskId = searchParams.get('chainRootTaskId')
    
    if (chainRootTaskId) {
      // 获取单个审核状态
      const review = getTaskChainReview(chainRootTaskId)
      const approved = review !== null
      return NextResponse.json({ success: true, data: { approved, review } })
    } else if (chainId) {
      // 获取链的所有审核状态
      const reviews = getTaskChainReviewsByChainId(parseInt(chainId))
      return NextResponse.json({ success: true, data: reviews })
    } else {
      return NextResponse.json({ success: false, error: 'chainId or chainRootTaskId is required' }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { chainRootTaskId, chainId, reviewedBy } = body
    
    if (!chainRootTaskId || !chainId) {
      return NextResponse.json({ success: false, error: 'chainRootTaskId and chainId are required' }, { status: 400 })
    }
    
    createTaskChainReview({
      chainRootTaskId,
      chainId: parseInt(chainId),
      reviewedBy: reviewedBy || undefined,
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const chainRootTaskId = searchParams.get('chainRootTaskId')
    
    if (!chainRootTaskId) {
      return NextResponse.json({ success: false, error: 'chainRootTaskId is required' }, { status: 400 })
    }
    
    deleteTaskChainReview(chainRootTaskId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
