# CatFee API 模式切换到直接支付模式

## 问题说明

当前 CatFee 订单使用 **API 模式**（`billing_type: "API"`），费用从 CatFee 账户余额扣除，用户无法直接支付。

**日志显示：**
```
billing_type: 'API'
paymentAddress: ''  // 空地址
paymentAmount: 3.93 TRX  // 费用已从账户扣除
```

## 原因

CatFee API 的行为：
- 如果账户有余额，系统自动使用 **API 模式**，从账户余额扣除费用
- 如果账户余额不足，系统会返回支付地址，使用 **TRANSFER 模式**，用户可以直接支付

## 解决方案

### 方案 1：清空 CatFee 账户余额（推荐）

**步骤：**
1. 登录 CatFee 后台：https://catfee.io
2. 将账户余额提取或使用完
3. 确保账户余额为 0 或不足以支付订单
4. 重新创建订单，系统会返回支付地址

**优点：**
- 用户可以直接支付
- 不需要预购余额
- 完全透明

**缺点：**
- 需要清空账户余额
- 如果余额很大，可能需要提取

### 方案 2：使用 Subleasing 模式

**步骤：**
1. 在 CatFee 后台启用 Subleasing 服务
2. 设置接收钱包地址（用户发送 TRX 的地址）
3. 确保账户有足够余额（用于支付成本）
4. 用户发送 TRX 到你的接收地址
5. CatFee 从账户扣除成本，自动分配能量

**优点：**
- 可以赚取价格差
- 自动化处理

**缺点：**
- 需要设置和配置
- 需要账户有余额

### 方案 3：接受 API 模式（当前实现）

**当前代码已支持：**
- 检测 API 模式
- 如果费用已从账户扣除，显示提示信息
- 用户无需支付，订单自动完成

**优点：**
- 自动化处理
- 适合批量操作

**缺点：**
- 用户无法直接支付
- 需要账户有余额

## 代码处理

### 后端处理

后端已添加对 API 模式的检测和处理：

```typescript
// 如果检测到 API 模式且没有支付地址
if (billingType === 'API' && !paymentAddress) {
  return {
    paymentAddress: '',
    paymentAmount: order.paymentAmount,
    isApiMode: true,
    message: '订单已创建，费用已从账户余额扣除，无需用户直接支付',
  };
}
```

### 前端处理

前端已添加对 API 模式的检测：

```typescript
// 检查是否是 API 模式
if (paymentInfo.isApiMode || paymentInfo.requiresPayment === false) {
  showSuccess('订单已创建，费用已从账户余额扣除，无需支付')
  // 关闭弹窗，订单已完成
  return
}
```

## 推荐方案

**对于前端用户（DApp 场景）：**
- **推荐使用方案 1**：清空账户余额，让用户直接支付
- 这样用户可以看到实际费用，完全透明

**对于后端服务（自动化场景）：**
- **推荐使用方案 3**：保持 API 模式
- 适合批量处理和自动化场景

## 检查当前模式

### 查看订单响应

```bash
# 创建订单后，查看响应中的 billing_type
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

### 查看后端日志

```bash
tail -f /tmp/energyrent.log | grep "CatFee"
```

查找：
- `billingType: 'API'` → API 模式
- `paymentAddress: ''` → 没有支付地址
- `isApiMode: true` → API 模式标记

## 切换步骤

### 切换到直接支付模式

1. **登录 CatFee 后台**
   - 访问 https://catfee.io
   - 登录账户

2. **检查账户余额**
   - 查看当前余额
   - 如果余额 > 0，需要清空

3. **提取余额（可选）**
   - 如果有余额，可以提取到钱包
   - 或者使用完余额

4. **测试创建订单**
   - 确保账户余额不足
   - 创建订单应该返回支付地址

5. **验证支付地址**
   - 检查返回的 `paymentAddress` 不为空
   - 检查 `billing_type` 不是 "API"

## 常见问题

### Q: 为什么订单总是使用 API 模式？

**A:** 因为 CatFee 账户有余额。系统检测到余额后，自动使用 API 模式从余额扣除。

**解决：** 清空账户余额，或确保余额不足以支付订单。

### Q: 能否强制使用直接支付模式？

**A:** CatFee API 没有参数可以强制指定支付模式。系统根据账户余额自动选择：
- 余额充足 → API 模式
- 余额不足 → TRANSFER 模式（返回支付地址）

### Q: API 模式和直接支付模式有什么区别？

**A:**
- **API 模式**：费用从账户余额扣除，用户无需支付，订单自动完成
- **直接支付模式**：用户发送 TRX 到支付地址，CatFee 检测到转账后分配能量

### Q: 如何知道当前使用的是哪种模式？

**A:** 查看订单响应：
- `billing_type: "API"` + 空 `paymentAddress` → API 模式
- `billing_type: "TRANSFER"` + 有 `paymentAddress` → 直接支付模式

## 相关文档

- CatFee 官方文档: https://docs.catfee.io
- API 文档: https://docs.catfee.io/en/api-reference/create-order
- 支付模式说明: `CATFEE_PAYMENT_MODES.md`
- Subleasing 服务: `CATFEE_SUBLEASING.md`
