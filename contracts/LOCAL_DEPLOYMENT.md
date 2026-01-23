# 本地节点部署测试指南

## 概述

在本地节点（Anvil/Hardhat）上部署 DepositVault 进行测试，使用 Mock 适配器和 Mock 借贷池来模拟 AAVE 协议。

## 前置要求

1. **启动本地节点**
   ```bash
   # 使用 Anvil (Foundry)
   anvil
   
   # 或使用 Hardhat
   npx hardhat node
   ```

2. **编译合约**
   ```bash
   cd /Users/qizhongzhu/enclave/preworker/contracts
   forge build
   ```

## 快速部署

### 使用部署脚本

```bash
# 设置环境变量
export PRIVATE_KEY=<your_private_key>  # 可以使用 Anvil 提供的测试账户私钥
export RPC_URL=http://localhost:8545   # 默认值，可选
export INITIAL_OWNER=<owner_address>   # 可选，不设置则使用部署者地址

# 部署
node script/deployLocal.cjs
```

### Anvil 测试账户

如果使用 Anvil，它会自动创建 10 个测试账户。你可以使用第一个账户：

```bash
# 启动 Anvil（会显示测试账户和私钥）
anvil

# 在另一个终端，使用第一个账户的私钥
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
node script/deployLocal.cjs
```

## 部署流程

脚本会自动执行以下步骤：

1. ✅ **部署 Mock ERC20 代币**
   - Mock USDT (6 位精度)
   - Mock Yield Token (aUSDT, 6 位精度)

2. ✅ **部署 Mock 借贷池**
   - 模拟 AAVE Pool
   - 支持存入和提取操作

3. ✅ **部署 Mock 适配器**
   - 模拟 AAVEv3Delegate
   - 配置 token => yieldToken 映射

4. ✅ **部署 DepositVault**
   - 使用 Mock 适配器和 Mock Pool

5. ✅ **配置和授权**
   - 给 Mock Pool 铸造 yield token
   - Mock Pool 授权给 DepositVault

## 部署后测试

### 1. 铸造测试代币

```bash
# 使用 cast 工具（Foundry）
cast send <MOCK_TOKEN_ADDRESS> \
  "mint(address,uint256)" \
  <YOUR_ADDRESS> \
  1000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key <PRIVATE_KEY>
```

### 2. 授权代币给 DepositVault

```bash
cast send <MOCK_TOKEN_ADDRESS> \
  "approve(address,uint256)" \
  <VAULT_ADDRESS> \
  1000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key <PRIVATE_KEY>
```

### 3. 测试存款

```bash
# 单接收者存款
cast send <VAULT_ADDRESS> \
  "deposit(address,uint256,(address,uint256)[])" \
  <MOCK_TOKEN_ADDRESS> \
  1000000000 \
  "[($(cast wallet address <PRIVATE_KEY>),1000000000)]" \
  --rpc-url http://localhost:8545 \
  --private-key <PRIVATE_KEY>
```

### 4. 查询存款信息

```bash
# 查询存款 ID
cast call <VAULT_ADDRESS> \
  "getDepositIds(address)" \
  <YOUR_ADDRESS> \
  --rpc-url http://localhost:8545

# 查询存款详情
cast call <VAULT_ADDRESS> \
  "getDeposit(uint256)" \
  <DEPOSIT_ID> \
  --rpc-url http://localhost:8545
```

### 5. 测试提取

```bash
cast send <VAULT_ADDRESS> \
  "claim(uint256)" \
  <DEPOSIT_ID> \
  --rpc-url http://localhost:8545 \
  --private-key <PRIVATE_KEY>
```

## 使用 Node.js 测试脚本

你也可以使用现有的测试脚本（需要修改为使用本地节点）：

```bash
# 修改 testDepositVaultBSC.cjs 中的 RPC_URL 和代币地址
export RPC_URL=http://localhost:8545
export VAULT_ADDRESS=<deployed_vault_address>
export TEST_TOKEN=<mock_token_address>
export PRIVATE_KEY=<test_account_private_key>

node script/testDepositVaultBSC.cjs
```

## 部署信息

部署完成后，脚本会保存部署信息到 `deployed/result_local.json`：

```json
{
  "network": "local",
  "chainId": "31337",
  "deployer": "0x...",
  "contracts": {
    "DepositVault": {
      "address": "0x...",
      "owner": "0x...",
      "defaultLendingDelegate": "0x...",
      "defaultLendingTarget": "0x..."
    },
    "MockLendingDelegate": {
      "address": "0x..."
    },
    "MockLendingPool": {
      "address": "0x..."
    },
    "MockERC20": {
      "token": "0x...",
      "yieldToken": "0x..."
    }
  }
}
```

## 完整测试流程示例

```bash
# 1. 启动 Anvil
anvil

# 2. 在另一个终端部署
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
node script/deployLocal.cjs

# 3. 从部署输出中获取地址，然后测试
export VAULT_ADDRESS=0x...
export MOCK_TOKEN=0x...

# 4. 铸造代币
cast send $MOCK_TOKEN "mint(address,uint256)" \
  $(cast wallet address $PRIVATE_KEY) \
  1000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY

# 5. 授权
cast send $MOCK_TOKEN "approve(address,uint256)" \
  $VAULT_ADDRESS \
  1000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY

# 6. 存款
cast send $VAULT_ADDRESS \
  "deposit(address,uint256,(address,uint256)[])" \
  $MOCK_TOKEN \
  1000000000 \
  "[($(cast wallet address $PRIVATE_KEY),1000000000)]" \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY
```

## 注意事项

1. **Mock 合约限制**: Mock 适配器和 Pool 是简化版本，仅用于测试基本功能，不包含真实的利率计算、滑点等。

2. **1:1 比例**: Mock 实现使用 1:1 的 underlying token 和 yield token 比例，不反映真实的借贷协议行为。

3. **Gas 费用**: 本地节点通常不需要真实的 Gas 费用，但某些节点（如 Hardhat）可能需要配置。

4. **重置状态**: 每次重启本地节点，所有状态都会重置，需要重新部署。

## 故障排除

### 问题：部署失败，提示 "Artifact not found"

**解决**: 运行 `forge build` 编译合约

### 问题：授权失败

**解决**: 确保 Mock Pool 有足够的 yield token，并且已调用 `approveYieldToken`

### 问题：存款失败，提示 "transferFrom failed"

**解决**: 
1. 检查代币余额是否足够
2. 检查是否已授权给 DepositVault
3. 检查 Mock Pool 是否有足够的 yield token 并已授权给 DepositVault

## 与真实部署的区别

| 项目 | 本地测试 | 真实部署 |
|------|---------|---------|
| 适配器 | MockLendingDelegate | AAVEv3Delegate |
| 借贷池 | MockLendingPool | AAVE V3 Pool |
| 代币 | MockERC20 | 真实 USDT/其他代币 |
| 比例 | 1:1 | 根据协议动态变化 |
| 利率 | 固定 5% | 实时利率 |
| Gas | 免费/极低 | 真实 Gas 费用 |
