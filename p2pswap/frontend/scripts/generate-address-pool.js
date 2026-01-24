/**
 * 生成地址池脚本
 * 为 BSC、TRON、ETH 三种链生成地址
 * 
 * 使用方法：
 * node scripts/generate-address-pool.js [count]
 * 
 * count: 每种链生成的地址数量，默认 100
 * 
 * 注意：TRON 地址生成需要安装 TronWeb
 * npm install tronweb
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// 尝试加载 TronWeb（可选）
let TronWeb = null;
try {
  TronWeb = require('tronweb');
} catch (e) {
  console.warn('⚠️  TronWeb 未安装，TRON 地址将使用简化方法生成（不是真正的 TRON 地址）');
  console.warn('   要生成正确的 TRON 地址，请运行: npm install tronweb\n');
}

// 链配置
const CHAINS = {
  BSC: { chainId: 714, name: 'BSC' },
  TRON: { chainId: 195, name: 'TRON' },
  ETH: { chainId: 1, name: 'ETH' }
};

/**
 * 生成 EVM 链地址（BSC、ETH）
 */
function generateEVMAddress(index) {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase
  };
}

/**
 * 生成 TRON 地址
 * TRON 地址格式：T 开头，34 个字符
 */
function generateTronAddress(index) {
  if (TronWeb) {
    // 使用 TronWeb 生成正确的 TRON 地址
    try {
      const account = TronWeb.utils.accounts.generateAccount();
      return {
        address: account.address.base58,
        privateKey: account.privateKey,
        hexAddress: account.address.hex
      };
    } catch (error) {
      console.warn(`生成 TRON 地址失败 (index: ${index}):`, error.message);
      // 回退到简化方法
    }
  }
  
  // 简化方法：生成符合 TRON 格式的地址（不是真正的 TRON 地址）
  // 仅用于演示，实际应该使用 TronWeb
  const randomBytes = ethers.randomBytes(20);
  const hexString = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // TRON 地址格式：T + 33个字符（大写字母和数字）
  const tronAddress = 'T' + hexString.substring(0, 33).toUpperCase();
  
  return {
    address: tronAddress,
    privateKey: ethers.Wallet.createRandom().privateKey,
    note: '⚠️ 这不是真正的 TRON 地址，请使用 TronWeb 生成'
  };
}

/**
 * 生成地址池
 */
function generateAddressPool(count = 100) {
  const addresses = [];
  
  console.log(`开始生成地址池，每种链生成 ${count} 个地址...\n`);
  
  // 生成 BSC 地址
  console.log(`生成 BSC (chainId: 714) 地址...`);
  for (let i = 1; i <= count; i++) {
    const wallet = generateEVMAddress(i);
    addresses.push({
      address: wallet.address,
      chainId: 714,
      label: `低风险地址${i}`
    });
  }
  console.log(`✅ 已生成 ${count} 个 BSC 地址\n`);
  
  // 生成 TRON 地址
  console.log(`生成 TRON (chainId: 195) 地址...`);
  let tronWarning = false;
  for (let i = 1; i <= count; i++) {
    const tronData = generateTronAddress(i);
    if (tronData.note) {
      tronWarning = true;
    }
    addresses.push({
      address: tronData.address,
      chainId: 195,
      label: `低风险地址${i}`
    });
  }
  if (tronWarning) {
    console.log(`⚠️  已生成 ${count} 个 TRON 地址（注意：这些不是真正的 TRON 地址，请安装 TronWeb 生成正确的地址）\n`);
  } else {
    console.log(`✅ 已生成 ${count} 个 TRON 地址\n`);
  }
  
  // 生成 ETH 地址
  console.log(`生成 ETH (chainId: 1) 地址...`);
  for (let i = 1; i <= count; i++) {
    const wallet = generateEVMAddress(i + count * 2); // 使用不同的索引避免重复
    addresses.push({
      address: wallet.address,
      chainId: 1,
      label: `低风险地址${i}`
    });
  }
  console.log(`✅ 已生成 ${count} 个 ETH 地址\n`);
  
  return addresses;
}

/**
 * 主函数
 */
function main() {
  const count = parseInt(process.argv[2]) || 100;
  const outputPath = path.join(__dirname, '../public/config/address-pool.json');
  
  console.log('='.repeat(60));
  console.log('地址池生成脚本');
  console.log('='.repeat(60));
  console.log(`输出路径: ${outputPath}`);
  console.log(`每种链生成数量: ${count}`);
  console.log('='.repeat(60));
  console.log();
  
  // 生成地址
  const addresses = generateAddressPool(count);
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 读取现有配置（如果存在）
  let existingAddresses = [];
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (Array.isArray(existing)) {
        existingAddresses = existing;
        console.log(`读取到 ${existingAddresses.length} 个现有地址`);
      }
    } catch (error) {
      console.warn('读取现有配置文件失败，将创建新文件:', error.message);
    }
  }
  
  // 合并地址（避免重复）
  const addressMap = new Map();
  existingAddresses.forEach(addr => {
    const key = `${addr.chainId}_${addr.address.toLowerCase()}`;
    addressMap.set(key, addr);
  });
  
  addresses.forEach(addr => {
    const key = `${addr.chainId}_${addr.address.toLowerCase()}`;
    if (!addressMap.has(key)) {
      addressMap.set(key, addr);
    }
  });
  
  const finalAddresses = Array.from(addressMap.values());
  
  // 按 chainId 和 label 排序
  finalAddresses.sort((a, b) => {
    if (a.chainId !== b.chainId) {
      return a.chainId - b.chainId;
    }
    const numA = parseInt(a.label?.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.label?.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });
  
  // 写入文件
  fs.writeFileSync(outputPath, JSON.stringify(finalAddresses, null, 2), 'utf8');
  
  console.log('='.repeat(60));
  console.log('✅ 地址池生成完成！');
  console.log('='.repeat(60));
  console.log(`总地址数: ${finalAddresses.length}`);
  console.log(`BSC (714): ${finalAddresses.filter(a => a.chainId === 714).length}`);
  console.log(`TRON (195): ${finalAddresses.filter(a => a.chainId === 195).length}`);
  console.log(`ETH (1): ${finalAddresses.filter(a => a.chainId === 1).length}`);
  if (!TronWeb) {
    console.log('='.repeat(60));
    console.log(`\n⚠️  重要提示：`);
    console.log(`TRON 地址需要使用 TronWeb 库正确生成。`);
    console.log(`当前生成的 TRON 地址仅用于演示，不是真正的 TRON 地址。`);
    console.log(`要生成正确的 TRON 地址，请运行: npm install tronweb`);
    console.log(`然后重新运行此脚本。`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateAddressPool, generateEVMAddress, generateTronAddress };
