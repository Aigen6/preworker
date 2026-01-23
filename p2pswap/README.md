# P2PSwap - 点对点交换预处理系统

独立的预处理功能项目，包含前端和智能合约，无需后端服务。

## 项目结构

```
p2pswap/
├── frontend/           # Next.js 前端应用
│   ├── src/
│   │   ├── app/
│   │   │   └── preprocess/
│   │   ├── components/
│   │   └── lib/
│   └── public/
└── README.md
```

**注意**: 智能合约代码位于 `@enclave/preworker/contracts`，本项目直接引用，不单独维护合约代码。

## 从 preworker 迁移说明

本项目是从 `preworker` 中拆分出来的独立项目，包含：

### 已迁移内容

1. **合约代码** 
   - 合约代码位于 `@enclave/preworker/contracts`
   - 包含 `DepositVault.sol`、适配器、测试和部署脚本
   - 本项目直接引用，不单独维护

2. **前端核心代码** (`frontend/`)
   - `src/app/preprocess/` - 预处理页面
   - `src/lib/hooks/use-deposit-vault.ts` - DepositVault Hook
   - `src/lib/abis/` - 合约 ABI
   - `src/lib/utils/` - 工具函数

### 需要从 webfront 复制的依赖

前端代码依赖以下文件，需要从 `preworker/webfront` 复制：

1. **UI 组件** (`src/components/`)
   - `ui/SvgIcon.tsx`
   - `ui/bottom-sheet.tsx`
   - `ui/address-input.tsx`
   - `deposit/tron-gas-rental-option.tsx`
   - `providers/toast-provider.tsx`

2. **Hooks** (`src/lib/hooks/` 或 `src/hooks/`)
   - `use-wallet-connection.ts`
   - `use-wallet-balance.ts`
   - `use-translation.ts`
   - `use-bottom-sheet.ts`

3. **Stores** (`src/lib/stores/`)
   - `sdk-store.ts`

4. **工具函数** (`src/lib/utils/`)
   - `token-decimals.ts` (包含 `getUSDTDecimals`, `parseUSDTAmount`)

5. **样式和配置**
   - `src/app/globals.css`
   - `tailwind.config.ts`
   - `postcss.config.mjs`

### 快速迁移脚本

可以运行以下命令批量复制依赖文件：

```bash
# 从 webfront 复制必要的依赖文件
cd /Users/qizhongzhu/enclave/preworker

# 复制 UI 组件
cp -r webfront/src/components/ui p2pswap/frontend/src/components/
cp -r webfront/src/components/deposit/tron-gas-rental-option.tsx p2pswap/frontend/src/components/deposit/
cp -r webfront/src/components/providers p2pswap/frontend/src/components/

# 复制 Hooks
cp webfront/src/lib/hooks/use-wallet-connection.ts p2pswap/frontend/src/lib/hooks/
cp webfront/src/lib/hooks/use-wallet-balance.ts p2pswap/frontend/src/lib/hooks/
cp webfront/src/lib/hooks/use-translation.ts p2pswap/frontend/src/lib/hooks/
cp webfront/src/hooks/use-bottom-sheet.ts p2pswap/frontend/src/hooks/

# 复制 Stores
cp webfront/src/lib/stores/sdk-store.ts p2pswap/frontend/src/lib/stores/

# 复制工具函数
cp webfront/src/lib/utils/token-decimals.ts p2pswap/frontend/src/lib/utils/

# 复制样式
cp webfront/src/app/globals.css p2pswap/frontend/src/app/
cp webfront/tailwind.config.ts p2pswap/frontend/
cp webfront/postcss.config.mjs p2pswap/frontend/
```

## 功能特性

- **存入（Deposit）**: 地址A存入 USDT 到借贷池，生成凭证代币
- **领取（Claim）**: 地址B领取凭证代币并自动赎回为 USDT
- **退回（Recover）**: 地址A在时间锁后取回未领取的凭证代币

## 多链支持

- Ethereum
- BSC (Binance Smart Chain)
- TRON

## 快速开始

### ⚠️ 重要：先部署合约

**在运行前端之前，必须先部署合约到 BSC（或其他链）！**

详细部署步骤请参考：[DEPLOYMENT.md](./DEPLOYMENT.md)

### 快速部署（BSC）

使用现有的部署脚本（位于 `@enclave/preworker/contracts/script/`）：

```bash
# 1. 进入合约目录
cd /Users/qizhongzhu/enclave/preworker/contracts

# 2. 编译合约
forge build

# 3. 部署到 BSC（需要设置 PRIVATE_KEY 环境变量）
export PRIVATE_KEY="你的私钥"
npm run deploy:vault:bsc
```

**详细部署说明**: 参考 [contracts/script/README.md](../contracts/script/README.md)

部署完成后：
1. 部署信息会自动保存到 `contracts/deployed/result_bsc.json`
2. 配置前端环境变量（见下方）

### 前端开发

```bash
cd frontend
npm install

# 配置环境变量（.env.local）
cat > .env.local << 'EOF'
NEXT_PUBLIC_WALLET_SDK_URL=https://wallet.enclave-hq.com
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x339c124657A596D07df326ff0dA186453717763B
EOF

npm run dev
```

访问 http://localhost:5173/preprocess

## 技术栈

- **合约**: Foundry (Solidity)
- **前端**: Next.js 16 + React 19 + TypeScript
- **钱包**: @enclave-hq/wallet-sdk（前端）或 ethers.js Signer（脚本）
- **链工具**: @enclave-hq/chain-utils

## 签名方式

- **前端**：使用钱包 SDK
  - 用户钱包：MetaMask、TronLink 等（需要用户交互）
  - 私钥模式：`walletManager.connectWithPrivateKey()`（无需用户交互）✅
- **部署脚本**：使用 Signer（ethers.Wallet，私钥签名）

**钱包 SDK 支持 Signer 模式**！可以使用私钥通过钱包 SDK 连接，无需修改现有代码。

详细说明：
- [SIGNER_MODE.md](./SIGNER_MODE.md) - Signer 模式总览
- [PRIVATE_KEY_USAGE.md](./PRIVATE_KEY_USAGE.md) - 私钥使用指南

## 环境变量

### 前端 (.env.local)

```bash
# 钱包 SDK 配置
NEXT_PUBLIC_WALLET_SDK_URL=...

# TreasuryConfigCore 地址（按链配置）
NEXT_PUBLIC_TREASURY_CONFIG_CORE_60=0x...   # Ethereum
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...   # BSC
NEXT_PUBLIC_TREASURY_CONFIG_CORE_195=0x...   # TRON

# TRON Energy 配置（可选）
NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY=...
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY=...
```

## 部署说明

1. **部署合约**（在 `@enclave/preworker/contracts` 目录）：
   - 部署 DepositVault 合约到目标链
   - 配置 TreasuryConfigCore，设置 `DEPOSIT_VAULT` key

2. **部署前端**（在 `p2pswap/frontend` 目录）：
   - 配置环境变量，指向正确的 TreasuryConfigCore 地址
   - 构建并部署前端应用

## 许可证

MIT
