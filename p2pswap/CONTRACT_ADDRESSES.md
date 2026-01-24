# 合约地址配置说明

## 获取 DepositVault 地址的优先级

代码中获取 DepositVault 地址有三个优先级（按顺序）：

### 方法 1: 环境变量（推荐，最简单）

```bash
# 直接配置 DepositVault 地址
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...   # BSC
NEXT_PUBLIC_DEPOSIT_VAULT_1=0x...     # Ethereum
NEXT_PUBLIC_DEPOSIT_VAULT_195=0x...  # TRON
```

**优点**：
- ✅ 最简单直接
- ✅ 不需要连接钱包或 SDK
- ✅ 启动时即可使用

**使用场景**：推荐使用这种方式

---

### 方法 2: 部署结果 JSON 文件

从 `result_xxx.json` 部署结果文件中读取。

**使用场景**：如果使用部署脚本，会自动生成这些文件

---

### 方法 3: 从 TreasuryConfigCore 合约读取（回退方案）

如果前两种方法都没有配置，会尝试从 TreasuryConfigCore 合约读取。

**需要配置**：
```bash
# TreasuryConfigCore 合约地址
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...   # BSC
NEXT_PUBLIC_TREASURY_CONFIG_CORE_60=0x...  # Ethereum
NEXT_PUBLIC_TREASURY_CONFIG_CORE_195=0x... # TRON
```

**工作原理**：
1. 使用 TreasuryConfigCore 合约地址
2. 调用合约的 `getAddressConfig('DEPOSIT_VAULT')` 方法
3. 从合约读取 DepositVault 地址

**缺点**：
- ⚠️ 需要连接钱包或 SDK
- ⚠️ 需要 RPC 节点可用
- ⚠️ 需要知道 TreasuryConfigCore 合约地址

**使用场景**：作为回退方案，当环境变量未配置时使用

---

## NEXT_PUBLIC_TREASURY_CONFIG_CORE_714 的作用

### 什么是 TreasuryConfigCore？

TreasuryConfigCore 是一个**配置管理合约**，用于存储和管理各种配置信息，包括：
- DepositVault 地址
- 其他合约地址
- 系统配置参数

### 为什么需要配置它？

**情况 1: 直接配置 DepositVault 地址（推荐）**

```bash
# 如果直接配置了 DepositVault 地址，就不需要 TreasuryConfigCore
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...
```

**情况 2: 从合约读取（回退方案）**

```bash
# 如果没有配置 DepositVault 地址，但配置了 TreasuryConfigCore
# 代码会从合约读取 DepositVault 地址
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...
```

### 数字含义

- `714` = BSC 的 SLIP-44 Chain ID
- `60` = Ethereum 的 SLIP-44 Chain ID  
- `195` = TRON 的 SLIP-44 Chain ID

格式：`NEXT_PUBLIC_TREASURY_CONFIG_CORE_<SLIP44_CHAIN_ID>`

---

## 推荐配置方式

### 方式 1: 直接配置（最简单）

```bash
# .env
# 直接配置 DepositVault 地址，不需要 TreasuryConfigCore
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x339c124657A596D07df326ff0dA186453717763B
NEXT_PUBLIC_DEPOSIT_VAULT_1=0x...
NEXT_PUBLIC_DEPOSIT_VAULT_195=0x...
```

**优点**：
- ✅ 最简单
- ✅ 不需要连接钱包
- ✅ 启动即可使用

---

### 方式 2: 从 Backend 获取（如果 SDK 支持）

如果 Enclave SDK 支持从 Backend 获取配置，可以：

```bash
# 只需要配置 Backend URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# SDK 会自动从 Backend 获取合约地址
```

**注意**：这需要 SDK 支持，当前代码中尝试从 SDK 获取，但可能还未完全实现。

---

### 方式 3: 从 TreasuryConfigCore 读取（回退）

```bash
# 配置 TreasuryConfigCore 地址
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...

# 代码会自动从合约读取 DepositVault 地址
```

**使用场景**：
- 当环境变量未配置时
- 当需要动态获取地址时
- 作为回退方案

---

## 总结

### 问题 1: 需要配置 Treasury 合约地址吗？

**答案**：**不一定**，取决于你的配置方式：

- ✅ **推荐**：直接配置 `NEXT_PUBLIC_DEPOSIT_VAULT_714`，**不需要** TreasuryConfigCore
- ⚠️ **可选**：如果不想直接配置，可以配置 `NEXT_PUBLIC_TREASURY_CONFIG_CORE_714`，代码会从合约读取
- 🔄 **未来**：可能可以从 Backend 获取（如果 SDK 支持）

### 问题 2: NEXT_PUBLIC_TREASURY_CONFIG_CORE_714 是干什么用的？

**答案**：

1. **TreasuryConfigCore** 是一个配置管理合约
2. **作用**：存储和管理各种合约地址（如 DepositVault）
3. **使用场景**：当环境变量未配置 DepositVault 地址时，作为回退方案从合约读取
4. **714** 是 BSC 的 SLIP-44 Chain ID

### 最小配置

对于基本功能，只需要：

```bash
# 方式 1: 直接配置（推荐）
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...

# 或者方式 2: 从合约读取（需要钱包连接）
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...
```

**推荐使用方式 1**，更简单直接。

---

## 代码逻辑

```typescript
// 获取 DepositVault 地址的优先级
async getVaultAddress(chainId: number) {
  // 1. 优先从环境变量读取
  const vaultAddress = process.env[`NEXT_PUBLIC_DEPOSIT_VAULT_${chainId}`]
  if (vaultAddress) return vaultAddress
  
  // 2. 从部署配置文件读取
  const fromConfig = await getDepositVaultAddressFromConfig(chainId)
  if (fromConfig) return fromConfig
  
  // 3. 从 TreasuryConfigCore 合约读取（回退方案）
  const configCoreAddress = process.env[`NEXT_PUBLIC_TREASURY_CONFIG_CORE_${chainId}`]
  if (configCoreAddress) {
    // 调用合约的 getAddressConfig('DEPOSIT_VAULT')
    return await readContract(configCoreAddress, 'getAddressConfig', ['DEPOSIT_VAULT'])
  }
  
  return null
}
```
