'use client'

import { useEffect } from 'react'
import { useWallet } from '@/components/providers/wallet-provider'
import { walletStore } from '../stores'

/**
 * useWalletConnection - 钱包连接管理 Hook
 */
export function useWalletConnection() {
  const wallet = useWallet()

  // 同步钱包状态到 Store（用于需要 MobX 响应式的场景）
  useEffect(() => {
    if (wallet.isConnected && wallet.account) {
      walletStore.updateConnection(wallet.account.chainId, wallet.account.nativeAddress)
    } else {
      walletStore.disconnect()
    }
  }, [wallet.isConnected, wallet.account])

  // 同步连接中状态
  useEffect(() => {
    walletStore.setConnecting(wallet.isConnecting)
  }, [wallet.isConnecting])

  // 同步错误状态
  useEffect(() => {
    walletStore.setError(wallet.error)
  }, [wallet.error])

  // 直接从 wallet context 返回状态，确保获取最新值
  // 而不是从 walletStore（可能有延迟同步问题）
  return {
    chainId: wallet.account?.chainId ?? null,
    address: wallet.account?.nativeAddress ?? null,
    isConnected: wallet.isConnected,
    isConnecting: wallet.isConnecting,
    error: wallet.error,
    // 钱包操作方法
    connectMetaMask: wallet.connectMetaMask,
    connectTronLink: wallet.connectTronLink,
    disconnectWallet: wallet.disconnectWallet,
    switchNetworkByChainId: wallet.switchNetworkByChainId,
    formatAddress: wallet.formatAddress,
  }
}

