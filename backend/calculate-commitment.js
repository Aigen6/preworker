/**
 * 计算 Checkbook Commitment
 * 根据给定的 checkbook 和 checks 信息计算 commitment
 */

const { keccak256 } = require('ethers');

// 输入数据
const checkbookData = {
  id: '4e99e0c5-99ab-47a7-b130-352f106a8efa',
  chainId: 714,
  tokenKey: 'USDT',
  localDepositId: 18323600,
  ownerAddress: {
    chainId: 714,
    data: '0x000000000000000000000000f5b904876e3e614df070f9884b910661eae40688'
  }
};

const checks = [
  {
    id: '4f13a964-6106-49cc-b012-b7aa7131f43c',
    seq: 0,
    amount: '30435041032216557361' // BigInt string
  },
  {
    id: '1023089c-9105-48c5-926b-ab543189753d',
    seq: 1,
    amount: '39354092267981923175' // BigInt string
  }
];

/**
 * 将 BigInt 转换为 32 字节的 Uint8Array (U256, big-endian)
 */
function bigIntToBytes32(value) {
  const bigIntValue = BigInt(value);
  const hex = bigIntValue.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * 将地址转换为 32 字节（右对齐，左侧补零）
 */
function addressToBytes32(address) {
  // 移除 0x 前缀
  const addr = address.startsWith('0x') ? address.slice(2) : address;
  // 确保是 40 个字符（20 字节）
  const padded = addr.toLowerCase().padStart(64, '0');
  return Buffer.from(padded, 'hex');
}

/**
 * 计算单个 allocation 的哈希
 * Hash = keccak256(seq (1 byte) || amount (32 bytes))
 */
function hashAllocation(allocation) {
  const seqBuf = Buffer.from([allocation.seq]);
  const amountBuf = bigIntToBytes32(allocation.amount);
  const data = Buffer.concat([seqBuf, amountBuf]);
  return Buffer.from(keccak256(data).slice(2), 'hex');
}

/**
 * 生成 commitment
 * 格式：
 * 1. deposit_id (32 bytes)
 * 2. chain_id (4 bytes, big-endian)
 * 3. token_key_hash (32 bytes, keccak256(token_key))
 * 4. owner_address.chain_id (4 bytes, big-endian)
 * 5. owner_address.data (32 bytes)
 * 6. 每个 allocation 的哈希（按 seq 排序后）
 */
function generateCommitment(allocations, ownerAddress, depositId, chainId, tokenKey) {
  // 1. deposit_id (32 bytes) - 从 localDepositId 转换
  const depositIdBigInt = BigInt(depositId);
  const depositIdHex = depositIdBigInt.toString(16).padStart(64, '0');
  const depositIdBuf = Buffer.from(depositIdHex, 'hex');

  // 2. chain_id (4 bytes, big-endian)
  const chainIdBuf = Buffer.allocUnsafe(4);
  chainIdBuf.writeUInt32BE(chainId, 0);

  // 3. token_key_hash (32 bytes, keccak256(token_key))
  const tokenKeyHash = keccak256(Buffer.from(tokenKey, 'utf-8'));
  const tokenKeyHashBuf = Buffer.from(tokenKeyHash.slice(2), 'hex');

  // 4. owner_address.chain_id (4 bytes, big-endian)
  const ownerChainIdBuf = Buffer.allocUnsafe(4);
  ownerChainIdBuf.writeUInt32BE(ownerAddress.chainId, 0);

  // 5. owner_address.data (32 bytes)
  const ownerDataBuf = addressToBytes32(ownerAddress.data);

  // 6. 对 allocations 按 seq 排序并计算哈希
  const sortedAllocations = [...allocations].sort((a, b) => a.seq - b.seq);
  const allocationHashes = sortedAllocations.map(allocation => hashAllocation(allocation));

  // 构建最终的数据
  const data = Buffer.concat([
    depositIdBuf,        // 32 bytes
    chainIdBuf,          // 4 bytes
    tokenKeyHashBuf,     // 32 bytes
    ownerChainIdBuf,     // 4 bytes
    ownerDataBuf,        // 32 bytes
    ...allocationHashes  // 每个 32 bytes
  ]);

  // 计算最终的 commitment hash
  const commitmentHash = keccak256(data);
  return commitmentHash;
}

// 执行计算
console.log('='.repeat(80));
console.log('Checkbook Commitment 计算');
console.log('='.repeat(80));
console.log();

console.log('输入数据:');
console.log(`  Checkbook ID: ${checkbookData.id}`);
console.log(`  Chain ID: ${checkbookData.chainId}`);
console.log(`  Token Key: ${checkbookData.tokenKey}`);
console.log(`  Local Deposit ID: ${checkbookData.localDepositId}`);
console.log(`  Owner Address: ${checkbookData.ownerAddress.data} (Chain ID: ${checkbookData.ownerAddress.chainId})`);
console.log();

console.log('Checks:');
checks.forEach((check, index) => {
  const amountWei = BigInt(check.amount);
  // 使用 BigInt 进行精确计算
  const divisor = BigInt(1e18);
  const wholePart = amountWei / divisor;
  const fractionalPart = amountWei % divisor;
  const fractionalStr = fractionalPart.toString().padStart(18, '0');
  const amountUsdt = `${wholePart.toString()}.${fractionalStr.slice(0, 2)}`;
  console.log(`  Check ${index + 1}:`);
  console.log(`    ID: ${check.id}`);
  console.log(`    Seq: ${check.seq}`);
  console.log(`    Amount: ${check.amount} (约 ${amountUsdt} USDT)`);
});
console.log();

// 计算 commitment
const commitment = generateCommitment(
  checks,
  checkbookData.ownerAddress,
  checkbookData.localDepositId,
  checkbookData.chainId,
  checkbookData.tokenKey
);

console.log('计算结果:');
console.log(`  计算得到的 Commitment: ${commitment}`);
console.log(`  数据库中的 Commitment: 0x58e4888d6af12e0acbb5765d31e1c431febf16c164ace5eb35437e08448e7618`);
console.log();

if (commitment.toLowerCase() === '0x58e4888d6af12e0acbb5765d31e1c431febf16c164ace5eb35437e08448e7618'.toLowerCase()) {
  console.log('✅ 匹配成功！计算得到的 commitment 与数据库中的一致。');
} else {
  console.log('❌ 不匹配！计算得到的 commitment 与数据库中的不一致。');
  console.log();
  console.log('可能的原因:');
  console.log('  1. Checks 的金额或序号不正确');
  console.log('  2. Token key 不正确');
  console.log('  3. Local deposit ID 不正确');
  console.log('  4. Owner address 不正确');
  console.log('  5. Chain ID 不正确');
}
console.log('='.repeat(80));

