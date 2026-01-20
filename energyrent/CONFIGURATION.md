# Energy Rental Service 配置说明

## 必需配置

### 1. CatFee API 配置（必需，默认服务商）

CatFee 是默认启用的 Energy/Bandwidth 租赁服务商，必须配置才能正常使用。

```bash
# CatFee API 配置
CATFEE_API_KEY=your_catfee_api_key_here        # CatFee API Key（必需）
CATFEE_API_SECRET=your_catfee_api_secret_here  # CatFee API Secret（必需）
CATFEE_ENABLED=true                            # 是否启用 CatFee（默认 true）
```

**获取 API 凭证：**
1. 访问 https://catfee.io/?tab=api
2. 注册账户并登录
3. 在 API 页面获取你的 `API Key` 和 `API Secret`

**API 文档：** https://docs.catfee.io/en/getting-started/buy-energy-via-api-on-catfee/nodejs

## 可选配置

### 2. 服务端口配置

```bash
PORT=4001                              # 服务端口（默认 4001）
```

### 3. 前端 URL 配置（CORS）

```bash
FRONTEND_URL=http://localhost:5173     # 前端 URL（用于 CORS 配置，默认 http://localhost:3000）
```

### 4. 其他服务商配置（可选）

如果需要使用其他 Energy/Bandwidth 租赁服务商，可以配置相应的 API Key：

#### GasStation

```bash
GASSTATION_APP_ID=your_gasstation_app_id_here    # GasStation App ID
GASSTATION_SECRET=your_gasstation_secret_here    # GasStation Secret
GASSTATION_ENABLED=true                          # 是否启用 GasStation（默认 true）
```

**获取 API 凭证：**
- 访问 https://gasdocs-en.gasstation.ai/product-description/product-introduction/API
- 注册并获取 API Key

#### TronFuel

```bash
TRONFUEL_API_KEY=your_tronfuel_api_key_here      # TronFuel API Key
TRONFUEL_API_SECRET=your_tronfuel_api_secret_here # TronFuel API Secret
TRONFUEL_ENABLED=true                            # 是否启用 TronFuel（默认 true）
```

**获取 API 凭证：**
- 访问 https://tronfuel.dev
- 注册并获取 API Key 和 Secret

#### TronXEnergy

```bash
TRONXENERGY_API_KEY=your_tronxenergy_api_key_here # TronXEnergy API Key
TRONXENERGY_ENABLED=true                          # 是否启用 TronXEnergy（默认 true）
```

**获取 API 凭证：**
- 访问 https://tronxenergy.com
- 注册并获取 API Key

## 完整配置示例

### 最小配置（仅 CatFee）

```bash
# ===== 必需配置 =====
# CatFee API 配置
CATFEE_API_KEY=your_catfee_api_key_here
CATFEE_API_SECRET=your_catfee_api_secret_here
CATFEE_ENABLED=true

# ===== 可选配置 =====
# 服务端口
PORT=4001

# 前端 URL（CORS）
FRONTEND_URL=http://localhost:5173
```

### 完整配置（所有服务商）

```bash
# ===== 必需配置 =====
# CatFee API 配置
CATFEE_API_KEY=your_catfee_api_key_here
CATFEE_API_SECRET=your_catfee_api_secret_here
CATFEE_ENABLED=true

# ===== 可选配置 =====
# 服务端口
PORT=4001

# 前端 URL（CORS）
FRONTEND_URL=http://localhost:5173

# GasStation 配置
GASSTATION_APP_ID=your_gasstation_app_id_here
GASSTATION_SECRET=your_gasstation_secret_here
GASSTATION_ENABLED=true

# TronFuel 配置
TRONFUEL_API_KEY=your_tronfuel_api_key_here
TRONFUEL_API_SECRET=your_tronfuel_api_secret_here
TRONFUEL_ENABLED=true

# TronXEnergy 配置
TRONXENERGY_API_KEY=your_tronxenergy_api_key_here
TRONXENERGY_ENABLED=true
```

## 配置说明

### 服务商启用/禁用

每个服务商都可以通过设置 `*_ENABLED=false` 来禁用：

```bash
# 禁用 GasStation
GASSTATION_ENABLED=false

# 禁用 TronFuel
TRONFUEL_ENABLED=false

# 禁用 TronXEnergy
TRONXENERGY_ENABLED=false
```

**注意：** CatFee 是默认服务商，建议保持启用状态。

### 服务商优先级

当多个服务商都启用时，API 会返回所有可用服务商的报价，前端可以选择最优的服务商。

## 配置验证

启动服务后，检查日志确认配置是否正确：

```bash
npm run start:dev
```

查看日志输出：
- ✅ 服务启动成功：`🚀 Energy Rental Service is running on: http://localhost:4001`
- ✅ 已启用的服务商列表
- ⚠️ 未配置的服务商会显示警告（不影响服务运行）

## 常见问题

### 1. CatFee API 认证失败

**错误信息：** `401 Unauthorized` 或 `Invalid API Key`

**解决方案：**
- 检查 `CATFEE_API_KEY` 和 `CATFEE_API_SECRET` 是否正确
- 确认 API Key 和 Secret 没有多余的空格
- 验证 API Key 是否已激活

### 2. 服务商未启用

**错误信息：** `Provider not enabled` 或 `Provider not configured`

**解决方案：**
- 检查对应的 `*_ENABLED` 环境变量是否为 `true`
- 验证 API Key 是否已配置
- 查看日志确认服务商状态

### 3. CORS 错误

**错误信息：** `CORS policy: No 'Access-Control-Allow-Origin' header`

**解决方案：**
- 配置 `FRONTEND_URL` 环境变量为前端实际地址
- 确保前端 URL 格式正确（包含协议，如 `http://localhost:5173`）

### 4. 端口被占用

**错误信息：** `EADDRINUSE: address already in use :::4001`

**解决方案：**
- 更改 `PORT` 环境变量为其他端口
- 或停止占用端口的其他服务

## Docker 运行配置

使用 Docker 运行时，通过环境变量传递配置：

### 最小配置（仅 CatFee）

```bash
docker run -d \
  -p 4001:4001 \
  -e CATFEE_API_KEY=your_catfee_api_key \
  -e CATFEE_API_SECRET=your_catfee_api_secret \
  -e FRONTEND_URL=http://localhost:5173 \
  aigen2025/enclave-energyrent:v1
```

### 完整配置（所有服务商）

```bash
docker run -d \
  -p 4001:4001 \
  -e CATFEE_API_KEY=your_catfee_api_key \
  -e CATFEE_API_SECRET=your_catfee_api_secret \
  -e GASSTATION_APP_ID=your_gasstation_app_id \
  -e GASSTATION_SECRET=your_gasstation_secret \
  -e TRONFUEL_API_KEY=your_tronfuel_api_key \
  -e TRONFUEL_API_SECRET=your_tronfuel_api_secret \
  -e TRONXENERGY_API_KEY=your_tronxenergy_api_key \
  -e FRONTEND_URL=http://localhost:5173 \
  aigen2025/enclave-energyrent:v1
```

或使用 `.env` 文件：

```bash
docker run -d \
  -p 4001:4001 \
  --env-file .env \
  aigen2025/enclave-energyrent:v1
```

## 测试配置

启动服务后，测试 API 是否正常工作：

```bash
# 测试费用估算 API
curl "http://localhost:4001/api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

如果返回费用信息，说明配置正确。
