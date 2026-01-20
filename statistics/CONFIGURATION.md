# Statistics Service 配置说明

## 必需配置

### 1. 数据库配置（必需）

Statistics Service 需要连接到 PostgreSQL 数据库来存储统计数据和匹配分析结果。

```bash
# 数据库连接配置
DATABASE_HOST=localhost              # 数据库主机地址
DATABASE_PORT=5432                   # 数据库端口（默认 5432）
DATABASE_USERNAME=postgres           # 数据库用户名
DATABASE_PASSWORD=your_password      # 数据库密码
DATABASE_NAME=statistics_db          # 数据库名称
```

**注意：**
- 数据库必须包含 `deposit_vault_events` 表（由 Blockscanner 服务创建）
- 数据库会自动创建以下表：
  - `pool_statistics` - 池统计数据
  - `matching_analysis` - 匹配分析结果
  - `deposit_in_this_server` - 本机服务输入的 deposit 记录

### 2. Backend API 配置（必需）

Statistics Service 需要调用 Backend API 获取 checkbook 和 withdraw 数据。

```bash
# Backend API 配置
BACKEND_API_URL=http://localhost:8080        # Backend API 地址
BACKEND_API_TOKEN=your_jwt_token_here        # Backend API JWT Token（可选，如果 Backend 需要认证）
```

**注意：**
- 如果 Backend 不需要认证，可以留空 `BACKEND_API_TOKEN`
- 或者确保 Statistics Service 运行在 Backend 的 IP 白名单中

**Backend API 端点要求：**

**必需端点（用于匹配分析）：**
- `GET /api/checkbooks` - 获取详细 checkbook 列表 ✅ **已存在**
  - 查询参数：`start_date`, `end_date`, `chain_id`（可选）
  - 需要 JWT 认证（配置 `BACKEND_API_TOKEN`）
  - 返回格式：`{ success: true, data: [...] }`
- `GET /api/withdraws` - 获取详细 withdraw 列表 ❌ **不存在**
  - ⚠️ **问题：** Backend 当前没有提供此端点
  - Backend 只有 `/api/my/withdraw-requests`（需要 JWT 且只能查询自己的）
  - **解决方案：**
    1. Backend 需要添加 `/api/withdraws` 端点（支持 IP 白名单或 JWT 访问）
    2. 或者 Statistics Service 需要调整使用其他方式获取 withdraw 数据

**可选端点（用于每小时统计聚合）：**
- `GET /api/statistics/checkbooks/daily` - 获取每日 checkbook 统计（可选）
- `GET /api/statistics/withdraws/daily` - 获取每日 withdraw 统计（可选）

如果 Backend 没有提供可选的统计端点，Statistics Service 仍然可以正常工作，但每小时统计聚合功能会受到影响（无法获取 Backend 统计数据）。

## 可选配置

### 3. 服务端口配置

```bash
PORT=4000                              # 服务端口（默认 4000）
```

### 4. 预处理池配置（可选）

如果启用自动从部署文件加载池配置（默认启用），则不需要手动配置。否则需要手动配置：

```bash
# 预处理池配置（3个池）
POOL_1_CHAIN_ID=56                     # Pool 1 链ID（BSC）
POOL_1_RPC_URL=https://bsc-dataseed1.binance.org
POOL_1_CONTRACT_ADDRESS=0x9d67d8220d0865AAd487A9ADaCA4e7E30F28B1aC

POOL_2_CHAIN_ID=1                      # Pool 2 链ID（Ethereum）
POOL_2_RPC_URL=https://eth.llamarpc.com
POOL_2_CONTRACT_ADDRESS=0x...

POOL_3_CHAIN_ID=137                    # Pool 3 链ID（Polygon）
POOL_3_RPC_URL=https://polygon-rpc.com
POOL_3_CONTRACT_ADDRESS=0x...
```

**注意：**
- 默认会从 `../contracts/deployed/result_*.json` 或 `../webfront/public/deployed/result_*.json` 自动加载池配置
- 如果不需要自动加载，设置 `AUTO_LOAD_POOLS=false`

### 5. 日志级别配置

```bash
LOG_LEVEL=info                         # 日志级别：debug, info, warn, error（默认 info）
```

## 完整配置示例

```bash
# ===== 必需配置 =====
# 数据库配置
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=statistics_db

# Backend API 配置
BACKEND_API_URL=http://localhost:8080
BACKEND_API_TOKEN=your_jwt_token_here

# ===== 可选配置 =====
# 服务端口
PORT=4000

# 日志级别
LOG_LEVEL=info

# 是否从部署文件自动加载池配置（默认 true）
AUTO_LOAD_POOLS=true
```

## 环境变量优先级

1. **环境变量** - 最高优先级
2. **配置文件** - `.env` 文件
3. **默认值** - 代码中的默认值

## 配置验证

启动服务后，检查日志确认配置是否正确：

```bash
npm run start:dev
```

查看日志输出：
- ✅ 数据库连接成功
- ✅ Backend API 连接成功
- ✅ 池配置加载成功
- ✅ 定时任务已启动

## 常见问题

### 1. 数据库连接失败

**错误信息：** `ECONNREFUSED` 或 `password authentication failed`

**解决方案：**
- 检查数据库服务是否运行
- 验证数据库连接信息（host, port, username, password）
- 确保数据库已创建：`CREATE DATABASE statistics_db;`

### 2. Backend API 连接失败

**错误信息：** `ECONNREFUSED` 或 `401 Unauthorized`

**解决方案：**
- 检查 Backend 服务是否运行
- 验证 `BACKEND_API_URL` 是否正确
- 如果 Backend 需要认证，配置 `BACKEND_API_TOKEN`
- 或者将 Statistics Service 的 IP 添加到 Backend 的白名单

### 3. 池配置加载失败

**错误信息：** `未找到部署配置文件` 或 `未找到 chainId 对应的网络名称`

**解决方案：**
- 确保部署文件存在于 `../contracts/deployed/` 或 `../webfront/public/deployed/`
- 或者手动配置池信息（设置 `AUTO_LOAD_POOLS=false` 并配置 `POOL_*_*` 环境变量）

### 4. 定时任务不执行

**检查：**
- 查看日志确认定时任务已启动：`📊 Hourly aggregation scheduled (runs at :00 of every hour)`
- 检查系统时间是否正确（使用 UTC）
- 查看是否有错误日志

## Docker 运行配置

使用 Docker 运行时，通过环境变量传递配置：

```bash
docker run -d \
  -p 4000:4000 \
  -e DATABASE_HOST=your_db_host \
  -e DATABASE_PORT=5432 \
  -e DATABASE_USERNAME=postgres \
  -e DATABASE_PASSWORD=your_password \
  -e DATABASE_NAME=statistics_db \
  -e BACKEND_API_URL=http://your-backend:8080 \
  -e BACKEND_API_TOKEN=your_token \
  aigen2025/enclave-statistics:v1
```

或使用 `.env` 文件：

```bash
docker run -d \
  -p 4000:4000 \
  --env-file .env \
  aigen2025/enclave-statistics:v1
```
