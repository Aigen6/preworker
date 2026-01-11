'use client'

import { useCallback, useState } from 'react'
import { useSDKStore } from '../stores/sdk-store'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'
import { getSlip44FromChainId, getEvmChainIdFromSlip44 } from '@enclave-hq/sdk'
import { getChainInfoByNative, getChainInfoBySlip44, ChainType } from '@enclave-hq/chain-utils'
import { ERC20_ABI } from '../abis/erc20'
import { TREASURY_ABI } from '../abis/treasury'
import { formatFromWei } from '../utils/amount-calculator'
import { useTranslation } from './use-translation'

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

/**
 * useTreasuryDeposit - Treasury 存款操作 Hook
 */
export function useTreasuryDeposit() {
  const sdkStore = useSDKStore()
  const { walletManager } = useSDKWallet()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 授权 Token 给 Treasury
   */
  const approveToken = useCallback(
    async (tokenAddress: string, treasuryAddress: string, amount: bigint) => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      const account = walletManager.getPrimaryAccount()
      if (!account) {
        throw new Error('钱包未连接')
      }

      // 验证地址
      const finalTokenAddress = tokenAddress?.trim()
      const finalTreasuryAddress = treasuryAddress?.trim()
      const finalAccountAddress = account.nativeAddress?.trim()

      if (!finalTokenAddress || finalTokenAddress.length < 10) {
        throw new Error(`Token 地址不能为空或格式无效: ${finalTokenAddress}`)
      }
      if (!finalTreasuryAddress || finalTreasuryAddress.length < 10) {
        throw new Error(`Treasury 地址不能为空或格式无效: ${finalTreasuryAddress}`)
      }
      if (!finalAccountAddress || finalAccountAddress.length < 10) {
        throw new Error(`账户地址不能为空或格式无效: ${finalAccountAddress}`)
      }

      // 根据账户的链类型确定 chainType（如果不匹配，可能需要根据 treasuryAddress 的链类型判断）
      const chainType = account.chainType

      console.log('🔍 [approveToken] 检查授权额度:', {
        tokenAddress: finalTokenAddress,
        treasuryAddress: finalTreasuryAddress,
        accountAddress: finalAccountAddress,
        chainType,
      })

      // 检查当前授权额度
      // 对于 EVM 链，直接使用 window.ethereum 查询，避免 walletManager 的缓存 provider 问题
      let allowance: bigint
      
      if (chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
        try {
          // 使用 eth_call 直接调用合约
          const functionSignature = '0xdd62ed3e' // allowance(address,address)
          const ownerParam = finalAccountAddress.slice(2).padStart(64, '0')
          const spenderParam = finalTreasuryAddress.slice(2).padStart(64, '0')
          const data = functionSignature + ownerParam + spenderParam
          
          const result = await window.ethereum.request({
            method: 'eth_call',
            params: [{
              to: finalTokenAddress,
              data: data
            }, 'latest']
          }) as string
          
          if (result && result !== '0x') {
            allowance = BigInt(result)
            console.log('[approveToken] ✅ 直接使用 window.ethereum 查询授权额度成功')
          } else {
            throw new Error('Contract returned no data')
          }
        } catch (directErr) {
          console.warn('[approveToken] 直接使用 window.ethereum 查询失败，回退到 walletManager:', directErr)
          // 回退到使用 walletManager
          const allowanceResult = await walletManager.readContract(
            finalTokenAddress,
            ERC20_ABI as unknown as any[],
            'allowance',
            [finalAccountAddress, finalTreasuryAddress],
            chainType
          )
          allowance = BigInt(allowanceResult.toString())
        }
      } else {
        // 非 EVM 链或没有 window.ethereum，使用 walletManager
        const allowanceResult = await walletManager.readContract(
          finalTokenAddress,
          ERC20_ABI as unknown as any[],
          'allowance',
          [finalAccountAddress, finalTreasuryAddress],
          chainType
        )
        allowance = BigInt(allowanceResult.toString())
      }

      // 如果授权足够，直接返回
      if (BigInt(allowance.toString()) >= amount) {
        return { txHash: null, alreadyApproved: true }
      }

      // 执行授权
      // 对于 TRON 链，gas 参数会被转换为 feeLimit（单位：SUN，1 TRX = 1,000,000 SUN）
      // 默认使用较大的值以确保交易成功，或者不传让适配器使用默认值
      const gasOptions = chainType === 'tron' 
        ? { gas: 100_000_000 } // TRON: 100 TRX 的 feeLimit（足够大）
        : { gas: 100000 } // EVM: Gas limit for approve
      
      console.log('🔍 [approveToken] 执行授权交易:', {
        tokenAddress: finalTokenAddress,
        treasuryAddress: finalTreasuryAddress,
        amount: amount.toString(),
        chainType,
        gasOptions,
      })
      
      const txHash = await walletManager.writeContract(
        finalTokenAddress,
        ERC20_ABI as unknown as any[],
        'approve',
        [finalTreasuryAddress, amount],
        gasOptions,
        chainType
      )

      // 等待确认
      await walletManager.waitForTransaction(txHash)

      return { txHash, alreadyApproved: false }
    },
    [walletManager]
  )

  /**
   * 存款到 Treasury
   */
  const deposit = useCallback(
    async (params: {
      tokenAddress: string
      amount: string // 以 wei 为单位的金额字符串
      chainId: number // SLIP-44 chain ID
      promoCode?: string
    }) => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      const account = walletManager.getPrimaryAccount()
      if (!account) {
        throw new Error('钱包未连接')
      }

      setLoading(true)
      setError(null)

      try {
        // 1. 转换 chain ID（如果传入的是 EVM chain ID，转换为 SLIP-44）
        const slip44ChainId = getSlip44FromChainId(params.chainId) || params.chainId
        
        // 2. 从 Store 获取 Treasury 地址（如果未加载，则从 API 获取）
        let treasuryAddress = sdkStore.sdk.stores.chainConfig.getTreasuryAddress(slip44ChainId)
        
        // 如果 Store 中没有，尝试从 API 获取并更新 Store
        if (!treasuryAddress) {
          await sdkStore.sdk.stores.chainConfig.fetchChain(slip44ChainId)
          treasuryAddress = sdkStore.sdk.stores.chainConfig.getTreasuryAddress(slip44ChainId)
        }
        
        if (!treasuryAddress || treasuryAddress.trim() === '') {
          throw new Error(`未找到链 ${slip44ChainId} 的 Treasury 地址`)
        }

        // 验证并清理地址
        const finalTokenAddress = params.tokenAddress?.trim()
        const finalTreasuryAddress = treasuryAddress.trim()
        const finalAccountAddress = account.nativeAddress?.trim()

        if (!finalTokenAddress || finalTokenAddress.length < 10) {
          throw new Error(`Token 地址不能为空或格式无效: ${finalTokenAddress}`)
        }
        if (!finalTreasuryAddress || finalTreasuryAddress.length < 10) {
          throw new Error(`Treasury 地址格式无效: ${finalTreasuryAddress}`)
        }
        if (!finalAccountAddress || finalAccountAddress.length < 10) {
          throw new Error(`账户地址格式无效: ${finalAccountAddress}`)
        }

        // 根据链 ID 确定链类型（优先使用链 ID 判断，如果无法判断则使用账户的链类型）
        // 注意：这里需要根据目标链的 chainId 来判断，而不是当前账户的链类型
        const targetChainType = getChainTypeFromId(params.chainId)
        // 如果无法从 chainId 判断，尝试从 SLIP-44 chainId 判断
        const targetSlip44ChainId = getSlip44FromChainId(params.chainId) || params.chainId
        const chainType = targetChainType || getChainTypeFromId(targetSlip44ChainId) || account.chainType

        // 将 SLIP-44 chain ID 转换回 native chain ID（用于验证钱包当前连接的链）
        // 如果 params.chainId 已经是 native chain ID，则直接使用；否则尝试从 SLIP-44 转换
        let targetNativeChainId: number | null = null
        if (getChainInfoByNative(params.chainId)) {
          // params.chainId 已经是 native chain ID
          targetNativeChainId = params.chainId
        } else {
          // params.chainId 是 SLIP-44 chain ID，需要转换为 native chain ID
          // 对于 EVM 链，使用 getEvmChainIdFromSlip44
          if (chainType === 'evm') {
            targetNativeChainId = getEvmChainIdFromSlip44(slip44ChainId) || null
            // 如果无法转换，尝试使用 slip44ChainId 作为 native chain ID（某些链可能相同）
            if (targetNativeChainId === null && getChainInfoByNative(slip44ChainId)) {
              targetNativeChainId = slip44ChainId
            }
          } else if (chainType === 'tron') {
            // TRON 的 native chain ID 就是 195（SLIP-44 也是 195）
            targetNativeChainId = slip44ChainId === 195 ? 195 : null
          }
        }

        // 检查钱包当前连接的链 ID 是否与目标链 ID 匹配
        // 只有在能够确定目标链 ID 时才进行检查
        if (targetNativeChainId !== null && account.chainId !== targetNativeChainId) {
          const currentChainName = getChainInfoByNative(account.chainId)?.name || `链 ${account.chainId}`
          const targetChainName = getChainInfoByNative(targetNativeChainId)?.name || `链 ${targetNativeChainId}`
          throw new Error(
            `链不匹配: 当前钱包连接的链是 ${currentChainName} (ID: ${account.chainId})，但存款操作需要 ${targetChainName} (ID: ${targetNativeChainId})。请先切换到正确的链。`
          )
        }

        console.log('🔍 [deposit] 开始存款流程:', {
          tokenAddress: finalTokenAddress,
          treasuryAddress: finalTreasuryAddress,
          accountAddress: finalAccountAddress,
          chainId: params.chainId,
          slip44ChainId,
          targetNativeChainId,
          currentChainId: account.chainId,
          chainType,
          chainMatch: targetNativeChainId === account.chainId,
        })

        // 2. 读取 token 的 decimals
        let tokenDecimals: number
        if (chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
          try {
            // 使用 eth_call 直接调用合约
            const functionSignature = '0x313ce567' // decimals()
            const result = await window.ethereum.request({
              method: 'eth_call',
              params: [{
                to: finalTokenAddress,
                data: functionSignature
              }, 'latest']
            }) as string
            
            if (result && result !== '0x') {
              tokenDecimals = Number(BigInt(result))
              console.log('[deposit] ✅ 直接使用 window.ethereum 查询 decimals 成功')
            } else {
              throw new Error('Contract returned no data')
            }
          } catch (directErr) {
            console.warn('[deposit] 直接使用 window.ethereum 查询 decimals 失败，回退到 walletManager:', directErr)
            const decimals = await walletManager.readContract(
              finalTokenAddress,
              ERC20_ABI as unknown as any[],
              'decimals',
              [],
              chainType
            )
            tokenDecimals = Number(decimals.toString()) || 18
          }
        } else {
          const decimals = await walletManager.readContract(
            finalTokenAddress,
            ERC20_ABI as unknown as any[],
            'decimals',
            [],
            chainType
          )
          tokenDecimals = Number(decimals.toString()) || 18
        }

        // 3. 转换金额为 BigInt
        const amountBigInt = BigInt(params.amount)

        // 4. 检查余额
        let balance: bigint
        if (chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
          try {
            // 使用 eth_call 直接调用合约
            const functionSignature = '0x70a08231' // balanceOf(address)
            const addressParam = finalAccountAddress.slice(2).padStart(64, '0')
            const data = functionSignature + addressParam
            
            const result = await window.ethereum.request({
              method: 'eth_call',
              params: [{
                to: finalTokenAddress,
                data: data
              }, 'latest']
            }) as string
            
            if (result && result !== '0x') {
              balance = BigInt(result)
              console.log('[deposit] ✅ 直接使用 window.ethereum 查询余额成功')
            } else {
              throw new Error('Contract returned no data')
            }
          } catch (directErr) {
            console.warn('[deposit] 直接使用 window.ethereum 查询余额失败，回退到 walletManager:', directErr)
            const balanceResult = await walletManager.readContract(
              finalTokenAddress,
              ERC20_ABI as unknown as any[],
              'balanceOf',
              [finalAccountAddress],
              chainType
            )
            balance = BigInt(balanceResult.toString())
          }
        } else {
          const balanceResult = await walletManager.readContract(
            finalTokenAddress,
            ERC20_ABI as unknown as any[],
            'balanceOf',
            [finalAccountAddress],
            chainType
          )
          balance = BigInt(balanceResult.toString())
        }

        if (balance < amountBigInt) {
          // 格式化余额和所需金额为可读格式（保留两位小数）
          const balanceReadable = formatFromWei(balance.toString(), tokenDecimals)
          const amountReadable = formatFromWei(params.amount, tokenDecimals)
          const balanceFormatted = parseFloat(balanceReadable).toFixed(2)
          const amountFormatted = parseFloat(amountReadable).toFixed(2)
          throw new Error(t('deposit.insufficientBalance', { balance: balanceFormatted, amount: amountFormatted }))
        }

        // 5. 授权 Token（如果需要）
        const approveResult = await approveToken(finalTokenAddress, finalTreasuryAddress, amountBigInt)
        if (!approveResult.alreadyApproved && approveResult.txHash) {
          console.log('✅ Token 授权成功:', approveResult.txHash)
        }

        // 6. 调用 Treasury.deposit()
        // 对于 TRON 链，gas 参数会被转换为 feeLimit（单位：SUN，1 TRX = 1,000,000 SUN）
        const depositGasOptions = chainType === 'tron' 
          ? { gas: 100_000_000 } // TRON: 100 TRX 的 feeLimit（足够大）
          : { gas: 600000 } // EVM: Gas limit for deposit
        
        console.log('🔍 [deposit] 执行存款交易:', {
          treasuryAddress: finalTreasuryAddress,
          tokenAddress: finalTokenAddress,
          amount: amountBigInt.toString(),
          chainType,
          gasOptions: depositGasOptions,
        })
        
        const depositTxHash = await walletManager.writeContract(
          finalTreasuryAddress,
          TREASURY_ABI as unknown as any[],
          'deposit',
          [finalTokenAddress, amountBigInt],
          depositGasOptions,
          chainType
        )

        console.log('✅ 存款交易已发送:', depositTxHash)

        // 7. 等待交易确认
        const receipt = await walletManager.waitForTransaction(depositTxHash)
        console.log('✅ 存款交易已确认:', receipt.blockNumber)

        return {
          txHash: depositTxHash,
          receipt,
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '存款失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [sdkStore.sdk, walletManager, approveToken, t]
  )

  /**
   * 读取 Token 授权额度
   * 自动从 SDK 获取 Treasury 地址
   * @param tokenAddress - Token 合约地址
   * @param chainId - 链 ID（EVM Chain ID 或 SLIP-44 Chain ID）
   * @returns 授权额度（BigInt）
   */
  const getAllowance = useCallback(
    async (tokenAddress: string, chainId: number): Promise<bigint> => {
      if (!sdkStore.sdk) {
        throw new Error('SDK 未连接')
      }

      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      const account = walletManager.getPrimaryAccount()
      if (!account) {
        throw new Error('钱包未连接')
      }

      // 验证 token 地址
      if (!tokenAddress || tokenAddress.trim() === '') {
        throw new Error('Token 地址不能为空')
      }

      // 验证账户地址
      if (!account.nativeAddress || account.nativeAddress.trim() === '') {
        throw new Error('账户地址不能为空')
      }

      // 1. 转换 chain ID（如果传入的是 EVM chain ID，转换为 SLIP-44）
      const slip44ChainId = getSlip44FromChainId(chainId) || chainId

      // 2. 从 SDK Store 获取 Treasury 地址（如果未加载，则从 API 获取）
      let treasuryAddress = sdkStore.sdk.stores.chainConfig.getTreasuryAddress(slip44ChainId)

      // 如果 Store 中没有，尝试从 API 获取并更新 Store
      if (!treasuryAddress) {
        await sdkStore.sdk.stores.chainConfig.fetchChain(slip44ChainId)
        treasuryAddress = sdkStore.sdk.stores.chainConfig.getTreasuryAddress(slip44ChainId)
      }

      if (!treasuryAddress || treasuryAddress.trim() === '') {
        throw new Error(`未找到链 ${slip44ChainId} 的 Treasury 地址`)
      }

      // 根据链 ID 确定链类型
      const chainType = getChainTypeFromId(chainId) || getChainTypeFromId(slip44ChainId) || account.chainType

      // 最终验证所有地址
      const finalTokenAddress = tokenAddress.trim()
      const finalTreasuryAddress = treasuryAddress.trim()
      const finalAccountAddress = account.nativeAddress.trim()

      if (!finalTokenAddress || finalTokenAddress.length < 10) {
        throw new Error(`Token 地址格式无效: ${finalTokenAddress}`)
      }
      if (!finalTreasuryAddress || finalTreasuryAddress.length < 10) {
        throw new Error(`Treasury 地址格式无效: ${finalTreasuryAddress}`)
      }
      if (!finalAccountAddress || finalAccountAddress.length < 10) {
        throw new Error(`账户地址格式无效: ${finalAccountAddress}`)
      }

      console.log('🔍 [getAllowance] 读取授权额度:', {
        tokenAddress: finalTokenAddress,
        treasuryAddress: finalTreasuryAddress,
        accountAddress: finalAccountAddress,
        chainId,
        slip44ChainId,
        chainType,
      })

      // 读取当前授权额度
      // 对于 EVM 链，直接使用 window.ethereum 查询，避免 walletManager 的缓存 provider 问题
      let allowance: bigint
      
      if (chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
        try {
          // 使用 eth_call 直接调用合约
          // 编码 allowance(address,address) 函数调用
          // 函数选择器: allowance(address,address) = 0xdd62ed3e
          const functionSignature = '0xdd62ed3e'
          const ownerParam = finalAccountAddress.slice(2).padStart(64, '0') // 移除 0x 并补齐到 64 字符
          const spenderParam = finalTreasuryAddress.slice(2).padStart(64, '0')
          const data = functionSignature + ownerParam + spenderParam
          
          const result = await window.ethereum.request({
            method: 'eth_call',
            params: [{
              to: finalTokenAddress,
              data: data
            }, 'latest']
          }) as string
          
          if (result && result !== '0x') {
            allowance = BigInt(result)
            console.log('[getAllowance] ✅ 直接使用 window.ethereum 查询授权额度成功')
          } else {
            throw new Error('Contract returned no data')
          }
        } catch (directErr) {
          console.warn('[getAllowance] 直接使用 window.ethereum 查询失败，回退到 walletManager:', directErr)
          // 回退到使用 walletManager
          const allowanceResult = await walletManager.readContract(
            finalTokenAddress,
            ERC20_ABI as unknown as any[],
            'allowance',
            [finalAccountAddress, finalTreasuryAddress],
            chainType
          )
          allowance = BigInt(allowanceResult.toString())
        }
      } else {
        // 非 EVM 链或没有 window.ethereum，使用 walletManager
        const allowanceResult = await walletManager.readContract(
          finalTokenAddress,
          ERC20_ABI as unknown as any[],
          'allowance',
          [finalAccountAddress, finalTreasuryAddress],
          chainType
        )
        allowance = BigInt(allowanceResult.toString())
      }

      return allowance
    },
    [sdkStore.sdk, walletManager]
  )

  return {
    deposit,
    approveToken,
    getAllowance,
    loading,
    error,
  }
}

