# 匹配分析服务文档

## 功能概述

匹配分析服务用于分析预处理池（DepositVault）和 Backend 之间的数据关联关系，实现以下分析：

1. **预处理池进入的数据** - 从 DepositVault 合约的 `Deposited` 事件
2. **预处理池提取的数据** - 从 DepositVault 合约的 `Claimed` 和 `Recovered` 事件
3. **后端存入的数据** - 从 Backend API 获取的 Checkbook 数据
   - 3.1 **本机服务输入的** - 通过 POST /api/deposit-in-this-server 记录在本机服务中的
   - 3.2 **非本机服务输入的** - 链上查询到的，但本机服务没有记录的
4. **后端提取的数据** - 从 Backend API 获取的 Withdraw 数据
5. **匹配关系** - 哪些后端存入是从预处理池提取的（通过金额、时间、地址匹配），并区分本机和非本机服务输入
6. **跨链提取** - 哪些后端提取是跨链的（executeChainId != payoutChainId）

## API 端点

### 0. 记录本机服务输入的 Deposit

```bash
POST /api/deposit-in-this-server
```

**请求体：**
```json
{
  "chainId": 56,
  "checkbookId": "uuid-of-checkbook",
  "depositTxHash": "0x...",
  "depositAmount": "1000000000000000000",
  "tokenAddress": "0x...",
  "userAddress": "0x...",
  "source": "frontend",
  "metadata": {}
}
```

