#!/usr/bin/env node

/**
 * 在 TRON 链上直接赎回 jUSDT
 * 用法: node script/redeemJUSDTTRON.cjs <private_key> [jtoken_address] [amount]
 * 示例: node script/redeemJUSDTTRON.cjs YOUR_PRIVATE_KEY
 * 示例: node script/redeemJUSDTTRON.cjs YOUR_PRIVATE_KEY TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd 1000000
 * 
 * 注意：
 * - 如果不提供 amount，将赎回全部 jUSDT
 * - amount 是 jUSDT 的数量（最小单位，6位精度）
 */

const TronWeb = require('tronweb');
const fs = require('fs');
const path = require('path');

// 从部署结果读取 jToken 地址
function getJTokenAddress() {
  const resultPath = path.join(__dirname, '../deployed', 'result_tron.json');
  if (!fs.existsSync(resultPath)) {
    return null;
  }
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  return result.configuration?.defaultJToken || result.contracts?.DepositVault?.defaultLendingTarget || null;
}

// TRON RPC 端点
const RPC_URLS = [
  'https://api.trongrid.io',
  'https://tron.api.pocket.network',
  'https://api.tronstack.io',
];
const DEFAULT_RPC_URL = RPC_URLS[0];

// jUSDT (jToken) ABI
const JTOKEN_ABI = [
  {
    "constant": false,
    "inputs": [
      {
        "name": "redeemTokens",
        "type": "uint256"
      }
    ],
    "name": "redeem",
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "exchangeRateStored",
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// USDT 地址（TRON 主网）
const USDT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// USDT ABI (只需要 balanceOf)
const USDT_ABI = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

async function redeemJUSDT(privateKey, jTokenAddress, redeemAmount = null) {
  try {
    // 初始化 TronWeb
    const tronWeb = new TronWeb({
      fullHost: DEFAULT_RPC_URL,
    });

    // 从私钥获取地址
    const address = tronWeb.address.fromPrivateKey(privateKey);
    const addressBase58 = tronWeb.address.fromHex(address);
    
    console.log('====================================');
    console.log('TRON jUSDT 赎回工具');
    console.log('====================================');
    console.log('地址:', addressBase58);
    console.log('jToken 地址:', jTokenAddress);
    console.log('');

    // 辅助函数：使用 triggerConstantContract 查询余额
    async function queryBalance(contractAddress, accountAddress) {
      try {
        // 确保地址格式正确
        let accountHex;
        if (accountAddress.startsWith('T')) {
          // Base58 地址，转换为 hex
          accountHex = tronWeb.address.toHex(accountAddress);
        } else if (accountAddress.startsWith('0x') || accountAddress.startsWith('41')) {
          // 已经是 hex 格式
          accountHex = accountAddress.startsWith('0x') ? accountAddress : '0x' + accountAddress;
        } else {
          throw new Error(`无效的地址格式: ${accountAddress}`);
        }
        
        console.log(`  [调试] 查询余额 - 合约: ${contractAddress}, 账户: ${accountAddress} (hex: ${accountHex})`);
        
        const result = await tronWeb.transactionBuilder.triggerConstantContract(
          contractAddress,
          'balanceOf(address)',
          {},
          [{ type: 'address', value: accountHex }],
          accountHex
        );
        
        console.log(`  [调试] triggerConstantContract 返回:`, JSON.stringify(result, null, 2));
        
        if (!result || !result.constant_result || result.constant_result.length === 0) {
          throw new Error('查询余额失败：无返回结果');
        }
        
        // 获取返回的 hex 字符串
        const hexString = result.constant_result[0];
        console.log(`  [调试] 原始 hex 字符串: ${hexString}, 长度: ${hexString.length}`);
        
        if (!hexString || typeof hexString !== 'string') {
          throw new Error('查询余额失败：返回数据格式错误');
        }
        
        // 确保是有效的 hex 字符串（64 字符，32 字节）
        let finalHex = hexString;
        if (hexString.length !== 64) {
          console.warn(`⚠️  返回数据长度异常: ${hexString.length} (期望 64)`);
          if (hexString.length > 64) {
            // 如果太长，取前 64 个字符
            finalHex = hexString.slice(0, 64);
            console.warn(`  截取前 64 个字符: ${finalHex}`);
          } else {
            // 如果太短，前面补 0
            finalHex = hexString.padStart(64, '0');
            console.warn(`  前面补 0: ${finalHex}`);
          }
        }
        
        const balance = BigInt('0x' + finalHex);
        console.log(`  [调试] 解析后的余额: ${balance.toString()}`);
        
        // 验证是否合理（小于 2^256）
        const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        if (balance > maxUint256) {
          throw new Error(`查询余额失败：返回数值超出 uint256 范围`);
        }
        
        return balance;
      } catch (err) {
        console.error('查询余额错误:', err.message);
        if (err.stack) {
          console.error('错误堆栈:', err.stack);
        }
        throw err;
      }
    }

    // 辅助函数：查询汇率
    async function queryExchangeRate(contractAddress) {
      try {
        const contractHex = tronWeb.address.toHex(contractAddress);
        
        const result = await tronWeb.transactionBuilder.triggerConstantContract(
          contractAddress,
          'exchangeRateStored()',
          {},
          [],
          tronWeb.address.toHex(addressBase58)
        );
        
        if (result && result.constant_result && result.constant_result.length > 0) {
          const rateHex = '0x' + result.constant_result[0];
          return BigInt(rateHex);
        }
        throw new Error('查询汇率失败：无返回结果');
      } catch (err) {
        console.warn('查询汇率错误:', err.message);
        return null;
      }
    }

    // 1. 查询 jUSDT 余额
    console.log('查询 jUSDT 余额...');
    console.log(`  查询地址: ${addressBase58}`);
    console.log(`  合约地址: ${jTokenAddress}`);
    
    let jUSDTBalance;
    try {
      // 优先使用 TronWeb 的 contract API（更可靠）
      console.log('  使用 TronWeb contract API 查询...');
      const jTokenContract = await tronWeb.contract(JTOKEN_ABI, jTokenAddress);
      const balanceResult = await jTokenContract.balanceOf(addressBase58).call();
      
      // 处理不同的返回格式
      if (typeof balanceResult === 'bigint') {
        jUSDTBalance = balanceResult;
      } else if (typeof balanceResult === 'string') {
        jUSDTBalance = BigInt(balanceResult);
      } else if (balanceResult && typeof balanceResult.toString === 'function') {
        // 可能是 BigNumber 对象
        if (balanceResult._hex) {
          jUSDTBalance = BigInt(balanceResult._hex);
        } else {
          jUSDTBalance = BigInt(balanceResult.toString());
        }
      } else {
        throw new Error('无法解析余额返回值');
      }
      
      console.log(`  [调试] 使用 contract API 查询成功: ${jUSDTBalance.toString()}`);
    } catch (err) {
      console.warn('⚠️  contract API 查询失败:', err.message);
      // 备选：使用 triggerConstantContract
      console.log('  尝试使用 triggerConstantContract 查询...');
      try {
        jUSDTBalance = await queryBalance(jTokenAddress, addressBase58);
      } catch (fallbackErr) {
        console.error('❌ 所有查询方法都失败');
        console.error('triggerConstantContract 错误:', fallbackErr.message);
        throw new Error('无法查询 jUSDT 余额，请检查地址和网络连接');
      }
    }
    
    const jUSDTBalanceStr = jUSDTBalance.toString();
    
    // 验证余额是否合理（jUSDT 通常不会超过 1e12，即 1 万亿）
    const maxReasonableBalance = BigInt('1000000000000000000000000'); // 1e24，1 万亿 * 1e6
    if (jUSDTBalance > maxReasonableBalance) {
      console.error(`❌ 余额异常大: ${jUSDTBalanceStr}`);
      console.error('  这可能表示查询失败或返回了错误数据');
      console.error('  请检查：');
      console.error('    1. 地址是否正确');
      console.error('    2. jToken 地址是否正确');
      console.error('    3. 网络连接是否正常');
      throw new Error('余额查询返回异常值，请检查地址和网络');
    }
    
    const jUSDTBalanceFormatted = (Number(jUSDTBalanceStr) / 1e6).toFixed(6);
    
    console.log(`jUSDT 余额: ${jUSDTBalanceStr} (${jUSDTBalanceFormatted} jUSDT)`);
    console.log('');

    if (jUSDTBalanceStr === '0') {
      console.log('❌ 余额为 0，无需赎回');
      return;
    }

    // 2. 查询当前 USDT 余额（赎回前）
    console.log('查询当前 USDT 余额（赎回前）...');
    const usdtBalanceBefore = await queryBalance(USDT_ADDRESS, addressBase58);
    const usdtBalanceBeforeStr = usdtBalanceBefore.toString();
    const usdtBalanceBeforeFormatted = (Number(usdtBalanceBeforeStr) / 1e6).toFixed(6);
    console.log(`USDT 余额: ${usdtBalanceBeforeStr} (${usdtBalanceBeforeFormatted} USDT)`);
    console.log('');

    // 3. 查询汇率（可选，用于估算）
    try {
      console.log('查询汇率（估算可赎回的 USDT 数量）...');
      const exchangeRate = await queryExchangeRate(jTokenAddress);
      if (exchangeRate) {
        const exchangeRateStr = exchangeRate.toString();
        // JustLend 的汇率是 1e18 精度
        const exchangeRateValue = Number(exchangeRateStr) / 1e18;
        const estimatedUSDT = (Number(jUSDTBalanceStr) * exchangeRateValue).toFixed(6);
        console.log(`汇率: ${exchangeRateValue.toFixed(8)}`);
        console.log(`预计可赎回: ~${estimatedUSDT} USDT`);
      }
      console.log('');
    } catch (err) {
      console.warn('⚠️  无法查询汇率:', err.message);
      console.log('');
    }

    // 4. 确定赎回数量
    let amountToRedeem;
    if (!redeemAmount) {
      // 如果不指定数量，赎回全部
      amountToRedeem = jUSDTBalance; // 使用 BigInt
      console.log(`将赎回全部 jUSDT: ${jUSDTBalanceStr} (${jUSDTBalanceFormatted} jUSDT)`);
    } else {
      // 验证数量
      const redeemAmountBigInt = BigInt(redeemAmount);
      if (redeemAmountBigInt > jUSDTBalance) {
        throw new Error(`赎回数量 ${redeemAmount} 超过余额 ${jUSDTBalanceStr}`);
      }
      amountToRedeem = redeemAmountBigInt;
      const amountFormatted = (Number(redeemAmount) / 1e6).toFixed(6);
      console.log(`将赎回指定数量: ${redeemAmount} (${amountFormatted} jUSDT)`);
    }
    console.log('');

    // 验证赎回数量是否合理
    if (amountToRedeem === 0n) {
      throw new Error('赎回数量不能为 0');
    }
    
    // 5. 设置私钥并执行赎回
    console.log('准备执行赎回交易...');
    console.log(`  赎回数量: ${amountToRedeem.toString()}`);
    tronWeb.setPrivateKey(privateKey);

    // 创建合约实例用于发送交易
    const jTokenContract = await tronWeb.contract(JTOKEN_ABI, jTokenAddress);
    
    // 调用 redeem 函数（传入字符串格式，TronWeb 会自动处理）
    console.log('  发送赎回交易...');
    const transaction = await jTokenContract.redeem(amountToRedeem.toString()).send();
    
    console.log('✅ 交易已发送');
    console.log('交易哈希:', transaction);
    console.log('');

    // 6. 等待交易确认
    console.log('等待交易确认...');
    let receipt = null;
    let attempts = 0;
    const maxAttempts = 30; // 最多等待 30 次（约 5 分钟）
    
    while (!receipt && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 等待 10 秒
      attempts++;
      
      try {
        const txInfo = await tronWeb.trx.getTransactionInfo(transaction);
        if (txInfo && txInfo.receipt) {
          receipt = txInfo;
          break;
        }
      } catch (err) {
        // 交易可能还在确认中
        if (attempts % 3 === 0) {
          console.log(`  等待中... (${attempts}/${maxAttempts})`);
        }
      }
    }

    if (!receipt) {
      console.warn('⚠️  无法获取交易确认信息，但交易可能已成功');
      console.log('请手动在 TronScan 上查看交易:', `https://tronscan.org/#/transaction/${transaction}`);
      return;
    }

    // 7. 检查交易结果
    if (receipt.receipt && receipt.receipt.result === 'SUCCESS') {
      console.log('✅ 交易确认成功！');
      console.log('Energy 消耗:', receipt.receipt.energy_usage_total || 'N/A');
      console.log('费用:', receipt.fee || 0, 'SUN');
      console.log('');
      
      // 8. 查询赎回后的 USDT 余额
      console.log('查询赎回后的 USDT 余额...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒确保状态更新
      const usdtBalanceAfter = await queryBalance(USDT_ADDRESS, addressBase58);
      const usdtBalanceAfterStr = usdtBalanceAfter.toString();
      const usdtBalanceAfterFormatted = (Number(usdtBalanceAfterStr) / 1e6).toFixed(6);
      
      const usdtReceived = BigInt(usdtBalanceAfterStr) - BigInt(usdtBalanceBeforeStr);
      const usdtReceivedFormatted = (Number(usdtReceived.toString()) / 1e6).toFixed(6);
      
      console.log(`USDT 余额: ${usdtBalanceAfterStr} (${usdtBalanceAfterFormatted} USDT)`);
      console.log(`收到的 USDT: ${usdtReceived.toString()} (${usdtReceivedFormatted} USDT)`);
      console.log('');
      
      // 9. 查询剩余的 jUSDT 余额
      const jUSDTBalanceAfter = await queryBalance(jTokenAddress, addressBase58);
      const jUSDTBalanceAfterStr = jUSDTBalanceAfter.toString();
      const jUSDTBalanceAfterFormatted = (Number(jUSDTBalanceAfterStr) / 1e6).toFixed(6);
      console.log(`剩余 jUSDT 余额: ${jUSDTBalanceAfterStr} (${jUSDTBalanceAfterFormatted} jUSDT)`);
      console.log('');
      
      console.log('====================================');
      console.log('✅ 赎回完成！');
      console.log('====================================');
      console.log('交易哈希:', transaction);
      console.log('TronScan:', `https://tronscan.org/#/transaction/${transaction}`);
    } else {
      console.error('❌ 交易失败');
      if (receipt.resMessage) {
        const errorMessage = tronWeb.toUtf8(receipt.resMessage);
        console.error('错误信息:', errorMessage);
      }
      if (receipt.contractResult && receipt.contractResult[0]) {
        console.error('合约返回:', receipt.contractResult[0]);
      }
      throw new Error('交易执行失败');
    }
  } catch (error) {
    console.error('❌ 赎回失败:', error.message || error.toString());
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    if (error.response) {
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('用法: node script/redeemJUSDTTRON.cjs <private_key> [jtoken_address] [amount]');
    console.error('');
    console.error('参数:');
    console.error('  private_key     - 私钥（用于签名交易）');
    console.error('  jtoken_address  - jToken 地址（可选，默认从 result_tron.json 读取）');
    console.error('  amount          - 赎回数量（可选，默认赎回全部，单位：最小单位，6位精度）');
    console.error('');
    console.error('示例:');
    console.error('  node script/redeemJUSDTTRON.cjs YOUR_PRIVATE_KEY');
    console.error('  node script/redeemJUSDTTRON.cjs YOUR_PRIVATE_KEY TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd');
    console.error('  node script/redeemJUSDTTRON.cjs YOUR_PRIVATE_KEY TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd 1000000');
    process.exit(1);
  }

  const privateKey = args[0];
  let jTokenAddress = args[1];
  const redeemAmount = args[2] || null;

  // 如果没有提供 jToken 地址，从配置文件读取
  if (!jTokenAddress) {
    jTokenAddress = getJTokenAddress();
    if (!jTokenAddress) {
      console.error('❌ 无法获取 jToken 地址，请手动指定');
      console.error('默认 jToken 地址: TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd');
      process.exit(1);
    }
  }

  await redeemJUSDT(privateKey, jTokenAddress, redeemAmount);
}

// 运行主函数
if (require.main === module) {
  main().catch((error) => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

module.exports = { redeemJUSDT };
