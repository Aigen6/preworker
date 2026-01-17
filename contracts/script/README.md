# DepositVault 部署脚本

本目录包含用于在不同链上部署 DepositVault 合约的 JavaScript 脚本。

## 脚本列表

### 1. deployAdapters.cjs
部署借贷适配器（AAVEv3Delegate 和 JustLendDelegate）

### 2. deployDepositVaultETH.cjs
在 Ethereum 主网部署 DepositVault

### 3. deployDepositVaultBSC.cjs
在 BSC 主网部署 DepositVault

### 4. deployDepositVaultTRON.cjs
在 TRON 主网部署 DepositVault

### 5. testDepositVaultBSC.cjs
在 BSC 链上测试已部署的 DepositVault 合约

## 测试脚本

### BSC 链测试

```bash
# 测试已部署的合约
PRIVATE_KEY=你的私钥 node script/testDepositVaultBSC.cjs

# 或使用 npm script
npm run test:bsc
```

**环境变量**:
- `PRIVATE_KEY`: 测试账户私钥（必需，需要有足够的 BNB 和测试代币）
- `RPC_URL`: BSC RPC URL（可选，默认使用公共节点）
- `VAULT_ADDRESS`: DepositVault 合约地址（可选，如果不提供则从 `deployed/result_bsc.json` 读取）
- `TEST_TOKEN`: 测试代币地址（可选，默认使用 BSC USDT: `0x55d398326f99059fF775485246999027B3197955`）

**测试内容**:
1. ✅ 验证合约配置
2. ✅ 检查最小存款金额
3. ✅ 获取 Yield Token 地址
4. ✅ 检查代币余额和授权
5. ✅ 执行 Deposit 操作
6. ✅ 查询存款信息
7. ✅ 查询底层资产数量
8. ✅ 查询可领取的存款
9. ✅ 执行 Claim 操作
10. ✅ 验证重复 Claim 失败
11. ✅ 查询存款 ID 列表和数量

**注意事项**:
- 测试账户需要有足够的 BNB 支付 Gas 费用
- 测试账户需要有足够的测试代币（至少大于最小存款金额）
- 测试会实际执行交易，会消耗 Gas 和代币

## 部署前准备

### 1. 安装依赖

```bash
npm install
# 或
yarn install
```

### 2. 编译合约

```bash
forge build
```

### 3. 环境变量设置

创建 `.env` 文件或设置环境变量：

```bash
# 必需
export PRIVATE_KEY=<your_private_key>
export INITIAL_OWNER=<owner_address>

# EVM 链（ETH/BSC）可选
export RPC_URL=<rpc_url>                    # 可选，有默认值
export AAVE_DELEGATE=<aave_delegate_address>  # 可选，如果不提供会自动部署
export AAVE_POOL=<aave_pool_address>          # 可选，使用默认值

# TRON 链可选
export TRON_PRIVATE_KEY=<tron_private_key>   # 或使用 PRIVATE_KEY
export TRON_FULLNODE=<tron_fullnode_url>    # 可选，默认使用 TronGrid
export TRON_API_KEY=<tron_api_key>          # 可选，TronGrid API Key
export JUSTLEND_DELEGATE=<justlend_delegate_address>  # 可选，如果不提供会自动部署
export DEFAULT_JTOKEN=<default_jtoken_address>        # 可选
export TRON_FEE_LIMIT=300000000             # 可选，默认 300 TRX
```

## 部署步骤

### Ethereum 主网

```bash
# 部署 DepositVault（会自动部署适配器如果未提供）
node script/deployDepositVaultETH.cjs

# 或使用 npm script
npm run deploy:vault:eth
```

### BSC 主网

```bash
# 部署 DepositVault（会自动部署适配器如果未提供）
node script/deployDepositVaultBSC.cjs

# 或使用 npm script
npm run deploy:vault:bsc
```

### TRON 主网

```bash
# 部署 DepositVault（会自动部署适配器如果未提供）
node script/deployDepositVaultTRON.cjs

# 或使用 npm script
npm run deploy:vault:tron
```

### 单独部署适配器

```bash
# 部署 AAVE V3 适配器（EVM 链）
node script/deployAdapters.cjs --network=ethereum
node script/deployAdapters.cjs --network=bsc

# 或使用 npm script
npm run deploy:adapters -- --network=ethereum
```

## 部署后配置

### 1. 配置代币特定设置（可选）

如果某个代币需要使用不同的适配器或借贷池，可以调用：

```solidity
vault.setTokenConfig(
    tokenAddress,      // 代币地址
    delegate,          // 适配器地址
    lendingTarget,     // 借贷池地址（AAVE Pool）或 jToken 地址（JustLend）
    tokenKey           // 代币 key（可选）
);
```

### 2. 验证合约

部署后，使用相应的区块浏览器验证合约：
- Ethereum: Etherscan
- BSC: BscScan
- TRON: TronScan

## 网络配置

### AAVE V3 Pool 地址

- **Ethereum Mainnet**: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`
- **BSC Mainnet**: `0x6807dc923806fE8Fd134338EABCA509979a7e0cB`
- **Polygon**: `0x794a61358D6845594F94dc1DB02A252b5b4814aD`
- **Base**: `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`

### JustLend jToken 地址（TRON）

jToken 地址配置在 `script/config/tron-mainnet.json` 文件中，便于维护和更新。

主要代币的 jToken 地址请参考配置文件，或从 JustLend 官方文档获取最新地址：
- https://justlend.org/
- https://tronscan.org/

## 注意事项

1. **私钥安全**: 永远不要将私钥提交到版本控制系统
2. **Gas 费用**: 确保部署账户有足够的 ETH/BNB/TRX 支付 Gas 费用
3. **验证合约**: 部署后务必在区块浏览器上验证合约代码
4. **编译合约**: 部署前必须先运行 `forge build` 生成编译产物
5. **测试网**: 建议先在测试网上测试部署流程

## 故障排除

### 问题：部署失败，提示 "Artifact not found"

- 运行 `forge build` 编译合约
- 检查 `out/` 目录是否存在编译产物

### 问题：部署失败，提示 "PRIVATE_KEY is required"

- 检查环境变量是否正确设置
- 确认私钥格式正确（不需要 0x 前缀）

### 问题：TRON 部署失败

- 检查 TRON 账户是否有足够的 TRX 和 Energy
- 检查 TRON_FULLNODE URL 是否可访问
- 尝试增加 TRON_FEE_LIMIT

### 问题：Gas 估算失败

- 检查 RPC URL 是否正确
- 检查网络连接
- 尝试使用不同的 RPC 节点
