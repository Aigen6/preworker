# ZKPay Backend Service

A high-performance Go backend service for ZKPay - a zero-knowledge proof based cross-chain payment system. This service provides RESTful APIs and WebSocket connections for managing cryptocurrency deposits, withdrawals, and zero-knowledge proof generation.

## Features

- **Multi-Chain Support**: Support for BSC, TRON, and other EVM-compatible chains
- **Event-Driven Architecture**: Real-time blockchain event processing via NATS
- **WebSocket Push**: Real-time status updates to connected clients
- **Zero-Knowledge Proofs**: Integration with ZKVM for privacy-preserving transactions
- **Key Management**: Support for both direct private keys and KMS (Key Management Service)
- **Database Support**: PostgreSQL and SQLite support with GORM
- **Smart Query System**: Intelligent data retrieval with business logic integration
- **Retry Mechanism**: Automatic retry for failed blockchain transactions
- **Beneficiary Management**: View and manage withdrawals destined to your address
- **Payout Execution**: Request multisig to execute cross-chain payouts via LiFi
- **Timeout Claims**: Claim funds on source chain when payout times out
- **Hook Integration**: Purchase yield-bearing assets (Aave, Compound, etc.) after payout

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     External Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ BlockScanner │  │  ZKVM Service │  │  KMS Service │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                    ZKPay Backend                             │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   API Layer (Gin)                     │  │
│  │  • REST APIs  • WebSocket  • JWT Auth                │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Service Layer                        │  │
│  │  • Event Processor  • Transaction Service            │  │
│  │  • Query Service    • Push Service                   │  │
│  │  • Retry Service    • Key Management                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               Data Layer (GORM)                       │  │
│  │  • PostgreSQL / SQLite                                │  │
│  │  • Transaction Management                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                            ▲
                            │
                    ┌───────┴────────┐
                    │   NATS Events  │
                    │ (from Scanner) │
                    └────────────────┘
```

## Technology Stack

- **Language**: Go 1.23+
- **Web Framework**: Gin
- **Database**: PostgreSQL / SQLite (via GORM)
- **Message Queue**: NATS with JetStream
- **Blockchain**: go-ethereum, ethclient
- **Authentication**: JWT (golang-jwt/jwt)
- **WebSocket**: gorilla/websocket
- **Logging**: logrus
- **Cryptography**: ethereum crypto, golang.org/x/crypto

## Prerequisites

- Go 1.23 or higher
- PostgreSQL 13+ (recommended) or SQLite
- NATS Server with JetStream enabled
- Access to blockchain RPC endpoints (BSC, TRON, etc.)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/enclave-hq/backend.git
cd zkpay-backend
```

### 2. Install Dependencies

```bash
go mod download
```

### 3. Configure the Service

Copy the example configuration and modify it:

```bash
cp env.example .env
cp config.yaml.example config.yaml
```

Edit `config.yaml` with your settings:

```yaml
server:
  host: "localhost"
  port: 3001

database:
  dsn: "host=localhost user=zkpay password=zkpay dbname=zkpay port=5432 sslmode=disable"

nats:
  url: "nats://localhost:4222"
  enable_jetstream: true

blockchain:
  networks:
    bsc:
      chainId: 714
      rpcEndpoints:
        - "https://bsc-dataseed1.binance.org/"
      privateKey: "your_private_key_here"
      contractAddresses:
        zkpay_proxy: "0x..."
```

### 4. Database Setup

For PostgreSQL:

```bash
# Create database
createdb zkpay

# Run migrations
./scripts/run_migration.sh
```

For SQLite (development only):

```bash
# Database will be created automatically
# No additional setup required
```

### 5. Start the Service

```bash
# Development mode
go run cmd/server/main.go -conf config.yaml

# Production mode (build first)
go build -o zkpay-backend ./cmd/server
./zkpay-backend -conf config.yaml
```

The service will start on `http://localhost:3001` (default).

## Docker Deployment

### Build Docker Image

```bash
docker build -t zkpay-backend:latest .
```

### Run with Docker

```bash
docker run -d \
  --name zkpay-backend \
  -p 3001:3001 \
  -v $(pwd)/config.docker.yaml:/root/config.backend.yaml \
  zkpay-backend:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  zkpay-backend:
    image: zkpay-backend:latest
    ports:
      - "3001:3001"
    environment:
      - CONFIG_FILE=/app/config.backend.yaml
    volumes:
      - ./config.docker.yaml:/app/config.backend.yaml
    depends_on:
      - postgres
      - nats
      
  postgres:
    image: postgres:13
    environment:
      POSTGRES_USER: zkpay
      POSTGRES_PASSWORD: zkpay
      POSTGRES_DB: zkpay
    volumes:
      - postgres_data:/var/lib/postgresql/data
      
  nats:
    image: nats:latest
    command: ["-js"]
    ports:
      - "4222:4222"

volumes:
  postgres_data:
```

## API Documentation

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```bash
Authorization: Bearer <your_jwt_token>
```

### Core Endpoints

#### Health Check
```
GET /health
```

#### User Authentication
```
POST /api/auth/register    # Register new user
POST /api/auth/login       # User login
POST /api/auth/refresh     # Refresh token
```

#### Deposit Operations
```
GET  /api/deposits                # List deposits
GET  /api/deposits/:id            # Get deposit details
POST /api/deposits/build          # Build commitment
GET  /api/deposits/pending        # Get pending deposits
```

#### Check Operations
```
GET  /api/checks                  # List checks (commitments)
GET  /api/checks/:id              # Get check details
POST /api/checks/:id/use          # Use a check for withdrawal
```

#### Withdrawal Operations
```
POST /api/withdraw/request        # Request withdrawal
GET  /api/withdraw/status/:id     # Get withdrawal status

# My Withdraw Requests (Owner)
GET    /api/v2/my/withdraw-requests                    # List my withdrawal requests
GET    /api/v2/my/withdraw-requests/:id                # Get specific request
POST   /api/v2/my/withdraw-requests/:id/retry          # Retry failed request
DELETE /api/v2/my/withdraw-requests/:id                # Cancel request

# Beneficiary Withdraw Requests (Recipient)
GET  /api/v2/my/beneficiary-withdraw-requests                           # List requests where I'm beneficiary
POST /api/v2/my/beneficiary-withdraw-requests/:id/request-payout        # Request payout execution
POST /api/v2/my/beneficiary-withdraw-requests/:id/claim-timeout         # Claim timeout on source chain
POST /api/v2/my/beneficiary-withdraw-requests/:id/request-hook          # Purchase yield-bearing assets
POST /api/v2/my/beneficiary-withdraw-requests/:id/withdraw-original-tokens  # Withdraw original tokens (give up Hook)

# Quote & Preview (SDK Support)
POST /api/v2/quote/route-and-fees                                       # Query route, bridge fees, gas estimates
POST /api/v2/quote/hook-asset                                           # Query Hook asset APY, fees, conversion
```

#### WebSocket
```
WS   /ws/status                      # Real-time status updates
```

For detailed API documentation, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

## Configuration

### Environment Variables

- `CONFIG_FILE`: Path to configuration file (default: `config.yaml`)
- `ADMIN_TOTP_SECRET`: (Required) Base32 encoded secret for admin TOTP authentication
- `ADMIN_PASSWORD`: (Required) Password for admin authentication
- `ADMIN_JWT_SECRET`: (Optional) Secret key for signing admin JWT tokens
- `TRUSTED_PROXIES`: (Optional) Comma-separated list of trusted proxy IPs/CIDRs
- `ASSOCIATE_CODE_IP_WHITELIST`: (Optional) Comma-separated list of IPs allowed to call the address association API

### Configuration File Structure

