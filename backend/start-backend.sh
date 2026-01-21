#!/bin/bash

# 🚀 启动 Pool API 后端服务脚本

set -e

cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║           🚀 启动 Pool API 后端服务                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# 1. 检查配置文件
echo "📋 检查配置文件..."
if [ ! -f "config.yaml" ]; then
    if [ -f "/Users/qizhongzhu/enclave/config/go-backend/config.yaml" ]; then
        echo "📍 发现 config.yaml，复制到当前目录..."
        cp /Users/qizhongzhu/enclave/config/go-backend/config.yaml ./config.yaml
    else
        echo "❌ 错误: 找不到配置文件"
        echo "   请从 /Users/qizhongzhu/enclave/config/go-backend/config.yaml 复制"
        exit 1
    fi
else
    echo "✅ 配置文件存在"
fi
echo ""

# 2. 验证 Go 环境
echo "🔧 检查 Go 环境..."
if ! command -v go &> /dev/null; then
    echo "❌ 错误: Go 未安装"
    exit 1
fi
GO_VERSION=$(go version | awk '{print $3}')
echo "✅ Go 版本: $GO_VERSION"
echo ""

# 3. 编译后端
echo "🏗️  编译后端服务..."
if go build -o zkpay-backend ./cmd/server 2>&1; then
    echo "✅ 编译成功"
else
    echo "❌ 编译失败"
    exit 1
fi
echo ""

# 4. 检查端口
echo "🔌 检查端口 3001..."
if lsof -i :3001 > /dev/null 2>&1; then
    echo "⚠️  警告: 端口 3001 已被占用"
    echo "   请先关闭占用该端口的进程:"
    lsof -i :3001
    exit 1
else
    echo "✅ 端口 3001 可用"
fi
echo ""

# 5. 启动服务
echo "🚀 启动后端服务..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 后台启动
nohup ./zkpay-backend > backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > backend.pid

echo "✅ 后端服务已启动 (PID: $BACKEND_PID)"
echo ""

# 6. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 3

# 7. 验证服务
echo "🔍 验证服务..."
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ 后端服务已就绪 (http://localhost:3001)"
else
    echo "⚠️  等待中... (30秒超时)"
    for i in {1..10}; do
        sleep 3
        if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
            echo "✅ 后端服务已就绪"
            break
        fi
        echo "  ⏳ 尝试 $((i+1))/10..."
    done
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 后续操作:"
echo ""
echo "  1️⃣  查看实时日志:"
echo "      tail -f backend.log"
echo ""
echo "  2️⃣  运行 API 测试 (新终端):"
echo "      cd /Users/qizhongzhu/enclave/backend"
echo "      ./test-pool-api.sh"
echo ""
echo "  3️⃣  手动测试单个端点:"
echo "      curl http://localhost:3001/api/pools"
echo ""
echo "  4️⃣  停止服务:"
echo "      kill \$(cat backend.pid)"
echo ""
echo "✅ 启动完成！"
echo ""
