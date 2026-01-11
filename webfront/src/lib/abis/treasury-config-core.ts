/**
 * TreasuryConfigCore Contract ABI
 * 用于读取配置，包括 DepositVault 地址
 */

export const TREASURY_CONFIG_CORE_ABI = [
  {
    type: 'function',
    name: 'getAddressConfig',
    inputs: [{ name: 'key', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'CHAIN_ID',
    inputs: [],
    outputs: [{ name: '', type: 'uint32' }],
    stateMutability: 'view',
  },
] as const
