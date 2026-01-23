# 服务启动和测试指南

本文档说明如何启动和测试三个服务：Energy Rental、Statistics 和 WebFront。

## 快速启动摘要

### 必需服务
1. **Backend** (端口 8080) - 主后端服务，WebFront 和 Statistics 都需要
2. **WebFront** (端口 5173) - 前端应用，需要连接 Backend
3. **Statistics** (端口 4000) - 统计服务，需要连接 Backend 和数据库

### 可选服务
- **Energy Rental** (端口 4001) - Energy 租赁服务，独立运行

### 最小配置

**WebFront (.env.local):**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080  # 必需：Backend API
```

**Statistics (.env):**
```bash
DATABASE_HOST=localhost                    # 必需：数据库
DATABASE_PASSWORD=your_password            # 必需：数据库密码
BACKEND_API_URL=http://localhost:8080      # 必需：Backend API
```

**Energy Rental (.env):**
```bash
CATFEE_API_KEY=your_key                    # 必需：CatFee API Key
CATFEE_API_SECRET=your_secret              # 必需：CatFee API Secret
```

## 服务架构

```
┌─────────────┐
│   WebFront  │ (端口 5173)
│  (Next.js)  │
└──────┬──────┘
       │
       ├───> Backend API (主后端服务，端口 8080)
       │
       ├───> Statistics Service (端口 4000)
       │
       └───> Energy Rental Service (端口 4001)
```

## 前置要求

### 1. 环境要求

- Node.js >= 20.0.0
- PostgreSQL (Statistics Service 需要)
- Backend 服务运行中（WebFront 和 Statistics 需要）

### 2. 数据库准备（Statistics Service）

```bash
# 创建数据库
createdb statistics_db

# 或者使用 psql
psql -U postgres -c "CREATE DATABASE statistics_db;"
```

## 启动步骤

### 1. Energy Rental Service

#### 配置

```bash
cd preworker/energyrent
cp .env.example .env
```

编辑 `.env` 文件，至少配置 CatFee API：

```bash
# 必需配置
CATFEE_API_KEY=your_catfee_api_key_here
CATFEE_API_SECRET=your_catfee_api_secret_here

# 可选配置
PORT=4001
FRONTEND_URL=http://localhost:5173
```

#### 启动

```bash
# 安装依赖
npm install

# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

服务将在 `http://localhost:4001` 启动。

#### 测试

```bash
# 运行测试脚本
./test-api.sh

# 或手动测试
curl "http://localhost:4001/api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

---

### 2. Statistics Service

#### 配置

```bash
cd preworker/statistics
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# 必需配置 - 数据库
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=statistics_db

# 必需配置 - Backend API
BACKEND_API_URL=http://localhost:8080
BACKEND_API_TOKEN=your_jwt_token_here  # 可选，如果 Backend 需要认证

# 可选配置
PORT=4000
LOG_LEVEL=info
```

#### 启动

```bash
# 安装依赖
npm install

# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

服务将在 `http://localhost:4000` 启动。

#### 测试

```bash
# 运行测试脚本
./test-api.sh

# 或手动测试
curl "http://localhost:4000/statistics/pools"
curl "http://localhost:4000/matching/summary?startDate=2024-01-01&endDate=2024-01-31"
```

---

### 3. WebFront

#### 配置

```bash
cd preworker/webfront
cp env.example .env.local
```

编辑 `.env.local` 文件：

```bash
# Backend API 配置（必需）
# WebFront 通过 SDK 连接 Backend，SDK 会自动从环境变量读取
NEXT_PUBLIC_API_URL=http://localhost:8080  # 或实际的 Backend API 地址

# Energy Rental Service（可选，如果使用 Energy 租赁功能）
NEXT_PUBLIC_ENERGY_RENTAL_API_URL=http://localhost:4001

# Statistics Service（可选，如果使用统计查询功能）
NEXT_PUBLIC_STATISTICS_API_URL=http://localhost:4000

# WalletConnect（可选，用于钱包连接）
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

**重要：** WebFront 主要通过 SDK 连接 Backend，SDK 会使用 `NEXT_PUBLIC_API_URL` 环境变量。

#### 启动

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 或使用 tunnel 模式（如果需要外部访问）
npm run dev:tunnel

# 生产模式
npm run build
npm run start
```

