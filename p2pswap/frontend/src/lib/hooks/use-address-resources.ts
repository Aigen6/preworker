'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTronResources } from './use-tron-resources'
import { TRON_CHAIN_ID } from '@/lib/utils/wallet-utils'
import { createQueryTronWeb } from '@/lib/utils/tron-rpc-reader'
import { getUSDTDecimals } from '@/lib/utils/token-decimals'
import { readTronTokenBalance } from '@/lib/utils/tron-rpc-reader'
import { formatFromWei } from '@/lib/utils/amount-calculator'
import { ethers } from 'ethers'

export interface AddressResources {
  // USDT余额
  usdtBalance: number
  usdtBalanceLoading: boolean
  usdtBalanceError: string | null
  
  // TRON 相关
  trxBalance: number | null // TRX余额（仅TRON）
  trxBalanceLoading: boolean
  energy: number | null // Energy余额（仅TRON）
  energyLoading: boolean
  requiredEnergy: number | null // 所需Energy（仅TRON）
  
  // EVM 相关
  nativeBalance: string | null // 原生代币余额（BNB/ETH等，仅EVM）
  nativeBalanceLoading: boolean
  gasPrice: string | null // Gas价格（仅EVM）
  gasPriceLoading: boolean
  estimatedGas: string | null // 预估Gas费（仅EVM）
  
  // 检查结果
  hasEnoughBalance: boolean // 余额是否足够
  hasEnoughResources: boolean // 资源是否足够（Energy/TRX或Gas）
}

interface UseAddressResourcesParams {
  address: string
  chainId: number
  requiredAmount: number // 需要的USDT金额
  operationType: 'deposit' | 'claim' | 'enclave_deposit' | 'enclave_withdraw'
}

/**
 * 获取地址的资源信息（余额、能量、Gas费等）
 */
