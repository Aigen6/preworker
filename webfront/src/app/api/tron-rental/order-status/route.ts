import { NextRequest, NextResponse } from 'next/server'

/**
 * 查询订单状态
 * GET /api/tron-rental/order-status?provider=xxx&orderId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get('provider')
    const orderId = searchParams.get('orderId')

    if (!provider || !orderId) {
      return NextResponse.json(
        { error: '缺少必需参数: provider, orderId' },
        { status: 400 }
      )
    }

    // 根据不同的服务商调用不同的实现
    let order
    switch (provider) {
      case 'gasstation':
        const { checkGasStationOrderStatus } = await import('@/lib/services/tron-rental/gasstation')
        order = await checkGasStationOrderStatus(orderId)
        break
      case 'catfee':
        const { checkCatFeeOrderStatus } = await import('@/lib/services/tron-rental/catfee')
        order = await checkCatFeeOrderStatus(orderId)
        break
      case 'tronfuel':
        const { checkTronFuelOrderStatus } = await import('@/lib/services/tron-rental/tronfuel')
        order = await checkTronFuelOrderStatus(orderId)
        break
      case 'tronxenergy':
        const { checkTronXEnergyOrderStatus } = await import('@/lib/services/tron-rental/tronxenergy')
        order = await checkTronXEnergyOrderStatus(orderId)
        break
      default:
        return NextResponse.json(
          { error: `不支持的服务商: ${provider}` },
          { status: 400 }
        )
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('查询订单状态失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    )
  }
}
