#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENERGYRENT_DIR="$SCRIPT_DIR/../energyrent"

# 启动 Energy Rental 后端服务（端口 4001）
echo "🚀 启动 Energy Rental 后端服务 (端口 4001)..."
if [ -d "$ENERGYRENT_DIR" ]; then
    cd "$ENERGYRENT_DIR"
    
    # 检查是否已安装依赖
    if [ ! -d "node_modules" ]; then
        echo "📦 检测到未安装依赖，正在安装..."
        npm install
    fi
    
    # 启动服务（设置端口为 4001）
    PORT=4001 npm run start:dev > /tmp/energyrent.log 2>&1 &
    ENERGYRENT_PID=$!
    cd "$SCRIPT_DIR"
    echo "✅ Energy Rental 服务进程已启动 (PID: $ENERGYRENT_PID)"
    echo "📋 日志文件: /tmp/energyrent.log"
else
    echo "⚠️  Energy Rental 目录不存在: $ENERGYRENT_DIR"
    ENERGYRENT_PID=""
fi

# 启动 Next.js 开发服务器（端口 5173）
# 在 tunnel 模式下，使用相对路径访问后端 API（通过 Next.js rewrites 代理）
echo "🚀 启动 Next.js 开发服务器 (端口 5173)..."
echo "📝 设置 NEXT_PUBLIC_ENERGY_RENTAL_API_URL 为空，使用相对路径代理"
PORT=5173 NEXT_PUBLIC_ENERGY_RENTAL_API_URL= npm run dev &
NEXT_PID=$!

# 等待服务器启动
echo "⏳ 等待服务器启动..."
sleep 8

    # 检查 Energy Rental 服务是否启动成功
    if [ -n "$ENERGYRENT_PID" ]; then
        echo "🔍 检查 Energy Rental 服务状态..."
        for i in {1..10}; do
            if curl -s http://localhost:4001 > /dev/null 2>&1; then
                echo "✅ Energy Rental 服务已启动: http://localhost:4001"
                break
            fi
        if [ $i -eq 10 ]; then
            echo "⚠️  Energy Rental 服务启动超时，请检查日志: /tmp/energyrent.log"
            echo "📋 最后几行日志:"
            tail -5 /tmp/energyrent.log 2>/dev/null || echo "无法读取日志文件"
        else
            sleep 1
        fi
    done
fi

# 检查 Next.js 服务器是否启动成功
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "❌ Next.js 服务器启动失败，请检查错误信息"
    [ -n "$ENERGYRENT_PID" ] && kill $ENERGYRENT_PID 2>/dev/null
    kill $NEXT_PID 2>/dev/null
    exit 1
fi

# 启动 Cloudflare tunnel（使用已配置的 tunnel）
echo "🌐 启动 Cloudflare tunnel (enclave)..."
echo "📋 前端访问地址: https://wallet-test.enclave-hq.com"
echo "📋 Energy Rental API: http://localhost:4001 (本地) 或通过 tunnel 路由"
cloudflared tunnel run enclave

# 清理：当脚本退出时，停止所有进程
trap "echo '🛑 停止服务器...'; [ -n \"$ENERGYRENT_PID\" ] && kill $ENERGYRENT_PID 2>/dev/null; kill $NEXT_PID 2>/dev/null; exit" INT TERM EXIT
