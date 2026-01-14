#!/usr/bin/env node

/**
 * 查询指定地址的存款记录
 * 用法: node script/queryDeposits.cjs <address> [chain]
 * 示例: node script/queryDeposits.cjs 0xdf9a6C1607fE256053ed0DAa62A3d25D0C7F3A2c bsc
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// 从部署结果读取合约地址
function getVaultAddress(chain = 'bsc') {
  const resultPath = path.join(__dirname, '../deployed', `result_${chain}.json`);
  if (!fs.existsSync(resultPath)) {
    throw new Error(`部署结果文件不存在: ${resultPath}`);
  }
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  return result.contracts.DepositVault.address;
}

// RPC 端点
const RPC_ENDPOINTS = {
  bsc: 'https://bsc-dataseed1.binance.org/',
  eth: 'https://eth.llamarpc.com',
  polygon: 'https://polygon-rpc.com',
};

// DepositVault ABI (简化版，只包含需要的函数)
const DEPOSIT_VAULT_ABI = [
  'function getDepositIds(address depositor) external view returns (uint256[])',
  'function getDeposit(uint256 depositId) external view returns (tuple(address depositor, address token, address yieldToken, uint256 yieldAmount, address intendedRecipient, uint256 depositTime, bool used))',
  'function getClaimableDeposits(address recipient) external view returns (uint256[])',
  'function depositCount() external view returns (uint256)',
];

async function queryDeposits(address, chain = 'bsc', queryType = 'claimable') {
  console.log('====================================');
  console.log('查询存款记录');
  console.log('====================================');
  console.log('查询地址:', address);
  console.log('链:', chain.toUpperCase());
  console.log('查询类型:', queryType === 'claimable' ? '可领取 (claimable)' : '存款人 (depositor)');
  
  // 获取合约地址
  const vaultAddress = getVaultAddress(chain);
  console.log('DepositVault 地址:', vaultAddress);
  
  // 连接 RPC
  const rpcUrl = RPC_ENDPOINTS[chain.toLowerCase()];
  if (!rpcUrl) {
    throw new Error(`不支持的链: ${chain}`);
  }
  console.log('RPC 端点:', rpcUrl);
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const vault = new ethers.Contract(vaultAddress, DEPOSIT_VAULT_ABI, provider);
  
  let depositIds;
  if (queryType === 'claimable') {
    // 查询可领取的存款ID列表（作为 recipient）
    console.log('\n查询可领取的存款ID列表 (getClaimableDeposits)...');
    depositIds = await vault.getClaimableDeposits(address);
    console.log(`找到 ${depositIds.length} 个可领取的存款ID:`, depositIds.map(id => id.toString()));
  } else {
    // 查询存款ID列表（只包含未使用的，作为 depositor）
    console.log('\n查询未使用的存款ID列表 (getDepositIds)...');
    depositIds = await vault.getDepositIds(address);
    console.log(`找到 ${depositIds.length} 个未使用的存款ID:`, depositIds.map(id => id.toString()));
  }
  
  // 查询每个存款的详细信息
  const deposits = [];
  for (const depositId of depositIds) {
    try {
      const depositInfo = await vault.getDeposit(depositId);
      deposits.push({
        depositId: depositId.toString(),
        depositor: depositInfo.depositor,
        token: depositInfo.token,
        yieldToken: depositInfo.yieldToken,
        yieldAmount: depositInfo.yieldAmount.toString(),
        intendedRecipient: depositInfo.intendedRecipient,
        depositTime: new Date(Number(depositInfo.depositTime) * 1000).toISOString(),
        used: depositInfo.used,
      });
    } catch (error) {
      console.error(`查询存款 ${depositId.toString()} 失败:`, error.message);
    }
  }
  
  // 显示结果
  console.log('\n====================================');
  console.log('存款记录详情');
  console.log('====================================');
  if (deposits.length === 0) {
    if (queryType === 'claimable') {
      console.log('没有找到可领取的存款记录');
      console.log('\n可能的原因:');
      console.log('1. 当前地址没有作为 intendedRecipient 的存款');
      console.log('2. 所有存款已被领取或取回');
      console.log('3. 存款时 intendedRecipient 设置的不是当前地址');
    } else {
      console.log('没有找到未使用的存款记录');
      console.log('\n注意: 此查询只返回未使用的存款（活跃列表）');
      console.log('已领取或取回的存款不会出现在此列表中');
    }
  } else {
    deposits.forEach((deposit, index) => {
      console.log(`\n存款 #${index + 1}:`);
      console.log(`  ID: ${deposit.depositId}`);
      console.log(`  存款人: ${deposit.depositor}`);
      console.log(`  底层代币: ${deposit.token}`);
      console.log(`  Yield Token: ${deposit.yieldToken}`);
      console.log(`  Yield 数量: ${ethers.formatUnits(deposit.yieldAmount, 18)}`);
      console.log(`  预期接收人: ${deposit.intendedRecipient}`);
      console.log(`  存款时间: ${deposit.depositTime}`);
      console.log(`  状态: ${deposit.used ? '已使用' : '未使用'}`);
    });
  }
  
  // 查询总存款数（用于参考）
  try {
    const totalDeposits = await vault.depositCount();
    console.log('\n====================================');
    console.log(`合约总存款数: ${totalDeposits.toString()}`);
    console.log(`该地址未使用存款数: ${deposits.length}`);
    console.log('====================================');
  } catch (error) {
    console.warn('无法查询总存款数:', error.message);
  }
  
  return deposits;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node script/queryDeposits.cjs <address> [chain] [type]');
    console.error('示例: node script/queryDeposits.cjs 0xdf9a6C1607fE256053ed0DAa62A3d25D0C7F3A2c bsc claimable');
    console.error('示例: node script/queryDeposits.cjs 0xdf9a6C1607fE256053ed0DAa62A3d25D0C7F3A2c bsc depositor');
    console.error('\n类型:');
    console.error('  claimable  - 查询可领取的存款（作为 recipient，使用 getClaimableDeposits）');
    console.error('  depositor  - 查询存款记录（作为 depositor，使用 getDepositIds）');
    process.exit(1);
  }
  
  const address = args[0];
  const chain = args[1] || 'bsc';
  const queryType = args[2] || 'claimable'; // 默认查询可领取的
  
  try {
    await queryDeposits(address, chain, queryType);
  } catch (error) {
    console.error('查询失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { queryDeposits };
