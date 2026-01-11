'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { usePathname } from 'next/navigation'
import SvgIcon from '@/components/ui/SvgIcon'
import { AddressDisplay } from '@/components/ui/address-display'
import { AddressRankDisplayer } from '@/components/ui/address-rank-displayer'
import { useBottomSheetContext } from '@/components/providers/bottom-sheet-provider'
import { useWithdrawRequestObserver, type PaginationInfo } from '@/lib/hooks/use-withdraw-request'
import { useWalletConnection } from '@/lib/hooks/use-wallet-connection'
import { useSDKStore } from '@/lib/stores/sdk-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getChainName, getEvmChainIdFromSlip44, getSlip44FromChainId } from '@enclave-hq/sdk'
import Pagination from '@/components/ui/pagination'
import { hexToTronAddress } from '@/lib/utils/tron-address-converter'

// 删除确认内容组件
interface DeleteConfirmContentProps {
  record: {
    date: string
    type: string
    amount: string
    recipient: string
    gasFee: string
  }
  onConfirm: () => void
  onCancel: () => void
}

const DeleteConfirmContent: React.FC<DeleteConfirmContentProps & { t: (key: string) => string }> = ({
  record,
  onConfirm,
  onCancel,
  t,
}) => {
  return (
    <div className="p-4 space-y-4">
      {/* 交易详情 */}
      <div className=" bg-black-3 divide-y divide-black-4 rounded-[12px] px-4 py-3 text-white text-sm">
        <div className="flex justify-between py-3">
          <span>{t('records.date')}: {record.date}</span>
          <span>{t('records.type')}: {record.type}</span>
        </div>

        <div className="flex justify-between py-3">
          <span>{t('records.amount')}: {record.amount}</span>
          <div className="flex items-center gap-2">
            <span className="text-black-9">{t('records.to')}</span>
            {record.recipient ? (
              <AddressDisplay address={record.recipient} chainId={(record as any).targetChainId} className="flex-1" />
            ) : (
              <span className="text-black-9">{t('records.unknownAddress')}</span>
            )}
          </div>
        </div>

        <div className="flex justify-between py-3">
          <span>{t('records.gasFee')}</span>
          <span>{record.gasFee}</span>
        </div>
      </div>

      {/* 警告提示 */}
      <p className="text-danger text-sm text-center mb-8 leading-relaxed">
        {t('records.deleteConfirm.message')}
      </p>

      {/* 按钮组 */}
      <div className="flex gap-3 px-7">
        <button
          onClick={onCancel}
          className="flex-1 py-2 border border-danger text-white rounded-[14px]  transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2 bg-danger text-white rounded-[14px]  transition-colors"
        >
          {t('records.deleteConfirm.title')}
        </button>
      </div>
    </div>
  )
}

