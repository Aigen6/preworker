'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import SvgIcon from '@/components/ui/SvgIcon'
import { Badge } from '@/components/ui/badge'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useBottomSheet } from '@/hooks/use-bottom-sheet'
import { DepositVoucherSheet } from '@/components/defi/deposit-voucher-sheet'
import { RedeemAssetSheet } from '@/components/defi/redeem-asset-sheet'
import { BuyStockSheet } from '@/components/defi/buy-stock-sheet'
import { RedeemStockSheet } from '@/components/defi/redeem-stock-sheet'
import { SelectVoucherSheet } from '@/components/defi/select-voucher-sheet'
import { GasDetailSheet } from '@/components/defi/gas-detail-sheet'
import { ExtractConfirmSheet } from '@/components/defi/extract-confirm-sheet'
import { ProcessingSheet } from '@/components/defi/processing-sheet'
import { useTokenRouting } from '@/lib/hooks/use-token-routing'
import { useAllocationsDataObserver } from '@/lib/hooks/use-allocations-data'
import { selectedVouchersStore, extractFormStore } from '@/lib/stores'
import { useQuoteRoute } from '@/lib/hooks/use-quote-route'
import { useWithdrawActions } from '@/lib/hooks/use-withdraw-actions'
import { useWalletConnection } from '@/lib/hooks/use-wallet-connection'
import { useWallet as useSDKWallet } from "@enclave-hq/wallet-sdk/react"
import { useSDKStore } from '@/lib/stores/sdk-store'
import { useFeaturedPoolsObserver } from '@/lib/hooks/use-featured-pools'
import { useTranslation } from '@/lib/hooks/use-translation'
import { translatePoolName, translateProtocol } from '@/lib/utils/pool-name-translator'
import { createUniversalAddress, extractAddress, type UniversalAddress } from '@enclave-hq/sdk'
import { validateAddressForSlip44, getAddressPlaceholder } from '@/lib/utils/address-validation'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useToast } from '@/components/providers/toast-provider'
import { parseToWei, formatUSDTAmount } from '@/lib/utils/amount-calculator'
import { withdrawAddressStore } from '@/lib/config/withdraw-addresses'

// Local type definitions for Intent (not exported from SDK main entry)
type RawTokenIntent = {
  type: 'RawToken'
  beneficiary: UniversalAddress
  tokenSymbol: string
}

type AssetTokenIntent = {
  type: 'AssetToken'
  assetId: string
  beneficiary: UniversalAddress
  assetTokenSymbol: string
}

