# 预处理功能说明

## 功能概述

预处理功能允许地址A存入借贷池，凭证代币托管在合约中，地址B可以自取。如果地址B输入错误或没来取，地址A可以在时间锁后取回。

## 多链支持

### 前端配置

前端会根据当前连接的链（chainId）自动从 TreasuryConfigCore 读取对应链的 DepositVault 地址。

**环境变量配置**（按链配置）：

```bash
# 通用配置（如果所有链使用相同的 TreasuryConfigCore）
NEXT_PUBLIC_TREASURY_CONFIG_CORE_ADDRESS=0x...

# 或按链配置（推荐）
NEXT_PUBLIC_TREASURY_CONFIG_CORE_60=0x...   # Ethereum (SLIP-44: 60)
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...  # BSC (SLIP-44: 714)
NEXT_PUBLIC_TREASURY_CONFIG_CORE_195=0x...  # TRON (SLIP-44: 195)
NEXT_PUBLIC_TREASURY_CONFIG_CORE_966=0x...   # Polygon (SLIP-44: 966)
```

### 合约配置

每个链需要：
1. 部署 DepositVault 合约
2. 将 DepositVault 地址写入该链的 TreasuryConfigCore 配置（key: "DEPOSIT_VAULT"）
3. 确保借贷池配置已设置（适配器和借贷池地址）

## 使用流程

### 地址A（存入）

1. 访问 `/preprocess` 页面
2. 选择"存入"标签
3. 输入存入金额和预期接收地址B（可选）
4. 授权 Token
5. 存入借贷池

### 地址B（领取）

1. 访问 `/preprocess` 页面
2. 选择"领取"标签
3. 输入地址A和存款ID
4. 查询存款信息
5. 领取凭证代币

### 地址A（取回）

1. 访问 `/preprocess` 页面
2. 选择"取回"标签
3. 选择或输入存款ID
4. 查询存款信息
5. 等待时间锁后取回凭证代币

## 技术实现

- **合约**: 使用 TreasuryConfigCore 获取借贷配置，支持多链
- **适配器模式**: 使用 ILendingDelegate 适配器处理不同链的借贷协议
- **前端**: 根据 chainId 动态获取 DepositVault 地址
