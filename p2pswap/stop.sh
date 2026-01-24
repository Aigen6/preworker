#!/bin/bash

# P2PSwap 停止脚本
# 停止所有运行中的服务

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 正在停止 P2PSwap 服务...${NC}"

# 停止 KeyManager
KEYMANAGER_PID=$(pgrep -f "keymanager.*api" || true)
if [ ! -z "$KEYMANAGER_PID" ]; then
    echo -e "${GREEN}停止 KeyManager (PID: $KEYMANAGER_PID)...${NC}"
    kill $KEYMANAGER_PID 2>/dev/null || true
    sleep 1
    # 如果还在运行，强制杀死
    if kill -0 $KEYMANAGER_PID 2>/dev/null; then
        kill -9 $KEYMANAGER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ KeyManager 已停止${NC}"
else
    echo -e "${YELLOW}⚠️  KeyManager 未运行${NC}"
fi

# 停止 Frontend (Next.js)
FRONTEND_PID=$(pgrep -f "next dev" || true)
if [ ! -z "$FRONTEND_PID" ]; then
    echo -e "${GREEN}停止 Frontend (PID: $FRONTEND_PID)...${NC}"
    kill $FRONTEND_PID 2>/dev/null || true
    sleep 1
    # 如果还在运行，强制杀死
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill -9 $FRONTEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Frontend 已停止${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend 未运行${NC}"
fi

echo -e "${GREEN}✅ 所有服务已停止${NC}"
