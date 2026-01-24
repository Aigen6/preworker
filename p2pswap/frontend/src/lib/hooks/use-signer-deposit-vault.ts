/**
 * useSignerDepositVault - 使用 Signer 模式的 DepositVault Hook
 * 
 * 这个 Hook 直接使用私钥签名，无需用户交互
 * 适用于自动化场景
 */

'use client'

import { useCallback, useState } from 'react'
import { getSignerService, initializeSignerFromEnv } from '../services/signer-service'
import { DEPOSIT_VAULT_ABI } from '../abis/deposit-vault'
import { ERC20_ABI } from '../abis/erc20'
import { parseToWei, formatFromWei } from '../utils/amount-calculator'
import { getUSDTDecimals } from '../utils/token-decimals'

export interface DepositInfo {
  depositor: string
  token: string
  yieldToken: string
  yieldAmount: string
  intendedRecipient: string
  depositTime: string
  used: boolean
}

export function useSignerDepositVault(chainId: number) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signer, setSigner] = useState<any>(null)

  // 初始化 Signer
  const initializeSigner = useCallback(async () => {
    try {
      const signerInstance = await initializeSignerFromEnv(chainId)
      if (signerInstance) {
        setSigner(signerInstance)
        return signerInstance
      }
      throw new Error('无法初始化 Signer，请检查环境变量 NEXT_PUBLIC_PRIVATE_KEY')
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [chainId])

  /**
   * 授权 Token
   */
  const approveToken = useCallback(
    async (tokenAddress: string, vaultAddress: string, amount: bigint) => {
      if (!signer) {
        await initializeSigner()
      }

      const currentSigner = signer || await initializeSigner()

      // 检查当前授权额度
      const allowance = await currentSigner.readContract(
        tokenAddress,
        ERC20_ABI,
        'allowance',
        [currentSigner.getAddress(), vaultAddress]
      )

      if (BigInt(allowance.toString()) >= amount) {
        return { txHash: null, alreadyApproved: true }
      }

      // 授权
      const txHash = await currentSigner.callContract(
        tokenAddress,
        ERC20_ABI,
        'approve',
        [vaultAddress, amount],
        { gas: BigInt(100000) }
      )

      return { txHash, alreadyApproved: false }
    },
    [signer, initializeSigner]
  )

  /**
   * 存入
   */
  const deposit = useCallback(
    async (params: {
      vaultAddress: string
      tokenAddress: string
      amount: string
      intendedRecipients: Array<{ recipient: string; amount: string }>
    }) => {
      if (!signer) {
        await initializeSigner()
      }

      setLoading(true)
      setError(null)

      try {
        const currentSigner = signer || await initializeSigner()

        // 1. 授权 Token
        const decimals = getUSDTDecimals(chainId)
        const totalAmount = params.intendedRecipients.reduce(
          (sum, r) => sum + parseToWei(r.amount, decimals),
          BigInt(0)
        )

        const approveResult = await approveToken(
          params.tokenAddress,
          params.vaultAddress,
          totalAmount
        )

        if (!approveResult.alreadyApproved && approveResult.txHash) {
          // 等待授权确认
          await currentSigner.waitForTransaction(approveResult.txHash)
        }

        // 2. 存入
        const allocations = params.intendedRecipients.map((r) => ({
          recipient: r.recipient,
          amount: parseToWei(r.amount, decimals).toString(),
        }))

        const txHash = await currentSigner.callContract(
          params.vaultAddress,
          DEPOSIT_VAULT_ABI,
          'deposit',
          [params.tokenAddress, totalAmount.toString(), allocations],
          { gas: BigInt(500000) }
        )

        // 等待交易确认
        const receipt = await currentSigner.waitForTransaction(txHash)

        return { txHash, receipt }
      } catch (err: any) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [signer, initializeSigner, chainId, approveToken]
  )

  /**
   * 领取
   */
  const claim = useCallback(
    async (vaultAddress: string, depositId: string) => {
      if (!signer) {
        await initializeSigner()
      }

      setLoading(true)
      setError(null)

      try {
        const currentSigner = signer || await initializeSigner()

        const txHash = await currentSigner.callContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI,
          'claim',
          [depositId],
          { gas: BigInt(300000) }
        )

        const receipt = await currentSigner.waitForTransaction(txHash)

        return { txHash, receipt }
      } catch (err: any) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [signer, initializeSigner]
  )

  /**
   * 取回
   */
  const recover = useCallback(
    async (vaultAddress: string, depositId: string) => {
      if (!signer) {
        await initializeSigner()
      }

      setLoading(true)
      setError(null)

      try {
        const currentSigner = signer || await initializeSigner()

        const txHash = await currentSigner.callContract(
          vaultAddress,
          DEPOSIT_VAULT_ABI,
          'recover',
          [depositId],
          { gas: BigInt(300000) }
        )

        const receipt = await currentSigner.waitForTransaction(txHash)

        return { txHash, receipt }
      } catch (err: any) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [signer, initializeSigner]
  )

  /**
   * 获取存款信息
   */
  const getDeposit = useCallback(
    async (vaultAddress: string, depositId: string): Promise<DepositInfo> => {
      if (!signer) {
        await initializeSigner()
      }

      const currentSigner = signer || await initializeSigner()

      const result = await currentSigner.readContract(
        vaultAddress,
        DEPOSIT_VAULT_ABI,
        'deposits',
        [depositId]
      )

      return {
        depositor: result[0],
        token: result[1],
        yieldToken: result[2],
        yieldAmount: result[3].toString(),
        intendedRecipient: result[4],
        depositTime: result[5].toString(),
        used: result[6],
      }
    },
    [signer, initializeSigner]
  )

  return {
    approveToken,
    deposit,
    claim,
    recover,
    getDeposit,
    loading,
    error,
    signerAddress: signer?.getAddress() || null,
  }
}
