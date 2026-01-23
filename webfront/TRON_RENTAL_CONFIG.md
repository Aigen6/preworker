# TRON Energy/Bandwidth 租赁服务配置指南

## 概述

本项目已集成 TRON Energy/Bandwidth 租赁功能，支持用户直接在界面中租赁资源，无需跳转到外部网站。

## 支持的服务商

1. **GasStation** - https://www.gasstation.ai/en-US
2. **TronFuel** - https://tronfuel.dev
3. **TronXEnergy** - https://tronxenergy.com

## 配置步骤

### 1. 环境变量配置

在 `.env.local` 或 `.env` 文件中添加以下环境变量：

```bash
# GasStation 配置
NEXT_PUBLIC_GASSTATION_API_KEY=your_api_key_here
NEXT_PUBLIC_GASSTATION_PAYMENT_ADDRESS=TYourPaymentAddressHere

# TronFuel 配置
NEXT_PUBLIC_TRONFUEL_API_KEY=your_api_key_here
NEXT_PUBLIC_TRONFUEL_PAYMENT_ADDRESS=TYourPaymentAddressHere

# TronXEnergy 配置
NEXT_PUBLIC_TRONXENERGY_API_KEY=your_api_key_here
NEXT_PUBLIC_TRONXENERGY_PAYMENT_ADDRESS=TYourPaymentAddressHere
```

### 2. 获取服务商凭证

#### GasStation
1. 访问 https://www.gasstation.ai/en-US
2. 注册账户并获取 API Key
3. 获取服务商的收款地址

#### TronFuel
1. 访问 https://tronfuel.dev
2. 联系服务商获取 API 凭证
3. 获取服务商的收款地址

#### TronXEnergy
1. 访问 https://tronxenergy.com
2. 注册账户并获取 API Key
3. 获取服务商的收款地址

### 3. 更新配置文件

编辑 `src/lib/config/tron-rental-config.ts`，确保配置正确：

```typescript
export const RENTAL_PROVIDER_CONFIG: Record<string, RentalProviderConfig> = {
  gasstation: {
    name: 'GasStation',
    apiKey: process.env.NEXT_PUBLIC_GASSTATION_API_KEY,
    paymentAddress: process.env.NEXT_PUBLIC_GASSTATION_PAYMENT_ADDRESS || '',
    apiBaseUrl: 'https://api.gasstation.ai',
    enabled: true,
  },
  // ... 其他服务商配置
}
```

## API 集成说明

### GasStation API 实现（已完成）

根据 [GasStation API 文档](https://gasdocs-en.gasstation.ai) 已完成以下实现：

#### 1. 费用估算 API ✅

**接口**: `GET /api/mpc/tron/gas/order/price`

**实现位置**: `src/lib/hooks/use-tron-energy-rental.ts` - `estimateGasStation()`

**功能**:
- 查询 Energy 和 Bandwidth 的实时价格
- 支持不同的租赁时长（10分钟、1小时、1天）
- 计算总费用和预计节省

**参数说明**:
- `resource_type`: "energy" 或 "bandwidth"
- `service_charge_type`: 
  - `10010` = 10分钟
  - `20001` = 1小时
  - `30001` = 1天（默认）

#### 2. 订单创建 API ✅

**接口**: `POST /api/mpc/tron/gas/create_order`

**实现位置**: `src/lib/hooks/use-tron-energy-rental.ts` - `createGasStationOrder()`

**功能**:
- 创建 Energy/Bandwidth 租赁订单
- 自动处理最小数量限制（Energy 最小 64,000）
- 返回订单号（trade_no）

**必需参数**:
- `request_id`: 唯一请求ID
- `receive_address`: 接收资源的TRON地址
- `service_charge_type`: 服务时长代码
- `energy_num`: Energy数量（≥64,000）
- `buy_type`: 0=指定数量, 1=系统估算

#### 3. 订单状态查询 API ⚠️

**实现位置**: `src/lib/hooks/use-tron-energy-rental.ts` - `checkGasStationOrderStatus()`

**注意**: GasStation API 文档中未明确列出订单状态查询接口，当前实现提供了基础框架。可能需要：
- 通过订单历史接口查询
- 使用 Webhook 接收状态更新
- 联系 GasStation 支持获取状态查询接口

### 其他服务商 API（待实现）

TronFuel 和 TronXEnergy 的 API 实现框架已就绪，需要根据各自的 API 文档完善：

1. **TronFuel API**
   - 参考: https://tronfuel.dev
   - 实现位置: `estimateTronFuel()`, `createTronFuelOrder()`, `checkTronFuelOrderStatus()`

2. **TronXEnergy API**
   - 参考: https://tronxenergy.com
   - 实现位置: `estimateTronXEnergy()`, `createTronXEnergyOrder()`, `checkTronXEnergyOrderStatus()`

### API 调用示例

#### 获取价格

```typescript
// 查询 Energy 价格（1天）
const response = await fetch(
  'https://api.gasstation.ai/api/mpc/tron/gas/order/price?resource_type=energy&service_charge_type=30001',
  {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  }
)
```

#### 创建订单

```typescript
const response = await fetch('https://api.gasstation.ai/api/mpc/tron/gas/create_order', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    request_id: 'unique_request_id',
    receive_address: 'TYourAddressHere',
    service_charge_type: '30001', // 1天
    energy_num: 131000,
    buy_type: 0, // 指定数量
  }),
})
```

## 使用流程

1. **用户连接 TRON 网络**
2. **系统自动检测 Energy/Bandwidth 余额**
3. **如果资源不足，显示租赁选项**
4. **用户点击"前往租赁"按钮**
5. **选择服务商并估算费用**
6. **确认租赁并支付**
7. **等待资源委托完成**
8. **自动刷新资源状态**

## 注意事项

1. **支付地址安全**：确保服务商的支付地址正确，避免资金损失
2. **API 密钥安全**：不要将 API 密钥提交到代码仓库，使用环境变量
3. **错误处理**：已实现完善的错误处理和用户提示
4. **订单状态**：GasStation 订单状态查询可能需要通过其他方式实现（Webhook 或订单历史）
5. **资源委托时间**：GasStation 通常在30秒内完成资源委托
6. **最小数量限制**：Energy 最小租赁数量为 64,000，系统会自动处理
7. **Bandwidth 处理**：GasStation 的 Bandwidth 租赁可能需要单独的订单或参数，当前实现主要针对 Energy

## 测试建议

1. 使用测试网络或小额金额进行测试
2. 验证支付流程的完整性
3. 测试不同服务商的集成
4. 验证错误处理机制
5. 测试资源委托后的实际使用

## 相关文件

- `src/lib/hooks/use-tron-energy-rental.ts` - 租赁服务核心逻辑
- `src/lib/hooks/use-tron-resources.ts` - 资源查询逻辑
- `src/components/deposit/tron-gas-rental-option.tsx` - 租赁UI组件
- `src/lib/config/tron-rental-config.ts` - 服务商配置

## 支持

如有问题，请参考各服务商的官方文档或联系技术支持。
