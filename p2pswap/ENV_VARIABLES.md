# 环境变量说明

## 关于 NEXT_PUBLIC_WALLET_SDK_URL

**重要说明**：`NEXT_PUBLIC_WALLET_SDK_URL` **不是必需的**，实际上代码中并没有使用这个环境变量。

### 为什么不需要？

1. **Wallet SDK 是 npm 包**：
   - Wallet SDK (`@enclave-hq/wallet-sdk`) 是作为 npm 包直接安装和导入的
   - 代码中：`import { WalletManager } from "@enclave-hq/wallet-sdk"`
   - 不需要通过 URL 远程加载

2. **实际需要的配置**：
   - 如果需要使用 **WalletConnect** 功能，需要配置 `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   - 这是 WalletConnect 的 Project ID，不是 Wallet SDK 的 URL

### 正确的配置

```bash
# ❌ 不需要这个（代码中没有使用）
# NEXT_PUBLIC_WALLET_SDK_URL=https://wallet.enclave-hq.com

# ✅ 如果需要 WalletConnect，配置这个（可选）
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
```

---

## 关于 Treasury 合约地址

### 问题：需要配置 Treasury 合约地址吗？

**答案**：**不一定**，取决于你的配置方式。

### 获取 DepositVault 地址的三种方式

#### 方式 1: 直接配置（推荐，最简单）

```bash
# 直接配置 DepositVault 地址
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...
```

**优点**：
- ✅ 最简单直接
- ✅ 不需要连接钱包
- ✅ 启动即可使用

**不需要** TreasuryConfigCore 配置。

---

#### 方式 2: 从 TreasuryConfigCore 合约读取（回退方案）

```bash
# 配置 TreasuryConfigCore 合约地址
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...
```

**工作原理**：
1. 代码会调用 TreasuryConfigCore 合约
2. 调用 `getAddressConfig('DEPOSIT_VAULT')` 方法
3. 从合约读取 DepositVault 地址

**使用场景**：
- 当环境变量未配置 DepositVault 地址时
- 作为回退方案

**缺点**：
- ⚠️ 需要连接钱包或 SDK
- ⚠️ 需要 RPC 节点可用

---

#### 方式 3: 从 Backend 获取（如果 SDK 支持）

如果 Enclave SDK 支持从 Backend 获取配置：

```bash
# 只需要配置 Backend URL
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**注意**：当前代码中尝试从 SDK 获取，但可能还未完全实现。

---

### NEXT_PUBLIC_TREASURY_CONFIG_CORE_714 的作用

**TreasuryConfigCore** 是一个配置管理合约，用于：
- 存储和管理各种合约地址（如 DepositVault）
- 存储系统配置参数

**数字含义**：
- `714` = BSC 的 SLIP-44 Chain ID
- `60` = Ethereum 的 SLIP-44 Chain ID
- `195` = TRON 的 SLIP-44 Chain ID

**格式**：`NEXT_PUBLIC_TREASURY_CONFIG_CORE_<SLIP44_CHAIN_ID>`

**是否需要配置**：
- ✅ **如果配置了** `NEXT_PUBLIC_DEPOSIT_VAULT_714`：**不需要** TreasuryConfigCore
- ⚠️ **如果没有配置** DepositVault 地址：可以配置 TreasuryConfigCore 作为回退方案

---

## 必需的环境变量

### KeyManager

```bash
# 必需：KeyManager 主种子密钥
MASTER_SEED=your-secure-random-seed-here
```

### Enclave Backend

```bash
# 必需：Enclave Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# 可选：WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

### KeyManager API（前端使用）

```bash
# 必需：KeyManager API 服务地址
NEXT_PUBLIC_KEYMANAGER_API_URL=http://localhost:8080
```

### 合约地址（至少配置一种）

**推荐方式**（直接配置）：
```bash
# 推荐：直接配置 DepositVault 地址
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...   # BSC
NEXT_PUBLIC_DEPOSIT_VAULT_1=0x...     # Ethereum
NEXT_PUBLIC_DEPOSIT_VAULT_195=0x...   # TRON
```

**回退方式**（从合约读取）：
```bash
# 可选：如果需要从合约读取，配置 TreasuryConfigCore
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...   # BSC
```

---

## 可选的环境变量

### WalletConnect（如果需要）

```bash
# 可选：WalletConnect Project ID
# 只有在需要 WalletConnect 功能时才需要配置
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
```

### RPC 节点（可选，有默认值）

```bash
# 这些都有默认值，可以不配置
NEXT_PUBLIC_ETH_RPC=https://eth.llamarpc.com
NEXT_PUBLIC_BSC_RPC=https://bsc-dataseed.binance.org
NEXT_PUBLIC_TRON_QUERY_RPC_URL=https://api.trongrid.io
```

---

## 最小配置示例

对于基本功能，只需要配置：

```bash
# .env
MASTER_SEED=your-secure-random-seed-here
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KEYMANAGER_API_URL=http://localhost:8080
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...   # 至少配置一个链的地址
```

其他配置都有默认值或可选。

---

## 总结

### Wallet SDK

- ❌ **不需要** `NEXT_PUBLIC_WALLET_SDK_URL`（代码中没有使用）
- ✅ **可选** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`（仅在使用 WalletConnect 时需要）

### Treasury 合约地址

- ✅ **推荐**：直接配置 `NEXT_PUBLIC_DEPOSIT_VAULT_714`（最简单）
- ⚠️ **可选**：配置 `NEXT_PUBLIC_TREASURY_CONFIG_CORE_714`（作为回退方案）
- 🔄 **未来**：可能可以从 Backend 获取（如果 SDK 支持）

### 必需配置

1. `MASTER_SEED` - KeyManager 主种子
2. `NEXT_PUBLIC_API_URL` - Enclave Backend
3. `NEXT_PUBLIC_KEYMANAGER_API_URL` - KeyManager API
4. `NEXT_PUBLIC_DEPOSIT_VAULT_*` - 至少配置一个链的 DepositVault 地址
