# Backend API 端点文档

本文档列出了 Backend 提供的所有 API 端点。

## 基础端点

### 健康检查
- `GET /ping` - 基础连通性检查
- `GET /health` - 健康检查
- `GET /api/health` - API 健康检查

### 监控
- `GET /metrics` - Prometheus 指标

---

## 认证相关

### 用户认证
- `GET /api/auth/nonce` - 获取 nonce（用于签名认证）
- `POST /api/auth/login` - 用户登录（钱包签名认证）

### 管理员认证
- `POST /api/admin/auth/login` - 管理员登录（用户名 + 密码 + TOTP）
- `GET /api/admin/auth/totp/secret` - 生成 TOTP 密钥（用于初始设置）

---

## 存款相关 (Deposits)

- `GET /api/deposits/:chainId/:localDepositId` - 获取存款信息（公开）
- `GET /api/deposits/by-owner` - 按所有者查询存款（需要 JWT）

---

## 承诺相关 (Commitments)

- `POST /api/commitments/submit` - 提交承诺证明（需要 JWT）

---

## 支票簿相关 (Checkbooks)

### 公开端点
- `GET /api/checkbooks` - 列出我的支票簿（需要 JWT，支持分页）
- `GET /api/checkbooks/id/:id` - 按 ID 查询支票簿（需要 JWT）
- `DELETE /api/checkbooks/:id` - 删除支票簿记录（需要 JWT，状态改为 DELETED）

### 内部端点（IP 白名单）
- `GET /api/checkbooks/by-deposit/:chain_id/:tx_hash` - 按存款交易查询支票簿（IP 白名单）

**注意：** Statistics Service 需要的端点：
- `GET /api/checkbooks` - 获取详细 checkbook 列表
  - 查询参数：`start_date`, `end_date`, `chain_id`（可选）
  - 返回格式：`{ success: true, data: [...] }`

---

## 重试相关 (Retry)

- `POST /api/retry/checkbook/:id` - 重试支票簿（重新生成证明或重新提交，需要 JWT）

---

## 分配相关 (Allocations)

### 公开端点
- `GET /api/allocations` - 列出分配（可选 JWT，如果提供 JWT 可以按所有者过滤）
- `GET /api/allocations/:id` - 获取单个分配

### 内部端点（IP 白名单）
- `POST /api/allocations/search` - 批量搜索分配（IP 白名单，支持按链ID和地址列表查询）

---

## 提取相关 (Withdraws)

### 创建提取请求
- `POST /api/withdraws/submit` - 创建提取请求（需要 JWT，使用 Intent 格式）

### 我的提取请求
- `GET /api/my/withdraw-requests` - 列出我的提取请求（需要 JWT）
- `GET /api/my/withdraw-requests/stats` - 获取我的提取统计（需要 JWT）
- `GET /api/my/withdraw-requests/:id` - 获取单个提取请求（需要 JWT）
- `GET /api/my/withdraw-requests/by-nullifier/:nullifier` - 按 nullifier 查询提取请求（需要 JWT）
- `POST /api/my/withdraw-requests/:id/retry` - 重试提取请求（需要 JWT）
- `POST /api/my/withdraw-requests/:id/retry-payout` - 重试 payout（需要 JWT）
- `POST /api/my/withdraw-requests/:id/retry-fallback` - 重试 fallback（需要 JWT）
- `DELETE /api/my/withdraw-requests/:id` - 取消提取请求（需要 JWT）

**注意：** Statistics Service 需要的端点：
- `GET /api/withdraws` - 获取详细 withdraw 列表
  - 查询参数：`start_date`, `end_date`, `chain_id`（可选）
  - 返回格式：`{ success: true, data: [...] }`
  
  **⚠️ 注意：** 当前 Backend 没有提供 `/api/withdraws` 端点，只有 `/api/my/withdraw-requests`。Statistics Service 可能需要调整或 Backend 需要添加此端点。

### 受益地址提取请求
- `GET /api/my/beneficiary-withdraw-requests` - 查询受益地址是自己的提取请求（需要 JWT）
- `POST /api/my/beneficiary-withdraw-requests/:id/request-payout` - 请求执行 payout（多签执行，需要 JWT）
- `POST /api/my/beneficiary-withdraw-requests/:id/claim-timeout` - 超时领取（需要 JWT）

---

## 池相关 (Pools)

### 公开端点
- `GET /api/pools` - 列出所有池
- `GET /api/pools/featured` - 获取推荐池
- `GET /api/pools/:id` - 获取池详情（包含 tokens）
- `GET /api/pools/:id/tokens` - 获取池的 Token 列表
- `GET /api/pools/:id/tokens/:token_id` - 获取 Token 详情

### Token 相关
- `GET /api/tokens` - 列出所有 Token（支持 `?isActive=true`）
- `GET /api/tokens/search` - 搜索 Token（关键词）

---

