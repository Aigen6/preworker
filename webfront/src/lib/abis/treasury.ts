/**
 * Treasury Contract ABI
 * Minimal ABI for Treasury deposit function
 */

export const TREASURY_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const












