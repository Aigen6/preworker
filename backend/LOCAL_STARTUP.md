# Backend 本地启动指南

本文档说明如何在本地启动 Backend 服务，包括 NATS 配置。

## 前置要求

### 1. 必需服务

- **PostgreSQL** - 数据库服务
- **NATS Server** - 消息队列服务（用于接收区块链事件）
- **Go 1.23+** - 开发环境

### 2. 可选服务

- **ZKVM Service** - 零知识证明生成服务（如果使用 ZK 功能）
- **Blockscanner** - 区块链事件扫描服务（如果使用 NATS 事件）

---

## 快速启动步骤

### 1. 启动 PostgreSQL

```bash
# macOS
brew services start postgresql

# 或 Ubuntu
sudo systemctl start postgresql

# 验证
pg_isready -h localhost -p 5432
```

### 2. 启动 NATS Server

#### 方式 1：使用 Docker（推荐）

```bash
# 启动 NATS Server（带 JetStream）
docker run -d \
  --name nats-server \
  -p 4222:4222 \
  -p 8222:8222 \
  nats:latest -js

# 验证
curl http://localhost:8222/varz
```

#### 方式 2：本地安装

```bash
# macOS
brew install nats-server

# 启动（带 JetStream）
nats-server -js

# 或后台运行
nats-server -js -D
```

**NATS 端口说明：**
- `4222` - 客户端连接端口（Backend 使用）
- `8222` - HTTP 监控端口（可选）

### 3. 配置 Backend

#### 3.1 复制配置文件

```bash
cd backend
cp env.example .env
cp config.yaml backend-config.yaml  # 如果使用 backend-config.yaml
```

#### 3.2 修改 NATS 配置

编辑 `backend-config.yaml` 或 `config.yaml`：

```yaml
nats:
  url: "nats://localhost:4222"  # 本地开发使用 localhost
  timeout: 30
  reconnect_wait: 2
  max_reconnects: 10
  enable_jetstream: true
```

**重要：**
- 如果 NATS 在 Docker 中运行，使用 `nats://localhost:4222`（Docker 端口映射）
- 如果 NATS 在本地运行，使用 `nats://localhost:4222`
- 如果 NATS 在其他机器，使用 `nats://<ip>:4222`

#### 3.3 配置数据库

编辑 `backend-config.yaml`：

```yaml
database:
  dsn: "host=localhost user=zkpay password=zkpay dbname=zkpay-backend port=5432 sslmode=disable TimeZone=Asia/Shanghai"
```

#### 3.4 配置服务器端口

```yaml
server:
  host: "0.0.0.0"  # 或 "localhost"
  port: 8080       # 默认 3001，但建议使用 8080（与 Statistics Service 配置一致）
```

**注意：** 如果使用默认端口 3001，确保 Statistics Service 配置的 `BACKEND_API_URL` 也使用 3001。

### 4. 启动 Backend

#### 方式 1：使用启动脚本（推荐）

```bash
cd backend
./start-with-backend-config.sh
```

#### 方式 2：手动启动

```bash
cd backend

# 编译
go build -o zkpay-backend ./cmd/server

# 启动（使用 backend-config.yaml）
./zkpay-backend -conf backend-config.yaml

# 或使用默认 config.yaml
./zkpay-backend -conf config.yaml
```

#### 方式 3：开发模式（热重载）

```bash
# 安装 air（Go 热重载工具）
go install github.com/cosmtrek/air@latest

# 启动
air
```

### 5. 验证服务

```bash
# 健康检查
curl http://localhost:8080/health

# 或
curl http://localhost:8080/api/health

# 检查 NATS 连接（查看日志）
tail -f backend.log | grep NATS
```

---

## Cursor 端口映射配置

### 如果使用 Docker Compose

如果项目使用 Docker Compose 管理服务，可以在 `docker-compose.yaml` 中配置端口映射：

```yaml
services:
  nats:
    image: nats:latest
    ports:
      - "4222:4222"  # NATS 客户端端口
      - "8222:8222"  # HTTP 监控端口
    command: ["-js"]  # 启用 JetStream

  backend:
    build: ./backend
    ports:
      - "8080:8080"  # Backend API 端口
    depends_on:
      - nats
      - postgres
    environment:
      - NATS_URL=nats://nats:4222  # Docker 内部使用服务名
```

