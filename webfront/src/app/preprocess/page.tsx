"use client"

import { useState, useEffect, useCallback } from "react"
import { observer } from "mobx-react-lite"
import SvgIcon from "@/components/ui/SvgIcon"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useBottomSheet } from "@/hooks/use-bottom-sheet"
import { useWalletConnection } from "@/lib/hooks/use-wallet-connection"
import { useWalletBalance } from "@/lib/hooks/use-wallet-balance"
import { useDepositVault, type DepositInfo } from "@/lib/hooks/use-deposit-vault"
import { useWallet as useSDKWallet } from "@enclave-hq/wallet-sdk/react"
import { ERC20_ABI } from "@/lib/abis/erc20"
import { useTranslation } from "@/lib/hooks/use-translation"
import { useToast } from "@/components/providers/toast-provider"
import { parseToWei, formatFromWei, formatAmountForDisplay, formatLargeAmountForDisplay } from "@/lib/utils/amount-calculator"
import { getUSDTDecimals, parseUSDTAmount } from "@/lib/utils/token-decimals"
import { AddressInput } from "@/components/ui/address-input"
import { validateAddressForSlip44 } from "@/lib/utils/address-validation"

function PreprocessPage() {
  const { address, isConnected, chainId } = useWalletConnection()
  const { t } = useTranslation()
  const { showError, showWarning, showSuccess } = useToast()
  const { balance: walletBalance, loading: balanceLoading } = useWalletBalance()
  const { walletManager } = useSDKWallet()
  const {
    approveToken,
    deposit,
    claim,
    recover,
    redeemDirectly,
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
  
  // 当钱包连接时，默认使用当前用户地址作为 intendedRecipient
  useEffect(() => {
    if (address && !intendedRecipient) {
      setIntendedRecipient(address)
    }
  }, [address, intendedRecipient])
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
  const [txStatus, setTxStatus] = useState<'pending' | 'confirmed' | 'failed'>('pending')
  const [txReceipt, setTxReceipt] = useState<{ blockNumber: number; gasUsed: string; status: string } | null>(null)

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
    if (!isConnected || !address || !chainId || !vaultAddress || !walletManager) {
      return
    }

    try {
      setIsLoadingAllowance(true)
      const tokenAddress = getUSDTAddress(chainId)
      if (!tokenAddress) {
        return
      }

      const account = walletManager.getPrimaryAccount()
      if (!account) {
        throw new Error('钱包未连接')
      }

      const chainType = account.chainType

      // 读取 ERC20 的 allowance 方法
      let allowance: bigint
      if (chainType === 'evm' && typeof window !== 'undefined' && window.ethereum) {
        try {
          // 优先使用 window.ethereum 直接调用（更快）
          const functionSignature = '0xdd62ed3e' // allowance(address,address)
          const ownerParam = account.nativeAddress.slice(2).padStart(64, '0')
          const spenderParam = vaultAddress.slice(2).padStart(64, '0')
          const data = functionSignature + ownerParam + spenderParam

          const result = (await (window.ethereum as { request: (args: { method: string; params: unknown[] }) => Promise<string> }).request({
            method: 'eth_call',
            params: [
              {
                to: tokenAddress,
                data: data,
              },
              'latest',
            ],
          })) as string

          if (result && result !== '0x') {
            allowance = BigInt(result)
          } else {
            throw new Error('Contract returned no data')
          }
        } catch {
          // 回退到使用 walletManager.readContract
          const allowanceResult = await walletManager.readContract(
            tokenAddress,
            ERC20_ABI as unknown as any[],
            'allowance',
            [account.nativeAddress, vaultAddress],
            chainType
          )
          allowance = BigInt(allowanceResult.toString())
        }
      } else {
        // 非 EVM 链或没有 window.ethereum，使用 walletManager
        const allowanceResult = await walletManager.readContract(
          tokenAddress,
          ERC20_ABI as unknown as any[],
          'allowance',
          [account.nativeAddress, vaultAddress],
          chainType
        )
        allowance = BigInt(allowanceResult.toString())
      }

      // 格式化授权额度
      const decimals = getUSDTDecimals(chainId)
      const formattedAmount = formatFromWei(allowance, decimals)
      setAuthorizedAmount(formatAmountForDisplay(formattedAmount))
      setIsAuthorized(allowance > 0n)
    } catch (error) {
      console.error('读取授权额度失败:', error)
      setAuthorizedAmount("0.00")
      setIsAuthorized(false)
    } finally {
      setIsLoadingAllowance(false)
    }
  }, [isConnected, address, chainId, vaultAddress, walletManager, getUSDTAddress])

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
    if (!isConnected || !address || !chainId || !vaultAddress) {
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

      // 打印前端调用参数
      console.log('====================================')
      console.log('前端调用 deposit 参数:')
      console.log('====================================')
      console.log('vaultAddress:', vaultAddress)
      console.log('tokenAddress:', tokenAddress)
      console.log('amount (wei):', amountWei)
      console.log('amount (formatted):', depositAmount)
      console.log('intendedRecipient (原始):', intendedRecipient)
      console.log('intendedRecipient (trimmed):', intendedRecipient.trim())
      console.log('chainId:', chainId)
      console.log('当前用户地址:', address)
      console.log('====================================')

      const result = await deposit({
        vaultAddress,
        tokenAddress,
        amount: amountWei,
        intendedRecipient: intendedRecipient.trim(),
      })

      showSuccess('交易已提交，等待确认...')
      setTxStatus('pending')
      setTxReceipt(null)
      processingSheet.open({ txHash: result.txHash, type: 'deposit' })
      
      // 等待交易确认（异步，不阻塞 UI）
      if (walletManager) {
        const account = walletManager.getPrimaryAccount()
        if (account) {
          walletManager.waitForTransaction(result.txHash, 1, account.chainType)
            .then((receipt) => {
              setTxReceipt(receipt)
              if (receipt.status === 'success') {
                setTxStatus('confirmed')
                showSuccess('存入成功！')
              } else {
                setTxStatus('failed')
                showError('交易失败')
              }
            })
            .catch((error) => {
              console.error('等待交易确认失败:', error)
              // 即使等待失败，也不关闭弹窗，让用户手动关闭
              setTxStatus('failed')
              showError('交易确认失败，请手动检查交易状态')
            })
        }
      }
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

      // 添加调试信息
      console.log('====================================')
      console.log('查询可领取存款:')
      console.log('====================================')
      console.log('vaultAddress:', vaultAddress)
      console.log('查询地址 (address):', address)
      console.log('chainId:', chainId)
      console.log('====================================')

      // 查询当前地址的所有可领取存款
      const depositsList = await getAllClaimableDeposits(vaultAddress, address)
      
      console.log('查询结果 - depositsList:', depositsList)
      console.log('查询结果 - depositsList.length:', depositsList.length)
      
      if (depositsList.length === 0) {
        console.warn('⚠️ 没有找到可领取的存款')
        console.warn('可能的原因:')
        console.warn('1. 当前地址没有作为 intendedRecipient 的存款')
        console.warn('2. 所有存款已被领取或取回')
        console.warn('3. 存款时 intendedRecipient 设置的不是当前地址')
        showWarning('没有找到可领取的存款（可能已全部领取或取回，或 intendedRecipient 不是当前地址）')
        setIsLoadingClaimable(false)
        return
      }

      // 查询每个存款的详细信息和底层资产数量
      const deposits: Array<{ depositor: string; depositId: string; info: DepositInfo; underlyingAmount: bigint }> = []
      for (const item of depositsList) {
        try {
          console.log(`\n处理存款 ID: ${item.depositId}`)
          const info = await getDeposit(vaultAddress, item.depositId)
          console.log(`存款 ${item.depositId} 详细信息:`, info)
          
          if (!info) {
            console.warn(`存款 ${item.depositId} 不存在`)
            continue
          }
          
          // 检查各项条件
          console.log(`存款 ${item.depositId} 状态检查:`)
          console.log(`  - info 存在: ${!!info}`)
          console.log(`  - used: ${info.used}`)
          console.log(`  - intendedRecipient: ${info.intendedRecipient}`)
          console.log(`  - 当前地址: ${address}`)
          console.log(`  - intendedRecipient (lowercase): ${info.intendedRecipient.toLowerCase()}`)
          console.log(`  - 当前地址 (lowercase): ${address.toLowerCase()}`)
          console.log(`  - 地址匹配: ${info.intendedRecipient.toLowerCase() === address.toLowerCase()}`)
          console.log(`  - yieldAmount: ${info.yieldAmount}`)
          
          // 只添加未使用的存款
          if (info && !info.used && info.intendedRecipient.toLowerCase() === address.toLowerCase()) {
            console.log(`✅ 存款 ${item.depositId} 通过检查，查询底层资产数量...`)
            // 查询底层资产数量（USDT）
            const underlyingAmount = await getUnderlyingAmount(vaultAddress, item.depositId)
            console.log(`存款 ${item.depositId} 底层资产数量:`, underlyingAmount.toString())
            deposits.push({
              depositor: info.depositor,
              depositId: item.depositId,
              info,
              underlyingAmount,
            })
            console.log(`✅ 存款 ${item.depositId} 已添加到列表`)
          } else {
            console.warn(`❌ 存款 ${item.depositId} 不符合条件，跳过`)
            if (!info) {
              console.warn(`  - 原因: info 不存在`)
            } else if (info.used) {
              console.warn(`  - 原因: 已使用`)
            } else if (info.intendedRecipient.toLowerCase() !== address.toLowerCase()) {
              console.warn(`  - 原因: intendedRecipient 不匹配`)
              console.warn(`    intendedRecipient: "${info.intendedRecipient.toLowerCase()}"`)
              console.warn(`    当前地址: "${address.toLowerCase()}"`)
            }
          }
        } catch (error) {
          console.error(`❌ 查询存款 ${item.depositId} 信息失败:`, error)
          if (error instanceof Error) {
            console.error(`  错误消息: ${error.message}`)
            console.error(`  错误堆栈: ${error.stack}`)
          }
        }
      }
      
      console.log(`\n最终可领取的存款数量: ${deposits.length}`)
      console.log(`最终存款列表:`, deposits)

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
          const info = await getDeposit(vaultAddress, depositId)
          if (!info) continue

          // 检查条件：未使用、且超过 recoveryDelay
          const depositTime = BigInt(info.depositTime)
          const canRecover = !info.used && 
                            (now >= depositTime + delay)

          if (canRecover) {
            // 查询底层资产数量（USDT）
            const underlyingAmount = await getUnderlyingAmount(vaultAddress, depositId)
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

  // 当 vaultAddress 加载完成后，自动读取授权额度
  useEffect(() => {
    if (vaultAddress && isConnected && address && chainId) {
      fetchAllowance()
    }
  }, [vaultAddress, isConnected, address, chainId, fetchAllowance])

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
      <div className="mb-2">
        <h1 className="text-main">预处理（USDT）</h1>
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
                className="w-full p-4 bg-black-2 border-2 border-primary rounded-[12px] text-white text-lg focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
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
                <span className="text-sm text-white" title={isLoadingAllowance ? "加载中..." : authorizedAmount}>
                  {isLoadingAllowance 
                    ? "加载中..." 
                    : formatLargeAmountForDisplay(authorizedAmount, 15, 2)
                  } USDT
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
            
            {/* 表头 - 桌面端显示，移动端隐藏 */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 bg-black-3 rounded-[8px] mb-2 text-xs font-medium text-black-9">
              <div className="col-span-5">源地址</div>
              <div className="col-span-2">数量(USDT)</div>
              <div className="col-span-4">时间</div>
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
                      className="bg-black-3 rounded-[8px] p-3 md:p-2"
                    >
                      {/* 移动端：卡片式布局 */}
                      <div className="md:hidden space-y-3">
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="text-xs text-black-9 mb-1">数量(USDT)</div>
                            <div className="text-sm text-white font-medium">
                              {parseFloat(usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="flex-1 ml-4">
                            <div className="text-xs text-black-9 mb-1">时间</div>
                            <div className="text-xs text-black-9">
                              {depositDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} {depositDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="text-xs text-black-9 mb-1">源地址</div>
                            <div className="text-xs text-white truncate" title={item.depositor}>
                              {item.depositor.slice(0, 8)}...{item.depositor.slice(-6)}
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                if (!vaultAddress || !chainId || !walletManager) return
                                
                                const account = walletManager.getPrimaryAccount()
                                if (!account) {
                                  showError('钱包未连接')
                                  return
                                }
                                
                                // 第一步：领取 yield token
                                showSuccess('正在领取凭证代币...')
                                const claimResult = await claim({
                                  vaultAddress,
                                  depositId: item.depositId,
                                })
                                
                                // 等待 claim 交易确认
                                if (claimResult?.txHash) {
                                  showSuccess('等待领取交易确认...')
                                  await walletManager.waitForTransaction(claimResult.txHash, 1, account.chainType)
                                }
                                
                                // 第二步：直接调用借贷协议赎回 USDT
                                showSuccess('正在赎回 USDT...')
                                const redeemResult = await redeemDirectly({
                                  vaultAddress,
                                  depositId: item.depositId,
                                  depositInfo: item.info,
                                  chainId,
                                })
                                
                                // 等待 redeem 交易确认
                                if (redeemResult?.txHash) {
                                  showSuccess('等待赎回交易确认...')
                                  processingSheet.open({ txHash: redeemResult.txHash, type: 'claim' })
                                  setTxStatus('pending')
                                  setTxReceipt(null)
                                  
                                  const receipt = await walletManager.waitForTransaction(redeemResult.txHash, 1, account.chainType)
                                  if (receipt.status === 'success') {
                                    setTxStatus('confirmed')
                                    setTxReceipt({
                                      blockNumber: receipt.blockNumber,
                                      gasUsed: receipt.gasUsed,
                                      status: receipt.status,
                                    })
                                    showSuccess('领取并赎回成功')
                                    setClaimableDeposits(prev => prev.filter(p => p.depositId !== item.depositId))
                                  } else {
                                    setTxStatus('failed')
                                    showError('赎回交易失败')
                                  }
                                }
                              } catch (error) {
                                showError(error instanceof Error ? error.message : '操作失败')
                              }
                            }}
                            disabled={vaultLoading}
                            className="ml-4 px-4 py-2 text-sm font-medium text-black bg-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed rounded-[8px] whitespace-nowrap"
                          >
                            {vaultLoading ? "处理中..." : "领取"}
                          </button>
                        </div>
                      </div>
                      
                      {/* 桌面端：表格布局 */}
                      <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5 text-xs text-white truncate" title={item.depositor}>
                          {item.depositor.slice(0, 6)}...{item.depositor.slice(-4)}
                        </div>
                        <div className="col-span-2 text-xs text-white font-medium">
                          {parseFloat(usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-4 text-xs text-black-9">
                          {depositDate.toLocaleDateString()} {depositDate.toLocaleTimeString().slice(0, 5)}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            onClick={async () => {
                              try {
                                if (!vaultAddress || !chainId || !walletManager) return
                                
                                const account = walletManager.getPrimaryAccount()
                                if (!account) {
                                  showError('钱包未连接')
                                  return
                                }
                                
                                // 第一步：领取 yield token
                                showSuccess('正在领取凭证代币...')
                                const claimResult = await claim({
                                  vaultAddress,
                                  depositId: item.depositId,
                                })
                                
                                // 等待 claim 交易确认
                                if (claimResult?.txHash) {
                                  showSuccess('等待领取交易确认...')
                                  await walletManager.waitForTransaction(claimResult.txHash, 1, account.chainType)
                                }
                                
                                // 第二步：直接调用借贷协议赎回 USDT
                                showSuccess('正在赎回 USDT...')
                                const redeemResult = await redeemDirectly({
                                  vaultAddress,
                                  depositId: item.depositId,
                                  depositInfo: item.info,
                                  chainId,
                                })
                                
                                // 等待 redeem 交易确认
                                if (redeemResult?.txHash) {
                                  showSuccess('等待赎回交易确认...')
                                  processingSheet.open({ txHash: redeemResult.txHash, type: 'claim' })
                                  setTxStatus('pending')
                                  setTxReceipt(null)
                                  
                                  const receipt = await walletManager.waitForTransaction(redeemResult.txHash, 1, account.chainType)
                                  if (receipt.status === 'success') {
                                    setTxStatus('confirmed')
                                    setTxReceipt({
                                      blockNumber: receipt.blockNumber,
                                      gasUsed: receipt.gasUsed,
                                      status: receipt.status,
                                    })
                                    showSuccess('领取并赎回成功')
                                    setClaimableDeposits(prev => prev.filter(p => p.depositId !== item.depositId))
                                  } else {
                                    setTxStatus('failed')
                                    showError('赎回交易失败')
                                  }
                                }
                              } catch (error) {
                                showError(error instanceof Error ? error.message : '操作失败')
                              }
                            }}
                            disabled={vaultLoading}
                            className="px-3 py-1 text-xs font-medium text-black bg-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed rounded-[6px]"
                          >
                            {vaultLoading ? "处理中..." : "领取"}
                          </button>
                        </div>
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
            
            {/* 表头 - 桌面端显示，移动端隐藏 */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 bg-black-3 rounded-[8px] mb-2 text-xs font-medium text-black-9">
              <div className="col-span-5">源地址</div>
              <div className="col-span-2">数量(USDT)</div>
              <div className="col-span-4">时间</div>
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
                      className="bg-black-3 rounded-[8px] p-3 md:p-2"
                    >
                      {/* 移动端：卡片式布局 */}
                      <div className="md:hidden space-y-3">
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="text-xs text-black-9 mb-1">数量(USDT)</div>
                            <div className="text-sm text-white font-medium">
                              {parseFloat(usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="flex-1 ml-4">
                            <div className="text-xs text-black-9 mb-1">时间</div>
                            <div className="text-xs text-black-9">
                              {depositDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} {depositDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} ({daysSinceDeposit}天前)
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="text-xs text-black-9 mb-1">源地址</div>
                            <div className="text-xs text-white truncate" title={address || ''}>
                              {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : '-'}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRecoverSingle(item.depositId)}
                            disabled={vaultLoading}
                            className="ml-4 px-4 py-2 text-sm font-medium text-black bg-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed rounded-[8px] whitespace-nowrap"
                          >
                            {vaultLoading ? "退回中..." : "退回"}
                          </button>
                        </div>
                      </div>
                      
                      {/* 桌面端：表格布局 */}
                      <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5 text-xs text-white truncate" title={address || ''}>
                          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '-'}
                        </div>
                        <div className="col-span-2 text-xs text-white font-medium">
                          {parseFloat(usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-4 text-xs text-black-9">
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
        onClose={() => {
          setTxStatus('pending')
          setTxReceipt(null)
          processingSheet.close()
        }}
        height="auto"
        showCloseButton={false}
        className="bg-black-2"
      >
        <div className="p-4">
          {txStatus === 'pending' && (
            <>
              <h2 className="text-xl font-medium text-main mb-4 text-center">处理中</h2>
              <p className="text-black-9 text-center mb-4">
                交易已提交，请等待确认...
              </p>
            </>
          )}
          {txStatus === 'confirmed' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-medium text-main mb-4 text-center">交易已确认</h2>
              <p className="text-black-9 text-center mb-4">
                您的交易已完成
              </p>
              {txReceipt && (
                <p className="text-sm text-black-9 text-center mb-4">
                  区块号: {txReceipt.blockNumber}
                </p>
              )}
            </>
          )}
          {txStatus === 'failed' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-medium text-red-500 mb-4 text-center">交易失败</h2>
              <p className="text-black-9 text-center mb-4">
                交易执行失败，请重试
              </p>
            </>
          )}
          {processingSheet.data?.txHash && (
            <div className="p-4 bg-black-3 rounded-[12px] mb-4">
              <p className="text-sm text-black-9 mb-2">交易哈希:</p>
              <p className="text-sm text-white break-all">{processingSheet.data.txHash}</p>
              {txReceipt && (
                <div className="mt-2 pt-2 border-t border-black-4">
                  <p className="text-xs text-black-9">Gas 使用: {txReceipt.gasUsed}</p>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => {
              setTxStatus('pending')
              setTxReceipt(null)
              processingSheet.close()
            }}
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
