# Energy Rental Service 测试指南

## 快速测试

### 1. 使用测试脚本（推荐）

```bash
cd preworker/energyrent
./test-api.sh
```

测试脚本会自动测试所有主要 API 端点。

### 2. 手动测试各个 API

#### 测试 CatFee 费用估算

```bash
curl "http://localhost:3001/api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

**预期响应：**
```json
{
  "provider": "catfee",
  "energyCost": 0.001,
  "bandwidthCost": 0.0001,
  "totalCost": 0.0011,
  "estimatedTime": 30,
  "savings": 12.9989
}
```

**如果返回 0 或错误：**
1. 检查后端日志，查看 "CatFee estimate response" 的输出
2. 确认 `.env` 文件中配置了 `CATFEE_API_KEY` 和 `CATFEE_API_SECRET`
3. 验证 API 凭证是否正确

#### 测试创建订单

```bash
curl -X POST "http://localhost:3001/api/energy-rental/order" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "catfee",
    "receiverAddress": "TYourAddressHere",
    "energyAmount": 131000,
    "bandwidthAmount": 600,
    "duration": "1h"
  }'
```

**预期响应：**
```json
{
  "orderId": "cf_1234567890_abc123",
  "provider": "catfee",
  "receiverAddress": "TYourAddressHere",
  "energyAmount": 131000,
  "bandwidthAmount": 600,
  "duration": "1h",
  "cost": 0.0011,
  "status": "pending",
  "createdAt": 1234567890000,
  "paymentAddress": "TServiceProviderAddress",
  "paymentAmount": 0.0011,
  "paymentAmountSun": 1100,
  "paymentMemo": "cf_1234567890_abc123"
}
```

#### 测试查询订单状态

```bash
curl "http://localhost:3001/api/energy-rental/order/catfee/cf_1234567890_abc123"
```

#### 测试获取支付信息

```bash
curl "http://localhost:3001/api/energy-rental/payment/catfee/cf_1234567890_abc123"
```

## 调试 CatFee 估算问题

### 问题：CatFee 估算返回 0.000000 TRX

**可能原因：**

1. **API 响应格式不匹配**
   - 查看后端日志中的 "CatFee estimate response" 输出
   - 检查 `raw` 字段，确认 API 实际返回的数据结构
   - 可能需要调整 `catfee.service.ts` 中的响应解析逻辑

2. **API 凭证未配置或错误**
   - 检查 `.env` 文件是否存在
   - 确认 `CATFEE_API_KEY` 和 `CATFEE_API_SECRET` 已正确填写
   - 验证凭证是否有效（访问 https://catfee.io/?tab=api）

3. **API 调用失败**
   - 查看后端日志中的错误信息
   - 检查网络连接
   - 确认 CatFee API 服务是否正常

### 调试步骤

1. **查看后端日志**
   ```bash
   # 在后端服务运行时，查看控制台输出
   # 应该能看到 "CatFee estimate response:" 日志
   ```

2. **检查 API 响应**
   - 日志中的 `raw` 字段显示 CatFee API 的原始响应
   - `parsed` 字段显示解析后的数据
   - 如果 `totalCost` 为 0，检查 `raw` 中的实际字段名

3. **手动测试 CatFee API**
   ```bash
   # 使用 curl 直接测试 CatFee API（需要有效的签名）
   # 参考 CatFee 文档: https://docs.catfee.io
   ```

## 测试其他服务商

### GasStation

```bash
curl "http://localhost:3001/api/energy-rental/estimate?provider=gasstation&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

### TronXEnergy

```bash
curl "http://localhost:3001/api/energy-rental/estimate?provider=tronxenergy&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

**注意：** TronXEnergy 目前使用模拟数据，实际 API 集成待完成。

## 常见问题

### 1. 500 Internal Server Error (TronXEnergy)

**原因：** TronXEnergy 的 `checkOrderStatus` 方法未完全实现。

**解决：** 已修复，现在会返回临时订单信息。完整实现需要根据 TronXEnergy API 文档完成。

### 2. 401 Unauthorized (CatFee)

**原因：** API Key 或 Secret 不正确。

**解决：**
1. 检查 `.env` 文件中的配置
2. 重新从 CatFee 网站获取 API 凭证
3. 确认没有多余的空格或换行

### 3. 费用估算为 0

**原因：** API 响应解析失败或 API 返回的数据格式不同。

**解决：**
1. 查看后端日志中的 "CatFee estimate response" 输出
2. 根据实际响应格式调整解析逻辑
3. 检查 CatFee API 文档确认响应格式

## 查看日志

后端服务会在控制台输出详细的日志信息：

- `CatFee estimate response:` - CatFee 估算 API 的响应
- `CatFee 费用估算失败:` - CatFee 估算失败的错误信息
- `⚠️  CatFee API 配置不完整` - 配置检查警告

## 下一步

如果测试通过但前端仍显示 0，检查：
1. 前端是否正确解析响应
2. 前端是否正确显示费用数据
3. 浏览器控制台是否有错误
