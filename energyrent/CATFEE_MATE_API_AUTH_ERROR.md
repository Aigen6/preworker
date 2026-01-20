# CatFee Mate API 认证错误解决方案

## 问题

使用 `/v1/mate/open/transaction` 端点时，返回错误：
```
auth error:Invalid API Key (code: 2)
```

## 可能的原因

1. **API 密钥权限不足**
   - `/v1/mate/open/transaction` 端点可能需要特殊的 API 密钥或权限
   - 常规端点 (`/v1/order`, `/v1/estimate`) 和 Mate 端点可能使用不同的权限系统

2. **API 密钥配置错误**
   - `.env` 文件中的 `CATFEE_API_KEY` 或 `CATFEE_API_SECRET` 配置不正确
   - API 密钥已过期或被撤销

3. **账户权限问题**
   - CatFee 账户可能没有启用 "一单一付" (Per-Order Payment) 功能
   - 需要在 CatFee 后台启用相关服务

## 解决方案

### 方案 1：检查 API 密钥配置

1. **验证 API 密钥**
   ```bash
   # 检查 .env 文件
   cat .env | grep CATFEE
   ```

2. **重新获取 API 密钥**
   - 登录 CatFee 后台：https://catfee.io
   - 进入 API 设置页面
   - 确认或重新生成 API 密钥

### 方案 2：检查账户权限

1. **登录 CatFee 后台**
   - 访问 https://catfee.io
   - 登录您的账户

2. **检查服务权限**
   - 查看是否有 "Per-Order Payment" 或 "一单一付" 相关服务
   - 确认服务是否已启用

3. **联系 CatFee 支持**
   - 如果账户没有相关权限，联系 CatFee 客服启用

### 方案 3：使用常规模式（临时方案）

如果 Mate API 无法使用，可以暂时使用常规模式：

```typescript
// 前端：不设置 useDirectPayment，或设置为 false
{
  "provider": "catfee",
  "receiverAddress": "TYourAddress",
  "energyAmount": 131000,
  "bandwidthAmount": 600,
  "duration": "1h",
  "useDirectPayment": false  // 使用常规模式
}
```

**注意**：常规模式会根据账户余额自动选择支付方式：
- 账户有余额 → API 模式（从账户扣除）
- 账户余额不足 → TRANSFER 模式（返回支付地址）

### 方案 4：清空账户余额（强制使用 TRANSFER 模式）

如果使用常规模式，可以通过清空账户余额来强制返回支付地址：

1. 登录 CatFee 后台
2. 提取或使用完账户余额
3. 确保账户余额为 0 或不足以支付订单
4. 重新创建订单，系统会自动返回支付地址

## 验证步骤

1. **测试常规端点**
   ```bash
   # 测试估算端点（应该工作正常）
   curl -X GET "https://api.catfee.io/v1/estimate?quantity=131000&duration=1h" \
     -H "CF-ACCESS-KEY: your_api_key" \
     -H "CF-ACCESS-SIGN: your_signature" \
     -H "CF-ACCESS-TIMESTAMP: 2026-01-16T08:00:00.000Z"
   ```

2. **测试 Mate 端点**
   ```bash
   # 测试 Mate 端点（可能返回认证错误）
   curl -X POST "https://api.catfee.io/v1/mate/open/transaction?quantity=131000&receiver=TYourAddress&resource_type=ENERGY" \
     -H "CF-ACCESS-KEY: your_api_key" \
     -H "CF-ACCESS-SIGN: your_signature" \
     -H "CF-ACCESS-TIMESTAMP: 2026-01-16T08:00:00.000Z"
   ```

3. **对比结果**
   - 如果常规端点工作正常，但 Mate 端点返回认证错误，说明 Mate 端点需要不同的权限或配置

## 相关文档

- CatFee 官方文档: https://docs.catfee.io
- API 文档: https://docs.catfee.io/en/api-reference/transaction/create-order
- 一单一付解决方案: https://docs.catfee.io/solutions/one-order-one-payment-to-c
- CatFee 支持: @CatFee_James (Telegram)

## 当前状态

- ✅ 常规端点 (`/v1/order`, `/v1/estimate`) 工作正常
- ❌ Mate 端点 (`/v1/mate/open/transaction`) 返回认证错误
- 🔄 建议：联系 CatFee 支持确认 Mate API 的权限要求