```yaml
server:
  host: string          # Server host
  port: int             # Server port

database:
  dsn: string           # Database connection string

nats:
  url: string           # NATS server URL
  timeout: int          # Connection timeout (seconds)
  enable_jetstream: bool # Enable JetStream

blockchain:
  networks:
    <chain_name>:
      chainId: int                  # Chain ID (SLIP-44)
      rpcEndpoints: []string        # RPC endpoint URLs
      privateKey: string            # Private key (hex)
      usePrivateKey: bool           # Enable direct signing
      kmsEnabled: bool              # Enable KMS signing
      contractAddresses:
        zkpay_proxy: string         # ZKPay proxy address
      tokenBaseFees:                # Token base fees
        <tokenId>: string           
      tokenConfigs:                 # Token configurations
        <tokenId>:
          symbol: string
          decimals: int
          managementDecimals: int

zkvm:
  baseUrl: string       # ZKVM service URL
  timeout: int          # Request timeout (seconds)

kms:
  enabled: bool         # Enable KMS
  baseURL: string       # KMS service URL

logging:
  level: string         # Log level (debug/info/warn/error)
  file: string          # Log file path
  console: bool         # Enable console output
```

## Development

### Project Structure

```
.
├── cmd/
│   └── server/          # Application entry point
│       └── main.go
├── internal/
│   ├── config/          # Configuration management
│   ├── db/              # Database layer
│   ├── handlers/        # HTTP handlers
│   ├── middleware/      # HTTP middleware
│   ├── models/          # Data models
│   ├── router/          # Route definitions
│   ├── services/        # Business logic
│   └── utils/           # Utility functions
├── migrations/          # Database migrations
├── scripts/             # Utility scripts
├── config.yaml          # Configuration file
├── Dockerfile           # Docker build file
├── go.mod               # Go module definition
└── README.md            # This file
```

### Building from Source

```bash
# Standard build
go build -o zkpay-backend ./cmd/server

# Build with CGO (required for PostgreSQL)
CGO_ENABLED=1 go build -o zkpay-backend ./cmd/server

# Cross-platform build (Linux)
GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -o zkpay-backend ./cmd/server
```

### Running Tests

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific test
go test -v ./internal/services/...
```

### Code Style

This project follows standard Go conventions:

- Use `gofmt` for formatting
- Use `golint` for linting
- Follow [Effective Go](https://golang.org/doc/effective_go) guidelines

```bash
# Format code
gofmt -w .

# Run linter
golangci-lint run
```

## Key Management

### Direct Private Key Mode

Configure in `config.yaml`:

```yaml
blockchain:
  networks:
    bsc:
      privateKey: "your_private_key_hex"
      usePrivateKey: true
      kmsEnabled: false
```

### KMS Mode

Configure in `config.yaml`:

```yaml
blockchain:
  networks:
    bsc:
      kmsEnabled: true
      usePrivateKey: false

kms:
  enabled: true
  baseURL: "http://kms-service:8080"
```

For detailed setup, see [KEY_INITIALIZATION_GUIDE.md](./KEY_INITIALIZATION_GUIDE.md).

## Event Processing

The service subscribes to blockchain events via NATS:

### Deposit Events
- `zkpay.*.Treasury.DepositReceived` - New deposit on business chain
- `zkpay.bsc.ZKPayProxy.DepositRecorded` - Deposit recorded on management chain
- `zkpay.bsc.ZKPayProxy.DepositUsed` - Deposit used

### Commitment Events
- `zkpay.bsc.ZKPayProxy.CommitmentRootUpdated` - Queue root updated

### Withdrawal Events
- `zkpay.*.Treasury.WithdrawRequested` - Withdrawal requested
- `zkpay.*.Treasury.WithdrawExecuted` - Withdrawal executed

## 7. Checkbook 和 WithdrawRequest 生命周期

### 概述

ZKPay 系统中存在两个核心实体，它们有不同的生命周期和状态转换：

1. **Checkbook（支票本）** - 代表一次存款，包含多个 Allocations
2. **WithdrawRequest（提款请求）** - 代表一次提款意图，由一个或多个 Allocations 组成

### Checkbook 生命周期

#### Checkbook 状态定义

```
CheckbookStatusPending              - 存款已提交，处理中
CheckbookStatusUnsigned             - 存款已确认，等待签名
CheckbookStatusReadyForCommitment   - 已加密，准备创建 Commitment
CheckbookStatusGeneratingProof      - 生成 ZK Proof 中
CheckbookStatusSubmittingCommitment - 提交 Commitment TX 中
CheckbookStatusCommitmentPending    - Commitment TX 已提交，等待确认
CheckbookStatusWithCheckbook        - Commitment 已确认，Checkbook 完成 ✅
CheckbookStatusProofFailed          - Proof 生成失败 ❌
CheckbookStatusSubmissionFailed     - Commitment TX 提交失败 ❌
CheckbookStatusDeleted              - Checkbook 已删除（管理功能）❌
```

#### Checkbook 状态转换图

```
┌─────────────────────────────────────────────────────────────────┐
│                       Checkbook 生命周期                          │
└─────────────────────────────────────────────────────────────────┘

用户发起存款
    │
    ▼
[pending] ──(存款确认)──> [unsigned]
    │                          │
    │                          ▼
    │                  [ready_for_commitment]
    │                          │
    │                          ▼ (本地生成 ZK Proof)
    │                  [generating_proof]
    │                     │        │
    │              ❌ /  ✅ \
    │            /          \
  ❌ /     [proof_failed]   [submitting_commitment]
  /                             │
[submission_failed]   ✅ /     ✅ \ ❌
    │                /           \
    │          [commitment_pending]──> [submission_failed]
    │                │
    │                ▼
    │          [with_checkbook] ✅ (完成！)
    │
    └─────────> [deleted] (管理功能)

关键点：
- 一旦到达 [with_checkbook]，Checkbook 不再改变状态
- 失败状态可以触发重试流程（返回之前的状态）
- Allocation 状态独立于 Checkbook 状态
```

#### Checkbook 与 Allocations 的关系

```go
type Checkbook struct {
    ID           string  // UUID（主键）
    LocalDepositID uint64  // 链上存款 ID（唯一标识）
    Status       CheckbookStatus  // Checkbook 状态
    Amount       string  // 总存款金额
    AllocatableAmount string // 可分配金额
    Allocations  []Check // 关联的 Allocations（1 对多）
}

type Check struct {
    ID              string  // UUID（Allocation 主键）
    CheckbookID     string  // 外键：关联到 Checkbook
    Seq             uint8   // 序列号（0-255，Checkbook 内唯一）
    Amount          string  // 分配金额
    Status          AllocationStatus // Allocation 状态（独立于 Checkbook）
    Nullifier       string  // 链上唯一标识符（ZK Proof 生成后产生）
    WithdrawRequestID *string // 关联的 WithdrawRequest（可选）
}
```

**Allocation 状态独立性**：
- Checkbook 完成（with_checkbook）后，其 Allocations 状态仍为 `idle`
- Allocations 只有在加入 WithdrawRequest 时才会改变状态
- 这允许用户在提款前多次改变取款计划

---

### WithdrawRequest 生命周期

#### WithdrawRequest 主状态定义

WithdrawRequest 包含 **4 个子状态系统** 来追踪各阶段进度：

```
主状态（综合状态）:
├─ Stage 1: Proof Generation (证明生成)
│  ├─ created          - 请求已创建
│  ├─ proving          - 生成 ZK Proof 中
│  ├─ proof_generated  - Proof 生成成功 ✅
│  └─ proof_failed     - Proof 生成失败 ❌
│
├─ Stage 2: On-chain Verification (链上验证)
│  ├─ submitting       - 提交 executeWithdraw TX
│  ├─ submitted        - TX 已提交
│  ├─ execute_confirmed - executeWithdraw 已确认
│  ├─ submit_failed    - 提交失败 ❌（可重试）
│  └─ failed_permanent - Proof 或签名验证失败 ❌（不可逆）
│
├─ Stage 3: Intent Execution (Intent 执行 / Payout)
│  ├─ waiting_for_payout - 等待 Treasury.payout 执行
│  ├─ payout_processing  - 跨链桥接中
│  ├─ payout_completed   - 资金已到目标链 IntentManager ✅
│  └─ payout_failed      - Payout 失败 ❌（可重试，限 5 次）
│
├─ Stage 4: Hook Purchase (Hook 购买，可选)
│  ├─ hook_processing         - 执行 Hook calldata 中
│  ├─ hook_failed             - Hook 执行失败 ⚠️
│  ├─ completed               - 所有阶段完成 ✅
│  └─ completed_with_hook_failed - Payout 成功但 Hook 失败 ✅（部分完成）
│
└─ Terminal States (终止状态)
   ├─ completed              - 完全成功 ✅
   ├─ completed_with_hook_failed - 主流程成功，Hook 失败（可接受）
   ├─ failed_permanent       - 永久失败（Proof/签名验证失败）❌
   └─ cancelled              - 用户取消 ❌
