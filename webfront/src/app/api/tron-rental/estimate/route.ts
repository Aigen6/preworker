import { NextRequest, NextResponse } from 'next/server'

/**
 * 估算租赁费用
 * POST /api/tron-rental/estimate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, energyAmount, bandwidthAmount, duration } = body

    if (!provider || !energyAmount || !bandwidthAmount) {
      return NextResponse.json(
        { error: '缺少必需参数: provider, energyAmount, bandwidthAmount' },
        { status: 400 }
      )
    }

    // 根据不同的服务商调用不同的实现
    let estimate
    switch (provider) {
      case 'gasstation':
        const { estimateGasStation } = await import('@/lib/services/tron-rental/gasstation')
        estimate = await estimateGasStation(energyAmount, bandwidthAmount, duration)
        break
      case 'catfee':
        const { estimateCatFee } = await import('@/lib/services/tron-rental/catfee')
        estimate = await estimateCatFee(energyAmount, bandwidthAmount, duration)
        break
      case 'tronfuel':
        const { estimateTronFuel } = await import('@/lib/services/tron-rental/tronfuel')
        estimate = await estimateTronFuel(energyAmount, bandwidthAmount, duration)
        break
      case 'tronxenergy':
        const { estimateTronXEnergy } = await import('@/lib/services/tron-rental/tronxenergy')
        estimate = await estimateTronXEnergy(energyAmount, bandwidthAmount, duration)
        break
      default:
        return NextResponse.json(
          { error: `不支持的服务商: ${provider}` },
          { status: 400 }
        )
    }

    return NextResponse.json(estimate)
  } catch (error) {
    console.error('估算租赁费用失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '估算失败' },
      { status: 500 }
    )
  }
}