function RecordsPageComponent() {
  const { openBottomSheet, closeBottomSheet } = useBottomSheetContext()
  const { address, isConnected } = useWalletConnection()
  const { t } = useTranslation()
  const { fetchListWithPagination, all } = useWithdrawRequestObserver()
  const sdkStore = useSDKStore()
  const pathname = usePathname()
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10) // 默认每页10条
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  })
  const [loading, setLoading] = useState(false)
  // 风险评分状态：记录ID -> { riskScore, riskLevel, metadata, lastQueryTime, loading }
  const [riskScores, setRiskScores] = useState<Record<string, {
    riskScore: number | null
    riskLevel: string | null
    metadata: any | null
    lastQueryTime: Date | null
    loading: boolean
  }>>({})

  // 使用 SDK store 的响应式数据
  // 当 SDK store 更新时，all 会自动更新，组件会重新渲染
  const allWithdrawals = useMemo(() => all || [], [all])

  // 初始加载数据
  const loadWithdrawals = async (page: number) => {
    // 检查钱包和 SDK 是否都已连接
    if (!isConnected || !address || !sdkStore.sdk || !sdkStore.isConnected) {
      return
    }
    
    setLoading(true)
    try {
      const result = await fetchListWithPagination({
        page,
        limit: pageSize,
      })
      // 注意：这里不再设置 withdrawals state，而是直接使用 all
      // SDK 会自动更新 all，页面会响应式更新
      setPagination(result.pagination)
    } catch (err) {
      console.error('加载提款记录失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 刷新数据
  const handleRefresh = async () => {
    if (!isConnected || !address || !sdkStore.sdk || !sdkStore.isConnected) return
    await loadWithdrawals(currentPage)
  }

  // 加载提款记录 - 监听钱包连接、地址、SDK 连接状态和页码变化
  useEffect(() => {
    if (isConnected && address && sdkStore.sdk && sdkStore.isConnected) {
      loadWithdrawals(currentPage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, sdkStore.sdk, sdkStore.isConnected, currentPage])
  
  // 当路由跳转到 Records 页面时，重置到第一页并刷新数据
  // 这样从 ProcessingSheet 跳转过来时，新记录会显示在最上面
  useEffect(() => {
    if (pathname === '/records' && isConnected && address && sdkStore.sdk && sdkStore.isConnected) {
      // 如果当前不在第一页，重置到第一页
      if (currentPage !== 1) {
        setCurrentPage(1)
      } else {
        // 如果已经在第一页，直接刷新数据
        loadWithdrawals(1)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // 使用响应式数据：当 SDK store 更新时，自动更新分页信息
  useEffect(() => {
    if (allWithdrawals.length > 0) {
      // 更新分页信息（基于实际数据）
      const total = allWithdrawals.length
      const totalPages = Math.ceil(total / pageSize)
      const hasNext = currentPage < totalPages
      const hasPrev = currentPage > 1
      
      setPagination({
        page: currentPage,
        limit: pageSize,
        total,
        totalPages,
        hasNext,
        hasPrev,
      })
    }
  }, [allWithdrawals.length, currentPage, pageSize])

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setCurrentPage(newPage)
    }
  }

  // 将 WithdrawRequests 转换为交易记录格式，并按 created_at 倒序排列
  // 使用响应式数据 allWithdrawals，当 SDK 更新数据时会自动重新计算
  const transactionRecords = useMemo(() => {
    // 确保翻译已加载
    if (!t || typeof t !== 'function') {
      console.warn('Translation function not available')
      return []
    }
    // 先按 created_at 倒序排序
    const sortedWithdrawals = [...allWithdrawals].sort((a: any, b: any) => {
      // 支持 created_at 和 createdAt 两种格式
      const aTime = a.created_at || a.createdAt
      const bTime = b.created_at || b.createdAt
      
      // 处理时间戳（数字）和日期字符串两种格式
      const aTimestamp = typeof aTime === 'number' 
        ? aTime 
        : aTime 
          ? new Date(aTime).getTime() 
          : 0
      const bTimestamp = typeof bTime === 'number' 
        ? bTime 
        : bTime 
          ? new Date(bTime).getTime() 
          : 0
      
      // 倒序排列（最新的在前）
      return bTimestamp - aTimestamp
    })
    console.log('sortedWithdrawals', sortedWithdrawals)
    return sortedWithdrawals.map((withdrawal: any) => {
      // 优先使用实际到账金额（payoutAmount），如果没有则使用 amount 或 totalAmount
      // payoutAmount 是实际支付到钱包的金额，amount 是请求的金额（可能包含手续费等）
      const amountValue = withdrawal.payoutAmount || 
                         withdrawal.payout_amount || 
                         withdrawal.amount || 
                         withdrawal.totalAmount || 
                         '0'
      // Enclave 系统中统一使用 18 位 decimal
      const decimals = 18
      
      // 根据 decimals 转换金额
      const amount = typeof amountValue === 'string' 
        ? parseFloat(amountValue) / Math.pow(10, decimals)
        : amountValue / Math.pow(10, decimals)
      
      // 使用 created_at 或 createdAt（优先使用 created_at）
      const createdAt = withdrawal.created_at || withdrawal.createdAt
      const date = createdAt 
        ? (() => {
            // 处理时间戳（数字）和日期字符串两种格式
            const timestamp = typeof createdAt === 'number' 
              ? createdAt 
              : new Date(createdAt).getTime()
            return new Date(timestamp).toLocaleString('zh-CN', { 
              year: 'numeric', 
              month: '2-digit', 
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          })()
        : new Date().toLocaleString('zh-CN')
      
      // 根据 intent 类型确定交易类型
      const intentType = withdrawal.intent?.type
      let type = t('records.transactionTypes.extract')
      if (intentType === 1 || intentType === 'AssetToken') {
        type = t('records.transactionTypes.buyAsset')
      } else if (intentType === 0 || intentType === 'RawToken') {
        type = t('records.transactionTypes.extractToken')
      }
      
      // 根据四种状态计算最终状态和按钮：proof_status, execute_status, payout_status, hook_status
      // 按阶段顺序检查，只有前一阶段成功后才检查下一阶段
      const calculateStatusAndActions = (withdrawal: any): { statusText: string; buttons: Array<{ text: string; action: string }> } => {
        // 优先检查 status 字段，如果为 cancelled，直接返回已取消状态且无按钮
        const withdrawalStatus = withdrawal.status || withdrawal.frontendStatus
        if (withdrawalStatus === 'cancelled') {
          return {
            statusText: t('records.status.cancelled'),
            buttons: []
          }
        }
        
        // 获取四种状态（支持驼峰和下划线两种命名）
        const proofStatus = withdrawal.proofStatus || withdrawal.proof_status || 'pending'
        const executeStatus = withdrawal.executeStatus || withdrawal.execute_status || 'pending'
        const payoutStatus = withdrawal.payoutStatus || withdrawal.payout_status || 'pending'
        const hookStatus = withdrawal.hookStatus || withdrawal.hook_status || 'not_required'
        
        // 获取交易哈希（支持驼峰和下划线两种命名）
        const executeTxHash = withdrawal.executeTxHash || withdrawal.execute_tx_hash
        const payoutTxHash = withdrawal.payoutTxHash || withdrawal.payout_tx_hash
        const hookTxHash = withdrawal.hookTxHash || withdrawal.hook_tx_hash
        
        
        // 辅助函数：根据状态和哈希添加"查看交易"按钮
        const addViewTransactionButtons = (buttons: Array<{ text: string; action: string }>, withdrawal: any) => {
          const newButtons = [...buttons]
          // 如果 execute_status 是 success 或 verify_failed，且有 execute_tx_hash，添加"查看交易"按钮
          if ((executeStatus === 'success' || executeStatus === 'verify_failed') && executeTxHash) {
            newButtons.push({ text: t('records.actions.viewExecuteTx'), action: `view_execute_tx:${executeTxHash}` })
          }
          // 如果 payout_status 是 completed 或 failed，且有 payout_tx_hash，添加"查看交易"按钮
          if ((payoutStatus === 'completed' || payoutStatus === 'failed') && payoutTxHash) {
            newButtons.push({ text: t('records.actions.viewPayoutTx'), action: `view_payout_tx:${payoutTxHash}` })
          }
          // 如果 hook_status 是 completed 或 failed，且有 hook_tx_hash，添加"查看交易"按钮
          if ((hookStatus === 'completed' || hookStatus === 'failed') && hookTxHash) {
            newButtons.push({ text: t('records.actions.viewHookTx'), action: `view_hook_tx:${hookTxHash}` })
          }
          return newButtons
        }
        
        // 阶段1: Proof Generation (proof_status)
        // 如果已经有交易哈希（execute 或 payout），说明已经进入后续阶段，跳过 proof 检查
        if (executeTxHash || payoutTxHash) {
          // 已经有交易哈希，说明 proof 已经完成，直接进入后续阶段检查
        } else if (proofStatus === 'failed') {
          return {
            statusText: t('records.status.proofFailed'),
            buttons: [
              { text: t('records.actions.regenerate'), action: 'regenerate_proof' },
              { text: t('records.actions.cancelWithdrawal'), action: 'cancel_withdrawal' }
            ]
          }
        } else if (proofStatus !== 'completed') {
          // 如果 proof 未完成，还在进行中
          return {
            statusText: t('records.status.generatingProof'),
            buttons: []
          }
        }
        
        // 阶段2: On-chain Verification (execute_status) - 只有 proof 完成后才检查
        if (executeStatus === 'submit_failed') {
          const buttons = [
            { text: t('records.actions.regenerate'), action: 'regenerate_proof' },
            { text: t('records.actions.cancelWithdrawal'), action: 'cancel_withdrawal' }
          ]
          return {
            statusText: t('records.status.submitFailed'),
            buttons: addViewTransactionButtons(buttons, withdrawal)
          }
        }
        
        if (executeStatus === 'verify_failed') {
          const buttons = [
            { text: t('records.actions.cancelWithdrawal'), action: 'cancel_withdrawal' }
          ]
          return {
            statusText: t('records.status.submitFailed'),
            buttons: addViewTransactionButtons(buttons, withdrawal)
          }
        }
        // 如果 execute 未成功，还在进行中
        if (executeStatus !== 'success') {
          return {
            statusText: t('records.status.submitting'),
            buttons: []
          }
        }
        
        // 阶段3: Intent Execution (payout_status) - 只有 execute 成功后才检查
        if (payoutStatus === 'failed') {
          const buttons = [
            { text: t('records.actions.contactSupport'), action: 'contact_support' }
          ]
          return {
            statusText: t('records.status.failed'),
            buttons: addViewTransactionButtons(buttons, withdrawal)
          }
        }
        // 如果 payout 未完成，还在进行中
        if (payoutStatus !== 'completed') {
          return {
            statusText: t('records.status.executing'),
            buttons: []
          }
        }
        
        // payout 完成后，检查 hook 状态
        // 如果 hook 不需要（not_required），第三阶段完成就完成了
        if (hookStatus === 'not_required') {
          return {
            statusText: t('records.status.completed'),
            buttons: addViewTransactionButtons([], withdrawal)
          }
        }
        
        // 阶段4: Hook Purchase (hook_status) - 可选阶段，只有 payout 完成后且 hook 需要时才检查
        // 如果 hook 被放弃（abandoned），也算完成
        if (hookStatus === 'abandoned') {
          return {
            statusText: t('records.status.completed'),
            buttons: addViewTransactionButtons([], withdrawal)
          }
        }
        
        // Hook 是必需的，检查 hook 状态
        if (hookStatus === 'failed') {
          // Hook 失败但 payout 已完成，显示"已完成"（因为主要交易已完成）
          return {
            statusText: t('records.status.completed'),
            buttons: addViewTransactionButtons([], withdrawal)
          }
        }
        if (hookStatus !== 'completed') {
          return {
            statusText: t('records.status.processing'),
            buttons: []
          }
        }
        
        // 所有阶段都完成（包括 hook）
        return {
          statusText: t('records.status.completed'),
          buttons: addViewTransactionButtons([], withdrawal)
        }
      }
      
      // 使用综合状态计算函数
      let { statusText, buttons } = calculateStatusAndActions(withdrawal)
      
      // 如果没有四种状态数据，回退到原来的逻辑
      const hasSubStatuses = 
        (withdrawal.proofStatus || withdrawal.proof_status) ||
        (withdrawal.executeStatus || withdrawal.execute_status) ||
        (withdrawal.payoutStatus || withdrawal.payout_status) ||
        (withdrawal.hookStatus || withdrawal.hook_status)
      
      if (!hasSubStatuses) {
        // 回退到原来的逻辑
        const status = withdrawal.frontendStatus || withdrawal.status
        if (status === 'cancelled') {
          statusText = t('records.status.cancelled')
          buttons = []
        } else if (status === 'completed') {
          statusText = t('records.status.completed')
          buttons = []
        } else if (status === 'failed' || status === 'failed_permanent') {
          statusText = t('records.status.failed')
          buttons = []
        } else {
          statusText = t('records.status.processing')
          buttons = []
        }
      }
      
      // 获取 Gas 费用（从 quote 或 withdrawal 中获取）
      const gasFee = withdrawal.fees?.summary?.totalGasCostUSD || '0.005'
      
      // 获取目标地址（Universal Address 格式）
      let recipientAddress = withdrawal.beneficiary?.address || withdrawal.beneficiary?.universalFormat || ''
      
      // 如果地址是 Universal Format 字符串（如 "195:TGXAL7..."），解析出地址部分
      if (recipientAddress.includes(':') && recipientAddress.split(':').length === 2) {
        const [, addressPart] = recipientAddress.split(':')
        recipientAddress = addressPart
      }
      
      // 获取目标链信息，确保转换为数字
      const rawTargetChainId = withdrawal.beneficiary?.chainId || withdrawal.targetChain || withdrawal.target_chain
      const targetChainId = typeof rawTargetChainId === 'string' ? parseInt(rawTargetChainId, 10) : rawTargetChainId
      const targetChainName = targetChainId ? getChainName(targetChainId) : t('records.unknownChain')
      
      // 如果是 TRON 链（195）且地址是十六进制格式，转换为 Base58
      const originalRecipientAddress = recipientAddress
      if (targetChainId === 195 && recipientAddress && !recipientAddress.startsWith('T') && !recipientAddress.startsWith('t')) {
        try {
          const base58Address = hexToTronAddress(recipientAddress)
          if (base58Address && base58Address.startsWith('T')) {
            recipientAddress = base58Address
          }
        } catch (error) {
          console.warn('[Records] TRON 地址转换失败，使用原始地址:', error, {
            original: originalRecipientAddress,
            targetChainId,
          })
        }
      }
      
      // 获取所有交易哈希和对应的链ID
      // execute_tx_hash: 执行 executeWithdraw 的交易哈希（WithdrawRequested 事件对应的交易哈希）
      const executeTxHash = withdrawal.executeTxHash || withdrawal.execute_tx_hash
      const executeChainId = withdrawal.executeChainId || withdrawal.execute_chain_id
      // payout_tx_hash: 执行 payout 的交易哈希
      const payoutTxHash = withdrawal.payoutTxHash || withdrawal.payout_tx_hash
      const payoutChainId = withdrawal.payoutChainId || withdrawal.payout_chain_id
      // hook_tx_hash: 执行 hook purchase 的交易哈希
      const hookTxHash = withdrawal.hookTxHash || withdrawal.hook_tx_hash
      const hookChainId = withdrawal.hookChainId || withdrawal.hook_chain_id
      
      return {
        id: withdrawal.id,
        date,
        type,
        amount: `${amount.toFixed(2)} USDT`,
        recipient: recipientAddress, // 保存完整地址，用于 AddressDisplay 组件
        gasFee: typeof gasFee === 'string' ? gasFee : gasFee.toString(),
        status: statusText,
        buttons, // 状态对应的按钮
        targetChainId, // 目标链ID
        targetChainName, // 目标链名称
        executeTxHash, // Execute 交易哈希
        executeChainId, // Execute 链ID
        payoutTxHash, // Payout 交易哈希
        payoutChainId, // Payout 链ID
        hookTxHash, // Hook 交易哈希
        hookChainId, // Hook 链ID
        txHash: executeTxHash || payoutTxHash || undefined, // 只在有真实交易哈希时设置，不使用 UUID
        withdrawal, // 保存原始数据
      }
    })
  }, [allWithdrawals, t])

  // 根据链ID获取区块链浏览器URL
  const getExplorerUrl = (txHash: string, chainId?: number | string): string | null => {
    if (!txHash) {
      console.warn('getExplorerUrl: 缺少交易哈希')
      return null
    }
    
    // 如果 chainId 是字符串，尝试转换为数字
    let numericChainId: number | undefined
    if (typeof chainId === 'string') {
      numericChainId = parseInt(chainId, 10)
      if (isNaN(numericChainId)) {
        console.warn('getExplorerUrl: 无效的链ID字符串:', chainId)
        return null
      }
    } else {
      numericChainId = chainId
    }
    
    if (!numericChainId) {
      console.warn('getExplorerUrl: 缺少链ID, txHash:', txHash)
      return null
    }
    
    // 如果是 SLIP-44 chainId，转换为 EVM chainId
    const evmChainId = getEvmChainIdFromSlip44(numericChainId) || numericChainId
    
    console.log('getExplorerUrl: chainId:', numericChainId, 'evmChainId:', evmChainId, 'txHash:', txHash)
    
    // 构建区块链浏览器链接
    if (evmChainId === 1 || numericChainId === 60) { // Ethereum (EVM: 1, SLIP-44: 60)
      return `https://etherscan.io/tx/${txHash}`
    } else if (evmChainId === 56 || numericChainId === 714) { // BSC (EVM: 56, SLIP-44: 714)
      return `https://bscscan.com/tx/${txHash}`
    } else if (numericChainId === 195 || numericChainId === 714) { // TRON (SLIP-44: 195, 原生: 714)
      return `https://tronscan.org/#/transaction/${txHash}`
    } else if (evmChainId === 137 || numericChainId === 966) { // Polygon (EVM: 137, SLIP-44: 966)
      return `https://polygonscan.com/tx/${txHash}`
    }
    
    console.warn('getExplorerUrl: 不支持的链ID:', numericChainId, 'evmChainId:', evmChainId)
    return null
  }

  const handleViewTransaction = (txHash: string, chainId?: number | string) => {
    console.log('handleViewTransaction called:', { txHash, chainId })
    
    if (!txHash) {
      console.warn('handleViewTransaction: 缺少交易哈希')
      return
    }
    
    // 验证是否为有效的交易哈希格式（0x开头，66字符，或TRON格式）
    const isValidTxHash = (hash: string): boolean => {
      // EVM 交易哈希：0x + 64 个十六进制字符 = 66 字符
      if (hash.startsWith('0x') && hash.length === 66) {
        return /^0x[0-9a-fA-F]{64}$/.test(hash)
      }
      // TRON 交易哈希：64 个十六进制字符（无 0x 前缀）
      if (!hash.startsWith('0x') && hash.length === 64) {
        return /^[0-9a-fA-F]{64}$/.test(hash)
      }
      return false
    }
    
    // 如果不是有效的交易哈希格式，不打开链接
    if (!isValidTxHash(txHash)) {
      console.warn('无效的交易哈希格式（可能是UUID）:', txHash)
      return
    }
    
    const explorerUrl = getExplorerUrl(txHash, chainId)
    if (explorerUrl) {
      console.log('打开交易链接:', explorerUrl)
      window.open(explorerUrl, '_blank')
    } else {
      console.warn('无法生成交易链接 - 不支持的链ID或缺少交易哈希:', { chainId, txHash })
    }
  }

  const handleDeleteRecords = (record: typeof transactionRecords[0]) => {
    openBottomSheet({
      title: t('records.deleteRecord'),
      height: 'auto',
      closeOnOverlayClick: true,
      showCloseButton: false,
      children: (
        <DeleteConfirmContent
          record={record}
          onConfirm={() => handleConfirmDelete(record.id)}
          onCancel={closeBottomSheet}
          t={t}
        />
      ),
    })
  }

  const handleConfirmDelete = (recordId: string) => {
    console.log('确认删除交易记录:', recordId)
    // 注意：实际删除操作需要后端支持
    // 这里只是前端移除显示，实际数据仍在后端
    closeBottomSheet()
    // TODO: 调用后端 API 删除记录（如果支持）
  }

  // 获取接收地址的风险评分
  const fetchRiskScore = async (recordId: string, recipientAddress: string, targetChainId: number | undefined) => {
    if (!sdkStore.sdk || !recipientAddress || !targetChainId) {
      return
    }

    // 设置加载状态
    setRiskScores(prev => ({
      ...prev,
      [recordId]: {
        ...prev[recordId],
        loading: true,
      }
    }))

    try {
      // 转换链ID为链名称
      const slip44ChainId = getSlip44FromChainId(targetChainId) || targetChainId
      let chainName = 'bsc' // 默认 BSC
      if (slip44ChainId === 60) {
        chainName = 'ethereum'
      } else if (slip44ChainId === 714) {
        chainName = 'bsc'
      } else if (slip44ChainId === 966) {
        chainName = 'polygon'
      } else if (slip44ChainId === 195) {
        chainName = 'tron'
      }

      // 使用 SDK 的 KYT Oracle API 获取风险评分（GET - 从缓存读取，不调用 MistTrack API）
      console.log('[Risk Score] Auto fetch using GET (cache only)')
      const response = await sdkStore.sdk.kytOracle.getFeeInfoByAddress({
        address: recipientAddress,
        chain: chainName,
        tokenKey: 'USDT',
      })

      // Type assertion for metadata field (may not be in compiled types yet)
      const responseWithMetadata = response as typeof response & { metadata?: any }

      if (response.success && response.data) {
        const data = response.data
        setRiskScores(prev => ({
          ...prev,
          [recordId]: {
            riskScore: data.riskScore,
            riskLevel: data.riskLevel,
            metadata: responseWithMetadata.metadata ? {
              ...responseWithMetadata.metadata,
              queryTime: responseWithMetadata.metadata.queryTime || response.last_query_time || new Date().toISOString(),
            } : {
              mistTrackDetails: null,
              queryTime: response.last_query_time || new Date().toISOString(),
            },
            lastQueryTime: response.last_query_time ? new Date(response.last_query_time) : new Date(),
            loading: false,
          }
        }))
      } else {
        // 如果限流，使用上次查询的结果
        if (response.risk_score !== undefined) {
          setRiskScores(prev => ({
            ...prev,
            [recordId]: {
              riskScore: response.risk_score || null,
              riskLevel: response.risk_level || null,
              metadata: responseWithMetadata.metadata || prev[recordId]?.metadata || null,
              lastQueryTime: response.last_query_time ? new Date(response.last_query_time) : null,
              loading: false,
            }
          }))
        } else {
          setRiskScores(prev => ({
            ...prev,
            [recordId]: {
              ...prev[recordId],
              loading: false,
            }
          }))
        }
      }
    } catch (err) {
      console.error('获取风险评分失败:', err)
      setRiskScores(prev => ({
        ...prev,
        [recordId]: {
          ...prev[recordId],
          loading: false,
        }
      }))
    }
  }

  // 刷新风险评分（使用 POST 强制刷新）
  const handleRefreshRiskScore = async (record: typeof transactionRecords[0]) => {
    const recipientAddress = record.recipient
    const targetChainId = (record as any).targetChainId
    if (!sdkStore.sdk || !recipientAddress || !targetChainId) {
      return
    }

    // 设置加载状态
    setRiskScores(prev => ({
      ...prev,
      [record.id]: {
        ...prev[record.id],
        loading: true,
      }
    }))

    try {
      // 转换链ID为链名称
      const slip44ChainId = getSlip44FromChainId(targetChainId) || targetChainId
      let chainName = 'bsc' // 默认 BSC
      if (slip44ChainId === 60) {
        chainName = 'ethereum'
      } else if (slip44ChainId === 714) {
        chainName = 'bsc'
      } else if (slip44ChainId === 966) {
        chainName = 'polygon'
      } else if (slip44ChainId === 195) {
        chainName = 'tron'
      }

      // 使用 SDK 的 KYT Oracle API 刷新风险评分（POST - 强制刷新，可能调用 MistTrack API）
      console.log('[Risk Score] Manual refresh using POST (force refresh)')
      const response = await sdkStore.sdk.kytOracle.refreshFeeInfoByAddress({
        address: recipientAddress,
        chain: chainName,
        tokenKey: 'USDT',
      })

      // Type assertion for metadata field (may not be in compiled types yet)
      const responseWithMetadata = response as typeof response & { metadata?: any }

      if (response.success && response.data) {
        const data = response.data
        setRiskScores(prev => ({
          ...prev,
          [record.id]: {
            riskScore: data.riskScore,
            riskLevel: data.riskLevel,
            metadata: responseWithMetadata.metadata ? {
              ...responseWithMetadata.metadata,
              queryTime: responseWithMetadata.metadata.queryTime || response.last_query_time || new Date().toISOString(),
            } : {
              mistTrackDetails: null,
              queryTime: response.last_query_time || new Date().toISOString(),
            },
            lastQueryTime: response.last_query_time ? new Date(response.last_query_time) : new Date(),
            loading: false,
          }
        }))
      } else {
        // 如果限流，使用上次查询的结果
        if (response.risk_score !== undefined) {
          setRiskScores(prev => ({
            ...prev,
            [record.id]: {
              riskScore: response.risk_score || null,
              riskLevel: response.risk_level || null,
              metadata: responseWithMetadata.metadata || prev[record.id]?.metadata || null,
              lastQueryTime: response.last_query_time ? new Date(response.last_query_time) : null,
              loading: false,
            }
          }))
        } else {
          setRiskScores(prev => ({
            ...prev,
            [record.id]: {
              ...prev[record.id],
              loading: false,
            }
          }))
        }
      }
    } catch (err) {
      console.error('刷新风险评分失败:', err)
      setRiskScores(prev => ({
        ...prev,
        [record.id]: {
          ...prev[record.id],
          loading: false,
        }
      }))
    }
  }

  const handleStatusAction = async (action: string, record: typeof transactionRecords[0]) => {
    console.log('执行状态操作:', action, record)
    
    switch (action) {
      case 'regenerate_proof':
        // TODO: 重新生成证明
        console.log('重新生成证明:', record.id)
        // 调用后端 API 重新生成证明
        break
      case 'cancel_withdrawal':
        // 取消提现请求
        try {
        console.log('取消提现:', record.id)
          if (!sdkStore.sdk) {
            console.error('SDK 未连接')
            return
          }
          
          // 调用 WithdrawalsAPI.cancelWithdrawRequest()
          // 使用类型断言访问 apis 属性
          const sdk = sdkStore.sdk as any
          if (sdk.apis?.withdrawals?.cancelWithdrawRequest) {
            await sdk.apis.withdrawals.cancelWithdrawRequest({ id: record.id })
          } else {
            // 如果 apis 不可用，回退到使用 cancelWithdraw 方法
            await sdkStore.sdk.cancelWithdraw(record.id)
          }
          
          console.log('取消提现成功:', record.id)
          // 刷新数据
          await loadWithdrawals(currentPage)
        } catch (err) {
          console.error('取消提现失败:', err)
          const errorMessage = err instanceof Error ? err.message : '取消提现失败'
          alert(errorMessage)
        }
        break
      case 'retry_withdrawal':
        // TODO: 重新提现
        console.log('重新提现:', record.id)
        // 调用后端 API 重新提现
        break
      case 'contact_support':
        // TODO: 请求客服
        console.log('请求客服:', record.id)
        // 打开客服对话框或跳转到客服页面
        break
      default:
        console.warn('未知的操作:', action)
    }
  }

  return (
    <div className="mx-auto">
      {/* 交易历史标题区域 */}
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <SvgIcon
              src="/icons/home-time.svg"
              className="w-5 h-5 text-black-9"
            />
            <h1 className="text-xl font-medium text-white">{t('records.title')}</h1>
          </div>
          {/* 刷新按钮 */}
          <button
            onClick={handleRefresh}
            disabled={loading || !isConnected || !address}
            className="w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('records.refresh')}
          >
            <SvgIcon
              src="/icons/refresh.svg"
              className={`w-5 h-5 text-black-9 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
        <p className="text-sm text-black-9">{t('records.subtitle')}</p>
      </div>

      {/* 交易记录列表 */}
      <div className="px-4 space-y-3">
        {loading ? (
          <div className="text-center text-black-9 py-8">{t('records.loading')}</div>
        ) : transactionRecords.length === 0 ? (
          <div className="text-center text-black-9 py-8">
            {isConnected && address && sdkStore.sdk && sdkStore.isConnected 
              ? t('records.noRecords') 
              : t('records.connectWalletFirst')}
          </div>
        ) : (
          <>
            {transactionRecords.map((record, index) => (
              <div
                key={record.id}
                className="bg-black-3 border border-black-3 rounded-[12px] p-4 shadow-lg text-white text-sm"
              >
                {/* 顶部：日期和交易类型 */}
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-black-4">
                  <span className="text-black-9 text-xs">{t('records.date')}: {record.date}</span>
                  <span className="text-white font-medium">{t('records.type')}: {record.type}</span>
                </div>

                {/* 中间：金额和接收地址 */}
                <div className="flex justify-between items-center mb-3">
                  <div className="flex flex-col">
                    <span className="text-black-9 text-xs mb-1">{t('records.amount')}</span>
                    <span className="text-white font-medium">{record.amount}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-black-9 text-xs mb-1">{t('records.recipient')}</span>
                    <div className="flex items-center gap-2">
                      {record.recipient ? (
                        <AddressDisplay address={record.recipient} chainId={(record as any).targetChainId} className="flex-1" />
                      ) : (
                        <span className="text-black-9">{t('records.unknownAddress')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 风险评分 */}
                {(() => {
                  const riskInfo = riskScores[record.id]
                  const recipientAddress = record.recipient
                  const targetChainId = (record as any).targetChainId
                  
                  // 如果没有风险评分信息且有接收地址，自动获取
                  if (!riskInfo && recipientAddress && targetChainId) {
                    // 延迟获取，避免一次性请求太多
                    setTimeout(() => {
                      fetchRiskScore(record.id, recipientAddress, targetChainId)
                    }, 100)
                  }
                  
                  return (
                    <div className="mb-3 pb-3 border-b border-black-4">
                      <AddressRankDisplayer
                        address={recipientAddress || ''}
                        chainId={targetChainId}
                        riskScore={riskInfo?.riskScore ?? null}
                        riskLevel={riskInfo?.riskLevel ?? null}
                        metadata={riskInfo?.metadata ?? null}
                        loading={riskInfo?.loading ?? false}
                        onRefresh={recipientAddress && targetChainId ? () => handleRefreshRiskScore(record) : undefined}
                      />
                    </div>
                  )
                })()}

                {/* 目标链 */}
                {(record as any).targetChainName && (
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-black-4">
                    <span className="text-black-9 text-xs">{t('records.targetChain')}</span>
                    <span className="text-white text-sm">{(record as any).targetChainName}</span>
                  </div>
                )}

                {/* 底部：状态和操作按钮/查看交易 */}
                <div className="flex justify-between items-center pt-2">
                  <div className="flex flex-col">
                    <span className="text-black-9 text-xs mb-1">{t('records.status.label')}</span>
                    <span
                      className={`text-sm font-medium ${
                        (record.status === t('records.status.completed') || record.status === '已完成') ? 'text-primary' : 'text-primary'
                      }`}
                    >
                      {record.status}
                    </span>
                  </div>
                  
                  {/* 当状态是已完成时，显示查看交易；否则显示操作按钮 */}
                  {(record.status === t('records.status.completed') || record.status === '已完成') ? (
                    /* 查看交易部分 */
                    ((record as any).executeTxHash || (record as any).payoutTxHash || (record as any).hookTxHash) && (
                      <div className="flex flex-col gap-1">
                        <span className="text-black-9 text-xs mb-1">{t('records.viewTransaction')}</span>
                        <div className="flex items-center gap-3">
                          {(record as any).executeTxHash && (
                            <button
                              onClick={() => {
                                // executeTxHash 是执行 executeWithdraw 的交易哈希（WithdrawRequested 事件对应的交易哈希）
                                const executeTxHash = (record as any).executeTxHash
                                const chainId = (record as any).executeChainId || (record as any).targetChainId
                                console.log('查看提款请求交易:', { executeTxHash, chainId, record: record })
                                handleViewTransaction(executeTxHash, chainId)
                              }}
                              className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs transition-colors"
                              title={t('records.actions.viewExecuteTx')}
                            >
                              <span>{t('records.withdrawalRequest')}</span>
                              <SvgIcon src="/icons/arrow-right-gray-icon.svg" className="w-3 h-3" />
                            </button>
                          )}
                          {(record as any).payoutTxHash && (
                            <button
                              onClick={() => {
                                const chainId = (record as any).payoutChainId || (record as any).targetChainId
                                handleViewTransaction((record as any).payoutTxHash, chainId)
                              }}
                              className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs transition-colors"
                              title={t('records.actions.viewPayoutTx')}
                            >
                              <span>{t('records.payoutExecution')}</span>
                              <SvgIcon src="/icons/arrow-right-gray-icon.svg" className="w-3 h-3" />
                            </button>
                          )}
                          {(record as any).hookTxHash && (
                            <button
                              onClick={() => {
                                const chainId = (record as any).hookChainId || (record as any).targetChainId
                                handleViewTransaction((record as any).hookTxHash, chainId)
                              }}
                              className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs transition-colors"
                              title={t('records.actions.viewHookTx')}
                            >
                              <span>{t('records.assetPurchase')}</span>
                              <SvgIcon src="/icons/arrow-right-gray-icon.svg" className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    /* 操作按钮部分 */
                    <div className="flex items-center gap-2">
                    {/* 状态对应的操作按钮 - 小图标按钮 */}
                    {record.buttons && record.buttons.length > 0 && (
                      <>
                        {record.buttons.map((btn, idx) => {
                          // 根据操作类型选择图标
                          let iconSrc = '/icons/refresh.svg'
                          let iconTitle = btn.text
                          
                          if (btn.action === 'regenerate_proof') {
                            iconSrc = '/icons/regenerate-proof.svg'
                            iconTitle = t('records.actions.regenerate')
                          } else if (btn.action === 'retry_withdrawal') {
                            iconSrc = '/icons/retry.svg'
                            iconTitle = t('records.actions.retryWithdrawal')
                          } else if (btn.action === 'cancel_withdrawal') {
                            iconSrc = '/icons/back-icon.svg'
                            iconTitle = t('records.actions.cancelWithdrawal')
                          } else if (btn.action === 'contact_support') {
                            iconSrc = '/icons/questionMark.svg'
                            iconTitle = t('records.actions.contactSupport')
                          }
                          
                          // 如果 action 是 regenerate_proof 或 cancel_withdrawal，只显示文字，不显示图标
                          const isTextOnly = btn.action === 'regenerate_proof' || btn.action === 'cancel_withdrawal'
                          
                          return (
                            <button
                              key={idx}
                              onClick={() => handleStatusAction(btn.action, record)}
                              className={
                                isTextOnly
                                  ? `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                      btn.action === 'cancel_withdrawal'
                                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                        : 'bg-primary/20 text-primary hover:bg-primary/30'
                                    }`
                                  : `w-6 h-6 flex items-center justify-center rounded-[20%] transition-colors ${
                                      btn.action === 'cancel_withdrawal' || btn.action === 'contact_support'
                                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                        : 'bg-primary/20 text-primary hover:bg-primary/30'
                                    }`
                              }
                              title={!isTextOnly ? iconTitle : undefined}
                            >
                              {isTextOnly ? (
                                <span>{iconTitle}</span>
                              ) : (
                                <SvgIcon
                                  src={iconSrc}
                                  className="w-4 h-4"
                                  monochrome={true}
                                />
                              )}
                            </button>
                          )
                        })}
                      </>
                    )}
                    </div>
                  )}
                </div>
                {/* 删除交易记录按钮 - 只在已完成且没有状态按钮时显示 */}
                {(record.status === t('records.status.completed') || record.status === '已完成') && (!record.buttons || record.buttons.length === 0) && (
                  <div className="flex justify-center pt-4 mt-3 border-t border-black-4">
                    <button
                      onClick={() => handleDeleteRecords(record)}
                      className="w-[230px] bg-primary text-black-2 py-2 rounded-[14px] font-medium hover:bg-primary/80 transition-colors"
                    >
                      {t('records.deleteRecord')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* 分页导航 */}
      {!loading && transactionRecords.length > 0 && pagination.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
            onPageChange={(page) => {
              handlePageChange(page)
              // 滚动到顶部
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </div>
      )}
    </div>
  )
}

export default observer(RecordsPageComponent)
