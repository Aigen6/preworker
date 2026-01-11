'use client'

import { useState } from 'react'
import SvgIcon from './SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'

interface AddressDisplayProps {
  address: string
  className?: string
  chainId?: number // 链ID，用于格式化地址
}

export function AddressDisplay({ address, className = '', chainId }: AddressDisplayProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [showFull, setShowFull] = useState(false)

  // 根据链类型格式化地址，去掉前导零
  const formatAddressForChain = (addr: string, chainId?: number): string => {
    if (!addr) return addr

    // 如果是32字节格式（64个十六进制字符，前面可能有0），转换为标准地址格式
    // EVM链（Ethereum, BSC等）：0x + 20字节（40个十六进制字符）
    // TRON：Base58格式或0x + 20字节
    if (chainId) {
      // EVM链（60=Ethereum, 714=BSC, 966=Polygon等）
      if ([60, 714, 966, 250, 43114, 9001, 10001, 8453, 324].includes(chainId)) {
        // 去掉前导零，保留20字节（40个十六进制字符）
        let cleanAddr = addr.replace(/^0+/, '')
        // 如果地址长度超过40，取后40位（标准EVM地址）
        if (cleanAddr.length > 40) {
          cleanAddr = cleanAddr.slice(-40)
        }
        // 确保是40个字符，不足则前面补0
        cleanAddr = cleanAddr.padStart(40, '0')
        return `0x${cleanAddr}`
      }
      // TRON链（195）
      else if (chainId === 195) {
        // TRON 地址：如果用户输入的是 Base58（以 T 开头），直接返回原始值
        const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
        if ((addr.startsWith('T') || addr.startsWith('t')) && base58Regex.test(addr)) {
          return addr
        }

        // 对于十六进制格式的 TRON 地址，去掉前导零，提取后40个字符（20字节），但不添加 0x 前缀
        // 因为 TRON 地址应该是 Base58 格式，如果后端返回的是十六进制，我们保持原样显示
        let cleanAddr = addr.replace(/^0+/, '').replace(/^0x/i, '')
        if (cleanAddr.length > 40) {
          cleanAddr = cleanAddr.slice(-40)
        }
        cleanAddr = cleanAddr.padStart(40, '0')
        // TRON 链的十六进制地址不添加 0x 前缀，直接返回（或者可以显示为 "TRON 地址（十六进制）"）
        // 但为了保持一致性，我们仍然返回十六进制格式，只是不添加 0x
        return cleanAddr
      }
    }

    // 默认处理：去掉前导零
    let cleanAddr = addr.replace(/^0+/, '')
    // 如果已经是0x开头，保持原样
    if (addr.startsWith('0x') || addr.startsWith('0X')) {
      return addr
    }
    // 如果地址长度超过40，取后40位
    if (cleanAddr.length > 40) {
      cleanAddr = cleanAddr.slice(-40)
    }
    // 确保是40个字符，不足则前面补0
    cleanAddr = cleanAddr.padStart(40, '0')
    return `0x${cleanAddr}`
  }

  // 格式化地址：显示前6位和后4位
  const formatAddress = (addr: string) => {
    const formatted = formatAddressForChain(addr, chainId)
    if (!formatted || formatted.length < 10) return formatted
    return `${formatted.slice(0, 6)}...${formatted.slice(-4)}`
  }

  // 获取完整格式化地址
  const getFullAddress = () => {
    return formatAddressForChain(address, chainId)
  }

  const handleCopy = async () => {
    try {
      // 复制格式化后的地址
      const formattedAddress = getFullAddress()
      await navigator.clipboard.writeText(formattedAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center justify-between">
        {/* 短地址 */}
        <span className="text-sm text-white font-mono">
          {formatAddress(address)}
        </span>

        {/* 显示全地址图标 */}
        <button
          onClick={() => setShowFull(!showFull)}
          className="w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity"
          title={t('common.showFullAddress')}
        >
          <SvgIcon
            src="/icons/eye.svg"
            className="w-4 h-4 text-primary"
          />
        </button>
      </div>

      {/* 浮动显示全地址 - 居中显示 */}
      {showFull && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowFull(false)}
          />
          {/* 居中弹窗 */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 p-4 bg-black-3 rounded-xl border border-black-3 shadow-lg min-w-[280px] max-w-[90vw] w-auto">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs text-black-9">{t('common.fullAddress')}</span>
              <button
                onClick={() => setShowFull(false)}
                className="w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity"
              >
                <SvgIcon
                  src="/icons/common-close.svg"
                  className="w-4 h-4 text-black-9"
                />
              </button>
            </div>
            <p className="text-sm text-white font-mono break-all leading-relaxed mb-3">
              {getFullAddress()}
            </p>
            <button
              onClick={handleCopy}
              className="w-full px-3 py-2 bg-primary text-black-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {copied ? t('common.copied') : t('common.copyAddress')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