## 价格相关 (Prices)

- `GET /api/prices` - 获取 Token 价格（SDK 兼容，查询参数：`symbols=USDT,USDC`）
- `GET /api/tokens/:asset_id/price` - 获取单个 Token 的当前价格和 24h 变化
- `POST /api/tokens/prices` - 批量获取多个 Token 的价格
- `GET /api/tokens/:asset_id/price-history` - 获取历史价格数据

---

## 统计相关 (Statistics)

### 公开端点
- `GET /api/statistics/overview` - 获取全局统计（总锁定价值、总交易量、私有交易数、活跃用户）

### 用户统计（可选 JWT 或 IP 白名单）
- `GET /api/statistics/checkbooks/daily` - 按天统计存款
  - 支持两种方式：
    1. JWT 认证：`Authorization: Bearer <token>`
    2. IP 白名单：`?address=0x...&chain_id=714`（IP 需在配置的白名单中）
- `GET /api/statistics/withdraws/daily` - 按天统计提款
  - 支持两种方式：
    1. JWT 认证：`Authorization: Bearer <token>`
    2. IP 白名单：`?address=0x...&chain_id=714`（IP 需在配置的白名单中）

**注意：** Statistics Service 可以使用这些端点（如果配置了 IP 白名单或 JWT Token）。

---

## 报价相关 (Quote)

- `POST /api/quote/route-and-fees` - 查询最优路由、桥接费用、Gas 估算
- `POST /api/quote/hook-asset` - 查询 Hook 资产信息（APY、费用、转换）

---

## 指标相关 (Metrics)

### 公开端点（只读）
- `GET /api/pools/:id/metrics` - 获取 Pool 当前指标
- `GET /api/pools/:id/metrics/history` - 获取 Pool 历史指标
- `POST /api/pools/metrics` - 批量获取多个 Pool 指标
- `GET /api/tokens/:asset_id/metrics` - 获取 Token 当前指标
- `GET /api/tokens/:asset_id/metrics/history` - 获取 Token 历史指标
- `POST /api/tokens/metrics` - 批量获取多个 Token 指标

### 管理端点（仅 localhost）
- `POST /api/admin/pools/:id/metrics` - 更新 Pool 指标
- `GET /api/admin/pools/:id/metrics` - 获取 Pool 指标
- `GET /api/admin/pools/:id/metrics/current` - 获取 Pool 当前指标
- `POST /api/admin/tokens/:asset_id/metrics` - 更新 Token 指标
- `GET /api/admin/tokens/:asset_id/metrics` - 获取 Token 指标
- `GET /api/admin/tokens/:asset_id/metrics/current` - 获取 Token 当前指标
- `POST /api/admin/metrics/batch` - 批量更新指标

---

## 链配置相关 (Chain Configuration)

### 公开端点
- `GET /api/chains` - 列出所有活跃链
- `GET /api/chains/:chain_id` - 获取活跃链配置

### 管理端点（仅 localhost）
- `GET /api/admin/chains` - 列出所有链配置
- `GET /api/admin/chains/:chain_id` - 获取单个链配置
- `POST /api/admin/chains` - 创建链配置
- `PUT /api/admin/chains/:chain_id` - 更新链配置
- `DELETE /api/admin/chains/:chain_id` - 删除链配置
- `GET /api/admin/chains/:chain_id/adapters` - 列出适配器
- `POST /api/admin/chains/:chain_id/adapters` - 创建适配器
- `GET /api/admin/config/zkpay-proxy` - 获取全局 ZKPay Proxy 地址
- `PUT /api/admin/config/zkpay-proxy` - 更新全局 ZKPay Proxy 地址

---

## Token 路由规则 (Token Routing)

### 公开端点
- `GET /api/token-routing/allowed-targets` - 获取源链+Token 的允许目标

### 管理端点（仅 localhost）
- `POST /api/admin/token-routing/rules` - 创建路由规则
- `GET /api/admin/token-routing/rules` - 列出路由规则
- `GET /api/admin/token-routing/rules/:id` - 获取路由规则
- `PUT /api/admin/token-routing/rules/:id` - 更新路由规则
- `DELETE /api/admin/token-routing/rules/:id` - 删除路由规则

---

## 池管理 (Pool Management) - 仅 localhost

### Pool 管理
- `GET /api/admin/pools` - 列出所有 Pool（包含已删除）
- `GET /api/admin/pools/:id` - 获取 Pool 详情
- `POST /api/admin/pools` - 创建 Pool（可设置 featured）
- `PUT /api/admin/pools/:id` - 更新 Pool（可设置 featured）
- `DELETE /api/admin/pools/:id` - 删除 Pool

### Token 管理
- `GET /api/admin/pools/:id/tokens/:token_id` - 获取 Token 详情
- `POST /api/admin/pools/:id/tokens` - 创建 Token
- `PUT /api/admin/pools/:id/tokens/:token_id` - 更新 Token
- `DELETE /api/admin/pools/:id/tokens/:token_id` - 删除 Token

