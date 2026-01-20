# CatFee 强制用户直接支付方案

## 问题

当前 CatFee 使用 `/v1/order` 端点创建订单时，如果账户有余额，系统会自动使用 **API 模式**（从账户余额扣除），而不是返回支付地址让用户直接支付。

## 解决方案

### 方案 1：清空账户余额（最简单）

**步骤：**
1. 登录 CatFee 后台：https://catfee.io
2. 将账户余额提取或使用完
3. 确保账户余额为 0 或不足以支付订单
4. 重新创建订单，系统会自动返回支付地址

**优点：**
- 简单直接
- 不需要修改代码
- 用户可以直接支付

**缺点：**
- 需要清空账户余额
- 如果余额很大，可能需要提取

### 方案 2：使用 "一单一付" API（`/v1/mate/open/transaction`）

CatFee 提供了专门的 "一单一付" API，专门用于用户直接支付：

**端点：**
- 估算：`POST /v1/mate/open/transaction/estimate`
- 创建订单：`POST /v1/mate/open/transaction`
- 提交支付：`POST /v1/mate/open/transaction/pay/{order_id}`

**流程：**
1. 调用估算 API 获取费用
2. 调用创建订单 API，获取代理交易（未广播）
3. 用户发送 TRX 支付交易
4. 提交支付交易哈希，CatFee 验证后分配能量

**优点：**
- 专门设计用于用户直接支付
- 不依赖账户余额
- 完全透明

**缺点：**
- 需要实现更复杂的流程
- 需要处理多个交易步骤

### 方案 3：前端传入支付地址（当前不可行）

**问题：**
- CatFee `/v1/order` API 没有参数可以指定支付方式
- 系统根据账户余额自动选择支付模式
- 无法通过参数强制使用用户直接支付

**结论：**
- 不能通过传入支付地址来强制用户直接支付
- 必须通过账户余额控制或使用不同的 API 端点

## 推荐方案

**对于前端用户（DApp 场景）：**

**推荐使用方案 1**：清空账户余额
- 最简单直接
- 不需要修改代码
- 用户可以直接支付，完全透明

**如果需要更复杂的控制：**

**推荐使用方案 2**：使用 "一单一付" API
- 专门设计用于用户直接支付
- 不依赖账户余额
- 但需要实现更复杂的流程

## 实现建议

### 当前实现（方案 1）

1. **清空 CatFee 账户余额**
   - 登录后台提取余额
   - 或使用完余额

2. **验证支付模式**
   - 创建订单后检查 `billing_type`
   - 如果返回 `TRANSFER` 且有 `paymentAddress`，说明是直接支付模式

3. **前端处理**
   - 如果返回支付地址，用户直接支付
   - 如果返回 API 模式，显示提示信息

### 未来实现（方案 2）

如果需要实现 "一单一付" 模式，需要：

1. **添加新的 API 端点支持**
   - 实现 `/v1/mate/open/transaction/estimate`
   - 实现 `/v1/mate/open/transaction`
   - 实现 `/v1/mate/open/transaction/pay/{order_id}`

2. **修改前端流程**
   - 估算费用
   - 创建代理交易
   - 用户支付
   - 提交支付哈希

3. **处理多个交易**
   - 代理资源交易
   - 用户业务交易
   - 支付交易

## 检查当前模式

### 查看订单响应

```bash
curl -X POST "http://localhost:3001/api/energy-rental/order" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "catfee",
    "receiverAddress": "TYourAddress",
    "energyAmount": 131000,
    "bandwidthAmount": 600,
    "duration": "1h"
  }'
```

**如果返回：**
- `billing_type: "API"` + `paymentAddress: ""` → API 模式（从账户扣除）
- `billing_type: "TRANSFER"` + `paymentAddress: "T..."` → 直接支付模式

### 查看账户余额

```bash
# 可以通过 CatFee API 查询账户余额
# GET /v1/account
```

## 相关文档

- CatFee 官方文档: https://docs.catfee.io
- API 文档: https://docs.catfee.io/en/api-reference/create-order
- 一单一付模式: https://docs.catfee.io/solutions/one-order-one-payment-to-c
- 支付模式说明: `CATFEE_PAYMENT_MODES.md`
