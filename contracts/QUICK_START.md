# 快速开始：本地部署和测试

## 一键部署和测试

### 方法 1: 使用一键脚本（推荐）

```bash
# 1. 启动本地节点（Anvil）
anvil

# 2. 在另一个终端，运行一键脚本
cd /Users/qizhongzhu/enclave/preworker/contracts
npm run deploy:test
```

这个脚本会自动：
1. ✅ 编译合约
2. ✅ 部署 Mock 合约和 DepositVault
3. ✅ 测试多接收者流程（地址1存入，分配给地址2/3/4/5，然后各地址提取）

### 方法 2: 分步执行

```bash
# 1. 启动本地节点
anvil

# 2. 编译合约
forge build

# 3. 部署（使用 Anvil 第一个账户）
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
npm run deploy:local

# 4. 测试多接收者流程
npm run test:local
```

## 测试流程说明

测试脚本会执行以下流程：

### 步骤 1: 准备
- 给地址1（存款人）铸造 10000 个测试代币
- 地址1授权给 DepositVault

### 步骤 2: 多接收者存款
- 地址1存入 10000 代币
- 分配给 4 个接收者，每人 2500 代币：
  - 地址2: 2500 tokens
  - 地址3: 2500 tokens
  - 地址4: 2500 tokens
  - 地址5: 2500 tokens

### 步骤 3: 验证
- 验证每个接收者都有可提取的存款
- 检查存款信息正确

### 步骤 4: 提取
- 地址2提取自己的 2500 tokens
- 地址3提取自己的 2500 tokens
- 地址4提取自己的 2500 tokens
- 地址5提取自己的 2500 tokens

### 步骤 5: 验证结果
- 验证每个接收者都收到了 yield token
- 验证存款状态已标记为已使用

## 使用自定义账户

如果你想使用自己的账户：

```bash
export PRIVATE_KEY_1=<address1_private_key>
export PRIVATE_KEY_2=<address2_private_key>
export PRIVATE_KEY_3=<address3_private_key>
export PRIVATE_KEY_4=<address4_private_key>
export PRIVATE_KEY_5=<address5_private_key>
export RPC_URL=http://localhost:8545

npm run test:local
```

## 查看部署信息

部署信息保存在 `deployed/result_local.json`：

```json
{
  "network": "local",
  "chainId": "31337",
  "contracts": {
    "DepositVault": {
      "address": "0x...",
      "defaultLendingDelegate": "0x...",
      "defaultLendingTarget": "0x..."
    },
    "MockERC20": {
      "token": "0x...",
      "yieldToken": "0x..."
    }
  }
}
```

## 手动测试命令

### 使用 cast 工具

```bash
# 从部署信息中获取地址
VAULT_ADDRESS=$(cat deployed/result_local.json | jq -r '.contracts.DepositVault.address')
TOKEN_ADDRESS=$(cat deployed/result_local.json | jq -r '.contracts.MockERC20.token')

# 铸造代币给地址1
cast send $TOKEN_ADDRESS "mint(address,uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  1000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 授权
cast send $TOKEN_ADDRESS "approve(address,uint256)" \
  $VAULT_ADDRESS \
  1000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 多接收者存款（需要构造 RecipientAllocation 数组）
# 注意：cast 命令构造复杂结构可能较困难，建议使用 Node.js 脚本
```

## 故障排除

### 问题：部署失败，提示 "Artifact not found"

**解决**: 运行 `forge build` 编译合约

### 问题：测试失败，提示 "Insufficient balance"

**解决**: 确保 Mock Pool 有足够的 yield token（部署脚本会自动处理）

### 问题：提取失败，提示 "transferFrom failed"

**解决**: 检查 Mock Pool 是否已授权给 DepositVault（部署脚本会自动处理）

## 下一步

- 查看 `LOCAL_DEPLOYMENT.md` 了解详细的部署说明
- 查看 `test/DepositVault.t.sol` 了解 Foundry 测试用例
- 查看 `script/testDepositVaultBSC.cjs` 了解 BSC 主网测试