```

#### 子状态系统

```go
// ProofStatus - 追踪 Stage 1（证明生成）
const (
    ProofStatusPending    = "pending"      // 等待生成
    ProofStatusInProgress = "in_progress"  // 生成中
    ProofStatusCompleted  = "completed"    // 完成 ✅
    ProofStatusFailed     = "failed"       // 失败 ❌
)

// ExecuteStatus - 追踪 Stage 2（链上验证）
const (
    ExecuteStatusPending      = "pending"       // 等待提交
    ExecuteStatusSubmitted    = "submitted"     // 已提交
    ExecuteStatusSuccess      = "success"       // 链上确认 ✅
    ExecuteStatusSubmitFailed = "submit_failed" // 提交失败 ❌（可重试）
    ExecuteStatusVerifyFailed = "verify_failed" // 验证失败 ❌（不可重试）
)

// PayoutStatus - 追踪 Stage 3（Payout 执行）
const (
    PayoutStatusPending    = "pending"     // 等待执行
    PayoutStatusProcessing = "processing"  // 跨链中
    PayoutStatusCompleted  = "completed"   // 完成 ✅
    PayoutStatusFailed     = "failed"      // 失败 ❌（可重试）
)

// HookStatus - 追踪 Stage 4（Hook 购买）
const (
    HookStatusNone       = "none"        // 不使用 Hook
    HookStatusPending    = "pending"     // 等待执行
    HookStatusProcessing = "processing"  // 执行中
    HookStatusCompleted  = "completed"   // 完成 ✅
    HookStatusFailed     = "failed"      // 失败 ⚠️（不影响主流程）
)

// 主状态通过组合子状态计算
func (w *WithdrawRequest) UpdateMainStatus() {
    if w.ProofStatus == "pending" {
        w.Status = "created"
    } else if w.ProofStatus == "in_progress" {
        w.Status = "proving"
    } else if w.ExecuteStatus == "submitted" {
        w.Status = "submitting"
    } // ... 等等
}
```

#### WithdrawRequest 完整状态转换图

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    WithdrawRequest 4 阶段生命周期                         │
└──────────────────────────────────────────────────────────────────────────┘

用户发起 Withdraw 请求
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage 1: Proof Generation（证明生成）     │
│ Allocation 状态: idle → pending           │
└──────────────────────────────────────────┘
    │
    ├─────> [created] ──> [proving] ──┬──> [proof_generated] ✅
    │                                  │
    │                                  └──> [proof_failed] ❌
    │                                         │
    │                                         └──> 可重试（返回 created）
    │                                         └──> 或取消（Allocations 变 idle）
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage 2: On-chain Verification           │
│ Allocation 状态: pending → 等待 used      │
│ Nullifier 消费: 在此阶段消费（不可逆！）   │
└──────────────────────────────────────────┘
    │
    ├─────> [submitting] ──┬──> [execute_confirmed] ✅
    │                      │
    │                      └──> [submit_failed] ❌ 可重试
    │
    └─────> [failed_permanent] ❌ 不可重试（Proof 验证失败）
                  │
                  └──> Nullifier 已被消费
                       无法取消或重试（Allocations 永久锁死）

    ✅ 阶段 2 成功后：
       └─> Allocation 状态: pending → used（链上不可逆）
       └─> 进入 Stage 3

    ▼
┌──────────────────────────────────────────┐
│ Stage 3: Intent Execution（Payout 执行）  │
│ 跨链转账：源链 Treasury → 目标链 IntentManager │
│ 特点：可多次重试（最多 5 次），但 Nullifier  │
│      已消费，无法回滚                      │
└──────────────────────────────────────────┘
    │
    ├─────> [waiting_for_payout]
    │           │
    │           ▼
    │       [payout_processing] ──┬──> [payout_completed] ✅
    │                              │
    │                              └──> [payout_failed] ❌
    │                                     │
    │                                     └──> 可重试（限 5 次）
    │                                     └──> 超时可在源链 claim
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage 4: Hook Purchase（Hook 购买，可选）  │
│ 执行 calldata：USDT → aUSDT（示例）      │
│ 特点：失败不影响主流程（Payout 已成功）    │
└──────────────────────────────────────────┘
    │
    ├─────> [hook_processing] ──┬──> [completed] ✅✅
    │                            │
    │                            └──> [hook_failed] ⚠️
    │                                   │
    │                                   └──> [completed_with_hook_failed] ✅
    │
    └──────────────────────────────────────> (无 Hook) [completed] ✅

Terminal States (终止状态):
├─ [completed]                    - 完全成功 ✅✅
├─ [completed_with_hook_failed]   - 主流程成功，Hook 失败 ✅⚠️（可接受）
├─ [failed_permanent]             - Proof/签名验证失败 ❌
└─ [cancelled]                    - 用户取消 ❌
```

---

### 关键转换规则

#### 规则 1：Allocation 状态追踪

```
idle (Checkbook 完成后)
  │
  ▼
pending (加入 WithdrawRequest, Stage 1 中)
  │
  ├─> idle (Stage 1 失败且用户取消)
  │
  ▼
used (Stage 2 成功，Nullifier 链上消费 - 不可逆！)
```

**关键**: 一旦 Stage 2 成功，Allocation 永久变为 `used`，无法撤回。

#### 规则 2：Nullifier 消费（不可逆点）

```
Timeline:
  ├─ Stage 1: Proof 生成（Nullifier 还未在链上消费）
  │  └─ 此时可以：重试生成 Proof / 取消请求
  │
  ├─ Stage 2: executeWithdraw 提交（Nullifier 在链上消费）
  │  └─ 不可逆！即使后续失败也无法回滚
  │  └─ 即使取消，Nullifier 已消费，Allocation 永久 used
  │
  └─ Stage 3/4: Payout / Hook 执行
     └─ Nullifier 已消费（past point of no return）
     └─ 只能重试或等待超时
```

#### 规则 3：重试权限

```
Stage 1（Proof 生成）:
  ├─ 条件：ProofStatus = failed
  ├─ 重试次数：无限
  ├─ 权限：Owner 或 Backend
  └─ 触发：POST /api/v2/my/withdraw-requests/:id/retry

Stage 2（链上验证）:
  ├─ submit_failed：可重试（网络问题）
  │   ├─ 条件：ExecuteStatus = submit_failed
  │   ├─ 重试次数：无限
  │   ├─ 权限：Owner 或 Backend
  │   └─ 触发：POST /api/v2/my/withdraw-requests/:id/retry
  │
  └─ verify_failed：不可重试（Proof 问题）❌

Stage 3（Payout 执行）:
  ├─ 条件：PayoutStatus = failed
  ├─ 重试次数：最多 5 次
  ├─ 间隔：30s → 1m → 2m → 4m → 8m（指数退避）
  ├─ 权限：Owner 或 Beneficiary
  ├─ 触发方式 1（Owner）：POST /api/v2/my/withdraw-requests/:id/retry-payout
  ├─ 触发方式 2（Beneficiary）：POST /api/v2/my/beneficiary-withdraw-requests/:id/request-payout
  └─ 超时兜底：POST /api/v2/my/beneficiary-withdraw-requests/:id/claim-timeout

Stage 4（Hook 执行）:
  ├─ 条件：HookStatus = failed
  ├─ 重试次数：无限（Hook 失败不影响主流程）
  ├─ 权限：Backend 自动重试
  └─ 特点：即使失败，也标记为 completed_with_hook_failed
```

