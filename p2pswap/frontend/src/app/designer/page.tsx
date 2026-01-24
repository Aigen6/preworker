"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/components/providers/toast-provider"
import { AddressInput } from "@/components/ui/address-input"
import { AddressDisplay } from "@/components/ui/address-display"
import { validateAddressForSlip44 } from "@/lib/utils/address-validation"
import { TRON_CHAIN_ID } from "@/lib/utils/wallet-utils"
import { X, Maximize2 } from "lucide-react"
import {
  AMOUNT_TOLERANCE,
  MIN_TIME_INTERVAL,
  MAX_TIME_INTERVAL,
  validateAllStrategies,
  generateMismatchedAmounts,
  generateWithdrawTime,
  roundToCent,
  roundToDynamic,
  getDecimalPlaces,
  type StrategyValidation,
  type TransactionPlan as StrategyTransactionPlan,
} from "@/lib/utils/strategy-utils"
import {
  generateTasksFromPlan,
  type Task,
} from "@/lib/utils/task-manager"
import { useSignerDepositVault } from "@/lib/hooks/use-signer-deposit-vault"
import { getAddressPoolService } from "@/lib/services/address-pool.service"
import { useRouter } from "next/navigation"

// 类型定义
interface HighRiskAddress {
  address: string // A: 高风险地址
  amount: number // 存入金额
  finalTargets: Array<{ // E/F: 最终目标地址列表
    address: string
    amount: number // 该目标地址应接收的金额
  }>
}

interface StrategyConfig {
  enableAmountMismatch: boolean
  minAmountDifference: number
  enableTimeExtension: boolean
  minTimeInterval: number
  enableNormalTransactionMix: boolean
  normalTransactionRatio: number
  enableRiskControl: boolean
  maxHighRiskRatio: number
  // 高风险地址配置
  highRiskIntermediateAddressCount?: number | { min: number; max: number } // 高风险地址的中间地址数量（默认：1-2个随机）
  // 正常交易配置
  normalIntermediateAddressCount?: number | { min: number; max: number } // 正常交易的中间地址数量（默认：1-2个随机）
  normalFinalTargetCount?: number | { min: number; max: number } // 正常交易的最终目标地址数量（默认：1-2个随机）
}

interface OperationPlan {
  planId: string
  totalAmount: number
  totalTransactions: number
  sourceAddresses: number
  transactions: TransactionPlan[]
  generatedAt: string
  strategyConfig: StrategyConfig
  strategyValidation: StrategyValidation
}

interface TransactionPlan {
  id: string
  sourceAddress: string
  sourceAddressLabel?: string
  amount: number
  targetAddress: string
  chain: string
  chainId: number
  status: "pending" | "preprocess" | "enclave" | "completed"
  isHighRisk: boolean
  depositTime?: number
  withdrawTime?: number
  relatedDepositId?: string
  amountDifference?: number
  timeInterval?: number
  steps: Array<{
    step: "preprocess" | "enclave" | "transfer"
    status: "pending" | "processing" | "completed" | "failed"
    vaultAddress?: string
    targetAddress?: string
  }>
  depositId?: string
}

