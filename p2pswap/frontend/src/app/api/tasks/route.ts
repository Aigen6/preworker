import { NextRequest, NextResponse } from 'next/server'
import { createTasks, getTasksByChainId, getTasksByStrategyId, updateTask, deleteTask } from '@/lib/db/tasks.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const chainId = parseInt(searchParams.get('chainId') || '714')
    const strategyId = searchParams.get('strategyId')
    
    let tasks
    if (strategyId) {
      tasks = getTasksByStrategyId(strategyId)
    } else {
      tasks = getTasksByChainId(chainId)
    }
    
    return NextResponse.json({ success: true, data: tasks })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tasks } = body
    
    if (!Array.isArray(tasks)) {
      return NextResponse.json({ success: false, error: 'tasks must be an array' }, { status: 400 })
    }
    
    createTasks(tasks)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskId, updates } = body
    
    if (!taskId) {
      return NextResponse.json({ success: false, error: 'taskId is required' }, { status: 400 })
    }
    
    updateTask(taskId, updates)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const taskId = searchParams.get('taskId')
    
    if (!taskId) {
      return NextResponse.json({ success: false, error: 'taskId is required' }, { status: 400 })
    }
    
    deleteTask(taskId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