---

### Allocation 的完整生命周期

```
从存款到提款的完整链路：

1. 用户存款 USDT 100
   └─> Checkbook 创建，Amount = 100
   └─> 内部创建多个 Allocations（根据配置，例如 10+20+30+40）
   └─> 每个 Allocation 初始状态：idle
   └─> Checkbook 进入状态转换（pending → ... → with_checkbook）

2. Checkbook 完成（with_checkbook）
   └─> 100 USDT 已存入 Treasury/Aave，生息中
   └─> Allocations 仍为 idle（可随时用于新的 Withdraw 请求）

3. 用户发起第 1 个 Withdraw 请求
   └─> 选择 Allocations: #1(10) + #2(20) = 30 USDT
   └─> WithdrawRequest 创建，Amount = 30
   └─> Allocation #1, #2 状态变更：idle → pending
   └─> Allocation #3, #4 仍为 idle（可用于其他请求）

4. WithdrawRequest #1 的 Stage 1 成功（Proof 生成）
   └─> Status: proving → proof_generated ✅

5. WithdrawRequest #1 的 Stage 2 成功（链上确认）
   └─> Status: submitting → execute_confirmed ✅
   └─> Allocation #1, #2 状态变更：pending → used ❌（不可逆！）
   └─> Nullifier 已在链上消费

6. WithdrawRequest #1 的 Stage 3 成功（Payout）
   └─> 30 USDT 已到达目标链 IntentManager
   └─> Status: payout_completed ✅

7. WithdrawRequest #1 的 Stage 4 完成或跳过
   └─> 最终 Status: completed ✅

8. 用户发起第 2 个 Withdraw 请求
   └─> 只能选择剩余的 idle Allocations: #3(30) + #4(40) = 70 USDT
   └─> Allocations #1, #2 已 used，无法再次使用
```

---

### 实际数据库查询示例

#### 查询一个 Checkbook 的所有 Allocations

```sql
SELECT c.id, c.status, a.seq, a.status, a.amount, a.withdraw_request_id
FROM checkbooks c
JOIN allocations a ON c.id = a.checkbook_id
WHERE c.id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY a.seq ASC;

结果示例：
checkbook_id                         | status              | seq | alloc_status | amount | withdraw_id
550e8400-e29b-41d4-a716-446655440000 | with_checkbook      | 0   | used         | 10     | wr-001
550e8400-e29b-41d4-a716-446655440000 | with_checkbook      | 1   | used         | 20     | wr-001
550e8400-e29b-41d4-a716-446655440000 | with_checkbook      | 2   | idle         | 30     | NULL
550e8400-e29b-41d4-a716-446655440000 | with_checkbook      | 3   | idle         | 40     | NULL
```

#### 查询一个 WithdrawRequest 的状态

```sql
SELECT id, status, proof_status, execute_status, payout_status, hook_status
FROM withdraw_requests
WHERE id = 'wr-001';

结果示例：
id   | status                  | proof_status | execute_status | payout_status | hook_status
wr-001 | completed              | completed    | success        | completed     | completed
```

---

### 常见场景转换

#### 场景 1：成功完成（最优路径）

```
WithdrawRequest 创建
  ├─ [created] (Allocations: idle → pending)
  │   ▼
  ├─ [proving] (生成 ZK Proof)
  │   ▼
  ├─ [proof_generated] ✅ (ProofStatus: completed)
  │   ▼
  ├─ [submitting] (提交 executeWithdraw TX)
  │   ▼
  ├─ [execute_confirmed] ✅ (ExecuteStatus: success)
  │   └─> Allocations: pending → used ❌ (不可逆)
  │   ▼
  ├─ [waiting_for_payout]
  │   ▼
  ├─ [payout_processing] (跨链中)
  │   ▼
  ├─ [payout_completed] ✅ (资金到 IntentManager)
  │   ▼
  ├─ [hook_processing] (如果有 Hook)
  │   ▼
  └─ [completed] ✅ (终止状态：完全成功)
```

#### 场景 2：Proof 生成失败，用户重试

```
WithdrawRequest 创建
  ├─ [created] (Allocations: idle → pending)
  │   ▼
  ├─ [proving]
  │   ▼
  ├─ [proof_failed] ❌ (ProofStatus: failed)
  │   └─> 用户选择：重试或取消
  │       ├─ 重试：[created] ◄─────── (重新开始)
  │       │   ▼
  │       │ [proving]
  │       │   ▼
  │       └─ [proof_generated] ✅ (成功)
  │           ▼
  │        ... (继续后续阶段)
  │
  │       └─ 或取消：
  │           └─> Allocations: pending → idle ✅ (释放)
  │           └─> Status: [cancelled]
```

#### 场景 3：Stage 2 提交失败，自动重试

```
WithdrawRequest 进度
  ├─ [proof_generated] ✅
  │   ▼
  ├─ [submitting]
  │   ▼
  ├─ [submit_failed] ❌ (ExecuteStatus: submit_failed)
  │   └─> 后端自动重试或前端用户触发
  │       ├─ 重试：[submitting] ◄───── (重新提交)
  │       │   ▼
  │       └─ [execute_confirmed] ✅ (成功)
  │           └─> Allocations: pending → used ❌
  │           ▼
  │        ... (继续后续阶段)
```

#### 场景 4：Stage 2 验证失败（不可恢复）

```
WithdrawRequest 进度
  ├─ [proof_generated] ✅
  │   ▼
  ├─ [submitting]
  │   ▼
  ├─ [failed_permanent] ❌ (ExecuteStatus: verify_failed)
  │   └─> Proof 或签名验证失败
  │   └─> Nullifiers 已被消费（Stage 2 交易上链）
  │   └─> 无法重试或取消
  │   └─> Allocations: pending → used（虽然最后失败了，但 nullifier 已消费）
  │   └─> 用户资金实际上被"锁死"了 💀
```

#### 场景 5：Stage 3 Payout 失败，跨链有问题

```
WithdrawRequest 进度
  ├─ [execute_confirmed] ✅ (Allocations: pending → used)
  │   ▼
  ├─ [waiting_for_payout]
  │   ▼
  ├─ [payout_processing] (跨链中)
  │   ▼
  ├─ [payout_failed] ❌ (资金未到 IntentManager)
  │   └─> 用户或后端可以重试（最多 5 次）
  │       ├─ 重试 1：[payout_processing] ◄─────
  │       │   ▼ (间隔 30s)
  │       ├─ 重试 2：[payout_processing] ◄─────
  │       │   ▼ (间隔 1m)
  │       ├─ ... 继续重试
  │       │   ▼
  │       └─ [payout_completed] ✅ (最终成功)
  │
  │   或超时后：
  │   └─> Beneficiary 在源链 claim
  │       └─> Status: [completed] ✅（部分完成）
```

---

### 数据库表关联

```go
// Checkbook 和 Allocation 的关系
Checkbook:
  ID            PK
  ├─ Allocations (1:N)
  │  └─ Check
  │     ID              PK
  │     CheckbookID     FK → Checkbook.ID
  │     WithdrawRequestID FK → WithdrawRequest.ID (可选)

// WithdrawRequest 和 Allocation 的关系
WithdrawRequest:
  ID           PK
  ├─ Allocations (N:M 通过 Check.WithdrawRequestID)
  │  └─ Check
  │     ID               PK
  │     CheckbookID      FK → Checkbook.ID
  │     WithdrawRequestID FK → WithdrawRequest.ID
```

---

### 常见问题

**Q1: Allocation 为什么要有独立的状态？**
- A: 让多个 WithdrawRequest 可以共享同一个 Checkbook 的 Allocations
- 例如：100 USDT Checkbook，可以分成 3 个 WithdrawRequest（30+30+40）

