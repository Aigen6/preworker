# 使用现有 Delegator 在 BSC 上部署 DepositVault

## 概述

如果你已经有部署好的 AAVEv3Delegate 适配器，可以直接使用它来部署新的 DepositVault，无需重新部署适配器。

## 已部署的 Delegator 地址

根据部署记录，BSC 上已部署的 Delegator 地址：

### 从 `deployed/result_bsc.json`
- **AAVEv3Delegate**: `0x3557f453C2fBF23287100e17BBeE927C06494170`
- **AAVE V3 Pool**: `0x6807dc923806fE8Fd134338EABCA509979a7e0cB`

### 从其他配置
- **AAVEv3Delegate (v2)**: `0x692ddc9c96aeDCdb64A637C0095Da8F9F16c0d88`

## 部署步骤

### 1. 验证现有 Delegator 地址

在部署前，建议先验证 Delegator 地址是否有效：

```bash
# 使用 cast 工具验证（需要安装 foundry）
cast call <DELEGATOR_ADDRESS> "getYieldTokenAddress(address,string,address)" \
  <TOKEN_ADDRESS> \
  "" \
  <POOL_ADDRESS> \
  --rpc-url https://bsc-dataseed1.binance.org

# 或使用 Node.js 脚本验证
node -e "
const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const delegate = new ethers.Contract(
  '<DELEGATOR_ADDRESS>',
  ['function getYieldTokenAddress(address,string,address) external view returns (address)'],
  provider
);
delegate.getYieldTokenAddress('<TOKEN_ADDRESS>', '', '<POOL_ADDRESS>')
  .then(addr => console.log('Yield Token:', addr))
  .catch(err => console.error('Error:', err.message));
"
```

### 2. 设置环境变量

```bash
# 必需
export PRIVATE_KEY=<your_private_key>

# 可选：指定初始所有者（如果不设置，将使用部署者地址）
export INITIAL_OWNER=<owner_address>

# 使用现有的 Delegator（必需）
export AAVE_DELEGATE=0x3557f453C2fBF23287100e17BBeE927C06494170

# AAVE Pool 地址（可选，默认使用 BSC 主网地址）
export AAVE_POOL=0x6807dc923806fE8Fd134338EABCA509979a7e0cB

# RPC URL（可选，默认使用公共节点）
export RPC_URL=https://bsc-dataseed1.binance.org
```

### 3. 编译合约

```bash
cd /Users/qizhongzhu/enclave/preworker/contracts
forge build
```

### 4. 部署 DepositVault

```bash
# 使用 Node.js 脚本部署
node script/deployDepositVaultBSC.cjs
```

部署脚本会自动：
- ✅ 检测到 `AAVE_DELEGATE` 环境变量，跳过适配器部署
- ✅ 使用指定的 Delegator 地址部署 DepositVault
- ✅ 验证部署结果
- ✅ 保存部署信息到 `deployed/result_bsc.json`

### 5. 验证部署

部署完成后，脚本会自动验证：
- Owner 地址是否正确
- Default Lending Delegate 是否匹配
- Default Lending Target 是否匹配

你也可以手动验证：

```bash
# 使用 cast 工具
cast call <VAULT_ADDRESS> "owner()" --rpc-url https://bsc-dataseed1.binance.org
cast call <VAULT_ADDRESS> "defaultLendingDelegate()" --rpc-url https://bsc-dataseed1.binance.org
cast call <VAULT_ADDRESS> "defaultLendingTarget()" --rpc-url https://bsc-dataseed1.binance.org
```

## 完整部署命令示例

### 使用已部署的 Delegator

```bash
# 设置环境变量
export PRIVATE_KEY=0x<your_private_key>
export INITIAL_OWNER=0x<multisig_or_owner_address>
export AAVE_DELEGATE=0x3557f453C2fBF23287100e17BBeE927C06494170
export AAVE_POOL=0x6807dc923806fE8Fd134338EABCA509979a7e0cB
export RPC_URL=https://bsc-dataseed1.binance.org

# 编译合约
forge build

# 部署
node script/deployDepositVaultBSC.cjs
```

### 使用不同的 Delegator

如果你想使用另一个 Delegator 地址（例如 v2 版本）：

```bash
export AAVE_DELEGATE=0x692ddc9c96aeDCdb64A637C0095Da8F9F16c0d88
node script/deployDepositVaultBSC.cjs
```

## 部署后配置

### 1. 配置代币特定设置（可选）

如果某个代币需要使用不同的适配器或借贷池：

```bash
# 使用 cast 工具
cast send <VAULT_ADDRESS> \
  "setTokenConfig(address,address,address,string)" \
  <TOKEN_ADDRESS> \
  <DELEGATE_ADDRESS> \
  <POOL_ADDRESS> \
  "USDT" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

### 2. 验证合约

在 BscScan 上验证合约代码：
- 访问: https://bscscan.com/address/<VAULT_ADDRESS>
- 点击 "Contract" → "Verify and Publish"
- 上传源代码并验证

## 部署输出示例

```
====================================
Deploying DepositVault on BSC
====================================
Deployer: 0x...
Initial Owner: 0x...
Balance: 1.5 BNB
Chain ID: 56

Using existing AAVEv3Delegate: 0x3557f453C2fBF23287100e17BBeE927C06494170
AAVE V3 Pool: 0x6807dc923806fE8Fd134338EABCA509979a7e0cB

Deploying DepositVault...
✅ DepositVault deployed: 0x...

====================================
Deployment Complete
====================================
DepositVault Address: 0x...
Owner: 0x...
Default Lending Delegate: 0x3557f453C2fBF23287100e17BBeE927C06494170
Default Lending Target: 0x6807dc923806fE8Fd134338EABCA509979a7e0cB
Recovery Delay: 259200 seconds (3 days)

✅ Deployment info saved to: deployed/result_bsc.json

Next Steps:
1. Configure token-specific settings (if needed):
   vault.setTokenConfig(tokenAddress, delegate, pool, tokenKey)
2. Verify contract on BscScan
```

## 注意事项

1. **Delegator 兼容性**: 确保使用的 Delegator 实现了 `ILendingDelegate` 接口，并且与当前的 DepositVault 版本兼容。

2. **Gas 费用**: 确保部署账户有足够的 BNB 支付 Gas 费用（建议至少 0.1 BNB）。

3. **Owner 地址**: 建议使用多签钱包作为 `INITIAL_OWNER`，而不是个人地址。

4. **验证 Delegator**: 部署前建议先验证 Delegator 地址是否有效，避免部署失败。

5. **网络确认**: 确保 `RPC_URL` 指向正确的网络（主网或测试网）。

## 故障排除

### 问题：部署失败，提示 "Delegate mismatch"

**原因**: Delegator 地址验证失败。

**解决**:
1. 检查 Delegator 地址是否正确
2. 验证 Delegator 是否实现了正确的接口
3. 检查 RPC URL 是否指向正确的网络

### 问题：部署失败，提示 "Artifact not found"

**原因**: 合约未编译。

**解决**:
```bash
forge build
```

### 问题：Gas 估算失败

**原因**: RPC 节点问题或网络连接问题。

**解决**:
1. 检查 RPC URL 是否可访问
2. 尝试使用不同的 RPC 节点
3. 检查网络连接

## 快速参考

```bash
# 一键部署（使用现有 Delegator）
export PRIVATE_KEY=<key> && \
export INITIAL_OWNER=<owner> && \
export AAVE_DELEGATE=0x3557f453C2fBF23287100e17BBeE927C06494170 && \
forge build && \
node script/deployDepositVaultBSC.cjs
```
