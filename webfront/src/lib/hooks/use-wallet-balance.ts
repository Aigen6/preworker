'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'
import { useWalletConnection } from './use-wallet-connection'
import { useSDKStore } from '../stores/sdk-store'
import { ERC20_ABI } from '../abis/erc20'
import { getSlip44FromChainId } from '@enclave-hq/sdk'
import { getChainInfoByNative, getChainInfoBySlip44, ChainType } from '@enclave-hq/chain-utils'
import { getUSDTDecimals } from '../utils/token-decimals'

/**
 * 根据链 ID 获取链类型
 * 支持 EVM Chain ID 和 SLIP-44 Chain ID
 */
function getChainTypeFromId(chainId: number): ChainType | null {
  // 先尝试作为 native chain ID
  const nativeInfo = getChainInfoByNative(chainId)
  if (nativeInfo) {
    return nativeInfo.chainType
  }
  
  // 再尝试作为 SLIP-44 chain ID
  const slip44Info = getChainInfoBySlip44(chainId)
  if (slip44Info) {
    return slip44Info.chainType
  }
  
  return null
}

// 不同链的 USDT 地址映射
const USDT_ADDRESSES: Record<number, string> = {
  // EVM 链
  1: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum Mainnet
  60: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum (SLIP-44)
  56: '0x55d398326f99059fF775485246999027B3197955', // BSC Mainnet
  714: '0x55d398326f99059fF775485246999027B3197955', // BSC (SLIP-44)
  137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon
  966: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon (SLIP-44)
  // TRON 链
  195: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // TRON USDT (SLIP-44)
}

/**
 * useWalletBalance - 获取钱包 USDT 余额 Hook
 */
