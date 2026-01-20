# CatFee 一单一付模式（Direct Payment Mode）

## 概述

CatFee 提供了两种创建订单的方式：

1. **常规模式** (`/v1/order`)：根据账户余额自动选择支付方式
   - 账户有余额 → API 模式（从账户扣除）
   - 账户余额不足 → TRANSFER 模式（返回支付地址）

2. **一单一付模式** (`/v1/mate/open/transaction`)：**强制用户直接支付**
   - 不依赖账户余额
   - 总是返回支付地址和金额
   - 用户支付后需要提交支付哈希

## 使用方法

### 后端

在创建订单时，设置 `useDirectPayment: true`：

```typescript
POST /api/energy-rental/order
{
  "provider": "catfee",
  "receiverAddress": "TYourAddress",
  "energyAmount": 131000,
  "bandwidthAmount": 600,
  "duration": "1h",
  "useDirectPayment": true  // 使用一单一付模式
}
```

### 前端

前端代码已自动使用一单一付模式（`useDirectPayment: true`），无需额外配置。

## 流程

### 1. 创建订单

调用 `/v1/mate/open/transaction` 端点创建订单，返回：
- `order_id`: 订单ID
- `payee_address`: 支付地址（用户需要发送 TRX 到这个地址）
- `amount_sun`: 支付金额（SUN）
- `hash`: 代理交易哈希（可选，用于后续广播）
- `hex`: 代理交易十六进制（可选）

### 2. 用户支付

用户使用 TronWeb/TronLink 发送 TRX 到 `payee_address`，金额为 `amount_sun`。

### 3. 提交支付哈希

用户支付成功后，前端自动调用后端 API 提交支付哈希：

```typescript
POST /api/energy-rental/payment/catfee/{orderId}/submit
{
  "paymentHash": "用户支付的交易哈希"
}
```

后端会调用 CatFee API：

```typescript
POST /v1/mate/open/transaction/pay/{order_id}?hash={payment_hash}
```

### 4. CatFee 验证

CatFee 会扫描区块链验证支付，验证成功后分配能量。

## 优势

1. **不依赖账户余额**：不需要在 CatFee 账户中预存余额
2. **强制用户支付**：总是返回支付地址，用户必须直接支付
3. **完全透明**：用户可以看到实际费用，直接支付
4. **适合 DApp**：适合前端用户直接支付的场景

## 注意事项

1. **支付后必须提交哈希**：用户支付后，前端会自动提交支付哈希到后端
2. **验证时间**：CatFee 需要扫描区块链验证支付，可能需要一些时间
3. **订单状态**：支付哈希提交后，订单状态会更新为 `processing`，等待 CatFee 验证

## 相关文档

- CatFee 官方文档: https://docs.catfee.io
- 创建订单 API: https://docs.catfee.io/en/api-reference/transaction/create-order
- 支付订单 API: https://docs.catfee.io/en/api-reference/transaction/pay-order
- 一单一付解决方案: https://docs.catfee.io/solutions/one-order-one-payment-to-c
