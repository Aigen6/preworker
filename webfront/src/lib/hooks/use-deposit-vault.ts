'use client'

import { useCallback, useState } from 'react'
import { useSDKStore } from '../stores/sdk-store'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'
import { getSlip44FromChainId } from '@enclave-hq/sdk'
import { ERC20_ABI } from '../abis/erc20'
import { DEPOSIT_VAULT_ABI } from '../abis/deposit-vault'
import { TREASURY_CONFIG_CORE_ABI } from '../abis/treasury-config-core'

// 类型定义（使用 any[] 以兼容 walletManager 的类型要求）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContractABI = any[]

/**
 * DepositVault 存款信息类型
 */
export interface DepositInfo {
  depositor: string
  token: string
  yieldToken: string
  yieldAmount: string
  intendedRecipient: string
  depositTime: string
  used: boolean
}

/**
 * useDepositVault - DepositVault 操作 Hook
 */
export function useDepositVault() {
  const sdkStore = useSDKStore()
  const { walletManager } = useSDKWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 授权 Token 给 DepositVault
   */
  const approveToken = useCallback(
    async (tokenAddress: string, vaultAddress: string, amount: bigint) => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      const account = walletManager.getPrimaryAccount()
      if (!account) {
        throw new Error('钱包未连接')
      }

      const chainType = account.chainType

      // 检查当前授权额度
      let allowance: bigint
      if (chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
        try {
          const functionSignature = '0xdd62ed3e'
          const ownerParam = account.nativeAddress.slice(2).padStart(64, '0')
          const spenderParam = vaultAddress.slice(2).padStart(64, '0')
          const data = functionSignature + ownerParam + spenderParam

          const result = (await (window.ethereum as { request: (args: { method: string; params: unknown[] }) => Promise<string> }).request({
            method: 'eth_call',
            params: [
              {
                to: tokenAddress,
                data: data,
              },
              'latest',
            ],
          })) as string

          if (result && result !== '0x') {
            allowance = BigInt(result)
          } else {
            throw new Error('Contract returned no data')
          }
        } catch {
          const allowanceResult = await walletManager.readContract(
            tokenAddress,
            ERC20_ABI as unknown as ContractABI,
            'allowance',
            [account.nativeAddress, vaultAddress],
            chainType
          )
          allowance = BigInt(allowanceResult.toString())
        }
      } else {
        const allowanceResult = await walletManager.readContract(
          tokenAddress,
          ERC20_ABI as unknown as ContractABI,
          'allowance',
          [account.nativeAddress, vaultAddress],
          chainType
        )
        allowance = BigInt(allowanceResult.toString())
      }

      if (allowance >= amount) {
        return { txHash: null, alreadyApproved: true }
      }

      const approveGasOptions = chainType === 'tron' ? { gas: 100_000_000 } : { gas: 100000 }
      const txHash = await walletManager.writeContract(
        tokenAddress,
        ERC20_ABI as unknown as ContractABI,
        'approve',
        [vaultAddress, amount],
        approveGasOptions,
        chainType
      )

      return { txHash, alreadyApproved: false }
    },
    [walletManager]
  )

  /**
   * 存入借贷池（地址A操作）
   */
  const deposit = useCallback(
    async (params: {
      vaultAddress: string
      tokenAddress: string
      amount: string
      intendedRecipient?: string
    }) => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      setLoading(true)
      setError(null)

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType
        const recipient = params.intendedRecipient || '0x0000000000000000000000000000000000000000'

        const depositGasOptions = chainType === 'tron' ? { gas: 200_000_000 } : { gas: 300000 }
        const txHash = await walletManager.writeContract(
          params.vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'deposit',
          [params.tokenAddress, params.amount, recipient],
          depositGasOptions,
          chainType
        )

        return { txHash }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '存入失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [walletManager]
  )

  /**
   * 地址B领取凭证代币
   */
  const claim = useCallback(
    async (params: { vaultAddress: string; depositId: string }) => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      setLoading(true)
      setError(null)

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const claimGasOptions = chainType === 'tron' ? { gas: 200_000_000 } : { gas: 200000 }
        const txHash = await walletManager.writeContract(
          params.vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'claim',
          [params.depositId],
          claimGasOptions,
          chainType
        )

        return { txHash }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '领取失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [walletManager]
  )

  /**
   * 地址A取回凭证代币
   */
  const recover = useCallback(
    async (params: { vaultAddress: string; depositId: string }) => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      setLoading(true)
      setError(null)

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const recoverGasOptions = chainType === 'tron' ? { gas: 200_000_000 } : { gas: 200000 }
        const txHash = await walletManager.writeContract(
          params.vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'recover',
          [params.depositId],
          recoverGasOptions,
          chainType
        )

        return { txHash }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '取回失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [walletManager]
  )

  /**
   * 查询存款信息（通过全局存款ID）
   */
  const getDeposit = useCallback(
    async (vaultAddress: string, depositId: string): Promise<DepositInfo | null> => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'getDeposit',
          [depositId],
          chainType
        ) as [string, string, string, bigint, string, bigint, boolean]

        if (!result || !result[0] || result[0] === '0x0000000000000000000000000000000000000000') {
          return null
        }

        return {
          depositor: result[0],
          token: result[1],
          yieldToken: result[2],
          yieldAmount: result[3].toString(),
          intendedRecipient: result[4],
          depositTime: result[5].toString(),
          used: result[6],
        }
      } catch (err) {
        console.error('查询存款信息失败:', err)
        return null
      }
    },
    [walletManager]
  )

  /**
   * 查询地址的所有存款ID
   */
  const getDepositIds = useCallback(
    async (vaultAddress: string, depositor: string): Promise<string[]> => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'getDepositIds',
          [depositor],
          chainType
        ) as bigint[]

        if (!result || !Array.isArray(result)) {
          return []
        }

        return result.map((id) => id.toString())
      } catch (err) {
        console.error('查询存款ID列表失败:', err)
        return []
      }
    },
    [walletManager]
  )

  /**
   * 根据 chainId 获取 DepositVault 地址
   * 从 TreasuryConfigCore 读取配置
   */
  const getVaultAddress = useCallback(
    async (chainId: number): Promise<string | null> => {
      if (!walletManager || !sdkStore.sdk) {
        throw new Error('钱包或 SDK 未连接')
      }

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType
        const slip44ChainId = getSlip44FromChainId(chainId) || chainId

        // 从 SDK 获取 TreasuryConfigCore 地址
        // 方法1: 从 SDK 的 chainConfig store 获取（如果 SDK 支持）
        // 方法2: 从环境变量获取（按链配置）
        // 方法3: 从 Treasury 地址读取（如果 Treasury 有方法获取 configCore）
        
        // 优先尝试从 SDK 获取
        let configCoreAddress: string | null = null
        
        // 尝试从 SDK 的 chainConfig 获取（如果 SDK 有相关方法）
        try {
          // 假设 SDK 有类似的方法，如果没有则使用环境变量
          // 这里需要根据实际 SDK API 调整
          if (sdkStore.sdk.stores?.chainConfig) {
            // 尝试从 SDK 获取配置合约地址
            // 注意：这需要 SDK 支持，如果没有则需要使用环境变量
          }
        } catch (err) {
          console.warn('从 SDK 获取配置合约地址失败，使用环境变量:', err)
        }

        // 如果 SDK 没有，使用环境变量（按链配置）
        if (!configCoreAddress) {
          // 根据 chainId 获取对应的配置地址
          // 格式: NEXT_PUBLIC_TREASURY_CONFIG_CORE_<CHAIN_ID>
          const envKey = `NEXT_PUBLIC_TREASURY_CONFIG_CORE_${slip44ChainId}`
          configCoreAddress = process.env[envKey] || null
          
          // 如果没有链特定的配置，尝试通用配置
          if (!configCoreAddress) {
            configCoreAddress = process.env.NEXT_PUBLIC_TREASURY_CONFIG_CORE_ADDRESS || null
          }
        }
        
        if (!configCoreAddress) {
          console.warn('未找到 TreasuryConfigCore 地址配置')
          return null
        }

        // 从 TreasuryConfigCore 读取 DepositVault 地址
        const vaultAddress = await walletManager.readContract(
          configCoreAddress,
          TREASURY_CONFIG_CORE_ABI as unknown as ContractABI,
          'getAddressConfig',
          ['DEPOSIT_VAULT'],
          chainType
        ) as string

        if (!vaultAddress || vaultAddress === '0x0000000000000000000000000000000000000000') {
          return null
        }

        return vaultAddress
      } catch (err) {
        console.error('获取 DepositVault 地址失败:', err)
        return null
      }
    },
    [walletManager, sdkStore.sdk]
  )

  /**
   * 查询可领取的存款ID列表（按存款人）
   */
  const getClaimableDepositIds = useCallback(
    async (vaultAddress: string, recipient: string, depositor: string): Promise<string[]> => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'getClaimableDepositIds',
          [recipient, depositor],
          chainType
        ) as bigint[]

        if (!result || !Array.isArray(result)) {
          return []
        }

        return result.map((id) => id.toString())
      } catch (err) {
        console.error('查询可领取存款ID列表失败:', err)
        return []
      }
    },
    [walletManager]
  )

  /**
   * 查询接收地址的所有可领取存款（返回全局存款ID列表）
   */
  const getAllClaimableDeposits = useCallback(
    async (vaultAddress: string, recipient: string): Promise<Array<{ depositId: string }>> => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'getClaimableDeposits',
          [recipient],
          chainType
        ) as bigint[]

        if (!result || !Array.isArray(result)) {
          return []
        }

        const deposits: Array<{ depositId: string }> = []
        
        for (let i = 0; i < result.length; i++) {
          deposits.push({
            depositId: result[i].toString(),
          })
        }

        return deposits
      } catch (err) {
        console.error('查询所有可领取存款失败:', err)
        return []
      }
    },
    [walletManager]
  )

  /**
   * 查询取回时间锁（recoveryDelay）
   */
  const getRecoveryDelay = useCallback(
    async (vaultAddress: string): Promise<bigint> => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'recoveryDelay',
          [],
          chainType
        ) as bigint

        return result
      } catch (err) {
        console.error('查询取回时间锁失败:', err)
        // 默认返回7天（秒）
        return BigInt(7 * 24 * 60 * 60)
      }
    },
    [walletManager]
  )

  /**
   * 查询凭证代币对应的底层资产数量（折算成USDT）
   */
  const getUnderlyingAmount = useCallback(
    async (vaultAddress: string, depositId: string): Promise<bigint> => {
      if (!walletManager) {
        throw new Error('钱包未连接')
      }

      try {
        const account = walletManager.getPrimaryAccount()
        if (!account) {
          throw new Error('钱包未连接')
        }

        const chainType = account.chainType

        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'getUnderlyingAmount',
          [depositId],
          chainType
        ) as bigint

        return result
      } catch (err) {
        console.error('查询底层资产数量失败:', err)
        return BigInt(0)
      }
    },
    [walletManager]
  )

  return {
    approveToken,
    deposit,
    claim,
    recover,
    getDeposit,
    getDepositIds,
    getClaimableDepositIds,
    getAllClaimableDeposits,
    getRecoveryDelay,
    getUnderlyingAmount,
    getVaultAddress,
    loading,
    error,
  }
}
