# 子图同步配置说明

## 概述

子图同步功能用于从 The Graph 子图同步 Treasury 合约的 `DepositReceived` 事件，作为 blockscanner 的补充和验证机制。

## 配置项

### 1. 环境变量配置（子图URL和API Key）

在 `.env` 文件或环境变量中配置各链的子图URL：

```bash
# BSC 链子图配置
SUBGRAPH_URL_BSC=https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/bsc-treasury/v1
SUBGRAPH_API_KEY_BSC=your-bsc-api-key

# Ethereum 链子图配置
SUBGRAPH_URL_ETH=https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/eth-treasury/v1
SUBGRAPH_API_KEY_ETH=your-eth-api-key

# TRON 链子图配置
SUBGRAPH_URL_TRON=https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/tron-treasury/v1
SUBGRAPH_API_KEY_TRON=your-tron-api-key
```

**注意**：
- `SUBGRAPH_API_KEY_*` 是可选的，但强烈推荐配置以避免限流
- 如果不配置 API Key，可能会遇到查询限流问题

### 2. 配置文件设置（同步间隔）

在 `config.yaml` 中添加子图同步配置：

```yaml
subgraph:
  syncInterval: 3  # 同步间隔（分钟），默认3分钟
```

**说明**：
- `syncInterval`: 子图同步的间隔时间（单位：分钟）
- 默认值：3分钟（如果未配置或配置为0）
- 建议值：3-5分钟（根据实际需求调整）

## 工作流程

1. **每N分钟执行一次同步**（N = 配置的 syncInterval，默认3分钟）
2. **获取上次同步位置**：从数据库 `subgraph_sync_states` 表读取
3. **查询子图当前索引位置**：使用 `_meta` 查询获取子图已索引的区块号
4. **查询新事件**：从上次位置到子图当前位置查询 `DepositReceived` 事件
5. **对比数据库**：检查事件是否已存在（通过 `chain_id + transaction_hash + log_index`）
6. **存储缺失事件**：将新事件存储到 `event_deposit_received` 表
7. **通过NATS发送**：使用现有的 `PublishDepositEvent` 方法发送事件
8. **更新同步位置**：更新 `subgraph_sync_states` 表的 `last_synced_block`

## 数据库表

### subgraph_sync_states

记录每条链的子图同步位置：

```sql
CREATE TABLE subgraph_sync_states (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT UNIQUE NOT NULL,
  subgraph_url VARCHAR(255) NOT NULL,
  last_synced_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 优势

1. **双重保障**：blockscanner（实时）+ 子图（验证和补漏）
2. **数据完整性**：即使 blockscanner 故障，子图可以补全缺失事件
3. **无RPC限流**：直接从子图查询，不依赖RPC节点
4. **幂等性**：可以安全地重复执行，不会产生重复数据
5. **多签安全**：多签有UUID去重机制，重复事件会在链上评估失败，不会提交

## 注意事项

1. **首次同步**：首次运行时，如果没有 `last_synced_block`，会从区块0开始查询
2. **子图延迟**：子图有索引延迟（通常几分钟），同步只会查询到子图已索引的位置
3. **NATS失败处理**：即使NATS发送失败，事件已存储到数据库，可以后续恢复
4. **多链支持**：支持BSC、Ethereum、TRON三条链，每条链独立配置和同步

## 监控和日志

同步过程会在日志中输出：

```
🔄 Starting subgraph sync for all chains...
🔗 Syncing chain 714 from subgraph...
📊 Found 5 new events for chain 714
✅ Synced chain 714: 5 new events, synced to block 999950
✅ Subgraph sync completed for all chains
```

如果某个链未配置子图URL，会输出警告：

```
⚠️  Subgraph URL not configured for chain 714, skipping
```

