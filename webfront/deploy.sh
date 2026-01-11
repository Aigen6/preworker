#!/bin/bash

# Docker 登录和部署脚本

# 从环境变量读取 Docker token
if [ -z "$DOCKER_TOKEN" ]; then
    echo "❌ 错误: DOCKER_TOKEN 环境变量未设置"
    echo "请设置 DOCKER_TOKEN 环境变量: export DOCKER_TOKEN=your_token"
    exit 1
fi

echo "🔐 正在登录 Docker..."
echo "$DOCKER_TOKEN" | docker login -u ploto --password-stdin

if [ $? -eq 0 ]; then
    echo "✅ Docker 登录成功"
    echo ""
    echo "🚀 开始构建和部署..."
    ./build-docker.sh --api https://backend.enclavel-hq.com --test --push
else
    echo "❌ Docker 登录失败"
    exit 1
fi
