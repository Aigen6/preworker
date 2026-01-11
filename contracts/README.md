# PreWorker DepositVault Contracts

Pull模式的凭证代币托管合约，用于地址A存入借贷池后，凭证代币托管在合约中，地址B可以自取。

## 功能特性

- **Pull模式**: 地址B主动领取凭证代币，避免地址错误导致资金丢失
- **安全取回**: 如果地址B输入错误或没来取，地址A可以在时间锁后取回
- **白名单支持**: 可选的地址B白名单验证
- **时间锁**: 可配置的取回时间锁（默认7天）

## 目录结构

```
contracts/
├── src/                    # 合约源码
│   └── DepositVault.sol   # 主合约
├── test/                   # 测试文件
│   └── DepositVault.t.sol
├── script/                 # 部署脚本
│   └── DeployDepositVault.s.sol
├── foundry.toml           # Foundry 配置
├── package.json           # 包管理
└── README.md             # 说明文档
```

## 安装依赖

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge install OpenZeppelin/openzeppelin-contracts-upgradeable
forge install foundry-rs/forge-std
```

## 编译

```bash
forge build
```

## 测试

```bash
forge test
forge test -vvv  # 详细输出
```

## 部署

### 1. 部署 DepositVault（每个链需要单独部署）

```bash
# 设置环境变量
export PRIVATE_KEY=your_private_key
export CONFIG_CORE=0x...  # 该链的 TreasuryConfigCore 地址
export INITIAL_OWNER=0x... # 初始所有者（multisig）

# 部署（例如 BSC 测试网）
forge script script/DeployDepositVault.s.sol --rpc-url bsc_testnet --broadcast -vvvv
```

### 2. 配置 DepositVault 地址到 TreasuryConfigCore

```bash
# 设置环境变量
export PRIVATE_KEY=your_private_key
export TREASURY_CONFIG_CORE=0x...  # TreasuryConfigCore 地址
export DEPOSIT_VAULT=0x...          # 刚部署的 DepositVault 地址

# 配置
forge script script/ConfigureDepositVault.s.sol --rpc-url bsc_testnet --broadcast -vvvv
```

### 3. 确保借贷池配置已设置

在 TreasuryConfigCore 中需要设置（每个链不同）：
- `POOL_DELEGATE_KEY`: 适配器 key（例如: "AAVE_V3_DELEGATE" 或 "JUSTLEND_DELEGATE"）
- `POOL_TARGET_KEY`: 借贷池地址 key（例如: "AAVE_V3_POOL" 或 "JUSTLEND_POOL"）
- 或 `POOL_TARGET_TOKEN_<TOKENKEY>`: Token 特定的借贷池地址

**注意**: 不同链有不同的借贷协议：
- **EVM 链** (Ethereum, BSC, Polygon等): 使用 AAVE V3
- **TRON**: 使用 JustLend

## 使用流程

1. **地址A存入**: 调用 `deposit(token, amount, intendedRecipient)` 存入借贷池
2. **地址B领取**: 地址B调用 `claim(depositor, depositId)` 领取凭证代币
3. **地址A取回**: 如果地址B没来取，地址A在时间锁后调用 `recover(depositId)` 取回

## 合约接口

### deposit
存入借贷池并托管凭证代币

```solidity
function deposit(
    address token,
    uint256 amount,
    address intendedRecipient
) external returns (uint256 depositId)
```

### claim
地址B领取凭证代币

```solidity
function claim(address depositor, uint256 depositId) external
```

### recover
地址A取回凭证代币（需要等待时间锁）

```solidity
function recover(uint256 depositId) external
```

## 安全特性

- ReentrancyGuard: 防止重入攻击
- 时间锁: 防止地址A立即取回，给地址B足够时间
- 白名单: 可选的地址B白名单验证
- SafeERC20: 安全的ERC20转账

## License

MIT
