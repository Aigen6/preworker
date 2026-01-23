# Tunnel 模式开发设置

本文档说明如何在 Cloudflare Tunnel 模式下同时启动前端和后端服务。

## 概述

在 tunnel 模式下，`dev-with-tunnel.sh` 脚本会：
1. 启动 Energy Rental 后端服务（端口 3001）
2. 启动 Next.js 前端服务（端口 5173）
3. 启动 Cloudflare Tunnel，将前端服务暴露到公网

前端通过 Next.js 的 `rewrites` 功能将 `/api/energy-rental/*` 请求代理到本地后端服务（localhost:3001）。

## 使用方法

### 1. 启动服务

在 `webfront` 目录下运行：

```bash
npm run dev:tunnel
```

或者直接运行脚本：

```bash
./dev-with-tunnel.sh
```

### 2. 服务地址

- **前端（本地）**: http://localhost:5173
- **前端（Tunnel）**: https://wallet-test.enclave-hq.com
- **后端（本地）**: http://localhost:3001
- **后端 API（通过前端代理）**: https://wallet-test.enclave-hq.com/api/energy-rental/*

### 3. 环境变量配置

在 tunnel 模式下，脚本会自动设置 `NEXT_PUBLIC_ENERGY_RENTAL_API_URL` 为空字符串，这样前端会使用相对路径访问后端 API，Next.js 会自动通过 `rewrites` 代理到本地后端服务。

如果需要手动配置，可以在 `.env.local` 中设置：

```bash
# 使用相对路径（推荐，tunnel 模式）
NEXT_PUBLIC_ENERGY_RENTAL_API_URL=

# 或使用绝对路径（本地开发）
NEXT_PUBLIC_ENERGY_RENTAL_API_URL=http://localhost:3001
```

## 工作原理

### Next.js Rewrites

在 `next.config.ts` 中配置了 rewrites，将前端请求代理到后端：

```typescript
async rewrites() {
  const energyRentalApiUrl = process.env.NEXT_PUBLIC_ENERGY_RENTAL_API_URL || 'http://localhost:3001';
  
  if (energyRentalApiUrl && !energyRentalApiUrl.startsWith('/') && energyRentalApiUrl !== '') {
    return [
      {
        source: '/api/energy-rental/:path*',
        destination: `${energyRentalApiUrl}/api/energy-rental/:path*`,
      },
    ];
  }
  
  return [];
}
```

### 前端 API 调用

在 `use-tron-energy-rental.ts` 中，如果 `API_BASE_URL` 为空，则使用相对路径：

```typescript
const ENERGY_RENTAL_API_URL = process.env.NEXT_PUBLIC_ENERGY_RENTAL_API_URL || 'http://localhost:3001'
const API_BASE_URL = ENERGY_RENTAL_API_URL === '' || ENERGY_RENTAL_API_URL === '/' 
  ? '' // 使用相对路径，通过 Next.js rewrites 代理
  : ENERGY_RENTAL_API_URL
```

这样，当前端调用 `/api/energy-rental/estimate` 时，Next.js 会自动代理到 `http://localhost:3001/api/energy-rental/estimate`。

## 注意事项

1. **后端服务必须先启动**: 确保 `energyrent` 服务在端口 3001 上正常运行
2. **CORS 配置**: 后端服务已配置 CORS，允许前端域名访问
3. **环境变量**: 后端服务需要配置相应的 API Key 和 Secret（见 `energyrent/.env.example`）

## 故障排查

### 后端服务未启动

如果看到 "Energy Rental 服务可能未完全启动" 的警告，检查：
- `energyrent` 目录是否存在
- `energyrent` 服务是否已安装依赖：`cd ../energyrent && npm install`
- 端口 3001 是否被占用

### API 请求失败

如果前端无法访问后端 API：
1. 检查后端服务是否在运行：`curl http://localhost:3001`
2. 检查 Next.js rewrites 是否生效：查看浏览器 Network 面板，确认请求路径
3. 检查环境变量是否正确设置

### Tunnel 连接问题

如果 tunnel 无法连接：
1. 检查 Cloudflare tunnel 配置：`cloudflared tunnel list`
2. 确认 tunnel 名称是否正确（当前为 `enclave`）
3. 检查网络连接和防火墙设置
