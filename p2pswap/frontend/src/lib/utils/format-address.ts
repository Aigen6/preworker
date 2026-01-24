/**
 * 格式化地址显示：显示前6位和后4位
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) {
    return address || '';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