服务将在 `http://localhost:5173` 启动。

#### 测试

1. 打开浏览器访问 `http://localhost:5173`
2. 连接钱包
3. 测试各个功能页面：
   - `/preprocess` - 预处理池操作
   - `/deposit` - 存入操作
   - `/defi` - DeFi 产品
   - `/records` - 交易记录
   - `/statistics` - 统计查询

---

## Backend 连接配置

### WebFront → Backend（必需）

WebFront 通过 **SDK** 连接 Backend，这是**必需**的配置：

```bash
# .env.local 文件
NEXT_PUBLIC_API_URL=http://localhost:8080  # Backend API 地址（必需）
```

**说明：**
- WebFront 的核心功能（存入、提取、查询等）都依赖 Backend API
- SDK 会自动使用 `NEXT_PUBLIC_API_URL` 连接 Backend
- 如果未配置或配置错误，WebFront 的主要功能将无法使用

**WebSocket 连接（可选）：**
```bash
NEXT_PUBLIC_WS_URL=wss://api.enclave-hq.com/ws  # 如果 Backend 支持 WebSocket
```

### Statistics Service → Backend（必需）

Statistics Service 需要调用 Backend API 获取 checkbook 和 withdraw 数据：

```bash
# .env 文件
BACKEND_API_URL=http://localhost:8080          # Backend API 地址（必需）
BACKEND_API_TOKEN=your_jwt_token_here          # JWT Token（可选，如果 Backend 需要认证）
```

**说明：**
- Statistics Service 的匹配分析功能需要从 Backend 获取 checkbook 和 withdraw 数据
- 如果 Backend 不需要认证，可以留空 `BACKEND_API_TOKEN`
- 或者确保 Statistics Service 运行在 Backend 的 IP 白名单中

**Backend API 端点要求：**

**必需端点（用于匹配分析）：**
- `/api/checkbooks` - 获取详细 checkbook 列表（用于匹配分析）✅ **已存在**
  - 支持查询参数：`start_date`, `end_date`, `chain_id`（可选）
  - 需要 JWT 认证
  - 返回格式：`{ success: true, data: [...] }`
- `/api/withdraws` - 获取详细 withdraw 列表（用于匹配分析）❌ **不存在**
  - ⚠️ **问题：** Backend 当前没有提供此端点
  - Backend 只有 `/api/my/withdraw-requests`（需要 JWT 且只能查询自己的）
  - **解决方案：**
    1. Backend 需要添加 `/api/withdraws` 端点（支持 IP 白名单访问）
    2. 或者 Statistics Service 需要调整使用其他方式获取 withdraw 数据

**可选端点（用于每小时统计聚合）：**
- `/api/statistics/checkbooks/daily` - 获取每日 checkbook 统计（可选）
  - 如果 Backend 没有此端点，每小时统计聚合功能会受到影响，但不会完全失败
  - 返回格式：`{ success: true, data: [{ date, deposit_count, total_gross_amount, ... }] }`
- `/api/statistics/withdraws/daily` - 获取每日 withdraw 统计（可选）
  - 如果 Backend 没有此端点，每小时统计聚合功能会受到影响，但不会完全失败
  - 返回格式：`{ success: true, data: [{ date, withdraw_count, total_amount, ... }] }`

**注意：**
- 如果 Backend 没有提供可选的统计端点，Statistics Service 仍然可以正常工作
- 匹配分析功能只需要 `/api/checkbooks` 和 `/api/withdraws` 端点
- 每小时统计聚合功能会受到影响（无法获取 Backend 统计数据），但池统计数据仍然可以正常聚合

### Energy Rental Service

Energy Rental Service **不需要**连接 Backend，它是独立服务，只连接第三方 Energy 租赁服务商。

---

## 完整启动流程

### 0. 启动 Backend（必需）

**重要：** WebFront 和 Statistics Service 都需要 Backend 服务运行。

```bash
# 确保 Backend 服务在 http://localhost:8080 运行
# 具体启动方式请参考 Backend 文档

# 验证 Backend 是否运行
curl http://localhost:8080/health
# 或
curl http://localhost:8080/api/health
```

### 2. 启动 Energy Rental Service