### Token 链配置
- `GET /api/admin/pools/:id/tokens/:token_id/chain-config` - 获取 Token 链配置
- `POST /api/admin/pools/:id/tokens/:token_id/chain-config` - 创建或更新 Token 链配置
- `DELETE /api/admin/pools/:id/tokens/:token_id/chain-config` - 删除 Token 链配置

---

## Raw Token 管理 - 仅 localhost

- `GET /api/admin/rawtokens` - 列出所有 Raw Token
- `GET /api/admin/rawtokens/:id` - 获取单个 Raw Token
- `POST /api/admin/rawtokens` - 创建 Raw Token
- `PUT /api/admin/rawtokens/:id` - 更新 Raw Token
- `DELETE /api/admin/rawtokens/:id` - 删除 Raw Token

---

## 文件上传管理 - 仅 localhost

- `POST /api/admin/upload/image` - 上传图片
- `DELETE /api/admin/upload/image/:filename` - 删除图片
- `GET /api/admin/upload/images` - 列出所有图片

---

## 合约信息读取 - 仅 localhost

- `POST /api/admin/tokens/read-contract` - 读取 ERC20 合约信息（通过 pool_id）
- `POST /api/admin/tokens/read-contract-by-chain` - 读取 ERC20 合约信息（通过 chain_id）

---

## 多签管理 (Multisig) - 需要管理员认证

- `GET /api/multisig/proposals` - 获取提案列表
- `GET /api/multisig/proposals/:proposalId` - 获取单个提案
- `GET /api/multisig/proposals/:proposalId/status` - 从链上获取提案状态
- `POST /api/multisig/proposals/:proposalId/retry` - 重试失败的提案
- `GET /api/multisig/status` - 获取系统状态

---

## WebSocket

- `GET /api/ws` - WebSocket 连接
- `GET /ws` - WebSocket 连接（向后兼容）
- `GET /api/status-stream` - Server-Sent Events (SSE) 状态流
- `GET /api/ws/status` - WebSocket 连接状态查询

---

## KMS (Key Management Service)

### 公开端点
- `POST /api/kms/keys` - 存储私钥到 KMS
- `GET /api/kms/keys` - 获取密钥映射
- `DELETE /api/kms/keys/:id` - 删除密钥映射
- `GET /api/kms/address` - 获取地址
- `POST /api/kms/sync` - 同步 KMS 状态

### 管理端点（仅 localhost）
- `POST /api/kms/admin/initialize` - 初始化网络密钥
- `POST /api/kms/admin/networks/:network/store` - 存储网络私钥

---

## KYT Oracle

- `GET /api/kyt-oracle/fee-info` - 按地址获取费用信息（带限流）
- `POST /api/kyt-oracle/fee-info` - 按地址获取费用信息（POST 方式）
- `POST /api/kyt-oracle/associate-address` - 关联地址和邀请码

---

## 静态文件

- `GET /uploads/*` - 上传的图片文件

---

## 管理页面

- `GET /admin/config` - 管理员配置页面（仅 localhost）

---

## Statistics Service 需要的端点总结

### 必需端点（用于匹配分析）

1. **`GET /api/checkbooks`** ✅ 已存在
   - 查询参数：`start_date`, `end_date`, `chain_id`（可选）
   - 需要 JWT 认证
   - 返回格式：`{ success: true, data: [...] }`

2. **`GET /api/withdraws`** ❌ **不存在**
   - 当前 Backend 只有 `/api/my/withdraw-requests`（需要 JWT 且只能查询自己的）
   - **需要 Backend 添加此端点**，或者 Statistics Service 需要调整使用其他端点

### 可选端点（用于每小时统计聚合）

3. **`GET /api/statistics/checkbooks/daily`** ✅ 已存在
   - 支持 JWT 认证或 IP 白名单
   - 查询参数：`start_date`, `end_date`, `address`, `chain_id`
   - 返回格式：`{ success: true, data: [{ date, deposit_count, total_gross_amount, ... }] }`

4. **`GET /api/statistics/withdraws/daily`** ✅ 已存在
   - 支持 JWT 认证或 IP 白名单
   - 查询参数：`start_date`, `end_date`, `address`, `chain_id`
   - 返回格式：`{ success: true, data: [{ date, withdraw_count, total_amount, ... }] }`

---

## 建议

1. **为 Statistics Service 添加 `/api/withdraws` 端点**
   - 支持查询参数：`start_date`, `end_date`, `chain_id`
   - 可以限制为 IP 白名单访问
   - 返回格式：`{ success: true, data: [...] }`

2. **或者修改 Statistics Service**
   - 使用现有的 `/api/my/withdraw-requests` 端点（但这需要 JWT 且只能查询自己的）
   - 或者使用其他方式获取 withdraw 数据
