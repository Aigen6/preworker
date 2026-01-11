"use client"

import { useState, useEffect } from "react"
import { useWallet } from "@/components/providers/wallet-provider"
import { useBottomSheetContext } from "@/components/providers/bottom-sheet-provider"
import { useTranslation } from "@/lib/hooks/use-translation"
import SvgIcon from "@/components/ui/SvgIcon"
import { SuccessToast } from "@/components/ui/success-toast"
import { AddressDisplay } from "@/components/ui/address-display"
import { TRON_CHAIN_ID } from "@/lib/utils/wallet-utils"

/* 钱包连接弹窗 */
export function WalletModal() {
  const { t } = useTranslation()
  const { closeBottomSheet } = useBottomSheetContext()
  const {
    isConnected,
    account,
    disconnectWallet,
    switchNetworkByChainId,
    connectMetaMask,
    connectTronLink,
    isConnecting,
    error,
  } = useWallet()

  // 从 account 派生状态
  const address = account?.nativeAddress || null
  const chainId = account?.chainId || null

  // 状态管理
  const [selectedNetwork, setSelectedNetwork] = useState<number>(1) // 默认选中以太坊
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [wasConnected, setWasConnected] = useState(false) // 记录之前的连接状态
  const [isConnectingFromModal, setIsConnectingFromModal] = useState(false) // 标记是否从弹窗内触发的连接

  // 监听连接状态变化，只有在弹窗内主动连接成功后才自动关闭弹窗
  useEffect(() => {
    if (isConnected && !wasConnected && isConnectingFromModal) {
      // 从未连接变为已连接，且是从弹窗内触发的连接，自动关闭弹窗
      setSuccessMessage(t('wallet.connectSuccess'))
      setShowSuccessToast(true)
      setIsConnectingFromModal(false) // 重置标记
      setTimeout(() => {
        closeBottomSheet()
      }, 500) // 延迟500ms关闭，让用户看到成功提示
    }
    setWasConnected(isConnected)
  }, [isConnected, wasConnected, isConnectingFromModal, closeBottomSheet])

  // 支持的网络列表
  const networks = [
    {
      id: "ethereum",
      name: "Ethereum",
      icon: "/icons/network-eth.svg",
      chainId: 1,
    },
    {
      id: "bnb",
      name: "BNB Chain",
      icon: "/icons/network-bnb.svg",
      chainId: 56,
    },
    // {
    //   id: "polygon",
    //   name: "Polygon",
    //   icon: "/icons/network-pol.svg",
    //   chainId: 137,
    // },
    { id: "tron", name: "TRON", icon: "/icons/network-tron.svg", chainId: 195 },
  ]

  const handleConnectWallet = async () => {
    try {
      setIsConnectingFromModal(true) // 标记是从弹窗内触发的连接
      
      // 如果当前已连接，且连接的链与选择的链类型不同（EVM vs TRON），先断开
      // 这样可以确保 TokenPocket 等同时支持 EVM 和 TRON 的钱包能正确连接
      if (isConnected && chainId) {
        const currentIsEVM = chainId !== TRON_CHAIN_ID
        const targetIsEVM = selectedNetwork !== TRON_CHAIN_ID
        
        if (currentIsEVM !== targetIsEVM) {
          console.log('检测到链类型不匹配，先断开当前连接')
          await disconnectWallet()
          // 等待断开完成，确保 provider 完全清理
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
      
      // 根据选中的网络选择对应的钱包连接方式
      if (selectedNetwork === TRON_CHAIN_ID) {
        // TRON 链：使用 TronWeb 兼容钱包连接（支持 TronLink、TokenPocket 等），传递 TRON chainId
        await connectTronLink(TRON_CHAIN_ID)
        console.log("🎉 TronWeb 兼容钱包连接成功!")
      } else {
        // EVM 链：使用 MetaMask 连接（对于 TokenPocket，这会通过 window.ethereum 连接）
        await connectMetaMask(selectedNetwork)
        console.log("🎉 MetaMask 连接成功!")
      }
      // 连接成功后的关闭逻辑由 useEffect 处理
    } catch (error) {
      console.error("❌ 钱包连接失败:", error)
      setIsConnectingFromModal(false) // 连接失败时重置标记
    }
  }

  const handleNetworkSelect = async (networkChainId: number) => {
    if (!isConnected) {
      // 未连接时，只更新选中的网络，不连接钱包，不隐藏弹框
      setSelectedNetwork(networkChainId)
    } else {
      // 已连接时，切换网络并显示成功提示
      try {
        await switchNetworkByChainId(networkChainId)
        setSuccessMessage(t('wallet.switchSuccess'))
        setShowSuccessToast(true)
        // 切换网络成功后自动关闭弹窗
        setTimeout(() => {
          closeBottomSheet()
        }, 500) // 延迟500ms关闭，让用户看到成功提示
      } catch (error: any) {
        console.error("切换网络失败:", error)
        // 检查是否是用户拒绝连接的错误
        if (error?.name === 'ConnectionRejectedError' || error?.message?.includes('rejected')) {
          // 用户拒绝连接，不显示错误，只记录日志
          // 因为用户可能只是想取消操作，不需要错误提示
          console.log("用户取消了网络切换")
        } else {
          // 其他错误，显示错误信息
          // 错误信息会通过 error state 显示在 UI 中
        }
        // 切换失败时不关闭弹窗，让用户看到错误信息
      }
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectWallet()
      setSuccessMessage(t('wallet.disconnectSuccess'))
      setShowSuccessToast(true)
      // 断开连接后不隐藏弹框
    } catch (error) {
      console.error("断开连接失败:", error)
    }
  }

  return (
    <div className="w-full">
      {/* 标题和地址 */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-black-9">
          <h2 className="text-sm">
            {isConnected ? t('wallet.switchNetwork') : t('wallet.selectNetworkAndConnect')}
          </h2>
          {isConnected && address && (
            <AddressDisplay
              address={address}
              chainId={chainId ?? undefined}
              className="text-sm"
            />
          )}
        </div>
      </div>

      {/* 网络选择列表 */}
      <div className="px-4 pb-6 space-y-3">
        {networks.map((network) => {
          const isSelected = isConnected
            ? chainId === network.chainId
            : selectedNetwork === network.chainId

          return (
            <button
              key={network.id}
              onClick={() => handleNetworkSelect(network.chainId)}
              className={`w-full flex items-center justify-between p-4 rounded-[20px] transition-all ${
                isSelected
                  ? "bg-black-1 border-2 border-primary"
                  : "bg-black-1 border-2 border-transparent hover:border-black-4"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-[20%] flex items-center justify-center">
                  <SvgIcon
                    src={network.icon}
                    className="w-5 h-5"
                    monochrome={false}
                  />
                </div>
                <span
                  className={`text-base font-medium ${
                    isSelected ? "text-primary" : "text-main"
                  }`}
                >
                  {network.name}
                </span>
              </div>
              {isSelected && (
                <SvgIcon
                  src="/icons/network-checked.svg"
                  className="w-4 h-4"
                  monochrome={false}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* 底部按钮 */}
      <div className="px-4 pb-6 flex justify-center">
        <button
          onClick={isConnected ? handleDisconnect : handleConnectWallet}
          disabled={isConnecting}
          className={`w-[230px] h-[50px] rounded-[14px] font-medium text-base transition-all flex items-center justify-center gap-2 ${
            isConnected
              ? "border border-primary bg-black-1 text-main hover:bg-black-3"
              : "bg-primary text-on-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-[20%] animate-spin"></div>
              {t('wallet.connecting')}
            </>
          ) : isConnected ? (
            t('wallet.disconnect')
          ) : (
            t('wallet.connectWallet')
          )}
        </button>
      </div>

      {/* 成功提示 */}
      <SuccessToast
        message={successMessage}
        isVisible={showSuccessToast}
        onHide={() => setShowSuccessToast(false)}
      />
    </div>
  )
}
