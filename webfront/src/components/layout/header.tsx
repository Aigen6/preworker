'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import SvgIcon from '@/components/ui/SvgIcon'
import { useBottomSheetContext } from '@/components/providers/bottom-sheet-provider'
import { useLanguage } from '@/components/providers/language-provider'
import { useWallet } from '@/components/providers/wallet-provider'
import { LanguageSelector } from '@/components/language/language-selector'
import { WalletModal } from '@/components/wallet/wallet-modal'
import { useSDKStore } from '@/lib/stores/sdk-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { appConfig } from '@/lib/config'
import { observer } from 'mobx-react-lite'
import { useRiskFeeInfo } from '@/lib/hooks/use-risk-fee-info'
import { AddressRankDisplayer } from '@/components/ui/address-rank-displayer'

function HeaderComponent() {
  const router = useRouter()
  const pathname = usePathname()
  const { openBottomSheet, closeBottomSheet } = useBottomSheetContext()
  const { currentLanguage, setLanguage } = useLanguage()
  const { isConnected: isWalletConnected, account } = useWallet()
  const sdkStore = useSDKStore()
  const { t } = useTranslation()
  
  // 四种状态：
  // 1. 否，否 - 未连接钱包，未认证后端
  // 2. 否，是 - 未连接钱包，已认证后端（理论上不可能，但保留）
  // 3. 是，否 - 已连接钱包，未认证后端
  // 4. 是，是 - 已连接钱包，已认证后端
  const isBackendAuthenticated = sdkStore.sdk?.isConnected || false

  // 风险评分和费率信息
  const {
    riskFeeInfo,
    metadata: riskFeeMetadata,
    loading: isFetchingRiskFee,
    fetchRiskFeeInfo,
  } = useRiskFeeInfo()

  // 钱包连接后自动获取风险评分和费率信息
  useEffect(() => {
    if (isWalletConnected && account?.nativeAddress && sdkStore.sdk && account?.chainId) {
      fetchRiskFeeInfo('USDT').catch(() => {
        // 静默处理错误，不显示错误提示
      })
    }
  }, [isWalletConnected, account?.nativeAddress, sdkStore.sdk, account?.chainId, fetchRiskFeeInfo])

  // 处理刷新风险评分和费率
  const handleRefreshRiskFee = async () => {
    try {
      await fetchRiskFeeInfo('USDT', true) // forceRefresh = true
    } catch (err) {
      console.error('刷新风险评分和费率失败:', err)
    }
  }

  // 根据 chainId 获取链图标
  const getChainIcon = (chainId: number | null | undefined): string | null => {
    if (!chainId) return null
    
    const chainIconMap: Record<number, string> = {
      1: '/icons/network-eth.svg',      // Ethereum
      56: '/icons/network-bnb.svg',     // BNB Chain
      137: '/icons/network-pol.svg',    // Polygon
      195: '/icons/network-tron.svg',   // TRON
    }
    
    return chainIconMap[chainId] || null
  }

  // 根据 chainId 获取链名称
  const getChainName = (chainId: number | null | undefined): string => {
    if (!chainId) return ''
    
    const chainNameMap: Record<number, string> = {
      1: 'Ethereum',
      56: 'BNB Chain',
      137: 'Polygon',
      195: 'TRON',
    }
    
    return chainNameMap[chainId] || `Chain ${chainId}`
  }

  // 格式化地址显示（缩短格式）
  const formatAddress = (address: string | null | undefined): string => {
    if (!address) return ''
    if (address.length <= 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const chainIcon = getChainIcon(account?.chainId)
  const fullAddress = account?.nativeAddress || ''
  const shortAddress = formatAddress(account?.nativeAddress)
  
  // 响应式地址显示：根据容器宽度决定显示完整地址还是缩略地址
  const addressContainerRef = useRef<HTMLDivElement>(null)
  const addressTextRef = useRef<HTMLSpanElement>(null)
  const [showFullAddress, setShowFullAddress] = useState(false)
  
  useEffect(() => {
    if (!addressContainerRef.current || !fullAddress) {
      setShowFullAddress(false)
      return
    }
    
    const checkWidth = () => {
      const container = addressContainerRef.current
      const addressTextEl = addressTextRef.current
      if (!container || !addressTextEl) return
      
      // 获取容器的计算样式，确保测量元素使用相同的样式
      const containerStyle = window.getComputedStyle(container)
      const addressStyle = window.getComputedStyle(addressTextEl)
      
      // 临时创建元素来测量完整地址的宽度
      const measureEl = document.createElement('span')
      measureEl.className = addressTextEl.className
      measureEl.style.visibility = 'hidden'
      measureEl.style.position = 'absolute'
      measureEl.style.whiteSpace = 'nowrap'
      measureEl.style.fontSize = addressStyle.fontSize
      measureEl.style.fontFamily = addressStyle.fontFamily
      measureEl.style.fontWeight = addressStyle.fontWeight
      measureEl.style.letterSpacing = addressStyle.letterSpacing
      measureEl.textContent = fullAddress
      document.body.appendChild(measureEl)
      
      const fullAddressWidth = measureEl.offsetWidth
      
      // 实际测量链图标和分隔线的宽度
      const chainIconEl = container.querySelector('[data-chain-icon]') as HTMLElement
      const separatorEl = container.querySelector('[data-separator]') as HTMLElement
      const addressButtonEl = container.querySelector('button') as HTMLElement
      
      let usedWidth = 0
      if (chainIconEl) {
        usedWidth += chainIconEl.offsetWidth
      }
      if (separatorEl) {
        usedWidth += separatorEl.offsetWidth
      }
      
      // 考虑 gap (gap-2 = 8px)
      const gap = 8 // gap-2 = 0.5rem = 8px
      const gaps = (chainIconEl ? 1 : 0) + (separatorEl ? 1 : 0) // 链图标和分隔线之间的 gap
      usedWidth += gaps * gap
      
      // 获取容器的实际可用宽度（减去 padding）
      const containerPadding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight)
      
      // 计算地址按钮的实际可用宽度
      // 由于按钮使用了 flex-1，它会占据剩余空间，我们直接使用按钮的实际宽度
      let availableWidth = 0
      if (addressButtonEl) {
        const buttonStyle = window.getComputedStyle(addressButtonEl)
        const buttonPadding = parseFloat(buttonStyle.paddingLeft) + parseFloat(buttonStyle.paddingRight)
        // 按钮的实际内容宽度 = 按钮宽度 - padding
        availableWidth = addressButtonEl.offsetWidth - buttonPadding
      } else {
        // 如果没有按钮元素，使用容器宽度计算
        availableWidth = container.offsetWidth - containerPadding - usedWidth - gap
      }
      
      document.body.removeChild(measureEl)
      
      // 使用更宽松的条件，只保留很小的余量（3px）避免溢出
      // 如果地址宽度小于等于可用宽度减去小余量，就显示完整地址
      setShowFullAddress(fullAddressWidth <= availableWidth - 3)
    }
    
    // 延迟执行，确保 DOM 已渲染
    const timeoutId = setTimeout(checkWidth, 0)
    
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(checkWidth, 0)
    })
    resizeObserver.observe(addressContainerRef.current)
    
    // 监听窗口大小变化
    window.addEventListener('resize', checkWidth)
    
    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', checkWidth)
    }
  }, [fullAddress, chainIcon])

  // 判断是否显示返回按钮（详情页面）
  const showBackButton =
    pathname.includes('/aave') ||
    pathname.includes('/detail') ||
    pathname.includes('/us-stocks') ||
    pathname.includes('/nasdaq-100') ||
    pathname.includes('/sp-500') ||
    pathname.includes('/rwa')

  const handleBack = () => {
    router.back()
  }

  const handleLanguageClick = () => {
    openBottomSheet({
      children: (
        <LanguageSelector
          currentLanguage={currentLanguage}
          onLanguageChange={setLanguage}
          onClose={closeBottomSheet}
        />
      ),
      showCloseButton: false,
      title: t('header.languageSelection'),
    })
  }

  const handleWalletClick = () => {
    openBottomSheet({
      children: <WalletModal />,
      showCloseButton: false,
    })
  }

  const [copied, setCopied] = useState(false)
  
  const handleAddressClick = () => {
    if (!fullAddress) return
    
    // 重置复制状态
    setCopied(false)
    
    openBottomSheet({
      children: (
        <div className="p-4">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-2">
              {t('common.fullAddress')}
            </h3>
            <div className="p-3 bg-black-3 rounded-lg border border-black-2">
              <p className="text-sm text-white font-mono break-all leading-relaxed select-all">
                {fullAddress}
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(fullAddress)
                setCopied(true)
                setTimeout(() => {
                  setCopied(false)
                  closeBottomSheet()
                }, 1500)
              } catch (error) {
                console.error('复制失败:', error)
              }
            }}
            className="w-full px-4 py-3 bg-primary text-black-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <SvgIcon
                  src="/icons/checked.svg"
                  className="w-4 h-4"
                  monochrome={false}
                />
                <span>{t('common.copied')}</span>
              </>
            ) : (
              <>
                <SvgIcon
                  src="/icons/copy.svg"
                  className="w-4 h-4"
                  monochrome={false}
                />
                <span>{t('common.copyAddress')}</span>
              </>
            )}
          </button>
        </div>
      ),
      showCloseButton: true,
      showCloseButtonInFooter: false,
      closeButtonText: t('common.close'),
      title: t('header.walletAddress'),
    })
  }
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-surface">
      <header className="flex justify-between items-center border-b-[0.79px] border-b-black w-full h-[71.27px] px-[25.53px]">
      {/* 左侧 Logo 和标题区域 */}
      <div className="flex items-center gap-[8.5px]">
        {showBackButton ? (
          /* 返回按钮 */
          <button
            onClick={handleBack}
            className="w-10 h-10 bg-white/5 rounded-[20%] flex items-center justify-center"
          >
            <SvgIcon src="/icons/header-back.svg" className="w-6 h-6" />
          </button>
        ) : (
          <Link
            href="/deposit"
            className="flex flex-col items-start gap-[2px] no-underline"
          >
            {/* Logo 和品牌名称水平排列 */}
            <div className="flex items-center gap-[8px]">
              {/* Logo 图标 */}
              <div 
                className="shrink-0 relative"
                style={{
                  width: `${appConfig.logoWidth}px`,
                  height: `${appConfig.logoHeight}px`,
                }}
              >
                <Image 
                  src={appConfig.logoIcon} 
                  alt={`${appConfig.brandName} Logo`} 
                  width={appConfig.logoWidth}
                  height={appConfig.logoHeight}
                  className="object-contain"
                />
              </div>
              {/* 主标题 */}
              <span
                className="text-main font-['SF_Pro_Display'] text-[17.02px] font-normal leading-[21.28px]"
                style={{
                  fontFamily:
                    'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {appConfig.brandName}
              </span>
            </div>
            {/* 副标题 */}
            <span
                className="text-muted font-['Inter'] text-[12.77px] font-normal leading-[15.96px] max-w-[200px] wrap-break-word"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {appConfig.brandSubtitle || t('header.subtitle')}
            </span>
          </Link>
        )}
      </div>

      {/* 右侧按钮区域 */}
      <div className="flex items-center gap-[8.5px]">
        {/* 钱包按钮 */}
        <button
          type="button"
          onClick={handleWalletClick}
          className={`relative w-[38px] h-[38px] rounded-[20%] flex items-center justify-center bg-transparent ${
            isWalletConnected && isBackendAuthenticated 
              ? 'border-2 border-primary'  // 钱包和后端都已连接：绿色
              : isWalletConnected 
              ? 'border-2 border-yellow-500'  // 只有钱包连接，后端未连接：黄色
              : 'border-2 border-black-2'  // 都未连接：灰色
          }`}
          title={
            isWalletConnected && isBackendAuthenticated
              ? t('header.fullyConnected')
              : isWalletConnected
              ? t('header.backendNotConnected')
              : t('header.notConnected')
          }
        >
          <SvgIcon
            src="/icons/home-wallet.svg"
            className={`w-[17.01px] h-[17.01px] ${
              isWalletConnected && isBackendAuthenticated
                ? 'text-primary'
                : isWalletConnected
                ? 'text-yellow-500'
                : 'text-primary'
            }`}
            monochrome={true}
          />
          {/* 钱包连接状态指示器 - 显示当前链图标 */}
          {isWalletConnected && chainIcon && (
            <div className="absolute -bottom-0.5 -right-0.5">
              <div
                className="w-[20px] h-[20px] rounded-[20%] border border-black flex items-center justify-center bg-transparent overflow-hidden"
                title={t('header.walletConnected')}
              >
                <SvgIcon
                  src={chainIcon}
                  className="w-full h-full"
                  monochrome={false}
                />
              </div>
            </div>
          )}
        </button>

        {/* 语言按钮 */}
        <button
          type="button"
          onClick={handleLanguageClick}
          className="w-[38px] h-[38px] rounded-[20%] bg-white/5 flex items-center justify-center"
        >
          <SvgIcon
            src="/icons/home-language.svg"
            className="w-[17.01px] h-[17.01px] text-primary"
            monochrome={true}
          />
        </button>
      </div>
    </header>

      {/* 地址、链信息和风险评分显示（单独一行，仅在连接钱包时显示） */}
      {isWalletConnected && account?.nativeAddress && (
        <div 
          ref={addressContainerRef}
          className="flex items-center justify-center gap-2 px-[25.53px] py-2 bg-black-3/80 backdrop-blur-sm border-b-[0.79px] border-b-black"
        >
          {/* 链图标（仅显示图标，不显示文字） */}
          {chainIcon && (
            <div className="flex items-center shrink-0" data-chain-icon>
              <div className="w-4 h-4 flex items-center justify-center bg-transparent">
                <SvgIcon
                  src={chainIcon}
                  className="w-full h-full"
                  monochrome={false}
                />
              </div>
            </div>
          )}
          {/* 分隔线 */}
          {chainIcon && (
            <div className="w-px h-4 bg-black-2 shrink-0" data-separator />
          )}
          {/* 地址 - 响应式显示：根据容器宽度动态显示完整地址或缩略地址，可点击查看完整地址 */}
          <button
            onClick={handleAddressClick}
            className="flex items-center min-w-0 flex-1 justify-center cursor-pointer hover:opacity-80 transition-opacity active:opacity-60"
            title={t('common.showFullAddress')}
          >
            <span 
              ref={addressTextRef}
              className="text-xs text-white font-mono font-medium truncate"
            >
              {showFullAddress ? fullAddress : shortAddress}
            </span>
          </button>
          
          {/* 风险评分和费率信息 */}
          {riskFeeInfo && (
            <>
              {/* 分隔线 */}
              <div className="w-px h-4 bg-black-2 shrink-0" />
              {/* 费率 */}
              {riskFeeInfo.finalFeeRatePercent > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-black-9">{t('deposit.feeRate') || '费率'}</span>
                  <span className="text-xs text-white font-medium">
                    {riskFeeInfo.finalFeeRatePercent.toFixed(2)}%
                  </span>
                </div>
              )}
              {/* 风险评分 */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-black-9">{t('deposit.riskScore') || '风险'}</span>
                <span className={`text-xs font-medium ${
                  riskFeeInfo.riskLevel === 'low' ? 'text-green-500' :
                  riskFeeInfo.riskLevel === 'medium' ? 'text-yellow-500' :
                  riskFeeInfo.riskLevel === 'high' ? 'text-orange-500' :
                  'text-red-500'
                }`}>
                  {riskFeeInfo.riskScore}
                </span>
              </div>
              {/* 点击查看详细信息 */}
              <button
                onClick={() => {
                  openBottomSheet({
                    children: (
                      <div className="p-4">
                        {account?.nativeAddress && (
                          <AddressRankDisplayer
                            variant="compact"
                            address={account.nativeAddress}
                            chainId={account?.chainId ?? undefined}
                            riskScore={riskFeeInfo.riskScore}
                            riskLevel={riskFeeInfo.riskLevel}
                            metadata={riskFeeMetadata || undefined}
                            onRefresh={handleRefreshRiskFee}
                            loading={isFetchingRiskFee}
                          />
                        )}
                        {riskFeeInfo.finalFeeRatePercent > 0 && (
                          <div className="mt-4 p-3 bg-black-3 rounded-lg">
                            <div className="text-xs text-black-9 mb-2">{t('deposit.feeRate') || '费率'}</div>
                            <div className="text-sm text-white font-medium">
                              {riskFeeInfo.finalFeeRatePercent.toFixed(2)}%
                            </div>
                            {riskFeeInfo.baseFeeRatePercent > 0 && (
                              <div className="text-xs text-black-9 mt-2">
                                {t('deposit.baseFeeRate') || '基础费率'}: {riskFeeInfo.baseFeeRatePercent.toFixed(2)}%
                              </div>
                            )}
                            {riskFeeInfo.riskBasedFeePercent > 0 && (
                              <div className="text-xs text-black-9">
                                {t('deposit.riskBasedFee') || '风险费率'}: {riskFeeInfo.riskBasedFeePercent.toFixed(2)}%
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ),
                    showCloseButton: true,
                    showCloseButtonInFooter: false,
                    closeButtonText: t('common.close'),
                    title: t('deposit.riskFeeInfo') || '风险评分和费率信息',
                  })
                }}
                className="flex items-center justify-center w-5 h-5 text-black-9 hover:text-white transition-colors shrink-0"
                title={t('deposit.viewRiskFeeDetails') || '查看详细信息'}
              >
                <SvgIcon
                  src="/icons/arrow-right-gray-icon.svg"
                  className="w-3 h-3"
                />
              </button>
            </>
          )}
          {/* 加载中状态 */}
          {isFetchingRiskFee && !riskFeeInfo && (
            <>
              <div className="w-px h-4 bg-black-2 shrink-0" />
              <span className="text-xs text-black-9">{t('common.loading') || '加载中...'}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export const Header = observer(HeaderComponent)
