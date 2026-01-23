# 本地节点部署测试指南

## 概述

在本地节点（如 Hardhat、Anvil）上部署和测试 DepositVault 时，需要配置对应的 delegator（适配器）和借贷池。

## 部署步骤

### 1. 启动本地节点

```bash
# 使用 Anvil (Foundry)
anvil

# 或使用 Hardhat
npx hardhat node
```

### 2. 部署适配器（Delegator）

#### 选项 A：部署真实的适配器

```bash
# 部署 AAVEv3Delegate（用于 EVM 链）
forge script script/deployAdapters.cjs --rpc-url http://localhost:8545 --broadcast

# 或使用 Node.js 脚本
RPC_URL=http://localhost:8545 PRIVATE_KEY=<your_private_key> node script/deployAdapters.cjs --network=localhost
```

#### 选项 B：使用 Mock 适配器（推荐用于测试）

在测试环境中，可以使用 `test/mocks/MockLendingDelegate.sol`：

```solidity
// 在测试脚本中部署 MockLendingDelegate
MockLendingDelegate mockDelegate = new MockLendingDelegate();
```

### 3. 部署 DepositVault

#### 使用 Foundry 脚本

```bash
# 设置环境变量
export PRIVATE_KEY=<your_private_key>
export INITIAL_OWNER=<owner_address>
export AAVE_DELEGATE=<delegate_address>  # 步骤2中部署的适配器地址
export AAVE_POOL=<pool_address>          # 本地 Mock Pool 地址或真实地址
export RPC_URL=http://localhost:8545

# 部署
forge script script/DeployDepositVault.s.sol --rpc-url http://localhost:8545 --broadcast
```

#### 使用 Node.js 脚本

```bash
# 修改 deployDepositVaultBSC.cjs 或创建本地版本
RPC_URL=http://localhost:8545 \
PRIVATE_KEY=<your_private_key> \
INITIAL_OWNER=<owner_address> \
AAVE_DELEGATE=<delegate_address> \
AAVE_POOL=<pool_address> \
node script/deployDepositVaultBSC.cjs
```

### 4. 配置代币设置（可选）

部署后，如果需要为特定代币配置不同的适配器或借贷池：

```solidity
// 通过 owner 调用
vault.setTokenConfig(
    tokenAddress,      // 代币地址
    delegate,          // 适配器地址
    lendingTarget,     // 借贷池地址
    tokenKey           // 代币 key（如 "USDT"）
);
```

## 本地测试配置示例

### 使用 Anvil（Foundry）

```bash
# 1. 启动 Anvil
anvil

# 2. 在另一个终端部署适配器
forge script script/DeployAdapters.s.sol --rpc-url http://localhost:8545 --broadcast

# 3. 部署 DepositVault
forge script script/DeployDepositVault.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --constructor-args <owner> <delegate> <pool>

# 4. 运行测试
forge test --fork-url http://localhost:8545
```

### 使用 Hardhat

```bash
# 1. 启动 Hardhat 节点
npx hardhat node

# 2. 部署适配器（需要创建 Hardhat 部署脚本）
npx hardhat run scripts/deploy-adapter.js --network localhost

# 3. 部署 DepositVault
npx hardhat run scripts/deploy-vault.js --network localhost

# 4. 运行测试
npx hardhat test
```

## 必需配置

### DepositVault 构造函数参数

```solidity
constructor(
    address _initialOwner,           // 初始所有者（multisig 或测试地址）
    address _defaultLendingDelegate, // 默认适配器地址（AAVEv3Delegate 或 JustLendDelegate）
    address _defaultLendingTarget   // 默认借贷池地址（AAVE Pool 或 jToken）
)
```

### 配置映射

DepositVault 使用以下映射来管理配置：

```solidity
mapping(address => address) public lendingDelegates;  // token => delegate
mapping(address => address) public lendingTargets;     // token => lendingTarget
mapping(address => string) public tokenKeys;            // token => tokenKey
```

### 默认配置 vs 代币特定配置

- **默认配置**：如果代币没有特定配置，使用 `defaultLendingDelegate` 和 `defaultLendingTarget`
- **代币特定配置**：可以为每个代币设置不同的适配器和借贷池

## 测试环境配置

### Mock 适配器（推荐）

对于本地测试，建议使用 Mock 适配器：

```solidity
// test/mocks/MockLendingDelegate.sol
contract MockLendingDelegate is ILendingDelegate {
    function supply(...) external returns (uint256 shares) {
        // Mock 实现：直接返回 amount（1:1 比例）
        return amount;
    }
    
    function withdraw(...) external returns (uint256 actualAmount) {
        // Mock 实现：直接返回 amount
        return amount;
    }
    
    function getYieldTokenAddress(...) external pure returns (address) {
        // Mock 实现：返回一个固定的 yield token 地址
        return address(0x1234...);
    }
}
```

