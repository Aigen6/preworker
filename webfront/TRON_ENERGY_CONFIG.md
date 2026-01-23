# TRON 能量需求配置说明

## 概述

不同 TRON 操作需要不同的 Energy 和 Bandwidth。可以通过环境变量配置这些值，方便根据不同环境或实际情况调整。

## 配置方式

在 `.env` 或 `.env.local` 文件中添加以下环境变量：

```bash
# ============================================
# TRON 能量需求配置
# ============================================

# 授权操作（Approve）
NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY=65000
NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH=300

# JustLending 存入操作
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY=131000
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH=400

# JustLending 提取操作
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_ENERGY=131000
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_BANDWIDTH=400

# Treasury 存入操作
NEXT_PUBLIC_TRON_ENERGY_TREASURY_DEPOSIT_ENERGY=196500
NEXT_PUBLIC_TRON_ENERGY_TREASURY_DEPOSIT_BANDWIDTH=600

# 默认操作（用于未知操作或通用场景）
NEXT_PUBLIC_TRON_ENERGY_DEFAULT_ENERGY=131000
NEXT_PUBLIC_TRON_ENERGY_DEFAULT_BANDWIDTH=600
```

## 默认值

如果没有配置环境变量，将使用以下默认值：

| 操作类型 | Energy | Bandwidth | 说明 |
|---------|--------|-----------|------|
| `approve` | 65,000 | 300 | Token 授权操作 |
| `justlending-supply` | 131,000 | 400 | JustLending 存入操作 ⚠️ **估算值** |
| `justlending-withdraw` | 131,000 | 400 | JustLending 提取操作 ⚠️ **估算值** |
| `treasury-deposit` | 196,500 | 600 | Treasury 存入操作 |
| `default` | 131,000 | 600 | 默认操作 |

### ⚠️ 重要提示

**JustLending 的能量需求值（131,000）是估算值，并非从实际合约测试中获取。**

建议通过以下方式获取准确值：

1. **查询链上交易**：在 [TronScan](https://tronscan.org/) 上查询实际的 JustLending supply/withdraw 交易，查看 `Energy Used` 字段
2. **实际测试**：进行真实的 JustLending 操作，记录实际消耗的 Energy
3. **查看文档**：查阅 JustLending 官方文档或社区资料中的能量消耗说明

获取准确值后，请在 `.env.local` 中更新配置。

## 使用方法

### 在组件中使用

```typescript
import { TronGasRentalOption } from '@/components/deposit/tron-gas-rental-option'

// 方式 1：使用操作类型（推荐，自动从配置读取）
<TronGasRentalOption
  operationType="approve" // 或 'justlending-supply', 'justlending-withdraw', 'treasury-deposit'
/>

// 方式 2：手动指定能量值（会覆盖配置）
<TronGasRentalOption
  requiredEnergy={131000}
  requiredBandwidth={600}
/>

// 方式 3：多个操作（取最大值）
<TronGasRentalOption
  operationType={['approve', 'treasury-deposit']}
/>
```

### 在代码中使用配置

```typescript
import { getTronEnergyRequirement } from '@/lib/config/tron-energy-requirements'

const requirement = getTronEnergyRequirement('approve')
console.log(`需要 Energy: ${requirement.energy}, Bandwidth: ${requirement.bandwidth}`)
```

## 配置优先级

1. **手动传入的值**（`requiredEnergy` 和 `requiredBandwidth`）- 最高优先级
2. **环境变量配置的值**（如果设置了环境变量）
3. **代码中的默认值**（如果环境变量未设置）

## 更新配置

1. 修改 `.env.local` 文件（推荐，不会被提交到 Git）
2. 或修改 `.env` 文件
3. 重启开发服务器（Next.js 需要重启才能读取新的环境变量）

## 注意事项

- 环境变量必须以 `NEXT_PUBLIC_` 开头才能在浏览器中使用
- 修改环境变量后需要重启 Next.js 开发服务器
- 建议在 `.env.local` 中配置（不会被 Git 提交），在 `.env.example` 中提供示例
