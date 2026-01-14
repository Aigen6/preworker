'use client'

import { useCallback, useState } from 'react'
import { useSDKStore } from '../stores/sdk-store'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'
import { getSlip44FromChainId } from '@enclave-hq/sdk'
import { ERC20_ABI } from '../abis/erc20'
import { DEPOSIT_VAULT_ABI } from '../abis/deposit-vault'
import { TREASURY_CONFIG_CORE_ABI } from '../abis/treasury-config-core'
import { getDepositVaultAddressFromConfig } from '../utils/deployment-config'

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
        // 合约要求 intendedRecipient 不能是 address(0)
        // 如果未提供或为空字符串，使用当前用户地址作为默认值
        const recipient = (params.intendedRecipient && params.intendedRecipient.trim() !== '') 
          ? params.intendedRecipient.trim() 
          : account.nativeAddress

        if (!recipient || recipient === '0x0000000000000000000000000000000000000000' || recipient.toLowerCase() === '0x0000000000000000000000000000000000000000') {
          throw new Error('必须指定有效的接收地址（intendedRecipient），不能是零地址')
        }

        // 打印调用合约的参数
        console.log('====================================')
        console.log('调用 DepositVault.deposit 参数:')
        console.log('====================================')
        console.log('合约地址 (vaultAddress):', params.vaultAddress)
        console.log('函数名: deposit')
        console.log('参数列表:')
        console.log('  - tokenAddress:', params.tokenAddress)
        console.log('  - amount:', params.amount)
        console.log('  - intendedRecipient:', recipient)
        // 使用与其他函数一致的 Gas 配置方式
        // MetaMask 会自动处理 Gas 价格，只需要设置 gas limit
        // deposit 操作较复杂，需要更多 Gas（估算约 50 万，设置 60 万以确保足够）
        const depositGasOptions = chainType === 'tron' ? { gas: 200_000_000 } : { gas: 600000 }
        
        console.log('Gas 配置:', depositGasOptions)
        console.log('链类型:', chainType)
        console.log('当前用户地址:', account.nativeAddress)
        console.log('====================================')
        // 先估算 Gas，检查交易是否会失败
        try {
          console.log('估算 Gas...')
          const estimatedGas = await walletManager.estimateGas(
            params.vaultAddress,
            DEPOSIT_VAULT_ABI as unknown as ContractABI,
            'deposit',
            [params.tokenAddress, params.amount, recipient],
            chainType
          )
          console.log('✅ Gas 估算成功:', estimatedGas.toString())
          console.log('设置的 Gas limit:', depositGasOptions.gas)
          if (BigInt(depositGasOptions.gas || 0) < estimatedGas) {
            console.warn('⚠️ 设置的 Gas limit 可能不够，建议增加到:', estimatedGas.toString())
            // 更新 Gas limit
            depositGasOptions.gas = Number(estimatedGas) + 50000 // 增加 10% 缓冲
            console.log('已更新 Gas limit 为:', depositGasOptions.gas)
          }
        } catch (gasError) {
          console.error('❌ Gas 估算失败，这通常意味着交易会失败:')
          console.error('Gas 估算错误:', gasError)
          if (gasError instanceof Error) {
            console.error('错误消息:', gasError.message)
          }
          throw new Error(`Gas 估算失败: ${gasError instanceof Error ? gasError.message : '未知错误'}。请检查：1) 授权是否足够 2) 合约配置是否正确 3) 参数是否有效`)
        }
        
        console.log('准备调用 writeContract...')
        const txHash = await walletManager.writeContract(
          params.vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'deposit',
          [params.tokenAddress, params.amount, recipient],
          depositGasOptions,
          chainType
        )
        
        console.log('✅ 交易哈希:', txHash)

        return { txHash }
      } catch (err) {
        console.error('❌ Deposit 失败，详细错误信息:')
        console.error('错误对象:', err)
        if (err instanceof Error) {
          console.error('错误消息:', err.message)
          console.error('错误堆栈:', err.stack)
        }
        if ((err as any)?.code) {
          console.error('错误代码:', (err as any).code)
        }
        if ((err as any)?.data) {
          console.error('错误数据:', (err as any).data)
        }
        if ((err as any)?.reason) {
          console.error('错误原因:', (err as any).reason)
        }
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
   * 直接调用 AAVE/JustLending 赎回底层代币（USDT）
   * 在 claim 后，yield token 在用户钱包中，需要直接调用借贷协议赎回
   */
  const redeemDirectly = useCallback(
    async (params: { 
      vaultAddress: string
      depositId: string
      depositInfo: DepositInfo
      chainId: number
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
        const { depositInfo, vaultAddress } = params

        // 1. 获取借贷配置（lendingTarget）
        let lendingTarget = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'lendingTargets',
          [depositInfo.token],
          chainType
        ) as string

        if (!lendingTarget || lendingTarget === '0x0000000000000000000000000000000000000000') {
          lendingTarget = await walletManager.readContract(
            vaultAddress,
            DEPOSIT_VAULT_ABI as unknown as ContractABI,
            'defaultLendingTarget',
            [],
            chainType
          ) as string
        }

        if (!lendingTarget || lendingTarget === '0x0000000000000000000000000000000000000000') {
          throw new Error('未找到借贷池配置')
        }

        console.log('Lending Target:', lendingTarget)
        console.log('Yield Token:', depositInfo.yieldToken)
        console.log('Yield Amount:', depositInfo.yieldAmount)

        // 2. 判断是 AAVE 还是 JustLend
        // BSC 通常使用 AAVE V3，TRON 使用 JustLend
        // 可以通过检查 yieldToken 地址或链类型来判断
        const isJustLend = chainType === 'tron'
        const isAAVE = !isJustLend

        let txHash: string

        if (isAAVE) {
          // AAVE V3: 调用 Pool.withdraw(asset, amount, to)
          // amount 是底层代币数量，使用 type(uint256).max 表示赎回全部 aToken
          const aavePoolAbi = [
            {
              type: 'function',
              name: 'withdraw',
              inputs: [
                { name: 'asset', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'to', type: 'address' },
              ],
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ]

          // 对于 AAVE，使用 type(uint256).max 表示赎回全部 aToken 对应的底层代币
          const withdrawAmount = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' // type(uint256).max

          const gasOptions = chainType === 'tron' ? { gas: 300_000_000 } : { gas: 300000 }
          txHash = await walletManager.writeContract(
            lendingTarget, // AAVE Pool 地址
            aavePoolAbi as unknown as ContractABI,
            'withdraw',
            [depositInfo.token, withdrawAmount, account.nativeAddress],
            gasOptions,
            chainType
          )
        } else {
          // JustLend: 调用 jToken.redeem(redeemTokens)
          const jTokenAbi = [
            {
              type: 'function',
              name: 'redeem',
              inputs: [{ name: 'redeemTokens', type: 'uint256' }],
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ]

          // 对于 JustLend，使用 yield token 数量
          const gasOptions = chainType === 'tron' ? { gas: 300_000_000 } : { gas: 300000 }
          txHash = await walletManager.writeContract(
            depositInfo.yieldToken, // jToken 地址
            jTokenAbi as unknown as ContractABI,
            'redeem',
            [depositInfo.yieldAmount],
            gasOptions,
            chainType
          )
        }

        return { txHash }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '赎回失败'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [walletManager]
  )

  /**
   * 赎回凭证代币为底层代币（USDT）
   * 注意：此方法已废弃，应该使用 redeemDirectly 直接调用借贷协议
   */
  const redeem = useCallback(
    async (params: { vaultAddress: string; depositId: string; amount?: bigint }) => {
      throw new Error('redeem 方法已废弃，请使用 redeemDirectly 直接调用借贷协议')
    },
    []
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

        console.log(`[getDeposit] 查询存款 ${depositId} 信息...`)
        console.log(`[getDeposit] 参数:`, { vaultAddress, depositId, depositIdType: typeof depositId, chainType })
        
        // 确保 depositId 是字符串或 bigint（合约期望 uint256）
        const depositIdParam = typeof depositId === 'string' ? depositId : depositId.toString()
        console.log(`[getDeposit] 转换后的 depositId:`, depositIdParam)
        
        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'getDeposit',
          [depositIdParam],
          chainType
        )

        console.log(`[getDeposit] 查询结果 (原始):`, result)
        console.log(`[getDeposit] 结果类型:`, typeof result)
        console.log(`[getDeposit] 是否为数组:`, Array.isArray(result))
        console.log(`[getDeposit] 是否为对象:`, result && typeof result === 'object' && !Array.isArray(result))
        
        // 处理不同的返回格式
        let depositInfo: DepositInfo | null = null
        
        if (Array.isArray(result)) {
          // 数组格式: [depositor, token, yieldToken, yieldAmount, intendedRecipient, depositTime, used]
          console.log(`[getDeposit] 返回格式: 数组`)
          const [depositor, token, yieldToken, yieldAmount, intendedRecipient, depositTime, used] = result as [string, string, string, bigint, string, bigint, boolean]
          
          if (!depositor || depositor === '0x0000000000000000000000000000000000000000') {
            console.warn(`[getDeposit] 存款 ${depositId} 不存在 (depositor 为零地址)`)
            return null
          }
          
          depositInfo = {
            depositor,
            token,
            yieldToken,
            yieldAmount: yieldAmount.toString(),
            intendedRecipient,
            depositTime: depositTime.toString(),
            used,
          }
        } else if (result && typeof result === 'object') {
          // 对象格式: { depositor, token, yieldToken, yieldAmount, intendedRecipient, depositTime, used }
          // viem 的 readContract 对于 tuple 返回值，如果 ABI 中定义了 components 名称，会返回对象
          console.log(`[getDeposit] 返回格式: 对象`)
          console.log(`[getDeposit] 对象键:`, Object.keys(result))
          const info = result as any
          
          // 检查 depositor 字段（可能在不同的位置）
          const depositor = info.depositor || info[0] || (Array.isArray(result) ? result[0] : null)
          
          console.log(`[getDeposit] depositor 值:`, depositor)
          console.log(`[getDeposit] depositor 类型:`, typeof depositor)
          
          const zeroAddress = '0x0000000000000000000000000000000000000000'
          if (!depositor || depositor === zeroAddress || depositor.toLowerCase() === zeroAddress) {
            console.warn(`[getDeposit] 存款 ${depositId} 不存在 (depositor 为零地址)`)
            console.warn(`[getDeposit] 完整结果:`, JSON.stringify(result, null, 2))
            return null
          }
          
          // 处理不同的字段访问方式
          depositInfo = {
            depositor: info.depositor || info[0] || '',
            token: info.token || info[1] || '',
            yieldToken: info.yieldToken || info[2] || '',
            yieldAmount: (info.yieldAmount || info[3] || 0n).toString(),
            intendedRecipient: info.intendedRecipient || info[4] || '',
            depositTime: (info.depositTime || info[5] || 0n).toString(),
            used: info.used !== undefined ? info.used : (info[6] !== undefined ? info[6] : false),
          }
          
          console.log(`[getDeposit] 解析后的存款信息:`, depositInfo)
        } else {
          console.warn(`[getDeposit] 未知的返回格式:`, result)
          console.warn(`[getDeposit] 结果类型:`, typeof result)
          console.warn(`[getDeposit] 完整结果:`, JSON.stringify(result, null, 2))
          return null
        }
        
        console.log(`[getDeposit] 解析后的存款信息:`, depositInfo)
        return depositInfo
      } catch (err) {
        console.error(`[getDeposit] 查询存款 ${depositId} 信息失败:`, err)
        if (err instanceof Error) {
          console.error(`[getDeposit] 错误消息:`, err.message)
          console.error(`[getDeposit] 错误堆栈:`, err.stack)
        }
        if ((err as any)?.code) {
          console.error(`[getDeposit] 错误代码:`, (err as any).code)
        }
        if ((err as any)?.data) {
          console.error(`[getDeposit] 错误数据:`, (err as any).data)
        }
        if ((err as any)?.reason) {
          console.error(`[getDeposit] 错误原因:`, (err as any).reason)
        }
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
   * 优先从部署结果 JSON 文件读取，如果未找到则从 TreasuryConfigCore 读取
   */
  const getVaultAddress = useCallback(
    async (chainId: number): Promise<string | null> => {
      // 方法1: 优先从部署结果 JSON 文件读取（result_xxx.json）
      try {
        const vaultAddressFromConfig = await getDepositVaultAddressFromConfig(chainId)
        if (vaultAddressFromConfig) {
          console.log(`从部署配置读取 DepositVault 地址 (chainId: ${chainId}):`, vaultAddressFromConfig)
          return vaultAddressFromConfig
        }
      } catch (err) {
        console.warn('从部署配置读取 DepositVault 地址失败，尝试从 TreasuryConfigCore 读取:', err)
      }

      // 方法2: 如果 JSON 文件未找到，回退到从 TreasuryConfigCore 读取
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
    redeem,
    redeemDirectly,
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
