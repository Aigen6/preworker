# TRON Energy API 使用指南

## 概述

本工具提供了使用 TRON 官方 API 来准确计算交易 Energy 消耗的功能，替代之前的估算值。

## 功能

### 1. `estimateDepositEnergy` - 估算 DepositVault.deposit 的 Energy

使用 TRON 官方 API 计算 `DepositVault.deposit` 函数实际需要的 Energy。

```typescript
import { estimateDepositEnergy } from '@/lib/utils/tron-energy-estimator'

// 示例：估算 deposit 操作的 Energy
const result = await estimateDepositEnergy(
  'TYourDepositVaultContractAddress', // DepositVault 合约地址（Base58）
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT 代币地址（Base58）
  '1000000', // 存入金额（字符串，6位精度，表示 1 USDT）
  'TYourIntendedRecipientAddress', // 预期接收地址（Base58）
  'TYourOwnerAddress' // 调用者地址（Base58，可选）
)

console.log('Energy 需求:', result.energy)
console.log('数据来源:', result.source) // 'api' 或 'fallback'
if (result.error) {
  console.warn('警告:', result.error)
}
```

### 2. `estimateApproveEnergyWithAPI` - 使用 API 估算 approve 的 Energy

使用 TRON 官方 API 计算 ERC20 `approve` 函数实际需要的 Energy。

```typescript
import { estimateApproveEnergyWithAPI } from '@/lib/utils/tron-energy-estimator'

// 示例：估算 approve 操作的 Energy
const result = await estimateApproveEnergyWithAPI(
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT 代币地址
  'TYourVaultContractAddress', // 授权给的目标地址
  '1000000000000000000', // 授权金额（字符串）
  'TYourOwnerAddress' // 调用者地址（可选）
)

console.log('Energy 需求:', result.energy)
console.log('数据来源:', result.source)
```

## API 说明

### 返回值类型

```typescript
interface EnergyEstimateResult {
  energy: number        // 估算的 Energy 需求
  bandwidth?: number     // 估算的 Bandwidth 需求（如果可用）
  source: 'api' | 'fallback'  // 数据来源
  error?: string        // 错误信息（如果估算失败）
}
```

### 工作原理

1. **优先使用 `estimateEnergy` API**（如果节点支持）
   - 这是 TRON 官方推荐的新 API
   - 需要节点启用 `vm.estimateEnergy` 配置

2. **回退到 `triggerConstantContract` API**
   - 更广泛支持
   - 返回 `energy_used` 字段

3. **最终回退到配置的估算值**
   - 如果所有 API 都不可用
   - 使用环境变量或代码中的默认值

### 安全缓冲

所有通过 API 获取的 Energy 值都会自动添加 **10% 的安全缓冲**，确保交易不会因为 Energy 不足而失败。

## 使用场景

### 在发送交易前估算

```typescript
// 在调用 deposit 之前估算 Energy
const estimate = await estimateDepositEnergy(
  vaultAddress,
  tokenAddress,
  amount,
  recipientAddress
)

// 根据估算结果设置 feeLimit
const feeLimit = estimate.energy * 420 // 假设 1 Energy = 420 SUN
// 或者使用动态的 energy price

// 发送交易
await contract.deposit(tokenAddress, amount, recipientAddress, {
  feeLimit: feeLimit
})
```

### 在 UI 中显示 Energy 需求

```typescript
const [energyEstimate, setEnergyEstimate] = useState<EnergyEstimateResult | null>(null)

useEffect(() => {
  const fetchEstimate = async () => {
    const result = await estimateDepositEnergy(
      vaultAddress,
      tokenAddress,
      amount,
      recipientAddress
    )
    setEnergyEstimate(result)
  }
  
  if (vaultAddress && tokenAddress && amount && recipientAddress) {
    fetchEstimate()
  }
}, [vaultAddress, tokenAddress, amount, recipientAddress])

// 在 UI 中显示
{energyEstimate && (
  <div>
    <p>需要 Energy: {energyEstimate.energy.toLocaleString()}</p>
    {energyEstimate.source === 'api' && (
      <p className="text-green-500">✓ 使用 API 准确计算</p>
    )}
    {energyEstimate.source === 'fallback' && (
      <p className="text-yellow-500">⚠ 使用估算值（API 不可用）</p>
    )}
  </div>
)}
```

## 注意事项

1. **必须在浏览器环境中使用**
   - 需要 TronWeb 或 TronLink 钱包
   - 不能在服务器端使用

2. **需要钱包连接**
   - 函数会自动尝试获取调用者地址
   - 如果无法获取，会使用回退值

3. **API 可用性**
   - 不是所有 TRON 节点都支持 `estimateEnergy` API
   - 函数会自动回退到其他方法

4. **网络延迟**
   - API 调用需要网络请求
   - 建议添加加载状态和错误处理

5. **地址格式**
   - 所有地址参数都应该是 Base58 格式（TRON 标准格式）
   - 函数内部会自动转换为 hex 格式供 API 使用

## 错误处理

```typescript
const result = await estimateDepositEnergy(...)

if (result.error) {
  // 处理错误
  console.error('估算失败:', result.error)
  // 使用回退值或显示错误信息给用户
}

// 检查数据来源
if (result.source === 'fallback') {
  // 提醒用户这是估算值，可能不准确
  console.warn('使用估算值，建议检查实际消耗')
}
```

## 环境变量配置

如果 API 不可用，函数会使用以下环境变量作为回退值：

```bash
# DepositVault.deposit 操作
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY=131000
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH=400

# Approve 操作
NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY=65000
NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH=300
```

## 最佳实践

1. **在用户输入后立即估算**
   - 提供实时反馈
   - 让用户知道需要多少 Energy

2. **缓存估算结果**
   - 相同参数的估算结果可以缓存
   - 避免重复 API 调用

3. **显示数据来源**
   - 让用户知道是 API 计算还是估算值
   - 提高透明度

4. **处理加载状态**
   - API 调用需要时间
   - 显示加载指示器

5. **提供回退方案**
   - 如果 API 失败，使用配置的估算值
   - 确保功能不会中断