**返回：**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "chainId": 56,
    "checkbookId": "uuid-of-checkbook",
    ...
  }
}
```

**说明：**
- 前端在调用 Backend 创建 checkbook 后，应调用此接口记录本机服务输入的 deposit
- 这样统计服务可以区分哪些 checkbook 是本机服务输入的，哪些是链上查询到的非本机服务输入的

### 1. 执行匹配分析

```bash
GET /matching/analyze?startDate=2024-01-01&endDate=2024-01-31&chainId=56
```

**参数：**
- `startDate` (必需): 开始日期，格式 YYYY-MM-DD
- `endDate` (必需): 结束日期，格式 YYYY-MM-DD
- `chainId` (可选): 链ID，用于过滤特定链的数据

**返回：**
```json
{
  "poolDeposits": [...],           // 预处理池存入事件
  "poolWithdraws": [...],           // 预处理池提取事件
  "backendDepositsInThisServer": [...],  // 本机服务输入的checkbook
  "backendDepositsNotInThisServer": [...], // 非本机服务输入的checkbook
  "backendDeposits": [...],         // 后端存入数据
  "backendWithdraws": [...],        // 后端提取数据
  "poolToBackendDepositMatches": [  // 匹配关系
    {
      "poolEvent": {...},
      "backendDeposit": {...},
      "confidence": 95,
      "reason": "金额完全匹配, 时间差小于1分钟, 地址匹配",
      "isInThisServer": true  // 是否本机服务输入的
    }
  ],
  "crossChainWithdraws": [          // 跨链提取
    {
      "withdraw": {...},
      "executeChainId": 56,
      "payoutChainId": 1
    }
  ],
  "unmatchedPoolWithdraws": [...],   // 未匹配的预处理池提取
  "unmatchedBackendDeposits": [...] // 未匹配的后端存入
}
```

### 2. 获取匹配分析摘要

```bash
GET /matching/summary?startDate=2024-01-01&endDate=2024-01-31&chainId=56
```

**返回：**
```json
{
  "success": true,
  "summary": {
    "poolDepositsCount": 100,
    "poolWithdrawsCount": 80,
    "backendDepositsCount": 75,
    "backendDepositsInThisServerCount": 50,  // 本机服务输入的
    "backendDepositsNotInThisServerCount": 25,  // 非本机服务输入的
    "backendWithdrawsCount": 60,
    "matchedCount": 65,
    "crossChainWithdrawsCount": 10,
    "unmatchedPoolWithdrawsCount": 15,
    "unmatchedBackendDepositsCount": 10
  },
  "details": {
    "poolToBackendDepositMatches": [...],
    "crossChainWithdraws": [...]
  }
}
```

### 3. 查询已保存的匹配结果

```bash
GET /matching/results?startDate=2024-01-01&endDate=2024-01-31&chainId=56&matchType=pool_to_backend_deposit
```

**参数：**
- `startDate` (可选): 开始日期
- `endDate` (可选): 结束日期
- `chainId` (可选): 链ID
- `matchType` (可选): 匹配类型
  - `pool_deposit` - 预处理池存入
  - `pool_withdraw` - 预处理池提取
  - `backend_deposit` - 后端存入
  - `backend_withdraw` - 后端提取
  - `pool_to_backend_deposit` - 预处理池提取→后端存入匹配
  - `backend_withdraw_cross_chain` - 后端提取跨链

## 匹配算法

### 预处理池提取 → 后端存入匹配

匹配策略基于以下条件：

1. **金额匹配**
   - 允许误差：0.001 ETH/BSC（1000000000000000 wei）
   - 金额差异越小，置信度越高

2. **时间匹配**
   - 预处理池提取时间应该 <= 后端存入时间
   - 时间差应该在 24 小时内
   - 时间差越小，置信度越高

3. **地址匹配**（如果可用）
   - 预处理池提取的接收地址与后端存入的拥有者地址匹配
   - 地址匹配会增加 20% 的置信度

4. **本机服务输入识别**
   - 通过查询 `deposit_in_this_server` 表判断checkbook是否在本机服务中有记录
   - 匹配结果中包含 `isInThisServer` 字段标识

**置信度计算：**
- 基础置信度：100
- 减去金额差异比例
- 减去时间差异比例
- 加上地址匹配奖励（如果匹配）
- 最终置信度范围：0-100
- **只有置信度 >= 50% 的匹配才会被保存**

### 跨链提取识别

如果后端提取的 `executeChainId` 和 `payoutChainId` 不同，则识别为跨链提取。

## 数据库表结构

### matching_analysis

存储匹配分析结果：

- `id`: UUID 主键
- `analysis_date`: 分析日期
- `chain_id`: 链ID
- `pool_event_id`: 预处理池事件ID
- `pool_event_type`: 事件类型（Deposited/Claimed/Recovered）
- `pool_event_tx_hash`: 预处理池交易哈希
- `pool_event_timestamp`: 预处理池事件时间戳
- `pool_event_amount`: 预处理池事件金额
- `pool_event_recipient`: 预处理池事件接收地址
- `backend_deposit_id`: 后端存入ID
- `backend_deposit_tx_hash`: 后端存入交易哈希
- `backend_deposit_timestamp`: 后端存入时间戳
- `backend_deposit_amount`: 后端存入金额
- `backend_deposit_chain_id`: 后端存入链ID
- `backend_withdraw_id`: 后端提取ID
- `backend_withdraw_tx_hash`: 后端提取交易哈希
- `backend_withdraw_timestamp`: 后端提取时间戳
- `backend_withdraw_amount`: 后端提取金额
- `backend_withdraw_execute_chain_id`: 后端提取执行链ID
- `backend_withdraw_payout_chain_id`: 后端提取支付链ID
- `match_type`: 匹配类型
- `is_matched`: 是否匹配成功
- `match_confidence`: 匹配置信度 (0-100)
- `match_reason`: 匹配原因说明
- `is_cross_chain`: 是否跨链
- `created_at`: 创建时间
- `updated_at`: 更新时间

## 使用示例

### 1. 分析特定日期范围的数据

```bash
curl "http://localhost:4000/matching/analyze?startDate=2024-01-01&endDate=2024-01-31"
```

### 2. 分析特定链的数据

```bash
curl "http://localhost:4000/matching/analyze?startDate=2024-01-01&endDate=2024-01-31&chainId=56"
```

### 3. 获取分析摘要

```bash
curl "http://localhost:4000/matching/summary?startDate=2024-01-01&endDate=2024-01-31"
```

### 4. 查询已保存的匹配结果

```bash
# 查询所有匹配关系
curl "http://localhost:4000/matching/results?matchType=pool_to_backend_deposit"

# 查询跨链提取
curl "http://localhost:4000/matching/results?matchType=backend_withdraw_cross_chain"
```

## 注意事项

1. **Backend API 端点**
   - 需要确保 Backend API 提供 `/api/checkbooks` 和 `/api/withdraws` 端点
   - 如果这些端点不存在，服务会返回空数组并记录警告日志

2. **数据时间范围**
   - 所有时间使用 UTC
   - 日期格式：YYYY-MM-DD

3. **匹配精度**
   - 金额匹配允许 0.001 ETH/BSC 的误差
   - 时间匹配允许 24 小时的时间窗口
   - 置信度 >= 50% 的匹配才会被保存

4. **性能考虑**
   - 大量数据匹配可能需要较长时间
   - 建议按日期范围分批分析
   - 匹配结果会保存到数据库，可以后续查询

## 开发

### 项目结构

```
src/
├── matching/
│   ├── matching.service.ts      # 匹配分析服务
│   ├── matching.controller.ts   # 匹配分析控制器
│   └── matching.module.ts        # 匹配分析模块
├── database/
│   └── entities/
│       └── matching-analysis.entity.ts  # 匹配分析实体
└── backend/
    └── backend-api.service.ts    # Backend API 客户端（已扩展）
```
