# Delegator（适配器）配置说明

## 什么是 Delegator？

Delegator 是借贷协议的适配器合约，用于：
- **AAVEv3Delegate**: 适配 AAVE V3 协议（Ethereum、BSC、Polygon 等 EVM 链）
- **JustLendDelegate**: 适配 JustLend 协议（TRON 链）

## 部署时的配置

### BSC/Ethereum 部署

```bash
# 方式1: 使用现有的 AAVE Delegator（推荐，节省 Gas）
export AAVE_DELEGATE="0x3557f453C2fBF23287100e17BBeE927C06494170"
npm run deploy:vault:bsc

# 方式2: 自动部署新的 AAVE Delegator（如果不提供 AAVE_DELEGATE）
npm run deploy:vault:bsc
```

### TRON 部署

```bash
# 方式1: 使用现有的 JustLend Delegator
export JUSTLEND_DELEGATE="T..."
node script/deployDepositVaultTRON.cjs --delegate=T...

# 方式2: 自动部署新的 JustLend Delegator
node script/deployDepositVaultTRON.cjs
```

## 环境变量说明

### 部署脚本使用的环境变量

| 环境变量 | 链 | 说明 | 必需 |
|---------|-----|------|------|
| `AAVE_DELEGATE` | BSC/Ethereum | AAVE V3 适配器地址 | 否（不提供会自动部署） |
| `JUSTLEND_DELEGATE` | TRON | JustLend 适配器地址 | 否（不提供会自动部署） |

### 当前已部署的 Delegator（BSC 主网）

根据 `contracts/deployed/result_bsc.json`：

- **AAVEv3Delegate**: `0x3557f453C2fBF23287100e17BBeE927C06494170`

## 前端是否需要配置 Delegator？

**不需要！** 

原因：
1. Delegator 地址已经存储在 DepositVault 合约中（`defaultLendingDelegate`）
2. 前端只需要知道 DepositVault 地址即可
3. DepositVault 合约内部会自动使用存储的 Delegator 地址

前端只需要配置：
```bash
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x339c124657A596D07df326ff0dA186453717763B
```

## 如何查看已部署的 Delegator？

### 方法1: 查看部署结果文件

```bash
cat contracts/deployed/result_bsc.json
```

会显示：
```json
{
  "contracts": {
    "DepositVault": {
      "defaultLendingDelegate": "0x3557f453C2fBF23287100e17BBeE927C06494170"
    },
    "AAVEv3Delegate": {
      "address": "0x3557f453C2fBF23287100e17BBeE927C06494170"
    }
  }
}
```

### 方法2: 从链上查询

```bash
# 使用 cast 查询
cast call <DEPOSIT_VAULT_ADDRESS> \
  "defaultLendingDelegate()(address)" \
  --rpc-url https://bsc-dataseed1.binance.org
```

## 使用现有 Delegator 的优势

1. **节省 Gas**: 不需要重复部署相同的适配器
2. **统一管理**: 多个 DepositVault 可以使用同一个 Delegator
3. **已验证**: 已部署的 Delegator 通常已经过验证和测试

## 示例：使用现有 Delegator 部署新的 DepositVault

```bash
cd /Users/qizhongzhu/enclave/preworker/contracts

# 设置环境变量
export PRIVATE_KEY="你的私钥"
export AAVE_DELEGATE="0x3557f453C2fBF23287100e17BBeE927C06494170"  # 使用现有的

# 部署新的 DepositVault（会使用现有的 Delegator）
npm run deploy:vault:bsc
```

部署脚本会检测到 `AAVE_DELEGATE` 环境变量，直接使用该地址，不会部署新的 Delegator。
