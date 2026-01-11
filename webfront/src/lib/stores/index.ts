/**
 * Stores 统一导出
 */

import { TokenRoutingStore } from './token-routing-store'
import { WalletStore } from './wallet-store'
import { selectedVouchersStore } from './selected-vouchers-store'
import { extractFormStore } from './extract-form-store'

// 创建全局 Store 实例
export const tokenRoutingStore = new TokenRoutingStore(null)
export const walletStore = new WalletStore()

// 导出类型
export type { AllowedTarget, TokenRoutingResult } from './token-routing-store'
export type { SelectedVoucher } from './selected-vouchers-store'

// 导出 Store 实例
export { selectedVouchersStore, extractFormStore }