**Q2: 为什么 Stage 2 后 Allocation 变 used 就无法撤回？**
- A: 因为 Nullifier 已在链上被消费，这是防止双花的关键机制
- 如果允许撤回，这些 Allocation 永久无法再用，资金锁死

**Q3: 为什么 Payout 失败可以重试但有次数限制？**
- A: 多次失败通常意味着系统性问题（桥接暂停、流动性不足等）
- 需要人工检查和介入

**Q4: Hook 失败会影响整个 Withdraw 吗？**
- A: 不会，Hook 是可选的第 4 阶段，失败会标记为 `completed_with_hook_failed`
- 用户的资金已安全到达目标链（Stage 3 完成）

**Q5: TRON 支持哪些代币？**
- A: 目前仅支持 USDT
- USDC 还未在 TRON 上推出

**Q6: TRON 支持 Hook 吗？**
- A: 不支持
- Hook（购买生息资产）仅在 Ethereum、Polygon、Arbitrum、Optimism 上支持

---

### 监控和告警

建议监控以下异常情况：

1. **Checkbook 卡在某个状态超过 1 小时**
   - 可能原因：ZKVM 服务故障、网络问题
   - 告警级别：⚠️ Warning

2. **WithdrawRequest 卡在 `payout_processing` 超过 24 小时**
   - 可能原因：跨链桥接延迟或故障
   - 告警级别：🔴 Critical

3. **大量 WithdrawRequest 进入 `payout_failed`**
   - 可能原因：LiFi API 故障、流动性不足
   - 告警级别：🔴 Critical

4. **Allocation 处于 `pending` 超过 48 小时**
   - 可能原因：用户放弃，或 WithdrawRequest 泄漏
   - 建议：自动释放（返回 idle）
   - 告警级别：⚠️ Warning

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL is running: `pg_isready`
   - Verify DSN in config.yaml
   - Check network connectivity

2. **NATS Connection Error**
   - Ensure NATS server is running with JetStream enabled
   - Verify NATS URL in configuration
   - Check firewall settings

3. **Blockchain RPC Timeout**
   - Try alternative RPC endpoints
   - Increase timeout in configuration
   - Check network connectivity to RPC

4. **JWT Token Expired**
   - Use `/api/auth/refresh` endpoint
   - Re-login if refresh token expired

### Logs

Check logs for detailed error messages:

```bash
# Console output
tail -f /var/log/zkpay-backend.log

# Docker logs
docker logs -f zkpay-backend
```

## Performance Tuning

### Database Optimization

```yaml
database:
  max_open_conns: 25
  max_idle_conns: 5
  conn_max_lifetime: 5m
```

### NATS Configuration

```yaml
nats:
  reconnect_wait: 2
  max_reconnects: 10
  timeout: 30
```

### WebSocket Settings

```yaml
websocket:
  read_buffer: 1024
  write_buffer: 1024
  ping_interval: 30s
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write unit tests for new features
- Update documentation for API changes
- Follow Go coding conventions
- Ensure all tests pass before submitting PR

## Security

### Best Practices

- Never commit private keys or sensitive data
- Use environment variables or secure vaults for secrets
- Enable HTTPS in production
- Implement rate limiting
- Regular security audits

### Reporting Vulnerabilities

Please report security vulnerabilities to: security@zkpay.io

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [Full Documentation](./docs/)
- **Issues**: [GitHub Issues](https://github.com/enclave-hq/backend/issues)
- **Discussions**: [GitHub Discussions](https://github.com/enclave-hq/backend/discussions)

## Acknowledgments

- [Ethereum Foundation](https://ethereum.org/) for go-ethereum
- [NATS.io](https://nats.io/) for the messaging system
- [Gin Web Framework](https://gin-gonic.com/)
- All contributors to this project

## Roadmap

- [ ] GraphQL API support
- [ ] Multi-signature wallet support
- [ ] Enhanced monitoring and metrics
- [ ] Additional blockchain support
- [ ] Performance optimizations
- [ ] Comprehensive test coverage

---

**Made with ❤️ by the ZKPay Team**

## 8. 完整的后端 API 流程和端点

### 概述

后端采用分层架构：
- **Router** → **Handler** → **Service** → **Repository** → **Database**

所有请求进入通过特定的 HTTP 端点，经过中间件验证，然后流向对应的 Handler，最后由 Service 执行业务逻辑。

---

## 8.1 认证和授权流程

### 1. 生成 Nonce（第一步：获取签名挑战）

```
POST /api/auth/nonce
```

**请求**:
```json
{
  // 无请求体
}
```

**响应** (200):
```json
{
  "nonce": "0x1234567890abcdef...",
  "expires_in": 300
}
```

**流程**:
```
Client Request
    ↓
Router: POST /api/auth/nonce
    ↓
Handler: GenerateNonceHandler()
    ├─ 生成随机 Nonce
    ├─ 设置 5 分钟过期时间
    └─ 存入 Redis 或内存
    ↓
Response: { nonce, expires_in }
```

### 2. 登录认证（第二步：签名并登录）

```
POST /api/auth/login
```

**请求**:
```json
{
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "chain_id": 60,
  "signature": "0x...",  // EIP-191 签名
  "message": "Sign this message to login..."
}
```

**响应** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 86400,
  "user": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    "chain_id": 60
  }
}
```

**流程**:
```
Client Request (包含签名)
    ↓
Router: POST /api/auth/login
    ↓
Handler: AuthenticateHandler()
    ├─ 验证 Nonce 是否存在且未过期
    ├─ 验证签名是否有效（EIP-191）
    ├─ 检查签名者是否匹配 wallet_address
    ├─ 生成 JWT Token（包含 chain_id 和 address）
    ├─ 设置 24 小时过期时间
    └─ 返回 Token
    ↓
所有后续请求需要在 Header 中包含:
  Authorization: Bearer <token>
```

---

## 8.2 存款流程（Checkbook 创建）

### 1. 查询存款信息

```
GET /api/deposits/:chainId/:localDepositId
```

**请求参数**:
- `chainId`: 链 ID (60 for ETH, 714 for BSC, 195 for TRON)
- `localDepositId`: 链上存款 ID

**响应** (200):
```json
{
  "chain_id": 60,
  "local_deposit_id": "12345",
  "token_id": 1,
  "owner": {
    "chain_id": 60,
    "data": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
  },
  "gross_amount": "1000000000000000000",  // 1 ETH
  "allocatable_amount": "999000000000000000",  // 扣除手续费
  "fee_total_locked": "1000000000000000"
}
```

**流程**:
```
GET /api/deposits/:chainId/:localDepositId
    ↓
Handler: GetDepositHandler()
    ├─ 解析 chainId 和 localDepositId
    ├─ 从数据库查询 DepositInfo
    └─ 返回存款信息
    ↓
Response: DepositInfo (含金额、手续费、可分配金额)
```

### 2. 用户查询自己的存款

```
GET /api/deposits/by-owner
```

**请求**: 需要 JWT 认证
```
Header: Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "deposits": [
    {
      "chain_id": 60,
      "local_deposit_id": "12345",
      "amount": "1000000000000000000",
      // ... 其他字段
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "page_size": 20
  }
}
```

**流程**:
```
GET /api/deposits/by-owner
    ↓
Middleware: RequireAuth()
    ├─ 验证 JWT Token
    ├─ 解析 user_address 和 chain_id
    └─ 存入 Context
    ↓
Handler: GetDepositsByOwnerHandler()
    ├─ 从 Context 获取认证用户的地址
    ├─ 查询该用户在该链的所有存款
    └─ 返回分页结果
    ↓
Response: Deposits List
```

### 3. 创建 Checkbook（存款记录）

> **注意**: 此接口仅用于开发测试，生产环境已禁用（通过 `DepositReceived` 事件自动创建）。

```
POST /api/checkbooks (Disabled in Production)
```

**请求**: 需要 JWT 认证
```json
{
  "chain_id": 60,
  "local_deposit_id": 12345,
  "user_address": {
    "chain_id": 60,
    "data": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
  },
  "token_id": 1,
  "amount": "1000000000000000000",
  "status": "pending"
}
```

