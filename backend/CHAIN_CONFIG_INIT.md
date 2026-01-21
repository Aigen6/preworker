# Chain Configuration 初始化指南

## 问题说明

如果 `/api/chains` 返回空列表 `{"chains":[],"total":0}`，说明数据库中的 `chain_configs` 表是空的，需要初始化链配置数据。

## 原因

- `/api/chains` 端点从数据库的 `chain_configs` 表读取数据
- 数据库表已通过 GORM AutoMigrate 创建，但表中没有初始数据
- 需要手动运行初始化脚本来插入链配置

## 解决方案

### 方案 1: 运行 SQL 初始化脚本（推荐）

```bash
# 连接到数据库并运行初始化脚本
psql -d zkpay-backend -f scripts/init_chain_config.sql

# 或者使用环境变量
psql -h localhost -U zkpay -d zkpay-backend -f scripts/init_chain_config.sql
```

### 方案 2: 通过 Admin API 创建链配置

如果后端运行在 localhost，可以使用 Admin API：

```bash
curl -X POST http://localhost:3001/api/admin/chains \
  -H "Content-Type: application/json" \
  -d '{
    "chain_id": 714,
    "chain_name": "Binance Smart Chain",
    "treasury_address": "0xc213D61801D3578F53A030752C8A32E7E3a3CcF8",
    "intent_manager_address": "0xb11b31743495504A9897b7Cc6EF739ebb4DdE219",
    "zkpay_address": "0xF5Dc3356F755E027550d82F665664b06977fa6d0",
    "rpc_endpoint": "https://bsc-dataseed1.binance.org/",
    "explorer_url": "https://bscscan.com",
    "sync_enabled": true
  }'
```

**注意**: Admin API 只能在 localhost 访问（受 `LocalhostOnly` 中间件保护）

### 方案 3: 直接执行 SQL

```sql
-- 连接到数据库
psql -d zkpay-backend

-- 执行插入语句
INSERT INTO chain_configs (
    chain_id,
    chain_name,
    treasury_address,
    intent_manager_address,
    zkpay_address,
    rpc_endpoint,
    explorer_url,
    sync_enabled,
    is_active,
    created_at,
    updated_at
) VALUES (
    714,
    'Binance Smart Chain',
    '0xc213D61801D3578F53A030752C8A32E7E3a3CcF8',
    '0xb11b31743495504A9897b7Cc6EF739ebb4DdE219',
    '0xF5Dc3356F755E027550d82F665664b06977fa6d0',
    'https://bsc-dataseed1.binance.org/',
    'https://bscscan.com',
    true,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (chain_id) DO UPDATE
SET
    treasury_address = EXCLUDED.treasury_address,
    intent_manager_address = EXCLUDED.intent_manager_address,
    zkpay_address = EXCLUDED.zkpay_address,
    rpc_endpoint = EXCLUDED.rpc_endpoint,
    explorer_url = EXCLUDED.explorer_url,
    updated_at = NOW();
```

## 验证

初始化后，验证配置是否正确：

```bash
# 检查 API 是否返回链配置
curl http://localhost:3001/api/chains

# 应该返回：
# {
#   "chains": [
#     {
#       "chain_id": 714,
#       "chain_name": "Binance Smart Chain",
#       ...
#     }
#   ],
#   "total": 1
# }

# 检查特定链
curl http://localhost:3001/api/chains/714
```

## 重要提示

1. **合约地址**: 请根据实际部署更新脚本中的合约地址：
   - `treasury_address`: Treasury 合约地址
   - `intent_manager_address`: IntentManager 合约地址
   - `zkpay_address`: ZKPay Proxy 合约地址（通常与 `config.yaml` 中的 `zkpay_proxy` 一致）

2. **多链支持**: 如果需要支持其他链（如 Ethereum、TRON），需要为每个链创建相应的配置记录。

3. **生产环境**: 在生产环境中，建议：
   - 将初始化脚本纳入部署流程
   - 使用配置管理工具（如 Ansible、Terraform）自动初始化
   - 或者添加启动时的自动初始化逻辑

## 自动初始化（可选）

如果需要后端启动时自动初始化，可以在 `database.go` 的 `InitDB()` 函数中添加初始化逻辑，但需要注意：
- 只在表为空时初始化
- 避免覆盖已有的配置
- 确保合约地址配置正确









