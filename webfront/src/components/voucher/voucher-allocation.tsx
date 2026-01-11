"use client"

import { useState, useEffect } from "react"
import SvgIcon from "@/components/ui/SvgIcon"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { parseToWei, formatFromWei, formatAmountForDisplay } from "@/lib/utils/amount-calculator"
import { useTranslation } from "@/lib/hooks/use-translation"

interface VoucherAllocationProps {
  totalAmount: number
  onGenerate: (vouchers: Array<{ id: string; amount: number }>) => Promise<void>
  onClose?: () => void
}

type AllocationMethod = "average" | "random" | "custom"
type GenerateStatus = "idle" | "generating" | "success" | "error"

export default function VoucherAllocation({
  totalAmount,
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

  // 数据配置
  const methods = [
    { key: "average", label: t("voucher.allocationMethod.average"), icon: "/icons/columns.svg" },
    { key: "random", label: t("voucher.allocationMethod.random"), icon: "/icons/dice.svg" },
    { key: "custom", label: t("voucher.allocationMethod.custom"), icon: "/icons/gear-person.svg" },
  ]

  // 计算平均分配金额（使用精确计算，返回 wei 格式字符串数组）
  // 注意：最后一个凭证会使用剩余金额，确保总和精确等于 totalAmount
  const calculateAverageAmounts = (): string[] => {
    if (quantity === 0) return []
    
    const amountsWei: bigint[] = []
    const totalWei = parseToWei(totalAmount, 18)
    const quantityBigInt = BigInt(quantity)
    
    // 计算每个凭证的平均金额（wei）
    const averageWei = totalWei / quantityBigInt
    
    // 前 n-1 个凭证使用平均金额
    for (let i = 0; i < quantity - 1; i++) {
      amountsWei.push(averageWei)
    }
    
    // 最后一个凭证 = 总数量 - 前n-1个凭证的总和（确保精度）
    const previousTotalWei = amountsWei.reduce((sum, wei) => sum + wei, 0n)
    const lastAmountWei = totalWei - previousTotalWei
    amountsWei.push(lastAmountWei)
    
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

  // 生成随机金额（使用精确计算，返回 wei 格式字符串数组，最后一个凭证 = 总数量 - 前n-1个凭证的总和）
  const generateRandomAmounts = (): string[] => {
    const amountsWei: bigint[] = []

    // 如果数量为0，返回空数组
    if (quantity === 0) {
      return []
    }

    const totalWei = parseToWei(totalAmount, 18)
    let remainingWei = totalWei
    // 使用时间戳作为种子，确保每次生成都不同
    const seed = Date.now() + quantity * 1000 + Math.floor(totalAmount * 100)

    // 使用循环生成随机金额
    for (let i = 0; i < quantity; i++) {
      if (i === quantity - 1) {
        // 最后一个凭证，使用剩余金额（确保总和精确等于 totalAmount）
        amountsWei.push(remainingWei)
      } else {
        // 确保每个凭证至少有最小金额（0.0001 USDT = 10^14 wei）
        const minWei = parseToWei(0.0001, 18)
        const maxWei = remainingWei - (BigInt(quantity - i - 1) * minWei)
        
        if (maxWei <= 0n) {
          // 如果剩余金额不足，使用最小金额
          amountsWei.push(minWei)
          remainingWei -= minWei
        } else {
          // 在 minWei 和 maxWei 之间随机（使用 BigInt 计算）
          const rangeWei = maxWei - minWei
          const randomWei = minWei + randomBigInt(rangeWei, seed + i)
          amountsWei.push(randomWei)
          remainingWei -= randomWei
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
  const getAmountsWei = (): string[] => {
    if (quantity === 0) return []

    switch (method) {
      case "average":
        // 使用精确计算的平均分配（最后一个凭证 = 总数量 - 前n-1个凭证的总和）
        return averageAmountsWei.slice(0, quantity)
      case "random":
        // 如果已经有生成的随机金额，使用它们；否则生成新的
        if (randomAmountsWei.length === quantity) {
          return randomAmountsWei
        }
        return generateRandomAmounts()
      case "custom":
        // 使用循环处理自定义金额
        // 最后一个凭证自动调整为：总数量 - 前n-1个凭证的总和（确保精度）
        const customAmountsWei: bigint[] = []
        for (let i = 0; i < quantity; i++) {
          if (i === quantity - 1) {
            // 最后一个凭证：总数量 - 前n-1个凭证的总和
            const totalWei = parseToWei(totalAmount, 18)
            const previousTotalWei = customAmountsWei.reduce((sum, wei) => sum + wei, 0n)
            const lastAmountWei = totalWei - previousTotalWei
            customAmountsWei.push(lastAmountWei < 0n ? 0n : lastAmountWei) // 确保不为负数
          } else {
            const customAmount = customAmounts[i] || '0'
            const customAmountWei = parseToWei(customAmount, 18)
            customAmountsWei.push(customAmountWei)
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
    const totalWei = parseToWei(totalAmount, 18)
    const currentTotalWei = getCurrentTotalWei()

    // 验证总金额（使用 BigInt 精确比较）
    if (currentTotalWei > totalWei) {
      // 总金额大于 allocatableAmount，按钮应该已经失效
      return
    }

    if (currentTotalWei < totalWei) {
      // 总金额小于 allocatableAmount，弹出对话框
      const diffWei = totalWei - currentTotalWei
      const currentTotalReadable = formatFromWei(currentTotalWei, 18)
      const totalReadable = formatFromWei(totalWei, 18)
      const diffReadable = formatFromWei(diffWei, 18)
      // 使用 formatAmountForDisplay 格式化显示，避免 parseFloat 精度问题
      setWarningMessage(
        t("voucher.insufficientAmountWarning", {
          currentTotal: formatAmountForDisplay(currentTotalReadable, 4),
          total: formatAmountForDisplay(totalReadable, 4),
          remaining: formatAmountForDisplay(diffReadable, 4),
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
    if (quantity === 0) return false

    const totalWei = parseToWei(totalAmount, 18)
    const currentTotalWei = getCurrentTotalWei()

    // 如果总金额大于 allocatableAmount，按钮失效
    if (currentTotalWei > totalWei) {
      return false
    }

    // 对于自定义模式，需要额外验证
    if (method === "custom") {
      let totalWei = 0n
      let allPositive = true

      // 使用循环验证自定义金额（使用 BigInt）
      for (let i = 0; i < quantity - 1; i++) {
        const amountStr = customAmounts[i] || '0'
        if (amountStr === '' || amountStr === '0') {
          allPositive = false
          break
        }
        const amountWei = parseToWei(amountStr, 18)
        if (amountWei <= 0n) {
          allPositive = false
          break
        }
        totalWei += amountWei
      }

      // 检查总和是否超过 totalAmount
      if (totalWei >= parseToWei(totalAmount, 18)) {
        return false
      }

      return allPositive
    }

    return true
  }

  const displayAmounts = getDisplayAmounts()

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
            {quantity}
          </span>
        </div>

        <div className="space-y-3">
          {Array.from({ length: quantity }, (_, index) => (
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

                <span className="text-white">{t("voucher.voucher")} {index + 1}</span>
              </div>

              {method === "custom" ? (
                <div className="flex items-center gap-2">
                  {index === quantity - 1 ? (
                    // 最后一个凭证：显示自动计算的值（总数量 - 前n-1个凭证的总和）
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
                </span>
              )}
            </div>
          ))}
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