**响应** (200/201):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "chain_id": 60,
  "local_deposit_id": 12345,
  "status": "pending",  // pending → unsigned → ready_for_commitment → generating_proof → submitting_commitment → commitment_pending → with_checkbook
  "amount": "1000000000000000000",
  "allocations": [],
  "created_at": "2025-01-24T10:00:00Z"
}
```

**流程**:
```
POST /api/checkbooks
    ↓
Middleware: RequireAuth()
    ├─ 验证 JWT
    └─ 获取用户身份
    ↓
Handler: CreateCheckbookHandler()
    ├─ 检查 (chain_id, local_deposit_id) 是否已存在
    │  ├─ 如果存在：更新状态 (update flow)
    │  └─ 如果不存在：创建新 Checkbook
    ├─ 分配 UUID 作为 Checkbook ID
    ├─ 初始状态：pending
    ├─ 关联 Allocations（根据配置分割金额）
    └─ 返回 Checkbook 信息
    ↓
Service: CheckbookService()
    └─ 处理状态转换逻辑
    ↓
Repository: CheckbookRepository()
    └─ 保存到数据库
    ↓
Response: Checkbook (包含 ID, 状态, Allocations)
```

### 4. 查询 Checkbook

```
GET /api/checkbooks
GET /api/checkbooks/id/:id
```

**请求**: 需要 JWT 认证

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "with_checkbook",
      "amount": "1000000000000000000",
      "allocations": [
        {
          "id": "alloc-001",
          "seq": 0,
          "amount": "250000000000000000",
          "status": "idle"
        }
      ]
    }
  ]
}
```

**流程**:
```
GET /api/checkbooks
    ↓
Middleware: RequireAuth()
    ├─ 验证 JWT
    └─ 获取 user_address 和 chain_id
    ↓
Handler: GetCheckbooksListHandler()
    ├─ 从 Repository 查询用户的 Checkbook
    ├─ 关联 Allocations
    ├─ 分页处理
    └─ 返回列表
    ↓
Response: Checkbooks List
```

---

## 8.3 提款流程（WithdrawRequest）

### 1. 创建提款请求

虽然 API 中没有直接的 POST 端点，但 WithdrawRequest 通过 proof_handler 创建：

```
POST /api/withdraws/submit
```

**请求**: 需要 JWT 认证
```json
{
  "checkbook_id": "550e8400-e29b-41d4-a716-446655440000",
  "allocations": ["alloc-001", "alloc-002"],
  "intent": {
    "type": "RawToken",  // 0 = RawToken, 1 = AssetToken
    "beneficiary": {
      "chain_id": 1,
      "data": "0x..."
    },
    "token_contract": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  }
}
```

**响应** (201):
```json
{
  "withdraw_request_id": "wr-001",
  "status": "created",
  "allocations": ["alloc-001", "alloc-002"],
  "amount": "500000000000000000",
  "proof_status": "pending",
  "execute_status": "pending"
}
```

**流程**:
```
POST /api/withdraws/submit
    ↓
Middleware: RequireAuth()
    ├─ 验证 JWT
    └─ 获取用户身份
    ↓
Handler: BuildWithdrawHandler()
    ├─ 验证 Allocations 存在且属于用户
    ├─ 验证 Intent 有效性
    ├─ 创建 WithdrawRequest
    ├─ 更新 Allocation 状态：idle → pending
    ├─ 初始化 4 个子状态：
    │  ├─ proof_status = pending
    │  ├─ execute_status = pending
    │  ├─ payout_status = pending
    │  └─ hook_status = none
    └─ 返回 WithdrawRequest ID
    ↓
Service: WithdrawRequestService()
    ├─ 调用 ZKVM 生成 Proof（如果需要）
    ├─ 管理状态转换
    └─ 处理重试逻辑
    ↓
Repository: WithdrawRequestRepository()
    └─ 保存到数据库
    ↓
Response: WithdrawRequest (包含 ID, 状态, Allocations)
```

### 2. 查询提款请求

```
GET /api/my/withdraw-requests
GET /api/my/withdraw-requests/:id
GET /api/my/withdraw-requests/by-nullifier/:nullifier
```

**请求**: 需要 JWT 认证

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "wr-001",
      "status": "completed",
      "proof_status": "completed",
      "execute_status": "success",
      "payout_status": "completed",
      "hook_status": "completed",
      "amount": "500000000000000000",
      "allocations": [
        {
          "nullifier": "0x...",
          "status": "used"
        }
      ]
    }
  ]
}
```

**流程**:
```
GET /api/my/withdraw-requests
    ↓
Middleware: RequireAuth()
    ├─ 验证 JWT
    └─ 获取 user_address
    ↓
Handler: ListMyWithdrawRequestsHandler()
    ├─ 从 Repository 查询用户创建的 WithdrawRequest
    ├─ 可选过滤：status, proof_status 等
    ├─ 分页处理
    └─ 返回列表
    ↓
Repository: WithdrawRequestRepository()
    ├─ 查询 withdraws.owner_address = user_address
    ├─ 关联 Allocations 信息
    └─ 返回结果
    ↓
Response: WithdrawRequests List
```

### 3. 重试失败的提款

```
POST /api/my/withdraw-requests/:id/retry
```

**请求**: 需要 JWT 认证
```json
{
  // 空请求体
}
```

**响应** (200):
```json
{
  "success": true,
  "message": "Retry initiated",
  "withdraw_request_id": "wr-001",
  "new_status": "proving",
  "proof_status": "in_progress"
}
```

**流程**:
```
POST /api/my/withdraw-requests/:id/retry
    ↓
Middleware: RequireAuth()
    ├─ 验证 JWT
    └─ 获取 user_address
    ↓
Handler: RetryWithdrawRequestHandler()
    ├─ 检查 WithdrawRequest 是否属于当前用户
    ├─ 检查当前状态是否可重试（proof_failed 或 submit_failed）
    ├─ 不允许重试：verify_failed 或已消费的 nullifier
    └─ 返回重试状态
    ↓
Service: WithdrawRequestService()
    ├─ 重置状态为 pending
    ├─ 重新生成 Proof（如果是 proof_failed）
    ├─ 或重新提交 TX（如果是 submit_failed）
    └─ 更新 proof_status 或 execute_status
    ↓
Response: { status: "proving", proof_status: "in_progress" }
```

---

## 8.4 受益人操作流程

### 1. 查询受益人的提款请求

```
GET /api/my/beneficiary-withdraw-requests
```

**请求**: 需要 JWT 认证（受益人身份）

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "wr-001",
      "owner_address": "0x...",
      "beneficiary_address": "0x...",  // 当前用户
      "status": "waiting_for_payout",
      "payout_status": "pending",
      "amount": "500000000000000000"
    }
  ]
}
```

**流程**:
```
GET /api/my/beneficiary-withdraw-requests
    ↓
Handler: ListMyBeneficiaryWithdrawRequestsHandler()
    ├─ 从 Context 获取当前用户（受益人）
    ├─ 查询 intent.beneficiary = 当前用户的所有 WithdrawRequest
    ├─ 状态必须 >= waiting_for_payout（Stage 3 已开始）
    └─ 返回列表
    ↓
Response: WithdrawRequests (受益人视角)
```

### 2. 请求执行 Payout（受益人触发）

```
POST /api/my/beneficiary-withdraw-requests/:id/request-payout
```

**请求**: 需要 JWT 认证（受益人身份）

**响应** (200):
```json
{
  "success": true,
  "message": "Payout execution requested",
  "withdraw_request_id": "wr-001",
  "payout_status": "processing"
}
```

**流程**:
```
POST /api/my/beneficiary-withdraw-requests/:id/request-payout
    ↓
Handler: RequestPayoutExecutionHandler()
    ├─ 验证当前用户是受益人
    ├─ 检查状态：execute_confirmed （Stage 2 已完成）
    ├─ 检查 payout_status：pending 或 failed
    ├─ 限制：最多重试 5 次
    └─ 触发 Payout 执行
    ↓
Service: PayoutService() 或 Treasury Contract
    ├─ 查询 LiFi 最优路由
    ├─ 执行跨链桥接（Treasury → IntentManager）
    ├─ 监听跨链确认
    └─ 更新 payout_status
    ↓
Response: { payout_status: "processing" }
```

