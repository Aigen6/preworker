import { NextRequest, NextResponse } from 'next/server'

/**
 * TRON RPC 代理 API
 * 用于在服务器端调用 TRON RPC，避免浏览器的 CORS 问题
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { method, params } = body

    // 获取 TRON 查询 RPC URL（从环境变量读取）
    // 默认使用 TronGrid 官方 RPC（最稳定）
    const rpcUrl = process.env.NEXT_PUBLIC_TRON_QUERY_RPC_URL || 
      'https://api.trongrid.io'

    // 支持的 TRON RPC 方法
    const supportedMethods = [
      'triggerconstantcontract',
      'getaccountresource',
      'getaccount',
      'getcontract',
    ]

    if (!method || !supportedMethods.includes(method)) {
      return NextResponse.json(
        { error: `不支持的方法: ${method}` },
        { status: 400 }
      )
    }

    // 构建 TRON RPC 端点
    // 注意：drpc.live 可能需要不同的端点格式
    // 如果 RPC URL 已经包含 /wallet，则直接使用；否则添加 /wallet
    let endpoint: string
    if (rpcUrl.endsWith('/wallet') || rpcUrl.includes('/wallet/')) {
      // 如果 URL 已经包含 /wallet，直接拼接方法名
      endpoint = rpcUrl.replace(/\/wallet\/?$/, '') + `/wallet/${method}`
    } else {
      // 否则添加 /wallet 前缀
      endpoint = `${rpcUrl.replace(/\/$/, '')}/wallet/${method}`
    }
    
    console.log(`[TRON RPC Proxy] 调用端点: ${endpoint}`, { method, params })

    // 发送请求到 TRON RPC
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params || {}),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`TRON RPC 请求失败: ${response.status} - ${errorText}`)
      return NextResponse.json(
        { error: `TRON RPC 请求失败: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('TRON RPC 代理错误:', error)
    return NextResponse.json(
      { error: '服务器错误', details: error.message },
      { status: 500 }
    )
  }
}
