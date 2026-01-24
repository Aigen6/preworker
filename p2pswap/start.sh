#!/bin/bash

# P2PSwap 统一启动脚本
# 同时启动 KeyManager 和 Frontend 服务

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  P2PSwap 统一启动脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，从 .env.example 创建...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  请编辑 .env 文件，设置必要的配置（特别是 MASTER_SEED）${NC}"
        echo -e "${YELLOW}⚠️  按 Enter 继续，或 Ctrl+C 取消...${NC}"
        read
    else
        echo -e "${RED}❌ .env.example 文件不存在！${NC}"
        exit 1
    fi
fi

# 加载环境变量
echo -e "${GREEN}📋 加载环境变量...${NC}"
# 使用 set -a 自动导出所有变量，然后 source .env
set -a
source .env 2>/dev/null || true
set +a

# 检查必需的环境变量
if [ -z "$MASTER_SEED" ] || [ "$MASTER_SEED" = "your-master-seed-here-change-this-to-a-secure-random-string" ]; then
    echo -e "${RED}❌ 错误: MASTER_SEED 未设置或使用默认值！${NC}"
    echo -e "${YELLOW}请在 .env 文件中设置 MASTER_SEED${NC}"
    exit 1
fi

# 设置默认值
KEYMANAGER_PORT=${KEYMANAGER_PORT:-8080}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

echo -e "${GREEN}✅ 环境变量加载完成${NC}"
echo ""

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 正在停止服务...${NC}"
    if [ ! -z "$KEYMANAGER_PID" ]; then
        kill $KEYMANAGER_PID 2>/dev/null || true
        echo -e "${GREEN}✅ KeyManager 已停止${NC}"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        echo -e "${GREEN}✅ Frontend 已停止${NC}"
    fi
    exit 0
}

# 注册清理函数
trap cleanup SIGINT SIGTERM

# 检查 KeyManager 二进制文件
KEYMANAGER_BIN="$SCRIPT_DIR/keymanager/keymanager"
if [ ! -f "$KEYMANAGER_BIN" ]; then
    echo -e "${YELLOW}🔨 KeyManager 二进制文件不存在，正在构建...${NC}"
    cd keymanager
    go build -o keymanager ./cmd/keymanager/main.go
    cd ..
    if [ ! -f "$KEYMANAGER_BIN" ]; then
        echo -e "${RED}❌ KeyManager 构建失败！${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ KeyManager 构建完成${NC}"
fi

# 启动 KeyManager
echo -e "${BLUE}🚀 启动 KeyManager (端口 $KEYMANAGER_PORT)...${NC}"
cd keymanager
# 设置 MASTER_SEED 环境变量（从根目录的 .env 加载）
export MASTER_SEED="$MASTER_SEED"
./keymanager -mode=api -port=$KEYMANAGER_PORT > ../keymanager.log 2>&1 &
KEYMANAGER_PID=$!
cd ..

# 等待 KeyManager 启动
sleep 2
if ! kill -0 $KEYMANAGER_PID 2>/dev/null; then
    echo -e "${RED}❌ KeyManager 启动失败！${NC}"
    echo -e "${YELLOW}查看日志: tail -f keymanager.log${NC}"
    exit 1
fi

echo -e "${GREEN}✅ KeyManager 已启动 (PID: $KEYMANAGER_PID)${NC}"
echo -e "${GREEN}   API 地址: http://localhost:$KEYMANAGER_PORT${NC}"
echo ""

# 检查 Frontend 依赖
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}📦 Frontend 依赖未安装，正在安装...${NC}"
    cd frontend
    npm install
    cd ..
    echo -e "${GREEN}✅ Frontend 依赖安装完成${NC}"
fi

# 启动 Frontend
echo -e "${BLUE}🚀 启动 Frontend (端口 $FRONTEND_PORT)...${NC}"
cd frontend

# 创建 .env.local 文件（从 .env 复制 NEXT_PUBLIC_ 开头的变量）
echo -e "${GREEN}📋 生成 frontend/.env.local...${NC}"
grep "^NEXT_PUBLIC_" ../.env > .env.local 2>/dev/null || true

# 启动 Next.js
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# 等待 Frontend 启动
sleep 3
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Frontend 启动失败！${NC}"
    echo -e "${YELLOW}查看日志: tail -f frontend.log${NC}"
    kill $KEYMANAGER_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✅ Frontend 已启动 (PID: $FRONTEND_PID)${NC}"
echo -e "${GREEN}   访问地址: http://localhost:$FRONTEND_PORT${NC}"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ 所有服务已启动！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}服务信息:${NC}"
echo -e "  ${GREEN}KeyManager:${NC} http://localhost:$KEYMANAGER_PORT"
echo -e "  ${GREEN}Frontend:${NC}   http://localhost:$FRONTEND_PORT"
echo ""
echo -e "${YELLOW}日志文件:${NC}"
echo -e "  ${BLUE}KeyManager:${NC} keymanager.log"
echo -e "  ${BLUE}Frontend:${NC}   frontend.log"
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""

# 等待用户中断
wait
