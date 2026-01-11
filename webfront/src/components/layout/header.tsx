'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
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
  const chainName = getChainName(account?.chainId)
  const displayAddress = formatAddress(account?.nativeAddress)

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
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center bg-surface border-b-[0.79px] border-b-black w-full h-[71.27px] px-[25.53px]">
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
              className="text-muted font-['Inter'] text-[12.77px] font-normal leading-[15.96px] max-w-[200px] break-words"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {appConfig.brandSubtitle || t('header.subtitle')}
            </span>
          </Link>
        )}
      </div>

      {/* 右侧按钮区域 */}
      <div className="flex items-center gap-[8.5px]">
        {/* 地址和链信息显示（仅在连接钱包时显示） */}
        {isWalletConnected && account?.nativeAddress && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black-3/80 backdrop-blur-sm rounded-[12px] border border-black-2">
            {/* 链图标和名称 */}
            {chainIcon && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <SvgIcon
                    src={chainIcon}
                    className="w-full h-full"
                    monochrome={false}
                  />
                </div>
                <span className="text-xs text-white font-medium hidden md:inline">
                  {chainName}
                </span>
              </div>
            )}
            {/* 分隔线 */}
            {chainIcon && (
              <div className="w-[1px] h-4 bg-black-2" />
            )}
            {/* 地址 */}
            <div className="flex items-center">
              <span className="text-xs text-white font-mono font-medium">
                {displayAddress}
              </span>
            </div>
          </div>
        )}

        {/* 钱包按钮 */}
        <button
          type="button"
          onClick={handleWalletClick}
          className={`relative w-[38px] h-[38px] rounded-[20%] flex items-center justify-center ${
            isBackendAuthenticated 
              ? 'bg-primary' 
              : isWalletConnected 
              ? 'bg-primary border-2 border-primary' 
              : 'bg-black-3 border-2 border-primary'
          }`}
        >
          <SvgIcon
            src="/icons/home-wallet.svg"
            className="w-[17.01px] h-[17.01px] text-primary"
            monochrome={true}
          />
          {/* 钱包连接状态指示器 - 显示当前链图标 */}
          {isWalletConnected && chainIcon && (
            <div className="absolute -bottom-0.5 -right-0.5">
              <div
                className="w-[20px] h-[20px] rounded-[20%] border border-black flex items-center justify-center bg-white overflow-hidden"
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
  )
}

export const Header = observer(HeaderComponent)
