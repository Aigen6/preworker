'use client'

import { useCallback, useState } from 'react'
import { useSDKStore } from '../stores/sdk-store'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'
import { getSlip44FromChainId } from '@enclave-hq/sdk'
import { ERC20_ABI } from '../abis/erc20'
import { DEPOSIT_VAULT_ABI } from '../abis/deposit-vault'
import { TREASURY_CONFIG_CORE_ABI } from '../abis/treasury-config-core'
import { getDepositVaultAddressFromConfig } from '../utils/deployment-config'
import { normalizeTronAddress } from '../utils/tron-address-converter'

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

      // TRON: gas 参数是 feeLimit（单位：SUN），表示 Energy 不足时愿意支付的 TRX 上限
      // 1 TRX = 1,000,000 SUN
      // 如果 Energy 不足，1 Energy ≈ 420 SUN（实际价格会波动）
      // 对于 approve 操作，通常需要 40,000 Energy，如果全部用 TRX 支付，约需 16,800,000 SUN（16.8 TRX）
      // 设置 50,000,000 SUN（50 TRX）作为上限，确保有足够缓冲
      const approveGasOptions = chainType === 'tron' ? { gas: 50_000_000 } : { gas: 100000 }
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
        // TRON: gas 参数是 feeLimit（单位：SUN），表示 Energy 不足时愿意支付的 TRX 上限
        // 对于 deposit 操作（justlending-supply），实际测试显示：
        // - safeTransferFrom: 64,285 Energy
        // - forceApprove: 200,000 Energy
        // - JustLend mint: 300,000 Energy
        // - 代码可见操作（storage 读写、事件等）: ~73,500 Energy
        // 总消耗约 637,785 Energy
        // 如果全部用 TRX 支付，约需 267,870,000 SUN（267.9 TRX，基于 420 SUN/Energy）
        // Energy 价格会波动（380-450 SUN/Energy），所以设置 100,000,000 SUN（100 TRX）作为上限
        // 注意：如果 Energy 不足，实际费用可能更高，建议提前租赁 Energy
        const depositGasOptions = chainType === 'tron' ? { gas: 100_000_000 } : { gas: 600000 }
        
        console.log('Gas 配置:', depositGasOptions)
        console.log('链类型:', chainType)
        console.log('当前用户地址:', account.nativeAddress)
        console.log('====================================')
        // 先估算 Gas，检查交易是否会失败
        // 注意：TRON 链（TronLink）不支持 estimateGas 方法，跳过估算
        if (chainType !== 'tron') {
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
        } else {
          console.log('⚠️ TRON 链不支持 estimateGas，跳过 Gas 估算，使用预设的 Gas limit:', depositGasOptions.gas)
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

        // TRON: claim 操作通常需要较少的 Energy，设置合理的 feeLimit
        const claimGasOptions = chainType === 'tron' ? { gas: 100_000_000 } : { gas: 200000 }
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

        // TRON: recover 操作通常需要较少的 Energy，设置合理的 feeLimit
        const recoverGasOptions = chainType === 'tron' ? { gas: 100_000_000 } : { gas: 200000 }
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

          // TRON: 复杂的操作需要更多 Energy，设置合理的 feeLimit
          const gasOptions = chainType === 'tron' ? { gas: 150_000_000 } : { gas: 300000 }
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
          // TRON: 复杂的操作需要更多 Energy，设置合理的 feeLimit
          const gasOptions = chainType === 'tron' ? { gas: 150_000_000 } : { gas: 300000 }
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
        
        // 验证 depositId 是否有效
        if (depositId === null || depositId === undefined || depositId === '' || String(depositId) === 'undefined' || String(depositId) === 'null') {
          console.warn(`[getDeposit] 无效的 depositId: "${depositId}"`)
          return null
        }
        
        // 确保 depositId 是字符串（合约期望 uint256，但 walletManager 可能接受字符串）
        let depositIdParam: string
        if (typeof depositId === 'string') {
          // 如果是空字符串，返回 null
          const trimmed = depositId.trim()
          if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
            console.warn(`[getDeposit] depositId 是空字符串或无效值: "${depositId}"`)
            return null
          }
          depositIdParam = trimmed
        } else if (typeof depositId === 'bigint') {
          depositIdParam = depositId.toString()
        } else if (typeof depositId === 'number') {
          // 数字类型，确保是有效的非负数
          if (isNaN(depositId) || depositId < 0) {
            console.warn(`[getDeposit] depositId 是无效的数字: ${depositId}`)
            return null
          }
          depositIdParam = depositId.toString()
        } else {
          // 其他类型，转换为字符串
          const str = String(depositId)
          if (str === '' || str === 'undefined' || str === 'null' || str === 'NaN') {
            console.warn(`[getDeposit] depositId 转换后无效: "${depositId}" -> "${str}"`)
            return null
          }
          depositIdParam = str
        }
        
        // 再次验证转换后的值
        if (!depositIdParam || depositIdParam === '' || depositIdParam === 'undefined' || depositIdParam === 'null' || depositIdParam === 'NaN') {
          console.warn(`[getDeposit] 转换后的 depositId 仍然无效: "${depositIdParam}"`)
          return null
        }
        
        console.log(`[getDeposit] 转换后的 depositId:`, depositIdParam, `(类型: ${typeof depositIdParam})`)
        
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
          // 数组格式: [depositor, depositTime, used, intendedRecipient, yieldAmount, yieldToken, token]
          // 注意：字段顺序必须与合约中的 DepositInfo 结构体完全一致
          console.log(`[getDeposit] 返回格式: 数组`)
          let [depositor, depositTime, used, intendedRecipient, yieldAmount, yieldToken, token] = result as [string, bigint, boolean, string, bigint, string, string]
          
          // 对于 TRON 链，地址可能是 hex 格式（以 41 开头），需要转换为 Base58
          if (chainType === 'tron') {
            try {
              // 使用统一的地址转换工具
              depositor = normalizeTronAddress(depositor)
              token = normalizeTronAddress(token)
              yieldToken = normalizeTronAddress(yieldToken)
              intendedRecipient = normalizeTronAddress(intendedRecipient)
              
              console.log(`[getDeposit] 地址转换后:`, {
                depositor,
                token,
                yieldToken,
                intendedRecipient,
              })
            } catch (err) {
              console.warn(`[getDeposit] 地址转换失败，使用原始值:`, err)
            }
          }
          
          // TRON 链的零地址可能是 Base58 格式
          const zeroAddresses = [
            '0x0000000000000000000000000000000000000000',
            'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', // TRON zero address
          ]
          
          if (!depositor || zeroAddresses.includes(depositor) || zeroAddresses.some(addr => depositor.toLowerCase() === addr.toLowerCase())) {
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
          // 对象格式: { depositor, depositTime, used, intendedRecipient, yieldAmount, yieldToken, token }
          // 注意：字段顺序必须与合约中的 DepositInfo 结构体完全一致
          // viem 的 readContract 对于 tuple 返回值，如果 ABI 中定义了 components 名称，会返回对象
          // TRON 的 TronWeb 也可能返回对象格式
          console.log(`[getDeposit] 返回格式: 对象`)
          console.log(`[getDeposit] 对象键:`, Object.keys(result))
          const info = result as any
          
          // 处理不同的字段访问方式
          // 对于 BigNumber 类型，需要转换为字符串
          const getBigIntValue = (value: any): string => {
            if (value === null || value === undefined) return '0'
            if (typeof value === 'bigint') return value.toString()
            if (typeof value === 'string') return value
            if (typeof value === 'number') return BigInt(value).toString()
            if (value && typeof value.toString === 'function') {
              // 可能是 BigNumber 对象
              if (value._hex) return BigInt(value._hex).toString()
              return value.toString()
            }
            return '0'
          }
          
          // 提取字段（按合约中的顺序：depositor, depositTime, used, intendedRecipient, yieldAmount, yieldToken, token）
          // 支持按名称访问（如果 ABI 正确）或按索引访问（数组格式）
          let depositor = info.depositor || info[0] || ''
          let depositTime = getBigIntValue(info.depositTime ?? info[1])
          let used = info.used ?? info[2] ?? false
          let intendedRecipient = info.intendedRecipient || info[3] || ''
          let yieldAmount = getBigIntValue(info.yieldAmount ?? info[4])
          let yieldToken = info.yieldToken || info[5] || ''
          let token = info.token || info[6] || ''
          
          console.log(`[getDeposit] 提取的原始地址值:`, {
            depositor,
            token,
            yieldToken,
            intendedRecipient,
          })
          
          // TRON 链的零地址可能是 Base58 格式
          const zeroAddresses = [
            '0x0000000000000000000000000000000000000000',
            'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', // TRON zero address
          ]
          
          // 检查 depositor 是否为零地址（在转换前检查）
          const depositorForCheck = depositor
          if (!depositorForCheck || zeroAddresses.includes(depositorForCheck) || zeroAddresses.some(addr => depositorForCheck.toLowerCase() === addr.toLowerCase())) {
            console.warn(`[getDeposit] 存款 ${depositId} 不存在 (depositor 为零地址)`)
            console.warn(`[getDeposit] 完整结果:`, JSON.stringify(result, null, 2))
            return null
          }
          
          // 对于 TRON 链，地址可能是 hex 格式（以 41 开头），需要转换为 Base58
          if (chainType === 'tron') {
            try {
              // 使用统一的地址转换工具
              depositor = normalizeTronAddress(depositor)
              token = normalizeTronAddress(token)
              yieldToken = normalizeTronAddress(yieldToken)
              intendedRecipient = normalizeTronAddress(intendedRecipient)
              
              console.log(`[getDeposit] 地址转换后 (对象格式):`, {
                depositor,
                token,
                yieldToken,
                intendedRecipient,
              })
            } catch (err) {
              console.warn(`[getDeposit] 地址转换失败，使用原始值:`, err)
            }
          }
          
          depositInfo = {
            depositor,
            token,
            yieldToken,
            yieldAmount, // 已经是字符串格式
            intendedRecipient,
            depositTime, // 已经是字符串格式
            used, // 已经是布尔值
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
   * 优先级：
   * 1. 环境变量（最简单直接）
   * 2. 部署结果 JSON 文件（result_xxx.json）
   * 3. TreasuryConfigCore（回退方案）
   */
  const getVaultAddress = useCallback(
    async (chainId: number): Promise<string | null> => {
      // 方法1: 优先从环境变量读取（最简单直接）
      const slip44ChainId = getSlip44FromChainId(chainId) || chainId
      const envKey = `NEXT_PUBLIC_DEPOSIT_VAULT_${slip44ChainId}`
      const vaultAddressFromEnv = process.env[envKey] || process.env.NEXT_PUBLIC_DEPOSIT_VAULT_ADDRESS || null
      
      if (vaultAddressFromEnv) {
        console.log(`从环境变量读取 DepositVault 地址 (chainId: ${chainId}):`, vaultAddressFromEnv)
        return vaultAddressFromEnv
      }

      // 方法2: 从部署结果 JSON 文件读取（result_xxx.json）
      try {
        const vaultAddressFromConfig = await getDepositVaultAddressFromConfig(chainId)
        if (vaultAddressFromConfig) {
          console.log(`从部署配置读取 DepositVault 地址 (chainId: ${chainId}):`, vaultAddressFromConfig)
          return vaultAddressFromConfig
        }
      } catch (err) {
        console.warn('从部署配置读取 DepositVault 地址失败:', err)
      }

      // 方法3: 如果以上都未找到，回退到从 TreasuryConfigCore 读取（可选）
      if (!walletManager || !sdkStore.sdk) {
        console.warn('钱包或 SDK 未连接，无法从 TreasuryConfigCore 读取')
        return null
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

        console.log('[getAllClaimableDeposits] 开始查询可领取存款')
        console.log('[getAllClaimableDeposits] 参数:', {
          vaultAddress,
          recipient,
          chainType,
          recipientType: typeof recipient,
        })

        const result = await walletManager.readContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI as unknown as ContractABI,
          'getClaimableDeposits',
          [recipient],
          chainType
        )

        console.log('[getAllClaimableDeposits] 查询结果 (原始):', result)
        console.log('[getAllClaimableDeposits] 结果类型:', typeof result)
        console.log('[getAllClaimableDeposits] 是否为数组:', Array.isArray(result))
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          console.log('[getAllClaimableDeposits] 对象键:', Object.keys(result))
        }

        if (!result) {
          console.warn('[getAllClaimableDeposits] 返回值为 null 或 undefined')
          return []
        }

        // 处理不同的返回格式
        let depositIds: bigint[] = []
        
        // 首先检查是否是对象格式（有命名返回值的情况，如 { depositIds: [...] }）
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          // 检查是否有 depositIds 属性
          if ('depositIds' in result && Array.isArray((result as any).depositIds)) {
            console.log('[getAllClaimableDeposits] 检测到对象格式，提取 depositIds 属性')
            depositIds = (result as any).depositIds as bigint[]
          } else if ('0' in result && Array.isArray((result as any)['0'])) {
            // 也可能是通过索引访问（如 result[0]）
            console.log('[getAllClaimableDeposits] 检测到对象格式，提取 [0] 属性')
            depositIds = (result as any)['0'] as bigint[]
          } else {
            // 尝试将对象转换为数组（如果是类数组对象）
            const keys = Object.keys(result)
            if (keys.length > 0 && Array.isArray((result as any)[keys[0]])) {
              console.log('[getAllClaimableDeposits] 检测到对象格式，使用第一个数组属性')
              depositIds = (result as any)[keys[0]] as bigint[]
            } else {
              console.warn('[getAllClaimableDeposits] 对象格式但无法提取数组:', result)
              return []
            }
          }
        } else if (Array.isArray(result)) {
          // 数组格式：直接使用
          depositIds = result as bigint[]
        } else if (typeof result === 'object' && 'length' in result) {
          // 可能是类数组对象，转换为数组
          depositIds = Array.from(result as any) as bigint[]
        } else if (typeof result === 'string' || typeof result === 'number' || typeof result === 'bigint') {
          // 单个值，包装成数组
          depositIds = [BigInt(result)]
        } else {
          console.warn('[getAllClaimableDeposits] 未知的返回格式:', result)
          return []
        }

        console.log('[getAllClaimableDeposits] 解析后的 depositIds:', depositIds)
        console.log('[getAllClaimableDeposits] depositIds 数量:', depositIds.length)

        const deposits: Array<{ depositId: string }> = []
        
        for (let i = 0; i < depositIds.length; i++) {
          const id = depositIds[i]
          
          // 跳过无效值
          if (id === null || id === undefined) {
            console.warn(`[getAllClaimableDeposits] 跳过无效的 depositId (索引 ${i}):`, id)
            continue
          }
          
          // 处理 BigNumber 或其他类型
          let idStr: string
          if (typeof id === 'bigint') {
            idStr = id.toString()
          } else if (typeof id === 'number') {
            idStr = id.toString()
          } else if (typeof id === 'string') {
            idStr = id.trim()
          } else if (id && typeof id.toString === 'function') {
            // 可能是 BigNumber 对象
            idStr = id.toString()
          } else {
            idStr = String(id)
          }
          
          // 验证转换后的值
          if (!idStr || idStr === '' || idStr === 'undefined' || idStr === 'null' || idStr === 'NaN') {
            console.warn(`[getAllClaimableDeposits] 跳过无效的 depositId (索引 ${i}): 转换后为空`, { original: id, converted: idStr })
            continue
          }
          
          deposits.push({
            depositId: idStr,
          })
        }

        console.log('[getAllClaimableDeposits] 最终返回的存款列表:', deposits)
        return deposits
      } catch (err) {
        console.error('[getAllClaimableDeposits] 查询所有可领取存款失败:', err)
        if (err instanceof Error) {
          console.error('[getAllClaimableDeposits] 错误消息:', err.message)
          console.error('[getAllClaimableDeposits] 错误堆栈:', err.stack)
        }
        // 对于 TRON 链，如果查询失败，返回空数组而不是抛出错误
        // 这样可以让用户知道没有可领取的存款，而不是显示错误
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
        )

        // 处理不同的返回格式
        // 某些链（特别是 TRON）可能返回数组而不是单个值
        let underlyingAmount: bigint
        
        if (Array.isArray(result)) {
          // 如果是数组，取第一个元素
          if (result.length === 0) {
            console.warn('[getUnderlyingAmount] 返回空数组，使用 0')
            return BigInt(0)
          }
          const firstValue = result[0]
          // 处理不同的数据类型
          if (typeof firstValue === 'bigint') {
            underlyingAmount = firstValue
          } else if (typeof firstValue === 'string') {
            underlyingAmount = BigInt(firstValue)
          } else if (typeof firstValue === 'number') {
            underlyingAmount = BigInt(firstValue)
          } else if (firstValue && typeof firstValue.toString === 'function') {
            // 可能是 BigNumber 对象
            if ((firstValue as any)._hex) {
              underlyingAmount = BigInt((firstValue as any)._hex)
            } else {
              underlyingAmount = BigInt(firstValue.toString())
            }
          } else {
            console.warn('[getUnderlyingAmount] 无法解析数组中的值:', firstValue)
            return BigInt(0)
          }
        } else if (result && typeof result === 'object' && 'underlyingAmount' in result) {
          // 如果是对象格式，提取 underlyingAmount 字段
          const value = (result as any).underlyingAmount
          if (typeof value === 'bigint') {
            underlyingAmount = value
          } else if (typeof value === 'string') {
            underlyingAmount = BigInt(value)
          } else if (typeof value === 'number') {
            underlyingAmount = BigInt(value)
          } else if (value && typeof value.toString === 'function') {
            if ((value as any)._hex) {
              underlyingAmount = BigInt((value as any)._hex)
            } else {
              underlyingAmount = BigInt(value.toString())
            }
          } else {
            console.warn('[getUnderlyingAmount] 无法解析对象中的值:', value)
            return BigInt(0)
          }
        } else {
          // 单个值格式
          if (typeof result === 'bigint') {
            underlyingAmount = result
          } else if (typeof result === 'string') {
            underlyingAmount = BigInt(result)
          } else if (typeof result === 'number') {
            underlyingAmount = BigInt(result)
          } else if (result && typeof result.toString === 'function') {
            // 可能是 BigNumber 对象
            if ((result as any)._hex) {
              underlyingAmount = BigInt((result as any)._hex)
            } else {
              underlyingAmount = BigInt(result.toString())
            }
          } else {
            console.warn('[getUnderlyingAmount] 无法解析返回值:', result)
            return BigInt(0)
          }
        }

        console.log(`[getUnderlyingAmount] 解析后的底层资产数量:`, underlyingAmount.toString())
        return underlyingAmount
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
