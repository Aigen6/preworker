// DepositVault Contract ABI (only events we need)
export const DepositVaultABI = [
  'event Deposited(address indexed depositor, uint256 indexed depositId, address indexed token, uint256 amount, address yieldToken, uint256 yieldAmount, address intendedRecipient)',
  'event Claimed(address indexed depositor, uint256 indexed depositId, address indexed recipient, address yieldToken, uint256 amount)',
  'event Recovered(address indexed depositor, uint256 indexed depositId, address yieldToken, uint256 amount)',
] as const;
