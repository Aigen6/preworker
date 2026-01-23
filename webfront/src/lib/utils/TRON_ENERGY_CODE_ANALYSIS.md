# TRON Energy 代码分析工具

## 概述

这个工具通过分析 Solidity 代码中的操作类型来估算 Energy 消耗，提供理论上的 Energy 需求估算。

## 使用方法

### 1. 分析 DepositVault.deposit 函数

```typescript
import { analyzeDepositEnergy, printEnergyAnalysis } from '@/lib/utils/tron-energy-code-analyzer'

// 分析 deposit 函数的 Energy 消耗
const analysis = analyzeDepositEnergy(true) // true = 包含 delegatecall supply

// 打印详细报告
printEnergyAnalysis(analysis)

// 获取总 Energy
console.log('总 Energy:', analysis.totalEnergy)
```

### 2. 分析 approve 函数

```typescript
import { analyzeApproveEnergy } from '@/lib/utils/tron-energy-code-analyzer'

// 分析 approve 函数的 Energy 消耗
const analysis = analyzeApproveEnergy('standard') // 'simple' | 'standard' | 'complex'

console.log('总 Energy:', analysis.totalEnergy)
```

### 3. 快速获取估算值

```typescript
import { getCodeBasedEnergyEstimate } from '@/lib/utils/tron-energy-code-analyzer'

// 获取 deposit 的 Energy 估算
const depositEnergy = getCodeBasedEnergyEstimate('deposit', {
  includeDelegatecallSupply: true
})

// 获取 approve 的 Energy 估算
const approveEnergy = getCodeBasedEnergyEstimate('approve', {
  tokenComplexity: 'standard'
})
```

### 4. 在估算工具中使用

```typescript
import { estimateDepositEnergyByCodeAnalysis } from '@/lib/utils/tron-energy-estimator'

// 使用代码分析作为回退方案
const codeBasedEstimate = estimateDepositEnergyByCodeAnalysis()
```

## Energy 消耗规则

基于 TRON 网络的 Energy 消耗规则：

| 操作类型 | Energy 消耗 | 说明 |
|---------|------------|------|
| SLOAD (读取 storage) | ~200 | 每次读取 storage slot |
| SSTORE (首次写入) | ~20,000 | 首次写入 storage slot |
| SSTORE (更新) | ~5,000 | 更新已存在的 storage slot |
| CALL (外部调用) | ~700 + 被调用合约消耗 | 基础消耗 + 被调用合约的消耗 |
| DELEGATECALL | ~700 + 被调用合约消耗 | 基础消耗 + 被调用合约的消耗 |
| LOG (事件) | ~375 + 375 * indexed 数量 + 8 * 数据大小 | 事件发出 |
| 计算操作 | ~1-100 | 算术运算、比较等 |

## DepositVault.deposit 函数分析

### 操作分解

1. **参数验证** (~100 Energy)
   - 地址和金额验证
   - 基本计算

2. **Storage 读取** (~1,400-1,800 Energy)
   - `lendingDelegates[token]` (~200)
   - `lendingTargets[token]` (~200)
   - `tokenKeys[token]` (~200)
   - `defaultLendingDelegate` (~200)
   - `defaultLendingTarget` (~200)
   - `minDepositAmount` (~200)
   - `delegateWhitelist[delegate]` (~200，如果启用)
   - `delegateWhitelistEnabled` (~200，如果启用)

3. **外部调用** (~215,000-265,000 Energy)
   - `safeTransferFrom` (~25,000) - ERC20 transfer
   - `forceApprove` (~40,000) - ERC20 approve
   - `delegatecall supply` (~150,000) - JustLend mint（主要消耗）

4. **Storage 写入** (~70,000 Energy)
   - `depositCount++` (~5,000) - 更新计数器
   - `deposits[depositId]` (~35,000) - 写入结构体（7个字段）
   - `depositorDeposits[msg.sender].push()` (~15,000) - 数组 push
   - `recipientDeposits[intendedRecipient].push()` (~15,000) - 数组 push

5. **事件** (~1,500 Energy)
   - `Deposited` 事件（3个 indexed 参数）

6. **其他操作** (~500 Energy)
   - 算术运算、比较、条件判断

### 总 Energy 估算

- **最小值**: ~287,000 Energy（不包含 delegatecall supply）
- **实际值**: ~837,000 Energy（包含 delegatecall supply，基于实际测试：delegatecall supply 需要 70 万 Energy）
- **建议值**: ~1,000,000 Energy（添加安全缓冲，确保交易成功）

## ERC20 approve 函数分析

### 操作分解

1. **参数验证** (~50 Energy)
2. **Storage 读取** (~200 Energy) - 读取当前 allowance
3. **Storage 写入** (~20,000-50,000 Energy) - 更新 allowance
   - 简单合约: ~20,000
   - 标准合约: ~35,000
   - 复杂合约: ~50,000
4. **事件** (~750 Energy) - Approval 事件
5. **其他操作** (~200 Energy)

### 总 Energy 估算

- **简单合约**: ~21,200 Energy
- **标准合约**: ~36,200 Energy
- **复杂合约**: ~51,200 Energy

## 注意事项

1. **理论估算 vs 实际消耗**
   - 代码分析提供的是理论估算值
   - 实际消耗可能因合约实现、网络状态等因素而有所不同
   - 建议使用 TRON API 获取更准确的值

2. **delegatecall supply 的消耗**
   - 这是 deposit 函数的主要 Energy 消耗
   - **实际测试值：700,000 Energy（70 万）**
   - JustLend 合约的 mint 操作非常复杂，包含大量计算、存储和事件操作
   - 可能包含利息计算、汇率更新、状态同步等复杂逻辑

3. **Storage 写入的消耗**
   - 首次写入和更新写入的消耗不同
   - 数组 push 的消耗取决于数组长度
   - 结构体写入的消耗取决于字段数量

4. **代币合约复杂度**
   - 不同代币合约的 approve 操作消耗可能不同
   - USDT (TRC20) 通常是标准复杂度
   - 复杂合约可能包含额外的检查和逻辑

## 与 API 估算的对比

| 方法 | 优点 | 缺点 |
|------|------|------|
| TRON API | 最准确，基于实际网络状态 | 需要网络调用，可能不可用 |
| 代码分析 | 快速，无需网络调用 | 理论值，可能不够准确 |
| 配置值 | 简单，稳定 | 可能过时，不够灵活 |

## 最佳实践

1. **优先使用 TRON API**
   - 在发送交易前使用 `estimateDepositEnergy` API
   - 获取最准确的 Energy 需求

2. **代码分析作为参考**
   - 用于理解 Energy 消耗的构成
   - 作为 API 不可用时的回退方案

3. **配置值作为最后回退**
   - 如果 API 和代码分析都不可用
   - 使用环境变量或默认值

4. **添加安全缓冲**
   - 无论使用哪种方法，都建议添加 10-20% 的安全缓冲
   - 确保交易不会因为 Energy 不足而失败