function DesignerPage() {
  const { showError, showWarning, showSuccess } = useToast()
  const router = useRouter()
  const [chainId, setChainId] = useState(714) // 默认 BSC，可切换
  const [vaultAddress, setVaultAddress] = useState<string | null>(null)

  // 高风险地址输入
  const [highRiskAddress, setHighRiskAddress] = useState("")
  const [highRiskAmount, setHighRiskAmount] = useState("")
  // 最终目标地址列表（单独添加）
  const [finalTargets, setFinalTargets] = useState<Array<{ address: string; amount: string }>>([])
  const [tempTargetAddress, setTempTargetAddress] = useState("")
  const [tempTargetAmount, setTempTargetAmount] = useState("")
  const [highRiskAddresses, setHighRiskAddresses] = useState<HighRiskAddress[]>([])

  // 地址池服务（根据chainId动态更新）
  const [addressPool, setAddressPool] = useState(() => getAddressPoolService(chainId))
  const [addressPoolCount, setAddressPoolCount] = useState(0)
  
  // 生成策略加载状态
  const [isGenerating, setIsGenerating] = useState(false)
  
  // 手续费接收地址（从KeyManager的序列号20050118开始获取10个）
  const [feeRecipientAddresses, setFeeRecipientAddresses] = useState<string[]>([])
  
  // 从KeyManager加载手续费接收地址
  useEffect(() => {
    const loadFeeRecipients = async () => {
      try {
        const { getKeyManagerClient, chainIdToKeyManagerChain } = await import('@/lib/services/keymanager-client')
        const keyManagerClient = getKeyManagerClient()
        const chain = chainIdToKeyManagerChain(chainId)
        if (!chain) {
          console.warn(`不支持的 chainId: ${chainId}`)
          return
        }

        // 从索引19050118开始，获取10个地址
        const startIndex = 19050118
        const count = 10
        const addresses = await keyManagerClient.exportBatch(chain, startIndex, count)
        const addressList = addresses.map(addr => addr.address.trim().toLowerCase())
        setFeeRecipientAddresses(addressList)
        console.log(`✅ 从KeyManager加载了 ${addressList.length} 个手续费接收地址`)
      } catch (error) {
        console.error('从KeyManager加载手续费接收地址失败:', error)
      }
    }
    loadFeeRecipients()
  }, [chainId])

  // 策略配置（使用默认值）
  const [strategyConfig] = useState<StrategyConfig>({
    enableAmountMismatch: true,
    minAmountDifference: AMOUNT_TOLERANCE + 0.0001,
    enableTimeExtension: true,
    minTimeInterval: MIN_TIME_INTERVAL, // 15分钟
    enableNormalTransactionMix: true,
    normalTransactionRatio: 0.8,
    enableRiskControl: true,
    maxHighRiskRatio: 0.2,
  })

  // 当chainId变化时，更新地址池服务
  useEffect(() => {
    const newPool = getAddressPoolService(chainId)
    setAddressPool(newPool)
    // 清空当前输入
    setHighRiskAddress("")
    setHighRiskAmount("")
    setFinalTargets([])
    setTempTargetAddress("")
    setTempTargetAmount("")
  }, [chainId])

  // 获取 Vault 地址（根据chainId）
  useEffect(() => {
    const fetchVaultAddress = async () => {
      try {
        let vaultAddr: string | null = null
        if (chainId === 714 || chainId === 56) {
          vaultAddr = process.env.NEXT_PUBLIC_DEPOSIT_VAULT_714 || null
        } else if (chainId === 195) {
          vaultAddr = process.env.NEXT_PUBLIC_DEPOSIT_VAULT_195 || null
        } else if (chainId === 1 || chainId === 60) {
          vaultAddr = process.env.NEXT_PUBLIC_DEPOSIT_VAULT_1 || null
        }
        setVaultAddress(vaultAddr)
      } catch (error) {
        console.error('获取 Vault 地址失败:', error)
      }
    }
    fetchVaultAddress()
  }, [chainId])

  // 加载地址池并更新计数
  useEffect(() => {
    const updateAddressPoolCount = async () => {
      await addressPool.reload()
      setAddressPoolCount(addressPool.getAddressCount())
    }
    updateAddressPoolCount()
  }, [addressPool, chainId])

  // 验证地址格式（根据链类型）
  const validateAddress = (address: string): boolean => {
    if (!address.trim()) return false
    return validateAddressForSlip44(address, chainId)
  }

  // 添加最终目标地址
  const handleAddFinalTarget = () => {
    if (!tempTargetAddress.trim()) {
      showWarning("请输入目标地址")
      return
    }

    // 验证地址格式
    if (!validateAddress(tempTargetAddress)) {
      const chainName = chainId === 195 ? 'TRON' : chainId === 714 || chainId === 56 ? 'BSC' : chainId === 1 || chainId === 60 ? 'ETH' : '当前链'
      showError(`地址格式无效，请根据当前链（${chainName}）输入正确的地址格式`)
      return
    }

    const amount = parseFloat(tempTargetAmount.trim())
    if (isNaN(amount) || amount <= 0) {
      showWarning("请输入有效的金额")
      return
    }

    // 检查地址是否已存在
    const exists = finalTargets.some(
      (t) => t.address.toLowerCase() === tempTargetAddress.toLowerCase()
    )
    if (exists) {
      showWarning("该目标地址已添加")
      return
    }

    setFinalTargets([...finalTargets, {
      address: tempTargetAddress.trim(),
      amount: tempTargetAmount.trim(),
    }])
    setTempTargetAddress("")
    setTempTargetAmount("")
  }

  // 删除最终目标地址
  const handleRemoveFinalTarget = (index: number) => {
    setFinalTargets(finalTargets.filter((_, i) => i !== index))
  }

  // 添加高风险地址
  const handleAddHighRiskAddress = () => {
    if (!highRiskAddress.trim()) {
      showWarning("请输入地址")
      return
    }

    // 验证地址格式
    if (!validateAddress(highRiskAddress)) {
      const chainName = chainId === 195 ? 'TRON' : chainId === 714 || chainId === 56 ? 'BSC' : chainId === 1 || chainId === 60 ? 'ETH' : '当前链'
      showError(`地址格式无效，请根据当前链（${chainName}）输入正确的地址格式`)
      return
    }

    // 如果为空或100，默认使用100
    const amountValue = highRiskAmount.trim() === "" || highRiskAmount.trim() === "100" ? "100" : highRiskAmount.trim()
    const amount = parseFloat(amountValue)
    if (isNaN(amount) || amount <= 0) {
      showWarning("请输入有效的金额")
      return
    }
    
    // 验证：任务计划时，存入金额必须是整数（1的倍数）
    if (amount % 1 !== 0) {
      showError("存入金额必须是整数（不允许小数）")
      return
    }

    // 验证最终目标地址列表
    if (finalTargets.length === 0) {
      showWarning("请至少添加一个最终目标地址")
      return
    }

    // 验证所有最终目标地址格式
    for (const target of finalTargets) {
      if (!validateAddress(target.address)) {
        const chainName = chainId === 195 ? 'TRON' : chainId === 714 || chainId === 56 ? 'BSC' : chainId === 1 || chainId === 60 ? 'ETH' : '当前链'
        showError(`最终目标地址 ${target.address} 格式无效，请根据当前链（${chainName}）输入正确的地址格式`)
        return
      }
    }

    // 确定动态小数位数（根据存入金额）
    const decimalPlaces = getDecimalPlaces(amount)
    const roundToPrecision = (amt: number) => roundToDynamic(amt)
    
    // 转换最终目标地址列表（使用动态小数位数）
    const finalTargetsList: Array<{ address: string; amount: number }> = finalTargets.map(t => ({
      address: t.address,
      amount: roundToPrecision(parseFloat(t.amount))
    }))

    // 验证总金额（使用动态小数位数）
    const totalFinalAmount = roundToPrecision(finalTargetsList.reduce((sum, t) => sum + t.amount, 0))
    const roundedAmount = roundToPrecision(amount)
    const tolerance = Math.pow(10, -decimalPlaces) // 根据小数位数确定容差
    if (Math.abs(totalFinalAmount - roundedAmount) > tolerance) {
      showWarning(`最终目标地址总金额 ${totalFinalAmount.toFixed(decimalPlaces)} 不等于存入金额 ${roundedAmount.toFixed(decimalPlaces)}`)
      return
    }

    const exists = highRiskAddresses.some(
      (addr) => addr.address.toLowerCase() === highRiskAddress.toLowerCase()
    )
    if (exists) {
      showWarning("地址已存在")
      return
    }

    setHighRiskAddresses([...highRiskAddresses, {
      address: highRiskAddress.trim(),
      amount: roundedAmount,
      finalTargets: finalTargetsList,
    }])
    setHighRiskAddress("")
    setHighRiskAmount("")
    setFinalTargets([])
    setTempTargetAddress("")
    setTempTargetAmount("")
    showSuccess("高风险地址已添加")
  }

  // 删除高风险地址
  const handleDeleteHighRiskAddress = (index: number) => {
    setHighRiskAddresses(highRiskAddresses.filter((_, i) => i !== index))
    showSuccess("地址已删除")
  }

  // 生成策略
  const handleGeneratePlan = async () => {
    if (highRiskAddresses.length === 0) {
      showWarning("请至少添加一个高风险地址（分配）")
      return
    }

    // 设置加载状态
    setIsGenerating(true)

    try {
      // 确保地址池已加载
      await addressPool.reload()
      const currentPoolCount = addressPool.getAddressCount()
      
      if (currentPoolCount < 10) {
        const chainName = chainId === 195 ? 'TRON' : chainId === 714 ? 'BSC' : chainId === 1 ? 'ETH' : '当前链'
        showError(`地址池地址不足（当前: ${currentPoolCount}）\n请确保：\n1. KeyManager 服务正在运行（${process.env.NEXT_PUBLIC_KEYMANAGER_API_URL || 'http://localhost:8080'}）\n2. 当前链类型为 ${chainName} (chainId: ${chainId})\n3. KeyManager 中有足够的地址`)
        setIsGenerating(false)
        return
      }
      
      // 检查手续费接收地址是否已加载
      if (feeRecipientAddresses.length < 10) {
        showError(`手续费接收地址不足（当前: ${feeRecipientAddresses.length}）\n请确保KeyManager服务正在运行，且可以从索引19050118开始获取地址`)
        setIsGenerating(false)
        return
      }
      // 生成策略ID
      const strategyId = `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // 计算总金额和交易数量
      const highRiskTotalAmount = highRiskAddresses.reduce((sum, addr) => sum + addr.amount, 0)
      const highRiskTransactionCount = highRiskAddresses.length

      // 计算目标交易的平均金额（用于确定正常交易的金额范围）
      const avgHighRiskAmount = highRiskTotalAmount / highRiskTransactionCount
      
      // 正常交易数量：目标交易次数的 3-5 倍
      const normalTransactionCountMin = highRiskTransactionCount * 3
      const normalTransactionCountMax = highRiskTransactionCount * 5
      const requiredNormalTransactionCount = Math.floor(
        normalTransactionCountMin + Math.random() * (normalTransactionCountMax - normalTransactionCountMin + 1)
      )
      
      // 计算需要的正常交易总金额（高风险总金额的 5 倍以上）
      const requiredNormalTotalAmount = highRiskTotalAmount * 5

      const allTasks: any[] = [] // 存储所有阶段的任务
      const highRiskDepositTasks: any[] = [] // 存储高风险存入任务，用于后续混合时间

      // 为每个高风险地址生成4个阶段的任务
      for (const highRiskAddr of highRiskAddresses) {
        // 阶段1: Deposit - A 存入 Deposit Vault，指定 B/C（地址池地址）为接收者
        // 中间地址数量：如果配置了固定值则使用，否则自动选择1-2个
        let splitCount: number
        if (strategyConfig.highRiskIntermediateAddressCount !== undefined) {
          if (typeof strategyConfig.highRiskIntermediateAddressCount === 'number') {
            splitCount = strategyConfig.highRiskIntermediateAddressCount
          } else {
            // 范围配置
            const { min, max } = strategyConfig.highRiskIntermediateAddressCount
            splitCount = Math.floor(Math.random() * (max - min + 1)) + min
          }
        } else {
          // 默认：自动选择1-2个
          splitCount = Math.floor(Math.random() * 2) + 1 // 1-2个
        }
        const poolAddresses = addressPool.getRandomAddresses(splitCount, [highRiskAddr.address])
        
        if (poolAddresses.length < splitCount) {
          showError("地址池地址不足，无法生成策略")
          return
        }

        // 确定动态小数位数（根据存入金额和最终目标地址数量）
        // 使用存入金额和最终目标地址数量中的较大值来确定小数位数
        const maxAmountForPrecision = Math.max(highRiskAddr.amount, ...highRiskAddr.finalTargets.map(t => t.amount))
        const depositDecimalPlaces = getDecimalPlaces(maxAmountForPrecision)
        const roundDepositAmount = (amt: number) => roundToDynamic(amt)
        const depositTolerance = Math.pow(10, -depositDecimalPlaces) // 根据小数位数确定容差
        
        // 将总金额分配给 B/C（确保总和等于存入金额）
        const amounts = generateMismatchedAmounts(highRiskAddr.amount, splitCount, strategyConfig.minAmountDifference, depositDecimalPlaces)
        
        // 验证：amounts 数组长度必须等于 splitCount
        if (amounts.length !== splitCount) {
          console.error(`[策略生成] amounts 数组长度不匹配: expected ${splitCount}, got ${amounts.length}`)
          showError(`金额分配错误：预期 ${splitCount} 个金额，实际 ${amounts.length} 个`)
          return
        }
        
        // 验证：poolAddresses 数组长度必须等于 splitCount
        if (poolAddresses.length !== splitCount) {
          console.error(`[策略生成] poolAddresses 数组长度不匹配: expected ${splitCount}, got ${poolAddresses.length}`)
          showError(`地址数量错误：预期 ${splitCount} 个地址，实际 ${poolAddresses.length} 个`)
          return
        }
        
        // 验证总和（使用动态小数位数）
        const totalAllocated = roundDepositAmount(amounts.reduce((sum, amt) => sum + amt, 0))
        if (Math.abs(totalAllocated - highRiskAddr.amount) > depositTolerance) {
          // 如果总和不对，调整最后一个金额
          const diff = roundDepositAmount(highRiskAddr.amount - totalAllocated)
          amounts[amounts.length - 1] = roundDepositAmount(amounts[amounts.length - 1] + diff)
        }
        
        // 获取地址在地址池中的索引（编号）
        const getAllAddresses = addressPool.getAllAddresses()
        const intendedRecipients = poolAddresses.map((addr, i) => {
          // 安全检查：确保索引有效
          if (i >= amounts.length) {
            console.error(`[策略生成] 索引超出范围: i=${i}, amounts.length=${amounts.length}`)
            throw new Error(`索引超出范围: i=${i}, amounts.length=${amounts.length}`)
          }
          
          // 查找地址在地址池中的索引（编号）
          // 统一转换为小写进行比较（地址池中已统一为小写）
          const addrLower = addr.address.toLowerCase().trim()
          const addressIndex = getAllAddresses.findIndex(a => 
            a.address.toLowerCase().trim() === addrLower
          )
          
          const amount = roundDepositAmount(amounts[i] || 0) // 使用动态小数位数
          
          return {
            recipient: addr.address,
            amount,
            addressIndex: addressIndex >= 0 ? addressIndex + 1 : undefined // 编号从1开始
          }
        })
        
        // 再次验证总和（使用动态小数位数）
        const finalTotal = roundDepositAmount(intendedRecipients.reduce((sum, r) => sum + r.amount, 0))
        if (Math.abs(finalTotal - highRiskAddr.amount) > depositTolerance) {
          // 如果还有差异，调整最后一个
          const finalDiff = roundDepositAmount(highRiskAddr.amount - finalTotal)
          intendedRecipients[intendedRecipients.length - 1].amount = roundDepositAmount(intendedRecipients[intendedRecipients.length - 1].amount + finalDiff)
          
          // 记录警告
          console.warn(`[策略生成] 调整 intendedRecipients 总和: 原始=${highRiskAddr.amount.toFixed(depositDecimalPlaces)}, 计算=${finalTotal.toFixed(depositDecimalPlaces)}, 调整=${finalDiff.toFixed(depositDecimalPlaces)}`)
        }
        
        // 最终验证：确保 intendedRecipients 的数量和金额总和正确
        const finalVerification = roundDepositAmount(intendedRecipients.reduce((sum, r) => sum + r.amount, 0))
        if (Math.abs(finalVerification - highRiskAddr.amount) > depositTolerance) {
          console.error(`[策略生成] 最终验证失败: 存入金额=${highRiskAddr.amount.toFixed(depositDecimalPlaces)}, 接收者总金额=${finalVerification.toFixed(depositDecimalPlaces)}`)
          console.error(`[策略生成] intendedRecipients:`, intendedRecipients.map(r => ({ recipient: r.recipient, amount: r.amount })))
          showError(`金额验证失败：存入 ${highRiskAddr.amount.toFixed(depositDecimalPlaces)} USDT，但接收者总金额为 ${finalVerification.toFixed(depositDecimalPlaces)} USDT`)
          return
        }

        // 高风险存入时间：1小时内随机
        const depositTime = Math.floor((Date.now() + Math.random() * 3600000) / 1000) // 1小时内随机

        // 阶段1任务：Deposit
        const depositTask = {
          id: `deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "deposit" as const,
          sourceAddress: highRiskAddr.address, // A
          targetAddress: "", // Deposit Vault
          amount: highRiskAddr.amount,
          intendedRecipients,
          scheduledTime: depositTime,
          chain: chainId === 195 ? "TRON" : chainId === 714 || chainId === 56 ? "BSC" : chainId === 1 || chainId === 60 ? "ETH" : "BSC",
          chainId: chainId,
          isHighRisk: true,
          strategyId: strategyId,
        }
        highRiskDepositTasks.push(depositTask) // 先存储，稍后混合
        allTasks.push(depositTask)

        // 阶段2: Claim - B/C 从 Deposit Vault 提取
        for (let i = 0; i < poolAddresses.length; i++) {
          // 每个 B/C 的 Claim 时间在 15分钟 到 12小时 之间
          const claimTimeOffset = generateWithdrawTime(
            depositTime,
            strategyConfig.minTimeInterval,
            MAX_TIME_INTERVAL
          ) - depositTime
          const claimTime = depositTime + claimTimeOffset + i * 60 // 每个地址间隔1分钟

          const claimTask = {
            id: `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: "claim" as const,
            sourceAddress: poolAddresses[i].address, // B/C
            targetAddress: poolAddresses[i].address, // 提取到自己
            amount: amounts[i],
            scheduledTime: claimTime,
            relatedTaskId: depositTask.id,
            chain: "BSC",
            chainId: chainId,
            isHighRisk: false,
            strategyId: strategyId,
          }
          allTasks.push(claimTask)

          // 阶段3: Enclave Deposit - B/C 通过 SDK 存入隐私池
          // 高风险地址存入隐私池时：
          // - 4% 手续费 Allocation（给手续费接收地址）
          // - 95% 分配给目标地址（1% 被系统自动扣除作为合约手续费）
          
          // 确定动态小数位数（根据存入金额和最终目标地址数量）
          const maxAmountForPrecision = Math.max(amounts[i], ...highRiskAddr.finalTargets.map(t => t.amount))
          const allocationDecimalPlaces = getDecimalPlaces(maxAmountForPrecision)
          const roundAllocationAmount = (amt: number) => roundToDynamic(amt)
          const allocationTolerance = Math.pow(10, -allocationDecimalPlaces) // 根据小数位数确定容差
          
          const totalAmount = roundAllocationAmount(amounts[i])
          const fee = roundAllocationAmount(totalAmount * 0.04) // 4% 手续费，使用动态小数位数
          const targetAllocatableAmount = roundAllocationAmount(totalAmount * 0.95) // 95% 分配给目标地址，使用动态小数位数
          // 注意：1% 合约手续费由系统自动扣除，不需要创建 Allocation
          
          // 目标地址数量
          const targetAddressCount = highRiskAddr.finalTargets.length
          
          // Allocation 数量 = 目标地址数量 + 1（手续费 Allocation）
          const allocationCount = targetAddressCount + 1
          
          // 生成分配方案：将 95% 分成 targetAddressCount 个 Allocation（每个对应一个目标地址）
          // 最后一个 Allocation 使用剩余金额，确保总和准确
          const roundedTargetAllocationAmounts: number[] = []
          if (targetAddressCount > 0) {
            if (targetAddressCount === 1) {
              // 只有一个目标地址，直接分配全部 95%
              roundedTargetAllocationAmounts.push(roundAllocationAmount(targetAllocatableAmount))
            } else {
              // 多个目标地址，前 n-1 个使用 generateMismatchedAmounts，最后一个使用剩余金额
              const firstAmounts = generateMismatchedAmounts(targetAllocatableAmount, targetAddressCount, 1, allocationDecimalPlaces) // 最小差异1 USDT
              // 前 n-1 个金额
              for (let idx = 0; idx < targetAddressCount - 1; idx++) {
                roundedTargetAllocationAmounts.push(roundAllocationAmount(firstAmounts[idx]))
              }
              // 最后一个金额 = 总金额 - 前 n-1 个金额的总和
              const previousSum = roundAllocationAmount(roundedTargetAllocationAmounts.reduce((sum, amt) => sum + amt, 0))
              const lastAmount = roundAllocationAmount(targetAllocatableAmount - previousSum)
              const minAmount = Math.pow(10, -allocationDecimalPlaces) // 最小金额根据小数位数确定
              roundedTargetAllocationAmounts.push(roundAllocationAmount(Math.max(minAmount, lastAmount)))
            }
          }
          
          // 验证分配总和必须等于 targetAllocatableAmount（使用动态小数位数）
          const allocationSum = roundAllocationAmount(roundedTargetAllocationAmounts.reduce((sum, amt) => sum + amt, 0))
          if (Math.abs(allocationSum - targetAllocatableAmount) > allocationTolerance) {
            // 如果总和不对，调整最后一个金额
            const diff = roundAllocationAmount(targetAllocatableAmount - allocationSum)
            roundedTargetAllocationAmounts[roundedTargetAllocationAmounts.length - 1] = roundAllocationAmount(roundedTargetAllocationAmounts[roundedTargetAllocationAmounts.length - 1] + diff)
          }
          
          // 添加手续费 Allocation（使用动态小数位数）
          const allocationAmounts = [...roundedTargetAllocationAmounts, fee]
          
          // 从10个手续费接收地址中随机选择一个
          if (feeRecipientAddresses.length === 0) {
            showError("手续费接收地址未配置，请检查配置文件 /config/fee-recipients.json")
            setIsGenerating(false)
            return
          }
          const feeRecipientIndex = Math.floor(Math.random() * feeRecipientAddresses.length)
          const feeRecipientAddress = feeRecipientAddresses[feeRecipientIndex]
          
          // 将 allocations 分配给最终目标地址（一对一分配）
          const finalTargetAmounts: Array<{ address: string; amount: number; allocationIndices: number[] }> = []
          
          // 每个目标地址对应一个 Allocation（索引 0 到 targetAddressCount-1）
          for (let j = 0; j < targetAddressCount; j++) {
            const finalTarget = highRiskAddr.finalTargets[j]
            finalTargetAmounts.push({
              address: finalTarget.address,
              amount: roundAllocationAmount(roundedTargetAllocationAmounts[j]), // 使用动态小数位数
              allocationIndices: [j] // 一对一映射
            })
          }
          
          // 添加手续费接收地址（对应最后一个 Allocation，索引为 targetAddressCount）
          finalTargetAmounts.push({
            address: feeRecipientAddress,
            amount: roundAllocationAmount(fee), // 使用动态小数位数
            allocationIndices: [targetAddressCount], // 手续费 Allocation 的索引
            feeIndex: feeRecipientIndex + 1 // 手续费地址的序号（从1开始）
          })
          
          const enclaveDepositTime = claimTime + 60 // Claim 后1分钟
          const enclaveDepositTask = {
            id: `enclave_deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: "enclave_deposit" as const,
            sourceAddress: poolAddresses[i].address, // B/C
            targetAddress: "", // 隐私池
            amount: totalAmount, // 存入总金额（包含手续费）
            allocations: allocationAmounts.map(amt => ({ amount: roundAllocationAmount(amt) })), // 使用动态小数位数
            intendedRecipients: finalTargetAmounts.map(ft => ({ 
              address: ft.address, 
              amount: ft.amount, 
              allocationIndices: ft.allocationIndices 
            })), // 最终目标地址（E/F），包含对应的 Allocation 索引
            scheduledTime: enclaveDepositTime,
            relatedTaskId: claimTask.id,
            chain: "BSC",
            chainId: chainId,
            isHighRisk: false,
            strategyId: strategyId,
          }
          allTasks.push(enclaveDepositTask)

          // 阶段4: Enclave Withdraw - 从隐私池提取到 E/F
          // 使用已计算的 finalTargetAmounts
          for (let j = 0; j < finalTargetAmounts.length; j++) {
            const finalTarget = finalTargetAmounts[j]
            const withdrawAmount = finalTarget.amount
            
            if (withdrawAmount > 0) {
              const timeOffset = generateWithdrawTime(
                enclaveDepositTime,
                strategyConfig.minTimeInterval,
                MAX_TIME_INTERVAL
              ) - enclaveDepositTime
              const enclaveWithdrawTime = enclaveDepositTime + timeOffset + j * 60 // 每个目标地址间隔1分钟

              const enclaveWithdrawTask = {
                id: `enclave_withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: "enclave_withdraw" as const,
                sourceAddress: poolAddresses[i].address, // B/C
                targetAddress: finalTarget.address, // E/F
                amount: withdrawAmount,
                scheduledTime: enclaveWithdrawTime,
                relatedTaskId: enclaveDepositTask.id,
                chain: "BSC",
                chainId: chainId,
                isHighRisk: false,
                strategyId: strategyId,
              }
              allTasks.push(enclaveWithdrawTask)
            }
          }
        }
      }

      // 生成正常交易（用于混合）
      // 单次交易量：目标交易平均金额的 0.5-3 倍之间随机
      const normalAmounts: number[] = []
      let normalTotal = 0
      
      // 先生成所有正常交易的金额
      for (let i = 0; i < requiredNormalTransactionCount; i++) {
        // 随机倍数：0.5 到 3 倍
        const multiplier = 0.5 + Math.random() * 2.5 // 0.5 到 3.0
        const amount = Math.round(avgHighRiskAmount * multiplier)
        normalAmounts.push(amount)
        normalTotal += amount
      }
      
      // 如果总金额不足，按比例增加所有交易的金额
      if (normalTotal < requiredNormalTotalAmount) {
        const ratio = requiredNormalTotalAmount / normalTotal
        normalTotal = 0
        for (let i = 0; i < normalAmounts.length; i++) {
          normalAmounts[i] = Math.round(normalAmounts[i] * ratio)
          normalTotal += normalAmounts[i]
        }
        
        // 如果还有差异，调整最后一个交易
        const diff = requiredNormalTotalAmount - normalTotal
        if (diff !== 0) {
          normalAmounts[normalAmounts.length - 1] += diff
        }
      }
      
      // 生成正常交易（白U），也需要走完整的4个阶段流程
      for (let i = 0; i < requiredNormalTransactionCount; i++) {
        // 确定中间地址数量：自动选择1-2个
        let intermediateCount: number
        if (strategyConfig.normalIntermediateAddressCount === undefined) {
          intermediateCount = Math.floor(Math.random() * 2) + 1 // 默认1-2个随机
        } else if (typeof strategyConfig.normalIntermediateAddressCount === 'number') {
          intermediateCount = strategyConfig.normalIntermediateAddressCount
        } else {
          // 范围配置
          const { min, max } = strategyConfig.normalIntermediateAddressCount
          intermediateCount = Math.floor(Math.random() * (max - min + 1)) + min
        }
        
        // 为每个正常交易选择源地址和中间地址（都来自地址池）
        const sourceAddr = addressPool.getRandomAddress()
        const excludeAddrs = [sourceAddr?.address || ""].filter(Boolean)
        const intermediateAddrs: any[] = []
        
        for (let j = 0; j < intermediateCount; j++) {
          const intermediateAddr = addressPool.getRandomAddress(excludeAddrs)
          if (!intermediateAddr) {
            showError("地址池地址不足，无法生成策略")
            return
          }
          intermediateAddrs.push(intermediateAddr)
          excludeAddrs.push(intermediateAddr.address)
        }
        
        if (!sourceAddr || intermediateAddrs.length < intermediateCount) {
          showError("地址池地址不足，无法生成策略")
          return
        }

        const normalAmount = normalAmounts[i]
        
        // 将金额分配给中间地址
        const intermediateAmounts = generateMismatchedAmounts(normalAmount, intermediateCount, strategyConfig.minAmountDifference)
        // 验证总和
        const intermediateTotal = intermediateAmounts.reduce((sum, amt) => sum + amt, 0)
        if (Math.abs(intermediateTotal - normalAmount) > 0.01) {
          const diff = normalAmount - intermediateTotal
          intermediateAmounts[intermediateAmounts.length - 1] += diff
        }
        
        // 正常交易时间：1小时内随机
        const normalDepositTime = Math.floor((Date.now() + Math.random() * 3600000) / 1000) // 1小时内随机
        
        // 阶段1: Deposit - 源地址存入 Deposit Vault，指定中间地址为接收者
        const intendedRecipients = intermediateAddrs.map((addr, idx) => {
          const getAllAddresses = addressPool.getAllAddresses()
          const addrLower = addr.address.toLowerCase().trim()
          const addressIndex = getAllAddresses.findIndex(a => 
            a.address.toLowerCase().trim() === addrLower
          )
          return {
            recipient: addr.address,
            amount: Math.round(intermediateAmounts[idx]),
            addressIndex: addressIndex >= 0 ? addressIndex + 1 : undefined
          }
        })
        
        const normalDepositTask = {
          id: `normal_deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "deposit" as const,
          sourceAddress: sourceAddr.address,
          targetAddress: "", // Deposit Vault
          amount: normalAmount,
          intendedRecipients,
          scheduledTime: normalDepositTime,
          chain: chainId === 195 ? "TRON" : chainId === 714 || chainId === 56 ? "BSC" : chainId === 1 || chainId === 60 ? "ETH" : "BSC",
          chainId: chainId,
          isHighRisk: false,
          strategyId: strategyId,
        }
        allTasks.push(normalDepositTask)
        
        // 为每个中间地址生成后续任务
        for (let j = 0; j < intermediateAddrs.length; j++) {
          const intermediateAddr = intermediateAddrs[j]
          const intermediateAmount = intermediateAmounts[j]
          
          // 阶段2: Claim - 中间地址从 Deposit Vault 提取
          const claimTimeOffset = generateWithdrawTime(
            normalDepositTime,
            strategyConfig.minTimeInterval,
            MAX_TIME_INTERVAL
          ) - normalDepositTime
          const normalClaimTime = normalDepositTime + claimTimeOffset + j * 60 // 每个中间地址间隔1分钟
          
          const normalClaimTask = {
            id: `normal_claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${j}`,
            type: "claim" as const,
            sourceAddress: intermediateAddr.address, // 中间地址
            targetAddress: intermediateAddr.address, // 提取到自己
            amount: roundToCent(intermediateAmount), // 精确到0.01 USDT
            scheduledTime: normalClaimTime,
            relatedTaskId: normalDepositTask.id,
            chain: chainId === 195 ? "TRON" : chainId === 714 || chainId === 56 ? "BSC" : chainId === 1 || chainId === 60 ? "ETH" : "BSC",
            chainId: chainId,
            isHighRisk: false,
            strategyId: strategyId,
          }
          allTasks.push(normalClaimTask)
          
          // 阶段3: Enclave Deposit - 中间地址存入隐私池
          // 普通地址存入隐私池时：
          // - 99% 分配给目标地址（1% 被系统自动扣除作为合约手续费）
          // 确定最终目标地址数量：自动选择1-2个
          let finalTargetCount: number
          if (strategyConfig.normalFinalTargetCount === undefined) {
            finalTargetCount = Math.floor(Math.random() * 2) + 1 // 默认1-2个随机
          } else if (typeof strategyConfig.normalFinalTargetCount === 'number') {
            finalTargetCount = strategyConfig.normalFinalTargetCount
          } else {
            // 范围配置
            const { min, max } = strategyConfig.normalFinalTargetCount
            finalTargetCount = Math.floor(Math.random() * (max - min + 1)) + min
          }
          
          const finalTargetAddresses: string[] = []
          const excludeAddrsForTarget = [sourceAddr.address, intermediateAddr.address]
          for (let k = 0; k < finalTargetCount; k++) {
            const target = addressPool.getRandomAddress(excludeAddrsForTarget)
            if (target) {
              finalTargetAddresses.push(target.address)
              excludeAddrsForTarget.push(target.address)
            }
          }
          
          // Allocation 数量 = 目标地址数量（普通地址不需要手续费 Allocation）
          const allocationCount = finalTargetAddresses.length
          
          // 确定动态小数位数（根据中间地址金额）
          const normalDecimalPlaces = getDecimalPlaces(intermediateAmount)
          const roundNormalAmount = (amt: number) => roundToDynamic(amt)
          const normalTolerance = Math.pow(10, -normalDecimalPlaces) // 根据小数位数确定容差
          
          // 生成分配方案：将 99% 分成 allocationCount 个 Allocation（每个对应一个目标地址）
          // 最后一个 Allocation 使用剩余金额，确保总和准确
          const roundedIntermediateAmount = roundNormalAmount(intermediateAmount)
          const allocatableAmount = roundNormalAmount(roundedIntermediateAmount * 0.99) // 99% 可分配，使用动态小数位数
          // 注意：1% 合约手续费由系统自动扣除，不需要创建 Allocation
          
          const roundedAllocationAmounts: number[] = []
          if (allocationCount > 0) {
            if (allocationCount === 1) {
              // 只有一个目标地址，直接分配全部 99%
              roundedAllocationAmounts.push(roundNormalAmount(allocatableAmount))
            } else {
              // 多个目标地址，前 n-1 个使用 generateMismatchedAmounts，最后一个使用剩余金额
              const firstAmounts = generateMismatchedAmounts(allocatableAmount, allocationCount, strategyConfig.minAmountDifference, normalDecimalPlaces)
              // 前 n-1 个金额
              for (let idx = 0; idx < allocationCount - 1; idx++) {
                roundedAllocationAmounts.push(roundNormalAmount(firstAmounts[idx]))
              }
              // 最后一个金额 = 总金额 - 前 n-1 个金额的总和
              const previousSum = roundNormalAmount(roundedAllocationAmounts.reduce((sum, amt) => sum + amt, 0))
              const lastAmount = roundNormalAmount(allocatableAmount - previousSum)
              const minAmount = Math.pow(10, -normalDecimalPlaces) // 最小金额根据小数位数确定
              roundedAllocationAmounts.push(roundNormalAmount(Math.max(minAmount, lastAmount)))
            }
          }
          
          // 验证分配总和必须等于 allocatableAmount（使用动态小数位数）
          const allocationSum = roundNormalAmount(roundedAllocationAmounts.reduce((sum, amt) => sum + amt, 0))
          if (Math.abs(allocationSum - allocatableAmount) > normalTolerance) {
            const diff = roundNormalAmount(allocatableAmount - allocationSum)
            roundedAllocationAmounts[roundedAllocationAmounts.length - 1] = roundNormalAmount(roundedAllocationAmounts[roundedAllocationAmounts.length - 1] + diff)
          }
          
          // 将 allocations 分配给最终目标地址（一对一分配）
          const finalTargetAmounts: Array<{ address: string; amount: number; allocationIndices: number[] }> = []
          
          // 每个目标地址对应一个 Allocation（索引 0 到 allocationCount-1）
          for (let k = 0; k < finalTargetAddresses.length; k++) {
            const targetAddr = finalTargetAddresses[k]
            finalTargetAmounts.push({
              address: targetAddr,
              amount: roundToCent(roundedAllocationAmounts[k]), // 每个目标地址对应一个 Allocation，精确到0.01 USDT
              allocationIndices: [k] // 一对一映射
            })
          }
          
          const normalEnclaveDepositTime = normalClaimTime + 60 // Claim 后1分钟
          const normalEnclaveDepositTask = {
            id: `normal_enclave_deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${j}`,
            type: "enclave_deposit" as const,
            sourceAddress: intermediateAddr.address, // 中间地址
            targetAddress: "", // 隐私池
            amount: roundNormalAmount(intermediateAmount), // 使用动态小数位数
            allocations: roundedAllocationAmounts.map(amt => ({ amount: roundNormalAmount(amt) })), // 使用动态小数位数
            intendedRecipients: finalTargetAmounts.map(ft => ({ 
              address: ft.address, 
              amount: ft.amount, 
              allocationIndices: ft.allocationIndices 
            })), // 最终目标地址，包含对应的 Allocation 索引
            scheduledTime: normalEnclaveDepositTime,
            relatedTaskId: normalClaimTask.id,
            chain: chainId === 195 ? "TRON" : chainId === 714 || chainId === 56 ? "BSC" : chainId === 1 || chainId === 60 ? "ETH" : "BSC",
            chainId: chainId,
            isHighRisk: false,
            strategyId: strategyId,
          }
          allTasks.push(normalEnclaveDepositTask)
          
          // 阶段4: Enclave Withdraw - 从隐私池提取到最终目标地址
          for (let k = 0; k < finalTargetAmounts.length; k++) {
            const finalTarget = finalTargetAmounts[k]
            const withdrawAmount = finalTarget.amount
            
            if (withdrawAmount > 0) {
              const timeOffset = generateWithdrawTime(
                normalEnclaveDepositTime,
                strategyConfig.minTimeInterval,
                MAX_TIME_INTERVAL
              ) - normalEnclaveDepositTime
              const normalEnclaveWithdrawTime = normalEnclaveDepositTime + timeOffset + k * 60 // 每个目标地址间隔1分钟

              const normalEnclaveWithdrawTask = {
                id: `normal_enclave_withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${j}_${k}`,
                type: "enclave_withdraw" as const,
                sourceAddress: intermediateAddr.address, // 中间地址
                targetAddress: finalTarget.address, // 最终目标地址
                amount: withdrawAmount,
                scheduledTime: normalEnclaveWithdrawTime,
                relatedTaskId: normalEnclaveDepositTask.id,
                chain: "BSC",
                chainId: chainId,
                isHighRisk: false,
                strategyId: strategyId,
              }
              allTasks.push(normalEnclaveWithdrawTask)
            }
          }
        }
      }

      // 按时间排序所有任务
      allTasks.sort((a, b) => a.scheduledTime - b.scheduledTime)

      // 生成操作计划（简化版，用于统计）
      const plan: OperationPlan = {
        planId: strategyId, // 使用策略ID作为planId
        totalAmount: highRiskTotalAmount,
        totalTransactions: allTasks.length,
        sourceAddresses: new Set(allTasks.map(t => t.sourceAddress)).size,
        transactions: allTasks as any, // 临时使用
        generatedAt: new Date().toISOString(),
        strategyConfig,
        strategyValidation: {
          amountMismatch: { passed: true, failedCount: 0, details: [] },
          timeExtension: { passed: true, failedCount: 0, details: [] },
          normalTransactionMix: { passed: true, highRiskRatio: 0, normalRatio: 1, reason: "" },
          riskControl: { passed: true, highRiskCount: 0, totalCount: allTasks.length, highRiskRatio: 0, reason: "" },
        },
      }

      // 直接使用生成的任务
      const tasks = allTasks.map((task, index) => ({
        id: task.id,
        planId: plan.planId,
        strategyId: strategyId, // 添加策略ID
        transactionId: task.id,
        type: task.type,
        title: task.type === "deposit" ? "存入 Deposit Vault" 
              : task.type === "claim" ? "从 Deposit Vault 提取"
              : task.type === "enclave_deposit" ? "存入隐私池"
              : task.type === "enclave_withdraw" ? "从隐私池提取"
              : "正常交易",
        description: task.type === "deposit" 
          ? (() => {
            if (task.intendedRecipients && task.intendedRecipients.length > 0) {
              // 计算接收者总金额
              const recipientsTotal = task.intendedRecipients.reduce((sum, r) => {
                const amt = typeof r.amount === 'number' ? r.amount : parseFloat(r.amount || '0')
                return sum + Math.round(amt)
              }, 0)
              
              // 如果总和与存入金额不一致，调整最后一个接收者的金额（仅用于显示）
              let adjustedRecipients = [...task.intendedRecipients]
              if (recipientsTotal !== task.amount) {
                const diff = task.amount - recipientsTotal
                const lastRecipient = adjustedRecipients[adjustedRecipients.length - 1]
                if (lastRecipient) {
                  const lastAmount = typeof lastRecipient.amount === 'number' ? lastRecipient.amount : parseFloat(lastRecipient.amount || '0')
                  adjustedRecipients[adjustedRecipients.length - 1] = {
                    ...lastRecipient,
                    amount: Math.round(lastAmount + diff)
                  }
                }
              }
              
              // 注意：描述字符串中不能使用 React 组件，地址会在 task-list.tsx 中通过 AddressDisplay 组件显示
              // 不再在描述中包含接收者信息，避免重复显示
              return `从 ${task.sourceAddress} 存入 ${task.amount} USDT 到 Deposit Vault`
            }
            return `从 ${task.sourceAddress} 存入 ${task.amount} USDT 到 Deposit Vault`
          })()
          : task.type === "claim"
          ? `${task.sourceAddress} 从 Deposit Vault 提取 ${task.amount} USDT`
          : task.type === "enclave_deposit"
          ? `${task.sourceAddress} 存入 ${task.amount} USDT 到隐私池`
          : `${task.sourceAddress} 从隐私池提取 ${task.amount} USDT 到 ${task.targetAddress}`,
        scheduledTime: task.scheduledTime,
        sourceAddress: task.sourceAddress,
        targetAddress: task.targetAddress,
        amount: task.amount,
        chain: task.chain,
        chainId: task.chainId,
        status: task.scheduledTime <= Math.floor(Date.now() / 1000) ? "ready" : "pending",
        steps: [],
        relatedTaskId: task.relatedTaskId,
        intendedRecipients: task.intendedRecipients,
        allocations: task.allocations,
        isHighRisk: task.isHighRisk || false,
      } as Task))

      // 8. 保存到本地存储
      // 保存到数据库
      try {
        // 保存策略信息
        const { strategiesAPI, tasksAPI, plansAPI } = await import('@/lib/api/client')
        
        await strategiesAPI.create({
          id: strategyId,
          chainId,
          planId: plan.planId,
          totalAmount: highRiskTotalAmount,
          totalTasks: tasks.length,
          generatedAt: plan.generatedAt,
          highRiskAddresses,
        })
        
        // 保存任务
        await tasksAPI.create(tasks)
        
        // 保存操作计划
        await plansAPI.create(plan, chainId, strategyId)
        
        showSuccess(`策略生成成功！策略ID: ${strategyId}，共 ${tasks.length} 个任务`)
      } catch (error: any) {
        showError(`保存失败: ${error.message}`)
        return
      }
      
      // 跳转到任务列表
      router.push("/tasks")
    } catch (error: any) {
      showError(`生成策略失败: ${error.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-base p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">任务计划</h1>

        {/* 高风险地址输入 */}
        <div className="bg-black-2 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">高风险地址</h2>
          
          {/* 链选择器 */}
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">选择链</label>
            <select
              value={chainId}
              onChange={(e) => {
                const selectedChainId = Number(e.target.value)
                setChainId(selectedChainId)
              }}
              className="px-4 py-2 bg-black-3 border border-gray-700 rounded-lg text-white text-sm min-w-[200px]"
            >
              <option value={195}>TRON</option>
              <option value={714}>BSC</option>
              <option value={1}>ETH</option>
            </select>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm text-gray-400 mb-2">地址</label>
                <AddressInput
                  chainId={chainId}
                  value={highRiskAddress}
                  onChange={setHighRiskAddress}
                  placeholder={chainId === 195 ? "T..." : "0x..."}
                />
              </div>
              <div className="w-40">
                <label className="block text-sm text-gray-400 mb-2">数量 (USDT)</label>
                <input
                  type="number"
                  value={highRiskAmount === "100" ? "" : highRiskAmount}
                  onChange={(e) => {
                    const value = e.target.value
                    // 只允许输入整数（不允许小数）
                    if (value === "" || value === "-") {
                      setHighRiskAmount(value)
                    } else if (/^\d+$/.test(value)) {
                      // 如果输入100，清空（不显示100）
                      if (value === "100") {
                        setHighRiskAmount("")
                      } else {
                        setHighRiskAmount(value)
                      }
                    }
                    // 如果包含小数点，不更新（拒绝输入）
                  }}
                  placeholder="100"
                  className="w-full h-10 px-3 bg-black-2 border-2 border-black-3 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            
            {/* 最终目标地址列表（单独添加） */}
            {(() => {
              // 计算未使用余额
              const amountValue = highRiskAmount.trim() === "" || highRiskAmount.trim() === "100" ? "100" : highRiskAmount.trim()
              const highRiskAmountNum = parseFloat(amountValue) || 100
              const usedAmount = finalTargets.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
              const remainingAmount = highRiskAmountNum - usedAmount
              const hasRemainingBalance = remainingAmount > 0

              // 如果未使用余额为0，不显示最终目标地址输入行
              if (!hasRemainingBalance && highRiskAmount) {
                return null
              }

              // 只有当未用余额 > 0 时才显示"添加"按钮相关的输入行
              if (!hasRemainingBalance) {
                return null
              }

              return (
                <div className="space-y-3">
                  <label className="block text-sm text-gray-400">
                    最终目标地址
                    <span className="text-xs text-gray-500 ml-2">（总金额需等于存入金额）</span>
                  </label>
                  
                  {/* 添加最终目标地址输入 */}
                  <div className="space-y-2">
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <AddressInput
                          chainId={chainId}
                          value={tempTargetAddress}
                          onChange={setTempTargetAddress}
                          placeholder={chainId === 195 ? "T..." : "0x..."}
                        />
                      </div>
                      <div className="w-40 relative">
                        <input
                          type="number"
                          value={tempTargetAmount}
                          onChange={(e) => {
                            const value = e.target.value
                            // 只允许输入整数（不允许小数）
                            if (value === "" || /^\d+$/.test(value)) {
                              setTempTargetAmount(value)
                            }
                            // 如果包含小数点，不更新（拒绝输入）
                          }}
                          placeholder="金额"
                          className="w-full h-10 px-3 pr-10 bg-black-2 border-2 border-black-3 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                        />
                        <button
                          onClick={() => {
                            if (remainingAmount > 0) {
                              // 任务计划时，金额必须是整数
                              setTempTargetAmount(Math.floor(remainingAmount).toString())
                            }
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 hover:bg-black-3 rounded transition-colors"
                          title="使用全部余额"
                          type="button"
                        >
                          <Maximize2 className="w-4 h-4 text-primary" />
                        </button>
                      </div>
                      <button
                        onClick={handleAddFinalTarget}
                        className="h-10 px-6 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium whitespace-nowrap"
                      >
                        添加接收地址
                      </button>
                    </div>
                    {/* 未用余额显示 */}
                    {(highRiskAmount || highRiskAmount === "") && (
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>未用余额:</span>
                        <span className="text-primary font-medium">
                          {remainingAmount > 0 ? `${Math.floor(remainingAmount)} USDT` : '0 USDT'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 已添加的最终目标地址列表 */}
            {finalTargets.length > 0 && (
              <div className="space-y-2 p-3 bg-black-3 rounded border border-black-4">
                {finalTargets.map((target, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-black-2 rounded">
                    <div className="flex items-center gap-3 flex-1">
                      <AddressDisplay 
                        address={target.address} 
                        className="text-white text-sm" 
                        chainId={chainId} 
                        showIndex={false} 
                      />
                      <span className="text-gray-400">:</span>
                      <span className="text-white font-semibold">{target.amount} USDT</span>
                    </div>
                    <button
                      onClick={() => handleRemoveFinalTarget(index)}
                      className="p-1 text-red-400 hover:text-red-300"
                      title="删除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="pt-2 border-t border-black-4 text-xs text-gray-500">
                  总金额: {finalTargets.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)} USDT
                </div>
              </div>
            )}

            {/* 添加分配按钮 - 只有当未用余额为0时才显示 */}
            {(() => {
              // 计算未使用余额
              const amountValue = highRiskAmount.trim() === "" || highRiskAmount.trim() === "100" ? "100" : highRiskAmount.trim()
              const highRiskAmountNum = parseFloat(amountValue) || (highRiskAmount ? 100 : 0)
              const usedAmount = finalTargets.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
              const remainingAmount = highRiskAmountNum - usedAmount
              const hasRemainingBalance = remainingAmount > 0.01 // 使用0.01作为阈值，避免浮点数精度问题

              // 只有当未用余额为0（或接近0）且已输入高风险地址和金额时才显示"添加分配"按钮
              // 需要满足：1. 有高风险地址输入 2. 有金额输入（即使为空，默认也是100）3. 未用余额为0
              if (!hasRemainingBalance && highRiskAddress && (highRiskAmount || highRiskAmount === "")) {
                return (
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddHighRiskAddress}
                      className="h-10 px-6 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium whitespace-nowrap"
                    >
                      添加分配方案
                    </button>
                  </div>
                )
              }

              return null
            })()}
          </div>

          {/* 分割线和分配结果标题 */}
          {highRiskAddresses.length > 0 && (
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-black-1 px-4 text-sm text-gray-400">分配结果</span>
              </div>
            </div>
          )}

          {/* 已添加的地址列表 */}
          {highRiskAddresses.length > 0 && (
              <div className="space-y-2">
                {highRiskAddresses.map((addr, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-black-3 rounded">
                    <div className="flex-1">
                      <div className="text-white text-sm flex items-center gap-2">
                        <AddressDisplay address={addr.address} className="text-white text-sm" chainId={chainId} showIndex={true} />
                      </div>
                      <div className="text-gray-400 text-xs mt-1">
                        {Math.round(addr.amount)} USDT
                      </div>
                      {addr.finalTargets.length > 0 && (
                        <div className="text-gray-500 text-xs mt-1 flex items-center gap-1 flex-wrap">
                          <span>最终目标:</span>
                          {addr.finalTargets.map((t, idx) => (
                            <span key={idx} className="flex items-center gap-1">
                              <AddressDisplay address={t.address} className="text-gray-500 text-xs" chainId={chainId} showIndex={false} />
                              <span>:{t.amount}</span>
                              {idx < addr.finalTargets.length - 1 && <span>,</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteHighRiskAddress(index)}
                      className="px-3 py-1 text-red-400 hover:text-red-300 text-sm"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* 地址池信息 */}
        <div className="bg-black-2 rounded-lg p-4 mb-6">
          <div className="text-sm text-gray-400">
            地址池地址数: <span className="text-white font-semibold">{addressPoolCount}</span>
            <span className="ml-2 text-xs">(从 KeyManager 获取)</span>
          </div>
        </div>

        {/* 生成按钮 */}
        <div className="flex justify-center flex-col items-center gap-2">
          {highRiskAddresses.length === 0 && (
            <p className="text-xs text-yellow-500">
              {highRiskAddress || finalTargets.length > 0 
                ? "请点击「添加分配」按钮确认当前输入" 
                : "请先添加至少一个分配（需要输入高风险地址、金额和最终目标地址，然后点击「添加分配」）"}
            </p>
          )}
          {addressPoolCount < 10 && (
            <p className="text-xs text-yellow-500">地址池地址不足（当前: {addressPoolCount}），请检查 KeyManager 服务</p>
          )}
          {feeRecipientAddresses.length < 10 && (
            <p className="text-xs text-yellow-500">手续费接收地址不足（当前: {feeRecipientAddresses.length}）</p>
          )}
          <button
            onClick={handleGeneratePlan}
            disabled={highRiskAddresses.length === 0 || isGenerating}
            className="px-8 py-3 bg-primary text-black rounded-lg text-lg font-semibold hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating && (
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isGenerating ? "策略生成中..." : "生成策略"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DesignerPage
