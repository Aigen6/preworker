'use client'

import React, { ReactNode, useMemo } from 'react'
import { EnclaveProvider as SDKEnclaveProvider } from '@enclave-hq/sdk/react'
import { type EnclaveConfig, createUniversalAddress, parseUniversalAddress } from '@enclave-hq/sdk'
import { useWallet } from '@enclave-hq/wallet-sdk/react'

/**
 * Enclave SDK Provider
 * 包装 SDK 的 EnclaveProvider，自动从钱包获取签名器
 */
interface EnclaveProviderProps {
  children: ReactNode
  config?: Partial<EnclaveConfig>
  autoConnect?: boolean
}

/**
 * 内部组件：从钱包获取签名器并初始化 SDK
 */
function EnclaveProviderInner({ 
  children, 
  config: externalConfig,
  autoConnect = true 
}: EnclaveProviderProps) {
  const { account, walletManager } = useWallet()

  // 使用 useMemo 计算 SDK 配置
  const sdkConfig = useMemo<EnclaveConfig | null>(() => {
    // 等待钱包连接后再初始化 SDK
    if (!account || !walletManager) {
      return null
    }

 // 从钱包管理器获取签名器
    const signer = walletManager.getProvider()
    
    // 构建 UniversalAddress
    // 检查 account.universalAddress 是否是字符串格式 (chainId:address)
    // 如果是，使用 parseUniversalAddress 解析；否则使用 createUniversalAddress 创建
    let universalAddress
    if (account.universalAddress && typeof account.universalAddress === 'string' && account.universalAddress.includes(':')) {
      // 字符串格式：'195:TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9'
      universalAddress = parseUniversalAddress(account.universalAddress)
    } else {
      // 使用 nativeAddress 和 chainId 创建 UniversalAddress
      universalAddress = createUniversalAddress(account.nativeAddress, account.chainId)
    }

      // 构建 SDK 配置
      return {
        apiUrl: externalConfig?.apiUrl || process.env.NEXT_PUBLIC_API_URL || 'https://api.enclave-hq.com',
        wsUrl: externalConfig?.wsUrl || process.env.NEXT_PUBLIC_WS_URL || 'wss://api.enclave-hq.com/ws',
        signer: signer as unknown as EnclaveConfig['signer'], // 钱包 provider 作为签名器
        address: universalAddress,
        ...externalConfig, // 允许外部覆盖配置
      }
    } catch (error) {
      console.error('[Enclave Provider] 获取 provider 失败:', error)
      return null
    }
  }, [account, walletManager, externalConfig])

  // 如果还没有配置，返回空
  if (!sdkConfig) {
    return <>{children}</>
  }

  return (
    <SDKEnclaveProvider config={sdkConfig} autoConnect={autoConnect}>
      {children as any}
    </SDKEnclaveProvider>
  )
}

/**
 * Enclave Provider 主组件
 * 包装 SDK 的 EnclaveProvider，自动从钱包获取签名器
 */
export function EnclaveProvider({ children, config, autoConnect }: EnclaveProviderProps) {
  // 如果提供了完整的 config（包括 signer），直接使用 SDK Provider
  if (config?.signer) {
    return (
      <SDKEnclaveProvider config={config as EnclaveConfig} autoConnect={autoConnect}>
        {children as any}
      </SDKEnclaveProvider>
    )
  }

  // 否则，从钱包获取签名器
  return (
    <EnclaveProviderInner config={config} autoConnect={autoConnect}>
      {children}
    </EnclaveProviderInner>
  )
}
