# TRON Energy/Bandwidth 租赁服务集成指南

## 概述

前端已集成 TRON Energy/Bandwidth 租赁功能，支持用户直接在界面中使用 TRX 支付购买资源。

## 架构说明

### 前端 → 后端 → 服务商

```
前端 (webfront)
  ↓ HTTP API 调用
后端服务 (energyrent)
  ↓ 使用 API Key/Secret
租赁服务商 (CatFee/GasStation等)
```

### 为什么需要后端？

1. **安全性**：API 密钥和 Secret 存储在服务端，不会暴露给前端
2. **签名生成**：CatFee 等服务的 HMAC-SHA256 签名在服务端完成
3. **统一管理**：可以统一管理多个服务商的集成
4. **错误处理**：统一的错误处理和日志记录

## 前端配置

### 1. 环境变量

在 `.env.local` 中添加：

```bash
# Energy Rental Service API URL
NEXT_PUBLIC_ENERGY_RENTAL_API_URL=http://localhost:3001
```

生产环境配置实际的后端服务地址。

### 2. 后端服务启动

确保后端服务 `energyrent` 已启动并运行在配置的端口上。

## 使用流程

### 1. 用户操作流程

1. 用户连接 TRON 网络钱包
2. 系统自动检测 Energy/Bandwidth 余额
3. 如果资源不足，显示租赁选项
4. 用户点击"前往租赁"
5. 选择服务商（CatFee/GasStation/TronFuel/TronXEnergy）
6. 点击"估算费用"查看价格
7. 点击"使用TRX支付"
8. 系统创建订单并获取支付信息
9. 前端使用 TronWeb 发送 TRX 转账
10. 支付成功后，服务商自动委托资源
11. 系统自动刷新资源状态

### 2. 代码调用流程

```typescript
// 1. 估算费用
const estimate = await estimateRental(131000, 600, 'catfee', '1h')

// 2. 创建订单
const order = await createRentalOrder(131000, 600, 'catfee', '1h')

// 3. 获取支付信息（如果订单中没有）
const paymentInfo = await getPaymentInfo(order)

// 4. 使用 TronWeb 支付
const txHash = await payRentalOrder(order)

// 5. 查询订单状态
const updatedOrder = await checkOrderStatus(order)
```

## API 接口

### 前端调用的后端接口

#### 1. 估算费用
```typescript
GET /api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h
```

#### 2. 创建订单
```typescript
POST /api/energy-rental/order
Body: {
  provider: 'catfee',
  receiverAddress: 'TYourAddress',
  energyAmount: 131000,
  bandwidthAmount: 600,
  duration: '1h'
}
```

#### 3. 获取支付信息
```typescript
GET /api/energy-rental/payment/catfee/order_id
```

#### 4. 查询订单状态
```typescript
GET /api/energy-rental/order/catfee/order_id
```

## 支付实现

### TRX 转账流程

1. **获取支付信息**
   - 支付地址（服务商收款地址）
   - 支付金额（SUN 单位）
   - 支付备注（订单ID，用于关联）

2. **构建交易**
   ```typescript
   const transaction = await tronWeb.transactionBuilder.sendTrx(
     paymentAddress,    // 收款地址
     paymentAmountSun,  // 金额（SUN）
     userAddress        // 发送地址
   )
   ```

3. **添加备注**（可选）
   ```typescript
   transaction.raw_data.data = Buffer.from(paymentMemo).toString('hex')
   ```

4. **签名和广播**
   ```typescript
   const signed = await tronWeb.trx.sign(transaction)
   const result = await tronWeb.trx.broadcast(signed)
   ```

## 组件使用

### TronGasRentalOption 组件

在 deposit 和 preprocess 页面中已集成：

```tsx
<TronGasRentalOption
  requiredEnergy={131000}
  requiredBandwidth={600}
  onRentClick={() => {
    // 可选：自定义点击处理
  }}
/>
```

## 错误处理

前端已实现完善的错误处理：

- API 调用失败：显示错误提示
- 支付失败：显示具体错误信息
- 网络错误：自动重试或提示用户

## 注意事项

1. **后端服务必须运行**：前端依赖后端 API，确保后端服务已启动
2. **TronWeb 可用性**：支付需要 TronWeb 或 TronLink，确保用户已安装
3. **支付金额验证**：系统会验证支付金额是否有效
4. **订单状态轮询**：支付后可以轮询订单状态确认资源委托完成

## 调试

### 检查后端服务

```bash
# 检查后端是否运行
curl http://localhost:3001/api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600

# 检查环境变量
echo $NEXT_PUBLIC_ENERGY_RENTAL_API_URL
```

### 前端调试

在浏览器控制台查看：
- API 调用日志
- 支付交易详情
- 错误信息

## 相关文件

- `src/lib/hooks/use-tron-energy-rental.ts` - 租赁服务 Hook
- `src/lib/hooks/use-tron-resources.ts` - 资源查询 Hook
- `src/components/deposit/tron-gas-rental-option.tsx` - 租赁 UI 组件
- `src/app/deposit/page.tsx` - Deposit 页面集成
- `src/app/preprocess/page.tsx` - Preprocess 页面集成
