"use client"

import { useState, useEffect } from "react"
import SvgIcon from "@/components/ui/SvgIcon"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { parseToWei, formatFromWei, formatAmountForDisplay } from "@/lib/utils/amount-calculator"
import { useTranslation } from "@/lib/hooks/use-translation"

interface VoucherAllocationProps {
  totalAmount: number // 可分配金额（allocatableAmount）
  originalAmount?: number // 原始总额（depositAmount/grossAmount），用于计算5%
  actualFee?: number // 实际手续费（feeTotalLocked），用于计算不足缺失部分
  onGenerate: (vouchers: Array<{ id: string; amount: number }>) => Promise<void>
  onClose?: () => void
}

type AllocationMethod = "average" | "random" | "custom"
type GenerateStatus = "idle" | "generating" | "success" | "error"

export default function VoucherAllocation({
  totalAmount,
  originalAmount,
  actualFee,
  onGenerate,
  onClose,
}: VoucherAllocationProps) {
  const { t } = useTranslation()
  const [quantity, setQuantity] = useState(3)
  const [method, setMethod] = useState<AllocationMethod>("average")
  const [customAmounts, setCustomAmounts] = useState<string[]>([])
  const [randomAmountsWei, setRandomAmountsWei] = useState<string[]>([]) // 存储 wei 格式
  const [showWarningDialog, setShowWarningDialog] = useState(false)
  const [warningMessage, setWarningMessage] = useState("")
  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [progress, setProgress] = useState(0)

  // 计算固定扣除和不足缺失部分
  // 如果提供了 originalAmount，使用新的分配逻辑（动态扣除：5% - 已扣除百分比）
  // 否则使用旧的逻辑（直接分配 totalAmount）
  const useNewAllocationLogic = originalAmount !== undefined && originalAmount > 0
  
  // 实际手续费金额（如果提供了）
  // 注意：这个手续费会在链上扣除，不作为凭证
  const feeAmount = useNewAllocationLogic && actualFee !== undefined ? actualFee : 0
  
  // 固定基础手续费：1 USDT（固定值，不算在5%里面）
  const baseFee = 1.0
  
  // 计算已扣除的百分比（不包括固定的基础费用）
  // 已扣除百分比 = (actualFee - baseFee) / originalAmount
  // 如果 actualFee <= baseFee，则已扣除百分比为 0
  const deductedPercent = useNewAllocationLogic && actualFee !== undefined && originalAmount > 0
    ? Math.max(0, (actualFee - baseFee) / originalAmount)
    : 0
  
  // 目标扣除比例：5%
  const targetReservedPercent = 0.05
  
  // 计算实际固定扣除 = 5% - 已扣除百分比（不包括固定的基础费用）
  // 如果已扣除百分比 >= 5%，则固定扣除为 0
  const actualReservedPercent = Math.max(0, targetReservedPercent - deductedPercent)
  const reservedAmount = useNewAllocationLogic ? originalAmount * actualReservedPercent : 0
  
  // 可分配金额：直接使用传入的 totalAmount（这是后端计算好的 allocatableAmount）
  // 注意：totalAmount 是后端计算的可分配金额，它应该已经扣除了所有费用
  // 但是，固定扣除凭证应该包含在 totalAmount 中，所以：
  // - 用户凭证可分配金额 = totalAmount - reservedAmount（固定扣除）
  // - 固定扣除凭证 = reservedAmount
  // - 总和 = 用户凭证总和 + reservedAmount = totalAmount
  const allocatableAmount = totalAmount
  
  // 用户凭证可分配金额 = 总可分配金额 - 固定扣除凭证
  // 使用 BigInt 计算，避免 number 类型的精度损失
  const allocatableAmountWei = parseToWei(allocatableAmount, 18)
  const reservedAmountWei = useNewAllocationLogic ? parseToWei(reservedAmount, 18) : 0n
  const userAllocatableAmountWei = useNewAllocationLogic 
    ? (allocatableAmountWei > reservedAmountWei ? allocatableAmountWei - reservedAmountWei : 0n)
    : allocatableAmountWei
  // 转换回 number 用于显示（仅在需要时）
  const userAllocatableAmount = parseFloat(formatFromWei(userAllocatableAmountWei, 18))
  
  // 验证：确保 reservedAmount 不超过 totalAmount
  // 如果超过，说明计算有问题，需要调整
  if (useNewAllocationLogic && reservedAmount > allocatableAmount) {
    console.warn('[VoucherAllocation] 固定扣除金额超过可分配金额，调整固定扣除', {
      reservedAmount,
      allocatableAmount,
      originalAmount,
      actualFee,
      deductedPercent,
      actualReservedPercent,
    })
    // 如果固定扣除超过可分配金额，将固定扣除设为可分配金额，用户凭证为0
    // 这种情况不应该发生，但为了安全起见，我们处理它
  }
  
  // 计算剩余部分 = 实际固定扣除 - 实际手续费（如果固定扣除 > 手续费，剩余部分作为单独凭证，未来人工提取）
  // 注意：如果已扣除百分比 >= 5%，则 reservedAmount = 0，remainingAmount 也为 0
  const remainingAmount = useNewAllocationLogic && actualFee !== undefined 
    ? Math.max(0, reservedAmount - actualFee) 
    : 0
  
  // 调试信息：打印分配计算详情（在 remainingAmount 定义之后）
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && useNewAllocationLogic) {
    console.log('[VoucherAllocation] 分配计算详情:', {
      totalAmount: allocatableAmount,
      originalAmount,
      actualFee,
      baseFee,
      deductedPercent: (deductedPercent * 100).toFixed(2) + '%',
      actualReservedPercent: (actualReservedPercent * 100).toFixed(2) + '%',
      reservedAmount,
      userAllocatableAmount,
      remainingAmount,
    })
  }
  
  // 是否显示剩余部分凭证
  const showRemainingVoucher = useNewAllocationLogic && remainingAmount > 0

  // 数据配置
  const methods = [
    { key: "average", label: t("voucher.allocationMethod.average"), icon: "/icons/columns.svg" },
    { key: "random", label: t("voucher.allocationMethod.random"), icon: "/icons/dice.svg" },
    { key: "custom", label: t("voucher.allocationMethod.custom"), icon: "/icons/gear-person.svg" },
  ]

  // 计算平均分配金额（使用精确计算，返回 wei 格式字符串数组）
  // 新逻辑：动态扣除（5% - 已扣除百分比），剩余部分分配给N个凭证，不足缺失部分作为第N+1个凭证
  // 旧逻辑：直接分配 totalAmount 给N个凭证
  const calculateAverageAmounts = (): string[] => {
    if (quantity === 0) return []
    
    const amountsWei: bigint[] = []
    
    if (useNewAllocationLogic) {
      // 新逻辑：分配 userAllocatableAmount 给 quantity 个凭证，然后添加固定扣除凭证
      // userAllocatableAmount = totalAmount - reservedAmount（固定扣除）
      // 直接使用 BigInt 计算，避免精度损失
      const quantityBigInt = BigInt(quantity)
      
      // 计算每个凭证的平均金额（wei）
      const averageWei = quantityBigInt > 0n ? userAllocatableAmountWei / quantityBigInt : 0n
      
      // 前 n-1 个凭证使用平均金额
      for (let i = 0; i < quantity - 1; i++) {
        amountsWei.push(averageWei)
      }
      
      // 最后一个用户凭证 = userAllocatableAmount - 前n-1个凭证的总和（确保精度，避免总和超过可分配金额）
      const previousTotalWei = amountsWei.reduce((sum, wei) => sum + wei, 0n)
      const lastAmountWei = userAllocatableAmountWei - previousTotalWei
      // 确保最后一个凭证不为负数
      amountsWei.push(lastAmountWei < 0n ? 0n : lastAmountWei)
      
      // 添加固定扣除凭证（动态计算：5% - 已扣除百分比，作为一个凭证）
      const reservedWei = parseToWei(reservedAmount, 18)
      amountsWei.push(reservedWei)
      
      // 添加剩余部分作为最后一个凭证（5% - 链上手续费，未来人工提取）
      // 注意：手续费（0.98%）会在链上扣除，不作为凭证
      if (remainingAmount > 0) {
        const remainingWei = parseToWei(remainingAmount, 18)
        amountsWei.push(remainingWei)
      }
    } else {
      // 旧逻辑：直接分配 totalAmount
      const totalWei = parseToWei(totalAmount, 18)
      const quantityBigInt = BigInt(quantity)
      
      // 计算每个凭证的平均金额（wei）
      const averageWei = totalWei / quantityBigInt
      
      // 前 n-1 个凭证使用平均金额
      for (let i = 0; i < quantity - 1; i++) {
        amountsWei.push(averageWei)
      }
      
      // 最后一个凭证 = 总数量 - 前n-1个凭证的总和（确保精度，避免总和超过可分配金额）
      const previousTotalWei = amountsWei.reduce((sum, wei) => sum + wei, 0n)
      const lastAmountWei = totalWei - previousTotalWei
      // 确保最后一个凭证不为负数
      amountsWei.push(lastAmountWei < 0n ? 0n : lastAmountWei)
    }
    
    // 返回 wei 格式的字符串数组
    return amountsWei.map(wei => wei.toString())
  }
  
  const averageAmountsWei = calculateAverageAmounts()

  // 简单的伪随机数生成器（基于固定种子，返回 0-1 之间的浮点数）
  // 注意：这个函数只用于生成随机比例，实际的金额计算使用 BigInt
  const simpleRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  
  // 在 BigInt 范围内生成随机数（返回 0 到 maxWei 之间的随机 BigInt）
  const randomBigInt = (maxWei: bigint, seed: number): bigint => {
    if (maxWei <= 0n) return 0n
    // 使用简单随机数生成器生成 0-1 之间的值
    const randomValue = simpleRandom(seed)
    // 将随机值转换为 BigInt（乘以 maxWei，然后取整）
    // 为了保持精度，我们使用字符串操作
    const maxWeiStr = maxWei.toString()
    const maxWeiLength = maxWeiStr.length
    // 将随机值转换为字符串，取足够的小数位
    const randomStr = randomValue.toFixed(18)
    // 计算 randomValue * maxWei
    // 使用更简单的方法：将 maxWei 乘以一个大的随机整数，然后除以 1e18
    const randomMultiplier = BigInt(Math.floor(randomValue * 1e18))
    return (maxWei * randomMultiplier) / BigInt(1e18)
  }

  // 生成随机金额（使用精确计算，返回 wei 格式字符串数组）
  // 新逻辑：动态扣除（5% - 已扣除百分比），剩余部分分配给N个凭证，不足缺失部分作为第N+1个凭证
  // 旧逻辑：直接分配 totalAmount 给N个凭证
  const generateRandomAmounts = (): string[] => {
    const amountsWei: bigint[] = []

    // 如果数量为0，返回空数组
    if (quantity === 0) {
      return []
    }

    if (useNewAllocationLogic) {
      // 新逻辑：分配 userAllocatableAmount 给 quantity 个凭证，然后添加固定扣除凭证
      // userAllocatableAmount = totalAmount - reservedAmount（固定扣除）
      // 直接使用 BigInt 计算，避免精度损失
      // 确保 userAllocatableAmount 不为负数
      if (userAllocatableAmountWei < 0n) {
        console.warn('[generateRandomAmounts] userAllocatableAmount 为负数，设为0')
        return []
      }
      let remainingWei = userAllocatableAmountWei
      // 使用时间戳作为种子，确保每次生成都不同
      const seed = Date.now() + quantity * 1000 + Math.floor(userAllocatableAmount * 100)

      // 使用循环生成随机金额
      for (let i = 0; i < quantity; i++) {
        if (i === quantity - 1) {
          // 最后一个用户凭证，使用剩余金额（确保总和精确等于 userAllocatableAmount）
          // 确保 remainingWei 不为负数，并且不超过 userAllocatableAmountWei
          const lastAmount = remainingWei < 0n ? 0n : (remainingWei > userAllocatableAmountWei ? userAllocatableAmountWei : remainingWei)
          amountsWei.push(lastAmount)
        } else {
          // 确保每个凭证至少有最小金额（0.0001 USDT = 10^14 wei）
          const minWei = parseToWei(0.0001, 18)
          const maxWei = remainingWei - (BigInt(quantity - i - 1) * minWei)
          
          if (maxWei <= 0n) {
            // 如果剩余金额不足，使用最小金额（但不超过剩余金额）
            const actualAmount = remainingWei < minWei ? (remainingWei > 0n ? remainingWei : 0n) : minWei
            amountsWei.push(actualAmount)
            remainingWei -= actualAmount
          } else {
            // 在 minWei 和 maxWei 之间随机（使用 BigInt 计算）
            const rangeWei = maxWei - minWei
            const randomWei = minWei + randomBigInt(rangeWei, seed + i)
            // 确保 randomWei 不超过 remainingWei
            const actualRandomWei = randomWei > remainingWei ? remainingWei : randomWei
            amountsWei.push(actualRandomWei)
            remainingWei -= actualRandomWei
            // 确保 remainingWei 不会变成负数
            if (remainingWei < 0n) {
              remainingWei = 0n
            }
          }
        }
      }
      
      // 添加固定扣除凭证（动态计算：5% - 已扣除百分比，作为一个凭证）
      const reservedWei = parseToWei(reservedAmount, 18)
      amountsWei.push(reservedWei)
      
      // 添加剩余部分作为最后一个凭证（固定扣除 - 实际手续费，未来人工提取）
      // 注意：实际手续费会在链上扣除，不作为凭证
      if (remainingAmount > 0) {
        const remainingWei = parseToWei(remainingAmount, 18)
        amountsWei.push(remainingWei)
      }
    } else {
      // 旧逻辑：直接分配 totalAmount
    const totalWei = parseToWei(totalAmount, 18)
    let remainingWei = totalWei
    // 使用时间戳作为种子，确保每次生成都不同
    const seed = Date.now() + quantity * 1000 + Math.floor(totalAmount * 100)

    // 使用循环生成随机金额
    for (let i = 0; i < quantity; i++) {
      if (i === quantity - 1) {
        // 最后一个凭证，使用剩余金额（确保总和精确等于 totalAmount）
        // 确保 remainingWei 不为负数
        amountsWei.push(remainingWei < 0n ? 0n : remainingWei)
      } else {
        // 确保每个凭证至少有最小金额（0.0001 USDT = 10^14 wei）
        const minWei = parseToWei(0.0001, 18)
        const maxWei = remainingWei - (BigInt(quantity - i - 1) * minWei)
        
        if (maxWei <= 0n) {
          // 如果剩余金额不足，使用最小金额（但不超过剩余金额）
          const actualAmount = remainingWei < minWei ? (remainingWei > 0n ? remainingWei : 0n) : minWei
          amountsWei.push(actualAmount)
          remainingWei -= actualAmount
        } else {
          // 在 minWei 和 maxWei 之间随机（使用 BigInt 计算）
          const rangeWei = maxWei - minWei
          const randomWei = minWei + randomBigInt(rangeWei, seed + i)
          amountsWei.push(randomWei)
          remainingWei -= randomWei
          // 确保 remainingWei 不会变成负数
          if (remainingWei < 0n) {
            remainingWei = 0n
          }
        }
      }
    }
    }

    // 返回 wei 格式的字符串数组
    return amountsWei.map(wei => wei.toString())
  }

  // 处理随机金额按钮点击
  const handleRandomClick = () => {
    if (quantity === 0) return
    const newRandomAmountsWei = generateRandomAmounts()
    setRandomAmountsWei(newRandomAmountsWei)
    setMethod("random")
  }

  // 获取当前金额（wei 格式字符串数组）
  // 新逻辑：返回 quantity + 1 个凭证（包括不足缺失部分）
  // 旧逻辑：返回 quantity 个凭证
  const getAmountsWei = (): string[] => {
    if (quantity === 0) return []

    switch (method) {
      case "average":
        // 使用精确计算的平均分配
        // averageAmountsWei 已经包含了不足缺失部分（如果使用新逻辑）
        return averageAmountsWei
      case "random":
        // 如果已经有生成的随机金额，使用它们；否则生成新的
        // generateRandomAmounts 已经包含了不足缺失部分（如果使用新逻辑）
        if (useNewAllocationLogic) {
          // 新逻辑：需要检查长度是否包含固定扣除凭证和剩余部分凭证
          let expectedLength = quantity + 1 // +1 是固定扣除凭证
          if (remainingAmount > 0) expectedLength += 1 // +1 是剩余部分凭证
          if (randomAmountsWei.length === expectedLength) {
            return randomAmountsWei
          }
        } else {
          // 旧逻辑：只检查 quantity
        if (randomAmountsWei.length === quantity) {
          return randomAmountsWei
          }
        }
        return generateRandomAmounts()
      case "custom":
        // 使用循环处理自定义金额
        const customAmountsWei: bigint[] = []
        if (useNewAllocationLogic) {
          // 新逻辑：分配 userAllocatableAmount 给 quantity 个凭证，然后添加固定扣除凭证
          // userAllocatableAmount = totalAmount - reservedAmount（固定扣除）
          // 直接使用 BigInt 计算，避免精度损失
          let previousTotalWei = 0n
          for (let i = 0; i < quantity; i++) {
            if (i === quantity - 1) {
              // 最后一个用户凭证：userAllocatableAmount - 前n-1个凭证的总和（确保总和不超过可分配金额）
              const lastAmountWei = userAllocatableAmountWei - previousTotalWei
              // 确保最后一个凭证不为负数，如果前n-1个凭证总和已超过，设为0
              customAmountsWei.push(lastAmountWei < 0n ? 0n : lastAmountWei)
            } else {
              const customAmount = customAmounts[i] || '0'
              const customAmountWei = parseToWei(customAmount, 18)
              // 如果当前凭证加上之前的总和已经超过用户可分配金额，限制为剩余金额
              const remainingWei = userAllocatableAmountWei - previousTotalWei
              if (customAmountWei > remainingWei) {
                // 限制为剩余金额，确保总和不超过
                customAmountsWei.push(remainingWei > 0n ? remainingWei : 0n)
                previousTotalWei += (remainingWei > 0n ? remainingWei : 0n)
              } else {
                customAmountsWei.push(customAmountWei)
                previousTotalWei += customAmountWei
              }
            }
          }
          // 添加固定扣除凭证（动态计算：5% - 已扣除百分比，作为一个凭证）
          const reservedWei = parseToWei(reservedAmount, 18)
          customAmountsWei.push(reservedWei)
          
          // 添加剩余部分作为最后一个凭证（固定扣除 - 实际手续费，未来人工提取）
          // 注意：实际手续费会在链上扣除，不作为凭证
          if (remainingAmount > 0) {
            const remainingWei = parseToWei(remainingAmount, 18)
            customAmountsWei.push(remainingWei)
          }
        } else {
          // 旧逻辑：直接分配 totalAmount
          const totalWei = parseToWei(totalAmount, 18)
          let previousTotalWei = 0n
          for (let i = 0; i < quantity; i++) {
            if (i === quantity - 1) {
              // 最后一个凭证：总数量 - 前n-1个凭证的总和（确保总和不超过可分配金额）
              const lastAmountWei = totalWei - previousTotalWei
              // 确保最后一个凭证不为负数，如果前n-1个凭证总和已超过，设为0
              customAmountsWei.push(lastAmountWei < 0n ? 0n : lastAmountWei)
            } else {
              const customAmount = customAmounts[i] || '0'
              const customAmountWei = parseToWei(customAmount, 18)
              // 如果当前凭证加上之前的总和已经超过可分配金额，限制为剩余金额
              const remainingWei = totalWei - previousTotalWei
              if (customAmountWei > remainingWei) {
                // 限制为剩余金额，确保总和不超过
                customAmountsWei.push(remainingWei > 0n ? remainingWei : 0n)
                previousTotalWei += (remainingWei > 0n ? remainingWei : 0n)
              } else {
                customAmountsWei.push(customAmountWei)
                previousTotalWei += customAmountWei
              }
            }
          }
        }
        return customAmountsWei.map(wei => wei.toString())
      default:
        return []
    }
  }

  // 获取当前显示的金额（用于显示，转换为可读格式）
  const getDisplayAmounts = (): number[] => {
    const amountsWei = getAmountsWei()
    return amountsWei.map(weiStr => {
      const wei = BigInt(weiStr)
      // 使用 formatFromWei 获取字符串，然后转换为 number（仅用于显示）
      // 注意：这里会有精度损失，但仅用于 UI 显示
      const amountStr = formatFromWei(wei, 18)
      return parseFloat(amountStr)
    })
  }

  // 计算当前总金额（wei 格式，用于精确比较）
  const getCurrentTotalWei = (): bigint => {
    const amountsWei = getAmountsWei()
    return amountsWei.reduce((sum, weiStr) => sum + BigInt(weiStr), 0n)
  }

  // 当数量改变且当前是随机模式时，重新生成随机金额
  useEffect(() => {
    if (method === "random" && quantity > 0) {
      const newRandomAmountsWei = generateRandomAmounts()
      setRandomAmountsWei(newRandomAmountsWei)
    } else if (method === "random" && quantity === 0) {
      setRandomAmountsWei([])
    }
  }, [quantity])

  // 处理自定义金额变化
  const handleCustomAmountChange = (index: number, value: string) => {
    const newAmounts = [...customAmounts]
    newAmounts[index] = value
    setCustomAmounts(newAmounts)
  }

  // 生成凭证
  const handleGenerate = async () => {
    // 如果数量为0，不生成凭证
    if (quantity === 0) {
      return
    }

    const amountsWei = getAmountsWei()
    // 验证总金额应该等于 totalAmount（可分配金额）
    // totalAmount 是后端计算好的可分配金额，包括所有凭证（用户凭证 + 固定扣除凭证 + 剩余部分凭证）
    const expectedTotal = totalAmount
    const expectedTotalWei = parseToWei(expectedTotal, 18)
    const currentTotalWei = getCurrentTotalWei()

    // 验证总金额（使用 BigInt 精确比较）
    if (currentTotalWei > expectedTotalWei) {
      // 总金额大于预期总额，按钮应该已经失效
      return
    }

    if (currentTotalWei < expectedTotalWei) {
      // 总金额小于预期总额，弹出对话框
      const diffWei = expectedTotalWei - currentTotalWei
      const currentTotalReadable = formatFromWei(currentTotalWei, 18)
      const totalReadable = formatFromWei(expectedTotalWei, 18)
      const diffReadable = formatFromWei(diffWei, 18)
      
      // 调试信息：打印精度误差详情
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.warn('[VoucherAllocation] 检测到精度误差:', {
          currentTotalWei: currentTotalWei.toString(),
          expectedTotalWei: expectedTotalWei.toString(),
          diffWei: diffWei.toString(),
          currentTotalReadable,
          totalReadable,
          diffReadable,
          'diffWei (wei)': diffWei.toString(),
          'diffReadable (原始)': diffReadable,
          'diffReadable (格式化4位)': formatAmountForDisplay(diffReadable, 4),
        })
      }
      
      // 所有金额统一使用 6 位小数显示
      setWarningMessage(
        t("voucher.insufficientAmountWarning", {
          currentTotal: formatAmountForDisplay(currentTotalReadable, 6),
          total: formatAmountForDisplay(totalReadable, 6),
          remaining: formatAmountForDisplay(diffReadable, 6),
        })
      )
      setShowWarningDialog(true)
      return
    }

    // 总金额等于 allocatableAmount，直接生成
    const vouchers: Array<{ id: string; amount: number }> = []

    // 使用循环生成凭证数组（转换为可读格式）
    for (let i = 0; i < amountsWei.length; i++) {
      const wei = BigInt(amountsWei[i])
      const amountReadable = parseFloat(formatFromWei(wei, 18))
      vouchers.push({
        id: `voucher-${i + 1}`,
        amount: amountReadable,
      })
    }

    // 设置生成状态
    setGenerateStatus("generating")
    setProgress(0)
    setErrorMessage("")

    try {
      // 模拟进度更新
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return 90
          return prev + 2
        })
      }, 200)

      await onGenerate(vouchers)

      clearInterval(progressInterval)
      setProgress(100)
      setGenerateStatus("success")

      // 2秒后自动关闭
      setTimeout(() => {
        onClose?.()
      }, 2000)
    } catch (error) {
      setGenerateStatus("error")
      setErrorMessage(error instanceof Error ? error.message : t("voucher.generationFailed"))
    }
  }

  // 确认生成凭证（即使金额不足）
  const handleConfirmGenerate = async () => {
    setShowWarningDialog(false)
    const amountsWei = getAmountsWei()
    const vouchers: Array<{ id: string; amount: number }> = []

    // 使用循环生成凭证数组（转换为可读格式）
    for (let i = 0; i < amountsWei.length; i++) {
      const wei = BigInt(amountsWei[i])
      const amountReadable = parseFloat(formatFromWei(wei, 18))
      vouchers.push({
        id: `voucher-${i + 1}`,
        amount: amountReadable,
      })
    }

    // 设置生成状态
    setGenerateStatus("generating")
    setProgress(0)
    setErrorMessage("")

    try {
      // 模拟进度更新
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return 90
          return prev + 2
        })
      }, 200)

      await onGenerate(vouchers)

      clearInterval(progressInterval)
      setProgress(100)
      setGenerateStatus("success")

      // 2秒后自动关闭
      setTimeout(() => {
        onClose?.()
      }, 2000)
    } catch (error) {
      setGenerateStatus("error")
      setErrorMessage(error instanceof Error ? error.message : t("voucher.generationFailed"))
    }
  }

  // 验证金额是否有效（用于按钮状态，使用 BigInt 精确比较）
  const isValidAmounts = () => {
    // 调试信息：打印验证条件
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const expectedTotalWei = parseToWei(totalAmount, 18)
      const currentTotalWei = getCurrentTotalWei()
      const amountsWei = getAmountsWei()
      const displayAmounts = amountsWei.map(weiStr => formatFromWei(BigInt(weiStr), 18))
      
      console.log('[VoucherAllocation] 验证条件检查:', {
        '条件1: quantity > 0': quantity > 0,
        quantity,
        '条件2: 总金额 <= 可分配金额': currentTotalWei <= expectedTotalWei,
        currentTotalWei: currentTotalWei.toString(),
        expectedTotalWei: expectedTotalWei.toString(),
        currentTotal: formatFromWei(currentTotalWei, 18),
        expectedTotal: formatFromWei(expectedTotalWei, 18),
        method,
        amountsWei: amountsWei.length,
        displayAmounts,
        userAllocatableAmount: useNewAllocationLogic ? userAllocatableAmount : undefined,
        reservedAmount: useNewAllocationLogic ? reservedAmount : undefined,
        remainingAmount: useNewAllocationLogic ? remainingAmount : undefined,
      })
    }
    
    if (quantity === 0) {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('[VoucherAllocation] 验证失败：quantity 为 0')
      }
      return false
    }

    // 验证总金额应该等于 totalAmount（可分配金额）
    // totalAmount 是后端计算好的可分配金额，包括所有凭证（用户凭证 + 固定扣除凭证）
    const expectedTotal = totalAmount
    const expectedTotalWei = parseToWei(expectedTotal, 18)
    const currentTotalWei = getCurrentTotalWei()

    // 如果总金额大于预期总额，按钮失效
    if (currentTotalWei > expectedTotalWei) {
      // 调试信息：打印验证失败的详细信息
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        const amountsWei = getAmountsWei()
        const displayAmounts = amountsWei.map(weiStr => formatFromWei(BigInt(weiStr), 18))
        console.warn('[VoucherAllocation] 验证失败：总金额超过可分配金额', {
          currentTotalWei: currentTotalWei.toString(),
          expectedTotalWei: expectedTotalWei.toString(),
          currentTotal: formatFromWei(currentTotalWei, 18),
          expectedTotal: formatFromWei(expectedTotalWei, 18),
          method,
          quantity,
          amountsWei: amountsWei.length,
          displayAmounts,
          userAllocatableAmount: useNewAllocationLogic ? userAllocatableAmount : undefined,
          reservedAmount: useNewAllocationLogic ? reservedAmount : undefined,
          remainingAmount: useNewAllocationLogic ? remainingAmount : undefined,
        })
      }
      return false
    }

    // 对于自定义模式，需要额外验证
    if (method === "custom") {
      let totalWei = 0n

      // 使用循环验证自定义金额（使用 BigInt）
      // 验证前 quantity - 1 个凭证（最后一个会自动调整）
      // 允许留空（视为0），只要总和不超过可分配金额即可
      const validationCount = quantity - 1
      for (let i = 0; i < validationCount; i++) {
        const amountStr = customAmounts[i] || '0'
        // 允许留空，留空时视为0
        if (amountStr === '' || amountStr === '0') {
          continue
        }
        const amountWei = parseToWei(amountStr, 18)
        // 如果输入的值小于等于0，跳过（视为0）
        if (amountWei <= 0n) {
          continue
        }
        totalWei += amountWei
      }

      // 检查前 n-1 个凭证的总和是否超过用户可分配金额（不包括固定扣除）
      // 如果超过，最后一个凭证会被设为0，但总和仍然会超过，所以这里需要严格检查
      const maxAmountWei = parseToWei(useNewAllocationLogic ? userAllocatableAmount : totalAmount, 18)
      if (totalWei >= maxAmountWei) {
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.warn('[VoucherAllocation] 自定义模式验证失败：前 n-1 个凭证总和超过用户可分配金额', {
            totalWei: totalWei.toString(),
            maxAmountWei: maxAmountWei.toString(),
            totalWeiDisplay: formatFromWei(totalWei, 18),
            maxAmountWeiDisplay: formatFromWei(maxAmountWei, 18),
            validationCount,
            customAmounts: customAmounts.slice(0, validationCount),
            userAllocatableAmount: useNewAllocationLogic ? userAllocatableAmount : undefined,
          })
        }
        return false
      }

      // 还需要检查实际分配的总和（包括自动调整的最后一个凭证和固定扣除凭证）是否超过
      // 通过 getCurrentTotalWei 获取实际总和
      const actualTotalWei = getCurrentTotalWei()
      const expectedTotalWei = parseToWei(totalAmount, 18)
      
      // 实际总和不能超过预期总额（可分配金额）
      if (actualTotalWei > expectedTotalWei) {
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          const amountsWei = getAmountsWei()
          const displayAmounts = amountsWei.map(weiStr => formatFromWei(BigInt(weiStr), 18))
          console.warn('[VoucherAllocation] 自定义模式验证失败：实际总和超过可分配金额', {
            actualTotalWei: actualTotalWei.toString(),
            expectedTotalWei: expectedTotalWei.toString(),
            actualTotalDisplay: formatFromWei(actualTotalWei, 18),
            expectedTotalDisplay: formatFromWei(expectedTotalWei, 18),
            amountsWei: amountsWei.length,
            displayAmounts,
            reservedAmount: useNewAllocationLogic ? reservedAmount : undefined,
            remainingAmount: useNewAllocationLogic ? remainingAmount : undefined,
          })
        }
        return false
      }

      // 如果前 n-1 个凭证都留空，最后一个凭证会自动使用全部可分配金额，这是允许的
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('[VoucherAllocation] 自定义模式验证通过')
      }
      return true
    }

    // 所有验证通过
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[VoucherAllocation] 验证通过（非自定义模式）')
    }
    return true
  }

  const displayAmounts = getDisplayAmounts()
  
  // 调试信息：打印按钮启用状态
  const isValid = isValidAmounts()
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[VoucherAllocation] 按钮启用状态:', {
      isValid,
      quantity,
      method,
      '按钮应该': isValid ? '启用' : '禁用',
    })
  }

  return (
    <div className="px-6 py-2 space-y-6 relative">
      {/* 标题和关闭按钮 */}
      <div className="flex items-center justify-between">
        <h2 className="text-black-9">{t("deposit.allocateVoucher")}</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-black-3 rounded transition-colors"
            aria-label={t("common.close")}
          >
            <SvgIcon
              src="/icons/common-close.svg"
              className="w-5 h-5 text-black-9"
            />
          </button>
        )}
      </div>

      {/* 可分配总金额 */}
      <div className="flex justify-between items-center bg-black-2 rounded-lg p-4 border border-black-3">
        <span className="text-black-9">{t("voucher.allocatableTotalAmount")}</span>
        <span className="text-white font-medium">
          {totalAmount.toFixed(3)}USDT
        </span>
      </div>

      {/* 分配数量 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-white">{t("voucher.allocationQuantity")}</div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setQuantity(Math.max(0, quantity - 1))}
            className="px-3 py-2 shrink-0 rounded-[14px] border border-black-3 flex items-center justify-center text-white bg-black-2 transition-colors"
          >
            <SvgIcon src="/icons/sub.svg" className="w-5 h-5" />
          </button>
          <div className="flex-1 bg-black-1 border-2 h-9 border-primary rounded-[12px] px-4 text-center">
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                const value = parseInt(e.target.value)
                if (!isNaN(value) && value >= 1 && value <= 10) {
                  setQuantity(value)
                } else if (e.target.value === "") {
                  setQuantity(0)
                }
              }}
              className="w-full h-full text-white text-lg font-bold focus:outline-none text-center bg-transparent"
              min={1}
              max={10}
              className="text-main"
            />
          </div>
          <button
            onClick={() => setQuantity(Math.min(10, Math.max(1, quantity + 1)))}
            className="px-3 py-2 shrink-0 rounded-[14px] border border-black-3 flex items-center justify-center text-white bg-black-2 transition-colors"
          >
            <SvgIcon src="/icons/add.svg" className="w-5 h-5" />
          </button>
        </div>
        {/* 分配方式图标按钮 - 在标题右侧 */}
        <div className="flex gap-2">
            {methods.map((methodItem) => {
              const isSelected = method === methodItem.key
              return (
                <button
                  key={methodItem.key}
                  onClick={() => {
                    if (methodItem.key === "random") {
                      handleRandomClick()
                    } else {
                      setMethod(methodItem.key as AllocationMethod)
                    }
                  }}
                  className={`flex-1 p-2 rounded-[14px] flex items-center text-sm justify-center transition-colors ${
                    isSelected
                      ? "bg-primary text-black"
                      : "bg-black-3 text-white hover:bg-black-4"
                  }`}
                  title={methodItem.label}
                  aria-label={methodItem.label}
                >
                  {/* <SvgIcon 
                    src={methodItem.icon} 
                    className={`w-5 h-5 ${isSelected ? 'text-black' : 'text-white'}`}
                    monochrome={true}
                  /> */}
                  {methodItem.label}
                </button>
              )
            })}
          </div>
      </div>

      {/* 凭证预览 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-white">{t("voucher.voucherPreview")}</span>
          <span className="text-white text-xs px-2 py-0.5 border border-black-3 rounded-[6px]">
            {(() => {
              if (!useNewAllocationLogic) return quantity
              let total = quantity + 1 // +1 是固定扣除凭证
              if (remainingAmount > 0) total += 1 // +1 是剩余部分凭证
              return total
            })()}
          </span>
        </div>

        <div className="space-y-3">
          {Array.from({ length: (() => {
            if (!useNewAllocationLogic) return quantity
            let total = quantity + 1 // +1 是固定扣除凭证
            if (remainingAmount > 0) total += 1 // +1 是剩余部分凭证
            return total
          })() }, (_, index) => {
            // 判断凭证类型
            const userVoucherCount = quantity
            const isReservedVoucher = useNewAllocationLogic && index === userVoucherCount // 固定扣除凭证
            const isRemainingVoucher = useNewAllocationLogic && remainingAmount > 0 && index === userVoucherCount + 1 // 剩余部分凭证
            return (
            <div
              key={index}
              className={`border rounded-lg p-4 h-12 flex items-center justify-between transition-all ${
                method === "custom"
                  ? "border-primary bg-black-2/50"
                  : "border-black-3 bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                {method === "custom" ? null : (
                  <SvgIcon
                    src="/icons/voucher.svg"
                    className="w-4 h-4 transition-all text-black-9"
                  />
                )}

                <span className="text-white">
                  {isReservedVoucher
                    ? useNewAllocationLogic && originalAmount > 0
                      ? `固定扣除（${(actualReservedPercent * 100).toFixed(2)}%）`
                      : (t("voucher.reservedVoucher") || "固定扣除（5%）")
                    : isRemainingVoucher
                    ? t("voucher.remainingVoucher") || "剩余部分（人工提取）"
                    : `${t("voucher.voucher")} ${index + 1}`
                  }
                </span>
              </div>

              {method === "custom" ? (
                <div className="flex items-center gap-2">
                  {(index === quantity - 1 && !isReservedVoucher && !isRemainingVoucher) || isReservedVoucher || isRemainingVoucher ? (
                    // 最后一个分配凭证、5%凭证或剩余部分凭证：显示自动计算的值
                    <span className="text-white font-medium text-right">
                      {displayAmounts[index]?.toFixed(4) || "0.0000"}USDT
                      <span className="text-xs text-black-9 ml-1">{t("voucher.auto")}</span>
                    </span>
                  ) : (
                    <input
                      type="number"
                      value={customAmounts[index] || ""}
                      onChange={(e) =>
                        handleCustomAmountChange(index, e.target.value)
                      }
                      placeholder={t("voucher.enterAllocationAmount")}
                      className="border-none px-3 py-1.5 text-white text-right transition-all focus:outline-none"
                      step="0.0001"
                      min="0"
                    />
                  )}
                </div>
              ) : (
                <span className="text-white font-medium">
                  {displayAmounts[index]?.toFixed(4)}USDT
                  {isReservedVoucher && (
                    <span className="text-xs text-black-9 ml-1">
                      ({useNewAllocationLogic && originalAmount > 0 
                        ? `固定扣除${(actualReservedPercent * 100).toFixed(2)}%` 
                        : (t("voucher.reserved") || "固定扣除5%")})
                    </span>
                  )}
                  {isRemainingVoucher && (
                    <span className="text-xs text-black-9 ml-1">({t("voucher.remaining") || "剩余部分，人工提取"})</span>
                  )}
                </span>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {/* 生成凭证按钮 */}
      <div className="flex justify-center">
        <button
          onClick={handleGenerate}
          disabled={!isValidAmounts() || generateStatus === "generating"}
          className={`w-[230px] h-9 rounded-[14px] text-sm font-medium transition-colors ${
            isValidAmounts() && generateStatus !== "generating"
              ? "bg-primary text-black"
              : "bg-black-3 text-black-9 cursor-not-allowed"
          }`}
        >
          {generateStatus === "generating" ? t("voucher.generating") : t("voucher.generateVoucher")}
        </button>
      </div>

      {/* 生成进度覆盖层 */}
      {generateStatus !== "idle" && (
        <div className="absolute inset-0 bg-black-1/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-50 rounded-xl">
          {/* 加载动画 */}
          <div className="relative w-40 h-40 mb-8">
            {/* 装饰圆点 */}
            {generateStatus === "generating" && [...Array(8)].map((_, i) => {
              const angle = (i * 45) * Math.PI / 180
              const radius = 60
              const x = Math.cos(angle) * radius
              const y = Math.sin(angle) * radius
              
              return (
                <div
                  key={i}
                  className="absolute w-2 h-2 bg-primary rounded-[20%] animate-pulse"
                  style={{
                    left: `50%`,
                    top: `50%`,
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                    animationDelay: `${i * 0.2}s`
                  }}
                />
              )
            })}
            
            {/* 主圆形加载器 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-20 h-20 bg-primary rounded-[20%] flex items-center justify-center ${
                generateStatus === "generating" ? 'animate-pulse shadow-lg shadow-primary/30' : ''
              }`}>
                <div className="w-8 h-6 bg-black rounded-lg flex items-center justify-center">
                  {generateStatus === "success" ? (
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-primary"
                    >
                      <path 
                        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" 
                        fill="currentColor"
                      />
                    </svg>
                  ) : generateStatus === "error" ? (
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-red-500"
                    >
                      <path 
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" 
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-primary"
                    >
                      <path 
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" 
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 进度条 */}
          <div className="w-64 mb-4">
            <div className="w-full h-2 bg-black-3 rounded-[20%] overflow-hidden">
              <div 
                className={`h-full transition-all duration-100 ease-out rounded-[20%] ${
                  generateStatus === 'success' ? 'bg-green-500' : 
                  generateStatus === 'error' ? 'bg-red-500' : 
                  'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* 状态文本 */}
          <h2 className="text-lg font-medium text-main mb-4">
            {generateStatus === "generating" && t("voucher.generating")}
            {generateStatus === "success" && t("voucher.generated")}
            {generateStatus === "error" && t("voucher.generationFailed")}
          </h2>

          {/* 错误信息 */}
          {generateStatus === "error" && errorMessage && (
            <div className="w-full max-w-md mb-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-sm text-red-400 break-all">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}

          {/* 关闭按钮（成功或失败时） */}
          {(generateStatus === "success" || generateStatus === "error") && (
            <button
              onClick={() => {
                if (generateStatus === "success") {
                  onClose?.()
                } else {
                  setGenerateStatus("idle")
                  setProgress(0)
                  setErrorMessage("")
                }
              }}
              className="w-[230px] h-9 bg-primary text-black rounded-[14px] font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              {generateStatus === "success" ? t("common.complete") : t("common.retry")}
            </button>
          )}
        </div>
      )}

      {/* 警告对话框 */}
      <BottomSheet
        isOpen={showWarningDialog}
        onClose={() => setShowWarningDialog(false)}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        closeOnEscape={true}
        className="bg-black-2"
      >
        <div className="p-6 space-y-4">
          {/* 标题和关闭按钮 */}
          <div className="flex items-center justify-between">
            <h2 className="text-black-9">{t("voucher.insufficientAmountTitle")}</h2>
            <button
              onClick={() => setShowWarningDialog(false)}
              className="p-1 hover:bg-black-3 rounded transition-colors"
              aria-label={t("common.close")}
            >
              <SvgIcon
                src="/icons/common-close.svg"
                className="w-5 h-5 text-black-9"
              />
            </button>
          </div>
          
          <p className="text-white text-sm leading-relaxed">{warningMessage}</p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowWarningDialog(false)}
              className="flex-1 py-2 border border-primary text-primary rounded-[14px] transition-colors hover:bg-primary/10"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleConfirmGenerate}
              className="flex-1 py-2 bg-primary text-black rounded-[14px] transition-colors hover:bg-primary/90"
            >
              {t("voucher.continueGenerate")}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