```bash
cd preworker/energyrent
cp .env.example .env
# 编辑 .env，配置 CatFee API Key 和 Secret
npm install
npm run start:dev
```

验证：访问 `http://localhost:4001/api/energy-rental/estimate?provider=catfee&energyAmount=1000`

### 3. 启动 Statistics Service

```bash
cd preworker/statistics
cp .env.example .env
# 编辑 .env，配置数据库和 Backend API
npm install
npm run start:dev
```

验证：访问 `http://localhost:4000/statistics/pools`

### 4. 启动 WebFront

```bash
cd preworker/webfront
cp env.example .env.local
# 编辑 .env.local，配置 Backend API URL
npm install
npm run dev
```

验证：访问 `http://localhost:5173`

---

## 测试检查清单

### Energy Rental Service

- [ ] 服务启动成功：`🚀 Energy Rental Service is running on: http://localhost:4001`
- [ ] 费用估算 API 返回数据：`curl "http://localhost:4001/api/energy-rental/estimate?provider=catfee&energyAmount=1000"`
- [ ] 运行测试脚本：`./test-api.sh`

### Statistics Service

- [ ] 服务启动成功：`🚀 Statistics Service is running on: http://localhost:4000`
- [ ] 数据库连接成功（查看日志）
- [ ] Backend API 连接成功（查看日志）
- [ ] 池统计数据查询：`curl "http://localhost:4000/statistics/pools"`
- [ ] 运行测试脚本：`./test-api.sh`

### WebFront

- [ ] 服务启动成功：访问 `http://localhost:5173` 可以看到页面
- [ ] 钱包连接功能正常
- [ ] SDK 连接 Backend 成功（连接钱包后查看控制台日志）
- [ ] 统计查询页面可以访问：`http://localhost:5173/statistics`

---

## 常见问题

### 1. WebFront 无法连接 Backend

**症状：** 连接钱包后，SDK 连接失败

**解决方案：**
- 检查 `NEXT_PUBLIC_API_URL` 是否正确
- 确认 Backend 服务正在运行
- 检查浏览器控制台的错误信息
- 确认 Backend CORS 配置允许 WebFront 的域名

### 2. Statistics Service 无法连接 Backend

**症状：** 日志显示 Backend API 连接失败

**解决方案：**
- 检查 `BACKEND_API_URL` 是否正确
- 如果 Backend 需要认证，配置 `BACKEND_API_TOKEN`
- 或者将 Statistics Service 的 IP 添加到 Backend 白名单

### 3. Statistics Service 数据库连接失败

**症状：** 启动时显示数据库连接错误

**解决方案：**
- 检查 PostgreSQL 服务是否运行
- 验证数据库连接信息（host, port, username, password）
- 确认数据库已创建：`CREATE DATABASE statistics_db;`

### 4. Energy Rental Service CatFee API 失败

**症状：** 费用估算返回 0 或错误

**解决方案：**
- 检查 `CATFEE_API_KEY` 和 `CATFEE_API_SECRET` 是否正确
- 确认 API Key 已激活
- 查看服务日志了解详细错误

---

## Docker 启动

### Energy Rental Service

```bash
cd preworker/energyrent
docker run -d \
  -p 4001:4001 \
  --env-file .env \
  aigen2025/enclave-energyrent:v1
```

### Statistics Service

```bash
cd preworker/statistics
docker run -d \
  -p 4000:4000 \
  --env-file .env \
  aigen2025/enclave-statistics:v1
```

### WebFront

```bash
cd preworker/webfront
docker run -d \
  -p 5173:3000 \
  --env-file .env.local \
  aigen2025/enclave-webserver:v1
```

---

## 端口总结

| 服务 | 端口 | 用途 |
|------|------|------|
| Backend | 8080 | 主后端服务（必需） |
| Energy Rental | 4001 | Energy/Bandwidth 租赁服务 |
| Statistics | 4000 | 统计和匹配分析服务 |
| WebFront | 5173 | 前端应用 |

---

## 快速测试命令

```bash
# 测试 Energy Rental Service
curl "http://localhost:4001/api/energy-rental/estimate?provider=catfee&energyAmount=1000"

# 测试 Statistics Service
curl "http://localhost:4000/statistics/pools"

# 测试 WebFront（浏览器）
open http://localhost:5173
```
