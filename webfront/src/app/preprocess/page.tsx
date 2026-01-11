"use client"

import { useState, useEffect, useCallback } from "react"
import { observer } from "mobx-react-lite"
import { useRouter } from "next/navigation"
import SvgIcon from "@/components/ui/SvgIcon"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useBottomSheet } from "@/hooks/use-bottom-sheet"
import { useWalletConnection } from "@/lib/hooks/use-wallet-connection"
import { useWalletBalance } from "@/lib/hooks/use-wallet-balance"
import { useDepositVault, type DepositInfo } from "@/lib/hooks/use-deposit-vault"
import { useTranslation } from "@/lib/hooks/use-translation"
import { useToast } from "@/components/providers/toast-provider"
import { parseToWei, formatFromWei, formatAmountForDisplay } from "@/lib/utils/amount-calculator"
import { getUSDTDecimals, parseUSDTAmount } from "@/lib/utils/token-decimals"
import { AddressInput } from "@/components/ui/address-input"
import { validateAddressForSlip44 } from "@/lib/utils/address-validation"

function PreprocessPage() {
  const router = useRouter()
  const { address, isConnected, chainId } = useWalletConnection()
  const { t } = useTranslation()
  const { showError, showWarning, showSuccess } = useToast()
  const { balance: walletBalance, loading: balanceLoading } = useWalletBalance()
  const {
    approveToken,
    deposit,
    claim,
    recover,
    getDeposit,
    getDepositIds,
    getClaimableDepositIds,
    getAllClaimableDeposits,
    getRecoveryDelay,
    getUnderlyingAmount,
    getVaultAddress,
    loading: vaultLoading,
  } = useDepositVault()

  // DepositVault 地址（根据 chainId 动态获取）
  const [vaultAddress, setVaultAddress] = useState<string | null>(null)
  const [isLoadingVaultAddress, setIsLoadingVaultAddress] = useState(false)

  // 状态管理
  const [activeTab, setActiveTab] = useState<"deposit" | "claim" | "recover">("deposit")
  const [depositAmount, setDepositAmount] = useState("100.00")
  const [intendedRecipient, setIntendedRecipient] = useState("")
  const [isRecipientValid, setIsRecipientValid] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authorizedAmount, setAuthorizedAmount] = useState("0.00")
  const [isLoadingAllowance, setIsLoadingAllowance] = useState(false)

  // 领取相关状态
  const [claimableDeposits, setClaimableDeposits] = useState<Array<{ depositor: string; depositId: string; info: DepositInfo; underlyingAmount: bigint }>>([])
  const [isLoadingClaimable, setIsLoadingClaimable] = useState(false)

  // 取回相关状态
  const [recoverableDeposits, setRecoverableDeposits] = useState<Array<{ depositId: string; info: DepositInfo; underlyingAmount: bigint }>>([])
  const [isLoadingRecoverable, setIsLoadingRecoverable] = useState(false)
  const [recoveryDelay, setRecoveryDelay] = useState<bigint>(BigInt(7 * 24 * 60 * 60)) // 默认7天（秒）

  // 弹窗
  const processingSheet = useBottomSheet()

  // 获取 USDT 地址
  const getUSDTAddress = useCallback((chainId: number): string | null => {
    const USDT_ADDRESSES: Record<number, string> = {
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      60: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      56: '0x55d398326f99059fF775485246999027B3197955',
      714: '0x55d398326f99059fF775485246999027B3197955',
    }
    return USDT_ADDRESSES[chainId] || null
  }, [])


  // 读取授权额度
  const fetchAllowance = useCallback(async () => {
    if (!isConnected || !address || !chainId || !DEPOSIT_VAULT_ADDRESS) {
      return
    }

    try {
      setIsLoadingAllowance(true)
      const tokenAddress = getUSDTAddress(chainId)
      if (!tokenAddress) {
        return
      }

      // TODO: 实现读取授权额度的逻辑
      // 这里需要调用 ERC20 的 allowance 方法
      setAuthorizedAmount("0.00")
      setIsAuthorized(false)
    } catch (error) {
      console.error('读取授权额度失败:', error)
    } finally {
      setIsLoadingAllowance(false)
    }
  }, [isConnected, address, chainId, getUSDTAddress])

  // 授权
  const handleAuthorization = async () => {
    if (!isConnected || !address || !chainId || !vaultAddress) {
      showWarning('请先连接钱包并等待合约地址加载')
      return
    }

    try {
      setIsAuthorizing(true)
      const tokenAddress = getUSDTAddress(chainId)
      if (!tokenAddress) {
        throw new Error(`链 ${chainId} 不支持 USDT`)
      }

      const decimals = getUSDTDecimals(chainId)
      const amountBigInt = parseUSDTAmount(depositAmount, chainId)

      const result = await approveToken(tokenAddress, vaultAddress, amountBigInt)

      if (result.alreadyApproved) {
        showSuccess('Token 已授权')
        setIsAuthorized(true)
      } else {
        showSuccess('Token 授权成功')
        setIsAuthorized(true)
      }

      await fetchAllowance()
    } catch (error) {
      console.error('授权失败:', error)
      showError(error instanceof Error ? error.message : '授权失败')
    } finally {
      setIsAuthorizing(false)
    }
  }

  // 存入
  const handleDeposit = async () => {
    if (!isConnected || !address || !chainId || !DEPOSIT_VAULT_ADDRESS) {
      showWarning('请先连接钱包')
      return
    }

    if (!intendedRecipient || !intendedRecipient.trim()) {
      showWarning('请输入预期接收中转地址')
      return
    }

    if (!isRecipientValid) {
      showWarning('预期接收中转地址格式无效')
      return
    }

    if (!isAuthorized) {
      showWarning('请先授权 Token')
      return
    }

    try {
      const tokenAddress = getUSDTAddress(chainId)
      if (!tokenAddress) {
        throw new Error(`链 ${chainId} 不支持 USDT`)
      }

      const decimals = getUSDTDecimals(chainId)
      const amountWei = parseUSDTAmount(depositAmount, chainId).toString()

      if (!vaultAddress) {
        throw new Error('DepositVault 合约地址未加载')
      }

      const result = await deposit({
        vaultAddress,
        tokenAddress,
        amount: amountWei,
        intendedRecipient: intendedRecipient.trim(),
      })

      showSuccess('存入成功')
      processingSheet.open({ txHash: result.txHash, type: 'deposit' })
    } catch (error) {
      console.error('存入失败:', error)
      showError(error instanceof Error ? error.message : '存入失败')
    }
  }


  // 查询所有可领取的存款（自动使用当前地址）
  const handleQueryClaimableDeposits = useCallback(async () => {
    if (!address || !vaultAddress) {
      showWarning('请先连接钱包')
      return
    }

    try {
      setIsLoadingClaimable(true)
      setClaimableDeposits([])

      // 查询当前地址的所有可领取存款
      const depositsList = await getAllClaimableDeposits(vaultAddress, address)
      
      if (depositsList.length === 0) {
        showWarning('没有找到可领取的存款')
        setIsLoadingClaimable(false)
        return
      }

      // 查询每个存款的详细信息和底层资产数量
      const deposits: Array<{ depositor: string; depositId: string; info: DepositInfo; underlyingAmount: bigint }> = []
      for (const item of depositsList) {
        try {
          const info = await getDeposit(vaultAddress, item.depositor, item.depositId)
          // 只添加未领取且未取回的存款
          if (info && !info.claimed && !info.recovered) {
            // 查询底层资产数量（USDT）
            const underlyingAmount = await getUnderlyingAmount(vaultAddress, item.depositor, item.depositId)
            deposits.push({
              depositor: item.depositor,
              depositId: item.depositId,
              info,
              underlyingAmount,
            })
          }
        } catch (error) {
          console.error(`查询存款 ${item.depositId} 信息失败:`, error)
        }
      }

      setClaimableDeposits(deposits)
      if (deposits.length === 0) {
        showWarning('没有找到可领取的存款（可能已全部领取或取回）')
      } else {
        showSuccess(`找到 ${deposits.length} 个可领取的存款`)
      }
    } catch (error) {
      console.error('查询可领取存款失败:', error)
      showError(error instanceof Error ? error.message : '查询失败')
    } finally {
      setIsLoadingClaimable(false)
    }
  }, [address, vaultAddress, getAllClaimableDeposits, getDeposit, getUnderlyingAmount, showWarning, showSuccess, showError])

  // 查询可取回的存款列表（1周内未被领取的）
  const handleQueryRecoverableDeposits = useCallback(async () => {
    if (!address || !vaultAddress) {
      showWarning('请先连接钱包')
      return
    }

    try {
      setIsLoadingRecoverable(true)
      setRecoverableDeposits([])

      // 1. 读取 recoveryDelay
      const delay = await getRecoveryDelay(vaultAddress)
      setRecoveryDelay(delay)

      // 2. 查询我的所有存款ID
      const depositIds = await getDepositIds(vaultAddress, address)
      
      if (depositIds.length === 0) {
        showWarning('没有找到您的存款')
        setIsLoadingRecoverable(false)
        return
      }

      // 3. 查询每个存款的详细信息，过滤出可取回的
      const recoverable: Array<{ depositId: string; info: DepositInfo; underlyingAmount: bigint }> = []
      const now = BigInt(Math.floor(Date.now() / 1000)) // 当前时间戳（秒）

      for (const depositId of depositIds) {
        try {
          const info = await getDeposit(vaultAddress, address, depositId)
          if (!info) continue

          // 检查条件：未领取、未取回、且超过 recoveryDelay
          const depositTime = BigInt(info.depositTime)
          const canRecover = !info.claimed && 
                            !info.recovered && 
                            (now >= depositTime + delay)

          if (canRecover) {
            // 查询底层资产数量（USDT）
            const underlyingAmount = await getUnderlyingAmount(vaultAddress, address, depositId)
            recoverable.push({
              depositId,
              info,
              underlyingAmount,
            })
          }
        } catch (error) {
          console.error(`查询存款 ${depositId} 信息失败:`, error)
        }
      }

      setRecoverableDeposits(recoverable)
      if (recoverable.length === 0) {
        showWarning('没有找到可退回的存款（可能都已被领取或未到退回时间）')
      } else {
        showSuccess(`找到 ${recoverable.length} 个可退回的存款`)
      }
    } catch (error) {
      console.error('查询可取回存款失败:', error)
      showError(error instanceof Error ? error.message : '查询失败')
    } finally {
      setIsLoadingRecoverable(false)
    }
  }, [address, vaultAddress, getRecoveryDelay, getDepositIds, getDeposit, getUnderlyingAmount, showWarning, showSuccess, showError])

  // 取回单个存款
  const handleRecoverSingle = async (depositId: string) => {
    if (!isConnected || !address || !vaultAddress) {
      showWarning('请先连接钱包')
      return
    }

    try {
      const result = await recover({
        vaultAddress,
        depositId,
      })

      showSuccess('退回成功')
      processingSheet.open({ txHash: result.txHash, type: 'recover' })
      // 从列表中移除
      setRecoverableDeposits(prev => prev.filter(p => p.depositId !== depositId))
    } catch (error) {
      console.error('退回失败:', error)
      showError(error instanceof Error ? error.message : '退回失败')
    }
  }

  // 根据 chainId 加载 DepositVault 地址
  useEffect(() => {
    if (!isConnected || !chainId) {
      setVaultAddress(null)
      return
    }

    const loadVaultAddress = async () => {
      setIsLoadingVaultAddress(true)
      try {
        const address = await getVaultAddress(chainId)
        setVaultAddress(address)
        if (!address) {
          showWarning('未找到当前链的 DepositVault 合约地址，请检查配置')
        }
      } catch (error) {
        console.error('加载 DepositVault 地址失败:', error)
        showError('加载合约地址失败')
      } finally {
        setIsLoadingVaultAddress(false)
      }
    }

    loadVaultAddress()
  }, [isConnected, chainId, getVaultAddress, showWarning, showError])


  // 验证预期接收地址
  useEffect(() => {
    if (!intendedRecipient || !chainId) {
      setIsRecipientValid(false)
      return
    }
    setIsRecipientValid(validateAddressForSlip44(intendedRecipient, chainId))
  }, [intendedRecipient, chainId])

  const minDepositAmount = 2
  const isAmountValid = parseFloat(depositAmount) >= minDepositAmount
  const isRecipientAddressValid = intendedRecipient.trim() !== "" && isRecipientValid

  return (
    <div className="mx-auto p-5">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-main">预处理（USDT）</h1>
        <button
          onClick={() => router.push('/deposit')}
          className="text-sm text-black-9 hover:text-white"
        >
          返回存款页面
        </button>
        </div>

      {/* 标签页 */}
      <div className="flex gap-2 mb-6 border-b border-black-3">
        <button
          onClick={() => setActiveTab("deposit")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "deposit"
              ? "text-primary border-b-2 border-primary"
              : "text-black-9 hover:text-white"
          }`}
        >
          存入
        </button>
        <button
          onClick={() => setActiveTab("claim")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "claim"
              ? "text-primary border-b-2 border-primary"
              : "text-black-9 hover:text-white"
          }`}
        >
          领取
        </button>
        <button
          onClick={() => setActiveTab("recover")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "recover"
              ? "text-primary border-b-2 border-primary"
              : "text-black-9 hover:text-white"
          }`}
        >
          退回
        </button>
      </div>

      {/* 合约地址加载提示 */}
      {isLoadingVaultAddress && (
        <div className="mb-4 p-4 bg-black-3 rounded-[12px] text-center">
          <p className="text-sm text-black-9">正在加载合约地址...</p>
        </div>
      )}
      {!isLoadingVaultAddress && !vaultAddress && isConnected && chainId && (
        <div className="mb-4 p-4 bg-red-500/20 rounded-[12px] text-center">
          <p className="text-sm text-red-500">
            未找到当前链的 DepositVault 合约地址，请检查配置
          </p>
        </div>
      )}

      {/* 存入标签页 */}
      {activeTab === "deposit" && (
        <div className="bg-black-2 rounded-[12px] p-6">
          <h3 className="text-base font-medium text-main mb-4">存入（USDT）</h3>

          {/* 金额输入 */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full p-4 bg-black-2 border-2 border-primary rounded-[12px] text-white text-lg focus:outline-none"
                placeholder="100.00"
              />
            </div>
            {depositAmount && !isAmountValid && (
              <p className="text-xs text-red-500 mt-2">
                最小存入金额: {minDepositAmount} USDT
              </p>
            )}
          </div>

          {/* 预期接收地址 */}
          <div className="mb-4">
            <label className="block text-sm text-black-9 mb-2">
              预期接收中转地址 <span className="text-red-500">*</span>
            </label>
            <AddressInput
              value={intendedRecipient}
              onChange={setIntendedRecipient}
              chainId={chainId}
              showValidation={true}
            />
          </div>

          {/* 授权状态 */}
          <div className="mb-4 p-4 bg-black-3 rounded-[12px]">
            <div className="flex justify-between items-center">
              <span className="text-sm text-black-9">授权额度</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white">
                  {isLoadingAllowance ? "加载中..." : authorizedAmount} USDT
                </span>
                <button
                  onClick={fetchAllowance}
                  className="p-1 hover:opacity-70"
                  disabled={isLoadingAllowance}
                >
                  <SvgIcon
                    src="/icons/refresh.svg"
                    className={`w-4 h-4 ${isLoadingAllowance ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-4">
            {!isAuthorized ? (
              <button
                onClick={handleAuthorization}
                disabled={!isAmountValid || !isRecipientAddressValid || isAuthorizing || !vaultAddress}
                className="flex-1 h-12 rounded-[14px] font-medium text-sm text-black bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAuthorizing ? "授权中..." : "授权"}
              </button>
            ) : (
              <button
                onClick={handleDeposit}
                disabled={!isAmountValid || !isRecipientAddressValid || vaultLoading || !vaultAddress}
                className="flex-1 h-12 rounded-[14px] font-medium text-sm text-black bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {vaultLoading ? "存入中..." : "存入USDT"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 领取标签页 */}
      {activeTab === "claim" && (
        <div className="bg-black-2 rounded-[12px] p-6">
          <h3 className="text-base font-medium text-main mb-4">领取USDT</h3>

          {/* 查询按钮 */}
          <button
            onClick={handleQueryClaimableDeposits}
            disabled={!address || isLoadingClaimable || !vaultAddress}
            className="w-full mb-4 h-12 rounded-[14px] font-medium text-sm text-white bg-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingClaimable ? "查询中..." : "查询可领取存款"}
          </button>

          {/* 可领取存款列表 */}
          <div className="mb-4">
            {claimableDeposits.length > 0 && (
              <h4 className="text-sm font-medium text-white mb-2">可领取的存款列表 ({claimableDeposits.length})</h4>
            )}
            
            {/* 表头 - 永久显示 */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-black-3 rounded-[8px] mb-2 text-xs font-medium text-black-9">
              <div className="col-span-2">ID号</div>
              <div className="col-span-4">源地址</div>
              <div className="col-span-2">数量(USDT)</div>
              <div className="col-span-3">时间</div>
              <div className="col-span-1"></div>
            </div>

            {/* 列表内容 */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {claimableDeposits.length > 0 ? (
                claimableDeposits.map((item, index) => {
                  const depositTime = Number(item.info.depositTime) * 1000
                  const depositDate = new Date(depositTime)
                  // 使用底层资产数量（USDT），根据链的小数位数格式化
                  const usdtAmount = formatFromWei(item.underlyingAmount, 18)
                  
                  return (
                    <div
                      key={`${item.depositor}-${item.depositId}`}
                      className="grid grid-cols-12 gap-2 px-3 py-2 bg-black-3 rounded-[8px] items-center"
                    >
                      <div className="col-span-2 text-xs text-white">{item.depositId}</div>
                      <div className="col-span-4 text-xs text-white truncate" title={item.depositor}>
                        {item.depositor.slice(0, 6)}...{item.depositor.slice(-4)}
                      </div>
                      <div className="col-span-2 text-xs text-white font-medium">
                        {parseFloat(usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-3 text-xs text-black-9">
                        {depositDate.toLocaleDateString()} {depositDate.toLocaleTimeString().slice(0, 5)}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          onClick={async () => {
                            // 直接领取
                            try {
                              if (!vaultAddress) return
                              const result = await claim({
                                vaultAddress,
                                depositor: item.depositor,
                                depositId: item.depositId,
                              })
                              showSuccess('领取成功')
                              processingSheet.open({ txHash: result.txHash, type: 'claim' })
                              // 从列表中移除
                              setClaimableDeposits(prev => prev.filter(p => 
                                !(p.depositor.toLowerCase() === item.depositor.toLowerCase() && p.depositId === item.depositId)
                              ))
                            } catch (error) {
                              showError(error instanceof Error ? error.message : '领取失败')
                            }
                          }}
                          disabled={vaultLoading}
                          className="px-3 py-1 text-xs font-medium text-black bg-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed rounded-[6px]"
                        >
                          {vaultLoading ? "领取中..." : "领取"}
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-4 text-sm text-black-9">
                  暂无可领取的存款
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* 退回标签页 */}
      {activeTab === "recover" && (
        <div className="bg-black-2 rounded-[12px] p-6">
          <h3 className="text-base font-medium text-main mb-4">退回USDT（源地址）</h3>
          <p className="text-sm text-black-9 mb-4">
            查询1周内未被领取的USDT存款
          </p>

          {/* 查询按钮 */}
          <button
            onClick={handleQueryRecoverableDeposits}
            disabled={!address || isLoadingRecoverable || !vaultAddress}
            className="w-full mb-4 h-12 rounded-[14px] font-medium text-sm text-white bg-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingRecoverable ? "查询中..." : "查询我的可退回存款"}
          </button>

          {/* 可退回存款列表 */}
          <div className="mb-4">
            {recoverableDeposits.length > 0 && (
              <h4 className="text-sm font-medium text-white mb-2">
                可退回的存款列表 ({recoverableDeposits.length})
              </h4>
            )}
            
            {/* 表头 - 永久显示 */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-black-3 rounded-[8px] mb-2 text-xs font-medium text-black-9">
              <div className="col-span-2">ID号</div>
              <div className="col-span-4">源地址</div>
              <div className="col-span-2">数量(USDT)</div>
              <div className="col-span-3">时间</div>
              <div className="col-span-1"></div>
            </div>

            {/* 列表内容 */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recoverableDeposits.length > 0 ? (
                recoverableDeposits.map((item) => {
                  const depositTime = Number(item.info.depositTime) * 1000
                  const depositDate = new Date(depositTime)
                  const daysSinceDeposit = Math.floor((Date.now() - depositTime) / (1000 * 60 * 60 * 24))
                  // 使用底层资产数量（USDT），根据链的小数位数格式化
                  const usdtAmount = formatFromWei(item.underlyingAmount, 18)
                  
                  return (
                    <div
                      key={item.depositId}
                      className="grid grid-cols-12 gap-2 px-3 py-2 bg-black-3 rounded-[8px] items-center"
                    >
                      <div className="col-span-2 text-xs text-white">{item.depositId}</div>
                      <div className="col-span-4 text-xs text-white truncate" title={address}>
                        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '-'}
                      </div>
                      <div className="col-span-2 text-xs text-white font-medium">
                        {parseFloat(usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-3 text-xs text-black-9">
                        {depositDate.toLocaleDateString()} {depositDate.toLocaleTimeString().slice(0, 5)} ({daysSinceDeposit}天前)
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          onClick={() => handleRecoverSingle(item.depositId)}
                          disabled={vaultLoading}
                          className="px-3 py-1 text-xs font-medium text-black bg-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed rounded-[6px]"
                        >
                          {vaultLoading ? "退回中..." : "退回"}
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-4 text-sm text-black-9">
                  暂无可退回的USDT存款
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 处理中弹窗 */}
      <BottomSheet
        isOpen={processingSheet.isOpen}
        onClose={processingSheet.close}
        height="auto"
        showCloseButton={false}
        className="bg-black-2"
      >
        <div className="p-4">
          <h2 className="text-xl font-medium text-main mb-4 text-center">处理中</h2>
          <p className="text-black-9 text-center mb-4">
            交易已提交，请等待确认...
          </p>
          {processingSheet.data?.txHash && (
            <div className="p-4 bg-black-3 rounded-[12px] mb-4">
              <p className="text-sm text-black-9 mb-2">交易哈希:</p>
              <p className="text-sm text-white break-all">{processingSheet.data.txHash}</p>
            </div>
          )}
          <button
            onClick={processingSheet.close}
            className="w-full h-12 rounded-[14px] font-medium text-sm text-black bg-primary"
          >
            关闭
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

export default observer(PreprocessPage)
