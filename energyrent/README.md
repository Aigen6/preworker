# TRON Energy/Bandwidth 租赁服务

基于 NestJS 的 TRON Energy/Bandwidth 租赁服务后端，提供统一的 API 接口供前端调用。

## ⚠️ 重要提示

**使用前必须配置 CatFee API 凭证**，这是默认启用的服务商。详见 [配置指南](./CONFIGURATION.md)。

## 功能特性

- ✅ 支持多个租赁服务商（CatFee、GasStation、TronFuel、TronXEnergy）
- ✅ 费用估算 API
- ✅ 订单创建 API
- ✅ 订单状态查询 API
- ✅ 安全的 API 密钥管理（服务端存储）
- ✅ RESTful API 设计

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

然后编辑 `.env` 文件，配置各个服务商的 API 凭证：

#### CatFee 配置（必需，默认服务商）

1. 访问 https://catfee.io/?tab=api
2. 注册账户并登录
3. 在 API 页面获取你的 `API Key` 和 `API Secret`
4. 在 `.env` 文件中填写：

```bash
CATFEE_API_KEY=your_catfee_api_key_here
CATFEE_API_SECRET=your_catfee_api_secret_here
CATFEE_ENABLED=true
```

**重要**: CatFee 是默认启用的服务商，需要配置才能正常使用租赁功能。

#### 其他服务商配置（可选）

如果需要使用其他服务商，可以配置相应的 API Key：

- **GasStation**: `GASSTATION_API_KEY`
- **TronFuel**: `TRONFUEL_API_KEY` 和 `TRONFUEL_API_SECRET`
- **TronXEnergy**: `TRONXENERGY_API_KEY`

### 3. 运行服务

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

服务默认运行在 `http://localhost:4001`

## API 接口

### 1. 估算租赁费用

```http
GET /api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h
```

**响应示例：**
```json
{
  "provider": "catfee",
  "energyCost": 0.001,
  "bandwidthCost": 0.0001,
  "totalCost": 0.0011,
  "estimatedTime": 30,
  "savings": 0.005
}
```

### 2. 创建租赁订单

```http
POST /api/energy-rental/order
Content-Type: application/json

{
  "provider": "catfee",
  "receiverAddress": "TYourAddressHere",
  "energyAmount": 131000,
  "bandwidthAmount": 600,
  "duration": "1h"
}
```

**响应示例：**
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
  "createdAt": 1234567890000
}
```

### 3. 查询订单状态

```http
GET /api/energy-rental/order/catfee/cf_1234567890_abc123
```

**响应示例：**
```json
{
  "orderId": "cf_1234567890_abc123",
  "provider": "catfee",
  "status": "completed",
  "txHash": "0x...",
  "createdAt": 1234567890000
}
```

### 4. 获取支付信息（用于直接支付）

```http
GET /api/energy-rental/payment/catfee/cf_1234567890_abc123
```

**响应示例：**
```json
{
  "paymentAddress": "TServiceProviderAddress",
  "paymentAmount": 0.0011,
  "paymentAmountSun": 1100,
  "paymentMemo": "cf_1234567890_abc123",
  "orderId": "cf_1234567890_abc123",
  "provider": "catfee"
}
```

**使用说明：**
前端获取支付信息后，使用 TronWeb 直接发送 TRX 转账到 `paymentAddress`，金额为 `paymentAmountSun`（单位：SUN），备注为 `paymentMemo`。

## 服务商支持

### CatFee ✅
- 已实现完整的 API 集成
- 支持 HMAC-SHA256 签名认证
- API 文档: https://docs.catfee.io

### GasStation ✅
- 已实现费用估算和订单创建
- 订单状态查询需要根据实际 API 调整
- API 文档: https://gasdocs-en.gasstation.ai

### TronFuel ⚠️
- 框架已就绪，需要根据 API 文档完善
- API 文档: https://tronfuel.dev

### TronXEnergy ⚠️
- 框架已就绪，需要根据 API 文档完善
- API 文档: https://tronxenergy.com

## 前端集成

前端应该调用这个后端服务，而不是直接调用租赁服务商的 API：

```typescript
// 前端代码示例
const response = await fetch('http://localhost:4001/api/energy-rental/estimate', {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  params: {
    provider: 'catfee',
    energyAmount: 131000,
    bandwidthAmount: 600,
    duration: '1h',
  },
});
```

## 安全说明

- API 密钥和 Secret 存储在服务端环境变量中
- 签名生成在服务端完成
- 前端无需知道服务商的 API 凭证
- 建议在生产环境中使用 HTTPS

## 开发

```bash
# 运行测试
npm test

# 代码检查
npm run lint

# 构建
npm run build
```

## 许可证

Private
