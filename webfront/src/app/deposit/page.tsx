"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { observer } from "mobx-react-lite"
import SvgIcon from "@/components/ui/SvgIcon"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useBottomSheet } from "@/hooks/use-bottom-sheet"
import VoucherAllocation from "@/components/voucher/voucher-allocation"
import DepositRecord, { DepositRecordData } from "@/components/deposit/deposit-record"
import { VoucherGeneratingSheet } from "@/components/deposit/voucher-generating-sheet"
import { useCheckbooksDataObserver } from "@/lib/hooks/use-checkbooks-data"
import { useAllocationsDataObserver } from "@/lib/hooks/use-allocations-data"
import { useDepositActions } from "@/lib/hooks/use-deposit-actions"
import { useTreasuryDeposit } from "@/lib/hooks/use-treasury-deposit"
import { useWalletConnection } from "@/lib/hooks/use-wallet-connection"
import { useWalletBalance } from "@/lib/hooks/use-wallet-balance"
import { useSDKStore } from "@/lib/stores/sdk-store"
import { useWallet as useSDKWallet } from "@enclave-hq/wallet-sdk/react"
import { getSlip44FromChainId } from "@enclave-hq/sdk"
import type { AssociateAddressResponse, FeeInfoData } from "@enclave-hq/sdk"
import { useTranslation } from "@/lib/hooks/use-translation"
import Pagination from "@/components/ui/pagination"
import { useToast } from "@/components/providers/toast-provider"
import { useRiskFeeInfo } from "@/lib/hooks/use-risk-fee-info"
import { getUSDTDecimals, parseUSDTAmount } from "@/lib/utils/token-decimals"
import { parseToWei, formatFromWei, formatAmountForDisplay } from "@/lib/utils/amount-calculator"
import { AddressRankDisplayer } from "@/components/ui/address-rank-displayer"

