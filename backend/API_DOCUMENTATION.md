# ZKPay Backend API 完整文档

> **最后更新**: 2025-01-XX  
> **版本**: v2.0

---

## 📋 目录

1. [架构概览](#架构概览)
2. [所有API端点速查表](#所有api端点速查表)
3. [核心流程](#核心流程)
4. [API 接口详细说明](#api-接口详细说明)
5. [数据流与状态转换](#数据流与状态转换)
6. [快速集成指南](#快速集成指南)
7. [常见问题与监控](#常见问题与监控)

---

## 🏗️ 架构概览

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    外部服务层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ BlockScanner │  │  ZKVM Service │  │  KMS Service │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ NATS Events
┌───────────────────────────┼─────────────────────────────────┐
│                    ZKPay Backend                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              API 层 (Gin Router)                      │  │
│  │  • REST APIs  • WebSocket  • JWT Auth                │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              服务层 (Business Logic)                  │  │
│  │  • Event Processor  • Transaction Service           │  │
│  │  • Query Service    • Push Service                  │  │
│  │  • Retry Service    • Key Management                │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           数据层 (GORM + PostgreSQL/SQLite)            │  │
│  │  • Models  • Repositories  • Migrations             │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### 请求处理流程

```
User Request
    ↓
Router (Gin)
    ↓
Middleware (Auth/CORS)
    ↓
Handler (Request Validation)
    ↓
Service (Business Logic)
    ↓
Repository (Database Operations)
    ↓
Response
```

---

## 📋 所有API端点速查表

### 🔐 认证 (无认证)

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/auth/nonce` | 获取签名挑战 Nonce |
| POST | `/api/auth/login` | 钱包签名登录获取 JWT |

### 💰 存款 (部分认证)

| 方法 | 端点 | 认证 | 功能 |
|------|------|------|------|
| GET | `/api/deposits/:chainId/:localDepositId` | ❌ | 查询存款信息 |
| GET | `/api/deposits/by-owner` | ✅ | 查询用户的所有存款 |
| POST | `/api/checkbooks` | ✅ | 创建 Checkbook |
| GET | `/api/checkbooks` | ✅ | 列出用户的 Checkbooks |
| GET | `/api/checkbooks/id/:id` | ✅ | 查询单个 Checkbook |
| DELETE | `/api/checkbooks/:id` | ✅ | 删除 Checkbook |

### 📤 提款 (认证)

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/api/withdraws/submit` | 创建提款请求 |
| GET | `/api/my/withdraw-requests` | 列出用户的提款请求 |
| GET | `/api/my/withdraw-requests/:id` | 查询单个提款请求 |
| GET | `/api/my/withdraw-requests/by-nullifier/:nullifier` | 按 nullifier 查询 |
| POST | `/api/my/withdraw-requests/:id/retry` | 重试失败的提款 |
| POST | `/api/my/withdraw-requests/:id/retry-payout` | 重试 Payout |
| POST | `/api/my/withdraw-requests/:id/retry-fallback` | 重试 Fallback |
| DELETE | `/api/my/withdraw-requests/:id` | 取消提款请求 |

### 👥 受益人操作 (认证)

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/my/beneficiary-withdraw-requests` | 查询作为受益人的请求 |
| POST | `/api/my/beneficiary-withdraw-requests/:id/request-payout` | 请求执行 Payout |
| POST | `/api/my/beneficiary-withdraw-requests/:id/claim-timeout` | 超时领取 |

### 🛣️ 报价 (无认证)

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/api/v2/quote/route-and-fees` | 查询路由和费用 |
| POST | `/api/v2/quote/hook-asset` | 查询 Hook 资产信息 |

### 🔗 链配置 (部分认证)

| 方法 | 端点 | 认证 | 功能 |
|------|------|------|------|
| GET | `/api/chains` | ❌ | 列出所有活跃链 |
| GET | `/api/chains/:chain_id` | ❌ | 获取链配置 |
| POST | `/api/admin/chains` | 🔒 | 创建链配置（仅 localhost） |
| PUT | `/api/admin/chains/:chain_id` | 🔒 | 更新链配置（仅 localhost） |
| DELETE | `/api/admin/chains/:chain_id` | 🔒 | 删除链配置（仅 localhost） |
| GET | `/api/admin/chains/:chain_id/adapters` | 🔒 | 列出链的适配器 |
| POST | `/api/admin/chains/:chain_id/adapters` | 🔒 | 创建适配器 |
| PUT | `/api/admin/chains/:chain_id/adapters/:adapter_id` | 🔒 | 更新适配器 |
| DELETE | `/api/admin/chains/:chain_id/adapters/:adapter_id` | 🔒 | 删除适配器 |

### 🏊 池和代币 (无认证)

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/pools` | 列出所有池 |
| GET | `/api/pools/featured` | 获取推荐池 |
| GET | `/api/pools/:id` | 获取池详情 |
| GET | `/api/pools/:id/tokens` | 获取池的代币 |
| GET | `/api/pools/:id/tokens/:token_id` | 获取单个代币 |
| GET | `/api/tokens/search` | 搜索代币 |

### 📊 指标 (无认证)

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/pools/:id/metrics` | 获取池指标 |
| GET | `/api/pools/:id/metrics/history` | 获取池指标历史 |
| POST | `/api/pools/metrics` | 批量获取池指标 |
| GET | `/api/tokens/:asset_id/metrics` | 获取代币指标 |
| GET | `/api/tokens/:asset_id/metrics/history` | 获取代币指标历史 |
| POST | `/api/tokens/metrics` | 批量获取代币指标 |

### 🔀 Token 路由规则 (部分认证)

| 方法 | 端点 | 认证 | 功能 |
|------|------|------|------|
| GET | `/api/v2/token-routing/allowed-targets` | ❌ | 查询允许的目标链和代币（支持无参数查询所有） |
| POST | `/api/admin/token-routing/rules` | 🔒 | 创建路由规则（仅 localhost） |
| GET | `/api/admin/token-routing/rules` | 🔒 | 列出路由规则（仅 localhost） |
| GET | `/api/admin/token-routing/rules/:id` | 🔒 | 获取路由规则（仅 localhost） |
| PUT | `/api/admin/token-routing/rules/:id` | 🔒 | 更新路由规则（仅 localhost） |
| DELETE | `/api/admin/token-routing/rules/:id` | 🔒 | 删除路由规则（仅 localhost） |

### 🔧 管理员 Pool 管理 (仅 localhost)

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/admin/pools` | 列出所有 Pool |
| GET | `/api/admin/pools/:id` | 获取 Pool 详情 |
| POST | `/api/admin/pools` | 创建 Pool |
| PUT | `/api/admin/pools/:id` | 更新 Pool |
| DELETE | `/api/admin/pools/:id` | 删除 Pool |
| GET | `/api/admin/pools/:id/tokens/:token_id` | 获取 Token |
| POST | `/api/admin/pools/:id/tokens` | 创建 Token |
| PUT | `/api/admin/pools/:id/tokens/:token_id` | 更新 Token |
| DELETE | `/api/admin/pools/:id/tokens/:token_id` | 删除 Token |
| GET | `/api/admin/pools/:id/tokens/:token_id/chain-config` | 获取 Token 链配置 |
| POST | `/api/admin/pools/:id/tokens/:token_id/chain-config` | 创建/更新 Token 链配置 |
| DELETE | `/api/admin/pools/:id/tokens/:token_id/chain-config` | 删除 Token 链配置 |

### 🔌 WebSocket

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/ws` | WebSocket 连接（实时推送状态更新） |
| GET | `/api/status-stream` | Server-Sent Events (SSE) |
| GET | `/api/ws/status` | 查询连接状态 |

---

## 🔄 核心流程

### 1️⃣ 认证登录流程

**目的**: 用户通过钱包签名获取 JWT Token

```
GET /api/auth/nonce
  ↓ 获得 Nonce
用户签名 Nonce（钱包）
  ↓
POST /api/auth/login
  ├─ 验证签名
  ├─ 生成 JWT
  └─ 返回 Token

JWT 格式: Authorization: Bearer <token>
有效期: 24 小时
包含: user_address, chain_id
```

---

### 2️⃣ 存款→提款生命周期

```
1. GET /api/deposits/:chainId/:localDepositId
   ├─ 查询链上存款信息
   └─ 获取金额、手续费等

2. POST /api/checkbooks (需 JWT)
   ├─ 创建 Checkbook 记录
   ├─ 分割成多个 Allocations
   └─ 状态转换：pending → with_checkbook

3. POST /api/withdraws/submit (需 JWT)
   ├─ 创建 WithdrawRequest
   ├─ 选择 Allocations
   ├─ 指定 Intent（RawToken 或 AssetToken）
   └─ 状态：created → proving → proof_generated

4. [后端异步执行]
   ├─ 生成 ZK Proof (ZKVM)
   ├─ 提交 executeWithdraw TX
   ├─ 消费 Nullifiers（不可逆！）
   ├─ 状态：submitting → execute_confirmed
   └─ Allocation：idle → pending → used

5. 受益人操作
   ├─ GET /api/my/beneficiary-withdraw-requests
   ├─ POST .../request-payout (或自动执行)
   │  ├─ LiFi 跨链
   │  └─ 资金到 IntentManager
   └─ POST .../request-hook (可选)
      ├─ 执行 Hook calldata
      └─ USDT → aUSDC (示例)

6. 最终状态：completed ✅
```

**详细流程**:

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段 1: 链上存款事件监听                                      │
└─────────────────────────────────────────────────────────────┘
BlockScanner 监听链上事件
    ↓
NATS Event: zkpay.*.Treasury.DepositReceived
    ↓
Event Processor 处理事件
    ↓
创建 Checkbook (status: pending)

┌─────────────────────────────────────────────────────────────┐
│ 阶段 2: 创建 Commitment (可选，手动触发)                      │
└─────────────────────────────────────────────────────────────┘
POST /api/commitments/submit (需 JWT)
    ├─> 验证 Checkbook 所有权
    ├─> 调用 ZKVM 生成 Proof
    ├─> 提交 Commitment TX 到链上
    └─> 等待链上确认 → with_checkbook ✅

┌─────────────────────────────────────────────────────────────┐
│ 阶段 3: 创建提款请求                                          │
└─────────────────────────────────────────────────────────────┘
POST /api/withdraws/submit (需 JWT)
    ├─> 输入:
    │   - checkbook_id: Checkbook ID
    │   - allocations: Allocation ID 数组
    │   - intent: {
    │       type: "RawToken" | "AssetToken"
    │       beneficiary: { chain_id, address }
    │       tokenIdentifier: (RawToken 时)
    │       assetId: (AssetToken 时)
    │     }
    ├─> 创建 WithdrawRequest
    │   - proof_status: pending
    │   - execute_status: pending
    │   - payout_status: pending
    │   - hook_status: not_required
    └─> 锁定 Allocations (idle → pending)

┌─────────────────────────────────────────────────────────────┐
│ 阶段 4: ZK Proof 生成 (异步)                                  │
└─────────────────────────────────────────────────────────────┘
后端自动调用 ZKVM Service
    ├─> proof_status: pending → proving
    ├─> 生成 ZK Proof
    ├─> proof_status: proving → proof_generated ✅
    └─> 自动触发阶段 5

┌─────────────────────────────────────────────────────────────┐
│ 阶段 5: 链上执行 (异步)                                        │
└─────────────────────────────────────────────────────────────┘
后端自动提交 executeWithdraw TX
    ├─> execute_status: pending → submitting
    ├─> 提交交易到链上
    ├─> 等待链上确认
    ├─> execute_status: submitting → execute_confirmed ✅
    ├─> 消费 Nullifiers (不可逆！)
    └─> Allocations: pending → used ❌

┌─────────────────────────────────────────────────────────────┐
│ 阶段 6: Payout 执行 (Intent 执行)                              │
└─────────────────────────────────────────────────────────────┘
等待受益人请求或自动执行
    ├─> payout_status: pending → waiting_for_payout
    ├─> POST /api/my/beneficiary-withdraw-requests/:id/request-payout
    │   └─> 多签服务执行跨链转账 (LiFi/deBridge)
    ├─> payout_status: waiting_for_payout → payout_processing
    ├─> 监听链上事件: Treasury.PayoutExecuted
    └─> payout_status: payout_processing → payout_completed ✅

┌─────────────────────────────────────────────────────────────┐
│ 阶段 7: Hook 购买 (可选)                                       │
└─────────────────────────────────────────────────────────────┘
如果 Intent 包含 Hook
    ├─> hook_status: not_required → hook_processing
    ├─> 执行 Hook calldata (例如: USDT → aUSDC)
    ├─> 监听链上事件: IntentManager.HookExecuted
    └─> hook_status: hook_processing → hook_completed ✅
    
如果 Hook 失败:
    ├─> hook_status: hook_processing → hook_failed
    └─> 自动执行 Fallback (转账原始代币)
        └─> fallback_transferred: true ✅
```

---

### 3️⃣ 报价和费用查询

```
POST /api/v2/quote/route-and-fees
  ├─ 输入：源链、目标链、代币、金额
  ├─ TRON 检查：禁用 Hook，限制代币
  ├─ Hook 检查：仅支持主要 EVM 链
  ├─ 调用 LiFi/deBridge API
  ├─ 查询 Gas 价格
  └─ 输出：路由、费用、预计产出

POST /api/v2/quote/hook-asset
  ├─ 输入：链、协议、资产
  ├─ 检查 Hook 支持
  └─ 输出：APY、费用、风险等级
```

---

### 4️⃣ Token 路由规则查询

```
GET /api/v2/token-routing/allowed-targets?source_chain_id=714&source_token_id=0x...
  ├─ 查询指定源链+代币的允许目标
  └─ 返回：{目标链ID: [Token ID列表]}

GET /api/v2/token-routing/allowed-targets (无参数)
  ├─ 返回所有活跃的 Pool 和 Token
  └─ 按链分组：{chain_id: {pools: [{pool_id, pool_name, pool_address, tokens: [...]}]}}
```

---

### 5️⃣ 错误和重试

```
Proof 生成失败
  └─ POST /api/my/withdraw-requests/:id/retry
     ├─ 重新调用 ZKVM
     └─ 无次数限制

Chain TX 提交失败
  └─ POST /api/my/withdraw-requests/:id/retry
     ├─ 重新提交 TX
     ├─ submit_failed → 可重试
     └─ verify_failed → 不可重试

Payout 失败
  └─ POST /api/my/beneficiary-withdraw-requests/:id/request-payout
     ├─ 最多 5 次重试
     ├─ 超时后可 claim-timeout
     └─ 在源链直接转账
```

---

## 📡 API 接口详细说明

### 🔐 认证相关

#### GET /api/auth/nonce
**功能**: 获取签名挑战 Nonce  
**认证**: ❌ 无需认证  
**请求**: 无参数  
**响应**:
```json
{
  "nonce": "random_string_here"
}
```

#### POST /api/auth/login
**功能**: 钱包签名登录获取 JWT  
**认证**: ❌ 无需认证  
**请求**:
```json
{
  "wallet_address": "0x...",
  "chain_id": 60,
  "signature": "0x...",
  "message": "nonce_string"
}
```
**响应**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "success"
}
```

---

### 💰 存款相关

#### GET /api/deposits/:chainId/:localDepositId
**功能**: 查询存款信息  
**认证**: ❌ 无需认证  
**响应**:
```json
{
  "chain_id": 60,
  "local_deposit_id": 123,
  "amount": "1000000000000000000",
  "token_id": 1,
  "owner": {
    "chain_id": 60,
    "data": "0x..."
  }
}
```

#### GET /api/deposits/by-owner
**功能**: 查询用户的所有存款  
**认证**: ✅ 需要 JWT  
**响应**: 存款列表数组

---

### 📝 Checkbook 相关

#### POST /api/checkbooks
**功能**: 创建 Checkbook（已废弃，由事件自动创建）  
**认证**: ✅ 需要 JWT

#### GET /api/checkbooks
**功能**: 列出用户的 Checkbooks  
**认证**: ✅ 需要 JWT  
**查询参数**:
- `page`: 页码 (默认: 1)
- `page_size`: 每页数量 (默认: 20)
- `status`: 状态筛选

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "checkbook-id",
      "status": "with_checkbook",
      "amount": "1000000000000000000",
      "allocatable_amount": "990000000000000000",
      "chain_id": 60,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100
  }
}
```

#### GET /api/checkbooks/id/:id
**功能**: 查询单个 Checkbook  
**认证**: ✅ 需要 JWT

#### DELETE /api/checkbooks/:id
**功能**: 删除 Checkbook（软删除）  
**认证**: ✅ 需要 JWT

---

### 📤 提款相关

#### POST /api/withdraws/submit
**功能**: 创建提款请求  
**认证**: ✅ 需要 JWT  
**请求**:
```json
{
  "checkbook_id": "checkbook-id",
  "allocations": ["alloc-1", "alloc-2"],
  "intent": {
    "type": 0,
    "beneficiaryChainId": 60,
    "beneficiaryAddress": "0x...",
    "tokenIdentifier": "0x...",
    "preferredChain": 1
  }
}
```
**响应**:
```json
{
  "success": true,
  "data": {
    "id": "withdraw-request-id",
    "status": "created",
    "proof_status": "pending",
    "execute_status": "pending",
    "payout_status": "pending"
  }
}
```

#### GET /api/my/withdraw-requests
**功能**: 列出用户的提款请求  
**认证**: ✅ 需要 JWT  
**查询参数**:
- `page`: 页码
- `page_size`: 每页数量
- `status`: 状态筛选

#### GET /api/my/withdraw-requests/:id
**功能**: 查询单个提款请求  
**认证**: ✅ 需要 JWT

#### GET /api/my/withdraw-requests/by-nullifier/:nullifier
**功能**: 按 nullifier 查询提款请求  
**认证**: ✅ 需要 JWT

#### POST /api/my/withdraw-requests/:id/retry
**功能**: 重试失败的提款  
**认证**: ✅ 需要 JWT  
**说明**: 
- Proof 失败: 重新生成 Proof
- TX 提交失败: 重新提交交易
- verify_failed 状态不可重试

#### DELETE /api/my/withdraw-requests/:id
**功能**: 取消提款请求  
**认证**: ✅ 需要 JWT  
**说明**: 仅在 Stage 1 (proof 阶段) 可取消

---

### 👥 受益人操作

#### GET /api/my/beneficiary-withdraw-requests
**功能**: 查询作为受益人的请求  
**认证**: ✅ 需要 JWT

#### POST /api/my/beneficiary-withdraw-requests/:id/request-payout
**功能**: 请求执行 Payout  
**认证**: ✅ 需要 JWT  
**说明**: 触发多签服务执行跨链转账

#### POST /api/my/beneficiary-withdraw-requests/:id/claim-timeout
**功能**: 超时领取  
**认证**: ✅ 需要 JWT  
**说明**: Payout 超时后，在源链直接转账

---

### 🛣️ 报价相关

#### POST /api/v2/quote/route-and-fees
**功能**: 查询路由和费用  
**认证**: ❌ 无需认证  
**请求**:
```json
{
  "owner_data": {
    "chain_id": 60,
    "data": "0x..."
  },
  "deposit_token": "0x...",
  "intent": {
    "type": "RawToken",
    "beneficiary": {
      "chain_id": 1,
      "data": "0x..."
    }
  },
  "amount": "1000000000000000000",
  "include_hook": true
}
```
**响应**:
```json
{
  "route": {
    "bridge": "lifi",
    "steps": [...]
  },
  "fees": {
    "bridge_fee": "10000000000000000",
    "gas_estimate": "50000"
  },
  "estimated_output": "980000000000000000"
}
```

#### POST /api/v2/quote/hook-asset
**功能**: 查询 Hook 资产信息  
**认证**: ❌ 无需认证

---

### 🏊 Pool 和代币相关

#### GET /api/pools
**功能**: 列出所有池  
**认证**: ❌ 无需认证

#### GET /api/pools/featured
**功能**: 获取推荐池  
**认证**: ❌ 无需认证

#### GET /api/pools/:id
**功能**: 获取池详情  
**认证**: ❌ 无需认证

#### GET /api/pools/:id/tokens
**功能**: 获取池的代币列表  
**认证**: ❌ 无需认证

#### GET /api/pools/:id/tokens/:token_id
**功能**: 获取单个代币  
**认证**: ❌ 无需认证

#### GET /api/tokens/search
**功能**: 搜索代币  
**认证**: ❌ 无需认证  
**查询参数**: `keyword`

---

### 📊 指标相关

#### GET /api/pools/:id/metrics
**功能**: 获取池指标  
**认证**: ❌ 无需认证

#### GET /api/pools/:id/metrics/history
**功能**: 获取池指标历史  
**认证**: ❌ 无需认证

#### POST /api/pools/metrics
**功能**: 批量获取池指标  
**认证**: ❌ 无需认证

#### GET /api/tokens/:asset_id/metrics
**功能**: 获取代币指标  
**认证**: ❌ 无需认证

#### GET /api/tokens/:asset_id/metrics/history
**功能**: 获取代币指标历史  
**认证**: ❌ 无需认证

#### POST /api/tokens/metrics
**功能**: 批量获取代币指标  
**认证**: ❌ 无需认证

---

### 🔗 链配置相关

#### GET /api/chains
**功能**: 列出所有活跃链  
**认证**: ❌ 无需认证

#### GET /api/chains/:chain_id
**功能**: 获取链配置（包含该链的所有适配器）  
**认证**: ❌ 无需认证

**响应**:
```json
{
  "chain": {
    "chain_id": 714,
    "chain_name": "BSC",
    "treasury_address": "0x...",
    "intent_manager_address": "0x...",
    "zkpay_address": "0x...",
    "rpc_endpoint": "https://...",
    "explorer_url": "https://bscscan.com"
  },
  "adapters": [
    {
      "id": 1,
      "adapter_id": 1,
      "chain_id": 714,
      "address": "0x...",
      "name": "Aave V3 Adapter",
      "protocol": "Aave V3",
      "is_active": true
    }
  ]
}
```

#### POST /api/admin/chains
**功能**: 创建链配置  
**认证**: 🔒 仅 localhost

#### PUT /api/admin/chains/:chain_id
**功能**: 更新链配置  
**认证**: 🔒 仅 localhost

#### DELETE /api/admin/chains/:chain_id
**功能**: 删除链配置（软删除）  
**认证**: 🔒 仅 localhost

#### GET /api/admin/chains/:chain_id/adapters
**功能**: 列出链的适配器  
**认证**: 🔒 仅 localhost

#### POST /api/admin/chains/:chain_id/adapters
**功能**: 创建适配器  
**认证**: 🔒 仅 localhost  
**请求**:
```json
{
  "adapter_id": 1,
  "adapter_address": "0x...",
  "protocol": "Aave V3"
}
```

#### PUT /api/admin/chains/:chain_id/adapters/:adapter_id
**功能**: 更新适配器  
**认证**: 🔒 仅 localhost  
**请求**:
```json
{
  "adapter_address": "0x...",
  "protocol": "Aave V3",
  "is_active": true
}
```

#### DELETE /api/admin/chains/:chain_id/adapters/:adapter_id
**功能**: 删除适配器（软删除）  
**认证**: 🔒 仅 localhost

---

### 🔀 Token 路由规则

#### GET /api/v2/token-routing/allowed-targets
**功能**: 查询允许的目标链和代币  
**认证**: ❌ 无需认证

**查询参数**（可选）:
- `source_chain_id` - 源链 SLIP-44 ID
- `source_token_id` - 源 Token ID

**场景 1: 带参数查询（增强功能 - 返回完整Pool信息）** ⭐
```bash
GET /api/token-routing/allowed-targets?source_chain_id=714&source_token_id=0x55d398326f99059fF775485246999027B3197955
```

**响应**（增强后）:
```json
{
  "source_chain_id": 714,
  "source_token_id": "0x55d398326f99059fF775485246999027B3197955",
  "allowed_targets": [
    {
      "chain_id": 60,
      "pools": [
        {
          "pool_id": 1,
          "pool_name": "Aave V3 Adapter",
          "pool_address": "0x...",
          "tokens": [
            {
              "token_symbol": "aUSDT",
              "token_id": 1,
              "token_address": "0x...",
              "token_id_in_rule": "0x0000003c000000010001000000000000000000000000000000000000000000000000",
              "token_type": "asset_token"
            }
          ]
        }
      ]
    },
    {
      "chain_id": 966,
      "pools": [
        {
          "pool_id": 0,
          "pool_name": "Direct Transfer",
          "pool_address": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
          "tokens": [
            {
              "token_symbol": "USDT",
              "token_id": 0,
              "token_address": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
              "token_id_in_rule": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
              "token_type": "raw_token"
            }
          ]
        }
      ]
    }
  ]
}
```

**说明**:
- 返回格式已增强，包含完整的链、Pool、Token信息
- `pool_id = 0` 表示 RawToken（直接转账，无Pool）
- `token_id_in_rule` 是路由规则中的原始 token_id（asset_id 或 token_address）
- `token_type` 标识是 `asset_token` 还是 `raw_token`

**场景 2: 无参数查询（返回所有 Pool 和 Token）**
```bash
GET /api/v2/token-routing/allowed-targets
```

**响应**:
```json
{
  "chains": [
    {
      "chain_id": 714,
      "pools": [
        {
          "pool_id": 1,
          "pool_name": "Aave V3 Adapter",
          "pool_address": "0x...",
          "tokens": [
            {
              "token_symbol": "aUSDT",
              "token_id": 1,
              "token_address": "0x..."
            }
          ]
        }
      ]
    }
  ],
  "total_chains": 1
}
```

#### POST /api/admin/token-routing/rules
**功能**: 创建路由规则  
**认证**: 🔒 仅 localhost  
**请求**:
```json
{
  "source_chain_id": 714,
  "source_token_id": "0x55d398326f99059fF775485246999027B3197955",
  "source_token_type": "raw_token",
  "targets": [
    {
      "target_chain_id": 60,
      "target_token_id": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "target_token_type": "raw_token",
      "priority": 10
    },
    {
      "target_chain_id": 966,
      "target_token_id": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      "target_token_type": "raw_token",
      "priority": 5
    }
  ],
  "description": "BSC USDT -> Multiple chains",
  "is_active": true
}
```

**说明**: 支持批量创建多个目标规则

#### GET /api/admin/token-routing/rules
**功能**: 列出路由规则  
**认证**: 🔒 仅 localhost  
**查询参数**（可选）:
- `source_chain_id` - 过滤源链 ID
- `source_token_id` - 过滤源 Token ID
- `is_active` - 过滤激活状态

#### GET /api/admin/token-routing/rules/:id
**功能**: 获取路由规则  
**认证**: 🔒 仅 localhost

#### PUT /api/admin/token-routing/rules/:id
**功能**: 更新路由规则  
**认证**: 🔒 仅 localhost  
**请求体**（所有字段可选）:
```json
{
  "priority": 20,
  "is_active": false,
  "description": "Updated description"
}
```

#### DELETE /api/admin/token-routing/rules/:id
**功能**: 删除路由规则（软删除）  
**认证**: 🔒 仅 localhost

---

### 🔧 管理员 Pool 管理

#### GET /api/admin/pools
**功能**: 列出所有 Pool  
**认证**: 🔒 仅 localhost

#### GET /api/admin/pools/:id
**功能**: 获取 Pool 详情  
**认证**: 🔒 仅 localhost

#### POST /api/admin/pools
**功能**: 创建 Pool  
**认证**: 🔒 仅 localhost  
**请求**:
```json
{
  "adapter_id": 1,
  "chain_id": 714,
  "address": "0x...",
  "name": "Aave V3 Adapter",
  "description": "Aave V3 lending pool adapter",
  "protocol": "Aave V3",
  "version": "v3.0"
}
```

#### PUT /api/admin/pools/:id
**功能**: 更新 Pool  
**认证**: 🔒 仅 localhost

#### DELETE /api/admin/pools/:id
**功能**: 删除 Pool（软删除）  
**认证**: 🔒 仅 localhost

#### GET /api/admin/pools/:id/tokens/:token_id
**功能**: 获取 Token  
**认证**: 🔒 仅 localhost

#### POST /api/admin/pools/:id/tokens
**功能**: 创建 Token  
**认证**: 🔒 仅 localhost  
**请求**:
```json
{
  "token_id": 1,
  "symbol": "aUSDT",
  "name": "Aave USDT",
  "decimals": 6,
  "base_token": "0x...",
  "description": "Aave V3 USDT token"
}
```

#### PUT /api/admin/pools/:id/tokens/:token_id
**功能**: 更新 Token  
**认证**: 🔒 仅 localhost

#### DELETE /api/admin/pools/:id/tokens/:token_id
**功能**: 删除 Token（软删除）  
**认证**: 🔒 仅 localhost

#### GET /api/admin/pools/:id/tokens/:token_id/chain-config
**功能**: 获取 Token 链配置  
**认证**: 🔒 仅 localhost  
**查询参数**: `chain_id` (必需)

#### POST /api/admin/pools/:id/tokens/:token_id/chain-config
**功能**: 创建/更新 Token 链配置  
**认证**: 🔒 仅 localhost  
**请求**:
```json
{
  "chain_id": 714,
  "chain_name": "BSC",
  "adapter_address": "0x...",
  "adapter_name": "AaveV3USDTAdapter",
  "asset_token_address": "0x...",
  "apy": "5.23",
  "tvl": "1000000",
  "is_active": true,
  "supports_cross_chain": true,
  "min_withdraw": "1000000",
  "max_withdraw": "1000000000000"
}
```

#### DELETE /api/admin/pools/:id/tokens/:token_id/chain-config
**功能**: 删除 Token 链配置  
**认证**: 🔒 仅 localhost  
**查询参数**: `chain_id` (必需)

---

## 🔄 数据流与状态转换

### 事件驱动流程

```
BlockScanner
    ↓ (NATS Events)
Event Processor
    ↓
Service Layer
    ↓
Repository
    ↓
Database
    ↓
WebSocket Push (实时通知)
```

### 主要事件类型

1. **DepositRecorded**: 存款已记录 → 创建 Checkbook
2. **CommitmentRootUpdated**: Commitment 已更新 → 更新 Checkbook 状态
3. **WithdrawExecuted**: 提款已执行 → 更新 WithdrawRequest execute_status
4. **PayoutExecuted**: Payout 已执行 → 更新 payout_status
5. **PayoutFailed**: Payout 失败 → 记录错误，允许重试
6. **HookExecuted**: Hook 已执行 → 更新 hook_status
7. **HookFailed**: Hook 失败 → 触发 Fallback
8. **FallbackTransferred**: Fallback 转账成功 → 标记完成
9. **ManuallyResolved**: 人工处理完成 → 标记为终态

---

### 状态转换

#### Checkbook 状态

```
pending → unsigned → ready_for_commitment → generating_proof 
  → submitting_commitment → commitment_pending → with_checkbook ✅
  
失败路径:
  generating_proof → proof_failed ❌
  submitting_commitment → submission_failed ❌
```

#### WithdrawRequest 主状态

```
created → proving → proof_generated → submitting → execute_confirmed
  → waiting_for_payout → payout_processing → payout_completed
  → [hook_processing] → completed ✅
  
失败路径:
  proof_failed → 可重试
  submit_failed → 可重试
  verify_failed → 不可重试，需取消
  payout_failed → 可重试 (最多5次)
  hook_failed + fallback_failed → failed_permanent (等待人工处理)
```

#### Allocation 状态

```
idle → pending → used ❌ (不可逆)
  ↑─────────────────┘ (Stage 1 失败时可释放)
```

---

## 🚀 快速集成指南

### 前端集成（3步）

```javascript
// 1. 获取 Nonce 和登录
const nonce = await api.get('/api/auth/nonce');
const token = await api.post('/api/auth/login', {
  wallet_address: userAddress,
  chain_id: chainId,
  signature: userSignature
});

// 2. 查询报价
const quote = await api.post('/api/v2/quote/route-and-fees', {
  owner_data: { chain_id, data: userAddress },
  deposit_token: tokenAddress,
  intent: { type: 'RawToken', ... },
  amount: amountInWei,
  include_hook: true
});

// 3. 创建提款
const wr = await api.post('/api/withdraws/submit', {
  checkbook_id: checkbookId,
  allocations: [alloc1, alloc2],
  intent: { ... }
}, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### SDK 集成

```typescript
// SDK 中已集成的 API
import { EnclaveClient } from '@zkpay/enclave-sdk';

const client = new EnclaveClient({
  apiUrl: 'http://localhost:3001'
});

// 查询报价
const route = await client.quote.getRouteAndFees({
  owner_data: { chain_id: 60, data: userAddress },
  deposit_token: tokenAddress,
  intent: { ... },
  amount: amountInWei
});

// 查询链配置
const chainConfig = await client.chainConfig.getChainConfig(60);
const treasuryAddress = await client.chainConfig.getTreasuryAddress(60);

// 查询允许的目标链和代币
const allowedTargets = await client.tokenRouting.getAllowedTargets({
  source_chain_id: 714,
  source_token_id: '0x...'
});
```

---

## 🔍 关键设计要点

### 1. 状态管理
- **4 个子状态**: proof_status, execute_status, payout_status, hook_status
- **主状态**: 由子状态自动计算
- **终态**: completed, failed_permanent, manually_resolved

### 2. 重试机制
- **Proof 失败**: 无次数限制，可重试
- **TX 提交失败**: 可重试
- **验证失败**: 不可重试（Proof 本身有问题）
- **Payout 失败**: 最多 5 次重试

### 3. 错误处理
- **临时错误**: 自动重试
- **永久错误**: 标记为 `failed_permanent`，等待人工处理
- **人工处理**: 多签调用 `markManuallyResolved()`，监听事件更新状态

### 4. 安全性
- **JWT 认证**: 24 小时有效期
- **地址验证**: 验证 Allocations 所有权
- **Nullifier 消费**: 一旦消费不可逆
- **多签保护**: 关键操作需要多签

### 5. API 接口设计

#### Pool 管理接口说明

**两个接口的区别**:
- `/api/admin/pools` - 完整的 Pool 管理（包含 name, description, version 等完整字段）
- `/api/admin/chains/:chain_id/adapters` - 链配置场景的简化管理（只需 address, protocol）

**设计理由**:
1. **使用场景不同**：
   - `/admin/pools` - 完整的 Pool 管理（管理员界面）
   - `/admin/chains/:chain_id/adapters` - 链配置场景（链配置页面）

2. **字段不同**：
   - `/admin/pools` - 需要完整信息（name, description, version等）
   - `/admin/chains/:chain_id/adapters` - 只需要基本配置（address, protocol）

3. **路径语义清晰**：
   - `/admin/pools` - 面向 Pool 资源
   - `/admin/chains/:chain_id/adapters` - 面向链配置

**实现**:
- 两个接口都使用 `IntentAdapter` 表
- `/admin/chains/:chain_id/adapters` 作为简化版本，只处理基本字段
- 内部实现统一，但 API 接口保持分离

---

## 🔍 常见问题速查

| 问题 | 答案 |
|------|------|
| Allocation 为什么不能撤回？ | Stage 2 后 Nullifier 已在链上消费，无法回滚 |
| Proof 失败可以重试吗？ | 可以，无次数限制 |
| Chain TX 验证失败能重试吗？ | 不能，这表示 Proof 本身有问题 |
| Payout 失败有多少次重试机会？ | 最多 5 次，然后可超时领取 |
| Hook 失败会影响主流程吗？ | 不会，Hook 是可选的，失败标记为 completed_with_hook_failed |
| TRON 支持 Hook 吗？ | 不支持，仅支持 ETH、Polygon、Arbitrum、Optimism |
| TRON 支持哪些代币？ | 仅 USDT（USDC 目前在 TRON 上不可用）|
| Token 路由规则如何工作？ | 定义源链+代币可以路由到哪些目标链+代币 |
| 如何查询所有可用的 Pool 和 Token？ | GET /api/v2/token-routing/allowed-targets (无参数) |

---

## 📱 监控要点

**需要告警的情况**:
- ⚠️ Proof 生成超过 5 分钟
- ⚠️ 链上 TX 未确认超过 30 分钟
- 🔴 Payout 超过 2 小时未完成
- 🔴 大量 WithdrawRequest 进入 payout_failed

**需要手动介入的情况**:
- verify_failed 状态（Proof 验证失败）
- Payout 失败 5 次后
- 桥接故障导致资金卡在 IntendManager

---

## 📚 相关文档

- [系统设计文档](../docs/backend/SYSTEM_DESIGN.md)
- [提款请求完整设计](../docs/backend/WITHDRAW_REQUEST_COMPLETE_DESIGN.md)
- [提款请求实现文档](./WITHDRAW_REQUEST_IMPLEMENTATION.md)
- [NATS 事件驱动流程](./NATS_EVENT_DRIVEN_STATUS_FLOW.md)
- [全局配置设计](./GLOBAL_CONFIG_DESIGN.md)
- [README](./README.md)

---

**最后更新**: 2025-01-XX  
**版本**: v2.0

