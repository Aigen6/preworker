#!/bin/bash

# 🚀 Statistics Service 统一构建脚本
# 功能: NestJS 应用 Docker 镜像构建

set -e

echo "🚀 Enclave Statistics Service 构建开始"
echo "======================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 默认配置
IMAGE_NAME="aigen2025/enclave-statistics"
VERSION="${VERSION:-v1}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
PUSH_IMAGE=false
DOCKERFILE="Dockerfile"
NO_CACHE=false

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            echo -e "${YELLOW}💡 版本标签: $VERSION${NC}"
            shift 2
            ;;
        --test)
            VERSION="test"
            echo -e "${YELLOW}💡 使用测试版本标签: test${NC}"
            shift
            ;;
        --tag)
            IMAGE_NAME="$2"
            echo -e "${YELLOW}💡 镜像名称: $IMAGE_NAME${NC}"
            shift 2
            ;;
        --platform)
            DOCKER_PLATFORM="$2"
            echo -e "${YELLOW}💡 目标平台: ${DOCKER_PLATFORM}${NC}"
            shift 2
            ;;
        --push)
            PUSH_IMAGE=true
            echo -e "${YELLOW}💡 构建后推送镜像${NC}"
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            echo -e "${YELLOW}💡 不使用缓存构建${NC}"
            shift
            ;;
        --help)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  --version VERSION   设置镜像版本标签 (默认: v1)"
            echo "  --test              使用测试版本标签 (构建 ${IMAGE_NAME}:test)"
            echo "  --tag TAG           设置完整镜像标签 (默认: ${IMAGE_NAME})"
            echo "  --platform PLATFORM 设置目标平台 (默认: linux/amd64)"
            echo "  --push              构建后推送镜像到仓库"
            echo "  --no-cache          不使用缓存构建"
            echo "  --help              显示此帮助信息"
            echo ""
            echo "示例:"
            echo "  $0                                    # 构建 ${IMAGE_NAME}:v1"
            echo "  $0 --version v1                       # 构建 ${IMAGE_NAME}:v1"
            echo "  $0 --test                            # 构建 ${IMAGE_NAME}:test"
            echo "  $0 --version v2.0.0                  # 构建 ${IMAGE_NAME}:v2.0.0"
            echo "  $0 --tag myrepo/statistics --version v1 # 构建 myrepo/statistics:v1"
            echo "  $0 --push                            # 构建并推送镜像"
            echo "  $0 --no-cache                        # 不使用缓存构建"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ 未知参数: $1${NC}"
            echo "使用 --help 查看帮助信息"
            exit 1
            ;;
    esac
done

FULL_IMAGE_TAG="${IMAGE_NAME}:${VERSION}"

echo -e "${BLUE}📋 构建配置:${NC}"
echo -e "  镜像标签: ${FULL_IMAGE_TAG}"
echo -e "  目标平台: ${DOCKER_PLATFORM}"
echo -e "  Dockerfile: ${DOCKERFILE}"
echo ""

# 检查 Docker 是否可用
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker 未安装或不在 PATH 中${NC}"
    exit 1
fi

# 检查 Dockerfile 是否存在
if [ ! -f "$DOCKERFILE" ]; then
    echo -e "${RED}❌ Dockerfile 不存在: $DOCKERFILE${NC}"
    exit 1
fi

# 初始化 buildx（如果需要）
if docker buildx version &> /dev/null; then
    # 检查是否存在 builder 实例
    if ! docker buildx ls | grep -q "multiarch"; then
        echo -e "${YELLOW}🔧 创建 buildx builder 实例${NC}"
        docker buildx create --name multiarch --use 2>/dev/null || true
    else
        echo -e "${BLUE}🔧 使用现有 buildx builder${NC}"
        docker buildx use multiarch 2>/dev/null || true
    fi
fi

# 构建 Docker 镜像
echo -e "\n${YELLOW}📦 构建 Docker 镜像${NC}"
echo -e "${BLUE}🏗️  镜像标签: ${FULL_IMAGE_TAG}${NC}"
echo -e "${BLUE}🎯 目标平台: ${DOCKER_PLATFORM}${NC}"

# 使用 buildx 支持多平台构建
if docker buildx version &> /dev/null; then
    echo -e "${BLUE}🔧 使用 Docker buildx 构建 (支持多平台)${NC}"
    
    BUILD_ARGS=(
        "buildx" "build"
        "--platform" "${DOCKER_PLATFORM}"
        "-f" "${DOCKERFILE}"
        "-t" "${FULL_IMAGE_TAG}"
    )
    
    if [ "$NO_CACHE" = true ]; then
        BUILD_ARGS+=("--no-cache")
    fi
    
    if [ "$PUSH_IMAGE" = true ]; then
        BUILD_ARGS+=("--push")
        echo -e "${YELLOW}📤 构建后自动推送镜像${NC}"
    else
        BUILD_ARGS+=("--load")
    fi
    
    BUILD_ARGS+=(".")
    
    docker "${BUILD_ARGS[@]}"
else
    echo -e "${BLUE}🔧 使用传统 Docker 构建${NC}"
    echo -e "${YELLOW}⚠️  注意: 传统构建可能不支持跨平台，将使用当前平台${NC}"
    
    BUILD_CMD=(
        "build"
        "-f" "${DOCKERFILE}"
        "-t" "${FULL_IMAGE_TAG}"
    )
    
    if [ "$NO_CACHE" = true ]; then
        BUILD_CMD+=("--no-cache")
    fi
    
    BUILD_CMD+=(".")
    
    docker "${BUILD_CMD[@]}"
fi

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Docker 镜像构建成功${NC}"
    echo -e "${GREEN}✅ 镜像标签: ${FULL_IMAGE_TAG}${NC}"
    
    # 显示镜像信息（仅在本地加载时）
    if [ "$PUSH_IMAGE" != true ]; then
        echo -e "\n${BLUE}📋 镜像信息:${NC}"
        docker images | grep "${IMAGE_NAME}" | grep "${VERSION}" | head -1
        echo ""
        echo -e "${BLUE}💡 使用方法:${NC}"
        echo -e "   docker run -p 4000:4000 ${FULL_IMAGE_TAG}"
        echo -e "   或使用 docker-compose.yml 配置"
    fi
else
    echo -e "${RED}❌ Docker 镜像构建失败${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 构建完成！${NC}"
