# TRON Energy 实际测试值

## DepositVault.deposit 函数实际 Energy 消耗

基于链上交易实际测试数据：

### 操作分解（实际测试值）

| 操作 | Energy 消耗 | 说明 |
|------|------------|------|
| **代码可见操作** | ~73,500 | Storage 读写、事件等 |
| **safeTransferFrom** | 64,285 | ERC20 transferFrom（实际测试值） |
| **forceApprove** | 200,000 | ERC20 approve（实际测试值：20万能量） |
| **JustLend mint** | 300,000 | delegatecall supply（实际测试值：30万能量） |
| **总计** | **637,785** | 实际测试总消耗 |

### 详细说明

#### 1. safeTransferFrom (64,285 Energy)
- **位置**：`DepositVault.sol` 第 230 行
- **操作**：`IERC20(token).safeTransferFrom(msg.sender, address(this), amount)`
- **实际测试值**：64,285 Energy
- **说明**：从用户地址转账代币到合约地址

#### 2. forceApprove (200,000 Energy)
- **位置**：`DepositVault.sol` 第 237 行
- **操作**：`IERC20(token).forceApprove(lendingTarget, amount)`
- **实际测试值**：200,000 Energy（20万能量）
- **说明**：批准借贷池使用代币

#### 3. JustLend mint (300,000 Energy)
- **位置**：`DepositVault.sol` 第 240-250 行，通过 `JustLendDelegate.supply` 调用
- **操作**：`IJToken(jToken).mint(amount)`
- **实际测试值**：300,000 Energy（30万能量）
- **说明**：通过 delegatecall 调用 JustLend 的 mint 函数，存入借贷池

#### 4. 代码可见操作 (~73,500 Energy)
- Storage 读取：~1,400 Energy（8 次 SLOAD）
- Storage 写入：~70,000 Energy（结构体 + 数组操作）
- 事件：~1,500 Energy
- 其他：~600 Energy

## 配置建议

### 最小 Energy 需求
```typescript
const MIN_DEPOSIT_ENERGY = 637785 // 实际测试值
```

### 推荐 Energy 配置
```typescript
const RECOMMENDED_DEPOSIT_ENERGY = 700000 // 添加 10% 安全缓冲
```

### feeLimit 配置
```typescript
// 如果 Energy 不足，全部用 TRX 支付
// 637,785 Energy × 420 SUN/Energy = 267,870,000 SUN (267.9 TRX)
// 建议设置 100,000,000 SUN (100 TRX) 作为上限
const FEE_LIMIT = 100_000_000 // 100 TRX
```

## 环境变量配置

```bash
# JustLending 存入操作（基于实际测试值）
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY=637785
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH=400
```

## 费用计算

### 如果 Energy 充足
- 只需要支付 Bandwidth 费用：约 0.002 TRX

### 如果 Energy 不足（全部用 TRX 支付）
- 基于 420 SUN/Energy：637,785 × 420 = 267,870,000 SUN = **267.9 TRX**
- Energy 价格会波动（380-450 SUN/Energy），实际费用可能不同

### 建议
- **提前租赁 Energy**：成本远低于直接用 TRX 支付
- **设置合理的 feeLimit**：100 TRX 作为安全上限

## 数据来源

- **safeTransferFrom**: 链上交易实际测试（64,285 Energy）
- **forceApprove**: 实际测试值（200,000 Energy）
- **JustLend mint**: 实际测试值（300,000 Energy）
- **代码可见操作**: 基于代码分析和 TRON Energy 规则计算

## 注意事项

1. 这些值基于特定测试场景，实际消耗可能因以下因素略有变化：
   - 代币合约实现
   - JustLend 合约版本
   - 市场状态（影响利息计算）
   - 首次供应 vs 后续供应

2. 建议定期验证这些值，特别是在：
   - 合约升级后
   - 网络规则变更后
   - 发现异常消耗时

3. 使用 TRON API (`estimateEnergy`) 可以在发送交易前获取更准确的实时值
