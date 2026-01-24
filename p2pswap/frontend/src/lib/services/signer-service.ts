/**
 * Signer Service - 直接使用私钥签名，无需用户交互
 * 
 * 这个服务用于自动化场景，直接使用私钥签名交易
 * 支持 EVM 链（通过 ethers.js）和 TRON 链（通过 TronWeb）
 */

import { ethers } from 'ethers'
import { useWallet as useSDKWallet } from '@enclave-hq/wallet-sdk/react'
import { EVMPrivateKeyAdapter } from '@enclave-hq/wallet-sdk'

export interface SignerConfig {
  privateKey: string
  chainId: number
  rpcUrl?: string
}

export class SignerService {
  private privateKey: string | null = null
  private chainId: number | null = null
  private evmSigner: ethers.Wallet | null = null
  private evmProvider: ethers.JsonRpcProvider | null = null
  private walletManager: any = null
  private adapter: EVMPrivateKeyAdapter | null = null

  /**
   * 初始化 Signer（使用私钥）
   */
  async initialize(config: SignerConfig): Promise<void> {
    this.privateKey = config.privateKey
    this.chainId = config.chainId

    // 检查是否为 EVM 链
    const isEVM = [1, 60, 56, 714].includes(config.chainId)

    if (isEVM) {
      // 使用 ethers.js 创建 Signer
      const rpcUrl = config.rpcUrl || this.getDefaultRpcUrl(config.chainId)
      this.evmProvider = new ethers.JsonRpcProvider(rpcUrl)
      this.evmSigner = new ethers.Wallet(config.privateKey, this.evmProvider)
    } else {
      // 对于 TRON 或其他链，使用钱包 SDK 的适配器
      this.adapter = new EVMPrivateKeyAdapter()
      this.adapter.setPrivateKey(config.privateKey)
    }
  }

  /**
   * 获取默认 RPC URL
   */
  private getDefaultRpcUrl(chainId: number): string {
    const rpcUrls: Record<number, string> = {
      1: 'https://eth.llamarpc.com',
      60: 'https://eth.llamarpc.com',
      56: 'https://bsc-dataseed1.binance.org',
      714: 'https://bsc-dataseed1.binance.org',
    }
    return rpcUrls[chainId] || 'https://eth.llamarpc.com'
  }

  /**
   * 获取当前连接的地址
   */
  getAddress(): string {
    if (this.evmSigner) {
      return this.evmSigner.address
    }
    throw new Error('Signer 未初始化')
  }

  /**
   * 签名并发送交易（EVM 链）
   */
  async signAndSendTransaction(tx: {
    to: string
    data: string
    value?: bigint
    gasLimit?: bigint
    gasPrice?: bigint
  }): Promise<string> {
    if (!this.evmSigner) {
      throw new Error('EVM Signer 未初始化')
    }

    try {
      // 估算 gas
      const gasLimit = tx.gasLimit || await this.evmProvider!.estimateGas({
        to: tx.to,
        data: tx.data,
        value: tx.value,
      })

      // 获取 gas price
      const feeData = await this.evmProvider!.getFeeData()
      const gasPrice = tx.gasPrice || feeData.gasPrice || BigInt(0)

      // 构建交易
      const transaction = {
        to: tx.to,
        data: tx.data,
        value: tx.value || BigInt(0),
        gasLimit,
        gasPrice,
      }

      // 签名并发送
      const txResponse = await this.evmSigner.sendTransaction(transaction)
      return txResponse.hash
    } catch (error) {
      console.error('签名交易失败:', error)
      throw error
    }
  }

  /**
   * 调用合约方法（使用钱包 SDK 适配器）
   */
  async callContract(
    contractAddress: string,
    abi: any[],
    method: string,
    params: any[],
    options?: { value?: bigint; gas?: bigint }
  ): Promise<string> {
    // 如果使用钱包 SDK 适配器
    if (this.adapter) {
      const account = await this.adapter.connect(this.chainId!)
      const txHash = await this.adapter.writeContract(
        contractAddress,
        abi,
        method,
        params,
        options || {},
        'evm'
      )
      return txHash
    }

    // 如果使用 ethers.js Signer
    if (this.evmSigner) {
      const contract = new ethers.Contract(contractAddress, abi, this.evmSigner)
      const tx = await contract[method](...params, {
        value: options?.value,
        gasLimit: options?.gas,
      })
      return tx.hash
    }

    throw new Error('Signer 未初始化')
  }

  /**
   * 读取合约数据
   */
  async readContract(
    contractAddress: string,
    abi: any[],
    method: string,
    params: any[]
  ): Promise<any> {
    if (this.adapter) {
      const account = await this.adapter.connect(this.chainId!)
      return await this.adapter.readContract(
        contractAddress,
        abi,
        method,
        params,
        'evm'
      )
    }

    if (this.evmSigner) {
      const contract = new ethers.Contract(contractAddress, abi, this.evmSigner)
      return await contract[method](...params)
    }

    throw new Error('Signer 未初始化')
  }

  /**
   * 等待交易确认
   */
  async waitForTransaction(txHash: string, confirmations: number = 1): Promise<any> {
    if (this.evmProvider) {
      return await this.evmProvider.waitForTransaction(txHash, confirmations)
    }
    throw new Error('Provider 未初始化')
  }
}

/**
 * 创建 Signer Service 实例（单例）
 */
let signerServiceInstance: SignerService | null = null

export function getSignerService(): SignerService {
  if (!signerServiceInstance) {
    signerServiceInstance = new SignerService()
  }
  return signerServiceInstance
}

/**
 * 从环境变量初始化 Signer
 */
export async function initializeSignerFromEnv(chainId: number): Promise<SignerService | null> {
  const privateKey = process.env.NEXT_PUBLIC_PRIVATE_KEY
  if (!privateKey) {
    console.warn('未配置 NEXT_PUBLIC_PRIVATE_KEY，无法使用 Signer 模式')
    return null
  }

  const signer = getSignerService()
  await signer.initialize({
    privateKey,
    chainId,
  })

  return signer
}