function DifiPage() {
  const router = useRouter()
  const { chainId, address } = useWalletConnection()
  const { walletManager } = useSDKWallet()
  const sdkStore = useSDKStore()
  const { t, language } = useTranslation()
  const { getAllowedTargets, allowedTargets, loading: routingLoading } = useTokenRouting()
  const { idle: idleAllocations, fetchList: fetchAllocations } = useAllocationsDataObserver()
  const { getRouteAndFees, quoteResult, loading: quoteLoading } = useQuoteRoute()
  const { withdraw, loading: withdrawLoading } = useWithdrawActions()
  const { all: allPools, fetchPools } = useFeaturedPoolsObserver()
  const { showError, showWarning } = useToast()
  
  const depositSheet = useBottomSheet()
  const redeemSheet = useBottomSheet()
  const buyStockSheet = useBottomSheet()
  const redeemStockSheet = useBottomSheet()
  const selectVoucherSheet = useBottomSheet()
  const gasDetailSheet = useBottomSheet()
  const extractConfirmSheet = useBottomSheet()
  const processingSheet = useBottomSheet()


  // 下拉框状态管理
  const [expandedCards, setExpandedCards] = useState<{
    [key: string]: boolean
  }>({})

  // 每个真实资产产品的股票列表展开状态
  const [productStockExpanded, setProductStockExpanded] = useState<{
    [key: string]: boolean
  }>({})

  // 使用 Store 管理选中的凭证（响应式，会自动更新）
  const selectedAllocations = selectedVouchersStore.selectedVouchers
  const setSelectedAllocations = (vouchers: Array<{ id: string; amount: number; allocationId?: string }>) => {
    selectedVouchersStore.setSelectedVouchers(vouchers)
  }
  
  // 使用 Store 管理提取表单状态（响应式，会自动更新）
  const selectedNetwork = extractFormStore.selectedNetwork
  const selectedTargetToken = extractFormStore.selectedTargetToken
  const selectedSourceToken = extractFormStore.selectedSourceToken
  const receivingAddress = extractFormStore.receivingAddress
  const isReceivingAddressValid = extractFormStore.isReceivingAddressValid
  const isNetworkSelectorOpen = extractFormStore.isNetworkSelectorOpen
  const useCustomAddress = extractFormStore.useCustomAddress
  const selectedAddressId = extractFormStore.selectedAddressId

  // 地址列表相关状态
  const [addressesLoaded, setAddressesLoaded] = useState(false)
  const [isAddressListValid, setIsAddressListValid] = useState(false)
  const [validAddresses, setValidAddresses] = useState<Array<{ chainId: number; id: number; address: string; signature: string; isValid: boolean }>>([])

  // 加载地址列表（组件挂载时）
  useEffect(() => {
    const loadAddresses = async () => {
      try {
        await withdrawAddressStore.loadAddresses()
        setAddressesLoaded(true)
        
        const allAddresses = withdrawAddressStore.getValidAddresses()
        const isValid = withdrawAddressStore.getIsValid()
        setIsAddressListValid(isValid)
        setValidAddresses(allAddresses)
        
        // 如果地址列表为空，默认允许手工输入
        // 如果地址列表不为空，默认使用地址列表（关闭手工输入开关）
        if (allAddresses.length === 0) {
          extractFormStore.setUseCustomAddress(true)
        } else {
          extractFormStore.setUseCustomAddress(false)
        }
        
        if (!isValid && allAddresses.length > 0) {
          const error = withdrawAddressStore.getError()
          console.error('地址列表验证失败:', error)
          showWarning(error || '地址列表验证失败，请检查配置')
        }
      } catch (error) {
        console.error('加载地址列表失败:', error)
        // 加载失败时，也允许手工输入
        setAddressesLoaded(true) // 即使失败也标记为已加载，避免无限重试
        setIsAddressListValid(false)
        setValidAddresses([])
        extractFormStore.setUseCustomAddress(true)
      }
    }
    
    loadAddresses()
  }, [showWarning, showError])

  // 根据选中的网络过滤地址列表
  const filteredAddresses = useMemo(() => {
    if (!selectedNetwork) {
      return validAddresses
    }
    const chainId = parseInt(selectedNetwork)
    return validAddresses.filter((addr) => addr.chainId === chainId)
  }, [validAddresses, selectedNetwork])

  // 当网络切换时，如果新网络没有对应的地址，自动切换到手工输入模式
  useEffect(() => {
    if (selectedNetwork && !useCustomAddress) {
      const chainId = parseInt(selectedNetwork)
      const hasAddressForNetwork = filteredAddresses.length > 0
      if (!hasAddressForNetwork) {
        extractFormStore.setUseCustomAddress(true)
      }
    }
  }, [selectedNetwork, filteredAddresses.length, useCustomAddress])

  // 当选择地址 ID 时，自动设置 receivingAddress
  useEffect(() => {
    if (!useCustomAddress && selectedAddressId !== null) {
      const address = withdrawAddressStore.getAddressById(selectedAddressId)
      if (address && address.isValid) {
        extractFormStore.setReceivingAddress(address.address)
        extractFormStore.setReceivingAddressValid(true)
      }
    }
  }, [selectedAddressId, useCustomAddress])

  // 收益地址输入框的ref
  const receivingAddressInputRef = useRef<HTMLInputElement>(null)
  // 存储滚动定时器的ID
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 固定的目标代币列表
  const fixedTargetTokens = useMemo(() => [
    { id: 'USDT', name: 'USDT', icon: 'USDT', enabled: true },
    { id: 'USDC', name: 'USDC', icon: 'USDC', enabled: false },
    { id: 'ETH', name: 'ETH', icon: 'ETH', enabled: false },
    { id: 'WBTC', name: 'wBTC', icon: 'BTC', enabled: false }, // 使用 BTC 图标
  ], [])

  // 切换产品股票展开状态
  const toggleProductStockExpansion = (productId: string) => {
    setProductStockExpanded((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }))
  }

  // 当前选中的股票
  const [selectedStock, setSelectedStock] = useState<any>(null)

  const handleAaveDetail = () => {
    router.push('/defi/aave')
  }

  const handleDeposit = () => {
    depositSheet.open({})
  }

  const handleRedeem = () => {
    redeemSheet.open({})
  }

  // 恢复滚动的函数
  const restoreScroll = () => {
    const mainElement = document.querySelector('main') as HTMLElement
    if (mainElement) {
      mainElement.style.overflow = ''
    }
  }

  // 处理收益地址输入框聚焦时的滚动
  const handleReceivingAddressFocus = () => {
    if (receivingAddressInputRef.current) {
      const inputElement = receivingAddressInputRef.current
      const mainElement = document.querySelector('main') as HTMLElement
      
      // 清除之前的定时器（如果存在）
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current)
      }
      
      // 禁用滚动
      if (mainElement) {
        mainElement.style.overflow = 'hidden'
      }
      
      // 1000ms后恢复滚动并执行滚动操作
      scrollTimerRef.current = setTimeout(() => {
        // 恢复滚动
        restoreScroll()
        
        // 执行滚动，将输入框滚动到距离顶部100px处
        if (mainElement) {
          const inputRect = inputElement.getBoundingClientRect()
          const mainRect = mainElement.getBoundingClientRect()
          
          // 计算输入框在main容器中的绝对位置（考虑当前滚动位置）
          const inputAbsoluteTop = mainElement.scrollTop + (inputRect.top - mainRect.top)
          
          // 目标位置：输入框顶部距离main容器顶部100px
          const targetScrollTop = inputAbsoluteTop - 100
          
          // 执行滚动
          mainElement.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          })
        } else {
          // 如果没有找到main元素，使用window滚动
          const inputRect = inputElement.getBoundingClientRect()
          const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop
          const targetScrollTop = currentScrollTop + inputRect.top - 100
          
          window.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          })
        }
        
        scrollTimerRef.current = null
      }, 200)
    }
  }

  // 处理收益地址输入框失去焦点时的恢复
  const handleReceivingAddressBlur = () => {
    // 清除定时器
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = null
    }
    
    // 恢复滚动
    restoreScroll()
  }

  // 组件卸载时确保恢复滚动
  useEffect(() => {
    return () => {
      // 清除定时器
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current)
        scrollTimerRef.current = null
      }
      // 恢复滚动
      restoreScroll()
    }
  }, [])

  // 加载池子数据
  useEffect(() => {
    if (sdkStore.sdk) {
      fetchPools().catch(err => {
        console.error('加载池子数据失败:', err)
      })
    }
  }, [sdkStore.sdk, fetchPools])

  // 自动重新读取 idle 状态的 allocation 数据
  useEffect(() => {
    if (sdkStore.sdk) {
      fetchAllocations({ status: 'idle' }).catch(err => {
        console.error('重新读取 idle 状态的 allocation 数据失败:', err)
      })
    }
  }, [sdkStore.sdk, fetchAllocations])

  // 根据池子 ID 或名称获取对应的图片（与首页保持一致）
  const getPoolImage = (poolId: string, poolName?: string, protocol?: string): string => {
    const id = poolId.toLowerCase()
    const name = poolName?.toLowerCase() || ''
    const proto = protocol?.toLowerCase() || ''
    
    if (id.includes('aave') || name.includes('aave') || proto.includes('aave')) {
      return "/images/home-aave.png"
    }
    if (id.includes('rwa') || name.includes('rwa') || name.includes('国债') || proto.includes('rwa') || proto.includes('ondo')) {
      return "/images/real-assets.png"
    }
    if (id.includes('compound') || name.includes('compound') || proto.includes('compound')) {
      return "/images/difi-loan.png"
    }
    if (id.includes('nasdaq') || id.includes('etf') || name.includes('nasdaq') || name.includes('etf') || name.includes('纳斯达克')) {
      return "/images/trend.png"
    }
    if (id.includes('sp-500') || id.includes('sp500') || name.includes('sp-500') || name.includes('标普') || name.includes('s&p') || name.includes('sp500')) {
      return "/images/sp-500.png"
    }
    if (id.includes('makerdao') || name.includes('maker') || proto.includes('maker')) {
      return "/images/difi-loan.png"
    }
    
    return "/images/home-aave.png"
  }

  // 从 Store 获取借贷池数据（与首页使用同一个数据源）
  const lendingPools = useMemo(() => {
    // 如果没有数据，返回默认数据（保持向后兼容）
    console.log(t('defi.lendingProtocol'))
    if (allPools.length === 0) {
      return [
        {
          id: 'aave',
          name: 'AAVE',
          image: '/images/home-aave.png',
          description: t('defi.lendingProtocol'),
          position: '$0.00',
          tokens: '0',
          apy: '3.52%',
          onDetail: handleAaveDetail,
          onDeposit: handleDeposit,
          onRedeem: handleRedeem,
        },
        {
          id: 'compound',
          name: 'Compound',
          image: '/images/difi-loan.png',
          description: t('defi.lendingProtocol'),
          position: '$0.00',
          tokens: '0',
          apy: '4.12%',
          onDetail: null,
          onDeposit: handleDeposit,
          onRedeem: handleRedeem,
        },
        {
          id: 'makerdao',
          name: 'MakerDAO',
          image: '/images/real-assets.png',
          description: t('defi.lendingProtocol'),
          position: '$0.00',
          tokens: '0',
          apy: '2.85%',
          onDetail: null,
          onDeposit: handleDeposit,
          onRedeem: handleRedeem,
        },
      ]
    }

    // 将 Store 的 pools 转换为 defi 页面需要的格式
    return allPools.map((pool: any) => {
      const poolId = pool.id?.toString() || pool.poolId?.toString() || 'unknown'
      const poolName = pool.name || pool.poolName || ''
      const protocol = pool.protocol || pool.description || ''
      
      // TODO: 从 allocations 或其他数据源获取用户的 position 和 tokens
      // 目前先使用默认值或从 pool 数据中获取
      const position = pool.userPosition || pool.position || '$0.00'
      const tokens = pool.userTokens || pool.tokens?.length?.toString() || '0'
      
      // 强制使用 getPoolImage 函数来匹配图片，忽略后端返回的图片字段（确保使用最新的本地图片）
      const poolImage = getPoolImage(poolId, poolName, protocol)
      return {
        id: poolId,
        name: translatePoolName(poolName, language) || 'Unknown Pool',
        image: poolImage,
        description: translateProtocol(protocol, language) || t('defi.lendingProtocol'),
        position: typeof position === 'number' ? `$${position.toFixed(2)}` : position,
        tokens: tokens.toString(),
        apy: pool.apy ? `${pool.apy}%` : '0%',
        onDetail: poolId.toLowerCase().includes('aave') ? handleAaveDetail : null,
        onDeposit: handleDeposit,
        onRedeem: handleRedeem,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPools, language, t])

  // 统一的借贷池卡片渲染函数
  const renderLendingPoolCard = (pool: (typeof lendingPools)[0]) => (
    <div key={pool.id} className="shrink-0 w-49 bg-black-2 rounded-2xl">
      <div className="relative">
        <img
          src={pool.image}
          alt={pool.name}
          className="w-full h-[85px] object-cover object-center rounded-t-2xl"
        />
        {pool.apy && (
          <div
            className="absolute top-2 right-2 px-2 py-1 rounded text-[8px] text-white"
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 75%, transparent)' }}
          >
            APY {pool.apy}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <p className="text-white font-medium">{pool.name}</p>
            <p className="text-xs text-black-9">{pool.description}</p>
          </div>
          {pool.onDetail && (
            <SvgIcon
              src="/icons/questionMark.svg"
              className="w-4 h-4 cursor-pointer"
              onClick={pool.onDetail}
            />
          )}
        </div>
        <div className="mb-2"></div>
        <div className="flex justify-between">
          <div>
            <p className="text-[8px] text-black-9">{t('defi.position')}</p>
            <p className="text-xs text-white">{pool.position}</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] text-black-9">Tokens</p>
            <p className="text-xs text-white">{pool.tokens}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e) => e.preventDefault()}
            disabled={true}
            className="flex-1 bg-primary text-black rounded-[14px] h-[28px] text-[10px] font-medium flex items-center justify-center gap-1 opacity-50 cursor-not-allowed"
          >
            <SvgIcon src="/icons/deposit.svg" />
            {t('defi.deposit')}
          </button>
          <button
            onClick={(e) => e.preventDefault()}
            disabled={true}
            className="flex-1 text-main rounded-[14px] border-primary border h-[28px] text-[10px] font-medium flex items-center justify-center gap-1 opacity-50 cursor-not-allowed"
          >
            <SvgIcon src="/icons/redemption.svg" />
            {t('defi.redeem')}
          </button>
        </div>
      </div>
    </div>
  )

  // 股票列表项渲染函数
  const renderStockItem = (stock: (typeof stockListData)[0]) => (
    <div
      key={stock.id}
      className="border border-black-3 bg-black-2 rounded-2xl p-4"
    >
      <div className="bg-black-3 flex items-center gap-3 mb-4 p-4 rounded-xl">
        <img
          width={40}
          height={40}
          src={stock.logo}
          alt={stock.symbol}
          className="object-contain"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-white font-medium text-sm">{stock.name}</p>
              <p className="text-black-9 text-xs">{stock.symbol}</p>
            </div>
            <div className="text-right">
              <p className="text-white font-medium text-sm">{stock.price}</p>
              <p
                className={`text-xs ${
                  stock.changeType === 'positive'
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
              >
                {stock.change}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-base rounded-xl p-3 mb-4">
        <div className="flex justify-between items-center text-sm">
          <div>
            <p className="text-black-9">{t('defi.shares')}</p>
            <p className="text-black-9">{t('defi.value')}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-medium">{stock.shares}</p>
            <p className="text-white font-medium">{stock.value}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={(e) => e.preventDefault()}
          disabled={true}
          className="flex-1 bg-primary text-black rounded-[14px] h-8 text-sm font-medium opacity-50 cursor-not-allowed"
        >
          {t('defi.buy')}
        </button>
        <button
          onClick={(e) => e.preventDefault()}
          disabled={true}
          className="flex-1 bg-black-3 text-main rounded-[14px] border-primary border h-8 text-sm font-medium opacity-50 cursor-not-allowed"
        >
          {t('defi.redeem')}
        </button>
      </div>
    </div>
  )

  // 股票产品卡片渲染函数（使用借贷池相同样式）
  const renderStockProductCard = (product: (typeof stockProducts)[0]) => (
    <div key={product.id} className="bg-black-2 rounded-2xl">
      <div className="relative">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-[85px] object-cover object-center rounded-t-2xl"
        />
        {product.apy && (
          <div
            className="absolute top-2.5 left-4 px-2 py-1 rounded text-[8px] text-white"
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 75%, transparent)' }}
          >
            APY {product.apy}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <p className="text-white font-medium">{product.name}</p>
            <p className="text-xs text-black-9">{product.description}</p>
          </div>
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleRwaDetail}
          >
            <span className="text-xs text-black-9">{t('defi.productDescription')}</span>
            <SvgIcon src="/icons/home-right.svg" className="text-black-9" />
          </div>
        </div>
        <p className="text-sm text-black-9">{t('defi.position')}</p>
        <p className="text-white mb-4">{product.position}</p>

        {/* 可投资股票 */}
        <div className="mt-4">
          <div
            className="px-4 py-2 border rounded-xl border-black-3 flex items-center justify-between cursor-pointer"
            onClick={() => toggleProductStockExpansion(product.id)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-main">{t('defi.investableStocks')}</span>
              <span className="text-white text-xs px-2 py-0.5 border border-black-3 rounded-[6px]">
                {stockListData.length}
              </span>
            </div>
            <SvgIcon
              src="/icons/arrow-right-gray-icon.svg"
              className={`w-4 h-4 text-black-9 transition-transform ${
                productStockExpanded[product.id] ? 'rotate-270' : 'rotate-90'
              }`}
            />
          </div>

          {productStockExpanded[product.id] && (
            <div className="mt-3 space-y-3">
              {stockListData.map((stock) => renderStockItem(stock))}
            </div>
          )}
        </div>
      </div>
    </div>
  )


  const handleSelectVoucher = () => {
    selectVoucherSheet.open({})
  }

  const handleVoucherConfirm = (vouchers: Array<{ id: string; amount: number; allocationId?: string }>) => {
    setSelectedAllocations(vouchers)
    selectVoucherSheet.close()
    
    // 自动设置源代币（从已选择的凭证中获取）
    if (vouchers.length > 0) {
      const firstAllocationId = vouchers[0].allocationId || vouchers[0].id
      const firstAllocation = availableAllocations.find((alloc: any) => alloc.id === firstAllocationId)
      if (firstAllocation) {
        // 优先从 token 对象中获取 id
        const tokenId = firstAllocation.token?.id?.toString() || 
                       (firstAllocation as any).tokenId?.toString() ||
                       (firstAllocation as any).token_id?.toString()
        if (tokenId && tokenId !== 'unknown' && sourceTokenOptions.find(t => t.id === tokenId)) {
          extractFormStore.setSelectedSourceToken(tokenId)
        }
      }
    }
  }

  const handleGasDetailInfo = () => {
    gasDetailSheet.open({})
  }

  const handleExtractConfirm = async () => {
    console.log('=== 开始构建 quoteParams ===')
    console.log('selectedAllocations:', selectedAllocations)
    console.log('selectedNetwork:', selectedNetwork)
    console.log('selectedTargetToken:', selectedTargetToken)
    console.log('receivingAddress:', receivingAddress)
    console.log('chainId:', chainId)
    console.log('address:', address)
    console.log('selectedSourceToken:', selectedSourceToken)
    console.log('sourceTokenOptions:', sourceTokenOptions)
    console.log('targetTokenOptions:', targetTokenOptions)
    
    if (selectedAllocations.length === 0) {
      console.log('❌ 未选择凭证')
      showWarning(t('toast.selectVoucherFirst'))
      return
    }
    
    if (!selectedNetwork || !selectedTargetToken || !receivingAddress || !isReceivingAddressValid || !chainId || !address) {
      console.log('❌ 必填项不完整:', {
        selectedNetwork: !!selectedNetwork,
        selectedTargetToken: !!selectedTargetToken,
        receivingAddress: !!receivingAddress,
        isReceivingAddressValid,
        chainId: !!chainId,
        address: !!address,
      })
      showWarning(t('toast.completeRequiredFields'))
      return
    }
    
    // 构建 quoteParams
    console.log('开始计算总金额...')
    const totalAmount = selectedAllocations.reduce((sum, v) => sum + v.amount, 0)
    console.log('totalAmount:', totalAmount)
    // 使用 parseToWei 进行精确转换，避免浮点数精度问题
    const totalAmountWei = parseToWei(totalAmount, 18).toString()
    console.log('totalAmountWei:', totalAmountWei)
    
    console.log('查找源代币...')
    const sourceToken = sourceTokenOptions.find(t => t.id === selectedSourceToken)
    console.log('sourceToken:', sourceToken)
    
    console.log('查找目标代币...')
    // 先从 fixedTargetTokens 中获取选中的目标代币
    const fixedTargetToken = fixedTargetTokens.find(t => t.id === selectedTargetToken)
    console.log('fixedTargetToken:', fixedTargetToken)
    
    // 然后从 targetTokenOptions 中根据名称匹配获取 tokenAddress
    const targetTokenFromApi = fixedTargetToken 
      ? targetTokenOptions.find(t => t.name === fixedTargetToken.name || t.name.toUpperCase() === fixedTargetToken.name.toUpperCase())
      : null
    console.log('targetTokenFromApi:', targetTokenFromApi)
    
    // 构建目标代币对象，优先使用 API 返回的数据，如果没有则使用 fixedTargetToken
    const targetToken = targetTokenFromApi || (fixedTargetToken ? {
      id: fixedTargetToken.id,
      name: fixedTargetToken.name,
      icon: fixedTargetToken.icon,
      tokenAddress: '', // 如果没有从 API 获取到，则使用空字符串
    } : null)
    console.log('targetToken (最终):', targetToken)
    
    if (!sourceToken || !targetToken) {
      console.log('❌ 无法获取代币信息:', {
        sourceToken: !!sourceToken,
        targetToken: !!targetToken,
        fixedTargetToken: !!fixedTargetToken,
        targetTokenFromApi: !!targetTokenFromApi,
      })
      showError(t('toast.cannotGetTokenInfo'))
      return
    }
    
    console.log('构建 ownerData...')
    // chainId 来自钱包，是 EVM Chain ID，需要转换为 SLIP-44 ID
    const slip44ChainId = chainId ? evmToSlip44(chainId) : 0
    console.log('chainId 转换:', { evmChainId: chainId, slip44ChainId })
    const ownerData = createUniversalAddress(address, slip44ChainId)
    console.log('ownerData:', ownerData)
    
    console.log('构建 intent...')
    // 确保 tokenSymbol 有值
    const tokenSymbol = targetToken?.name || fixedTargetToken?.name || 'USDT'
    console.log('tokenSymbol 值:', tokenSymbol, {
      'targetToken?.name': targetToken?.name,
      'fixedTargetToken?.name': fixedTargetToken?.name,
      'fallback': 'USDT'
    })
    
    const beneficiaryChainId = parseInt(selectedNetwork)
    const beneficiary = createUniversalAddress(receivingAddress, beneficiaryChainId)
    const intent: RawTokenIntent = {
      type: 'RawToken' as const,
      beneficiary: beneficiary,
      tokenSymbol: tokenSymbol, // 使用 tokenSymbol 而不是 tokenContract
    }
    console.log('intent (完整):', JSON.stringify(intent, null, 2))
    
    const quoteParams = {
      ownerData,
      depositToken: sourceToken.tokenKey,
      intent,
      amount: totalAmountWei,
      includeHook: false,
      // 添加数量相关信息，用于刷新时计算
      totalAmount: totalAmount, // 可读格式的数量
      voucherCount: selectedAllocations.length, // 凭证数量
    }
    
    console.log('✅ quoteParams 构建完成:', quoteParams)
    console.log('=== 构建完成，打开 BottomSheet ===')
    
    // 将 quoteParams 传递给 BottomSheet
    extractConfirmSheet.open({ 
      quoteParams,
      useCustomAddress: useCustomAddress // 传递是否使用自定义地址的标志
    })
  }

  const handleExtractSubmit = async () => {
    // 测试模式：直接打开弹窗，不调用接口
    const TEST_MODE = false // 设置为 false 关闭测试模式
    if (TEST_MODE) {
      console.log('🧪 [测试模式] 直接打开弹窗，不调用接口')
      const testWithdrawalId = 'test-withdrawal-' + Date.now()
      extractConfirmSheet.close()
      processingSheet.open({ withdrawalId: testWithdrawalId })
      return
    }

    try {
      // 从 extractConfirmSheet 的 data 中获取 quoteParams
      const quoteParams = extractConfirmSheet.data?.quoteParams
      if (!quoteParams) {
        throw new Error('缺少 quoteParams，请先确认提取信息')
      }
      
      console.log('=== 使用 quoteParams 创建提款请求 ===')
      console.log('quoteParams:', quoteParams)
      
      // 从 quoteParams 中获取必要信息
      const intent = quoteParams.intent
      if (!intent || !intent.beneficiary) {
        throw new Error('quoteParams 中缺少 intent 或 beneficiary')
      }
      
      // 获取 allocationIds
      const allocationIds = selectedAllocations.map(v => v.allocationId || v.id)
      if (allocationIds.length === 0) {
        throw new Error('未选择凭证')
      }
      
      // 获取用户的 UniversalAddress (参考测试文件)
      if (!sdkStore.sdk || !sdkStore.sdk.address) {
        throw new Error('SDK 未连接或无法获取用户地址')
      }
      
      // 使用 quoteParams 中的 beneficiary（已经是 UniversalAddress 格式）
      // 如果 intent.beneficiary 存在且完整，直接使用；否则从 receivingAddress 重新创建
      let beneficiary: UniversalAddress
      if (intent.beneficiary && intent.beneficiary.data && intent.beneficiary.chainId) {
        // 直接使用 quoteParams 中的 beneficiary（已经是正确的 UniversalAddress）
        beneficiary = intent.beneficiary
        console.log('✅ 使用 quoteParams 中的 beneficiary:', {
          chainId: beneficiary.chainId,
          data: beneficiary.data,
          extractedAddress: extractAddress(beneficiary),
        })
      } else {
        // Fallback: 从 receivingAddress 重新创建
        const beneficiaryChainId = intent.beneficiary?.chainId || parseInt(selectedNetwork)
        if (!receivingAddress) {
          throw new Error('缺少接收地址')
        }
        beneficiary = createUniversalAddress(receivingAddress, beneficiaryChainId)
        console.log('⚠️ 从 receivingAddress 重新创建 beneficiary:', {
          receivingAddress,
          chainId: beneficiaryChainId,
          extractedAddress: extractAddress(beneficiary),
        })
      }
      
      // 构建 intent (使用 quoteParams 中的数据，但确保有 universalFormat)
      const withdrawIntent: RawTokenIntent = {
        type: 'RawToken' as const,
        beneficiary: beneficiary, // 使用 createUniversalAddress 创建的 beneficiary
        tokenSymbol: intent.tokenSymbol || 'USDT', // Token symbol (从 quoteParams 获取)
      }
      
      console.log('withdrawIntent:', withdrawIntent)
      console.log('allocationIds:', allocationIds)
      
      // 使用新的 API: 只传递 allocationIds 和 intent
      const result = await withdraw({
        allocationIds,
        intent: withdrawIntent,
      })
      
      console.log('提款请求已提交:', result)
      
      // 成功后，清空 Defi Store 中的凭证信息
      selectedVouchersStore.clearVouchers()
      console.log('已清空 Defi Store 中的凭证信息')
      
      // 刷新 allocations 数据，同步后端状态（idle -> pending）
      try {
        await fetchAllocations({ status: 'idle' })
        console.log('✅ 已刷新 allocations 数据，同步后端状态')
      } catch (error) {
        console.error('刷新 allocations 失败:', error)
      }
      
      extractConfirmSheet.close()
      processingSheet.open({ withdrawalId: result.id })
    } catch (error) {
      console.error('提款失败:', error)
      showError(t('toast.withdrawFailed') + ': ' + (error instanceof Error ? error.message : t('toast.unknownError')))
    }
  }

  const toggleDropdown = (cardId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardId]: !prev[cardId],
    }))
  }

  const handleProductDetail = (productType: string) => {
    router.push(`/difi/${productType}`)
  }

  const handleRwaDetail = () => {
    router.push('/defi/rwa')
  }

  // 所有可选择的凭证：系统中该用户所有处于idle状态的allocation
  const availableAllocations = useMemo(() => {
    return idleAllocations || []
  }, [idleAllocations])

  // 获取可用的源代币（从 allocations 中提取）
  const sourceTokenOptions = useMemo(() => {
    const tokenMap = new Map<string, { id: string; name: string; icon: string; tokenKey: string; chainId?: number }>()
    
    availableAllocations.forEach((alloc: any) => {
      // 获取 token symbol (token key)
      const tokenKey = alloc.token?.symbol || alloc.token?.token_key || 'UNKNOWN'
      
      // 如果没有 tokenKey，跳过这个 allocation
      if (!tokenKey || tokenKey === 'unknown' || tokenKey === 'UNKNOWN') {
        return
      }
      
      const tokenSymbol = alloc.token?.symbol || 'UNKNOWN'
      const tokenChainId = alloc.token?.chainId || alloc.token?.chain_id || alloc.token?.slip44_chain_id
      
      // 使用 tokenKey 作为 id
      if (!tokenMap.has(tokenKey)) {
        tokenMap.set(tokenKey, {
          id: tokenKey,
          name: tokenSymbol,
          icon: tokenSymbol.toLowerCase(),
          tokenKey: tokenKey,
          chainId: tokenChainId,
        })
      }
    })
    
    return Array.from(tokenMap.values())
  }, [availableAllocations])

  // 从路由结果中提取目标代币选项
  const targetTokenOptions = useMemo(() => {
    if (!selectedNetwork || !allowedTargets) return []
    
    const selectedSlip44Id = parseInt(selectedNetwork)
    // 将 SLIP-44 转换为 EVM Chain ID（如果需要）
    const selectedEvmId = selectedSlip44Id === 714 ? 56 : (selectedSlip44Id === 60 ? 1 : selectedSlip44Id)
    
    // 在 allowedTargets 中查找匹配的网络（可能使用 EVM 或 SLIP-44）
    const target = allowedTargets.find(t => 
      t.chain_id === selectedSlip44Id || t.chain_id === selectedEvmId
    )
    
    if (!target) return []
    
    const tokens: Array<{ id: string; name: string; icon: string; tokenAddress?: string; poolId?: number }> = []
    
    target.pools.forEach((pool) => {
      pool.tokens.forEach((token) => {
        tokens.push({
          id: token.token_id_in_rule || token.token_id?.toString() || 'unknown',
          name: token.token_symbol,
          icon: token.token_symbol.toLowerCase(),
          tokenAddress: token.token_address,
          poolId: pool.pool_id,
        })
      })
    })
    
    return tokens
  }, [selectedNetwork, allowedTargets])

  // 当选择源代币、目标网络、目标代币和接收地址时，查询可用路由
  useEffect(() => {
    if (selectedSourceToken && selectedNetwork && selectedTargetToken && receivingAddress) {
      const sourceToken = sourceTokenOptions.find(t => t.id === selectedSourceToken)
      const targetToken = targetTokenOptions.find(t => t.id === selectedTargetToken)
      
      if (sourceToken && sourceToken.chainId && sourceToken.tokenKey && 
          targetToken && selectedNetwork && receivingAddress) {
        // 构建 Intent (RawToken 类型)
        const beneficiary = createUniversalAddress(receivingAddress, parseInt(selectedNetwork))
        const intent: RawTokenIntent = {
          type: 'RawToken' as const,
          beneficiary: beneficiary,
          tokenSymbol: targetToken.name, // 目标代币的 Token Key (如 "USDT")
        }
        
        getAllowedTargets({
          source_chain_id: sourceToken.chainId,
          source_token_key: sourceToken.tokenKey,
          intent: {
            type: intent.type,
            beneficiary: {
              chainId: intent.beneficiary.chainId,
              address: extractAddress(intent.beneficiary),
            },
            tokenKey: intent.tokenSymbol, // Map tokenSymbol to tokenKey for API compatibility
          },
        }).catch(err => {
          console.error('查询路由失败:', err)
        })
      }
    }
  }, [selectedSourceToken, selectedNetwork, selectedTargetToken, receivingAddress, sourceTokenOptions, targetTokenOptions, getAllowedTargets])

  // 从路由结果中提取网络和代币选项
  // 将 EVM Chain ID 转换为 SLIP-44 Chain ID
  const evmToSlip44 = (evmChainId: number): number => {
    switch (evmChainId) {
      case 56: // BNB Chain
        return 714
      case 1: // Ethereum
        return 60
      case 137: // Polygon
        return 966
      default:
        return evmChainId // 如果已经是 SLIP-44，直接返回
    }
  }

  // 获取当前连接网络对应的网络选项 ID
  const getCurrentNetworkId = useMemo(() => {
    if (!chainId) return null
    
    // chainId 可能是 EVM Chain ID，需要转换为 SLIP-44
    const slip44ChainId = evmToSlip44(chainId)
    return slip44ChainId.toString()
  }, [chainId])

  const networkOptions = useMemo(() => {
    if (!allowedTargets || allowedTargets.length === 0) {
      return [
        { id: '60', name: 'Ethereum', icon: 'network-eth', chainId: 60 },
        { id: '714', name: 'BNB Chain', icon: 'network-bnb', chainId: 714 },
        { id: '195', name: 'TRON', icon: 'network-tron', chainId: 195 },
      ]
    }
    
    return allowedTargets.map((target) => {
      let name = 'Unknown'
      let icon = 'network-eth'
      
      if (target.chain_id === 60 || target.chain_id === 1) {
        name = 'Ethereum'
        icon = 'network-eth'
      } else if (target.chain_id === 714 || target.chain_id === 56) {
        name = 'BNB Chain'
        icon = 'network-bnb'
      } else if (target.chain_id === 195) {
        name = 'TRON'
        icon = 'network-tron'
      }
      
      // 统一使用 SLIP-44 Chain ID 作为 id
      const slip44Id = target.chain_id === 1 ? 60 : (target.chain_id === 56 ? 714 : target.chain_id)
      
      return {
        id: slip44Id.toString(),
        name,
        icon,
        chainId: slip44Id,
      }
    })
  }, [allowedTargets])

  // 自动设置默认网络（与当前连接的网络一致）
  useEffect(() => {
    if (getCurrentNetworkId && networkOptions.length > 0) {
      const matchingNetwork = networkOptions.find(n => n.id === getCurrentNetworkId)
      if (matchingNetwork) {
        // 如果当前选择的网络与连接的网络不一致，自动切换
        if (selectedNetwork !== matchingNetwork.id) {
          extractFormStore.setSelectedNetwork(matchingNetwork.id)
        }
      }
    }
  }, [getCurrentNetworkId, networkOptions])

  // 初始化选中的源代币
  useEffect(() => {
    if (sourceTokenOptions.length > 0 && !selectedSourceToken) {
      extractFormStore.setSelectedSourceToken(sourceTokenOptions[0].id)
    }
  }, [sourceTokenOptions, selectedSourceToken])

  // 验证收益地址（当地址或网络变化时）
  useEffect(() => {
    if (receivingAddress && selectedNetwork) {
      const isValid = validateAddressForSlip44(receivingAddress, selectedNetwork)
      extractFormStore.setReceivingAddressValid(isValid)
    } else {
      extractFormStore.setReceivingAddressValid(false)
    }
  }, [receivingAddress, selectedNetwork])

  // 离开页面时清空收益地址
  useEffect(() => {
    return () => {
      // 组件卸载时清空收益地址
      extractFormStore.setReceivingAddress('')
      extractFormStore.setReceivingAddressValid(false)
    }
  }, [])

  // 使用 useRef 跟踪上一次的地址，避免重复执行
  const prevAddressRef = useRef<string | null>(null)
  
  // 账户切换时重置所有相关状态并清空 SDK store 缓存
  useEffect(() => {
    // 如果地址没有变化，不执行
    if (prevAddressRef.current === address) {
      return
    }
    
    // 更新上一次的地址
    prevAddressRef.current = address
    
    if (!address) {
      // 账户断开时，清空所有状态
      setSelectedAllocations([])
      extractFormStore.setReceivingAddress('')
      extractFormStore.setReceivingAddressValid(false)
      // 关闭所有弹窗
      depositSheet.close()
      redeemSheet.close()
      buyStockSheet.close()
      redeemStockSheet.close()
      selectVoucherSheet.close()
      gasDetailSheet.close()
      extractConfirmSheet.close()
      processingSheet.close()
      
      // 注意：SDK 的断开和缓存清空由 SDKProvider 统一管理
      return
    }

    // 账户切换时（address 变化），重置页面状态
    // 注意：SDK 的断开、重连和缓存清空由 SDKProvider 统一管理
    
    // 清空选中的凭证
    setSelectedAllocations([])
    
    // 重置提取表单状态
    extractFormStore.setReceivingAddress('')
    extractFormStore.setReceivingAddressValid(false)
    
    // 关闭所有弹窗
    depositSheet.close()
    redeemSheet.close()
    buyStockSheet.close()
    redeemStockSheet.close()
    selectVoucherSheet.close()
    gasDetailSheet.close()
    extractConfirmSheet.close()
    processingSheet.close()
    // 注意：只依赖 address，使用 useRef 来避免重复执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  // 当选择凭证后，自动查询路由和费用
  useEffect(() => {
    if (selectedAllocations.length > 0 && selectedNetwork && selectedTargetToken && receivingAddress && isReceivingAddressValid && chainId) {
      const totalAmount = selectedAllocations.reduce((sum, alloc) => sum + alloc.amount, 0)
      // 使用 parseToWei 进行精确转换，避免浮点数精度问题
      const totalAmountWei = parseToWei(totalAmount, 18).toString()
      
      const sourceToken = sourceTokenOptions.find(t => t.id === selectedSourceToken)
      // 先从 fixedTargetTokens 中获取选中的目标代币
      const fixedTargetToken = fixedTargetTokens.find(t => t.id === selectedTargetToken)
      // 然后从 targetTokenOptions 中根据名称匹配获取 tokenAddress
      const targetTokenFromApi = fixedTargetToken 
        ? targetTokenOptions.find(t => t.name === fixedTargetToken.name || t.name.toUpperCase() === fixedTargetToken.name.toUpperCase())
        : null
      // 构建目标代币对象，优先使用 API 返回的数据，如果没有则使用 fixedTargetToken
      const targetToken = targetTokenFromApi || (fixedTargetToken ? {
        id: fixedTargetToken.id,
        name: fixedTargetToken.name,
        icon: fixedTargetToken.icon,
        tokenAddress: '',
      } : null)
      
      if (sourceToken && targetToken && address) {
        // 确保 tokenSymbol 有值
        const tokenSymbol = targetToken?.name || fixedTargetToken?.name || 'USDT'
        console.log('useEffect 中构建 intent, tokenSymbol:', tokenSymbol)
        
        // 创建 beneficiary (接收地址的 UniversalAddress)
        const beneficiaryChainId = parseInt(selectedNetwork)
        const beneficiary = createUniversalAddress(receivingAddress, beneficiaryChainId)
        
        const intent: RawTokenIntent = {
          type: 'RawToken' as const,
          beneficiary: beneficiary,
          tokenSymbol: tokenSymbol, // 使用 tokenSymbol 而不是 tokenContract
        }
        console.log('useEffect 中的 intent:', JSON.stringify(intent, null, 2))
        
        // chainId 来自钱包，是 EVM Chain ID，需要转换为 SLIP-44 ID
        const slip44ChainId = chainId ? evmToSlip44(chainId) : 0
        const ownerData = createUniversalAddress(address, slip44ChainId)
        getRouteAndFees({
          ownerData: ownerData,
          depositToken: sourceToken.tokenKey,
          intent,
          amount: totalAmountWei,
          includeHook: false,
        }).catch(err => {
          console.error('查询路由和费用失败:', err)
        })
      }
    }
  }, [selectedAllocations, selectedNetwork, selectedTargetToken, receivingAddress, isReceivingAddressValid, chainId, address, sourceTokenOptions, targetTokenOptions, selectedSourceToken, getRouteAndFees])

  const handleBuyStock = (stock: any) => {
    setSelectedStock(stock)
    buyStockSheet.open({})
  }

  const handleRedeemStock = (stock: any) => {
    setSelectedStock(stock)
    redeemStockSheet.open({})
  }

  // 股票列表数据
  const stockListData = [
    {
      id: 'amzn',
      name: t('defi.stocks.amzn'),
      symbol: 'AMZN',
      price: '$107.70',
      change: '-0.12%',
      changeType: 'negative' as const,
      shares: 6.72,
      value: '$1199.65',
      logo: '/images/aws.png',
    },
    {
      id: 'aapl',
      name: t('defi.stocks.aapl'),
      symbol: 'AAPL',
      price: '$189.50',
      change: '+2.35%',
      changeType: 'positive' as const,
      shares: 8.45,
      value: '$1601.28',
      logo: '/images/google.png',
    },
    {
      id: 'tsla',
      name: t('defi.stocks.tsla'),
      symbol: 'TSLA',
      price: '$248.42',
      change: '-1.87%',
      changeType: 'negative' as const,
      shares: 5.21,
      value: '$1294.27',
      logo: '/images/real-assets.png',
    },
  ]

  // 股票数据
  // 股票产品数据 - 使用借贷池渲染方式
  const stockProducts = [
    {
      id: 'us-stocks',
      name: t('defi.stockProducts.usStocks.name'),
      image: '/images/real-assets.png',
      description: t('defi.stockProducts.usStocks.description'),
      position: '7953.33',
      tokens: '3',
      apy: '3.52%',
      onDetail: () => handleProductDetail('us-stocks'),
      onDeposit: () => handleBuyStock('us-stocks'),
      onRedeem: () => handleRedeemStock('us-stocks'),
    },
    {
      id: 'nasdaq-100',
      name: t('defi.stockProducts.nasdaq100.name'),
      image: '/images/trend.png',
      description: t('defi.stockProducts.nasdaq100.description'),
      position: '1348.68',
      tokens: '2',
      apy: '2.85%',
      onDetail: () => handleProductDetail('nasdaq-100'),
      onDeposit: () => handleBuyStock('nasdaq-100'),
      onRedeem: () => handleRedeemStock('nasdaq-100'),
    },
    {
      id: 'sp-500',
      name: t('defi.stockProducts.sp500.name'),
      image: '/images/sp-500.png',
      description: t('defi.stockProducts.sp500.description'),
      position: '586.63',
      tokens: '1',
      apy: '4.15%',
      onDetail: () => handleProductDetail('sp-500'),
      onDeposit: () => handleBuyStock('sp-500'),
      onRedeem: () => handleRedeemStock('sp-500'),
    },
  ]

  const stocksData = {
    'us-stocks': [
      {
        id: 'amzn-1',
        name: t('defi.stocks.amzn'),
        symbol: 'AMZN',
        logo: '/images/aws.png',
        price: '$107.70',
        change: '-0.12%',
        changeType: 'down',
        shares: '6.72',
        value: '$1199.65',
      },
      {
        id: 'amzn-2',
        name: t('defi.stocks.amzn'),
        symbol: 'AMZN',
        logo: '/images/aws.png',
        price: '$107.70',
        change: '-0.12%',
        changeType: 'down',
        shares: '6.72',
        value: '$1199.65',
      },
      {
        id: 'goog',
        name: t('defi.stocks.goog'),
        symbol: 'GOOG',
        logo: '/images/google.png',
        price: '$107.70',
        change: '+0.12%',
        changeType: 'up',
        shares: '6.72',
        value: '$1199.65',
      },
    ],
    'nasdaq-100': [
      {
        id: 'aapl',
        name: t('defi.stocks.aapl'),
        symbol: 'AAPL',
        logo: '/images/google.png',
        price: '$150.25',
        change: '+1.25%',
        changeType: 'up',
        shares: '4.50',
        value: '$675.00',
      },
      {
        id: 'msft',
        name: t('defi.stocks.msft'),
        symbol: 'MSFT',
        logo: '/images/google.png',
        price: '$320.80',
        change: '-0.85%',
        changeType: 'down',
        shares: '2.10',
        value: '$673.68',
      },
    ],
    'sp-500': [
      {
        id: 'tsla',
        name: t('defi.stocks.tsla'),
        symbol: 'TSLA',
        logo: '/images/google.png',
        price: '$180.50',
        change: '+2.15%',
        changeType: 'up',
        shares: '3.25',
        value: '$586.63',
      },
    ],
  }

  return (
    <>
      {/* 提取页面内容 */}
      <div className="px-4 space-y-6 pb-20">
          {/* 凭证详情 */}
          <div className="bg-black-2 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-main">
                {t('defi.voucherDetails')}
              </h2>
              {/* 如果已选择凭证，在标题右侧显示代币信息 */}
              {selectedAllocations.length > 0 && (() => {
                // 从已选择的凭证中获取第一个 allocation 的 token 信息
                const firstAllocationId = selectedAllocations[0].allocationId || selectedAllocations[0].id
                const firstAllocation = availableAllocations.find((alloc: any) => alloc.id === firstAllocationId)
                const tokenSymbol = firstAllocation?.token?.symbol || firstAllocation?.token?.name || 'USDT'
                const tokenIcon = tokenSymbol.toUpperCase()
                
                return (
                  <div className="flex items-center gap-2">
                    <SvgIcon
                      src={`/icons/${tokenIcon}.svg`}
                      className="w-5 h-5"
                    />
                    <span className="text-sm text-white font-medium">{tokenSymbol}</span>
                  </div>
                )
              })()}
            </div>

            {/* 可选凭证 */}
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1 text-sm text-black-9">
                <span>{t('defi.optional')}</span>
                <span>{availableAllocations.length}{t('voucher.voucherCount')}</span>
              </div>
              <span className="text-sm text-white">
                {formatUSDTAmount(availableAllocations.reduce((sum, alloc: any) => {
                  // Enclave 系统中统一使用 18 位 decimal
                  const amount = parseFloat(alloc.amount || '0') / Math.pow(10, 18)
                  return sum + amount
                }, 0))} USDT
              </span>
            </div>

            {/* 已选凭证 */}
            <div className="flex items-center justify-between gap-1 text-sm text-black-9">
              <div className="flex items-center gap-1">
                <span className="text-sm text-black-9">{t('defi.selected')}</span>
                <span className="text-sm text-white ml-2">
                  {selectedAllocations.length}{t('voucher.voucherCount')} ({formatUSDTAmount(selectedAllocations.reduce((sum, v) => sum + v.amount, 0))}USDT)
                </span>
              </div>
              {/* 选择凭证按钮 */}
              <button
                onClick={() => handleSelectVoucher()}
                className="flex items-center justify-center h-8 px-4 rounded-[14px] text-sm text-black-1 font-bold bg-primary"
                aria-label={t('defi.selectVoucher')}
              >
                {t('defi.selectVoucher')}
                {/* <SvgIcon src="/icons/folder-open.svg" className="w-5 h-5" /> */}
              </button>
            </div>
          </div>


          {/* 提取到链（步骤 1.1.3） */}
          {selectedSourceToken && networkOptions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-medium text-main">
                {t('defi.extractToChain')}
              </h3>
              {/* 目标代币选择（嵌入在标题右侧） */}
              {selectedNetwork && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-black-9">{t('defi.selectTargetToken')}:</span>
                  <div className="flex gap-2">
                    {fixedTargetTokens.map((token) => {
                      const isSelected = selectedTargetToken === token.id
                      const isDisabled = !token.enabled
                      
                      return (
                        <button
                          key={token.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!isDisabled) {
                              extractFormStore.setSelectedTargetToken(token.id)
                            }
                          }}
                          disabled={isDisabled}
                          className={`w-8 h-8 rounded-[20%] border transition-colors flex items-center justify-center ${
                            isDisabled
                              ? 'bg-black-3 border-black-3 opacity-50 cursor-not-allowed'
                              : isSelected
                              ? 'bg-primary text-black border-primary'
                              : 'bg-black-3 text-main border-black-3 hover:bg-black-2'
                          }`}
                        >
                          <SvgIcon
                            src={`/icons/${token.icon}.svg`}
                            className="w-4 h-4"
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 网络选择器 */}
            <div className="relative">
              <div
                className="border border-black-3 rounded-xl px-4 h-12 flex items-center justify-between cursor-pointer hover:bg-black-3 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  extractFormStore.setIsNetworkSelectorOpen(!isNetworkSelectorOpen)
                }}
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    const currentNetwork = networkOptions.find(
                      (network) => network.id === selectedNetwork
                    )
                    return (
                        <>
                          {currentNetwork ? (
                      <>
                        <SvgIcon
                                src={`/icons/${currentNetwork.icon}.svg`}
                          className="w-6 h-6"
                        />
                        <span className="text-main font-medium">
                                {currentNetwork.name}
                        </span>
                            </>
                          ) : (
                            <span className="text-black-9">{t('defi.selectNetwork')}</span>
                          )}
                      </>
                    )
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-black-9">{t('wallet.select')}</span>
                  <SvgIcon
                    src="/icons/arrow-right-gray-icon.svg"
                    className={`w-2 h-2 text-black-9 transition-transform ${
                      isNetworkSelectorOpen ? 'rotate-270' : 'rotate-90'
                    }`}
                  />
                </div>
              </div>

              {/* 网络选择列表 */}
              {isNetworkSelectorOpen && (
                <>
                  {/* 点击外部关闭的遮罩层 */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => extractFormStore.setIsNetworkSelectorOpen(false)}
                  />
                  <div 
                    className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-black-3 overflow-hidden p-3 space-y-2 bg-black-1 z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {networkOptions.map((network) => {
                      const isCurrentNetwork = network.id === getCurrentNetworkId
                      const isDisabled = !isCurrentNetwork
                      
                      return (
                        <div
                          key={network.id}
                          className={`px-4 h-11 flex items-center justify-between border rounded-xl transition-colors ${
                            isDisabled
                              ? 'border-black-3 opacity-50 cursor-not-allowed'
                              : selectedNetwork === network.id
                              ? 'border-primary bg-black-3 cursor-pointer'
                              : 'border-black-3 hover:bg-black-2 cursor-pointer'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!isDisabled) {
                              extractFormStore.setSelectedNetwork(network.id)
                              extractFormStore.setIsNetworkSelectorOpen(false)
                            }
                          }}
                        >
                      <div className="flex items-center gap-3">
                        <SvgIcon
                          src={`/icons/${network.icon}.svg`}
                          className="w-6 h-6"
                        />
                        <span className={`font-medium ${
                          isDisabled ? 'text-black-9' : 'text-main'
                        }`}>
                          {network.name}
                        </span>
                        {isCurrentNetwork && (
                          <span className="text-xs text-black-9">{t('defi.currentNetwork')}</span>
                        )}
                      </div>
                      {selectedNetwork === network.id && !isDisabled && (
                        <SvgIcon
                          src="/icons/checked.svg"
                          className="w-5 h-5"
                        />
                      )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          )}

          {/* 收益地址 */}
          <div>
            <h3 className="text-base font-medium text-main mb-3">
              {t('defi.receivingAddress')}
            </h3>
            
            {/* 使用自定义地址开关 */}
            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="useCustomAddress"
                checked={useCustomAddress}
                onChange={(e) => {
                  extractFormStore.setUseCustomAddress(e.target.checked)
                }}
                className="w-4 h-4 rounded border-primary bg-transparent text-primary focus:ring-primary focus:ring-offset-0"
              />
              <label htmlFor="useCustomAddress" className="text-sm text-black-9 cursor-pointer">
                使用自定义地址
              </label>
            </div>

            {/* 地址选择/输入 */}
            {!useCustomAddress && filteredAddresses.length > 0 ? (
              // 地址列表下拉选择
              <div className="relative">
                <select
                  value={selectedAddressId || ''}
                  onChange={(e) => {
                    const addressId = e.target.value ? parseInt(e.target.value) : null
                    extractFormStore.setSelectedAddressId(addressId)
                  }}
                  disabled={!isAddressListValid}
                  className={`w-full bg-transparent border rounded-xl px-4 py-3 text-white focus:outline-none ${
                    !isAddressListValid
                      ? 'border-red-500 opacity-50 cursor-not-allowed'
                      : selectedAddressId
                      ? 'border-primary focus:border-primary'
                      : 'border-primary focus:border-primary'
                  }`}
                >
                  <option value="" className="bg-black-1">
                    请选择地址
                  </option>
                  {filteredAddresses.map((addr) => (
                    <option key={addr.id} value={addr.id} className="bg-black-1">
                      #{addr.id}: {addr.address.slice(0, 10)}...{addr.address.slice(-8)}
                    </option>
                  ))}
                </select>
                {!isAddressListValid && (
                  <p className="mt-2 text-sm text-red-500">
                    地址列表验证失败，请检查配置
                  </p>
                )}
                {selectedNetwork && filteredAddresses.length === 0 && (
                  <p className="mt-2 text-sm text-yellow-500">
                    当前网络没有可用的地址，请使用自定义地址
                  </p>
                )}
              </div>
            ) : (
              // 手动输入地址
              <div className="relative">
                <input
                  ref={receivingAddressInputRef}
                  type="text"
                  value={receivingAddress}
                  onChange={(e) => extractFormStore.setReceivingAddress(e.target.value)}
                  onFocus={handleReceivingAddressFocus}
                  onBlur={handleReceivingAddressBlur}
                  placeholder={getAddressPlaceholder(selectedNetwork, t)}
                  className={`w-full bg-transparent border rounded-xl px-4 py-3 pr-10 text-white placeholder-black-9 focus:outline-none ${
                    receivingAddress && selectedNetwork
                      ? isReceivingAddressValid
                        ? 'border-primary focus:border-primary'
                        : 'border-red-500 focus:border-red-500'
                      : 'border-primary focus:border-primary'
                  }`}
                />
                {receivingAddress && (
                  <button
                    onClick={() => {
                      extractFormStore.setReceivingAddress('')
                      extractFormStore.setReceivingAddressValid(false)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 hover:bg-black-3 rounded-[20%] transition-colors"
                    type="button"
                  >
                    <SvgIcon
                      src="/icons/common-close.svg"
                      className="w-4 h-4 text-black-9"
                    />
                  </button>
                )}
              </div>
            )}
            
            {/* 地址验证错误提示 */}
            {receivingAddress && selectedNetwork && !isReceivingAddressValid && useCustomAddress && (
              <p className="mt-2 text-sm text-red-500">
                {t('defi.invalidAddress')} {selectedNetwork === '195' ? 'TRON' : 'EVM'}
              </p>
            )}
          </div>

          {/* 预估Gas费用（步骤 1.1.5） */}
          {quoteResult && (
          <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-black-9">
                {t('defi.estimatedGasLabel')} 0USDT
                {/* {t('defi.estimatedGasLabel')} {quoteResult.fees?.summary?.totalGasCostUSD || '0.00'}USDT */}
              </span>
            <button
              onClick={() => handleGasDetailInfo()}
              className="w-4 h-4 rounded-[20%] flex items-center justify-center hover:bg-black-4 transition-colors cursor-pointer"
            >
              <SvgIcon
                src="/icons/questionMark.svg"
                className="w-4 h-4 text-black-9"
                monochrome
              />
            </button>
          </div>
          )}

          {/* 提取凭证按钮 */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => handleExtractConfirm()}
              disabled={
                selectedAllocations.length === 0 || 
                !selectedNetwork || 
                !selectedTargetToken || 
                !receivingAddress || 
                !isReceivingAddressValid || 
                withdrawLoading ||
                (!useCustomAddress && filteredAddresses.length > 0 && !isAddressListValid) // 如果使用地址列表但验证失败，禁用按钮
              }
              className={`w-[230px] h-[50px] bg-primary text-black-2 rounded-[14px] font-bold ${
                selectedAllocations.length === 0 || 
                !selectedNetwork || 
                !selectedTargetToken || 
                !receivingAddress || 
                !isReceivingAddressValid || 
                withdrawLoading ||
                (!useCustomAddress && !isAddressListValid)
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
            >
              {withdrawLoading 
                ? t('defi.processingLabel') 
                : selectedTargetToken 
                  ? `${t('defi.withdraw')}${fixedTargetTokens.find(t => t.id === selectedTargetToken)?.name || selectedTargetToken}`
                  : t('defi.withdrawVoucher')}
            </button>
            {/* 调试信息：显示按钮禁用的原因（开发环境） */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-2 text-xs text-black-9 text-center">
                {selectedAllocations.length === 0 && t('defi.noVouchers') + ' '}
                {!selectedNetwork && t('defi.noNetwork') + ' '}
                {!selectedTargetToken && t('defi.noTargetToken') + ' '}
                {!receivingAddress && t('defi.noAddress') + ' '}
                {receivingAddress && selectedNetwork && !isReceivingAddressValid && t('defi.invalidAddress') + ' '}
                {withdrawLoading && t('deposit.processing') + ' '}
              </div>
            )}
          </div>
      </div>

      {/* 存入底部弹窗 */}
      <BottomSheet
        isOpen={depositSheet.isOpen}
        onClose={depositSheet.close}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-black-1"
      >
        <DepositVoucherSheet />
      </BottomSheet>

      {/* 赎回底部弹窗 */}
      <BottomSheet
        isOpen={redeemSheet.isOpen}
        onClose={redeemSheet.close}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-black-1"
      >
        <RedeemAssetSheet onClose={redeemSheet.close} />
      </BottomSheet>

      {/* 买入股票底部弹窗 */}
      <BottomSheet
        isOpen={buyStockSheet.isOpen}
        onClose={buyStockSheet.close}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-black-1"
      >
        {selectedStock && (
          <BuyStockSheet stock={selectedStock} onClose={buyStockSheet.close} />
        )}
      </BottomSheet>

      {/* 赎回股票底部弹窗 */}
      <BottomSheet
        isOpen={redeemStockSheet.isOpen}
        onClose={redeemStockSheet.close}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-black-1"
      >
        {selectedStock && (
          <RedeemStockSheet
            stock={selectedStock}
            onClose={redeemStockSheet.close}
          />
        )}
      </BottomSheet>

      {/* 选择凭证底部弹窗 */}
      <BottomSheet
        isOpen={selectVoucherSheet.isOpen}
        onClose={selectVoucherSheet.close}
        showCloseButton={false}
        className="bg-black-1"
      >
        <SelectVoucherSheet
          onClose={selectVoucherSheet.close}
          onConfirm={(vouchers) => {
            selectedVouchersStore.setSelectedVouchers(vouchers)
            handleVoucherConfirm(vouchers)
            selectVoucherSheet.close()
          }}
        />
      </BottomSheet>

      {/* Gas费用详情底部弹窗 */}
      <BottomSheet
        isOpen={gasDetailSheet.isOpen}
        onClose={gasDetailSheet.close}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-black-1"
      >
        <GasDetailSheet onClose={gasDetailSheet.close} />
      </BottomSheet>

      {/* 提取确认底部弹窗 */}
      <BottomSheet
        isOpen={extractConfirmSheet.isOpen}
        onClose={extractConfirmSheet.close}
        height="auto"
        showCloseButton={false}
        closeOnOverlayClick={true}
        className="bg-black-1"
      >
        <ExtractConfirmSheet
          isOpen={extractConfirmSheet.isOpen}
          onClose={extractConfirmSheet.close}
          onBack={() => {
            extractConfirmSheet.close()
          }}
          onConfirm={handleExtractSubmit}
          selectedAllocations={selectedAllocations}
          recipientAddress={receivingAddress}
          targetChain={selectedNetwork ? parseInt(selectedNetwork) : undefined}
          targetToken={selectedTargetToken}
          quoteParams={extractConfirmSheet.data?.quoteParams}
          useCustomAddress={extractConfirmSheet.data?.useCustomAddress || false}
        />
      </BottomSheet>

      {/* 正在处理底部弹窗 */}
      <BottomSheet
        isOpen={processingSheet.isOpen}
        onClose={processingSheet.close}
        showCloseButton={false}
        className="bg-black-1"
      >
        <ProcessingSheet
          onClose={() => {
            processingSheet.close()
            // ProcessingSheet 内部会处理路由跳转
          }}
          transactionHash={processingSheet.data?.transactionHash}
          withdrawalId={processingSheet.data?.withdrawalId}
        />
      </BottomSheet>
    </>
  )
}

export default observer(DifiPage)
