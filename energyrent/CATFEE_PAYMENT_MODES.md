# CatFee 支付模式说明

## 两种支付模式

CatFee 支持两种支付模式：

### 1. 直接 TRX 转账模式（推荐用于前端）

**特点：**
- 用户直接从前端钱包发送 TRX 到 CatFee 提供的支付地址
- 不需要后端账户有预购余额
- 完全匿名，用户直接支付
- 适合 DApp 集成

**流程：**
1. 调用估算 API 获取费用
2. 调用创建订单 API，获取支付地址和金额
3. 前端使用 TronWeb 发送 TRX 转账到支付地址
4. CatFee 检测到转账后自动分配能量

**当前实现：**
- ✅ 已支持直接支付模式
- ✅ 前端可以使用 TronWeb 发送 TRX 转账
- ✅ 支付地址和金额从创建订单 API 获取

### 2. 预购账户模式（API 模式）

**特点：**
- 需要在 CatFee 账户中预存 TRX 余额
- 使用 API 创建订单时，费用从账户余额扣除
- 估算 API 可能返回费用为 0（因为从账户扣除）
- 适合批量处理或自动化场景

**流程：**
1. 在 CatFee 账户中充值 TRX
2. 调用 API 创建订单
3. CatFee 从账户余额扣除费用
4. 能量自动分配给指定地址

**注意事项：**
- 如果账户余额不足，订单创建会失败
- 估算时费用可能显示为 0，但实际会从账户扣除
- 需要定期检查账户余额

## 费用为 0 的问题

### 原因

如果估算 API 返回 `totalCost: 0`，可能的原因：

1. **使用了预购账户模式**
   - 账户有余额，费用从账户扣除
   - 估算 API 返回 0 表示不需要用户额外支付
   - 但实际创建订单时，费用会从账户余额扣除

2. **API 响应格式不同**
   - CatFee API 可能在不同模式下返回不同格式
   - 需要检查实际响应数据

### 解决方案

当前代码已添加处理逻辑：

1. **检测费用为 0**
   - 如果估算返回 0，使用市场价格估算（约 0.000008 TRX/Energy）
   - 显示警告信息，提示可能使用了预购模式

2. **查看日志**
   - 后端日志会输出 "CatFee estimate response"
   - 检查 `raw` 字段了解实际 API 响应
   - 检查 `isPrepaidMode` 字段确认是否使用预购模式

3. **调整配置**
   - 如果希望使用直接支付模式，确保创建订单时获取支付地址
   - 如果使用预购模式，确保账户有足够余额

## 推荐使用方式

### 对于前端用户（当前实现）

**推荐使用直接支付模式：**

1. 用户在前端选择租赁
2. 系统创建订单，获取支付地址和金额
3. 用户使用钱包直接支付 TRX
4. CatFee 自动分配能量

**优点：**
- 用户直接支付，无需预购
- 透明，用户看到实际费用
- 适合 DApp 场景

### 对于后端服务

**可以使用预购账户模式：**

1. 在 CatFee 账户中预存 TRX
2. 后端自动处理订单
3. 费用从账户扣除

**优点：**
- 自动化处理
- 适合批量操作
- 不需要用户交互

## 检查当前模式

### 查看后端日志

```bash
# 查看 CatFee 估算响应
# 查找 "CatFee estimate response" 日志
# 检查 isPrepaidMode 字段
```

### 测试直接支付

```bash
# 1. 创建订单
curl -X POST "http://localhost:3001/api/energy-rental/order" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "catfee",
    "receiverAddress": "TYourAddress",
    "energyAmount": 131000,
    "bandwidthAmount": 600,
    "duration": "1h"
  }'

# 2. 检查返回的 paymentAddress 和 paymentAmount
# 如果 paymentAddress 存在且 paymentAmount > 0，说明是直接支付模式
```

## 常见问题

### Q: 为什么估算返回 0？

**A:** 可能使用了预购账户模式。检查：
1. CatFee 账户是否有余额
2. 查看后端日志中的实际响应
3. 确认是否希望使用直接支付模式

### Q: 能否强制使用直接支付模式？

**A:** 是的。确保创建订单时：
1. API 返回 `paymentAddress`（支付地址）
2. API 返回 `paymentAmount` > 0（支付金额）
3. 前端使用这些信息发送 TRX 转账

### Q: 如何切换到直接支付模式？

**A:** 
1. 检查 CatFee API 文档，确认是否支持直接支付参数
2. 在创建订单时，可能需要指定支付方式
3. 或者使用不同的 API 端点

## 相关文档

- CatFee 官方文档: https://docs.catfee.io
- API 文档: https://docs.catfee.io/en/getting-started/buy-energy-via-api-on-catfee/nodejs
- 快速开始: https://docs.catfee.io/en/getting-started/quickstart
