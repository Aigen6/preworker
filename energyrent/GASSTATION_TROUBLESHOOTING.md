# GasStation API 故障排查指南

## 常见错误

### 1. 403 Forbidden 错误

**错误信息**:
```
Request failed with status code 403
```

**可能原因**:

1. **缺少必需参数 `contract_address`**
   - 根据[官方文档](https://gasdocs-zh.gasstation.ai/api-references/gas-apis/apis/gas-estimate)，`contract_address` 是必需参数
   - 当前代码已修复，确保所有必需参数都已传递

2. **Secret 密钥格式不正确**
   - GasStation 的 `secret` 可能是 Base64 编码的字符串
   - 代码会自动尝试 Base64 解码，如果失败则使用原始字符串
   - 确保从 GasStation 后台复制的 secret 完整且正确

3. **加密方式不正确**
   - 算法：AES-ECB
   - 填充：PKCS7（自动）
   - 输出：Base64 UrlSafe（`+` → `-`，`/` → `_`，移除 `=` 填充）

4. **App ID 不正确或已过期**
   - 检查 App ID 是否正确
   - 确认 App ID 在 GasStation 后台是否仍然有效

5. **IP 白名单限制**
   - 某些 API 可能需要配置 IP 白名单
   - 检查 GasStation 后台的 IP 白名单设置

### 2. 加密相关错误

**Secret 密钥处理**:

代码会自动处理以下情况：
- Base64 编码的密钥（自动解码）
- UTF-8 字符串密钥（直接使用）
- 密钥长度不符合标准（自动补齐或截断）

**调试方法**:

查看日志中的加密信息：
```
🔐 GasStation 加密前数据: { payloadKeys: [...], payloadSize: ... }
🔐 GasStation 加密后数据长度: ...
```

### 3. 参数验证错误

**必需参数**（根据官方文档）:

对于 `/api/mpc/tron/gas/estimate`:
- `receive_address` (string, required) - 资源接收地址
- `address_to` (string, required) - 转账到账地址，用于预估矿工费
- `contract_address` (string, required) - 合约地址，用于预估矿工费
- `service_charge_type` (string, required) - 租赁周期 code

**service_charge_type 值**:
- `10010`: 10 分钟
- `20001`: 1 小时
- `30001`: 1 天

### 4. 网络连接错误

**错误信息**:
```
getaddrinfo ENOTFOUND openapi.gasstation.ai
```

**解决方法**:
1. 检查网络连接
2. 确认域名正确：`https://openapi.gasstation.ai`
3. 检查防火墙设置

## 调试步骤

### 1. 检查配置

查看启动日志中的配置信息：
```
🔧 GasStation 服务配置: {
  appId: '...',
  secret: '已配置',
  baseUrl: 'https://openapi.gasstation.ai',
  enabled: true
}
```

### 2. 检查请求

查看请求日志：
```
📤 GasStation API 请求: {
  method: 'GET',
  url: 'https://openapi.gasstation.ai/api/mpc/tron/gas/estimate',
  ...
}
```

### 3. 检查加密

查看加密日志：
```
🔐 GasStation 加密前数据: { ... }
🔐 GasStation 加密后数据长度: ...
```

### 4. 检查响应

查看错误响应：
```
❌ GasStation API 请求失败: {
  error: '...',
  response: { ... },
  status: 403
}
```

## 验证配置

### 1. 环境变量

确保 `.env` 文件中配置了：
```bash
GASSTATION_APP_ID=你的App_ID
GASSTATION_SECRET=你的Secret
GASSTATION_ENABLED=true
```

### 2. 测试 API

使用 curl 测试（需要先加密数据）：
```bash
curl -X GET \
'https://openapi.gasstation.ai/api/mpc/tron/gas/estimate?app_id=YOUR_APP_ID&data=ENCRYPTED_DATA'
```

### 3. 检查 GasStation 后台

1. 登录 GasStation 后台
2. 检查 API 应用状态
3. 检查 IP 白名单设置
4. 确认 App ID 和 Secret 是否正确

## 常见问题

### Q: Secret 密钥应该是什么格式？

A: GasStation 的 secret 可能是：
- Base64 编码的字符串（代码会自动解码）
- UTF-8 字符串（直接使用）

从 GasStation 后台复制时，保持原样即可，代码会自动处理。

### Q: 为什么需要 `contract_address`？

A: 根据官方文档，`contract_address` 用于预估矿工费。如果没有具体的合约地址，可以使用一个有效的 TRON 地址作为占位符，但最好使用实际的合约地址。

### Q: 如何获取正确的参数值？

A: 
- `receive_address`: 接收资源的 TRON 地址
- `address_to`: 转账目标地址
- `contract_address`: 合约地址（如果有）或有效的 TRON 地址
- `service_charge_type`: 根据时长选择（10分钟/1小时/1天）

## 相关链接

- GasStation 官方文档: https://gasdocs-zh.gasstation.ai
- 预估费用 API: https://gasdocs-zh.gasstation.ai/api-references/gas-apis/apis/gas-estimate
- 统一说明: https://gasdocs-zh.gasstation.ai/api-references/gas-apis/apis/description
