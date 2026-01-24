# SQLite3 数据库使用说明

## 概述

项目已从浏览器 localStorage 迁移到 SQLite3 数据库，数据持久化存储在服务器端。

## 数据库位置

数据库文件位置：`/data/p2pswap.db`（项目根目录下的 `data` 文件夹）

## 数据库结构

### 1. `strategies` 表 - 策略信息
- `id` - 策略ID（主键）
- `chain_id` - 链ID
- `plan_id` - 计划ID
- `total_amount` - 总金额
- `total_tasks` - 任务总数
- `generated_at` - 生成时间
- `high_risk_addresses` - 高风险地址列表（JSON）
- `created_at` - 创建时间戳

### 2. `tasks` 表 - 任务信息
- `id` - 任务ID（主键）
- `strategy_id` - 策略ID（外键）
- `plan_id` - 计划ID
- `transaction_id` - 交易ID
- `chain_id` - 链ID
- `type` - 任务类型（deposit/claim/enclave_deposit/enclave_withdraw/normal）
- `title` - 任务标题
- `description` - 任务描述
- `scheduled_time` - 计划执行时间（Unix时间戳）
- `source_address` - 源地址
- `target_address` - 目标地址
- `amount` - 金额
- `chain` - 链名称
- `status` - 状态（pending/ready/in_progress/completed/skipped）
- `completed_at` - 完成时间
- `completed_by` - 完成者
- `notes` - 备注
- `steps` - 步骤列表（JSON）
- `related_task_id` - 关联任务ID
- `deposit_id` - Deposit ID
- `commitment` - Commitment
- `intended_recipients` - 指定接收者（JSON）
- `allocations` - 分配方案（JSON）
- `final_targets` - 最终目标（JSON）
- `is_high_risk` - 是否高风险（0/1）
- `created_at` - 创建时间戳
- `updated_at` - 更新时间戳

### 3. `operation_plans` 表 - 操作计划
- `id` - 计划ID（等于 strategy_id，主键）
- `chain_id` - 链ID
- `plan_id` - 计划ID
- `total_amount` - 总金额
- `total_transactions` - 总交易数
- `source_addresses` - 源地址数量
- `transactions` - 交易列表（JSON）
- `generated_at` - 生成时间
- `strategy_config` - 策略配置（JSON）
- `strategy_validation` - 策略验证结果（JSON）
- `created_at` - 创建时间戳

## API 路由

### `/api/strategies`
- `GET /api/strategies?chainId=714` - 获取策略列表
- `POST /api/strategies` - 创建策略
- `DELETE /api/strategies?strategyId=xxx` - 删除策略

### `/api/tasks`
- `GET /api/tasks?chainId=714&strategyId=xxx` - 获取任务列表
- `POST /api/tasks` - 创建任务（批量）
- `PATCH /api/tasks` - 更新任务
- `DELETE /api/tasks?taskId=xxx` - 删除任务

### `/api/plans`
- `GET /api/plans?strategyId=xxx` - 获取操作计划
- `POST /api/plans` - 创建操作计划
- `DELETE /api/plans?strategyId=xxx` - 删除操作计划

## 使用方式

前端代码已自动使用 API 调用，无需手动调用 localStorage。

### 示例：前端调用

```typescript
import { strategiesAPI, tasksAPI, plansAPI } from '@/lib/api/client'

// 获取策略列表
const strategies = await strategiesAPI.get(714)

// 创建策略
await strategiesAPI.create({
  id: 'strategy_123',
  chainId: 714,
  planId: 'plan_123',
  totalAmount: 10000,
  totalTasks: 10,
  generatedAt: new Date().toISOString(),
  highRiskAddresses: []
})

// 获取任务列表
const tasks = await tasksAPI.get(714)

// 更新任务
await tasksAPI.update('task_123', {
  status: 'completed',
  completedAt: Math.floor(Date.now() / 1000)
})
```

## 数据库初始化

数据库会在首次 API 调用时自动初始化。如果数据库文件不存在，会自动创建。

## 备份和恢复

### 备份数据库
```bash
cp data/p2pswap.db data/p2pswap.db.backup
```

### 恢复数据库
```bash
cp data/p2pswap.db.backup data/p2pswap.db
```

## 注意事项

1. **数据库文件位置**：数据库文件存储在 `data/` 目录下，已添加到 `.gitignore`
2. **并发安全**：better-sqlite3 使用 WAL 模式，支持并发读取
3. **数据迁移**：如果需要从 localStorage 迁移数据，可以编写迁移脚本
4. **性能**：SQLite3 适合中小型数据量，如果数据量很大，建议迁移到 PostgreSQL

## 从 localStorage 迁移数据

如果需要从旧的 localStorage 数据迁移到数据库，可以运行迁移脚本：

```typescript
// 迁移脚本示例
const migrateFromLocalStorage = async () => {
  const chainId = 714
  
  // 读取 localStorage 数据
  const strategies = JSON.parse(localStorage.getItem(`strategies_${chainId}`) || '[]')
  const tasks = JSON.parse(localStorage.getItem(`tasks_${chainId}`) || '[]')
  
  // 导入到数据库
  for (const strategy of strategies) {
    await strategiesAPI.create(strategy)
  }
  
  await tasksAPI.create(tasks)
  
  console.log('迁移完成')
}
```