### Mock 借贷池

对于本地测试，可以部署一个简单的 Mock 借贷池，或者使用现有的测试网地址。

## 完整测试流程

### 1. 准备环境

```bash
# 启动本地节点
anvil

# 获取测试账户
# Anvil 会输出 10 个测试账户和私钥
```

### 2. 部署适配器

```bash
# 使用第一个测试账户部署
export PRIVATE_KEY=<anvil_account_0_private_key>
export RPC_URL=http://localhost:8545

# 部署 AAVEv3Delegate
forge script script/DeployAdapters.s.sol --rpc-url $RPC_URL --broadcast
```

### 3. 部署 DepositVault

```bash
# 使用部署的适配器地址
export AAVE_DELEGATE=<deployed_delegate_address>
export AAVE_POOL=<mock_pool_address>  # 或使用真实地址

# 部署 DepositVault
forge script script/DeployDepositVault.s.sol \
  --rpc-url $RPC_URL \
  --broadcast \
  --constructor-args \
    $(cast wallet address $PRIVATE_KEY) \
    $AAVE_DELEGATE \
    $AAVE_POOL
```

### 4. 配置代币（如果需要）

```bash
# 使用 cast 或 Hardhat console
cast send <vault_address> \
  "setTokenConfig(address,address,address,string)" \
  <token_address> \
  <delegate_address> \
  <pool_address> \
  "USDT" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

### 5. 运行测试

```bash
# 使用 Foundry 测试
forge test --fork-url $RPC_URL

# 或使用 Node.js 测试脚本
VAULT_ADDRESS=<vault_address> \
RPC_URL=$RPC_URL \
PRIVATE_KEY=<test_account_private_key> \
node script/testDepositVaultBSC.cjs
```

## 常见问题

### Q: 本地节点没有真实的借贷池怎么办？

**A:** 使用 Mock 适配器和 Mock 借贷池，或者使用测试网的借贷池地址。

### Q: 如何测试 JustLend（TRON）？

**A:** TRON 需要特殊的部署脚本，因为使用 TronWeb 而不是 ethers.js。参考 `deployDepositVaultTRON.cjs`。

### Q: 如何验证配置是否正确？

**A:** 调用以下函数验证：

```solidity
// 检查默认配置
vault.defaultLendingDelegate()
vault.defaultLendingTarget()

// 检查代币特定配置
vault.lendingDelegates(tokenAddress)
vault.lendingTargets(tokenAddress)

// 检查 yield token 地址
vault.getYieldTokenAddress(tokenAddress)
```

### Q: 部署后如何更新配置？

**A:** 只有 owner 可以更新配置：

```solidity
// 更新默认适配器
vault.setLendingDelegate(address(0), newDelegate)

// 更新代币特定配置
vault.setTokenConfig(token, delegate, pool, tokenKey)
```

## 快速测试脚本

创建一个简单的测试脚本 `test-local.sh`：

```bash
#!/bin/bash

# 启动 Anvil（后台）
anvil &
ANVIL_PID=$!

# 等待节点启动
sleep 2

# 获取测试账户
PRIVATE_KEY=$(cast wallet import anvil-test-0 --interactive 2>&1 | grep -oP '0x[a-fA-F0-9]{64}')
RPC_URL=http://localhost:8545

# 部署适配器
echo "Deploying adapter..."
DELEGATE_ADDRESS=$(forge script script/DeployAdapters.s.sol --rpc-url $RPC_URL --broadcast -s "run()" | grep -oP '0x[a-fA-F0-9]{40}' | tail -1)

# 部署 DepositVault
echo "Deploying DepositVault..."
VAULT_ADDRESS=$(forge script script/DeployDepositVault.s.sol --rpc-url $RPC_URL --broadcast -s "run()" | grep -oP '0x[a-fA-F0-9]{40}' | tail -1)

echo "Deployment complete!"
echo "Delegate: $DELEGATE_ADDRESS"
echo "Vault: $VAULT_ADDRESS"

# 运行测试
forge test --fork-url $RPC_URL

# 清理
kill $ANVIL_PID
```

## 总结

本地节点测试需要：
1. ✅ 部署适配器（AAVEv3Delegate 或 JustLendDelegate）
2. ✅ 部署 DepositVault，传入适配器地址和借贷池地址
3. ✅ （可选）配置代币特定设置
4. ✅ 运行测试验证功能
