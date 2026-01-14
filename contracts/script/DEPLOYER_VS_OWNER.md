# 部署者（Deployer）与所有者（Owner）的关系

## 概述

在部署 DepositVault 合约时，有两个重要的概念需要区分：

1. **部署者（Deployer）**
2. **所有者（Owner）**

## 区别说明

### 部署者（Deployer）

- **定义**: 执行部署交易的地址
- **来源**: 由 `PRIVATE_KEY`（EVM 链）或 `TRON_PRIVATE_KEY`（TRON）对应的地址
- **作用**: 
  - 签名并发送部署交易
  - 支付 Gas 费用（ETH/BNB/TRX）
  - 执行部署操作

### 所有者（Owner）

- **定义**: 合约的管理者地址
- **来源**: 由 `INITIAL_OWNER` 环境变量指定，如果不提供则使用部署者地址
- **作用**:
  - 拥有合约的管理权限
  - 可以调用 `onlyOwner` 修饰的函数
  - 可以转移所有权给其他地址

## 关系

### 情况 1: 部署者 = 所有者（默认）

如果未设置 `INITIAL_OWNER`，部署者地址会自动成为合约所有者。

```bash
# 只设置私钥，不设置 INITIAL_OWNER
export PRIVATE_KEY=<your_private_key>
node script/deployDepositVaultETH.cjs

# 结果：部署者地址 = 所有者地址
```

**适用场景**:
- 个人项目或测试环境
- 部署者就是未来的管理者

### 情况 2: 部署者 ≠ 所有者

如果设置了 `INITIAL_OWNER`，合约的所有权会直接赋予该地址。

```bash
# 设置私钥和所有者地址
export PRIVATE_KEY=<deployer_private_key>
export INITIAL_OWNER=<owner_address>  # 可以是多签钱包地址
node script/deployDepositVaultETH.cjs

# 结果：部署者地址 ≠ 所有者地址
```

**适用场景**:
- 部署后立即转移给多签钱包
- 部署者只是执行部署，实际管理由其他地址负责
- 安全最佳实践：部署者使用临时账户，所有者使用安全的多签钱包

## 示例

### 示例 1: 部署者就是所有者

```bash
# 部署者地址: 0x1234...5678
export PRIVATE_KEY=<deployer_private_key>
# 不设置 INITIAL_OWNER

# 部署后：
# - 部署者: 0x1234...5678
# - 所有者: 0x1234...5678（自动使用部署者地址）
```

### 示例 2: 部署后转移给多签钱包

```bash
# 部署者地址: 0x1234...5678（临时账户）
# 多签钱包地址: 0xABCD...EFGH
export PRIVATE_KEY=<deployer_private_key>
export INITIAL_OWNER=0xABCD...EFGH

# 部署后：
# - 部署者: 0x1234...5678（执行部署）
# - 所有者: 0xABCD...EFGH（拥有管理权限）
```

## 安全建议

### 推荐做法

1. **使用临时部署账户**: 部署者使用临时账户，部署完成后可以丢弃私钥
2. **使用多签钱包作为所有者**: 将合约所有权赋予多签钱包，提高安全性
3. **分离部署和管理**: 部署者只负责部署，所有者负责日常管理

### 不推荐做法

1. **使用主账户部署并作为所有者**: 如果主账户私钥泄露，合约管理权限也会丢失
2. **部署后忘记转移所有权**: 如果部署者账户不再需要，应该转移所有权

## 合约中的所有权

在 `DepositVault.sol` 中，所有者可以：

- 调用 `setLendingDelegate()` - 设置借贷适配器
- 调用 `setLendingTarget()` - 设置借贷池地址
- 调用 `setTokenConfig()` - 配置代币设置
- 调用 `setRecoveryDelay()` - 设置取回时间锁
- 调用 `transferOwnership()` - 转移所有权
- 调用 `emergencyWithdraw()` - 紧急提取（如果实现）

## 总结

- **部署者（Deployer）**: 执行部署的地址，由私钥决定
- **所有者（Owner）**: 合约的管理者，由 `INITIAL_OWNER` 决定（默认使用部署者）
- **关系**: 可以是同一个地址，也可以是不同的地址
- **最佳实践**: 使用临时账户部署，将所有权赋予多签钱包