function DepositPage() {
  const { address, isConnected, chainId } = useWalletConnection()
  const { walletManager } = useSDKWallet()
  const { t } = useTranslation()
  const { showError, showWarning } = useToast()
  const { all: checkbooks, fetchList: fetchCheckbooks } = useCheckbooksDataObserver()
  const { all: allocations, byCheckbookId } = useAllocationsDataObserver()
  const { createCommitment, resubmitCommitment, loading: isCreatingCommitment } = useDepositActions()
  const { deposit: depositToTreasury, approveToken, getAllowance, loading: isDepositing } = useTreasuryDeposit()
  const sdkStore = useSDKStore()
  const { 
    riskFeeInfo, 
    lastQueryTime,
    metadata: riskFeeMetadata,
    loading: isFetchingRiskFee, 
    error: riskFeeError, 
    rateLimitError,
    fetchRiskFeeInfo,
    updateRiskFeeInfo,
    clearError: clearRiskFeeError
  } = useRiskFeeInfo()
  
  const [depositAmount, setDepositAmount] = useState("100.00")
  const [promoCode, setPromoCode] = useState("")
  const [currentInvitationCode, setCurrentInvitationCode] = useState<string | null>(null)
  const [isBindingInvitationCode, setIsBindingInvitationCode] = useState(false)
  const [isLoadingInvitationCode, setIsLoadingInvitationCode] = useState(false)
  const [isPromoExpanded, setIsPromoExpanded] = useState(false)
  const [isRiskFeeExpanded, setIsRiskFeeExpanded] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [txHash, setTxHash] = useState("")
  // 正在处理中的交易列表（用于在列表中显示"存入中"状态）
  const [pendingTransactions, setPendingTransactions] = useState<Array<{
    txHash: string
    amount: string
    timestamp: number
  }>>([])
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authorizedAmount, setAuthorizedAmount] = useState("0.00")
  const [isLoadingAllowance, setIsLoadingAllowance] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // 弹窗倒计时状态
  const [processingCountdown, setProcessingCountdown] = useState(15)
  const [isAutoClosing, setIsAutoClosing] = useState(true)
  const countdownInitializedRef = useRef(false)
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isOpenRef = useRef(false)
  const isAutoClosingRef = useRef(true)
  const countdownStartTimeRef = useRef<number | null>(null)
  // 用于跟踪已处理的 matchedTxHashes，避免重复更新
  const processedTxHashesRef = useRef<Set<string>>(new Set())
  
  // 进度条状态
  const [progressPercent, setProgressPercent] = useState(0)
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(8)
  const [pagination, setPagination] = useState<{
    page: number
    size: number
    total: number
    pages: number
  } | null>(null)

  // 加载 Checkbooks 数据（只有在 SDK 连接后才加载）
  useEffect(() => {
    if (!sdkStore.sdk || !isConnected || !address) {
      return
    }

    // 确保使用最新的 address，避免使用闭包中的旧值
    const currentAddress = address

    // 使用 SDK 获取数据（SDK 会使用 JWT token 中的地址）
    fetchCheckbooks({ 
      deleted: isDeleted,
      page: currentPage,
      limit: pageSize
    }).then(result => {
      // 验证返回的数据是否属于当前账户
      const resultAddress = result.checkbooks?.[0]?.owner || result.checkbooks?.[0]?.owner_address
      if (result.checkbooks.length > 0 && resultAddress && resultAddress.toLowerCase() !== currentAddress.toLowerCase()) {
        console.warn('⚠️ [useEffect] 返回的数据不属于当前账户，忽略结果', {
          expected: currentAddress,
          received: resultAddress
        })
        return
      }

      // Store 已经保存了数据，只需要保存分页信息
      if (result.pagination) {
        const paginationData = {
          page: result.pagination.page || currentPage,
          size: result.pagination.limit || result.pagination.size || pageSize,
          total: result.pagination.total || 0,
          pages: result.pagination.totalPages || result.pagination.pages || 1
        }
        setPagination(paginationData)
      } else {
        console.warn('⚠️ [useEffect] 未收到分页信息')
      }
    }).catch(err => {
      console.error('❌ [useEffect] 加载存款记录失败:', err)
    })
  }, [isConnected, address, fetchCheckbooks, sdkStore.sdk, isDeleted, currentPage, pageSize])

  // 将 Checkbooks 转换为 DepositRecordData 格式
  // 直接使用 Store 中的数据（Store 在分页查询时会清空并只保留当前页数据）
  // 同时合并正在处理中的交易（pending transactions）
  const depositRecords = useMemo(() => {
    // 标准化哈希格式：统一转换为小写，去除 0x 前缀（如果有）
    const normalizeHash = (hash: string): string => {
      if (!hash) return ''
      return hash.toLowerCase().replace(/^0x/, '')
    }
    
    // 获取已匹配的 txHash（已创建 checkbook 的交易）
    const matchedTxHashes = new Set(
      checkbooks
        .map((cb: any) => {
          const hash = cb.depositTxHash || (cb as any).deposit_tx_hash || (cb as any).deposit_transaction_hash
          return hash ? normalizeHash(hash) : null
        })
        .filter(Boolean)
    )
    
    // 过滤掉已匹配的 pending transactions
    // 同时检查标准化后的哈希是否匹配
    const activePendingTransactions = pendingTransactions.filter((pending) => {
      if (!pending.txHash) return true
      const normalizedPendingHash = normalizeHash(pending.txHash)
      return !matchedTxHashes.has(normalizedPendingHash)
    })
    
    // 将 pending transactions 转换为 DepositRecordData 格式
    const pendingRecords: DepositRecordData[] = activePendingTransactions.map((pending) => {
      const amount = parseFloat(pending.amount) || 0
      return {
        id: `pending-${pending.txHash}`, // 使用临时 ID
        depositId: pending.txHash.slice(0, 10) + '...', // 显示交易哈希的前10位
        originalAmount: amount,
        receivableAmount: 0, // 处理中，暂无数据
        feeAmount: 0, // 处理中，暂无数据
        status: "未分配" as const,
        statusText: t('deposit.depositing'),
        statusType: "processing" as const,
        buttonText: t('deposit.depositing'),
        buttonEnabled: false,
        date: new Date(pending.timestamp).toLocaleString('zh-CN'),
        checkbookStatus: 'pending',
        canAllocate: false,
      }
    })
    
    // 将 checkbooks 转换为 DepositRecordData 格式
    const checkbookRecords = checkbooks.map((checkbook: any) => {
      // 优先使用 checkbook.allocations（后端已返回），如果没有则使用 byCheckbookId
      const checkbookAllocations = (checkbook.allocations && checkbook.allocations.length > 0) 
        ? checkbook.allocations 
        : (byCheckbookId.get(checkbook.id) || [])
      const hasAllocations = checkbookAllocations.length > 0
      
      // 计算金额（根据实际 SDK 数据结构）
      // 注意：后端返回snake_case，SDK的getCheckbookById会转换为camelCase
      // 但listCheckbooks可能没有转换，所以需要同时支持两种格式
      // 使用 ?? 替代 ||，确保 decimals 为 0 时也能正确处理
      const rawDecimals = checkbook.token?.decimals ?? 18
      // 确保 decimals 至少为 1，避免 formatFromWei 返回原始值
      const decimals = rawDecimals > 0 ? rawDecimals : 18
      
      // 原存入USDT：使用depositAmount或grossAmount（camelCase）或gross_amount（snake_case）
      const originalAmountValue = checkbook.depositAmount || 
                                  checkbook.grossAmount || 
                                  (checkbook as any).gross_amount || 
                                  (checkbook as any).amount || 
                                  '0'
      // 可获得USDT：使用allocatableAmount（camelCase）或allocatable_amount（snake_case）
      const allocatableAmount = checkbook.allocatableAmount || 
                                (checkbook as any).allocatable_amount || 
                                '0'
      // 手续费：使用feeTotalLocked（camelCase）或fee_total_locked（snake_case）
      const feeTotalLocked = checkbook.feeTotalLocked || 
                             (checkbook as any).fee_total_locked || 
                             '0'
      
      // 安全的金额转换函数
      const safeFormatFromWei = (value: string | number | undefined | null, decimals: number): string => {
        try {
          // 转换为字符串并清理
          const valueStr = String(value || '0').trim()
          
          // 如果为空或无效，直接返回 '0'
          if (!valueStr || valueStr === '' || valueStr === '-' || valueStr === '0') {
            return '0'
          }
          
          // 检查是否已经是可读格式（包含小数点）
          if (valueStr.includes('.')) {
            // 如果包含小数点，可能是已经是可读格式，直接返回（但需要验证）
            const parsed = parseFloat(valueStr)
            if (!isNaN(parsed) && isFinite(parsed) && parsed >= 0 && parsed < 1e12) {
              // 看起来像是合理的可读格式，直接返回
              return valueStr
            }
            // 如果看起来不合理，尝试作为 wei 处理（取整数部分）
            const integerPart = valueStr.split('.')[0]
            if (!integerPart || integerPart === '') {
              return '0'
            }
            const weiValue = BigInt(integerPart)
            return formatFromWei(weiValue, decimals)
          }
          
          // 验证是否为有效数字字符串
          if (isNaN(Number(valueStr))) {
            console.warn('无效的金额值:', valueStr)
            return '0'
          }
          
          // 转换为 BigInt（wei 格式应该是整数）
          let weiValue: bigint
          try {
            weiValue = BigInt(valueStr)
          } catch (e) {
            console.warn('无法转换为 BigInt:', valueStr)
            return '0'
          }
          
          // 确保 decimals 有效（至少为 1）
          const validDecimals = decimals > 0 ? decimals : 18
          
          // 使用 formatFromWei 转换
          const result = formatFromWei(weiValue, validDecimals)
          
          // 验证转换结果是否合理
          const parsed = parseFloat(result)
          if (isNaN(parsed) || !isFinite(parsed)) {
            console.warn('转换结果无效:', result, { valueStr, decimals: validDecimals })
            return '0'
          }
          
          // 如果结果异常大（可能是未转换的 wei 值），尝试使用 18 decimals 重新转换
          if (parsed > 1e12) {
            console.warn('转换结果异常大，尝试使用 decimals=18 重新转换:', parsed, { valueStr, decimals: validDecimals })
            if (validDecimals !== 18) {
              const retryResult = formatFromWei(weiValue, 18)
              const retryParsed = parseFloat(retryResult)
              if (retryParsed <= 1e12 && retryParsed >= 0) {
                console.warn('使用 decimals=18 重新转换成功:', retryResult)
                return retryResult
              }
              // 如果还是很大，可能是数据本身有问题
              console.error('转换结果仍然异常大，可能数据格式错误:', retryParsed, { valueStr, decimals: validDecimals })
              return '0'
            } else {
              // 如果已经是 18 decimals 还是很大，可能是数据本身有问题
              console.error('转换结果异常大，可能数据格式错误:', parsed, { valueStr, decimals: validDecimals })
              return '0'
            }
          }
          
          // 确保结果不为负数
          if (parsed < 0) {
            console.warn('转换结果为负数:', parsed)
            return '0'
          }
          
          return result
        } catch (error) {
          console.error('金额转换失败:', error, { value, decimals })
          return '0'
        }
      }
      
      // 使用 formatFromWei 精确转换，避免浮点数精度问题
      // 直接使用字符串，只在需要 number 类型时转换（用于向后兼容）
      const originalAmountStr = safeFormatFromWei(originalAmountValue, decimals)
      const receivableAmountStr = safeFormatFromWei(allocatableAmount, decimals)
      const feeAmountStr = safeFormatFromWei(feeTotalLocked, decimals)
      
      // 转换为 number 仅用于向后兼容（DepositRecordData 接口要求）
      // 注意：这里会有精度损失，但仅用于显示
      const originalAmount = isNaN(parseFloat(originalAmountStr)) ? 0 : parseFloat(originalAmountStr)
      const receivableAmount = isNaN(parseFloat(receivableAmountStr)) ? 0 : parseFloat(receivableAmountStr)
      const feeAmount = isNaN(parseFloat(feeAmountStr)) ? 0 : parseFloat(feeAmountStr)
      
      // 根据checkbook状态和allocations确定使用状态和按钮
      const checkbookStatus = checkbook.status
      
      let statusText: string = "--"
      let buttonText: string = ""
      let buttonEnabled: boolean = false
      let statusType: "normal" | "processing" | "failed" | "deleted" = "normal"
      
      // 状态和按钮映射
      if (checkbookStatus === 'DELETED') {
        statusText = t('deposit.deleted')
        buttonText = t('deposit.deleted')
        buttonEnabled = false
        statusType = "deleted"
      } else if (checkbookStatus === 'with_checkbook') {
        // with_checkbook: 状态显示分配信息（Allocations的使用情况），按钮显示"在defi页面中提取"，按钮失效
        if (hasAllocations) {
          // 统计 allocations 的使用情况
          // idle: 可用
          // pending/used: 已使用（非idle）
          const idleCount = checkbookAllocations.filter((alloc: any) => alloc.status === 'idle').length
          const usedCount = checkbookAllocations.filter((alloc: any) => alloc.status !== 'idle').length
          const totalCount = checkbookAllocations.length
          
          // 显示格式：已使用 X/Y，可用 Z
          if (usedCount > 0 && idleCount > 0) {
            statusText = t('deposit.allocationStatus.usedAndAvailable', { used: usedCount, total: totalCount, idle: idleCount })
          } else if (usedCount > 0) {
            statusText = t('deposit.allocationStatus.used', { used: usedCount, total: totalCount })
          } else if (idleCount > 0) {
            statusText = t('deposit.allocationStatus.available', { idle: idleCount, total: totalCount })
          } else {
            statusText = t('deposit.allocationStatus.allocated', { total: totalCount })
          }
        } else {
          // 没有allocations，显示未分配
          statusText = t('deposit.allocationStatus.unallocated')
        }
        buttonText = t('deposit.extractInDefi')
        buttonEnabled = true // 按钮使能，点击后跳转到 /defi 页面
        statusType = "normal"
      } else if (checkbookStatus === 'pending') {
        statusText = "--"
        buttonText = t('deposit.depositing')
        buttonEnabled = false
        statusType = "processing"
      } else if (checkbookStatus === 'unsigned') {
        statusText = "--"
        buttonText = t('deposit.syncing')
        buttonEnabled = false
        statusType = "processing"
      } else if (checkbookStatus === 'ready_for_commitment') {
        statusText = "--"
        buttonText = t('deposit.allocateVoucher')
        buttonEnabled = true
        statusType = "normal"
      } else if (checkbookStatus === 'generating_proof') {
        statusText = "--"
        buttonText = t('deposit.generatingProof')
        buttonEnabled = false
        statusType = "processing"
      } else if (checkbookStatus === 'submitting_commitment') {
        statusText = t('deposit.submittingCommitment')
        buttonText = t('deposit.submittingCommitment')
        buttonEnabled = false
        statusType = "processing"
      } else if (checkbookStatus === 'commitment_pending') {
        statusText = t('deposit.onChainConfirming')
        buttonText = t('deposit.confirmingCommitment')
        buttonEnabled = false
        statusType = "processing"
      } else if (checkbookStatus === 'proof_failed') {
        statusText = t('deposit.proofFailed')
        buttonText = t('deposit.regenerate')
        buttonEnabled = true // 启用按钮，允许重新生成
        statusType = "failed"
      } else if (checkbookStatus === 'submission_failed') {
        statusText = t('deposit.submissionFailed')
        buttonText = t('deposit.resubmit')
        buttonEnabled = true // 启用按钮，允许重新提交
        statusType = "failed"
      } else {
        // 未知状态，默认处理
        statusText = "--"
        buttonText = t('deposit.processing')
        buttonEnabled = false
        statusType = "processing"
      }
      
      // 使用localDepositId作为显示ID（支持camelCase和snake_case）
      // 如果没有则使用checkbook.id
      const displayId = (checkbook.localDepositId?.toString() || 
                        (checkbook as any).local_deposit_id?.toString() || 
                        checkbook.id)
      
      return {
        id: checkbook.id, // 内部使用checkbook.id
        depositId: displayId, // 显示用的Deposit ID
        originalAmount,
        receivableAmount,
        feeAmount,
        status: hasAllocations ? "已分配" as const : "未分配" as const, // 保持类型兼容
        statusText, // 状态显示文本
        statusType, // 状态类型：normal, processing, failed, deleted
        buttonText, // 按钮文本
        buttonEnabled, // 按钮是否可用
        date: checkbook.createdAt ? new Date(checkbook.createdAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN'),
        allocatedVouchers: hasAllocations
          ? checkbookAllocations.map((alloc: any) => {
              // 使用 formatFromWei 精确转换
              // Enclave 系统中统一使用 18 位 decimal
              const allocDecimals = 18
              return {
                id: alloc.id,
                amount: parseFloat(formatFromWei(BigInt(alloc.amount || '0'), allocDecimals)),
              }
            })
          : undefined,
        // 添加完整的 allocations 数据用于详情显示
        allocations: hasAllocations ? checkbookAllocations.map((alloc: any) => ({
          id: alloc.id,
          amount: alloc.amount || '0',
          status: alloc.status || 'unknown',
          token: alloc.token || checkbook.token,
          createdAt: alloc.createdAt,
          updatedAt: alloc.updatedAt
        })) : undefined,
        // 添加checkbook状态信息
        checkbookStatus: checkbook.status,
        canAllocate: buttonEnabled && checkbookStatus === 'ready_for_commitment'
      }
    })
    
    // 对 checkbookRecords 进行去重：相同 depositTxHash 只保留最新的一个
    // 使用 Map 以 depositTxHash 为 key，保留最新的记录
    const uniqueCheckbookRecordsMap = new Map<string, DepositRecordData>()
    
    checkbookRecords.forEach((record) => {
      // 从 checkbooks 中找到对应的 checkbook 以获取 depositTxHash
      const checkbook = checkbooks.find((cb: any) => cb.id === record.id)
      if (!checkbook) {
        // 如果没有找到对应的 checkbook，使用 record.id 作为 key（避免丢失记录）
        if (!uniqueCheckbookRecordsMap.has(record.id)) {
          uniqueCheckbookRecordsMap.set(record.id, record)
        }
        return
      }
      
      const depositTxHash = (checkbook.depositTxHash || 
                            (checkbook as any).deposit_tx_hash ||
                            (checkbook as any).deposit_transaction_hash)?.toLowerCase()
      
      if (!depositTxHash) {
        // 如果没有 depositTxHash，使用 record.id 作为 key（可能是旧数据）
        if (!uniqueCheckbookRecordsMap.has(record.id)) {
          uniqueCheckbookRecordsMap.set(record.id, record)
        }
        return
      }
      
      // 如果已存在相同 depositTxHash 的记录，比较时间，保留最新的
      const existingRecord = uniqueCheckbookRecordsMap.get(depositTxHash)
      if (!existingRecord) {
        // 不存在，直接添加
        uniqueCheckbookRecordsMap.set(depositTxHash, record)
      } else {
        // 已存在，比较时间，保留最新的
        const existingDate = new Date(existingRecord.date).getTime()
        const currentDate = new Date(record.date).getTime()
        if (currentDate > existingDate) {
          // 当前记录更新，替换
          uniqueCheckbookRecordsMap.set(depositTxHash, record)
        }
        // 否则保留已存在的记录
      }
    })
    
    // 转换为数组
    const uniqueCheckbookRecords = Array.from(uniqueCheckbookRecordsMap.values())
    
    // 最终去重：确保 pending records 和 checkbook records 之间没有重复
    // 创建 checkbook 记录的 depositTxHash 集合（用于与 pending 记录比较）
    const checkbookTxHashes = new Set<string>()
    uniqueCheckbookRecords.forEach((record) => {
      const checkbook = checkbooks.find((cb: any) => cb.id === record.id)
      if (checkbook) {
        const hash = checkbook.depositTxHash || 
                    (checkbook as any).deposit_tx_hash ||
                    (checkbook as any).deposit_transaction_hash
        if (hash) {
          checkbookTxHashes.add(normalizeHash(hash))
        }
      }
    })
    
    // 过滤掉与 checkbook 记录重复的 pending records
    const finalPendingRecords = pendingRecords.filter((pendingRecord) => {
      // pending 记录的 id 格式是 `pending-${txHash}`
      const txHash = pendingRecord.id.replace(/^pending-/, '')
      if (!txHash) return true
      const normalizedHash = normalizeHash(txHash)
      return !checkbookTxHashes.has(normalizedHash)
    })
    
    // 合并 pending records 和去重后的 checkbook records，pending records 放在最前面
    // 按时间倒序排列（最新的在前）
    const allRecords = [...finalPendingRecords, ...uniqueCheckbookRecords].sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA // 倒序：最新的在前
    })
    
    return allRecords
  }, [checkbooks, byCheckbookId, pendingTransactions, t])

  // 使用底部弹出组件
  const processingSheet = useBottomSheet()
  const voucherSheet = useBottomSheet()
  const voucherGeneratingSheet = useBottomSheet()

  // 使用 useRef 跟踪上一次的地址，避免重复执行
  const prevAddressRef = useRef<string | null>(null)
  
  // 账户切换时清空 SDK store 缓存并重置状态
  useEffect(() => {
    // 如果地址没有变化，不执行
    if (prevAddressRef.current === address) {
      return
    }
    
    // 更新上一次的地址
    prevAddressRef.current = address
    
    if (!address) {
      // 账户断开时，清空所有状态和 SDK store 缓存
      setPendingTransactions([])
      setIsAuthorized(false)
      setAuthorizedAmount("0.00")
      setCurrentInvitationCode(null)
      setCurrentPage(1)
      setPagination(null)
      processedTxHashesRef.current.clear()
      
      // 注意：SDK 的断开和缓存清空由 SDKProvider 统一管理
      return
    }

    // 账户切换时（address 变化），重置页面状态
    // 注意：SDK 的断开、重连和缓存清空由 SDKProvider 统一管理
    
    // 重置待处理交易列表
    setPendingTransactions([])
    
    // 重置授权状态（会通过其他 useEffect 重新获取）
    setIsAuthorized(false)
    setAuthorizedAmount("0.00")
    
    // 重置邀请码
    setCurrentInvitationCode(null)
    setPromoCode("")
    
    // 重置分页到第一页
    setCurrentPage(1)
    setPagination(null)
    
    // 清空已处理的交易哈希记录
    processedTxHashesRef.current.clear()
    
    // 重置弹窗状态
    processingSheet.close()
    voucherSheet.close()
    voucherGeneratingSheet.close()
    // 注意：只依赖 address，使用 useRef 来避免重复执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  // 钱包余额（从链上读取）
  const { balance: walletBalance, loading: balanceLoading } = useWalletBalance()
  const minDepositAmount = 2

  // 监听 checkbook 状态变化，当 checkbook 已生成或更新时自动关闭弹窗
  // 同时清理已匹配的 pending transactions
  useEffect(() => {
    // 检查所有 checkbooks，移除已匹配的 pending transactions
    const matchedTxHashes = new Set(
      checkbooks
        .map((cb: any) => cb.depositTxHash || (cb as any).deposit_tx_hash || (cb as any).deposit_transaction_hash)
        .filter(Boolean)
        .map((hash: string) => hash.toLowerCase())
    )
    
    // 检查是否有新的 matchedTxHashes（与之前处理过的不同）
    const hasNewMatches = Array.from(matchedTxHashes).some(
      (hash) => !processedTxHashesRef.current.has(hash)
    )
    
    // 只在有新的匹配项时才更新 pendingTransactions
    if (hasNewMatches && matchedTxHashes.size > 0) {
      // 更新已处理的 txHashes
      matchedTxHashes.forEach((hash) => processedTxHashesRef.current.add(hash))
      
      setPendingTransactions((prev) => {
        const filtered = prev.filter((pending) => !matchedTxHashes.has(pending.txHash.toLowerCase()))
        // 只有当过滤后的数组长度发生变化时才返回新数组
        if (filtered.length !== prev.length) {
          return filtered
        }
        return prev // 返回原数组，避免触发重新渲染
      })
    }
    
    // 如果弹窗未打开，不需要检查
    if (!processingSheet.isOpen || !processingSheet.data?.txHash) {
      return
    }

    const txHash = processingSheet.data.txHash

    // 查找匹配交易哈希的 checkbook
    const matchedCheckbook = checkbooks.find((checkbook: any) => {
      // 支持 camelCase 和 snake_case 两种格式
      const depositTxHash = checkbook.depositTxHash || 
                           (checkbook as any).deposit_tx_hash ||
                           (checkbook as any).deposit_transaction_hash
      return depositTxHash?.toLowerCase() === txHash.toLowerCase()
    })

    if (matchedCheckbook) {
      const status = matchedCheckbook.status
      // 当 checkbook 状态为 with_checkbook 或 ready_for_commitment 时，自动关闭弹窗
      if (status === 'with_checkbook' || status === 'ready_for_commitment') {
        console.log('✅ Checkbook 状态已更新，自动关闭弹窗:', status)
        // 取消倒计时并清理相关状态
        setIsAutoClosing(false)
        isAutoClosingRef.current = false
        countdownInitializedRef.current = false
        countdownStartTimeRef.current = null
        // 清理定时器
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
        }
        // 清理进度条定时器
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current)
          progressTimerRef.current = null
        }
        // 关闭弹窗
        processingSheet.close()
      }
    }
  }, [checkbooks, processingSheet.isOpen, processingSheet.data?.txHash, processingSheet])

  // 当弹窗打开时，定期刷新 checkbooks 数据以获取最新状态
  useEffect(() => {
    if (!processingSheet.isOpen || !address || !sdkStore.sdk || !isConnected) {
      return
    }

    // 立即刷新一次
    fetchCheckbooks({ 
      deleted: isDeleted,
      page: currentPage,
      limit: pageSize
    }).then(result => {
      if (result.pagination) {
        setPagination({
          page: result.pagination.page || currentPage,
          size: result.pagination.limit || result.pagination.size || pageSize,
          total: result.pagination.total || 0,
          pages: result.pagination.totalPages || result.pagination.pages || 1
        })
      }
    }).catch(err => {
      console.error('刷新 checkbooks 数据失败:', err)
    })

    // 每 3 秒刷新一次 checkbooks 数据
    const interval = setInterval(() => {
      if (address && sdkStore.sdk && isConnected) {
        fetchCheckbooks({ 
          deleted: isDeleted,
          page: currentPage,
          limit: pageSize
        }).then(result => {
          if (result.pagination) {
            setPagination({
              page: result.pagination.page || currentPage,
              size: result.pagination.limit || result.pagination.size || pageSize,
              total: result.pagination.total || 0,
              pages: result.pagination.totalPages || result.pagination.pages || 1
            })
          }
        }).catch(err => {
          console.error('刷新 checkbooks 数据失败:', err)
        })
      }
    }, 3000) // 每 3 秒刷新一次

    return () => clearInterval(interval)
  }, [processingSheet.isOpen, address, sdkStore.sdk, isConnected, fetchCheckbooks, isDeleted, currentPage, pageSize])

  // 不同链的 USDT 地址映射
  const getUSDTAddress = useCallback((chainId: number): string | null => {
    const USDT_ADDRESSES: Record<number, string> = {
      // EVM 链
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum Mainnet
      60: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum (SLIP-44)
      56: '0x55d398326f99059fF775485246999027B3197955', // BSC Mainnet
      714: '0x55d398326f99059fF775485246999027B3197955', // BSC (SLIP-44)
      137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon
      // TRON 链
      195: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // TRON USDT
    }
    return USDT_ADDRESSES[chainId] || null
  }, [])

  // 读取授权额度
  const fetchAllowance = useCallback(async () => {
    // 检查 SDK 是否完全连接
    if (!walletManager || !sdkStore.sdk || !sdkStore.isConnected || !chainId || !address) {
      console.log('⏳ [fetchAllowance] 等待 SDK 连接完成...', {
        walletManager: !!walletManager,
        sdk: !!sdkStore.sdk,
        isConnected: sdkStore.isConnected,
        chainId,
        address,
      })
      return
    }

    try {
      setIsLoadingAllowance(true)
      
      // 根据链 ID 获取对应的 USDT 地址
      const tokenAddress = getUSDTAddress(chainId)
      
      // 验证 token 地址
      if (!tokenAddress || tokenAddress.trim() === '') {
        console.warn(`⏭️ [fetchAllowance] 链 ${chainId} 不支持 USDT，跳过读取授权额度`)
        setAuthorizedAmount("0.00")
        setIsAuthorized(false)
        return
      }

      console.log('🔍 [fetchAllowance] 开始读取授权额度:', {
        chainId,
        tokenAddress,
        address,
      })

      // getAllowance 会自动从 SDK 获取 Treasury 地址
      // getAllowance 返回的是链上查询的 BigInt 格式的授权额度
      const allowance = await getAllowance(tokenAddress, chainId)
      
      // 根据链 ID 获取正确的小数位数来格式化金额
      const decimals = getUSDTDecimals(chainId)
      // 使用 formatFromWei 进行精确转换，避免浮点数精度问题
      const allowanceFormatted = formatAmountForDisplay(formatFromWei(allowance, decimals), 2)
      setAuthorizedAmount(allowanceFormatted)
      
      // 判定授权状态：使用 BigInt 精确比较，避免浮点数精度问题
      const depositAmountWei = depositAmount ? parseToWei(depositAmount, decimals) : 0n
      
      // 如果授权额度大于0且大于等于存款金额，标记为已授权
      if (allowance > 0n && allowance >= depositAmountWei) {
        setIsAuthorized(true)
      } else {
        // 如果授权额度不足，标记为未授权
        setIsAuthorized(false)
      }
      
      console.log('🔍 [DepositPage] 授权额度判定:', {
        allowanceRaw: allowance.toString(), // 原始 BigInt 值
        allowanceFormatted: allowanceFormatted, // 格式化后的值
        decimals, // 使用的小数位数
        depositAmount: depositAmount,
        depositAmountWei: depositAmountWei.toString(),
        isAuthorized: allowance > 0n && allowance >= depositAmountWei
      })
    } catch (error) {
      console.error('读取授权额度失败:', error)
      setAuthorizedAmount("0.00")
      setIsAuthorized(false) // 读取失败时，标记为未授权
    } finally {
      setIsLoadingAllowance(false)
    }
  }, [walletManager, sdkStore.sdk, sdkStore.isConnected, chainId, address, getAllowance, getUSDTAddress, depositAmount])

  // 页面加载时自动读取授权额度（确保 SDK 完全连接）
  useEffect(() => {
    if (isConnected && address && walletManager && sdkStore.sdk && sdkStore.isConnected && chainId) {
      console.log('✅ [DepositPage] 所有条件满足，开始读取授权额度')
      fetchAllowance()
    } else {
      console.log('⏳ [DepositPage] 等待条件满足:', {
        isConnected,
        address: !!address,
        walletManager: !!walletManager,
        sdk: !!sdkStore.sdk,
        sdkIsConnected: sdkStore.isConnected,
        chainId,
      })
    }
  }, [isConnected, address, walletManager, sdkStore.sdk, sdkStore.isConnected, chainId, fetchAllowance])

  // 页面加载时自动预读风险评分和费率信息
  useEffect(() => {
    if (isConnected && address && sdkStore.sdk && chainId) {
      // 静默读取，不显示错误 Toast
      fetchRiskFeeInfo('USDT').catch(() => {
        // 静默失败，不显示错误
      })
    }
  }, [isConnected, address, sdkStore.sdk, chainId, fetchRiskFeeInfo])

  // 处理刷新风险评分和费率（强制刷新，使用 POST）
  const handleRefreshRiskFee = useCallback(async () => {
    try {
      clearRiskFeeError()
      const response = await fetchRiskFeeInfo('USDT', true) // forceRefresh = true
      // 检查是否限流（success: false 但有数据，说明是限流）
      // Type assertion needed because memo property may not be recognized in compiled types
      const responseWithMemo = response as typeof response & { memo?: string }
      if (!response.success && responseWithMemo.memo && response.data) {
        // 限流时数据已正常返回，显示提示信息
        showWarning(t('deposit.rateLimitError'))
      }
    } catch (err) {
      // 只有真正的错误才显示错误提示
      const errorMessage = err instanceof Error ? err.message : '获取风险评分和费率失败'
      showError(errorMessage)
    }
  }, [fetchRiskFeeInfo, clearRiskFeeError, showWarning, showError, t])

  // 授权成功后刷新授权额度
  useEffect(() => {
    if (isAuthorized) {
      fetchAllowance()
    }
  }, [isAuthorized, fetchAllowance])

  const handleDepositAmountChange = (value: string) => {
    setDepositAmount(value)
    
    // 当存款金额变化时，重新判定授权状态（使用 BigInt 精确比较）
    if (authorizedAmount && value && chainId) {
      const decimals = getUSDTDecimals(chainId)
      const allowanceWei = parseToWei(authorizedAmount, decimals)
      const depositAmountWei = parseToWei(value, decimals)
      setIsAuthorized(allowanceWei >= depositAmountWei && allowanceWei > 0n)
    }
  }
  
  // 当授权额度或存款金额变化时，重新判定授权状态（使用 BigInt 精确比较）
  useEffect(() => {
    if (authorizedAmount && depositAmount && chainId) {
      const decimals = getUSDTDecimals(chainId)
      const allowanceWei = parseToWei(authorizedAmount, decimals)
      const depositAmountWei = parseToWei(depositAmount, decimals)
      const shouldBeAuthorized = allowanceWei >= depositAmountWei && allowanceWei > 0n
      
      // 只有在状态需要改变时才更新，避免不必要的重渲染
      setIsAuthorized(prev => {
        if (prev !== shouldBeAuthorized) {
          console.log('🔍 [DepositPage] 授权状态自动判定:', {
            allowance: authorizedAmount,
            allowanceWei: allowanceWei.toString(),
            depositAmount: depositAmount,
            depositAmountWei: depositAmountWei.toString(),
            isAuthorized: shouldBeAuthorized
          })
          return shouldBeAuthorized
        }
        return prev
      })
    }
  }, [authorizedAmount, depositAmount])

  const handleClearAmount = () => {
    setDepositAmount("")
  }

  const handlePromoCodeChange = (value: string) => {
    setPromoCode(value)
  }

  // 恢复邀请码：清空输入框并填充现有邀请码
  const handleRestoreInvitationCode = useCallback(() => {
    setPromoCode('')
    if (currentInvitationCode) {
      setPromoCode(currentInvitationCode)
    }
  }, [currentInvitationCode])

  // 获取链名称
  const getChainName = useCallback(() => {
    if (!chainId) return 'bsc'
    const slip44ChainId = getSlip44FromChainId(chainId) || chainId
    if (slip44ChainId === 60) {
      return 'ethereum'
    } else if (slip44ChainId === 714) {
      return 'bsc'
    } else if (slip44ChainId === 966) {
      return 'polygon'
    } else if (slip44ChainId === 195) {
      return 'tron'
    }
    return 'bsc'
  }, [chainId])

  // 不再需要单独获取邀请码，因为费率信息中已包含邀请码
  // 邀请码会从 riskFeeInfo.invitationCode 中自动同步

  // 绑定邀请码
  const handleBindInvitationCode = useCallback(async () => {
    if (!address || !chainId || !sdkStore.sdk || !promoCode.trim()) {
      showWarning(t('deposit.enterPromoCode'))
      return
    }

    try {
      setIsBindingInvitationCode(true)
      const chainName = getChainName()
      const response = await sdkStore.sdk.kytOracle.associateAddressWithCode({
        address: address,
        code: promoCode.trim(),
        chain: chainName,
        tokenKey: 'USDT',
      } as any) as AssociateAddressResponse & { data?: FeeInfoData; last_query_time?: string }

      if (response.success) {
        setCurrentInvitationCode(promoCode.trim())
        setPromoCode('')
        showWarning(t('deposit.bindInvitationCodeSuccess'))
        
        // 如果响应中包含费率信息，直接更新（后端已自动获取并更新数据库）
        if (response.data) {
          const responseWithMetadata = response as typeof response & { metadata?: any }
          updateRiskFeeInfo(
            response.data, 
            response.last_query_time,
            responseWithMetadata.metadata ? {
              ...responseWithMetadata.metadata,
              queryTime: responseWithMetadata.metadata.queryTime || response.last_query_time || new Date().toISOString(),
            } : undefined
          )
        } else {
          // 如果没有费率信息（可能是代码未变化），仍然刷新一次
          await fetchRiskFeeInfo('USDT').catch(() => {})
        }
      } else {
        showError(response.error || t('deposit.bindInvitationCodeFailed'))
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : (t('deposit.bindInvitationCodeFailed') || '绑定失败')
      showError(errorMessage)
    } finally {
      setIsBindingInvitationCode(false)
    }
  }, [address, chainId, sdkStore.sdk, promoCode, getChainName, showWarning, showError, t, fetchRiskFeeInfo, updateRiskFeeInfo])

  // 不再需要单独获取邀请码，因为费率信息中已包含邀请码

  // 当费率信息中有邀请码时，同步到 currentInvitationCode 并自动填充到输入框
  useEffect(() => {
    if (riskFeeInfo?.invitationCode && riskFeeInfo.invitationCode !== currentInvitationCode) {
      setCurrentInvitationCode(riskFeeInfo.invitationCode)
      // 如果输入框为空，自动填充邀请码
      if (!promoCode.trim()) {
        setPromoCode(riskFeeInfo.invitationCode)
      }
    }
  }, [riskFeeInfo?.invitationCode, currentInvitationCode, promoCode])

  const handleAuthorization = async () => {
    if (!walletManager || !sdkStore.sdk || !sdkStore.isConnected || !chainId) {
      showWarning(t('toast.connectWalletFirst'))
      return
    }

    try {
      setIsAuthorizing(true)
      console.log("开始授权，金额:", depositAmount)

      // 根据链 ID 获取对应的 USDT 地址
      const tokenAddress = getUSDTAddress(chainId)
      if (!tokenAddress) {
        throw new Error(`链 ${chainId} 不支持 USDT`)
      }
      
      // 转换 chain ID（如果传入的是 EVM chain ID，转换为 SLIP-44）
      const slip44ChainId = getSlip44FromChainId(chainId) || chainId
      
      // 从 Store 获取 Treasury 地址（如果未加载，则从 API 获取）
      let treasuryAddress = sdkStore.sdk.stores.chainConfig.getTreasuryAddress(slip44ChainId)
      
      // 如果 Store 中没有，尝试从 API 获取并更新 Store
      if (!treasuryAddress) {
        await sdkStore.sdk.stores.chainConfig.fetchChain(slip44ChainId)
        treasuryAddress = sdkStore.sdk.stores.chainConfig.getTreasuryAddress(slip44ChainId)
      }
      
      if (!treasuryAddress) {
        throw new Error(`未找到链 ${slip44ChainId} 的 Treasury 地址`)
      }
      
      // 根据链获取正确的小数位数并转换金额
      const amountBigInt = parseUSDTAmount(depositAmount, chainId)
      const decimals = getUSDTDecimals(chainId)
      
      console.log('🔍 [handleAuthorization] 授权参数:', {
        chainId,
        decimals,
        depositAmount,
        amountWei: amountBigInt.toString(),
        tokenAddress,
        treasuryAddress,
      })

      // 执行授权
      const result = await approveToken(tokenAddress, treasuryAddress, amountBigInt)
      
      if (result.alreadyApproved) {
        console.log('✅ Token 已授权')
        setIsAuthorized(true)
      } else {
        console.log('✅ Token 授权成功:', result.txHash)
        setIsAuthorized(true)
      }
    } catch (error) {
      console.error('授权失败:', error)
      // 检查是否是用户拒绝授权的情况
      const isUserRejected = error instanceof Error && (
        error.message?.toLowerCase().includes('rejected') ||
        error.message?.toLowerCase().includes('denied') ||
        error.message?.toLowerCase().includes('user rejected') ||
        error.message?.toLowerCase().includes('user denied') ||
        error.message?.toLowerCase().includes('用户取消') ||
        error.message?.toLowerCase().includes('用户拒绝') ||
        error.name === 'ConnectionRejectedError' ||
        (error as any)?.code === 4001 || // MetaMask 用户拒绝错误码
        (error as any)?.code === 'ACTION_REJECTED'
      )
      
      // 如果是用户拒绝，只显示"授权失败"，不显示 SDK 的错误信息
      if (isUserRejected) {
        showError(t('toast.authorizationFailed') || '授权失败')
      } else {
        // 其他错误，显示详细错误信息
        showError(t('toast.authorizationFailed') + ': ' + (error instanceof Error ? error.message : t('toast.unknownError')))
      }
    } finally {
      setIsAuthorizing(false)
    }
  }

  const handleDeposit = async () => {
    // 测试模式：直接打开弹窗，不调用接口
    const TEST_MODE = false // 设置为 false 关闭测试模式
    if (TEST_MODE) {
      const testTxHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
      console.log('🧪 [测试模式] 直接打开弹窗，不调用接口')
      setTxHash(testTxHash)
      
      // 立即添加到 pending transactions 列表，让用户看到"存入中"状态
      setPendingTransactions((prev) => [
        ...prev,
        {
          txHash: testTxHash,
          amount: depositAmount || '0',
          timestamp: Date.now(),
        },
      ])
      
      processingSheet.open({ txHash: testTxHash })
      return
    }

    if (!walletManager || !sdkStore.sdk || !sdkStore.isConnected || !chainId || !address) {
      showWarning(t('toast.connectWalletFirst'))
      return
    }

    try {
      console.log("存款金额:", depositAmount)
      console.log("优惠码:", promoCode)

      // 根据链 ID 获取对应的 USDT 地址
      const tokenAddress = getUSDTAddress(chainId)
      if (!tokenAddress) {
        throw new Error(`链 ${chainId} 不支持 USDT`)
      }
      
      // 根据链获取正确的小数位数并转换金额
      const decimals = getUSDTDecimals(chainId)
      const amountWei = parseUSDTAmount(depositAmount, chainId).toString()
      
      console.log('🔍 [handleDeposit] 存款参数:', {
        chainId,
        decimals,
        depositAmount,
        amountWei,
        tokenAddress,
      })

      // 转换 chain ID（如果传入的是 EVM chain ID，转换为 SLIP-44）
      const slip44ChainId = getSlip44FromChainId(chainId) || chainId
      
      // 执行存款
      const result = await depositToTreasury({
        tokenAddress,
        amount: amountWei,
        chainId: slip44ChainId,
        promoCode: promoCode || undefined,
      })

      console.log('✅ 存款成功:', result.txHash)
      setTxHash(result.txHash)
      
      // 立即添加到 pending transactions 列表，让用户看到"存入中"状态
      setPendingTransactions((prev) => [
        ...prev,
        {
          txHash: result.txHash,
          amount: depositAmount,
          timestamp: Date.now(),
        },
      ])
      
      processingSheet.open({ txHash: result.txHash })
      
      // 存款成功后重置到第一页并刷新存款记录列表
      // SDK 的响应式更新会自动处理后续状态变化
      if (address) {
        console.log('🔄 [handleDeposit] 准备刷新，当前页:', currentPage)
        // 重置到第一页，确保新记录可见
        setCurrentPage(1)
        
        // 延迟刷新，等待后端处理完成（通常需要2-3秒）
        // 同时 useEffect 也会监听 currentPage 变化自动触发查询
        setTimeout(async () => {
          try {
            console.log('🔄 [handleDeposit] 开始刷新存款记录列表，参数:', {
              deleted: isDeleted,
              page: 1,
              limit: pageSize
            })
            
            // 诊断：检查 SDK 是否直接发送请求
            if (sdkStore.sdk) {
              console.log('🔍 [诊断] 直接调用 SDK fetchList，绕过 hook')
              const directResult = await sdkStore.sdk.stores.checkbooks.fetchList({
                deleted: isDeleted,
                page: 1,
                limit: pageSize
              } as any) // 使用类型断言，因为 SDK 类型定义可能不完整
              console.log('🔍 [诊断] SDK 直接返回结果:', {
                dataCount: directResult.data?.length || 0,
                hasPagination: !!directResult.pagination,
                allCount: sdkStore.sdk.stores.checkbooks.all?.length || 0
              })
            }
            
            const refreshResult = await fetchCheckbooks({ 
              deleted: isDeleted,
              page: 1,  // 重置到第一页
              limit: pageSize
            })
            console.log('✅ [handleDeposit] 刷新完成，结果:', {
              checkbooksCount: refreshResult.checkbooks?.length || 0,
              pagination: refreshResult.pagination,
              sdkStoreAllCount: sdkStore.sdk?.stores.checkbooks.all?.length || 0
            })
            if (refreshResult.pagination) {
              setPagination({
                page: refreshResult.pagination.page || 1,
                size: refreshResult.pagination.limit || refreshResult.pagination.size || pageSize,
                total: refreshResult.pagination.total || 0,
                pages: refreshResult.pagination.totalPages || refreshResult.pagination.pages || 1
              })
            }
          } catch (refreshError) {
            console.error('❌ [handleDeposit] 刷新存款记录失败:', refreshError)
            // 刷新失败不影响主流程，只记录错误
          }
        }, 2000) // 延迟2秒，等待后端处理
      }
    } catch (error) {
      console.error('存款失败:', error)
      showError(t('toast.depositFailed') + ': ' + (error instanceof Error ? error.message : t('toast.unknownError')))
    }
  }

  const handleCancelWaiting = () => {
    setIsAutoClosing(false)
    countdownInitializedRef.current = false
    // 清理进度条定时器
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    // 不立即重置倒计时，避免关闭瞬间看到15
    // 倒计时会在下次弹窗打开时自动重置
    processingSheet.close()
  }
  
  // 弹窗自动关闭倒计时 - 使用基于时间戳的方式，避免被阻塞
  useEffect(() => {
    // 更新 ref 值
    isOpenRef.current = processingSheet.isOpen
    isAutoClosingRef.current = isAutoClosing

    // 清理之前的定时器
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }

    // 如果弹窗未打开或已取消自动关闭，不启动倒计时
    if (!isOpenRef.current || !isAutoClosingRef.current) {
      if (!isOpenRef.current) {
        // 弹窗关闭时只重置标志，不重置倒计时显示（避免关闭瞬间看到15）
        // 倒计时会在下次弹窗打开时重置
        setIsAutoClosing(true)
        countdownInitializedRef.current = false
        countdownStartTimeRef.current = null
        // 不在这里重置倒计时，让它在弹窗完全关闭后再重置，或者下次打开时重置
      }
      return
    }
    
    // 只在弹窗刚打开时（首次初始化）重置倒计时
    if (!countdownInitializedRef.current) {
      // 使用 requestAnimationFrame 确保在弹窗完全打开后再显示15，避免关闭瞬间看到重置
      requestAnimationFrame(() => {
        if (processingSheet.isOpen) {
          setProcessingCountdown(15)
        }
      })
      countdownInitializedRef.current = true
      countdownStartTimeRef.current = Date.now()
    }
    
    // 启动倒计时 - 使用基于时间戳的方式，每100ms检查一次
    let lastDisplayedCount = 15
    countdownTimerRef.current = setInterval(() => {
      // 每次执行时检查最新状态
      if (!processingSheet.isOpen || !isAutoClosingRef.current) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
        }
        return
      }
      
      // 基于时间戳计算剩余时间，避免累积误差
      if (countdownStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - countdownStartTimeRef.current) / 1000)
        const remaining = Math.max(0, 15 - elapsed)
        
        // 只在数字变化时更新状态，减少不必要的渲染
        if (remaining !== lastDisplayedCount) {
          lastDisplayedCount = remaining
          setProcessingCountdown(remaining)
        }
        
        if (remaining <= 0) {
          // 倒计时结束，自动关闭弹窗
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current)
            countdownTimerRef.current = null
          }
          setIsAutoClosing(false)
          isAutoClosingRef.current = false
          countdownInitializedRef.current = false
          countdownStartTimeRef.current = null
          processingSheet.close()
        }
      }
    }, 100) as unknown as NodeJS.Timeout // 每100ms检查一次，确保及时更新
    
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [processingSheet.isOpen, isAutoClosing, processingSheet])

  // 进度条逻辑：每秒增长10%，直到90%停止
  useEffect(() => {
    // 清理之前的定时器
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }

    // 如果弹窗未打开，重置进度条
    if (!processingSheet.isOpen) {
      setProgressPercent(0)
      return
    }

    // 弹窗打开时，重置进度条并启动定时器
    setProgressPercent(0)

    progressTimerRef.current = setInterval(() => {
      setProgressPercent((prev) => {
        // 每秒增加10%，最多到90%
        if (prev >= 90) {
          // 达到90%后停止
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current)
            progressTimerRef.current = null
          }
          return 90
        }
        return prev + 10
      })
    }, 1000) as unknown as NodeJS.Timeout // 每秒执行一次

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [processingSheet.isOpen])

  const handleAllocateVoucher = (record: DepositRecordData) => {
    // 使用 record 的 receivableAmount（即 allocatableAmount）和 checkbook ID
    // 传递 originalAmount 和 feeAmount 用于计算5%和不足缺失部分
    voucherSheet.open({ 
      totalAmount: record.receivableAmount,
      originalAmount: record.originalAmount,
      actualFee: record.feeAmount,
      checkbookId: record.id // 传递选中的 checkbook ID
    })
  }

  // 测试函数：直接打开"正在生成凭证"弹框
  const handleTestOpenVoucherSheet = () => {
    voucherGeneratingSheet.open({ 
      status: 'generating' // 直接显示生成中状态
    })
  }

  const handleGenerateVouchers = async (vouchers: Array<{ id: string; amount: number }>) => {
    // 关闭凭证分配弹窗
    voucherSheet.close()
    
    // 打开生成进度模态框
    voucherGeneratingSheet.open({ status: 'generating' })
    
    try {
      // 在生成凭证之前，保存 SDK 连接状态和认证信息
      // 这样即使钱包在生成过程中断开，SDK 的认证 token 仍然有效
      if (!sdkStore.sdk || !sdkStore.isConnected) {
        throw new Error('SDK 未连接，请先连接钱包')
      }
      
      // 获取认证 token（用于后续操作，即使钱包断开）
      const apiClient = (sdkStore.sdk as any).apiClient
      const authToken = apiClient?.getAuthToken?.()
      if (!authToken) {
        throw new Error('未认证，请先连接钱包')
      }
      
      // 从 voucherSheet 数据中获取选中的 checkbook ID
      const selectedCheckbookId = voucherSheet.data?.checkbookId
      
      if (!selectedCheckbookId) {
        throw new Error('未找到选中的 Checkbook ID')
      }
      
      // 从 checkbooks 中查找选中的 checkbook
      let selectedCheckbook = checkbooks.find((cb: any) => cb.id === selectedCheckbookId)
      
      if (!selectedCheckbook) {
        throw new Error(`未找到 ID 为 ${selectedCheckbookId} 的 Checkbook`)
      }
      
      // 获取完整的 checkbook 数据（包含 allocatableAmount）
      let fullCheckbook = selectedCheckbook
      if (sdkStore.sdk) {
        fullCheckbook = await sdkStore.sdk.stores.checkbooks.fetchById(selectedCheckbookId)
      }
      
      console.log('🔍 [handleGenerateVouchers] 使用选中的 checkbook:', {
        checkbookId: selectedCheckbookId,
        localDepositId: fullCheckbook.localDepositId || (fullCheckbook as any).local_deposit_id,
        allocatableAmount: fullCheckbook.allocatableAmount || (fullCheckbook as any).allocatable_amount
      })
      
      // 获取 allocatableAmount（可分配金额，wei 格式）
      const allocatableAmount = fullCheckbook.allocatableAmount || 
                                (fullCheckbook as any).allocatable_amount || 
                                '0'
      const allocatableAmountWei = BigInt(allocatableAmount)
      
      // 使用精确的金额转换（parseToWei）将可读格式转换为 wei
      const amountsWei: bigint[] = []
      
      // 转换前 n-1 个凭证的金额
      for (let i = 0; i < vouchers.length - 1; i++) {
        const amountWei = parseToWei(vouchers[i].amount, 18)
        amountsWei.push(amountWei)
      }
      
      // 计算前 n-1 个凭证的总和
      const previousTotalWei = amountsWei.reduce((sum, wei) => sum + wei, 0n)
      
      // 最后一个凭证 = allocatableAmount - 前面所有凭证的总和（确保精度）
      const lastAmountWei = allocatableAmountWei - previousTotalWei
      if (lastAmountWei < 0n) {
        throw new Error(`总分配金额超过可分配金额。可分配: ${allocatableAmountWei.toString()}, 已分配: ${previousTotalWei.toString()}`)
      }
      amountsWei.push(lastAmountWei)
      
      // 转换为字符串数组
      const amounts = amountsWei.map(wei => wei.toString())
      
      // 从 checkbook.token.symbol 获取 tokenKey (参考测试文件)
      let tokenKey: string
      if (fullCheckbook.token?.symbol) {
        tokenKey = fullCheckbook.token.symbol
      } else {
        throw new Error(`Checkbook ${fullCheckbook.id} 没有 token.symbol 信息`)
      }
      
      // 创建 Commitment (使用 tokenKey 而不是 tokenId)
      // 注意：即使钱包在生成过程中断开，SDK 的认证 token 仍然有效，可以继续执行
      await createCommitment({
        checkbookId: fullCheckbook.id,
        amounts,
        tokenKey, // 使用 tokenKey (token.symbol)
      })
      
      console.log("生成的凭证:", vouchers)
      
      // 更新模态框状态为成功
      voucherGeneratingSheet.updateData({ status: 'success' })
      
      // 刷新数据
      const result = await fetchCheckbooks({ 
        deleted: isDeleted,
        page: currentPage,
        limit: pageSize
      })
      if (result.pagination) {
        setPagination({
          page: result.pagination.page || currentPage,
          size: result.pagination.limit || result.pagination.size || pageSize,
          total: result.pagination.total || 0,
          pages: result.pagination.totalPages || result.pagination.pages || 1
        })
      }
    } catch (error) {
      console.error('创建凭证失败:', error)
      
      // 检查是否是钱包断开连接导致的错误
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      const isWalletDisconnected = 
        errorMessage.includes('未连接') ||
        errorMessage.includes('disconnected') ||
        errorMessage.includes('未认证') ||
        errorMessage.includes('not authenticated') ||
        (!isConnected && errorMessage.includes('SDK'))
      
      // 如果是钱包断开连接导致的错误，给出更友好的提示
      const finalErrorMessage = isWalletDisconnected 
        ? '生成凭证过程中钱包连接断开，请确保钱包保持连接状态后重试'
        : errorMessage
      
      // 更新模态框状态为失败
      voucherGeneratingSheet.updateData({ 
        status: 'error', 
        errorMessage: finalErrorMessage
      })
    }
  }

  const handleViewVoucherDetails = (recordId: string) => {
    console.log("查看凭证详情:", recordId)
    // 这里可以添加查看凭证详情的逻辑
  }

  const handleRefreshRecord = async (recordId: string) => {
    try {
    console.log("刷新记录:", recordId)
      // 刷新 Checkbooks 数据
      const result = await fetchCheckbooks({ 
        deleted: isDeleted,
        page: currentPage,
        limit: pageSize
      })
      if (result.pagination) {
        setPagination({
          page: result.pagination.page || currentPage,
          size: result.pagination.limit || result.pagination.size || pageSize,
          total: result.pagination.total || 0,
          pages: result.pagination.totalPages || result.pagination.pages || 1
        })
      }
    } catch (error) {
      console.error('刷新记录失败:', error)
    }
  }

  const handleCloseRecord = (recordId: string) => {
    console.log("关闭记录:", recordId)
    // 这里可以添加关闭记录的逻辑
  }

  // 处理重新生成/重新提交
  const handleRetryCheckbook = async (record: DepositRecordData) => {
    if (!record.checkbookStatus) {
      console.error('记录缺少 checkbookStatus')
      return
    }

    const checkbookId = record.id
    const status = record.checkbookStatus

    // 只有 proof_failed 和 submission_failed 状态可以重试
    if (status !== 'proof_failed' && status !== 'submission_failed') {
      console.error(`状态 ${status} 不支持重试`)
      return
    }

    try {
      console.log(`🔄 [DepositPage] 开始重试 checkbook: ${checkbookId}, 状态: ${status}`)
      
      // 获取 checkbook 信息
      const checkbook = checkbooks.find((cb: any) => cb.id === checkbookId)
      if (!checkbook) {
        throw new Error('未找到 checkbook 信息')
      }

      if (status === 'submission_failed') {
        // submission_failed: 先尝试直接重新提交（不重新生成证明）
        // 如果证明数据存在，可以直接重新提交
        // 如果失败（可能是 revert），则需要重新生成证明
        console.log(`📤 [DepositPage] submission_failed 状态，尝试直接重新提交...`)
        
        try {
          // 尝试直接重新提交
          await resubmitCommitment(checkbookId)
          console.log(`✅ [DepositPage] 重新提交请求已提交: ${checkbookId}`)
          showWarning(t('deposit.retrySubmitted') || '重新提交请求已提交，请等待处理')
        } catch (resubmitError) {
          // 如果重新提交失败，可能是 revert，需要重新生成证明
          console.log(`⚠️ [DepositPage] 直接重新提交失败，可能是 revert，需要重新生成证明: ${resubmitError}`)
          
          // 获取该 checkbook 的 allocations
          const checkbookAllocations = byCheckbookId.get(checkbookId) || []
          
          if (checkbookAllocations.length === 0) {
            // 如果没有 allocations，使用 checkbook 的剩余金额创建一个 allocation
            const remainingAmount = checkbook.remainingAmount || (checkbook as any).amount || '0'
            const amounts = [remainingAmount]
            const tokenKey = checkbook.token?.symbol || 'USDT'
            
            console.log(`📋 [DepositPage] 重新生成证明，amounts: ${amounts}, tokenKey: ${tokenKey}`)
            await createCommitment({
              checkbookId: checkbookId,
              amounts: amounts,
              tokenKey: tokenKey,
            })
          } else {
            // 如果有 allocations，使用现有的 allocations 金额重新生成
            const amounts = checkbookAllocations.map((alloc: any) => {
              if (typeof alloc.amount === 'string') {
                return alloc.amount
              }
              return alloc.amount.toString()
            })
            const tokenKey = checkbook.token?.symbol || checkbookAllocations[0]?.token?.symbol || 'USDT'
            
            console.log(`📋 [DepositPage] 重新生成证明，amounts: ${amounts}, tokenKey: ${tokenKey}`)
            await createCommitment({
              checkbookId: checkbookId,
              amounts: amounts,
              tokenKey: tokenKey,
            })
          }
          
          console.log(`✅ [DepositPage] 重新生成证明请求已提交: ${checkbookId}`)
          showWarning(t('deposit.retrySubmitted') || '重新生成证明请求已提交，请等待处理')
        }
      } else if (status === 'proof_failed') {
        // proof_failed: 必须重新生成证明
        console.log(`📋 [DepositPage] proof_failed 状态，重新生成证明...`)
        
        // 获取该 checkbook 的 allocations
        const checkbookAllocations = byCheckbookId.get(checkbookId) || []
        
        if (checkbookAllocations.length === 0) {
          // 如果没有 allocations，使用 checkbook 的剩余金额创建一个 allocation
          const remainingAmount = checkbook.remainingAmount || (checkbook as any).amount || '0'
          const amounts = [remainingAmount]
          const tokenKey = checkbook.token?.symbol || 'USDT'
          
          console.log(`📋 [DepositPage] 重新生成证明，amounts: ${amounts}, tokenKey: ${tokenKey}`)
          await createCommitment({
            checkbookId: checkbookId,
            amounts: amounts,
            tokenKey: tokenKey,
          })
        } else {
          // 如果有 allocations，使用现有的 allocations 金额重新生成
          const amounts = checkbookAllocations.map((alloc: any) => {
            if (typeof alloc.amount === 'string') {
              return alloc.amount
            }
            return alloc.amount.toString()
          })
          const tokenKey = checkbook.token?.symbol || checkbookAllocations[0]?.token?.symbol || 'USDT'
          
          console.log(`📋 [DepositPage] 重新生成证明，amounts: ${amounts}, tokenKey: ${tokenKey}`)
          await createCommitment({
            checkbookId: checkbookId,
            amounts: amounts,
            tokenKey: tokenKey,
          })
        }
        
        console.log(`✅ [DepositPage] 重新生成证明请求已提交: ${checkbookId}`)
        showWarning(t('deposit.retrySubmitted') || '重新生成证明请求已提交，请等待处理')
      }
      
      // 刷新数据
      if (address) {
        const result = await fetchCheckbooks({ 
          deleted: isDeleted,
          page: currentPage,
          limit: pageSize
        })
        if (result.pagination) {
          setPagination({
            page: result.pagination.page || currentPage,
            size: result.pagination.limit || result.pagination.size || pageSize,
            total: result.pagination.total || 0,
            pages: result.pagination.totalPages || result.pagination.pages || 1
          })
        }
      }
    } catch (error) {
      console.error('重试失败:', error)
      showError(t('deposit.retryFailed') || '重试失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
  }

  const isAmountValid = parseFloat(depositAmount) >= minDepositAmount
  const hasAuthorization =
    isAuthorized || parseFloat(authorizedAmount) >= parseFloat(depositAmount)
  // 风险评分 >30 时禁用按钮
  const isRiskScoreTooHigh = riskFeeInfo?.riskScore !== undefined && riskFeeInfo.riskScore > 30

  return (
    <div className="mx-auto p-5">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-main">{t('deposit.title')}</h1>
        {/* 钱包余额 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-black-9">{t('deposit.walletBalance')}</span>
          <span className="text-sm text-white">
            {balanceLoading ? t('common.loading') : `${walletBalance} USDT`}
          </span>
        </div>
      </div>
      <p className="text-sm text-black-9">{t('deposit.subtitle')}</p>
      {/* 主内容区域 */}
      <div className="py-6">
        <div className="bg-black-2 rounded-[12px] p-6 shadow-lg">

          {/* 存入隐私池 */}
          <div className="mb-7.5">
            {/* 标题行 */}
            <h3 className="text-base font-medium text-main mb-4">
              {t('deposit.depositToPrivacyPool')}
            </h3>
            {/* Approved 信息行 */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-black-9">
                {t('deposit.approved')} (USDT)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white">
                  {isLoadingAllowance ? t('common.loading') : authorizedAmount}
                </span>
                <button
                  onClick={fetchAllowance}
                  disabled={isLoadingAllowance || !isConnected || !address}
                  className="w-5 h-5 flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('common.refresh')}
                >
                  <SvgIcon
                    src="/icons/refresh.svg"
                    className={`w-4 h-4 text-black-9 ${isLoadingAllowance ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>

            {/* 金额输入框 */}
            <div className="relative p-4 w-full pr-10 bg-black-2 border-2 border-primary rounded-[12px] focus-within:outline-none focus-within:border-primary">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => handleDepositAmountChange(e.target.value)}
                className="w-full h-6 bg-transparent text-white text-lg font-medium focus:outline-none"
                placeholder="100.00"
              />
              {depositAmount && (
                <button
                  onClick={handleClearAmount}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black-9 hover:text-white"
                >
                  <SvgIcon src="/icons/common-close.svg" className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* 状态提示 */}
            {depositAmount && (
              <p
                className={`text-xs mt-2 ${
                  hasAuthorization ? "text-primary" : "text-red-500"
                }`}
              >
                {hasAuthorization
                  ? t('deposit.canDeposit')
                  : t('deposit.needAuthorize')}
              </p>
            )}
            {/* 风险评分和费率信息 */}
            <div className="mb-4 mt-4 p-4 bg-black-3 rounded-[12px]">
              {isFetchingRiskFee ? (
                <div className="text-sm text-black-9">{t('common.loading')}</div>
              ) : riskFeeInfo ? (
                <>
                  {/* 收缩状态：显示费率、风险评分、邀请码和展开按钮 */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-start justify-between flex-1 pr-4">
                      {/* 费率 */}
                      {riskFeeInfo.finalFeeRatePercent > 0 && (
                        <div className="flex flex-col gap-1.5 flex-1">
                          <span className="text-xs text-black-9 leading-tight">{t('deposit.feeRate')}</span>
                          <span className="text-sm text-white font-medium leading-tight">
                            {riskFeeInfo.finalFeeRatePercent.toFixed(2)}%
                          </span>
                        </div>
                      )}
                      {/* 风险评分 */}
                      <div className="flex flex-col gap-1.5 flex-1">
                        <span className="text-xs text-black-9 leading-tight">{t('deposit.riskScore')}</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-sm font-medium leading-tight ${
                            riskFeeInfo.riskLevel === 'low' ? 'text-green-500' :
                            riskFeeInfo.riskLevel === 'medium' ? 'text-yellow-500' :
                            riskFeeInfo.riskLevel === 'high' ? 'text-orange-500' :
                            'text-red-500'
                          }`}>
                            {riskFeeInfo.riskScore}
                          </span>
                          <span className="text-xs text-black-9 leading-tight">
                            ({riskFeeInfo.riskLevel})
                          </span>
                        </div>
                      </div>
                      {/* 显示邀请码（如果有） */}
                      {currentInvitationCode && (
                        <div className="flex flex-col gap-1.5 flex-1">
                          <span className="text-xs text-black-9 leading-tight">{t('deposit.promoCode') || '优惠码'}</span>
                          <span className="text-sm text-white font-medium leading-tight">
                            {currentInvitationCode}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setIsRiskFeeExpanded(!isRiskFeeExpanded)}
                      className="flex items-center justify-center w-6 h-6 text-black-9 hover:text-white transition-colors shrink-0"
                      title={isRiskFeeExpanded ? t('common.collapse') : t('common.expand')}
                    >
                      <SvgIcon
                        src="/icons/arrow-right-gray-icon.svg"
                        className={`w-4 h-4 transition-transform ${
                          isRiskFeeExpanded ? '-rotate-90' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* 展开状态：显示所有内容 */}
                  {isRiskFeeExpanded && (
                    <div className="mt-3 pt-3 border-t border-black-2 space-y-3">
                      {/* 优惠码输入区域 */}
                      <div>
                        <div
                          style={{ borderColor: "color-mix(in srgb, var(--primary) 50%, transparent)" }}
                          className="relative w-full bg-black-2 border rounded-[12px] focus-within:outline-none focus-within:border-primary flex items-center overflow-hidden"
                        >
                          <span className="px-3 text-xs text-black-9 whitespace-nowrap shrink-0">
                            {t('deposit.promoCode') || '优惠码'}
                          </span>
                          <input
                            type="text"
                            value={promoCode}
                            onChange={(e) => handlePromoCodeChange(e.target.value)}
                            className="flex-1 px-3 py-2.5 bg-transparent text-white text-xs focus:outline-none min-w-0"
                            placeholder={t('deposit.enterPromoCode')}
                            disabled={isBindingInvitationCode || isLoadingInvitationCode}
                          />
                          <div className="flex items-center shrink-0">
                            <button
                              onClick={handleRestoreInvitationCode}
                              disabled={!currentInvitationCode || isBindingInvitationCode || isLoadingInvitationCode}
                              className="px-2 py-2.5 text-black-9 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                              title={t('common.restore') || '恢复邀请码'}
                            >
                              <svg
                                className="h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={handleBindInvitationCode}
                              disabled={!promoCode.trim() || isBindingInvitationCode || isLoadingInvitationCode}
                              className="px-3 py-2.5 text-black bg-primary hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                              title={isBindingInvitationCode ? (t('common.binding') || '绑定中') : (t('common.bind') || '绑定')}
                            >
                              {isBindingInvitationCode ? (
                                <svg
                                  className="animate-spin h-4 w-4"
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
                              ) : (
                                <svg
                                  className="h-4 w-4"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                                  />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* 使用 AddressRankDisplayer 组件显示风险评分和最新读取时间 */}
                      {address && (
                        <div className="mt-2">
                          <AddressRankDisplayer
                            variant="compact"
                            address={address}
                            chainId={chainId ?? undefined}
                            riskScore={riskFeeInfo.riskScore}
                            riskLevel={riskFeeInfo.riskLevel}
                            metadata={riskFeeMetadata || undefined}
                            onRefresh={handleRefreshRiskFee}
                            loading={isFetchingRiskFee}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* 没有数据时也显示展开按钮和邀请码 */
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-black-9">{t('deposit.noRiskFeeInfo')}</span>
                    </div>
                    {/* 显示邀请码（如果有） */}
                    {currentInvitationCode && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-black-9">{t('deposit.promoCode') || '优惠码'}</span>
                        <span className="text-sm text-white font-medium">
                          {currentInvitationCode}
                        </span>
                      </div>
                    )}
                  </div>
                  {isConnected && address && (
                    <button
                      onClick={() => setIsRiskFeeExpanded(!isRiskFeeExpanded)}
                      className="flex items-center justify-center w-6 h-6 text-black-9 hover:text-white transition-colors shrink-0"
                      title={isRiskFeeExpanded ? t('common.collapse') : t('common.expand')}
                    >
                      <SvgIcon
                        src="/icons/arrow-right-gray-icon.svg"
                        className={`w-4 h-4 transition-transform ${
                          isRiskFeeExpanded ? '-rotate-90' : ''
                        }`}
                      />
                    </button>
                  )}
                </div>
              )}
              
              {/* 展开状态：没有数据时显示刷新按钮和邀请码输入 */}
              {isRiskFeeExpanded && !riskFeeInfo && isConnected && address && (
                <div className="mt-3 pt-3 border-t border-black-2 space-y-3">
                  {/* 优惠码输入区域 */}
                  <div>
                    <div
                      style={{ borderColor: "rgba(229, 242, 64, 0.5)" }}
                      className="relative w-full bg-black-2 border rounded-[12px] focus-within:outline-none focus-within:border-primary flex items-center overflow-hidden"
                    >
                      <span className="px-3 text-xs text-black-9 whitespace-nowrap shrink-0">
                        {t('deposit.promoCode') || '优惠码'}
                      </span>
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => handlePromoCodeChange(e.target.value)}
                        className="flex-1 px-3 py-2.5 bg-transparent text-white text-xs focus:outline-none min-w-0"
                        placeholder={t('deposit.enterPromoCode')}
                        disabled={isBindingInvitationCode || isLoadingInvitationCode}
                      />
                      <div className="flex items-center shrink-0">
                        <button
                          onClick={handleRestoreInvitationCode}
                          disabled={!currentInvitationCode || isBindingInvitationCode || isLoadingInvitationCode}
                          className="px-2 py-2.5 text-black-9 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                          title={t('common.restore') || '恢复邀请码'}
                        >
                          <svg
                            className="h-4 w-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={handleBindInvitationCode}
                          disabled={!promoCode.trim() || isBindingInvitationCode || isLoadingInvitationCode}
                          className="px-3 py-2.5 text-black bg-primary hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                          title={isBindingInvitationCode ? (t('common.binding') || '绑定中') : (t('common.bind') || '绑定')}
                        >
                          {isBindingInvitationCode ? (
                            <svg
                              className="animate-spin h-4 w-4"
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
                          ) : (
                            <svg
                              className="h-4 w-4"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleRefreshRiskFee}
                      disabled={isFetchingRiskFee}
                      className="flex items-center gap-1 text-sm text-black-9 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t('deposit.refreshRiskFee')}
                    >
                      <SvgIcon
                        src="/icons/refresh.svg"
                        className={`w-4 h-4 ${isFetchingRiskFee ? 'animate-spin' : ''}`}
                      />
                      <span>{t('common.refresh')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 存款按钮 */}
          <div className="flex flex-col items-center">
            <button
              onClick={
                isAuthorizing || isDepositing || isRiskScoreTooHigh
                  ? undefined
                  : hasAuthorization
                  ? handleDeposit
                  : handleAuthorization
              }
              disabled={!isAmountValid || isAuthorizing || isDepositing || isRiskScoreTooHigh}
              className={`w-[230px] h-12 rounded-[14px] font-medium text-sm text-black bg-primary flex items-center justify-center gap-2 ${
                !isAmountValid || isAuthorizing || isDepositing || isRiskScoreTooHigh ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {(isAuthorizing || isDepositing) && (
                <svg
                  className="animate-spin h-4 w-4 text-black"
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
              {isAuthorizing
                ? t('deposit.authorizing')
                : isDepositing
                ? t('deposit.depositing')
                : !hasAuthorization
                ? t('deposit.authorize')
                : t('deposit.deposit')}
            </button>
            {/* 金额不足提示 - 显示在按钮下方单独一行 */}
            {!isAmountValid && (
              <p className="text-xs text-black-9 text-center mt-2 w-full">
                {t('deposit.minDepositError', { min: minDepositAmount })}
              </p>
            )}
            {/* 风险评分过高提示 */}
            {isRiskScoreTooHigh && (
              <p className="text-xs text-red-500 text-center mt-2 w-full">
                {t('deposit.riskScoreTooHigh') || '风险评分过高，无法进行存入操作'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 存款记录 */}
      <div className="">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-main">{t('deposit.depositRecords')}</span>
            {/* 测试按钮：打开生成凭证弹框 */}
            {/* <button
              onClick={handleTestOpenVoucherSheet}
              className="px-3 py-1 text-xs bg-primary text-black rounded-[12px] font-medium hover:bg-primary-dark transition-colors"
              title="测试：打开生成凭证弹框"
            >
              测试生成凭证
            </button> */}
            <button
              onClick={async () => {
                if (sdkStore.sdk && isConnected && address && !isRefreshing) {
                  setIsRefreshing(true)
                  try {
                    const result = await fetchCheckbooks({ 
                      deleted: isDeleted,
                      page: currentPage,
                      limit: pageSize
                    })
                    if (result.pagination) {
                      setPagination({
                        page: result.pagination.page || currentPage,
                        size: result.pagination.limit || result.pagination.size || pageSize,
                        total: result.pagination.total || 0,
                        pages: result.pagination.totalPages || result.pagination.pages || 1
                      })
                    }
                  } catch (err) {
                    console.error('刷新存款记录失败:', err)
                  } finally {
                    setIsRefreshing(false)
                  }
                }
              }}
              className="p-1 hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed relative z-10 flex items-center justify-center"
              disabled={!isConnected || !address || !sdkStore.sdk || isRefreshing}
              title={t('deposit.refreshDepositRecords')}
            >
              <SvgIcon
                src="/icons/refresh.svg"
                className={`w-4 h-4 text-black-9 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-black-9">{t('deposit.deleted')}</span>
            <button
              onClick={async () => {
                const newIsDeleted = !isDeleted
                setIsDeleted(newIsDeleted)
                setCurrentPage(1) // 重置到第一页
                // 切换后重新获取数据
                if (sdkStore.sdk && isConnected && address) {
                  try {
                    const result = await fetchCheckbooks({ 
                      deleted: newIsDeleted,
                      page: 1,
                      limit: pageSize
                    })
                    if (result.pagination) {
                      setPagination({
                        page: result.pagination.page || 1,
                        size: result.pagination.limit || result.pagination.size || pageSize,
                        total: result.pagination.total || 0,
                        pages: result.pagination.totalPages || result.pagination.pages || 1
                      })
                    }
                  } catch (err) {
                    console.error('刷新存款记录失败:', err)
                  }
                }
              }}
              className={`relative w-10 h-5 rounded-[20%] transition-colors ${
                isDeleted ? "bg-primary" : "bg-black-3"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-[20%] transition-transform ${
                  isDeleted ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* 存款记录列表 */}
        <div className="space-y-4">
          {depositRecords.length === 0 ? (
            <div className="text-center text-black-9 py-8">
              {isConnected ? t('deposit.noDepositRecords') : t('deposit.connectWalletFirst')}
            </div>
          ) : (
            depositRecords.map((record) => (
            <DepositRecord
              key={record.id}
              record={record}
              onAllocateVoucher={record.canAllocate ? () => handleAllocateVoucher(record) : undefined}
              onViewVoucherDetails={record.status === "已分配" ? () => handleViewVoucherDetails(record.id) : undefined}
              onRefresh={() => handleRefreshRecord(record.id)}
              onClose={() => handleCloseRecord(record.id)}
              onRetry={
                (record.checkbookStatus === 'proof_failed' || record.checkbookStatus === 'submission_failed')
                  ? () => handleRetryCheckbook(record)
                  : undefined
              }
            />
            ))
          )}
        </div>

        {/* 分页导航 */}
        {pagination && pagination.pages > 1 && (
          <div className="mt-6">
            <Pagination
              currentPage={currentPage}
              totalPages={pagination.pages}
              total={pagination.total}
              pageSize={pagination.size}
              onPageChange={(page) => {
                setCurrentPage(page)
                // 滚动到顶部
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </div>
        )}
      </div>

      {/* 处理底部弹出 */}
      <BottomSheet
        isOpen={processingSheet.isOpen}
        onClose={() => {
          setIsAutoClosing(false)
          countdownInitializedRef.current = false
          // 清理进度条定时器
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current)
            progressTimerRef.current = null
          }
          // 不立即重置倒计时，避免关闭瞬间看到15
          // 倒计时会在下次弹窗打开时自动重置
          processingSheet.close()
        }}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-black-2"
      >
        <div className="p-4 relative">
          {/* 倒计时显示 - 右上角 */}
          {isAutoClosing && (
            <div className="absolute top-4 right-4 px-3 py-1.5 bg-black-3/80 backdrop-blur-sm rounded-[20%] text-xs text-black-9 z-10">
              <span>{t('deposit.processingModal.autoCloseLabel')}</span>
              <span className="font-medium text-primary ml-1">
                {t('deposit.processingModal.autoCloseCountdown', { seconds: processingCountdown })}
              </span>
            </div>
          )}
          
          {/* 动画图标 */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative mb-6">
              <SvgIcon src="/icons/loading.svg" />
            </div>

            {/* 进度条 */}
            <div className="w-64 h-[6px] bg-black-3 rounded-[20%] mb-4">
              <div
                className="h-full bg-primary rounded-[20%] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* 标题 */}
          <h1 className="text-xl font-medium text-black-9 mb-4 text-center">
            {t('deposit.processingModal.title')}
          </h1>

          {/* 说明文字 */}
          <p className="text-black-9 px-4 mb-6 leading-relaxed">
            {t('deposit.processingModal.description')}
          </p>

          {/* 交易哈希 */}
          <div className="rounded-[12px] border border-black-3 text-black-9 text-sm p-4 mb-6">
            <p>{t('deposit.processingModal.txHashLabel')}:</p>
            <p className="break-all">
              {processingSheet.data?.txHash || txHash}
            </p>
          </div>

          {/* 取消等待按钮 */}
          <div className="flex justify-center">
            {" "}
            <div>
              <button
                onClick={handleCancelWaiting}
                className="w-[220px] bg-primary text-black py-3 rounded-[14px]  transition-colors"
              >
                {isAutoClosing
                  ? t('deposit.processingModal.cancelWaitCountdown', { seconds: processingCountdown })
                  : t('deposit.processingModal.cancelWait')}
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* 分配凭证底部弹出 */}
      <BottomSheet
        isOpen={voucherSheet.isOpen}
        onClose={voucherSheet.close}
        height="auto"
        showCloseButton={false}
        className="bg-black-2"
      >
        <VoucherAllocation
          totalAmount={voucherSheet.data?.totalAmount || 1.058}
          originalAmount={voucherSheet.data?.originalAmount}
          actualFee={voucherSheet.data?.actualFee}
          onGenerate={handleGenerateVouchers}
          onClose={voucherSheet.close}
        />
      </BottomSheet>

      {/* 凭证生成进度模态框 */}
      <BottomSheet
        isOpen={voucherGeneratingSheet.isOpen}
        onClose={async () => {
          voucherGeneratingSheet.close()
          // 关闭后刷新 checkbooks 数据
          if (address) {
            console.log('🔄 [DepositPage] 关闭凭证生成弹窗，刷新 checkbooks 数据')
            try {
              const result = await fetchCheckbooks({ 
                deleted: isDeleted,
                page: currentPage,
                limit: pageSize
              })
              if (result.pagination) {
                setPagination({
                  page: result.pagination.page || currentPage,
                  size: result.pagination.limit || result.pagination.size || pageSize,
                  total: result.pagination.total || 0,
                  pages: result.pagination.totalPages || result.pagination.pages || 1
                })
              }
            } catch (error) {
              console.error('刷新 checkbooks 数据失败:', error)
            }
          }
        }}
        showCloseButton={false}
        className="bg-black-1"
      >
        <VoucherGeneratingSheet
          onClose={async () => {
            voucherGeneratingSheet.close()
            // 关闭后刷新 checkbooks 数据
            if (address) {
              console.log('🔄 [DepositPage] 关闭凭证生成弹窗，刷新 checkbooks 数据')
              try {
                const result = await fetchCheckbooks({ 
                  deleted: isDeleted,
                  page: currentPage,
                  limit: pageSize
                })
                if (result.pagination) {
                  setPagination({
                    page: result.pagination.page || currentPage,
                    size: result.pagination.limit || result.pagination.size || pageSize,
                    total: result.pagination.total || 0,
                    pages: result.pagination.totalPages || result.pagination.pages || 1
                  })
                }
              } catch (error) {
                console.error('刷新 checkbooks 数据失败:', error)
              }
            }
          }}
          status={voucherGeneratingSheet.data?.status || 'generating'}
          errorMessage={voucherGeneratingSheet.data?.errorMessage}
        />
      </BottomSheet>
    </div>
  )
}

export default observer(DepositPage)
