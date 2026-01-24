# P2PSwap 统一启动快速指南

## 🚀 快速开始（3 步）

### 1. 配置环境变量

```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env，至少设置：
# - MASTER_SEED: 你的密钥种子（必须修改！）
# - NEXT_PUBLIC_API_URL: Enclave Backend URL
```

### 2. 启动所有服务

```bash
./start.sh
```

### 3. 访问应用

- **Frontend**: http://localhost:5173
- **KeyManager API**: http://localhost:8080

## 📋 必需配置

在 `.env` 文件中至少配置：

```bash
# KeyManager 主种子（必须修改！）
MASTER_SEED=your-secure-random-seed-here

# Enclave Backend（必需）
NEXT_PUBLIC_API_URL=http://localhost:3001

# WalletConnect（可选，如果需要使用 WalletConnect）
# NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
```

## 🛑 停止服务

```bash
./stop.sh
```

或按 `Ctrl+C`（如果在启动脚本的终端中）

## 📝 详细说明

查看 [README_START.md](./README_START.md) 获取完整文档。
