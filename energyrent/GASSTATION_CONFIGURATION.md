# GasStation.ai 配置指南

## 快速开始

### 1. 创建环境变量文件

```bash
cd preworker/energyrent
cp .env.example .env
```

### 2. 获取 GasStation API 凭证

1. 访问 https://gasstation.ai
2. 注册账户并登录
3. 在 API 页面创建 API 应用，获取：
   - **App ID** (`app_id`)
   - **Secret** (`secret`) - 用于 AES 加密

### 3. 配置环境变量

编辑 `.env` 文件，填写你的 GasStation 凭证：

```bash
GASSTATION_APP_ID=你的App_ID
GASSTATION_SECRET=你的Secret
GASSTATION_ENABLED=true
```

### 4. 启动服务

```bash
npm install  # 如果还没安装依赖
npm run start:dev
```

服务将在 `http://localhost:3001` 启动。

## API 特点

根据 [GasStation 官方文档](https://gasdocs-zh.gasstation.ai/api-references/gas-apis/apis/description)：

### 加密方式

- **算法**: AES-ECB
- **填充**: PKCS7
- **输出格式**: Base64 UrlSafe
- **密钥**: 使用 `GASSTATION_SECRET` 作为加密密钥

### 请求格式

- **传输方式**: HTTPS
- **请求地址**: `https://openapi.gasstation.ai`
- **请求头**: `Content-Type: application/x-www-form-urlencoded`
- **请求参数**:
  - `app_id`: 你的 App ID
  - `data`: 加密后的 JSON 字符串（AES 加密）

### 响应格式

```json
{
  "code": 0,
  "msg": "Success",
  "data": { ... }
}
```

- `code: 0` 表示成功，非 0 表示错误

## 支持的接口

### 1. 费用估算

**端点**: `GET /api/mpc/tron/gas/estimate`

**参数**:
- `receive_address`: 接收地址（估算时可以使用占位地址）
- `address_to`: 目标地址
- `service_charge_type`: 服务时长类型
  - `10010`: 10 分钟
  - `20001`: 1 小时
  - `30001`: 1 天

**响应**:
```json
{
  "amount": "3.93",
  "energy_amount": "3.93",
  "energy_num": 131000,
  "energy_price": "0.00003"
}
```

### 2. 创建订单

**端点**: `POST /api/mpc/tron/gas/create_order`

**参数**:
- `request_id`: 唯一请求 ID
- `receive_address`: 接收地址
- `service_charge_type`: 服务时长类型
- `energy_num`: 能量数量（最小 64,000）
- `buy_type`: 购买类型（0 = 指定数量，1 = 系统估算）

**响应**:
```json
{
  "trade_no": "订单号"
}
```

### 3. 查询订单状态

**端点**: `GET /api/mpc/tron/gas/order/status`

**参数**:
- `trade_no`: 订单号

## 验证配置

启动服务后，如果配置正确，你应该看到：

```
🚀 Energy Rental Service is running on: http://localhost:3001
```

如果配置不正确，你会看到警告信息：

```
⚠️  GasStation API 配置不完整。请在 .env 文件中配置 GASSTATION_APP_ID 和 GASSTATION_SECRET。
```

## 测试 API

配置完成后，可以测试 API 是否正常工作：

```bash
# 测试费用估算
curl "http://localhost:3001/api/energy-rental/estimate?provider=gasstation&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

## 故障排查

### 错误：GasStation API 配置不完整

**原因**: `.env` 文件中没有配置 `GASSTATION_APP_ID` 或 `GASSTATION_SECRET`

**解决**:
1. 检查 `.env` 文件是否存在
2. 确认环境变量名称正确（注意大小写）
3. 确认值不为空

### 错误：加密失败

**原因**: Secret 密钥格式不正确或长度不符合 AES 要求

**解决**:
1. 确认 Secret 是从 GasStation 后台正确复制的
2. 检查 Secret 是否包含特殊字符或空格
3. 密钥长度应该是 16、24 或 32 字节（代码会自动处理）

### 错误：API 返回非 0 状态码

**原因**: 请求参数错误或 API 服务异常

**解决**:
1. 查看日志中的错误信息（`msg` 字段）
2. 检查请求参数是否正确
3. 确认 `receive_address` 是有效的 TRON 地址
4. 确认 `energy_num` >= 64000

### 错误：连接超时

**原因**: 网络问题或 GasStation API 服务不可用

**解决**:
1. 检查网络连接
2. 访问 https://gasstation.ai 确认服务是否正常
3. 稍后重试

## 注意事项

1. **最小能量数量**: GasStation 要求最小 64,000 Energy
2. **加密密钥**: Secret 必须保密，不要提交到代码仓库
3. **请求格式**: 所有请求参数都需要 AES 加密后发送
4. **时长类型**: 只支持 10 分钟、1 小时、1 天三种时长

## 相关链接

- GasStation 官网: https://gasstation.ai
- GasStation API 文档: https://gasdocs-zh.gasstation.ai
- 统一说明: https://gasdocs-zh.gasstation.ai/api-references/gas-apis/apis/description
