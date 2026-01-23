import { NextRequest, NextResponse } from 'next/server'

/**
 * 创建租赁订单
 * POST /api/tron-rental/create-order
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, address, energyAmount, bandwidthAmount, duration } = body

    if (!provider || !address || !energyAmount || !bandwidthAmount) {
      return NextResponse.json(
        { error: '缺少必需参数: provider, address, energyAmount, bandwidthAmount' },
        { status: 400 }
      )
    }

    // 验证地址格式
    if (!address.startsWith('T') || address.length !== 34) {
      return NextResponse.json(
        { error: '无效的 TRON 地址格式' },
        { status: 400 }
      )
    }

    // 根据不同的服务商调用不同的实现
    let order
    switch (provider) {
      case 'gasstation':
        const { createGasStationOrder } = await import('@/lib/services/tron-rental/gasstation')
        order = await createGasStationOrder(address, energyAmount, bandwidthAmount, duration)
        break
      case 'catfee':
        const { createCatFeeOrder } = await import('@/lib/services/tron-rental/catfee')
        order = await createCatFeeOrder(address, energyAmount, bandwidthAmount, duration)
        break
      case 'tronfuel':
        const { createTronFuelOrder } = await import('@/lib/services/tron-rental/tronfuel')
        order = await createTronFuelOrder(address, energyAmount, bandwidthAmount, duration)
        break
      case 'tronxenergy':
        const { createTronXEnergyOrder } = await import('@/lib/services/tron-rental/tronxenergy')
        order = await createTronXEnergyOrder(address, energyAmount, bandwidthAmount, duration)
        break
      default:
        return NextResponse.json(
          { error: `不支持的服务商: ${provider}` },
          { status: 400 }
        )
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('创建租赁订单失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建订单失败' },
      { status: 500 }
    )
  }
}