export function useWalletBalance() {
  const { walletManager } = useSDKWallet()
  const { address, chainId, isConnected } = useWalletConnection()
  const sdkStore = useSDKStore()
  const [balance, setBalance] = useState<string>('0.00')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 获取钱包余额
   * 使用传入的 chainId（来自 useWalletConnection），确保 React 能正确响应链切换
   */
  const fetchBalance = useCallback(async () => {
    if (!walletManager || !address || !chainId || !isConnected) {
      setBalance('0.00')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // 获取 account 用于验证和获取地址
      const account = walletManager.getPrimaryAccount()
      if (!account) {
        setBalance('0.00')
        return
      }

      // 使用传入的 chainId（来自 useWalletConnection，会随 account.chainId 更新而更新）
      // 这样确保 React 能正确响应链切换
      const actualChainId = chainId

      const actualSlip44ChainId = getSlip44FromChainId(actualChainId) || actualChainId
      const actualUsdtAddress = USDT_ADDRESSES[actualChainId] || USDT_ADDRESSES[actualSlip44ChainId]
      
      if (!actualUsdtAddress) {
        console.warn(`[useWalletBalance] 实际链 (chainId: ${actualChainId}) 不支持 USDT`)
        setError(`当前链 (${actualChainId}) 不支持 USDT`)
        setBalance('0.00')
        return
      }

      // 验证 account.chainId 是否与传入的 chainId 一致
      // 如果不一致，说明 SDK 的 account 还没有更新，等待 React 重新触发
      if (account.chainId && account.chainId !== chainId) {
        console.log('[useWalletBalance] account.chainId 与传入的 chainId 不一致，跳过本次查询:', {
          accountChainId: account.chainId,
          hookChainId: chainId,
          note: '等待 account 更新后，React 会自动重新触发查询'
        })
        setBalance('0.00')
        return
      }

      // 等待 SDK 重新初始化完成（如果正在初始化）
      // 这确保 walletManager 的 provider 已经更新到新的链
      if (sdkStore.isLoading) {
        console.log('[useWalletBalance] SDK 正在重新初始化，等待完成...')
        let waitCount = 0
        const maxWait = 50 // 最多等待 5 秒
        
        while (sdkStore.isLoading && waitCount < maxWait) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          waitCount++
        }
        
        if (sdkStore.isLoading) {
          console.warn('[useWalletBalance] ⚠️ 等待 SDK 重新初始化超时，但仍尝试查询余额')
        } else {
          console.log('[useWalletBalance] ✅ SDK 重新初始化完成')
        }
      }

      // 对于 EVM 链，严格验证 RPC provider 是否真的切换到了目标链
      // 必须确保 RPC provider 的链 ID 与传入的 chainId 一致
      // 并且需要多次验证，确保 RPC provider 已经稳定切换到目标链
      if (account.chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
        try {
          // 多次验证 RPC provider 的链 ID，确保已经稳定切换
          let rpcChainId: number | null = null
          let verificationCount = 0
          const maxVerifications = 3
          
          while (verificationCount < maxVerifications) {
            const rpcChainIdHex = await window.ethereum.request({
              method: 'eth_chainId',
            }) as string
            const currentRpcChainId = parseInt(rpcChainIdHex, 16)
            
            if (verificationCount === 0) {
              rpcChainId = currentRpcChainId
            } else if (rpcChainId !== currentRpcChainId) {
              // 如果多次验证结果不一致，说明 RPC provider 还在切换中
              console.warn('[useWalletBalance] RPC provider 链 ID 不稳定，可能还在切换中:', {
                firstCheck: rpcChainId,
                currentCheck: currentRpcChainId,
                accountChainId: account.chainId,
                verificationCount: verificationCount + 1
              })
              setBalance('0.00')
              return
            }
            
            verificationCount++
            if (verificationCount < maxVerifications) {
              // 等待一小段时间再验证
              await new Promise((resolve) => setTimeout(resolve, 200))
            }
          }
          
          // 必须确保 RPC provider 的链 ID 与传入的 chainId 一致
          if (rpcChainId !== chainId) {
            console.warn('[useWalletBalance] RPC provider 链 ID 与传入的 chainId 不一致，跳过本次查询:', {
              rpcChainId,
              hookChainId: chainId,
              accountChainId: account.chainId,
              note: 'RPC provider 可能还在切换中，等待同步后会自动重新查询'
            })
            setBalance('0.00')
            return
          }
          
          console.log('[useWalletBalance] ✅ 链 ID 验证通过（多次验证），RPC provider 与 chainId 一致:', {
            rpcChainId,
            hookChainId: chainId,
            accountChainId: account.chainId,
            verificationCount: maxVerifications
          })
        } catch (rpcErr) {
          console.warn('[useWalletBalance] 无法验证 RPC provider 链 ID:', rpcErr)
          // 如果无法验证，对于 EVM 链，为了安全起见，跳过查询
          // 因为无法确认 RPC provider 是否在正确的链上
          if (account.chainType === 'evm') {
            console.warn('[useWalletBalance] EVM 链无法验证 RPC provider，跳过查询以确保安全')
            setBalance('0.00')
            return
          }
        }
      }

      // 获取链类型（用于 readContract）
      // 使用 actualChainId 确保链类型正确
      const chainType = getChainTypeFromId(actualChainId) || 
                       getChainTypeFromId(actualSlip44ChainId) || 
                       account.chainType

      console.log('🔍 [useWalletBalance] 读取余额:', {
        accountChainId: account.chainId,
        actualChainId,
        actualSlip44ChainId,
        chainType,
        usdtAddress: actualUsdtAddress,
        accountAddress: account.nativeAddress
      })

      // 读取余额（传入 chainType 参数以支持 TRON 链）
      // 使用 actualUsdtAddress 和 actualChainId 确保使用正确的链信息
      // 添加重试机制，因为链切换后 RPC 可能需要一些时间才能响应
      let balanceResult
      let retryCount = 0
      const maxRetries = 3
      
      while (retryCount < maxRetries) {
        try {
          // 在每次重试前，再次验证 RPC provider 的链 ID（对于 EVM 链）
          if (retryCount > 0 && account.chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
            try {
              const rpcChainIdHex = await window.ethereum.request({
                method: 'eth_chainId',
              }) as string
              const rpcChainId = parseInt(rpcChainIdHex, 16)
              
              if (rpcChainId !== chainId) {
                console.warn(`[useWalletBalance] 重试前验证：RPC provider 链 ID 仍不一致，继续等待:`, {
                  rpcChainId,
                  hookChainId: chainId,
                  accountChainId: account.chainId,
                  retryCount
                })
                // 等待更长时间
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
                continue
              } else {
                console.log(`[useWalletBalance] 重试前验证：RPC provider 链 ID 已一致，继续查询:`, {
                  rpcChainId,
                  hookChainId: chainId,
                  accountChainId: account.chainId
                })
              }
            } catch (rpcErr) {
              console.warn('[useWalletBalance] 重试前无法验证 RPC provider:', rpcErr)
            }
          }
          
          // 在调用 readContract 前，再次验证 RPC provider 的链 ID
          // 因为 walletManager 可能使用缓存的 provider，需要确保 provider 已切换到正确的链
          // 同时等待一小段时间，确保 SDK 的 provider 已更新
          if (account.chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
            // 等待一小段时间，确保 SDK 的 provider 已更新
            if (retryCount === 0) {
              await new Promise((resolve) => setTimeout(resolve, 500))
            }
            
            const finalRpcChainIdHex = await window.ethereum.request({
              method: 'eth_chainId',
            }) as string
            const finalRpcChainId = parseInt(finalRpcChainIdHex, 16)
            
            if (finalRpcChainId !== chainId) {
              console.warn('[useWalletBalance] 调用 readContract 前验证失败，RPC provider 链 ID 不一致:', {
                rpcChainId: finalRpcChainId,
                hookChainId: chainId,
                accountChainId: account.chainId,
                retryCount,
                note: '跳过本次查询，等待 RPC provider 切换完成'
              })
              // 如果是重试，继续重试循环
              if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
                continue
              } else {
                setBalance('0.00')
                return
              }
            }
            
            console.log('[useWalletBalance] ✅ 调用 readContract 前最终验证通过:', {
              rpcChainId: finalRpcChainId,
              hookChainId: chainId,
              accountChainId: account.chainId,
              retryCount
            })
          }
          
          // 对于 EVM 链，直接使用 window.ethereum 查询余额，避免 walletManager 的缓存 provider 问题
          if (account.chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
            try {
              // 使用 eth_call 直接调用合约
              // 编码 balanceOf(address) 函数调用
              const functionSignature = '0x70a08231' // balanceOf(address) 的函数选择器
              const addressParam = account.nativeAddress.slice(2).padStart(64, '0') // 移除 0x 并补齐到 64 字符
              const data = functionSignature + addressParam
              
              const result = await window.ethereum.request({
                method: 'eth_call',
                params: [{
                  to: actualUsdtAddress,
                  data: data
                }, 'latest']
              }) as string
              
              if (result && result !== '0x') {
                balanceResult = BigInt(result)
                console.log('[useWalletBalance] ✅ 直接使用 window.ethereum 查询余额成功')
              } else {
                throw new Error('Contract returned no data')
              }
            } catch (directErr) {
              console.warn('[useWalletBalance] 直接使用 window.ethereum 查询失败，回退到 walletManager:', directErr)
              // 回退到使用 walletManager
              balanceResult = await walletManager.readContract(
                actualUsdtAddress,
                ERC20_ABI as unknown as any[],
                'balanceOf',
                [account.nativeAddress],
                chainType
              )
            }
          } else {
            // 非 EVM 链或没有 window.ethereum，使用 walletManager
            balanceResult = await walletManager.readContract(
              actualUsdtAddress,
              ERC20_ABI as unknown as any[],
              'balanceOf',
              [account.nativeAddress],
              chainType
            )
          }
          break // 成功则跳出循环
        } catch (err: any) {
          retryCount++
          const errorMessage = err?.message || String(err)
          const isZeroDataError = errorMessage.includes('returned no data') || 
                                  errorMessage.includes('0x') ||
                                  errorMessage.includes('ContractFunctionZeroDataError')
          
          if (isZeroDataError && retryCount < maxRetries) {
            console.warn(`[useWalletBalance] 读取余额失败（可能是 RPC 未切换），重试 ${retryCount}/${maxRetries}:`, {
              error: err,
              hookChainId: chainId,
              accountChainId: account.chainId,
              note: 'RPC provider 可能还在切换中，将在重试前再次验证'
            })
            // 等待一段时间后重试（递增延迟）
            await new Promise(resolve => setTimeout(resolve, 500 * retryCount))
            continue
          } else {
            // 不是零数据错误，或者已达到最大重试次数，抛出错误
            throw err
          }
        }
      }
      
      if (!balanceResult) {
        throw new Error('读取余额失败：所有重试都失败了')
      }
      
      // 使用 actualSlip44ChainId 获取小数位数
      const decimals = getUSDTDecimals(actualSlip44ChainId)
      
      // 转换余额（从最小单位转换为可读格式）
      // balanceResult 可能是 BigInt（直接使用 window.ethereum 时）或需要 toString() 的结果
      const balanceBigInt = typeof balanceResult === 'bigint' ? balanceResult : BigInt(balanceResult.toString())
      console.log('[useWalletBalance] 余额查询成功:', {
        balanceBigInt: balanceBigInt.toString(),
        decimals,
        chainId: actualChainId
      })
      // 使用 BigInt 计算 divisor，避免浮点数精度问题
      const divisor = BigInt(10) ** BigInt(decimals)
      const wholePart = balanceBigInt / divisor
      const fractionalPart = balanceBigInt % divisor
      
      // 格式化为字符串，保留 2 位小数
      if (fractionalPart === BigInt(0)) {
        setBalance(wholePart.toString() + '.00')
      } else {
        const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
        // 取前 2 位小数，并处理四舍五入
        const fractionalDisplay = fractionalStr.slice(0, 2)
        const thirdDigit = fractionalStr.length > 2 ? parseInt(fractionalStr[2]) : 0
        let roundedFractional = parseInt(fractionalDisplay)
        
        // 如果第三位数字 >= 5，则向上舍入
        if (thirdDigit >= 5 && roundedFractional < 99) {
          roundedFractional += 1
        }
        
        const balanceStr = `${wholePart.toString()}.${roundedFractional.toString().padStart(2, '0')}`
        setBalance(parseFloat(balanceStr).toFixed(2))
      }
    } catch (err) {
      console.error('获取钱包余额失败:', err)
      setError(err instanceof Error ? err.message : '获取余额失败')
      setBalance('0.00')
    } finally {
      setLoading(false)
    }
  }, [walletManager, address, chainId, isConnected])

  // 当钱包连接状态或链 ID 改变时，自动获取余额
  // 依赖 chainId，这样当链切换后，React 会自动触发重新执行
  useEffect(() => {
    if (!isConnected || !address || !chainId) {
      setBalance('0.00')
      return
    }
    
    console.log('[useWalletBalance] chainId 变化，触发余额查询:', {
      chainId,
      address
    })
    
    // 延迟一下，确保 SDK 状态已更新
    const timer = setTimeout(() => {
      fetchBalance()
    }, 500)
    
    return () => clearTimeout(timer)
  }, [isConnected, address, chainId, fetchBalance])

  // 定期刷新余额（每 10 秒）
  useEffect(() => {
    if (!isConnected || !address || !chainId) return

    const interval = setInterval(() => {
      fetchBalance()
    }, 10000) // 10 秒刷新一次

    return () => clearInterval(interval)
  }, [isConnected, address, chainId, fetchBalance])

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance,
  }
}