### 3. 超时领取（Timeout Claim）

```
POST /api/my/beneficiary-withdraw-requests/:id/claim-timeout
```

**请求**: 需要 JWT 认证（受益人身份）

**响应** (200):
```json
{
  "success": true,
  "message": "Timeout claim executed",
  "amount": "500000000000000000",
  "received_at": "source_chain"
}
```

**流程**:
```
POST /api/my/beneficiary-withdraw-requests/:id/claim-timeout
    ↓
Handler: ClaimTimeoutHandler()
    ├─ 验证当前用户是受益人
    ├─ 检查是否超过 payout_deadline
    ├─ 检查 payout_status：processing 或 failed
    └─ 在源链直接转账给受益人
    ↓
Service: TimeoutClaimService()
    ├─ 调用源链 Treasury.claimTimeout()
    ├─ 直接转账到受益人地址（不跨链）
    └─ 标记为 completed
    ↓
Response: { status: "completed", received_at: "source_chain" }
```

### 4. 请求 Hook 购买（可选）

```
POST /api/my/beneficiary-withdraw-requests/:id/request-hook
```

**请求**: 需要 JWT 认证（受益人身份）
```json
{
  "hook_calldata": "0x...",  // 可选，否则使用预设的
  "protocol": "aave"  // aave, compound, etc.
}
```

**响应** (200):
```json
{
  "success": true,
  "message": "Hook execution requested",
  "hook_status": "processing"
}
```

**流程**:
```
POST /api/my/beneficiary-withdraw-requests/:id/request-hook
    ↓
Handler: RequestHookPurchaseHandler()
    ├─ 验证 payout_status = completed（资金已到 IntentManager）
    ├─ 获取或使用提供的 hook_calldata
    └─ 触发 Hook 执行
    ↓
Service: HookExecutionService()
    ├─ 调用 IntentManager.executeIntent()
    ├─ 执行 Hook calldata（购买生息资产等）
    ├─ 监听执行结果
    └─ 更新 hook_status
    ↓
Response: { hook_status: "processing" }
```

---

## 8.5 Quote API（公开端点）

### 1. 查询路由和费用

```
POST /api/v2/quote/route-and-fees
```

**请求**（无需认证）:
```json
{
  "owner_data": {
    "chain_id": 60,  // 源链
    "data": "0x..."
  },
  "deposit_token": "0xdAC17F958D2ee523a2206206994597C13D831ec7",  // USDT on Ethereum
  "intent": {
    "type": "RawToken",
    "beneficiary": {
      "chain_id": 1,
      "data": "0x..."
    },
    "token_contract": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"  // USDC on Ethereum
  },
  "amount": "1000000",  // 100 USDT (6 decimals)
  "include_hook": false
}
```

**响应** (200):
```json
{
  "route": {
    "bridge": "lifi",
    "bridgeProtocol": "LiFi",
    "estimatedTime": "5-30min",
    "steps": [
      {
        "step": 1,
        "chain": "Ethereum (1)",
        "action": "Redeem from Treasury"
      },
      {
        "step": 2,
        "chain": "Ethereum (1)",
        "action": "Swap USDT → USDC"
      }
    ]
  },
  "fees": {
    "gas": {
      "proof_generation": { "gas": "150000", "cost_usd": "15.50" },
      "execute_withdraw": { "gas": "300000", "cost_usd": "31.00" }
    },
    "bridge": {
      "fee_usd": "2.50",
      "slippage": "0.5%",
      "min_received": "99750"
    },
    "summary": {
      "total_cost_usd": "49.00",
      "estimated_received": "99750 USDC"
    }
  }
}
```

**流程**:
```
POST /api/v2/quote/route-and-fees
    ↓
Handler: GetRouteAndFeesHandler()
    ├─ 解析请求参数
    └─ 调用 QuoteService
    ↓
Service: QuoteService.GetRouteAndFees()
    ├─ TRON-specific validation（如果目标是 TRON）
    │  ├─ 禁用 Hook
    │  └─ 检查 token 支持（仅 USDT）
    ├─ 验证 Hook 支持（仅 Ethereum, Polygon, Arbitrum, Optimism）
    ├─ 查询 LiFi 路由
    │  ├─ 查询最优 swap 路由
    │  ├─ 查询跨链路由（如需要）
    │  └─ 返回费用和预计产出
    ├─ 查询 deBridge 路由（TRON 或特定情况）
    ├─ 查询 Gas 价格
    ├─ 计算总费用
    └─ 返回完整报价
    ↓
Client Libraries (LiFi, deBridge, Gas 价格)
    ├─ LiFi API: https://li.quest/v1/quote
    ├─ deBridge DLN: https://api.dln.trade/v1.0/dln/order/quote
    └─ Gas Station (RPC)
    ↓
Response: Route & Fees Information
```

### 2. 查询 Hook 资产信息

```
POST /api/v2/quote/hook-asset
```

**请求**（无需认证）:
```json
{
  "chain": 1,  // Ethereum
  "asset": "aUSDC",
  "protocol": "aave"  // aave, compound, yearn, lido
}
```

**响应** (200):
```json
{
  "asset": "aUSDC",
  "protocol": "aave",
  "chain_id": 1,
  "base_token": "USDC",
  "base_token_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "apy": "4.32%",
  "current_rate": "1.0432",
  "fees": {
    "purchase_fee": "0%",
    "withdrawal_fee": "0%"
  },
  "risk_level": "low",
  "liquidity": "high"
}
```

**流程**:
```
POST /api/v2/quote/hook-asset
    ↓
Handler: GetHookAssetHandler()
    ├─ 解析请求参数
    └─ 调用 QuoteService
    ↓
Service: QuoteService.GetHookAsset()
    ├─ 检查 Hook 是否支持该链
    ├─ 验证协议（aave, compound, yearn, lido）
    ├─ 查询 Metrics 数据库
    │  ├─ APY（年化收益率）
    │  ├─ Exchange Rate（兑换率）
    │  └─ Fee Information
    ├─ 查询 Adapter 配置
    └─ 返回资产信息
    ↓
Response: Hook Asset Information
```

---

## 8.6 链配置 API（新增）

### 1. 查询单条链配置（公开）

```
GET /api/chains/:chain_id
```

**请求**（无需认证）:
```
curl http://localhost:3001/api/chains/60
```

**响应** (200):
```json
{
  "chain": {
    "chain_id": 60,
    "chain_name": "Ethereum",
    "treasury_address": "0x...",
    "intent_manager_address": "0x...",
    "zkpay_address": "0x...",
    "rpc_endpoint": "https://eth.rpc.endpoint",
    "explorer_url": "https://etherscan.io",
    "is_active": true,
    "sync_enabled": true,
    "sync_block_number": 21000000
  }
}
```

**流程**:
```
GET /api/chains/:chain_id
    ↓
Handler: GetActiveChainHandler()
    ├─ 解析 chain_id
    ├─ 查询数据库（is_active = true）
    └─ 返回链配置
    ↓
Response: ChainConfig
```

### 2. 列出所有活跃链（公开）

```
GET /api/chains
```

**请求**（无需认证）:
```
curl http://localhost:3001/api/chains
```

**响应** (200):
```json
{
  "chains": [
    {
      "chain_id": 1,
      "chain_name": "Ethereum",
      // ...
    },
    {
      "chain_id": 56,
      "chain_name": "BSC",
      // ...
    },
    {
      "chain_id": 195,
      "chain_name": "TRON",
      // ...
    }
  ],
  "total": 3
}
```

**流程**:
```
GET /api/chains
    ↓
Handler: ListActiveChainsHandler()
    ├─ 查询所有活跃链（is_active = true）
    ├─ 按 chain_id 排序
    └─ 返回列表
    ↓
Response: ChainConfigs List
```

