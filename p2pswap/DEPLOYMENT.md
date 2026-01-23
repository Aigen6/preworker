# 部署指南

## 前置条件

1. **BSC 测试网/主网账户**，有足够的 BNB 支付 Gas
2. **私钥**（用于部署合约）

## 步骤 1: 部署合约到 BSC

合约部署脚本位于 `@enclave/preworker/contracts/script/`，详细说明请参考：
- [contracts/script/README.md](../contracts/script/README.md)

### 1.1 编译合约

```bash
cd /Users/qizhongzhu/enclave/preworker/contracts
forge build
```

### 1.2 部署 DepositVault

使用现有的部署脚本：

```bash
# 必需的环境变量
export PRIVATE_KEY="你的私钥"

# 可选环境变量
export RPC_URL="https://bsc-dataseed1.binance.org"  # BSC 主网（可选，有默认值）
export INITIAL_OWNER="0x..."  # 初始所有者（可选，默认使用部署者地址）

# Delegator 配置（可选）
# 如果提供，会使用现有的 Delegator；如果不提供，会自动部署新的
export AAVE_DELEGATE="0x3557f453C2fBF23287100e17BBeE927C06494170"  # BSC/Ethereum
# export JUSTLEND_DELEGATE="T..."  # TRON

# AAVE Pool 配置（可选，有默认值）
# export AAVE_POOL="0x6807dc923806fE8Fd134338EABCA509979a7e0cB"  # BSC 主网

# 部署（使用 npm script）
npm run deploy:vault:bsc

# 或直接运行脚本
node script/deployDepositVaultBSC.cjs
```

**Delegator 说明**：
- **AAVE_DELEGATE** (BSC/Ethereum): AAVE V3 适配器地址
- **JUSTLEND_DELEGATE** (TRON): JustLend 适配器地址
- 如果不提供，部署脚本会自动部署新的 Delegator
- 如果提供，会使用现有的 Delegator（节省 Gas）
- **前端不需要配置 Delegator**，因为 Delegator 地址已存储在 DepositVault 合约中

### 1.3 部署结果

部署完成后，脚本会：
- 输出部署信息到控制台
- 自动保存到 `contracts/deployed/result_bsc.json`

示例输出：
```
====================================
Deployment Complete
====================================
DepositVault Address: 0x...
AAVEv3Delegate Address: 0x...
Owner: 0x...
Default Lending Delegate: 0x...
Default Lending Target: 0x...
Recovery Delay: 259200 (3 days)
✅ Deployment info saved to: deployed/result_bsc.json
```

### 1.4 其他链的部署

```bash
# Ethereum
npm run deploy:vault:eth

# TRON
npm run deploy:vault:tron

# 单独部署适配器
npm run deploy:adapters
```

## 关于 Delegator（适配器）

**重要**：Delegator 地址**不需要在前端配置**！

- Delegator 地址已存储在 DepositVault 合约中
- 前端只需要配置 DepositVault 地址
- Delegator 的环境变量（`AAVE_DELEGATE`）仅用于**部署时**指定使用现有的 Delegator

详细说明请参考：[DELEGATOR_CONFIG.md](./DELEGATOR_CONFIG.md)

## 步骤 2: 配置前端（三种方式任选其一）

### 方式 1: 环境变量（推荐，最简单）⭐

直接在 `.env.local` 中配置 DepositVault 地址：

```bash
# BSC (SLIP-44: 714)
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x339c124657A596D07df326ff0dA186453717763B

# 或使用通用配置（所有链）
NEXT_PUBLIC_DEPOSIT_VAULT_ADDRESS=0x339c124657A596D07df326ff0dA186453717763B
```

### 方式 2: 部署配置文件

将 `contracts/deployed/result_bsc.json` 复制到前端：

```bash
# 创建目录
mkdir -p p2pswap/frontend/public/deployed

# 复制部署结果
cp contracts/deployed/result_bsc.json p2pswap/frontend/public/deployed/
```

前端会自动从 `/deployed/result_bsc.json` 读取。

### 方式 3: TreasuryConfigCore（可选，不推荐）

如果前两种方式都不使用，前端会尝试从 TreasuryConfigCore 读取。

需要设置：
- **Key**: `"DEPOSIT_VAULT"`
- **Value**: DepositVault 合约地址

```bash
cast send <TREASURY_CONFIG_CORE_ADDRESS> \
  "setConfig(string,address)" \
  "DEPOSIT_VAULT" \
  <DEPOSIT_VAULT_ADDRESS> \
  --rpc-url https://bsc-dataseed1.binance.org \
  --private-key <PRIVATE_KEY>
```

## 步骤 3: 配置前端环境变量

在 `p2pswap/frontend/.env.local` 中配置：

```bash
# Wallet SDK URL（必需）
NEXT_PUBLIC_WALLET_SDK_URL=https://wallet.enclave-hq.com

# DepositVault 地址（方式1：推荐）⭐
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x339c124657A596D07df326ff0dA186453717763B

# 或者使用通用配置
# NEXT_PUBLIC_DEPOSIT_VAULT_ADDRESS=0x339c124657A596D07df326ff0dA186453717763B

# 如果使用方式3（TreasuryConfigCore），才需要配置这个
# NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=<TREASURY_CONFIG_CORE_ADDRESS>

# TRON Energy 配置（如果使用 TRON）
# NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY=...
```

## 步骤 4: 验证部署

### 4.1 验证合约部署

使用现有的测试脚本：

```bash
cd /Users/qizhongzhu/enclave/preworker/contracts

# 测试 BSC 部署的合约
npm run test:bsc

# 或直接运行测试脚本
PRIVATE_KEY="你的私钥" node script/testDepositVaultBSC.cjs
```

测试脚本会验证：
- ✅ 合约配置
- ✅ Deposit 功能
- ✅ Claim 功能
- ✅ 查询功能

详细测试说明见：[contracts/script/README.md](../contracts/script/README.md)

### 4.2 验证前端连接

1. 启动前端：
```bash
cd ../p2pswap/frontend
npm install
npm run dev
```

2. 访问 http://localhost:5173/preprocess
3. 连接钱包（BSC 网络）
4. 检查是否能正确读取 DepositVault 地址

## 当前已部署的合约（BSC 主网）

根据 `contracts/deployed/result_bsc.json`：

- **DepositVault**: `0x339c124657A596D07df326ff0dA186453717763B`
- **AAVEv3Delegate**: `0x3557f453C2fBF23287100e17BBeE927C06494170`
- **Owner**: `0xdf9a6C1607fE256053ed0DAa62A3d25D0C7F3A2c`
- **Recovery Delay**: 259200 秒（3 天）

## 更多信息

- **完整部署文档**: [contracts/script/README.md](../contracts/script/README.md)
- **部署脚本说明**: 查看 `contracts/script/` 目录下的各个脚本
- **测试脚本**: `contracts/script/testDepositVaultBSC.cjs` 等

## 注意事项

1. **Gas 费用**: 确保部署账户有足够的 BNB/ETH/TRX
2. **网络**: 确认 RPC_URL 指向正确的网络（主网/测试网）
3. **验证**: 部署后验证合约地址和配置是否正确
4. **私钥安全**: 永远不要将私钥提交到版本控制系统