export function useAddressResources({
  address,
  chainId,
  requiredAmount,
  operationType,
}: UseAddressResourcesParams) {
  const isTron = chainId === TRON_CHAIN_ID
  
  // TRON资源（仅TRON链使用）
  const tronResourcesHook = useTronResources()
  const tronResources = isTron ? tronResourcesHook.resources : null
  const tronResourcesLoading = isTron ? tronResourcesHook.loading : false
  const refreshTronResources = isTron ? tronResourcesHook.refresh : () => Promise.resolve()
  
  // USDT余额
  const [usdtBalance, setUsdtBalance] = useState<number>(0)
  const [usdtBalanceLoading, setUsdtBalanceLoading] = useState(false)
  const [usdtBalanceError, setUsdtBalanceError] = useState<string | null>(null)
  
  // TRX余额（仅TRON）
  const [trxBalance, setTrxBalance] = useState<number | null>(null)
  const [trxBalanceLoading, setTrxBalanceLoading] = useState(false)
  
  // 原生代币余额和Gas（仅EVM）
  const [nativeBalance, setNativeBalance] = useState<string | null>(null)
  const [nativeBalanceLoading, setNativeBalanceLoading] = useState(false)
  const [gasPrice, setGasPrice] = useState<string | null>(null)
  const [gasPriceLoading, setGasPriceLoading] = useState(false)
  const [estimatedGas, setEstimatedGas] = useState<string | null>(null)
  
  // 所需Energy（仅TRON）
  const [requiredEnergy, setRequiredEnergy] = useState<number | null>(null)
  
  // 获取USDT余额
  const fetchUsdtBalance = useCallback(async () => {
    if (!address || !chainId) {
      setUsdtBalance(0)
      return
    }
    
    setUsdtBalanceLoading(true)
    setUsdtBalanceError(null)
    
    try {
      // USDT地址映射
      const USDT_ADDRESSES: Record<number, string> = {
        1: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum
        60: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum (SLIP-44)
        56: '0x55d398326f99059fF775485246999027B3197955', // BSC
        714: '0x55d398326f99059fF775485246999027B3197955', // BSC (SLIP-44)
        137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon
        966: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon (SLIP-44)
        195: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // TRON
      }
      
      const usdtAddress = USDT_ADDRESSES[chainId]
      if (!usdtAddress) {
        throw new Error('当前链不支持USDT')
      }
      
      let balance: bigint
      
      if (isTron) {
        // TRON链：使用自定义RPC查询
        balance = await readTronTokenBalance(usdtAddress, address)
      } else {
        // EVM链：使用ethers查询
        const rpcUrl = getEvmRpcUrl(chainId)
        if (!rpcUrl) {
          throw new Error('无法获取RPC URL')
        }
        
        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const tokenContract = new ethers.Contract(
          usdtAddress,
          ['function balanceOf(address) view returns (uint256)'],
          provider
        )
        balance = await tokenContract.balanceOf(address)
      }
      
      const decimals = getUSDTDecimals(chainId)
      const balanceStr = formatFromWei(balance, decimals)
      const balanceNumber = parseFloat(balanceStr)
      setUsdtBalance(balanceNumber)
    } catch (error: any) {
      console.error('获取USDT余额失败:', error)
      setUsdtBalanceError(error.message)
      setUsdtBalance(0)
    } finally {
      setUsdtBalanceLoading(false)
    }
  }, [address, chainId, isTron])
  
  // 获取TRX余额（仅TRON）
  const fetchTrxBalance = useCallback(async () => {
    if (!isTron || !address) {
      setTrxBalance(null)
      return
    }
    
    setTrxBalanceLoading(true)
    
    try {
      const tronWeb = createQueryTronWeb()
      const account = await tronWeb.trx.getAccount(address)
      const balance = account.balance || 0
      // TRX余额单位是SUN，1 TRX = 1,000,000 SUN
      setTrxBalance(balance / 1000000)
    } catch (error: any) {
      console.error('获取TRX余额失败:', error)
      setTrxBalance(0)
    } finally {
      setTrxBalanceLoading(false)
    }
  }, [isTron, address])
  
  // 获取原生代币余额和Gas价格（仅EVM）
  const fetchEvmResources = useCallback(async () => {
    if (isTron || !address || !chainId) {
      setNativeBalance(null)
      setGasPrice(null)
      return
    }
    
    setNativeBalanceLoading(true)
    setGasPriceLoading(true)
    
    try {
      const rpcUrl = getEvmRpcUrl(chainId)
      if (!rpcUrl) {
        throw new Error('无法获取RPC URL')
      }
      
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      
      // 获取原生代币余额
      const balance = await provider.getBalance(address)
      setNativeBalance(ethers.formatEther(balance))
      
      // 获取Gas价格
      const feeData = await provider.getFeeData()
      if (feeData.gasPrice) {
        setGasPrice(ethers.formatUnits(feeData.gasPrice, 'gwei'))
      }
      
      // 估算Gas费（简单估算，实际可能需要更复杂的逻辑）
      // 对于deposit操作，估算约200,000 gas；对于claim操作，估算约100,000 gas
      const estimatedGasLimit = operationType === 'deposit' ? 200000 : 100000
      if (feeData.gasPrice) {
        const estimatedCost = feeData.gasPrice * BigInt(estimatedGasLimit)
        setEstimatedGas(ethers.formatEther(estimatedCost))
      }
    } catch (error: any) {
      console.error('获取EVM资源失败:', error)
      setNativeBalance(null)
      setGasPrice(null)
    } finally {
      setNativeBalanceLoading(false)
      setGasPriceLoading(false)
    }
  }, [isTron, address, chainId, operationType])
  
  // 获取所需Energy（仅TRON）
  useEffect(() => {
    if (!isTron) {
      setRequiredEnergy(null)
      return
    }
    
    // 根据操作类型从配置中获取所需Energy
    try {
      const { getTronEnergyRequirement } = require('@/lib/config/tron-energy-requirements')
      let energyReq
      
      if (operationType === 'deposit') {
        // deposit操作可能需要approve和deposit，使用treasury-deposit或default
        energyReq = getTronEnergyRequirement('treasury-deposit')
      } else if (operationType === 'claim') {
        // claim操作使用default
        energyReq = getTronEnergyRequirement('default')
      } else {
        energyReq = getTronEnergyRequirement('default')
      }
      
      setRequiredEnergy(energyReq.energy)
    } catch (error) {
      // 如果配置加载失败，使用默认值
      console.warn('无法加载TRON Energy配置，使用默认值:', error)
      let energy = 131000
      if (operationType === 'deposit') {
        energy = 200000
      } else if (operationType === 'claim') {
        energy = 100000
      }
      setRequiredEnergy(energy)
    }
  }, [isTron, operationType])
  
  // 刷新所有资源
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchUsdtBalance(),
      isTron ? fetchTrxBalance() : fetchEvmResources(),
      isTron ? refreshTronResources() : Promise.resolve(),
    ])
  }, [fetchUsdtBalance, fetchTrxBalance, fetchEvmResources, refreshTronResources, isTron])
  
  // 初始加载和地址/链变化时刷新
  useEffect(() => {
    if (address && chainId) {
      fetchUsdtBalance()
      if (isTron) {
        fetchTrxBalance()
      } else {
        fetchEvmResources()
      }
    }
  }, [address, chainId, fetchUsdtBalance, fetchTrxBalance, fetchEvmResources, isTron])
  
  // 计算检查结果
  const hasEnoughBalance = usdtBalance >= requiredAmount
  
  // 对于enclave_deposit，只需要检查余额（不需要Energy/Gas，因为是SDK操作）
  const needsResourceCheck = operationType !== 'enclave_deposit'
  
  const hasEnoughResources = !needsResourceCheck
    ? true // enclave_deposit不需要资源检查
    : isTron
    ? (trxBalance !== null && trxBalance >= 1 && 
       tronResources !== null && 
       requiredEnergy !== null && 
       tronResources.energy >= requiredEnergy)
    : (nativeBalance !== null && estimatedGas !== null && 
       parseFloat(nativeBalance) >= parseFloat(estimatedGas) * 1.5) // 保留1.5倍余量
  
  return {
    usdtBalance,
    usdtBalanceLoading,
    usdtBalanceError,
    trxBalance,
    trxBalanceLoading,
    energy: tronResources?.energy ?? null,
    energyLoading: tronResourcesLoading,
    requiredEnergy,
    nativeBalance,
    nativeBalanceLoading,
    gasPrice,
    gasPriceLoading,
    estimatedGas,
    hasEnoughBalance,
    hasEnoughResources,
    refresh: refreshAll,
  }
}

/**
 * 获取EVM链的RPC URL
 */
function getEvmRpcUrl(chainId: number): string | null {
  const rpcMap: Record<number, string> = {
    1: process.env.NEXT_PUBLIC_ETH_RPC || 'https://eth.llamarpc.com',
    56: process.env.NEXT_PUBLIC_BSC_RPC || 'https://bsc-dataseed.binance.org',
    714: process.env.NEXT_PUBLIC_BSC_RPC || 'https://bsc-dataseed.binance.org',
    137: process.env.NEXT_PUBLIC_POLYGON_RPC || 'https://polygon-rpc.com',
  }
  
  return rpcMap[chainId] || null
}
