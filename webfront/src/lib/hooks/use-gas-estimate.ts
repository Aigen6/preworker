'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWalletConnection } from './use-wallet-connection'

interface GasEstimate {
  estimatedGas: string // Gas Limit (通常是 "21000")
  currentGasPrice: string // Gas Price (如 "5 gwei")
  gasCostInNative: string // 原生代币费用 (如 "0.00010500 BNB")
  gasCostInUSD: string // USD 费用 (如 "0.06")
  recommendation: 'low' | 'normal' | 'high'
}

interface TokenPrice {
  [tokenSymbol: string]: number // 代币价格，单位：USD
}

/**
 * 获取链上 Gas Price 和计算 Gas 费用
 * 使用 Gate.io API 获取代币价格
 */
export function useGasEstimate(chainId?: number, gasLimit: string = '21000') {
  const { chainId: connectedChainId } = useWalletConnection()
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenPrices, setTokenPrices] = useState<TokenPrice>({})

  // 获取 Gate.io 代币价格
  const fetchTokenPrices = useCallback(async () => {
    try {
      // Gate.io Spot API: 获取 USDT 价格（以 USD 为基准）
      const response = await fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=USDT_USD')
      if (!response.ok) {
        throw new Error('Failed to fetch token prices')
      }
      const data = await response.json()
      
      // Gate.io 返回格式: [{ "currency_pair": "USDT_USD", "last": "1.00", ... }]
      const prices: TokenPrice = {}
      if (Array.isArray(data) && data.length > 0) {
        const usdtPrice = parseFloat(data[0].last || '1.0')
        prices['USDT'] = usdtPrice
        
        // 获取其他常见代币价格
        const tokens = ['ETH', 'BNB', 'TRX', 'USDC', 'WBTC']
        for (const token of tokens) {
          try {
            const pair = token === 'ETH' ? 'ETH_USDT' : 
                        token === 'BNB' ? 'BNB_USDT' :
                        token === 'TRX' ? 'TRX_USDT' :
                        token === 'USDC' ? 'USDC_USDT' :
                        token === 'WBTC' ? 'WBTC_USDT' : `${token}_USDT`
            
            const tokenResponse = await fetch(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`)
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json()
              if (Array.isArray(tokenData) && tokenData.length > 0) {
                const price = parseFloat(tokenData[0].last || '0')
                prices[token] = price * usdtPrice // 转换为 USD
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch ${token} price:`, err)
          }
        }
      }
      
      setTokenPrices(prices)
      return prices
    } catch (err) {
      console.error('Failed to fetch token prices from Gate.io:', err)
      // 使用默认价格
      return {
        'USDT': 1.0,
        'ETH': 2000.0,
        'BNB': 600.0,
        'TRX': 0.1,
        'USDC': 1.0,
        'WBTC': 60000.0,
      }
    }
  }, [])

  // 获取链上 Gas Price
  const fetchGasPrice = useCallback(async (targetChainId: number): Promise<string> => {
    // 对于 EVM 链，使用 window.ethereum
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not available')
    }

    try {
      // 使用 eth_gasPrice RPC 方法
      const gasPriceHex = await window.ethereum.request({
        method: 'eth_gasPrice',
        params: [],
      }) as string

      // 转换为 Gwei
      const gasPriceWei = BigInt(gasPriceHex)
      const gasPriceGwei = Number(gasPriceWei) / 1e9

      return `${gasPriceGwei.toFixed(2)} gwei`
    } catch (err) {
      console.error('Failed to fetch gas price from chain:', err)
      
      // Fallback: 根据链 ID 返回默认值
      const defaultPrices: Record<number, string> = {
        1: '30 gwei',   // Ethereum
        56: '5 gwei',   // BSC
        137: '50 gwei', // Polygon
        195: '1000 sun', // TRON (需要特殊处理)
      }
      
      return defaultPrices[targetChainId] || '10 gwei'
    }
  }, [])

  // 计算 Gas 费用
  const calculateGasCost = useCallback(async (
    gasPriceStr: string,
    gasLimitStr: string,
    chainId: number,
    tokenPrices: TokenPrice
  ): Promise<{ gasCostInNative: string; gasCostInUSD: string }> => {
    // 解析 Gas Price
    const gasPriceMatch = gasPriceStr.match(/([\d.]+)\s*(gwei|wei|sun)/i)
    if (!gasPriceMatch) {
      throw new Error('Invalid gas price format')
    }

    const gasPriceValue = parseFloat(gasPriceMatch[1])
    const gasPriceUnit = gasPriceMatch[2].toLowerCase()
    const gasLimit = BigInt(gasLimitStr)

    // 转换为 Wei
    let gasPriceWei: bigint
    if (gasPriceUnit === 'gwei') {
      gasPriceWei = BigInt(Math.floor(gasPriceValue * 1e9))
    } else if (gasPriceUnit === 'wei') {
      gasPriceWei = BigInt(Math.floor(gasPriceValue))
    } else if (gasPriceUnit === 'sun') {
      // TRON: 1 TRX = 1,000,000 sun
      gasPriceWei = BigInt(Math.floor(gasPriceValue * 1e6))
    } else {
      throw new Error(`Unsupported gas price unit: ${gasPriceUnit}`)
    }

    // 计算总 Gas 费用（Wei）
    const totalGasWei = gasPriceWei * gasLimit

    // 转换为原生代币数量
    const totalGasNative = Number(totalGasWei) / 1e18

    // 获取原生代币符号和价格
    const nativeTokenMap: Record<number, { symbol: string; decimals: number }> = {
      1: { symbol: 'ETH', decimals: 18 },
      56: { symbol: 'BNB', decimals: 18 },
      137: { symbol: 'MATIC', decimals: 18 },
      195: { symbol: 'TRX', decimals: 6 }, // TRON 使用 6 位小数
    }

    const nativeToken = nativeTokenMap[chainId] || { symbol: 'ETH', decimals: 18 }
    
    // TRON 特殊处理
    let gasCostInNative: string
    if (chainId === 195) {
      // TRON: 1 TRX = 1,000,000 sun, Gas 费用以 sun 为单位
      const totalGasSun = Number(totalGasWei)
      const totalGasTRX = totalGasSun / 1e6
      gasCostInNative = `${totalGasTRX.toFixed(8)} ${nativeToken.symbol}`
    } else {
      gasCostInNative = `${totalGasNative.toFixed(8)} ${nativeToken.symbol}`
    }

    // 转换为 USD
    const nativePrice = tokenPrices[nativeToken.symbol] || 
                       (nativeToken.symbol === 'ETH' ? 2000 :
                        nativeToken.symbol === 'BNB' ? 600 :
                        nativeToken.symbol === 'TRX' ? 0.1 : 1.0)
    
    const gasCostInUSD = (totalGasNative * nativePrice).toFixed(2)

    return {
      gasCostInNative,
      gasCostInUSD,
    }
  }, [])

  // 获取 Gas 费用估算
  const fetchGasEstimate = useCallback(async () => {
    const targetChainId = chainId || connectedChainId
    if (!targetChainId) {
      setError('Chain ID not available')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. 获取代币价格
      const prices = await fetchTokenPrices()

      // 2. 获取链上 Gas Price
      const gasPrice = await fetchGasPrice(targetChainId)

      // 3. 计算 Gas 费用
      const { gasCostInNative, gasCostInUSD } = await calculateGasCost(
        gasPrice,
        gasLimit,
        targetChainId,
        prices
      )

      // 4. 确定推荐等级（基于 Gas Price）
      const gasPriceValue = parseFloat(gasPrice.match(/([\d.]+)/)?.[1] || '0')
      let recommendation: 'low' | 'normal' | 'high' = 'normal'
      
      if (targetChainId === 1) { // Ethereum
        if (gasPriceValue < 20) recommendation = 'low'
        else if (gasPriceValue > 50) recommendation = 'high'
      } else if (targetChainId === 56) { // BSC
        if (gasPriceValue < 3) recommendation = 'low'
        else if (gasPriceValue > 10) recommendation = 'high'
      }

      setGasEstimate({
        estimatedGas: gasLimit,
        currentGasPrice: gasPrice,
        gasCostInNative,
        gasCostInUSD,
        recommendation,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to estimate gas'
      setError(errorMessage)
      console.error('Gas estimate error:', err)
    } finally {
      setLoading(false)
    }
  }, [chainId, connectedChainId, gasLimit, fetchTokenPrices, fetchGasPrice, calculateGasCost])

  // 当 chainId 或 gasLimit 变化时自动刷新
  useEffect(() => {
    if (chainId || connectedChainId) {
      fetchGasEstimate()
    }
  }, [chainId, connectedChainId, gasLimit, fetchGasEstimate])

  return {
    gasEstimate,
    loading,
    error,
    refresh: fetchGasEstimate,
    tokenPrices,
  }
}












