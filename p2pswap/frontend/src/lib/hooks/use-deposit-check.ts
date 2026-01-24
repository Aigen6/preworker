'use client'

import { useState, useEffect, useCallback } from 'react'
import { DEPOSIT_VAULT_ABI } from '../abis/deposit-vault'
import { ethers } from 'ethers'
import { TRON_CHAIN_ID } from '../utils/wallet-utils'
import { createQueryTronWeb } from '../utils/tron-rpc-reader'

export interface DepositInfo {
  depositor: string
  depositTime: number
  used: boolean
  intendedRecipient: string
  yieldAmount: string
  yieldToken: string
  token: string
}

/**
 * 检查DepositVault中是否存在指定的deposit
 */
export function useDepositCheck(
  vaultAddress: string | null,
  depositId: string | null | undefined,
  chainId: number
) {
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exists, setExists] = useState<boolean>(false)

  const checkDeposit = useCallback(async () => {
    if (!vaultAddress || !depositId || !chainId) {
      setDepositInfo(null)
      setExists(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 将depositId转换为数字（如果是字符串）
      const depositIdNum = depositId ? (typeof depositId === 'string' ? BigInt(depositId) : BigInt(depositId)) : null
      if (!depositIdNum) {
        setDepositInfo(null)
        setExists(false)
        return
      }
      
      if (chainId === TRON_CHAIN_ID) {
        // TRON链：使用TronWeb查询
        const tronWeb = createQueryTronWeb()
        const result = await tronWeb.contract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as any
        ).methods.getDeposit(depositIdNum.toString()).call()

        if (result && result.depositor) {
          const info: DepositInfo = {
            depositor: result.depositor,
            depositTime: Number(result.depositTime || 0),
            used: result.used || false,
            intendedRecipient: result.intendedRecipient || '',
            yieldAmount: result.yieldAmount?.toString() || '0',
            yieldToken: result.yieldToken || '',
            token: result.token || '',
          }
          setDepositInfo(info)
          setExists(true)
        } else {
          setDepositInfo(null)
          setExists(false)
        }
      } else {
        // EVM链：使用ethers查询
        const rpcUrl = getEvmRpcUrl(chainId)
        if (!rpcUrl) {
          throw new Error('无法获取RPC URL')
        }

        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(
          vaultAddress,
          DEPOSIT_VAULT_ABI,
          provider
        )

        const result = await contract.getDeposit(depositIdNum)

        if (result && result.depositor && result.depositor !== ethers.ZeroAddress) {
          const info: DepositInfo = {
            depositor: result.depositor,
            depositTime: Number(result.depositTime || 0),
            used: result.used || false,
            intendedRecipient: result.intendedRecipient || '',
            yieldAmount: result.yieldAmount?.toString() || '0',
            yieldToken: result.yieldToken || '',
            token: result.token || '',
          }
          setDepositInfo(info)
          setExists(true)
        } else {
          setDepositInfo(null)
          setExists(false)
        }
      }
    } catch (error: any) {
      console.error('查询Deposit失败:', error)
      setError(error.message)
      setDepositInfo(null)
      setExists(false)
    } finally {
      setLoading(false)
    }
  }, [vaultAddress, depositId, chainId])

  useEffect(() => {
    checkDeposit()
  }, [checkDeposit])

  return {
    depositInfo,
    exists,
    loading,
    error,
    refresh: checkDeposit,
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
