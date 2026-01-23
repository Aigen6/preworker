/**
 * TRON Energy API 使用示例
 * 
 * 这个文件展示了如何在实际代码中使用 estimateDepositEnergy 和 estimateApproveEnergyWithAPI
 */

import { useState, useEffect } from 'react'
import { estimateDepositEnergy, estimateApproveEnergyWithAPI, type EnergyEstimateResult } from './tron-energy-estimator'

/**
 * 示例 1: 在 React 组件中使用 estimateDepositEnergy
 */
export function DepositEnergyEstimateExample() {
  const [energyEstimate, setEnergyEstimate] = useState<EnergyEstimateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 示例参数
  const vaultAddress = 'TYourDepositVaultContractAddress'
  const tokenAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' // USDT
  const amount = '1000000' // 1 USDT (6位精度)
  const recipientAddress = 'TYourIntendedRecipientAddress'

  useEffect(() => {
    const fetchEstimate = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await estimateDepositEnergy(
          vaultAddress,
          tokenAddress,
          amount,
          recipientAddress
        )
        setEnergyEstimate(result)
      } catch (err: any) {
        setError(err.message || '估算失败')
        // 即使失败，也设置一个回退值
        setEnergyEstimate({
          energy: 196201, // 回退值
          bandwidth: 400,
          source: 'fallback',
          error: err.message
        })
      } finally {
        setLoading(false)
      }
    }

    // 只在所有参数都有效时调用
    if (vaultAddress && tokenAddress && amount && recipientAddress) {
      fetchEstimate()
    }
  }, [vaultAddress, tokenAddress, amount, recipientAddress])

  return (
    <div className="p-4 border rounded">
      <h3 className="text-lg font-bold mb-2">Deposit Energy 估算</h3>
      
      {loading && <p>正在估算 Energy...</p>}
      
      {error && (
        <div className="text-red-500 mb-2">
          <p>错误: {error}</p>
        </div>
      )}
      
      {energyEstimate && (
        <div>
          <div className="mb-2">
            <p className="font-semibold">Energy 需求:</p>
            <p className="text-2xl">{energyEstimate.energy.toLocaleString()}</p>
          </div>
          
          {energyEstimate.bandwidth && (
            <div className="mb-2">
              <p className="font-semibold">Bandwidth 需求:</p>
              <p>{energyEstimate.bandwidth.toLocaleString()}</p>
            </div>
          )}
          
          <div className="mb-2">
            <p className="font-semibold">数据来源:</p>
            {energyEstimate.source === 'api' ? (
              <p className="text-green-500">✓ 使用 TRON API 准确计算</p>
            ) : (
              <p className="text-yellow-500">⚠ 使用估算值（API 不可用）</p>
            )}
          </div>
          
          {energyEstimate.error && (
            <div className="text-yellow-500 text-sm">
              <p>警告: {energyEstimate.error}</p>
            </div>
          )}
          
          {/* 计算费用（假设 1 Energy = 420 SUN） */}
          <div className="mt-4 p-2 bg-gray-100 rounded">
            <p className="text-sm text-gray-600">费用估算（如果 Energy 不足）:</p>
            <p className="font-semibold">
              {(energyEstimate.energy * 420 / 1_000_000).toFixed(2)} TRX
            </p>
            <p className="text-xs text-gray-500">
              (基于 420 SUN/Energy，实际价格会波动)
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 示例 2: 在发送交易前动态计算 feeLimit
 */
export async function calculateDepositFeeLimit(
  vaultAddress: string,
  tokenAddress: string,
  amount: string,
  recipientAddress: string
): Promise<number> {
  // 估算 Energy
  const estimate = await estimateDepositEnergy(
    vaultAddress,
    tokenAddress,
    amount,
    recipientAddress
  )

  // 获取当前的 Energy 价格（这里使用固定值，实际应该从链上获取）
  const energyPrice = 420 // SUN per Energy（实际价格会波动，380-450）

  // 计算 feeLimit（添加 20% 的安全缓冲）
  const feeLimit = Math.ceil(estimate.energy * energyPrice * 1.2)

  console.log('Energy 估算:', {
    energy: estimate.energy,
    source: estimate.source,
    feeLimit: feeLimit,
    feeLimitInTRX: (feeLimit / 1_000_000).toFixed(2)
  })

  return feeLimit
}

/**
 * 示例 3: 在 useDepositVault hook 中集成
 */
export function useDepositWithEnergyEstimate() {
  const [energyEstimate, setEnergyEstimate] = useState<EnergyEstimateResult | null>(null)

  const estimateEnergy = async (
    vaultAddress: string,
    tokenAddress: string,
    amount: string,
    recipientAddress: string
  ) => {
    try {
      const result = await estimateDepositEnergy(
        vaultAddress,
        tokenAddress,
        amount,
        recipientAddress
      )
      setEnergyEstimate(result)
      return result
    } catch (error: any) {
      console.error('Energy 估算失败:', error)
      // 返回回退值
      const fallback: EnergyEstimateResult = {
        energy: 196201,
        bandwidth: 400,
        source: 'fallback',
        error: error.message
      }
      setEnergyEstimate(fallback)
      return fallback
    }
  }

  return {
    energyEstimate,
    estimateEnergy
  }
}

/**
 * 示例 4: 估算 approve 操作的 Energy
 */
export function ApproveEnergyEstimateExample() {
  const [energyEstimate, setEnergyEstimate] = useState<EnergyEstimateResult | null>(null)
  const [loading, setLoading] = useState(false)

  const tokenAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' // USDT
  const spenderAddress = 'TYourVaultContractAddress'
  const amount = '1000000000000000000' // 最大授权

  useEffect(() => {
    const fetchEstimate = async () => {
      setLoading(true)
      try {
        const result = await estimateApproveEnergyWithAPI(
          tokenAddress,
          spenderAddress,
          amount
        )
        setEnergyEstimate(result)
      } catch (err: any) {
        console.error('估算失败:', err)
      } finally {
        setLoading(false)
      }
    }

    if (tokenAddress && spenderAddress && amount) {
      fetchEstimate()
    }
  }, [tokenAddress, spenderAddress, amount])

  return (
    <div className="p-4 border rounded">
      <h3 className="text-lg font-bold mb-2">Approve Energy 估算</h3>
      
      {loading && <p>正在估算...</p>}
      
      {energyEstimate && (
        <div>
          <p>Energy: {energyEstimate.energy.toLocaleString()}</p>
          <p>来源: {energyEstimate.source === 'api' ? 'API' : '估算值'}</p>
        </div>
      )}
    </div>
  )
}
