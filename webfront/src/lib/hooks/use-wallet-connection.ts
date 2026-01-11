'use client'

import { useEffect } from 'react'
import { useWallet } from '@/components/providers/wallet-provider'
import { walletStore } from '../stores'

/**
 * useWalletConnection - 钱包连接管理 Hook
 */
export function useWalletConnection() {
  const wallet = useWallet()

  // 同步钱包状态到 Store
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

  return {
    chainId: walletStore.chainId,
    address: walletStore.address,
    isConnected: walletStore.isConnected,
    isConnecting: walletStore.isConnecting,
    error: walletStore.error,
    // 钱包操作方法
    connectMetaMask: wallet.connectMetaMask,
    connectTronLink: wallet.connectTronLink,
    disconnectWallet: wallet.disconnectWallet,
    switchNetworkByChainId: wallet.switchNetworkByChainId,
    formatAddress: wallet.formatAddress,
  }
}

