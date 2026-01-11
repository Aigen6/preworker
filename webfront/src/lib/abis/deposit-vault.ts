/**
 * DepositVault Contract ABI
 * Pull模式的凭证代币托管合约
 */

export const DEPOSIT_VAULT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'intendedRecipient', type: 'address' },
    ],
    outputs: [{ name: 'depositId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [
      { name: 'depositId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'recover',
    inputs: [{ name: 'depositId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getDeposit',
    inputs: [
      { name: 'depositId', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'depositor', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'yieldToken', type: 'address' },
          { name: 'yieldAmount', type: 'uint256' },
          { name: 'intendedRecipient', type: 'address' },
          { name: 'depositTime', type: 'uint256' },
          { name: 'used', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDepositIds',
    inputs: [{ name: 'depositor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDepositCount',
    inputs: [{ name: 'depositor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getClaimableDepositIds',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'depositor', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getClaimableDepositCount',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'depositor', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getClaimableDeposits',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [
      { name: 'depositIds', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getClaimableDepositCount',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'recoveryDelay',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUnderlyingAmount',
    inputs: [
      { name: 'depositId', type: 'uint256' },
    ],
    outputs: [{ name: 'underlyingAmount', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'depositId', type: 'uint256', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
      { name: 'yieldToken', type: 'address' },
      { name: 'yieldAmount', type: 'uint256' },
      { name: 'intendedRecipient', type: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'depositId', type: 'uint256', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'yieldToken', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Recovered',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'depositId', type: 'uint256', indexed: true },
      { name: 'yieldToken', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
] as const
