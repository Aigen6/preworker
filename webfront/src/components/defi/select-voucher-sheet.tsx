'use client'

import { useState, useEffect, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import SvgIcon from '@/components/ui/SvgIcon'
import { useAllocationsDataObserver } from '@/lib/hooks/use-allocations-data'
import { useCheckbooksDataObserver } from '@/lib/hooks/use-checkbooks-data'
import { useWalletConnection } from '@/lib/hooks/use-wallet-connection'
import { useSDKStore } from '@/lib/stores/sdk-store'
import { selectedVouchersStore } from '@/lib/stores'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'
import { sumAllocationAmounts, formatFromWei, parseToWei, sumReadableAmounts, formatUSDTAmount } from '@/lib/utils/amount-calculator'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Toggle } from '@/components/ui/toggle'

interface VoucherItem {
  id: string
  amount: number
  selected: boolean
  allocationId?: string
  seq?: number
}

interface VoucherGroup {
  id: string
  name: string
  total: number
  vouchers: VoucherItem[]
  expanded: boolean
  allSelected: boolean
  localDepositId?: number
  checkbookId?: string
}

interface SelectVoucherSheetProps {
  onClose?: () => void
  onConfirm?: (selectedVouchers: any[]) => void
}

function SelectVoucherSheetComponent({ onClose, onConfirm }: SelectVoucherSheetProps) {
  const { t } = useTranslation()
  const { chainId, isConnected } = useWalletConnection()
  const { idle: idleAllocations, byCheckbookId, fetchList } = useAllocationsDataObserver()
  const { all: allCheckbooks, getById, fetchList: fetchCheckbooks } = useCheckbooksDataObserver()
  const sdkStore = useSDKStore()
  const { walletManager } = useSDKWallet()
  const [selectedToken, setSelectedToken] = useState<string | null>(null)
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false)
  const [isVoucherSelectorOpen, setIsVoucherSelectorOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showOnlySelected, setShowOnlySelected] = useState(false)

  // 加载凭证数据和 checkbooks 数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        // 先加载 allocations
        await fetchList({ status: 'idle' })
        
        // 然后加载所有 checkbooks（这样 getById 才能工作）
        await fetchCheckbooks()
      } catch (error) {
        console.error('加载数据失败:', error)
        
        // 如果失败是因为 SDK 未连接，尝试自动重新连接
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('SDK 未连接') && isConnected && walletManager && !sdkStore.sdk?.isConnected) {
          console.log('尝试自动重新连接 SDK...')
          try {
            await sdkStore.connect(walletManager as any)
            // 连接成功后，重新加载数据
            await fetchList({ status: 'idle' })
            await fetchCheckbooks()
          } catch (reconnectError) {
            console.error('自动重新连接 SDK 失败:', reconnectError)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [fetchList, fetchCheckbooks, isConnected, walletManager, sdkStore])
  
  // 当 allocations 加载后，批量加载相关的 checkbooks
  useEffect(() => {
    const loadRelatedCheckbooks = async () => {
      if (!idleAllocations || idleAllocations.length === 0) return
      
      // 收集所有唯一的 checkbookId
      const checkbookIds = new Set<string>()
      idleAllocations.forEach((alloc: any) => {
        if (alloc.checkbookId) {
          checkbookIds.add(alloc.checkbookId)
        }
      })
      
      // 检查哪些 checkbooks 还没有加载
      const missingCheckbookIds = Array.from(checkbookIds).filter(
        (id) => !getById(id)
      )
      
      // 批量加载缺失的 checkbooks
      if (missingCheckbookIds.length > 0) {
        try {
          // 这里可以优化为批量请求，但先使用现有的 fetchCheckbooks
          // 因为 fetchCheckbooks 会加载所有 checkbooks
          await fetchCheckbooks()
        } catch (error) {
          console.error('加载 checkbooks 失败:', error)
        }
      }
    }
    
    loadRelatedCheckbooks()
  }, [idleAllocations, getById, fetchCheckbooks])

  // 所有可选择的凭证：系统中该用户所有处于idle状态的allocation
  // 确保只显示 status === 'idle' 的 allocations
  const filteredAllocations = useMemo(() => {
    if (!idleAllocations) return []
    // 双重过滤确保只包含 idle 状态的 allocations
    return idleAllocations.filter((alloc: any) => alloc.status === 'idle')
  }, [idleAllocations])
  // 获取可用的代币选项（从 allocations 中提取）
  const tokenOptions = useMemo(() => {
    const tokenMap = new Map<string, { id: string; name: string; balance: number; icon: string }>()
    
    filteredAllocations.forEach((alloc: any) => {
      // allocation.token.id 是 tokenId
      const tokenId = alloc.token?.id?.toString() || alloc.tokenId?.toString() || 'unknown'
      const tokenSymbol = alloc.token?.symbol || 'UNKNOWN'
      // Enclave 系统中统一使用 18 位 decimal
      const amount = parseFloat(alloc.amount || '0') / Math.pow(10, 18)
      
      if (tokenMap.has(tokenId)) {
        const existing = tokenMap.get(tokenId)!
        existing.balance += amount
      } else {
        tokenMap.set(tokenId, {
          id: tokenId,
          name: tokenSymbol,
          balance: amount,
          icon: tokenSymbol.toLowerCase(),
        })
      }
    })
    return Array.from(tokenMap.values())
  }, [filteredAllocations])

  // 根据选中的代币和 localDepositId 分组凭证
  const voucherGroups = useMemo(() => {
    if (!selectedToken) return []
    
    const groups: VoucherGroup[] = []
    const localDepositMap = new Map<number | string, any[]>()
    
    // 按 localDepositId 分组
    filteredAllocations.forEach((alloc: any) => {
      // 使用 allocation.token.id 作为 tokenId（后端现在会返回 token 信息）
      const allocTokenId = alloc.token?.id?.toString() || alloc.tokenId?.toString()
      if (allocTokenId !== selectedToken) {
        return
      }
      
      // 优先使用后端返回的 checkbook 信息中的 local_deposit_id
      // 如果没有，则尝试从 store 获取
      let localDepositId: number | undefined = undefined
      const checkbookId = alloc.checkbookId
      
      // 检查 checkbook 字段（后端直接返回的 checkbook 数据）
      const checkbookFromAlloc = (alloc as any).checkbook || (alloc as any)._checkbook
      if (checkbookFromAlloc?.local_deposit_id !== undefined && checkbookFromAlloc?.local_deposit_id !== null) {
        // 后端返回的 checkbook 信息中有 local_deposit_id
        localDepositId = Number(checkbookFromAlloc.local_deposit_id)
      } else if (checkbookId) {
        // 后备方案：从 store 获取
        const checkbook = getById(checkbookId)
        if (checkbook?.localDepositId !== undefined && checkbook?.localDepositId !== null) {
          localDepositId = Number(checkbook.localDepositId)
        }
      }
      
      // 调试：如果无法获取 localDepositId，记录警告
      if (localDepositId === undefined || localDepositId === null) {
        console.warn('⚠️ 无法获取 localDepositId for allocation:', {
          allocationId: alloc.id,
          checkbookId,
          hasCheckbookFromAlloc: !!checkbookFromAlloc,
          checkbookFromAlloc: checkbookFromAlloc ? {
            id: checkbookFromAlloc.id,
            local_deposit_id: checkbookFromAlloc.local_deposit_id
          } : null,
          checkbookFromStore: checkbookId ? (getById(checkbookId) ? {
            id: getById(checkbookId)?.id,
            localDepositId: getById(checkbookId)?.localDepositId
          } : null) : null
        })
      }
      
      // 使用 localDepositId 作为分组键，如果没有则使用 checkbookId 作为后备
      const groupKey: number | string = localDepositId !== undefined && localDepositId !== null
        ? localDepositId
        : (checkbookId ? `checkbook-${checkbookId}` : 'unknown')
      
      if (!localDepositMap.has(groupKey)) {
        localDepositMap.set(groupKey, [])
      }
      localDepositMap.get(groupKey)!.push(alloc)
    })
    
    // 转换为 VoucherGroup 格式
    localDepositMap.forEach((allocs, groupKey) => {
      // 使用精确计算避免浮点数精度问题
      // Enclave 系统中统一使用 18 位 decimal
      const decimals = 18
      const totalStr = sumAllocationAmounts(allocs, decimals)
      const total = parseFloat(totalStr)
      
      const vouchers: VoucherItem[] = allocs.map((alloc, index) => {
        // 使用精确计算转换金额
        // Enclave 系统中统一使用 18 位 decimal
        const allocDecimals = 18
        let amount: number
        if (typeof alloc.amount === 'string') {
          // 如果是字符串，可能是 wei 格式或可读格式
          if (alloc.amount.includes('.')) {
            // 可读格式，直接解析
            amount = parseFloat(alloc.amount)
          } else {
            // wei 格式，需要转换（使用 18 位 decimal）
            const amountStr = formatFromWei(BigInt(alloc.amount), allocDecimals)
            amount = parseFloat(amountStr)
          }
        } else if (typeof alloc.amount === 'bigint') {
          const amountStr = formatFromWei(alloc.amount, allocDecimals)
          amount = parseFloat(amountStr)
        } else {
          // 数字类型，假设是可读格式
          amount = alloc.amount
        }
        
        return {
          id: alloc.id || `V${index + 1}`,
          amount,
          selected: false,
          allocationId: alloc.id,
          seq: alloc.seq,
        }
      })
      
      // 获取第一个 allocation 的 checkbook 信息用于显示
      const firstAlloc = allocs[0]
      // 优先使用后端返回的 checkbook 信息（从 checkbook 或 _checkbook 字段）
      const checkbookFromAlloc = (firstAlloc as any).checkbook || (firstAlloc as any)._checkbook
      const checkbookFromStore = firstAlloc.checkbookId ? getById(firstAlloc.checkbookId) : null
      
      // 确定显示的 localDepositId
      // 如果 groupKey 是 number，说明已经有 localDepositId
      // 否则尝试从 checkbook 信息中获取
      let displayLocalDepositId: number | undefined = undefined
      if (typeof groupKey === 'number') {
        displayLocalDepositId = groupKey
      } else {
        // 尝试从后端返回的 checkbook 信息获取
        displayLocalDepositId = checkbookFromAlloc?.local_deposit_id
        // 如果还没有，从 store 获取
        if (displayLocalDepositId === undefined && checkbookFromStore) {
          displayLocalDepositId = checkbookFromStore.localDepositId
        }
      }
      
      // 调试日志
      if (!displayLocalDepositId) {
        console.warn('⚠️ 无法获取 localDepositId:', {
          groupKey,
          checkbookId: firstAlloc.checkbookId,
          checkbookFromAlloc,
          checkbookFromStore: checkbookFromStore ? { id: checkbookFromStore.id, localDepositId: checkbookFromStore.localDepositId } : null
        })
      }
      
      groups.push({
        id: typeof groupKey === 'number' ? `localDeposit-${groupKey}` : String(groupKey),
        name: displayLocalDepositId !== undefined && displayLocalDepositId !== null
          ? `#${displayLocalDepositId}`
          : `#${groupKey}`, // 如果没有 localDepositId，直接使用 groupKey（可能是 checkbookId 的哈希）
        total,
        vouchers,
        expanded: groups.length === 0, // 第一个默认展开
      allSelected: false,
        localDepositId: displayLocalDepositId,
        checkbookId: firstAlloc.checkbookId,
      })
    })
    
    // 按 localDepositId 从大到小排序
    groups.sort((a, b) => {
      // 如果两个都有 localDepositId，按数值从大到小排序
      if (a.localDepositId !== undefined && a.localDepositId !== null && 
          b.localDepositId !== undefined && b.localDepositId !== null) {
        return b.localDepositId - a.localDepositId // 从大到小
      }
      // 如果只有一个有 localDepositId，有值的排在前面
      if (a.localDepositId !== undefined && a.localDepositId !== null) {
        return -1
      }
      if (b.localDepositId !== undefined && b.localDepositId !== null) {
        return 1
      }
      // 都没有 localDepositId，保持原顺序
      return 0
    })
    
    // 更新第一个分组的 expanded 状态（排序后第一个）
    if (groups.length > 0) {
      groups.forEach((group, index) => {
        group.expanded = index === 0
      })
    }
    
    return groups
  }, [filteredAllocations, selectedToken, getById])

  // 初始化选中的代币
  useEffect(() => {
    if (tokenOptions.length > 0 && !selectedToken) {
      setSelectedToken(tokenOptions[0].id)
    }
  }, [tokenOptions, selectedToken])

  const [voucherGroupsState, setVoucherGroupsState] = useState<VoucherGroup[]>([])
  
  // 同步 voucherGroups 到 state，并从 Store 恢复之前选中的凭证
  useEffect(() => {
    const groups = voucherGroups.map(group => ({
      ...group,
      vouchers: group.vouchers.map(voucher => {
        // 检查这个凭证是否在 Store 中已选中
        const isSelected = selectedVouchersStore.selectedVouchers.some(
          sv => sv.id === voucher.id || sv.allocationId === voucher.allocationId
        )
        return {
          ...voucher,
          selected: isSelected,
        }
      }),
    }))
    
    // 更新 allSelected 状态
    const updatedGroups = groups.map(group => ({
      ...group,
      allSelected: group.vouchers.length > 0 && group.vouchers.every(v => v.selected),
    }))
    
    setVoucherGroupsState(updatedGroups)
  }, [voucherGroups])

  const toggleGroupExpansion = (groupId: string) => {
    setVoucherGroupsState((groups) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, expanded: !group.expanded } : group
      )
    )
  }

  const toggleGroupSelectAll = (groupId: string) => {
    setVoucherGroupsState((groups) =>
      groups.map((group) => {
        if (group.id === groupId) {
          const newAllSelected = !group.allSelected
          return {
            ...group,
            allSelected: newAllSelected,
            vouchers: group.vouchers.map((voucher) => ({
              ...voucher,
              selected: newAllSelected,
            })),
          }
        }
        return group
      })
    )
  }

  const toggleVoucherSelection = (groupId: string, voucherId: string) => {
    setVoucherGroupsState((groups) =>
      groups.map((group) => {
        if (group.id === groupId) {
          const updatedVouchers = group.vouchers.map((voucher) =>
            voucher.id === voucherId
              ? { ...voucher, selected: !voucher.selected }
              : voucher
          )
          const allSelected = updatedVouchers.every((voucher) => voucher.selected)
          return {
            ...group,
            vouchers: updatedVouchers,
            allSelected,
          }
        }
        return group
      })
    )
  }

  const handleConfirm = () => {
    const selectedVoucherData = voucherGroupsState.flatMap(group => 
      group.vouchers
        .filter(voucher => voucher.selected)
        .map(voucher => ({
          id: voucher.allocationId || voucher.id,
          amount: voucher.amount,
          allocationId: voucher.allocationId,
        }))
    )
    // 保存到 Store
    selectedVouchersStore.setSelectedVouchers(selectedVoucherData)
    onConfirm?.(selectedVoucherData)
    onClose?.()
  }

  const getTotalSelectedAmount = () => {
    const selectedVouchers = voucherGroupsState
      .flatMap(group => group.vouchers.filter(voucher => voucher.selected))
    // 使用精确计算避免浮点数精度问题
    const totalStr = sumReadableAmounts(selectedVouchers.map(v => v.amount), 18)
    return parseFloat(totalStr)
  }

  // 计算每个组的已选中数量
  const getGroupSelectedCount = (group: VoucherGroup) => {
    return group.vouchers.filter(v => v.selected).length
  }

  // 检查组是否有选中的凭证
  const hasSelectedVouchers = (group: VoucherGroup) => {
    return group.vouchers.some(v => v.selected)
  }

  // 根据"仅显示选中"开关过滤组
  const filteredVoucherGroups = useMemo(() => {
    if (!showOnlySelected) {
      return voucherGroupsState
    }
    return voucherGroupsState.filter(group => hasSelectedVouchers(group))
  }, [voucherGroupsState, showOnlySelected])

  return (
    <div className="flex flex-col min-h-0">
      {/* 头部 - 固定 */}
      <div className="shrink-0 px-4 pt-4 pb-2">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-medium text-black-9">{t('defi.selectVoucher')}</h1>
        <span className="text-sm text-black-9">{t('defi.tabs.extract')}</span>
      </div>
      </div>

      {/* 内容区域 - 可滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="space-y-4 py-2">

      {/* 选择凭证代币类型 */}
      <div>
        <h2 className="text-sm font-medium text-main mb-3">{t('defi.selectVoucherTokenType')}</h2>

        {/* 代币选择列表 */}
        <div className="space-y-2">
            {loading ? (
              <div className="text-center text-black-9 py-4">{t('defi.loading')}</div>
            ) : tokenOptions.length === 0 ? (
              <div className="text-center text-black-9 py-4">{t('voucher.noAvailableVouchers')}</div>
            ) : (
            tokenOptions.map((token) => {
              const isSelected = selectedToken === token.id
              return (
              <div
                key={token.id}
                  className={`px-4 h-11 flex items-center justify-between cursor-pointer border rounded-xl transition-colors ${
                    isSelected
                      ? 'border-primary bg-black-3'
                      : 'border-black-3 hover:bg-black-2'
                  }`}
                onClick={() => {
                  setSelectedToken(token.id)
                }}
              >
                <div className="flex items-center gap-3">
                  <SvgIcon
                    src={`/icons/${token.icon?.toUpperCase()}.svg`}
                    className="w-5 h-5"
                  />
                    <span className="font-medium text-main">
                    {token.name}
                  </span>
                  <span className="text-xs text-black-9">
                    ({token.balance.toFixed(2)})
                  </span>
                </div>
                  {isSelected && (
                    <div className="flex items-center gap-2">
                      <SvgIcon
                        src="/icons/checked.svg"
                        className="w-5 h-5"
                      />
              </div>
            )}
          </div>
              )
            })
        )}
        </div>
      </div>

      {/* 可用凭证 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm text-main">
            {t('defi.availableVouchers')}
          </label>
          {/* 仅显示选中开关 */}
          {selectedToken && voucherGroupsState.length > 0 && (
            <div className="flex items-center gap-2">
              <Toggle
                checked={showOnlySelected}
                onChange={setShowOnlySelected}
                size="sm"
              />
              <span className="text-sm text-main">{t('defi.showOnlySelected')}</span>
            </div>
          )}
        </div>

        {!selectedToken ? (
          <div className="text-center text-black-9 py-4">{t('defi.selectTokenTypeFirst')}</div>
        ) : (
          <>
        {/* 当前选中的凭证展示 */}
        <div
          className="border border-black-3 rounded-xl px-4 h-11 flex items-center justify-between cursor-pointer hover:bg-black-3 transition-colors"
          onClick={() => setIsVoucherSelectorOpen(!isVoucherSelectorOpen)}
        >
          <div className="flex items-center gap-3">
            <SvgIcon
                  src={`/icons/${tokenOptions.find(t => t.id === selectedToken)?.icon?.toUpperCase() || 'USDT'}.svg`}
              className="w-5 h-5"
            />
            <div>
                  <span className="text-main font-medium">
                    {tokenOptions.find(t => t.id === selectedToken)?.name || 'USDT'}
                  </span>
              <span className="text-black-9 text-sm ml-2">
                    ({t('defi.selectedLabel')} {formatUSDTAmount(getTotalSelectedAmount())})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-black-9">
            <SvgIcon
              src="/icons/arrow-right-gray-icon.svg"
              className={`w-4 h-4 transition-transform ${
                isVoucherSelectorOpen ? 'rotate-270' : 'rotate-90'
              }`}
            />
          </div>
        </div>

        {/* 凭证选择列表 */}
        {isVoucherSelectorOpen && (
          <div className="mt-2 overflow-hidden">
                {loading ? (
                  <div className="text-center text-black-9 py-4">{t('defi.loading')}</div>
                ) : filteredVoucherGroups.length === 0 ? (
                  <div className="text-center text-black-9 py-4">
                    {showOnlySelected ? t('defi.noSelectedVouchers') : t('voucher.noAvailableVouchers')}
                  </div>
                ) : (
            <div className="space-y-3">
                    {filteredVoucherGroups.map((group) => {
                      const selectedCount = getGroupSelectedCount(group)
                      const totalCount = group.vouchers.length
                      const hasSelected = hasSelectedVouchers(group)
                      
                      return (
                <div
                  key={group.id}
                  className={`border rounded-xl p-4 transition-colors ${
                    hasSelected 
                      ? 'border-primary bg-black-3' 
                      : group.allSelected 
                        ? 'border-primary' 
                        : 'border-black-3'
                  }`}
                >
                  {/* 凭证组头部 */}
                  <div className="mb-4 border-b border-black-3 pb-4">
                    {/* 第一行：ID 和全选按钮 */}
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => toggleGroupExpansion(group.id)}
                        className="flex items-center gap-2"
                      >
                        <span className={`text-lg font-bold ${
                          hasSelected ? 'text-primary' : 'text-main'
                        }`}>
                          {group.name}
                        </span>
                        {/* 显示已选中数量/总数 */}
                        {!group.expanded && (
                          <span className="text-sm text-black-9 ml-1">
                            ({selectedCount}/{totalCount})
                          </span>
                        )}
                        <SvgIcon
                          src="/icons/arrow-right-gray-icon.svg"
                          className={`w-4 h-4 text-black-9 transition-transform ${
                            group.expanded ? 'rotate-270' : 'rotate-90'
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => toggleGroupSelectAll(group.id)}
                        className="flex items-center gap-2 text-main"
                      >
                        <span>{t('defi.selectAll')}</span>
                        <SvgIcon
                          src={
                            group.allSelected
                              ? '/icons/checked.svg'
                              : '/icons/unchecked.svg'
                          }
                          className="w-6 h-6"
                        />
                      </button>
                    </div>
                    {/* 第二行：总计信息 */}
                    <div className="flex items-center">
                      <span className="text-sm text-black-9">
                        {t('defi.total')}: {formatUSDTAmount(group.total)}USDT
                      </span>
                      {/* 展开时显示已选中数量 */}
                      {group.expanded && selectedCount > 0 && (
                        <span className="text-sm text-primary ml-2">
                          {t('defi.selectedLabel')} {selectedCount}/{totalCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 凭证列表 */}
                  {group.expanded && (
                    <div className="space-y-3">
                      {group.vouchers.map((voucher) => (
                        <div
                          key={voucher.id}
                          className="flex items-center justify-between"
                        >
                          <span className="text-lg font-medium text-main">
                            #{voucher.seq !== undefined ? voucher.seq : '?'}
                          </span>
                          <div className="flex items-center gap-4">
                            <span className="text-lg text-main">
                              {formatUSDTAmount(voucher.amount)}USDT
                            </span>
                            <button
                              onClick={() =>
                                toggleVoucherSelection(group.id, voucher.id)
                              }
                              className="flex items-center justify-center"
                            >
                              <SvgIcon
                                src={
                                  voucher.selected
                                    ? '/icons/checked.svg'
                                    : '/icons/unchecked.svg'
                                }
                                className="w-6 h-6"
                              />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                      )
                    })}
            </div>
                )}
          </div>
            )}
          </>
        )}
      </div>
        </div>
      </div>

      {/* 确认按钮 - 固定在底部 */}
      <div className="sticky bottom-0 flex justify-center px-4 pt-4 pb-4 border-t border-black-3 z-10 mt-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handleConfirm}
          className="w-[230px] h-[36px] bg-primary text-black-2 rounded-[14px] font-bold"
        >
          {t('defi.confirm')}
        </button>
      </div>
    </div>
  )
}

export const SelectVoucherSheet = observer(SelectVoucherSheetComponent)
