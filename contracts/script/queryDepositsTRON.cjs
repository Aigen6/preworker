#!/usr/bin/env node

/**
 * 查询 TRON 链上指定 recipient 地址的可领取存款记录
 * 用法: node script/queryDepositsTRON.cjs <recipient_address> [contract_address] [rpc_url]
 * 示例: node script/queryDepositsTRON.cjs TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9
 * 示例: node script/queryDepositsTRON.cjs TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9 TP6T56p7zySYxfsrdsSn2UM4LpH8cCCmfc
 */

const TronWeb = require('tronweb');
const fs = require('fs');
const path = require('path');

// 从部署结果读取合约地址
function getVaultAddress() {
  const resultPath = path.join(__dirname, '../deployed', 'result_tron.json');
  if (!fs.existsSync(resultPath)) {
    return null;
  }
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  return result.contracts.DepositVault.address;
}

// DepositVault ABI (根据合约代码更新，只包含需要的函数)
const DEPOSIT_VAULT_ABI = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "getClaimableDeposits",
    "outputs": [
      {
        "name": "depositIds",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "getClaimableDepositCount",
    "outputs": [
      {
        "name": "count",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "depositId",
        "type": "uint256"
      }
    ],
    "name": "getDeposit",
    "outputs": [
      {
        "components": [
          {
            "name": "depositor",
            "type": "address"
          },
          {
            "name": "depositTime",
            "type": "uint40"
          },
          {
            "name": "used",
            "type": "bool"
          },
          {
            "name": "intendedRecipient",
            "type": "address"
          },
          {
            "name": "yieldAmount",
            "type": "uint96"
          },
          {
            "name": "yieldToken",
            "type": "address"
          },
          {
            "name": "token",
            "type": "address"
          }
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "depositId",
        "type": "uint256"
      }
    ],
    "name": "getUnderlyingAmount",
    "outputs": [
      {
        "name": "underlyingAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "depositCount",
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

// TRON RPC 端点（多个备选）
const RPC_URLS = [
  'https://api.trongrid.io',
  'https://tron.api.pocket.network',
  'https://api.tronstack.io',
];
const DEFAULT_RPC_URL = RPC_URLS[0];

// 格式化 TRX 金额（从 SUN 转换为 TRX）
function formatTRX(sun) {
  return (Number(sun) / 1_000_000).toFixed(6);
}

// 格式化时间戳
function formatTime(timestamp) {
  return new Date(Number(timestamp) * 1000).toISOString();
}

// 查询存款记录
async function queryDeposits(recipientAddress, contractAddress, rpcUrl = DEFAULT_RPC_URL) {
  console.log('====================================');
  console.log('查询 TRON 链上的存款记录');
  console.log('====================================');
  console.log('Recipient 地址:', recipientAddress);
  console.log('合约地址:', contractAddress);
  console.log('RPC 端点:', rpcUrl);
  console.log('');

  // 初始化 TronWeb（尝试多个 RPC 端点）
  let tronWeb;
  let lastError;
  
  const rpcUrlsToTry = rpcUrl ? [rpcUrl] : RPC_URLS;
  for (const url of rpcUrlsToTry) {
    try {
      console.log(`尝试连接 RPC: ${url}...`);
      tronWeb = new TronWeb({
        fullHost: url,
      });
      // 测试连接
      await tronWeb.trx.getChainParameters();
      console.log(`✅ 成功连接到 ${url}`);
      break;
    } catch (error) {
      console.warn(`❌ 连接 ${url} 失败:`, error.message || error);
      lastError = error;
      continue;
    }
  }
  
  if (!tronWeb) {
    throw new Error(`所有 RPC 端点都连接失败。最后错误: ${lastError?.message || lastError}`);
  }

  // 验证地址格式并规范化
  if (!tronWeb.isAddress(recipientAddress)) {
    throw new Error(`无效的 recipient 地址: ${recipientAddress}`);
  }
  if (!tronWeb.isAddress(contractAddress)) {
    throw new Error(`无效的合约地址: ${contractAddress}`);
  }

  // 规范化地址格式（确保是 Base58 格式）
  // normalizeAddress 函数：如果地址是 hex 格式（0x41...），转换为 Base58；如果已经是 Base58，保持不变
  function normalizeAddressLocal(addr) {
    if (!addr) return null;
    if (addr.startsWith("T")) return addr; // 已经是 Base58 格式
    if (addr.startsWith("0x")) {
      const lower = addr.toLowerCase();
      if (lower === "0x0000000000000000000000000000000000000000") {
        return "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"; // TRON zero address
      }
      if (!lower.startsWith("0x41")) {
        throw new Error(`地址 ${addr} 不是合法的 Tron Hex（应该以 0x41 开头）`);
      }
      return tronWeb.address.fromHex(addr);
    }
    if (addr.startsWith("41") && addr.length === 42) {
      return tronWeb.address.fromHex(`0x${addr}`);
    }
    return addr;
  }

  const recipientBase58 = normalizeAddressLocal(recipientAddress);
  const contractBase58 = normalizeAddressLocal(contractAddress);

  console.log('Recipient (Base58):', recipientBase58);
  console.log('合约 (Base58):', contractBase58);
  console.log('Recipient (Hex):', tronWeb.address.toHex(recipientBase58));
  console.log('合约 (Hex):', tronWeb.address.toHex(contractBase58));
  console.log('');
  console.log('⚠️  注意：查询之间会自动添加 0.5 秒延迟，并支持自动重试（最多 3 次，指数退避）');
  console.log('');

  // 加载合约 ABI（从编译后的文件）
  let contractABI = DEPOSIT_VAULT_ABI;
  try {
    const artifactPath = path.join(__dirname, '../out/DepositVault.sol/DepositVault.json');
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      contractABI = artifact.abi;
      console.log('✅ 已加载合约 ABI');
    } else {
      console.log('⚠️  未找到编译后的 ABI，使用简化版 ABI');
    }
  } catch (error) {
    console.warn('⚠️  加载 ABI 失败，使用简化版 ABI:', error.message);
  }

  // 创建合约实例
  let contract;
  try {
    // 设置默认地址，这样 contract.call() 会自动使用
    tronWeb.setAddress('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb');
    contract = await tronWeb.contract(contractABI, contractBase58);
    console.log('✅ 合约实例创建成功');
  } catch (error) {
    console.error('❌ 创建合约实例失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }

  // 辅助函数：规范化地址格式
  // 使用 TronWeb 的转换函数来确保地址格式正确
  function normalizeAddress(addr) {
    if (!addr) return null;
    
    // 如果已经是 Base58 格式（以 T 开头），直接返回
    if (addr.startsWith("T")) {
      return addr; // TronWeb 的 isAddress 可能对某些地址返回 false，但地址本身可能是有效的
    }
    
    // 处理 hex 格式地址
    let hexAddr = addr;
    
    // 如果以 0x 开头，直接使用
    if (addr.startsWith("0x")) {
      hexAddr = addr;
    }
    // 如果以 41 开头且长度为 42（无 0x 前缀），添加 0x 前缀
    // 例如：41dd62a4d119c93eb3bc48fff45b43ead230d6b5fc -> 0x41dd62a4d119c93eb3bc48fff45b43ead230d6b5fc
    else if (addr.startsWith("41") && addr.length === 42) {
      hexAddr = `0x${addr}`;
    }
    // 其他情况，尝试作为 hex 处理（添加 0x 前缀）
    else if (addr.length === 40 || addr.length === 42) {
      hexAddr = `0x${addr}`;
    }
    else {
      throw new Error(`无法识别的地址格式: ${addr}`);
    }
    
    // 验证 hex 地址格式
    const lower = hexAddr.toLowerCase();
    if (lower === "0x0000000000000000000000000000000000000000") {
      return "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"; // TRON zero address
    }
    
    // TRON 地址必须以 0x41 开头（41 是 TRON 主网的地址前缀）
    if (!lower.startsWith("0x41")) {
      throw new Error(`地址 ${addr} 不是合法的 Tron Hex（应该以 0x41 开头）`);
    }
    
    // 验证 hex 地址长度（应该是 0x + 42 个字符 = 44 个字符）
    if (hexAddr.length !== 44) {
      throw new Error(`地址 ${addr} 长度不正确（应该是 42 个 hex 字符）`);
    }
    
    // 使用 TronWeb 的 fromHex 函数转换为 Base58
    // 注意：即使 isAddress 返回 false，fromHex 转换的结果也可能是有效的
    try {
      const base58Addr = tronWeb.address.fromHex(hexAddr);
      // 验证转换后的地址格式（应该以 T 开头）
      if (base58Addr && base58Addr.startsWith("T")) {
        return base58Addr;
      }
      throw new Error(`地址转换失败: ${addr} -> ${base58Addr}`);
    } catch (error) {
      throw new Error(`地址转换失败: ${addr} (hex: ${hexAddr}) - ${error.message}`);
    }
  }

  // 辅助函数：延迟
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 辅助函数：重试机制
  async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 200) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const errorMsg = error.message || String(error);
        const errorLower = errorMsg.toLowerCase();
        
        // 如果是限流错误，等待后重试
        if (errorLower.includes('429') || errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
          if (i < maxRetries - 1) {
            const delay = initialDelay * Math.pow(2, i); // 指数退避
            console.log(`  ⚠️  遇到限流，等待 ${delay}ms 后重试 (${i + 1}/${maxRetries})...`);
            await sleep(delay);
            continue;
          }
        }
        
        // 注意：对于 view 函数，不应该有 REVERT，所以不再特殊处理 REVERT
        // 所有错误都直接抛出，让调用方处理
        
        // 其他错误，直接抛出
        throw error;
      }
    }
    throw lastError;
  }

  // 辅助函数：调用合约 view 函数
  async function callContractFunction(functionName, ...args) {
    try {
      // 直接使用 triggerConstantContract（跳过 contract.call()，因为它需要复杂的 owner_address 设置）
      // 添加延迟（避免限流）
      await sleep(500);
      
      // 找到函数定义
      const funcABI = contractABI.find(item => item.name === functionName && item.type === 'function');
      if (!funcABI) {
        throw new Error(`函数 ${functionName} 在 ABI 中不存在`);
      }
      
      // 准备参数（转换为 hex 格式，20-byte，去掉 41 前缀）
      const processedArgsHex = args.map((arg, index) => {
        const inputType = funcABI.inputs[index].type;
        if (inputType === 'address') {
          const base58Addr = normalizeAddress(arg);
          let hexAddr = tronWeb.address.toHex(base58Addr);
          
          // TRON 地址的 hex 格式是 41...（42 个字符，无 0x 前缀）
          // 但 Solidity 的 address 类型是 20 字节（40 个 hex 字符）
          // 所以需要去掉前面的 41 前缀，只保留后面的 40 个字符
          if (hexAddr.startsWith('41') && hexAddr.length === 42) {
            hexAddr = hexAddr.slice(2); // 去掉 41 前缀，保留 40 个字符（20 字节）
          }
          
          // 添加 0x 前缀（Solidity 需要）
          if (!hexAddr.startsWith('0x')) {
            hexAddr = '0x' + hexAddr;
          }
          
          return hexAddr;
        }
        return arg;
      });
      
      // 使用 triggerConstantContract 调用
      const defaultCaller = tronWeb.address.toHex('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'); // hex 格式
      
      console.log(`  [调试] 使用 triggerConstantContract 调用 ${functionName}...`);
      console.log(`  [调试] hex 格式参数:`, processedArgsHex);
      
      const result = await retryWithBackoff(async () => {
        // 构建函数签名（function selector）
        // 格式：functionName(param1Type,param2Type,...)
        const paramTypes = funcABI.inputs.map(input => input.type).join(',');
        const functionSignature = `${functionName}(${paramTypes})`;
        console.log(`  [调试] 函数签名: ${functionSignature}`);
        
        // 传递 owner_address（hex 格式）
        const callResult = await tronWeb.transactionBuilder.triggerConstantContract(
          contractBase58,
          functionSignature, // 使用函数签名而不是函数名
          {}, // 不设置 visible，使用默认格式
          funcABI.inputs.map((input, index) => ({
            type: input.type,
            value: processedArgsHex[index]
          })),
          defaultCaller // 传递 owner_address（hex 格式）
        );
        
        console.log(`  [调试] triggerConstantContract 原始返回:`, callResult ? JSON.stringify(callResult, null, 2) : 'null');
        
        // 检查返回值是否为 null
        if (!callResult) {
          // triggerConstantContract 返回 null 可能是 RPC 问题，抛出错误让 retryWithBackoff 重试
          throw new Error('triggerConstantContract 返回 null - 可能是 RPC 问题');
        }
        
        // 重要：先检查 constant_result，即使有错误信息也可能有数据
        if (callResult.constant_result && callResult.constant_result.length > 0) {
          console.log(`  [调试] 检测到 constant_result，继续处理（忽略可能的错误信息）`);
          return callResult;
        }
        
        // 如果没有 constant_result，检查是否有错误信息
        if (callResult.result && callResult.result.result === false) {
          const errorMsg = callResult.result.message || 'Unknown error';
          console.log(`  [调试] 合约调用返回错误（无 constant_result）: ${errorMsg}`);
          // 对于 view 函数，不应该有 REVERT，如果有错误就抛出
          throw new Error(`合约调用失败: ${errorMsg}`);
        }
        
        return callResult;
      }, 3, 500);
      
      // 检查 result
      if (!result) {
        // retryWithBackoff 返回 null 表示所有重试都失败了
        throw new Error('triggerConstantContract 调用失败：所有重试都失败');
      }
      
      console.log(`  [调试] triggerConstantContract 调用成功`);
      
      // 解码返回值
      if (result && result.constant_result && result.constant_result.length > 0) {
        // 解码返回值
        let outputHex = result.constant_result[0];
        console.log(`  [调试] triggerConstantContract 返回的原始 hex: ${outputHex}`);
        console.log(`  [调试] 输出类型: ${funcABI.outputs.map(output => output.type).join(', ')}`);
        
        // 确保 hex 字符串以 0x 开头（tronWeb.utils.abi.decodeParams 需要）
        if (!outputHex.startsWith('0x')) {
          outputHex = '0x' + outputHex;
        }
        console.log(`  [调试] 处理后的 hex（添加 0x 前缀）: ${outputHex}`);
        
        // 处理 tuple 类型：需要构建正确的类型字符串
        let outputTypes = funcABI.outputs.map(output => {
          if (output.type === 'tuple') {
            // 对于 tuple，需要构建 (type1,type2,...) 格式
            const components = output.components || [];
            const tupleTypes = components.map(comp => comp.type).join(',');
            return `(${tupleTypes})`;
          }
          return output.type;
        });
        
        console.log(`  [调试] 输出类型字符串: ${outputTypes.join(', ')}`);
        
        const decoded = tronWeb.utils.abi.decodeParams(
          outputTypes,
          outputHex
        );
        console.log(`  [调试] 解码后的结果:`, decoded);
        
        // 如果只有一个返回值，直接返回；如果有多个，返回数组
        if (funcABI.outputs.length === 1) {
          // 如果是 tuple 类型，需要转换为对象
          if (funcABI.outputs[0].type === 'tuple') {
            const components = funcABI.outputs[0].components || [];
            const tupleResult = {};
            
            // decoded 应该是一个数组，第一个元素是 tuple 的值数组
            // 但有时可能直接是数组，需要检查
            let decodedArray;
            if (Array.isArray(decoded) && decoded.length > 0) {
              if (Array.isArray(decoded[0])) {
                decodedArray = decoded[0];
              } else {
                // 如果 decoded[0] 不是数组，可能整个 decoded 就是值数组
                decodedArray = decoded;
              }
            } else {
              decodedArray = [];
            }
            
            console.log(`  [调试] tuple 解码后的数组:`, decodedArray);
            console.log(`  [调试] tuple components 数量: ${components.length}`);
            
            // 将解码后的数组转换为对象
            components.forEach((comp, index) => {
              let value = decodedArray[index];
              
              // 处理地址类型：转换为 Base58
              if (comp.type === 'address') {
                if (typeof value === 'string' && value.startsWith('0x')) {
                  value = tronWeb.address.fromHex(value);
                } else if (typeof value === 'string' && value.startsWith('41')) {
                  value = tronWeb.address.fromHex(`0x${value}`);
                } else if (value && typeof value.toString === 'function') {
                  // 可能是 BigNumber 或其他对象，先转换为字符串
                  const hexStr = value.toString(16);
                  if (hexStr.startsWith('41') || hexStr.length === 40) {
                    value = tronWeb.address.fromHex(`0x${hexStr}`);
                  }
                }
              }
              
              tupleResult[comp.name] = value;
            });
            
            console.log(`  [调试] tuple 转换为对象:`, tupleResult);
            return tupleResult;
          }
          
          // 如果是数组类型（如 uint256[]），直接返回数组
          if (funcABI.outputs[0].type.includes('[]')) {
            console.log(`  [调试] 检测到数组类型: ${funcABI.outputs[0].type}`);
            const arrayResult = decoded[0];
            console.log(`  [调试] 数组结果:`, arrayResult);
            return Array.isArray(arrayResult) ? arrayResult : [arrayResult];
          }
          // 如果是地址类型，转换为 base58（合约返回的是 hex 格式）
          if (funcABI.outputs[0].type === 'address') {
            const hexAddr = decoded[0];
            // 确保是有效的 hex 地址
            if (typeof hexAddr === 'string' && hexAddr.startsWith('0x')) {
              return tronWeb.address.fromHex(hexAddr);
            } else if (typeof hexAddr === 'string' && hexAddr.startsWith('41')) {
              return tronWeb.address.fromHex(`0x${hexAddr}`);
            }
            return hexAddr; // 如果已经是 Base58，直接返回
          }
          return decoded[0];
        }
        // 处理多个返回值
        return decoded.map((val, index) => {
          if (funcABI.outputs[index].type === 'address') {
            const hexAddr = val;
            // 确保是有效的 hex 地址
            if (typeof hexAddr === 'string' && hexAddr.startsWith('0x')) {
              return tronWeb.address.fromHex(hexAddr);
            } else if (typeof hexAddr === 'string' && hexAddr.startsWith('41')) {
              return tronWeb.address.fromHex(`0x${hexAddr}`);
            }
            return hexAddr; // 如果已经是 Base58，直接返回
          }
          return val;
        });
      } else {
        // 空结果可能表示没有数据（比如空数组）
        console.log(`  [调试] triggerConstantContract 返回空结果`);
        console.log(`  [调试] result:`, result);
        // 对于 getClaimableDeposits，空结果应该返回空数组
        if (functionName === 'getClaimableDeposits') {
          return [];
        }
        // 对于其他函数，返回 null 表示可能没有数据
        return null;
      }
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.error(`❌ 合约调用失败: ${errorMsg}`);
      throw error;
    }
  }

  try {
    // 1. 查询可领取的存款数量
    console.log('查询可领取的存款数量...');
    let count;
    try {
      count = await callContractFunction('getClaimableDepositCount', recipientBase58);
      if (count === null) {
        console.log('ℹ️  合约返回 REVERT - 这是正常情况，表示该地址没有可领取的存款');
        count = 0;
      } else {
        console.log(`✅ 可领取的存款数量: ${count.toString()}`);
      }
    } catch (error) {
      // 区分限流错误和其他错误
      if (error.message && error.message.includes('限流')) {
        console.error('❌ RPC 限流错误，无法继续查询');
        throw error;
      }
      console.warn('⚠️  查询数量失败，继续查询列表:', error.message);
      count = null;
    }
    console.log('');

    // 2. 查询可领取的存款ID列表
    console.log('查询可领取的存款ID列表...');
    console.log(`  [调试] 查询地址 (Base58): ${recipientBase58}`);
    console.log(`  [调试] 查询地址 (Hex): ${tronWeb.address.toHex(recipientBase58)}`);
    let depositIds = [];
    
    try {
      const result = await callContractFunction('getClaimableDeposits', recipientBase58);
      
      console.log(`  [调试] getClaimableDeposits 返回结果:`, result);
      console.log(`  [调试] 返回结果类型:`, typeof result);
      console.log(`  [调试] 是否为数组:`, Array.isArray(result));
      
      if (result === null) {
        // REVERT 或空结果表示没有数据（正常情况）
        console.log('ℹ️  合约返回 REVERT - 这是正常情况，表示该地址没有可领取的存款');
        depositIds = [];
      } else if (Array.isArray(result)) {
        depositIds = result;
        if (depositIds.length > 0) {
          console.log(`✅ 找到 ${depositIds.length} 个可领取的存款ID:`, depositIds.map(id => id.toString()));
        } else {
          console.log('ℹ️  找到 0 个可领取的存款ID（空数组）');
          
          // 如果返回空数组，但 TronScan 显示有数据，尝试直接查询 deposits[0] 来验证
          console.log('\n  [调试] 尝试直接查询 deposits[0] 来验证状态...');
          await sleep(500);
          try {
            console.log('  [调试] 调用 getDeposit(0)...');
            const deposit0 = await callContractFunction('getDeposit', 0);
            console.log('  [调试] getDeposit(0) 返回结果:', deposit0);
            
            if (deposit0) {
              console.log(`  deposits[0] 信息:`);
              console.log(`    - intendedRecipient: ${deposit0.intendedRecipient}`);
              console.log(`    - used: ${deposit0.used}`);
              console.log(`    - yieldAmount: ${deposit0.yieldAmount ? deposit0.yieldAmount.toString() : '0'}`);
              console.log(`    - depositor: ${deposit0.depositor}`);
              
              // 检查地址是否匹配
              const depositRecipientHex = tronWeb.address.toHex(deposit0.intendedRecipient);
              const queryRecipientHex = tronWeb.address.toHex(recipientBase58);
              const addressMatch = depositRecipientHex.toLowerCase() === queryRecipientHex.toLowerCase();
              console.log(`    - 地址匹配: ${addressMatch}`);
              
              if (addressMatch) {
                if (deposit0.used) {
                  console.log(`  ⚠️  deposits[0] 已被使用（used = true），所以被过滤掉了`);
                } else if (!deposit0.yieldAmount || deposit0.yieldAmount.toString() === '0') {
                  console.log(`  ⚠️  deposits[0] 余额为0（yieldAmount = 0），所以被过滤掉了`);
                } else {
                  console.log(`  ⚠️  地址匹配且状态正常，但 getClaimableDeposits 返回空数组`);
                  console.log(`  可能原因：recipientDeposits mapping 中的地址格式不匹配`);
                }
              } else {
                console.log(`  ⚠️  地址不匹配，说明存入时使用的地址格式与查询时不一致`);
                console.log(`    deposits[0].intendedRecipient (Hex): ${depositRecipientHex}`);
                console.log(`    查询地址 (Hex): ${queryRecipientHex}`);
              }
            } else {
              console.log('  ⚠️  getDeposit(0) 返回 null 或 undefined');
            }
          } catch (error) {
            console.error('  [调试] 无法查询 deposits[0]:', error.message);
            if (error.stack) {
              console.error('  [调试] 错误堆栈:', error.stack);
            }
          }
        }
      } else {
        throw new Error(`返回结果不是数组: ${typeof result}`);
      }
    } catch (error) {
      // 区分限流错误和其他错误
      if (error.message && error.message.includes('限流')) {
        console.error('❌ RPC 限流错误，无法继续查询');
        throw error;
      } else if (error.message && (error.message.includes('REVERT') || error.message.includes('空结果'))) {
        console.log('ℹ️  合约调用被 REVERT 或返回空结果 - 这是正常情况，表示没有可领取的存款');
        depositIds = [];
      } else {
        console.error('❌ 查询存款ID列表失败:', error.message);
        if (error.stack) {
          console.error(error.stack);
        }
        throw error;
      }
    }
    console.log('');

    if (!depositIds || depositIds.length === 0) {
      console.log('====================================');
      console.log('没有找到可领取的存款记录');
      console.log('====================================');
      console.log('\n可能的原因:');
      console.log('1. 当前地址没有作为 intendedRecipient 的存款');
      console.log('2. 所有存款已被领取或取回');
      console.log('3. 存款时 intendedRecipient 设置的不是当前地址');
      
      // 查询总存款数（用于参考）
      try {
        await sleep(500);
        const totalDeposits = await callContractFunction('depositCount');
        if (totalDeposits && totalDeposits.toString) {
          console.log(`\n合约总存款数: ${totalDeposits.toString()}`);
          
          // 如果总存款数 > 0，尝试直接查询 deposits[0] 来验证地址格式
          if (totalDeposits > 0) {
            console.log('\n尝试直接查询 deposits[0] 来验证地址格式...');
            await sleep(500);
            try {
              const deposit0 = await callContractFunction('getDeposit', 0);
              if (deposit0 && deposit0.intendedRecipient) {
                console.log(`  deposits[0].intendedRecipient: ${deposit0.intendedRecipient}`);
                console.log(`  deposits[0].used: ${deposit0.used}`);
                console.log(`  deposits[0].yieldAmount: ${deposit0.yieldAmount ? deposit0.yieldAmount.toString() : '0'}`);
                console.log(`  查询地址 (Base58): ${recipientBase58}`);
                console.log(`  查询地址 (Hex): ${tronWeb.address.toHex(recipientBase58)}`);
                console.log(`  查询地址 (去掉41): 0x${tronWeb.address.toHex(recipientBase58).slice(2)}`);
                
                // 比较地址是否匹配
                const depositRecipientHex = tronWeb.address.toHex(deposit0.intendedRecipient);
                const queryRecipientHex = tronWeb.address.toHex(recipientBase58);
                console.log(`  deposits[0].intendedRecipient (Hex): ${depositRecipientHex}`);
                console.log(`  地址匹配: ${depositRecipientHex.toLowerCase() === queryRecipientHex.toLowerCase()}`);
                
                // 检查为什么 getClaimableDeposits 返回空数组
                if (depositRecipientHex.toLowerCase() === queryRecipientHex.toLowerCase()) {
                  console.log('\n✅ 地址匹配！');
                  if (deposit0.used) {
                    console.log('  ⚠️  但是 deposits[0].used = true，所以被过滤掉了');
                  }
                  if (!deposit0.yieldAmount || deposit0.yieldAmount.toString() === '0') {
                    console.log('  ⚠️  但是 deposits[0].yieldAmount = 0，所以被过滤掉了');
                  }
                  if (!deposit0.used && deposit0.yieldAmount && deposit0.yieldAmount.toString() !== '0') {
                    console.log('  ⚠️  地址匹配且状态正常，但 getClaimableDeposits 返回空数组');
                    console.log('  可能原因：recipientDeposits mapping 中的地址格式不匹配');
                  }
                } else {
                  console.log('\n⚠️  地址格式不匹配！');
                  console.log('  可能原因：存入时和查询时使用的地址格式不一致');
                  console.log('  建议：检查存入时传入的 intendedRecipient 地址格式');
                }
              }
            } catch (error) {
              console.warn('  无法查询 deposits[0]:', error.message);
            }
          }
        }
      } catch (error) {
        // 如果是限流错误，只警告不报错（这是非关键查询）
        if (error.message && error.message.includes('限流')) {
          console.warn('\n⚠️  查询总存款数时遇到限流，已跳过（这是非关键查询）');
        } else {
          console.warn('无法查询总存款数:', error.message);
        }
      }
      
      return [];
    }

    // 3. 查询每个存款的详细信息
    console.log('====================================');
    console.log('存款记录详情');
    console.log('====================================');
    
    const deposits = [];
    for (let i = 0; i < depositIds.length; i++) {
      const depositId = depositIds[i];
      try {
        console.log(`\n查询存款 #${i + 1} (ID: ${depositId.toString()})...`);
        
        // 查询之间添加延迟（避免限流）
        if (i > 0) {
          await sleep(500); // 0.5 秒延迟（增加到 0.5 秒以减少限流）
        }
        
        const depositInfo = await callContractFunction('getDeposit', depositId);
        
        // 查询底层资产数量（可选）
        let underlyingAmount = null;
        try {
          await sleep(500); // 0.5 秒延迟（增加到 0.5 秒以减少限流）
          underlyingAmount = await callContractFunction('getUnderlyingAmount', depositId);
        } catch (error) {
          // 区分限流错误和其他错误
          if (error.message && error.message.includes('限流')) {
            console.warn(`  ⚠️  查询底层资产数量时遇到限流，跳过此查询`);
          } else {
            console.warn(`  ⚠️  无法查询底层资产数量: ${error.message}`);
          }
        }

        const deposit = {
          depositId: depositId.toString(),
          depositor: depositInfo.depositor,
          token: depositInfo.token,
          yieldToken: depositInfo.yieldToken,
          yieldAmount: depositInfo.yieldAmount.toString(),
          intendedRecipient: depositInfo.intendedRecipient,
          depositTime: depositInfo.depositTime.toString(),
          used: depositInfo.used,
          underlyingAmount: underlyingAmount ? underlyingAmount.toString() : null,
        };
        
        deposits.push(deposit);

        // 显示详细信息
        console.log(`  存款 ID: ${deposit.depositId}`);
        console.log(`  存款人: ${deposit.depositor}`);
        console.log(`  底层代币: ${deposit.token}`);
        console.log(`  Yield Token: ${deposit.yieldToken}`);
        console.log(`  Yield 数量: ${deposit.yieldAmount} (${formatTRX(deposit.yieldAmount)} TRX, 假设18位精度)`);
        if (deposit.underlyingAmount) {
          console.log(`  底层资产数量: ${deposit.underlyingAmount} (${formatTRX(deposit.underlyingAmount)} TRX, 假设6位精度)`);
        }
        console.log(`  预期接收人: ${deposit.intendedRecipient}`);
        console.log(`  存款时间: ${formatTime(deposit.depositTime)}`);
        console.log(`  状态: ${deposit.used ? '已使用' : '未使用'}`);
        
      } catch (error) {
        console.error(`  查询存款 ${depositId.toString()} 失败:`, error.message);
        if (error.stack) {
          console.error(error.stack);
        }
      }
    }

    // 4. 查询总存款数（用于参考，非关键查询，如果限流则跳过）
    try {
      await sleep(500); // 添加延迟
      const totalDeposits = await callContractFunction('depositCount');
      console.log('\n====================================');
      console.log(`合约总存款数: ${totalDeposits.toString()}`);
      console.log(`该地址可领取存款数: ${deposits.length}`);
      console.log('====================================');
    } catch (error) {
      // 如果是限流错误，只警告不报错（这是非关键查询）
      if (error.message && error.message.includes('限流')) {
        console.warn('\n⚠️  查询总存款数时遇到限流，已跳过（这是非关键查询）');
      } else {
        console.warn('无法查询总存款数:', error.message);
      }
    }

    return deposits;
  } catch (error) {
    console.error('查询失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node script/queryDepositsTRON.cjs <recipient_address> [contract_address] [rpc_url]');
    console.error('');
    console.error('参数:');
    console.error('  recipient_address  - 要查询的 recipient 地址（必需）');
    console.error('  contract_address   - DepositVault 合约地址（可选，默认从 deployed/result_tron.json 读取）');
    console.error('  rpc_url            - TRON RPC 端点（可选，默认: https://api.trongrid.io）');
    console.error('');
    console.error('示例:');
    console.error('  node script/queryDepositsTRON.cjs TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9');
    console.error('  node script/queryDepositsTRON.cjs TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9 TP6T56p7zySYxfsrdsSn2UM4LpH8cCCmfc');
    console.error('  node script/queryDepositsTRON.cjs TW9nWM2AAewQyLV4xtysTtKJM2En2jyiW9 TP6T56p7zySYxfsrdsSn2UM4LpH8cCCmfc https://api.trongrid.io');
    process.exit(1);
  }

  const recipientAddress = args[0];
  const contractAddress = args[1] || getVaultAddress();
  const rpcUrl = args[2] || DEFAULT_RPC_URL;

  if (!contractAddress) {
    console.error('错误: 无法获取合约地址');
    console.error('请提供合约地址作为第二个参数，或确保 deployed/result_tron.json 文件存在');
    process.exit(1);
  }

  try {
    await queryDeposits(recipientAddress, contractAddress, rpcUrl);
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
