# TRON Energy 分析指南

## 分析原则

**只分析代码中可见的操作，不猜测外部合约的消耗**

## DepositVault.deposit 函数代码分析

### 代码中可见的操作（可准确计算）

#### 1. Storage 读取（SLOAD）- 约 1,400 Energy
```solidity
// 第 201 行
address delegate = lendingDelegates[token];        // ~200 Energy
address lendingTarget = lendingTargets[token];      // ~200 Energy

// 第 205, 208 行
delegate = defaultLendingDelegate;                  // ~200 Energy
lendingTarget = defaultLendingTarget;              // ~200 Energy

// 第 219 行
string memory tokenKey = tokenKeys[token];         // ~200 Energy

// 第 196 行
if (amount < minDepositAmount)                      // ~200 Energy

// 第 990 行（如果启用）
delegateWhitelist[delegate]                        // ~200 Energy
delegateWhitelistEnabled                            // ~200 Energy
```

#### 2. Storage 写入（SSTORE）- 约 70,000 Energy
```solidity
// 第 277 行
depositCount++;                                     // ~5,000 Energy (更新)

// 第 279-287 行
deposits[depositId] = DepositInfo({...});          // ~35,000 Energy (结构体，7个字段)

// 第 290 行
depositorDeposits[msg.sender].push(depositId);     // ~15,000 Energy (数组 push)

// 第 291 行
recipientDeposits[intendedRecipient].push(depositId); // ~15,000 Energy (数组 push)
```

#### 3. 事件（LOG）- 约 1,500 Energy
```solidity
// 第 293-301 行
emit Deposited(...);                                // ~1,500 Energy (3个 indexed 参数)
```

#### 4. 其他操作 - 约 600 Energy
- 参数验证、比较、条件判断等

**代码中可见操作总计：约 73,500 Energy**

### 外部合约调用（无法从代码准确计算）

#### 1. ERC20 transferFrom（第 230 行）
```solidity
IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
```
- **消耗**：取决于代币合约实现
- **通常**：20,000-30,000 Energy（标准 TRC20）
- **需要**：查询实际代币合约或测试

#### 2. ERC20 approve（第 237 行）
```solidity
IERC20(token).forceApprove(lendingTarget, amount);
```
- **消耗**：取决于代币合约实现
- **通常**：30,000-50,000 Energy（标准 TRC20）
- **需要**：查询实际代币合约或测试

#### 3. JustLend mint（第 240-250 行，通过 delegatecall）
```solidity
delegate.delegatecall(
    abi.encodeWithSelector(ILendingDelegate.supply.selector, ...)
);
```

在 `JustLendDelegate.supply` 中（第 82 行）：
```solidity
uint256 errorCode = IJToken(jToken).mint(amount);
```

**这是主要的外部调用，无法从代码中准确计算**

JustLend 的 `mint` 函数可能包含：
- `accrueInterest()` - 更新利息指数（大量 storage 读写）
- `transferFrom` - 转账底层资产
- 计算 jToken 数量（基于汇率）
- 更新总供应量和用户余额（storage 写入）
- 发出事件

**根据社区报告**：JustLend mint 通常需要 100,000-300,000 Energy，但实际值可能因：
- 市场状态
- 合约版本
- 是否首次供应
- 利息计算复杂度

**需要实际测试或查询链上交易确定**

## 如何获取准确的 Energy 消耗

### 方法 1：使用 TRON API（推荐）
```typescript
import { estimateDepositEnergy } from '@/lib/utils/tron-energy-estimator'

const result = await estimateDepositEnergy(
  vaultAddress,
  tokenAddress,
  amount,
  recipientAddress
)
// result.energy 是准确的 Energy 需求
```

### 方法 2：查询链上交易
1. 在 TronScan 上找到实际的 deposit 交易
2. 查看 `Energy Used` 字段
3. 记录多个交易，取平均值

### 方法 3：实际测试
1. 在测试网或主网进行小额度测试
2. 记录实际消耗的 Energy
3. 使用该值作为配置

## 代码分析工具使用

### V2 版本（推荐）- 只分析可见操作
```typescript
import { analyzeDepositEnergyV2, printEnergyAnalysisV2 } from '@/lib/utils/tron-energy-code-analyzer-v2'

const analysis = analyzeDepositEnergyV2()
printEnergyAnalysisV2(analysis)

// 输出：
// - 代码中可见操作的总 Energy
// - 外部合约调用列表（标记为需要测试）
// - 警告信息
```

### V1 版本 - 包含估算值
```typescript
import { analyzeDepositEnergy } from '@/lib/utils/tron-energy-code-analyzer'

const analysis = analyzeDepositEnergy(true) // true = 包含外部调用估算
// 注意：外部调用的值是估算值，可能不准确
```

## 总结

| 操作类型 | Energy 消耗 | 来源 |
|---------|------------|------|
| 代码中可见操作 | ~73,500 | 代码分析（准确） |
| ERC20 transferFrom | 20,000-30,000 | 需要测试/查询 |
| ERC20 approve | 30,000-50,000 | 需要测试/查询 |
| JustLend mint | 100,000-300,000+ | **需要实际测试/查询** |
| **总计（估算）** | **~223,500-453,500** | 包含估算值 |

**重要**：
- 代码分析只能给出代码中可见操作的消耗
- 外部合约调用（特别是 JustLend mint）的消耗必须通过实际测试或 API 获取
- 不要依赖估算值，使用 TRON API 或查询链上数据获取准确值
