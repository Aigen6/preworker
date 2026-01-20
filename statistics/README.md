# Pre-processing Pool Statistics Service

定时任务服务，每小时聚合预处理池和 Backend 的统计数据。

## 功能

1. **预处理池数据采集**
   - 从数据库读取 Blockscanner 已扫描并存储的 DepositVault 事件：
     - `Deposited`: 存入事件
     - `Claimed`: 领取事件
     - `Recovered`: 取回事件
   - 数据来源：Blockscanner 通过扫描链上区块，将事件存储到数据库
   - 统计服务直接从数据库查询当前小时的事件进行聚合
   - 每小时执行一次，统计过去1小时的事件数据

2. **Backend 数据采集**
   - 通过 Backend API 获取所有地址的：
     - 存款统计（Checkbooks）
     - 提款统计（Withdraws）
   - 每小时执行一次

3. **数据聚合**
   - 将预处理池数据和 Backend 数据组合成统一的数据表
   - 按池、日期、小时存储统计数据

## 配置

复制 `.env.example` 为 `.env` 并配置：

```bash
# 数据库配置
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=statistics_db

# Backend API 配置
BACKEND_API_URL=http://localhost:8080
BACKEND_API_TOKEN=your_jwt_token_here

# 预处理池配置（3个池）
POOL_1_CHAIN_ID=56
POOL_1_RPC_URL=https://bsc-dataseed1.binance.org
POOL_1_CONTRACT_ADDRESS=0x9d67d8220d0865AAd487A9ADaCA4e7E30F28B1aC

POOL_2_CHAIN_ID=1
POOL_2_RPC_URL=https://eth.llamarpc.com
POOL_2_CONTRACT_ADDRESS=0x...

POOL_3_CHAIN_ID=137
POOL_3_RPC_URL=https://polygon-rpc.com
POOL_3_CONTRACT_ADDRESS=0x...
```

## 安装

```bash
npm install
```

## 运行

### 开发模式

```bash
npm run start:dev
```

### 生产模式

```bash
npm run build
npm run start:prod
```

## 定时任务

服务启动后，会在每小时的第 0 分钟自动执行数据聚合任务。

例如：
- 00:00 - 执行聚合（统计 00:00-00:59 的事件）
- 01:00 - 执行聚合（统计 01:00-01:59 的事件）
- 02:00 - 执行聚合（统计 02:00-02:59 的事件）
- ...

**数据来源说明：**
- 事件数据由 Blockscanner 服务扫描链上区块并存储到数据库
- 统计服务直接从数据库查询指定时间范围内的事件
- 不需要直接连接 RPC 节点，依赖 Blockscanner 的数据
- 确保 Blockscanner 正常运行并持续扫描事件

## API 端点

### GET /statistics/pools

查询统计数据

**查询参数：**
- `chainId` (可选): 过滤特定链
- `startDate` (可选): 开始日期 (YYYY-MM-DD)
- `endDate` (可选): 结束日期 (YYYY-MM-DD)

**示例：**
```bash
curl http://localhost:4000/statistics/pools?chainId=56&startDate=2024-01-01
```

## 数据库表结构

### pool_statistics

存储每小时聚合的统计数据：

- `pool_chain_id`: 链 ID
- `pool_contract_address`: 合约地址
- `pool_name`: 池名称
- `date`: 日期 (YYYY-MM-DD)
- `hour`: 小时 (0-23)
- `deposit_count`: 存入次数
- `total_deposit_amount`: 总存入金额 (wei)
- `claim_count`: 领取次数
- `total_claim_amount`: 总领取金额 (wei)
- `recover_count`: 取回次数
- `total_recover_amount`: 总取回金额 (wei)
- `backend_deposit_count`: Backend 存款次数
- `backend_total_deposit_amount`: Backend 总存款金额 (wei)
- `backend_withdraw_count`: Backend 提款次数
- `backend_total_withdraw_amount`: Backend 总提款金额 (wei)

### deposit_vault_events

存储 Blockscanner 扫描的 DepositVault 事件：

- `chain_id`: 链 ID
- `contract_address`: 合约地址
- `event_type`: 事件类型（Deposited/Claimed/Recovered）
- `block_number`: 区块号
- `transaction_hash`: 交易哈希
- `log_index`: 日志索引
- `block_timestamp`: 区块时间戳
- `depositor`: 存款人地址（Deposited 事件）
- `deposit_id`: 存款 ID
- `token`: 代币地址
- `amount`: 金额（wei）
- `yield_token`: 收益代币地址（Deposited 事件）
- `yield_amount`: 收益代币数量（Deposited 事件）
- `intended_recipient`: 预期接收地址（Deposited 事件）
- `recipient`: 接收地址（Claimed 事件）

## 注意事项

1. **Backend API 认证**
   - 需要配置 `BACKEND_API_TOKEN`（JWT token）
   - 或者确保服务运行在 Backend 的 IP 白名单中

2. **数据库连接**
   - 确保连接到正确的数据库（Blockscanner 存储事件的数据库）
   - 数据库必须包含 `deposit_vault_events` 表
   - 确保 Blockscanner 服务正常运行并持续扫描事件

3. **数据库**
   - 使用 PostgreSQL
   - 开发环境会自动同步表结构
   - 生产环境需要手动管理迁移

4. **时区**
   - 所有时间使用 UTC
   - 日期格式：YYYY-MM-DD

## 开发

### 项目结构

```
src/
├── config/              # 配置
├── database/            # 数据库模块
│   └── entities/        # 实体定义
├── rpc/                 # RPC 服务（获取链上事件）
├── backend/             # Backend API 客户端
├── statistics/          # 统计服务
│   ├── statistics.service.ts
│   ├── statistics.controller.ts
│   └── statistics.scheduler.ts
├── app.module.ts
└── main.ts
```
