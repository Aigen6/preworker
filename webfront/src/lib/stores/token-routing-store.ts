import { makeAutoObservable } from 'mobx'
import { EnclaveClient } from '@enclave-hq/sdk'

/**
 * Token 路由目标配置
 */
export interface AllowedTarget {
  chain_id: number
  pools: Array<{
    pool_id: number
    pool_name: string
    pool_address: string
    tokens: Array<{
      token_symbol: string
      token_id: number
      token_address: string
      token_id_in_rule: string
      token_type: 'asset_token' | 'raw_token'
    }>
  }>
}

/**
 * Token 路由查询结果
 */
export interface TokenRoutingResult {
  source_chain_id: number
  source_token_id: string
  allowed_targets: AllowedTarget[]
}

/**
 * TokenRoutingStore - Token 路由状态管理
 */
export class TokenRoutingStore {
  // 路由查询结果
  allowedTargets: AllowedTarget[] = []
  
  // 完整查询结果 (may be GetAllowedTargetsResponse or GetAllPoolsAndTokensResponse)
  routingResult: any = null
  
  // 加载状态
  loading = false
  
  // 错误状态
  error: string | null = null

  constructor(private sdk: EnclaveClient | null) {
    makeAutoObservable(this)
  }

  /**
   * 更新 SDK 实例
   */
  setSDK(sdk: EnclaveClient | null) {
    this.sdk = sdk
  }

  /**
   * 获取允许的目标链和Token
   */
  async getAllowedTargets(params?: {
    source_chain_id?: number
    source_token_key?: string
    intent?: {
      type: string
      beneficiary: {
        chainId: number
        address: string
      }
      tokenKey?: string
      tokenSymbol?: string
    }
  }): Promise<any> {
    if (!this.sdk) {
      throw new Error('SDK 未初始化')
    }

    this.loading = true
    this.error = null

    try {
      // Ensure tokenKey is provided if intent is present (SDK requires tokenKey, not tokenSymbol)
      const normalizedParams = params ? {
        ...params,
        intent: params.intent ? {
          type: params.intent.type,
          beneficiary: params.intent.beneficiary,
          tokenKey: params.intent.tokenKey || params.intent.tokenSymbol || '',
        } : undefined,
      } : undefined
      const result = await this.sdk.tokenRouting.getAllowedTargets(normalizedParams as any)
      
      // 更新状态
      // result may be GetAllowedTargetsResponse or GetAllPoolsAndTokensResponse
      // Only update if it's GetAllowedTargetsResponse
      if (result && 'allowed_targets' in result) {
        this.routingResult = result as any
        this.allowedTargets = (result as any).allowed_targets || []
      } else {
        // If it's GetAllPoolsAndTokensResponse, convert or handle differently
        this.routingResult = null
        this.allowedTargets = []
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '查询路由失败'
      this.error = errorMessage
      throw error
    } finally {
      this.loading = false
    }
  }

  /**
   * 获取所有池和代币（便捷方法）
   */
  async getAllPoolsAndTokens() {
    if (!this.sdk) {
      throw new Error('SDK 未初始化')
    }

    this.loading = true
    this.error = null

    try {
      const result = await this.sdk.tokenRouting.getAllPoolsAndTokens()
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '查询池和代币失败'
      this.error = errorMessage
      throw error
    } finally {
      this.loading = false
    }
  }

  /**
   * 获取特定源的目标（便捷方法）
   */
  async getTargetsForSource(sourceChainId: number, sourceTokenId: string) {
    if (!this.sdk) {
      throw new Error('SDK 未初始化')
    }

    this.loading = true
    this.error = null

    try {
      const result = await this.sdk.tokenRouting.getTargetsForSource(
        sourceChainId,
        sourceTokenId
      )
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '查询目标失败'
      this.error = errorMessage
      throw error
    } finally {
      this.loading = false
    }
  }

  /**
   * 清除错误
   */
  clearError() {
    this.error = null
  }

  /**
   * 重置状态
   */
  reset() {
    this.allowedTargets = []
    this.routingResult = null
    this.loading = false
    this.error = null
  }
}
