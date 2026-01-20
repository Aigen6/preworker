# 查看 Energy Rental 服务日志

## 快速查看日志

### 方法 1：查看日志文件（推荐）

如果使用 `dev:tunnel` 脚本启动，日志会输出到 `/tmp/energyrent.log`：

```bash
# 查看最新日志
tail -f /tmp/energyrent.log

# 查看最后 50 行
tail -50 /tmp/energyrent.log

# 搜索 CatFee 相关日志
grep -i "catfee" /tmp/energyrent.log

# 查看签名相关信息
grep -i "签名\|sign" /tmp/energyrent.log
```

### 方法 2：直接查看后端控制台

如果直接运行 `npm run start:dev`，日志会直接输出到控制台。

### 方法 3：使用日志查看工具

```bash
# 实时监控日志
tail -f /tmp/energyrent.log | grep -E "CatFee|ERROR|WARN"

# 查看最近的错误
tail -100 /tmp/energyrent.log | grep -i error
```

## 关键日志信息

### CatFee API 调用日志

查找以下关键日志：

1. **📊 CatFee API 原始响应**
   - 显示 CatFee API 的完整响应
   - 用于确认 API 返回的数据结构

2. **🔐 CatFee 签名信息**
   - 显示签名生成的相关信息
   - 包括：timestamp, method, requestPath, signString
   - 用于调试签名问题

3. **✅ 从字段提取费用**
   - 显示从哪个字段提取到费用
   - 如果显示这个，说明 API 返回了有效价格

4. **⚠️ CatFee 估算返回费用为 0**
   - 如果看到这个警告，说明使用了估算价格
   - 会显示估算的计算过程

5. **CatFee estimate response**
   - 显示解析后的估算结果
   - 包括：energyCost, bandwidthCost, totalCost, savings

## 常见问题排查

### 问题 1：签名错误 (invalid sign parameter)

**日志特征：**
```
"code": 1,
"msg": "invalid sign parameter for:..."
```

**可能原因：**
- 查询参数重复（已修复）
- 时间戳格式不正确
- API Secret 错误
- 签名算法不正确

**解决方法：**
1. 查看日志中的 "🔐 CatFee 签名信息"
2. 确认 `signString` 是否正确
3. 检查 `.env` 文件中的 `CATFEE_API_SECRET` 是否正确

### 问题 2：费用为 0

**日志特征：**
```
⚠️  CatFee 估算返回费用为 0，可能使用了预购账户模式。
```

**解决方法：**
1. 查看 "📊 CatFee API 原始响应"，确认 API 实际返回的数据
2. 检查是否使用了预购账户模式
3. 系统会自动使用估算价格

### 问题 3：API 认证失败

**日志特征：**
```
CatFee API 认证失败。请检查 .env 文件中的 CATFEE_API_KEY 和 CATFEE_API_SECRET
```

**解决方法：**
1. 检查 `.env` 文件中的配置
2. 确认 API Key 和 Secret 是否正确
3. 重新从 CatFee 网站获取凭证

## 日志示例

### 正常情况

```
🔐 CatFee 签名信息: {
  timestamp: '2026-01-16T06:41:35.377Z',
  method: 'GET',
  requestPath: '/v1/order/estimate?quantity=131000&duration=1h',
  signString: '2026-01-16T06:41:35.377ZGET/v1/order/estimate?quantity=131000&duration=1h',
  queryParams: { quantity: '131000', duration: '1h' }
}
📊 CatFee API 原始响应: {
  "code": 0,
  "data": {
    "payment": "1.95",
    ...
  }
}
✅ 从字段 "payment" 提取到费用: 1.95 TRX
```

### 预购模式（费用为 0）

```
📊 CatFee API 原始响应: {
  "code": 0,
  "data": {
    "payment": "0",
    ...
  }
}
⚠️  CatFee 估算返回费用为 0，可能使用了预购账户模式。
   使用市场价格估算: 131000 Energy × 30.00 SUN/Energy = 3.930000 TRX
```

### 签名错误

```
📊 CatFee API 原始响应: {
  "code": 1,
  "msg": "invalid sign parameter for:..."
}
```

## 实时监控

```bash
# 在一个终端中实时监控日志
tail -f /tmp/energyrent.log

# 在另一个终端中测试 API
curl "http://localhost:3001/api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

## 相关文档

- `TESTING.md` - 测试指南
- `CATFEE_PRICE_DISCREPANCY.md` - 价格差异说明
- `CATFEE_PAYMENT_MODES.md` - 支付模式说明
