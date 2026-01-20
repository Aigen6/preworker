# CatFee Energy Subleasing（能量转租）配置指南

## 什么是 Energy Subleasing？

Energy Subleasing 是 CatFee 提供的一种能量转租服务，允许你：

1. **设置接收钱包地址**：用户发送 TRX 到这个地址
2. **自动扣除成本**：CatFee 从你的账户余额自动扣除成本
3. **自动分配能量**：CatFee 自动将能量分配给用户
4. **赚取价格差**：你保留用户支付和 CatFee 成本之间的差价

**示例：**
- 用户支付：5 TRX
- CatFee 成本：2 TRX（从你的账户余额扣除）
- 你的利润：3 TRX
- 用户获得：65,000 Energy

## 配置步骤

### 1. 注册并激活 CatFee 账户

1. 访问 https://catfee.io
2. 注册账户并完成身份验证
3. 获取 API Key 和 Secret（https://catfee.io/?tab=api）

### 2. 充值 TRX 到 CatFee 账户

**重要**：Subleasing 服务需要你的 CatFee 账户有足够的 TRX 余额。

- 在 CatFee 后台充值 TRX
- 这个余额用于支付能量成本（从你的余额扣除）
- 确保余额充足，否则订单会失败

### 3. 设置接收钱包地址

在 CatFee 后台配置：

1. 进入 Subleasing 设置页面
2. 设置一个 TRON 钱包地址（用户会发送 TRX 到这个地址）
3. CatFee 会实时监控这个地址
4. **重要**：确保你控制这个钱包的私钥，因为所有 TRX 都会发送到这里

### 4. 启用 Subleasing 服务

在 CatFee 后台启用 Energy Subleasing 功能。

### 5. 配置 API 凭证

在 `.env` 文件中配置：

```bash
CATFEE_API_KEY=your_api_key
CATFEE_API_SECRET=your_api_secret
CATFEE_ENABLED=true
```

## 工作流程

### 用户支付流程

1. **用户发送 TRX**
   - 用户发送 TRX 到你配置的接收钱包地址
   - 金额由你决定（建议包含利润空间）

2. **CatFee 自动处理**
   - CatFee 检测到 TRX 转账
   - 从你的 CatFee 账户余额扣除成本
   - 自动将能量分配给用户指定的地址

3. **你获得利润**
   - 用户支付的 TRX 留在你的接收钱包
   - CatFee 成本从账户余额扣除
   - 差价就是你的利润

### API 调用流程（如果需要程序化处理）

如果你需要通过 API 处理订单：

```typescript
// 1. 创建订单（指定接收能量的地址）
const order = await createOrder(
  receiverAddress,  // 用户地址（接收能量）
  energyAmount,
  bandwidthAmount,
  duration
);

// 2. CatFee 会从你的账户余额扣除成本
// 3. 能量自动分配给 receiverAddress
```

## 与直接支付模式的区别

| 特性 | Subleasing 模式 | 直接支付模式 |
|------|----------------|-------------|
| **用户支付方式** | 发送 TRX 到你的钱包地址 | 发送 TRX 到 CatFee 提供的地址 |
| **成本支付** | 从你的 CatFee 账户余额扣除 | 用户直接支付 |
| **利润** | 有（价格差） | 无 |
| **需要账户余额** | 是 | 否 |
| **适用场景** | 转租业务、赚取差价 | 直接为用户购买 |

## 当前实现状态

### 已实现

- ✅ 创建订单 API（`POST /v1/order`）
- ✅ 查询订单状态 API
- ✅ 签名生成和认证

### 需要配置

- ⚠️ **Subleasing 服务需要在 CatFee 后台手动配置**
- ⚠️ **需要设置接收钱包地址**
- ⚠️ **需要充值账户余额**

### 估算 API 问题

根据文档和错误信息，CatFee 可能：
- 没有独立的估算端点（`/v1/order/estimate` 不存在）
- 或者需要使用 `/v1/estimate` 端点
- 或者需要直接创建订单来获取价格

**当前处理**：
- 如果 API 返回错误，使用市场价格估算（基于 65K Energy = 1.95 TRX）
- 查看日志中的 "📊 CatFee API 原始响应" 了解实际响应

## 配置检查清单

- [ ] CatFee 账户已注册并验证
- [ ] 已获取 API Key 和 Secret
- [ ] 已在 CatFee 后台启用 Subleasing 服务
- [ ] 已设置接收钱包地址
- [ ] 已充值 TRX 到 CatFee 账户余额
- [ ] 已在 `.env` 文件中配置 API 凭证
- [ ] 已测试 API 调用

## 相关文档

- CatFee Subleasing 文档: https://docs.catfee.io/en/getting-started/what-is-energy-sublet-on-catfee
- CatFee API 文档: https://docs.catfee.io/en/getting-started/buy-energy-via-api-on-catfee/nodejs
- CatFee 官网: https://catfee.io

## 注意事项

1. **账户余额**：确保 CatFee 账户有足够余额，否则订单会失败
2. **接收钱包**：确保你控制接收钱包的私钥
3. **价格设置**：合理设置用户支付金额，确保有利润空间
4. **监控**：定期检查账户余额和订单状态