### 如果使用 Cursor 的端口转发功能

Cursor 可以自动转发端口，但通常不需要特殊配置：

1. **本地服务**：直接使用 `localhost:4222` 和 `localhost:8080`
2. **Docker 服务**：确保 Docker 端口映射正确（`-p 4222:4222`）

### 验证端口映射

```bash
# 检查 NATS 端口
lsof -i :4222

# 检查 Backend 端口
lsof -i :8080

# 测试 NATS 连接
telnet localhost 4222
```

---

## 常见问题

### 1. NATS 连接失败

**错误信息：**
```
❌ Failed to connect to NATS at nats://localhost:4222
```

**解决方案：**
1. 确认 NATS Server 正在运行：
   ```bash
   docker ps | grep nats
   # 或
   lsof -i :4222
   ```

2. 检查 NATS URL 配置：
   ```yaml
   nats:
     url: "nats://localhost:4222"  # 确保使用正确的地址
   ```

3. 如果 NATS 在 Docker 中，确保端口映射正确：
   ```bash
   docker run -d -p 4222:4222 nats:latest -js
   ```

### 2. 数据库连接失败

**错误信息：**
```
failed to connect to database
```

**解决方案：**
1. 确认 PostgreSQL 正在运行：
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. 检查数据库配置：
   ```yaml
   database:
     dsn: "host=localhost user=zkpay password=zkpay dbname=zkpay-backend port=5432 sslmode=disable"
   ```

3. 创建数据库（如果不存在）：
   ```bash
   createdb -U zkpay zkpay-backend
   ```

### 3. 端口被占用

**错误信息：**
```
bind: address already in use
```

**解决方案：**
```bash
# 查找占用端口的进程
lsof -i :8080

# 停止进程
kill -9 <PID>

# 或修改 Backend 端口
# 在 config.yaml 中修改：
server:
  port: 8081  # 使用其他端口
```

### 4. NATS JetStream 未启用

**错误信息：**
```
JetStream not enabled
```

**解决方案：**
启动 NATS 时添加 `-js` 参数：
```bash
nats-server -js
```

---

## 完整启动流程示例

```bash
# 1. 启动 PostgreSQL
brew services start postgresql

# 2. 启动 NATS（Docker）
docker run -d --name nats-server -p 4222:4222 nats:latest -js

# 3. 配置 Backend
cd backend
cp env.example .env
# 编辑 backend-config.yaml，设置：
#   - nats.url: "nats://localhost:4222"
#   - database.dsn: "host=localhost user=zkpay password=zkpay dbname=zkpay-backend port=5432 sslmode=disable"
#   - server.port: 8080

# 4. 启动 Backend
./start-with-backend-config.sh

# 5. 验证
curl http://localhost:8080/health
```

---

## 开发环境推荐配置

### 最小配置（仅测试 API）

如果只需要测试 API，可以**禁用 NATS**：

```yaml
# 在 config.yaml 中
scanner:
  type: "none"  # 不使用 NATS

# 或注释掉 NATS 配置
# nats:
#   url: "nats://localhost:4222"
```

这样 Backend 可以启动，但不会接收区块链事件。

### 完整配置（包含事件处理）

如果需要完整功能，需要：
1. ✅ NATS Server 运行
2. ✅ Blockscanner 服务运行（发布事件到 NATS）
3. ✅ Backend 连接到 NATS 并订阅事件

---

## 端口总结

| 服务 | 端口 | 说明 |
|------|------|------|
| Backend API | 8080 | HTTP API 服务（默认 3001，建议改为 8080） |
| NATS Client | 4222 | NATS 客户端连接端口 |
| NATS Monitor | 8222 | NATS HTTP 监控端口（可选） |
| PostgreSQL | 5432 | 数据库端口 |

---

## 下一步

启动 Backend 后，可以：

1. **测试 API**：
   ```bash
   curl http://localhost:8080/api/health
   ```

2. **查看日志**：
   ```bash
   tail -f backend.log
   ```

3. **启动其他服务**：
   - Statistics Service（需要 Backend API）
   - Energy Rental Service（独立服务）
   - WebFront（需要 Backend API）

4. **配置 Statistics Service**：
   ```bash
   # 在 preworker/statistics/.env 中
   BACKEND_API_URL=http://localhost:8080
   ```
