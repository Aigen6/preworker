# Energy Rental Service 快速启动指南

## 问题：ERR_CONNECTION_REFUSED

如果前端报错 `ERR_CONNECTION_REFUSED`，说明后端服务没有运行。

## 快速启动步骤

### 1. 进入后端目录

```bash
cd preworker/energyrent
```

### 2. 安装依赖（如果还没安装）

```bash
npm install
```

### 3. 配置环境变量

```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件，至少配置 CatFee
# CATFEE_API_KEY=your_api_key
# CATFEE_API_SECRET=your_api_secret
```

### 4. 启动服务

```bash
# 开发模式（推荐）
npm run start:dev

# 或者生产模式
npm run build
npm run start:prod
```

### 5. 验证服务运行

服务启动后，你应该看到：

```
🚀 Energy Rental Service is running on: http://localhost:4001
```

### 6. 测试 API

在另一个终端运行：

```bash
curl "http://localhost:4001/api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h"
```

如果返回 JSON 数据，说明服务正常运行。

## 使用 Tunnel 模式（同时启动前后端）

如果你想同时启动前端和后端，使用 tunnel 脚本：

```bash
cd preworker/webfront
npm run dev:tunnel
```

这个脚本会：
1. 自动启动后端服务（energyrent）
2. 启动前端服务（webfront）
3. 启动 Cloudflare Tunnel

## 常见问题

### 端口 3001 已被占用

```bash
# 查找占用端口的进程
lsof -ti:3001

# 或者使用其他端口
PORT=3002 npm run start:dev
```

然后在前端的 `.env.local` 中更新：
```bash
NEXT_PUBLIC_ENERGY_RENTAL_API_URL=http://localhost:3002
```

### 依赖安装失败

```bash
# 清除缓存重新安装
rm -rf node_modules package-lock.json
npm install
```

### CatFee API 配置错误

确保 `.env` 文件中配置了：
```bash
CATFEE_API_KEY=your_actual_api_key
CATFEE_API_SECRET=your_actual_api_secret
```

获取方式：https://catfee.io/?tab=api

## 检查服务状态

### 检查后端是否运行

```bash
# 方法1：检查端口
lsof -ti:3001

# 方法2：测试 API
curl http://localhost:4001/api/energy-rental/estimate?provider=catfee&energyAmount=1000&bandwidthAmount=100&duration=1h

# 方法3：查看进程
ps aux | grep "nest start"
```

### 查看日志

后端服务会在控制台输出日志，包括：
- 服务启动信息
- API 请求日志
- CatFee 响应数据
- 错误信息

## 下一步

服务启动后：
1. 刷新前端页面
2. 连接 TRON 网络
3. 尝试租赁 Energy/Bandwidth

如果还有问题，查看：
- `TESTING.md` - 测试指南
- `CATFEE_PAYMENT_MODES.md` - CatFee 支付模式说明
- `CONFIGURATION.md` - 配置指南
