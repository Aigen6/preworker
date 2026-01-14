#!/bin/bash

# 启动 Next.js 开发服务器（端口 5173）
echo "🚀 启动 Next.js 开发服务器 (端口 5173)..."
PORT=5173 npm run dev &
NEXT_PID=$!

# 等待服务器启动
echo "⏳ 等待服务器启动..."
sleep 5

# 检查服务器是否启动成功
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "❌ 服务器启动失败，请检查错误信息"
    kill $NEXT_PID 2>/dev/null
    exit 1
fi

# 启动 Cloudflare tunnel（使用已配置的 tunnel）
echo "🌐 启动 Cloudflare tunnel (enclave)..."
echo "📋 访问地址: https://wallet-test.enclave-hq.com"
cloudflared tunnel run enclave

# 清理：当脚本退出时，停止 Next.js 进程
trap "echo '🛑 停止服务器...'; kill $NEXT_PID 2>/dev/null; exit" INT TERM EXIT