### 3. 创建链配置（仅 localhost）

```
POST /api/admin/chains
```

**请求**（仅 localhost）:
```json
{
  "chain_id": 195,
  "chain_name": "TRON",
  "treasury_address": "TL...",
  "intent_manager_address": "TL...",
  "zkpay_address": "TL...",
  "rpc_endpoint": "https://api.tronstack.io/rpc",
  "explorer_url": "https://tronscan.org",
  "sync_enabled": true
}
```

**响应** (201):
```json
{
  "message": "Chain created successfully",
  "chain": { /* ChainConfig */ }
}
```

---

## 8.7 池和代币信息（公开）

### 1. 列出所有池

```
GET /api/pools
```

**响应** (200):
```json
{
  "pools": [
    {
      "id": 1,
      "name": "Ethereum Main Pool",
      "description": "Primary liquidity pool for Ethereum",
      "logo_url": "...",
      "is_featured": true,
      "token_count": 5
    }
  ],
  "total": 10
}
```

### 2. 获取池详情

```
GET /api/pools/:id
```

**响应** (200):
```json
{
  "pool": {
    "id": 1,
    "name": "Ethereum Main Pool",
    "description": "...",
    "tokens": [
      {
        "id": 1,
        "pool_id": 1,
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": 6,
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
      }
    ]
  }
}
```

### 3. 获取池指标

```
GET /api/pools/:id/metrics
```

**响应** (200):
```json
{
  "metrics": {
    "tvl": "1000000000",
    "apr": "4.5%",
    "users": 1234,
    "last_updated": "2025-01-24T10:00:00Z"
  }
}
```

---

## 8.8 完整端到端流程示例

### 场景：用户从 Ethereum 存款 USDC，在 Polygon 提取 aUSDC

```
1️⃣ 用户钱包连接（前端）
   ├─ GET /api/auth/nonce
   │  └─ 后端返回 Nonce
   ├─ 用户签名 Nonce（钱包）
   └─ POST /api/auth/login
      └─ 后端返回 JWT Token

2️⃣ 查询存款信息（前端）
   ├─ GET /api/deposits/1/12345
   └─ 获取存款 USDC 金额

3️⃣ 创建 Checkbook（后端）
   ├─ POST /api/checkbooks
   │  ├─ 创建 Checkbook 记录
   │  ├─ 分割成多个 Allocations
   │  └─ 状态：pending → ... → with_checkbook
   └─ 返回 Checkbook ID

4️⃣ 查询最优路由和费用（前端）
   ├─ POST /api/v2/quote/route-and-fees
   │  ├─ 源链：Ethereum (USDC)
   │  ├─ 目标链：Polygon (aUSDC)
   │  └─ 金额：100 USDC
   └─ 返回：路由、费用、预计产出

5️⃣ 查询 Hook 资产信息（前端，可选）
   ├─ POST /api/v2/quote/hook-asset
   │  ├─ 协议：Aave
   │  ├─ 资产：aUSDC
   │  ├─ 链：Polygon (137)
   │  └─ 获取 APY、费用等
   └─ 返回：Asset 信息

6️⃣ 创建提款请求（前端）
   ├─ POST /api/withdraws/submit
   │  ├─ 选择 Allocations
   │  ├─ 指定 Intent（RawToken 或 AssetToken）
   │  ├─ 设置 maxSlippageBps 等约束
   │  └─ 返回 WithdrawRequest ID
   └─ Allocation 状态：idle → pending

7️⃣ 生成 ZK Proof（后端异步）
   ├─ Service: GenerateProof()
   │  ├─ 调用 ZKVM 服务
   │  ├─ 输入：Allocations, Intent 信息
   │  ├─ 输出：ZK Proof
   │  └─ 状态：created → proving → proof_generated
   └─ Nullifier 生成（但还未在链上消费）

8️⃣ 提交链上验证（后端异步）
   ├─ Service: ExecuteWithdraw()
   │  ├─ 构建 executeWithdraw TX
   │  ├─ 将 Proof 提交到链上
   │  ├─ 验证 Proof 和 Nullifiers
   │  ├─ 消费 Nullifiers（不可逆！）
   │  └─ 记录 RouteConstraints
   ├─ 状态：submitting → execute_confirmed ✅
   └─ Allocation 状态：pending → used ❌

9️⃣ Payout 执行（后端异步或受益人触发）
   ├─ Service: ExecutePayout()
   │  ├─ 查询 LiFi 路由（Ethereum → Polygon）
   │  ├─ 执行跨链桥接
   │  ├─ 资金到达 Polygon IntentManager
   │  └─ 状态：waiting_for_payout → payout_completed ✅
   └─ 资金现在在目标链上

🔟 Hook 购买（可选，受益人触发）
   ├─ Service: ExecuteHook()
   │  ├─ IntentManager 执行 Hook calldata
   │  ├─ 调用 Aave 协议
   │  ├─ USDC → aUSDC 购买
   │  └─ 资金到达受益人钱包
   └─ 状态：hook_processing → completed ✅

✅ 完成！
   ├─ WithdrawRequest 状态：completed
   ├─ 受益人在 Polygon 收到 aUSDC
   ├─ 资金开始在 Aave 生息
   └─ 用户可以在 Dashboard 查看状态
```

---

## 8.9 错误处理和重试机制

### 重试流程

```
Proof 生成失败 → proof_failed
    ↓
User: POST /api/my/withdraw-requests/:id/retry
    ↓
Backend: 重新调用 ZKVM
    ├─ 如果成功 → proof_generated ✅
    └─ 如果失败 → proof_failed ❌ (可再次重试)

---

Chain TX 提交失败 → submit_failed
    ↓
User: POST /api/my/withdraw-requests/:id/retry
    ↓
Backend: 重新提交 executeWithdraw TX
    ├─ 如果成功 → execute_confirmed ✅
    ├─ 如果验证失败 → failed_permanent ❌（不可重试）
    └─ 如果网络错误 → submit_failed ❌（可再次重试）

---

Payout 跨链失败 → payout_failed
    ↓
Beneficiary: POST /api/my/beneficiary-withdraw-requests/:id/request-payout
    ↓
Backend: 重新执行跨链
    ├─ 最多重试 5 次
    ├─ 间隔：30s → 1m → 2m → 4m → 8m
    └─ 如果最后还是失败：
       └─ Beneficiary: POST .../claim-timeout
          └─ 在源链直接转账（不跨链）
```

---

## 8.10 监控和日志

### 关键日志点

```
[Router] 请求进入
  ├─ Endpoint: POST /api/withdraws/submit
  ├─ User: 0x...
  └─ Timestamp: 2025-01-24T10:00:00Z

[Middleware] JWT 验证
  ├─ Token 有效 ✅
  └─ User Address: 0x...

[Handler] 处理请求
  ├─ Checkbook ID: cb-001
  ├─ Allocations: [alloc-001, alloc-002]
  └─ Intent: RawToken → Polygon

[Service] 业务逻辑
  ├─ 生成 Proof...
  ├─ Proof 成功 ✅
  ├─ 提交 executeWithdraw TX...
  ├─ TX Hash: 0x...
  └─ 链上确认 ✅

[Repository] 数据库操作
  ├─ INSERT withdraw_request
  ├─ UPDATE allocations.status = used
  └─ COMMIT ✅

[Response] 返回结果
  ├─ Status: 201
  ├─ WithdrawRequest ID: wr-001
  └─ Status: proof_generated
```

### 告警配置

```
告警 1: Proof 生成超过 5 分钟
  └─ 可能原因：ZKVM 服务故障

告警 2: 链上 TX 未确认超过 30 分钟
  └─ 可能原因：网络拥堵、Gas 不足

告警 3: Payout 跨链超过 2 小时
  └─ 可能原因：桥接故障、流动性不足

告警 4: 大量 WithdrawRequest 进入 payout_failed
  └─ 可能原因：LiFi API 故障、市场变化剧烈
```
