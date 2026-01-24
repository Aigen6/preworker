# P2PSwap 启动指南

## 快速开始

### 1. 配置环境变量

```bash
# 复制示例配置文件
cp .env.example .env

# 编辑 .env 文件，至少设置以下必需项：
# - MASTER_SEED: KeyManager 主种子密钥
# - NEXT_PUBLIC_WALLET_SDK_URL: Wallet SDK URL
# - NEXT_PUBLIC_API_URL: Enclave Backend URL
```

### 2. 启动所有服务

```bash
# 使用启动脚本（推荐）
./start.sh
```

启动脚本会自动：
- ✅ 检查并创建 .env 文件
- ✅ 加载环境变量
- ✅ 构建 KeyManager（如果需要）
- ✅ 安装 Frontend 依赖（如果需要）
- ✅ 启动 KeyManager API 服务
- ✅ 启动 Frontend 开发服务器
- ✅ 生成 frontend/.env.local

### 3. 停止所有服务

```bash
# 使用停止脚本
./stop.sh

# 或按 Ctrl+C（如果在启动脚本的终端中）
```

## 服务地址

启动成功后，可以访问：

- **Frontend**: http://localhost:5173
- **KeyManager API**: http://localhost:8080

## 环境变量说明

### 必需配置

```bash
# KeyManager 主种子密钥（必须修改！）
MASTER_SEED=your-secure-random-seed-here

# Enclave Backend API URL（必需）
NEXT_PUBLIC_API_URL=http://localhost:3001

# KeyManager API 地址（前端使用）
NEXT_PUBLIC_KEYMANAGER_API_URL=http://localhost:8080

# WalletConnect（可选，仅在使用 WalletConnect 时需要）
# NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
```

### 可选配置

```bash
# 服务端口
KEYMANAGER_PORT=8080
FRONTEND_PORT=5173

# KeyManager API 地址（前端使用）
NEXT_PUBLIC_KEYMANAGER_API_URL=http://localhost:8080

# 合约地址（按需配置）
# 推荐：直接配置 DepositVault 地址（最简单）
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...

# 可选：如果需要从合约读取，配置 TreasuryConfigCore 地址
# NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...
```

## 手动启动（可选）

如果不想使用启动脚本，可以手动启动：

### 启动 KeyManager

```bash
cd keymanager
export MASTER_SEED="your-master-seed"
./keymanager -mode=api -port=8080
```

### 启动 Frontend

```bash
cd frontend
# 从根目录的 .env 复制 NEXT_PUBLIC_ 变量到 .env.local
grep "^NEXT_PUBLIC_" ../.env > .env.local
npm run dev
```

## 日志查看

启动脚本会创建日志文件：

```bash
# KeyManager 日志
tail -f keymanager.log

# Frontend 日志
tail -f frontend.log
```

## 故障排除

### 问题：KeyManager 启动失败

**检查**:
1. 确认 `MASTER_SEED` 已设置
2. 检查端口 8080 是否被占用
3. 查看 `keymanager.log` 日志

**解决**:
```bash
# 检查端口占用
lsof -i :8080

# 查看日志
tail -f keymanager.log
```

### 问题：Frontend 启动失败

**检查**:
1. 确认依赖已安装：`cd frontend && npm install`
2. 检查端口 5173 是否被占用
3. 查看 `frontend.log` 日志

**解决**:
```bash
# 重新安装依赖
cd frontend
rm -rf node_modules package-lock.json
npm install

# 查看日志
tail -f frontend.log
```

### 问题：环境变量未生效

**检查**:
1. 确认 `.env` 文件在项目根目录
2. 确认变量名正确（注意大小写）
3. Frontend 需要 `NEXT_PUBLIC_` 前缀

**解决**:
```bash
# 检查 .env 文件
cat .env

# 检查 frontend/.env.local
cat frontend/.env.local
```

## 开发模式

### 只启动 KeyManager

```bash
cd keymanager
export MASTER_SEED="your-master-seed"
./keymanager -mode=api -port=8080
```

### 只启动 Frontend

```bash
cd frontend
npm run dev
```

## 生产部署

生产环境建议：

1. **分离配置**: 使用不同的 .env 文件
2. **进程管理**: 使用 PM2 或 systemd
3. **反向代理**: 使用 Nginx 代理服务
4. **安全**: 确保 .env 文件不被提交到版本控制

## 脚本说明

- `start.sh`: 统一启动脚本，同时启动所有服务
- `stop.sh`: 停止所有服务
- `.env.example`: 环境变量示例文件
- `.env`: 实际环境变量文件（需要创建）

## 注意事项

1. ⚠️ **MASTER_SEED 安全**: 不要使用默认值，使用强随机字符串
2. ⚠️ **.env 文件**: 不要提交到版本控制（已在 .gitignore 中）
3. ⚠️ **端口冲突**: 确保端口 8080 和 5173 未被占用
4. ⚠️ **依赖安装**: 首次运行需要安装依赖，可能需要一些时间
