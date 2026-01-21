#!/bin/bash

# 🚀 Backend 统一构建脚本
# 功能: 交叉编译 amd64/linux 的 Docker 镜像

set -e

echo "🚀 Enclave Backend 构建开始"
echo "=========================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 默认配置
IMAGE_NAME="aigen2025/dino-backend"
VERSION="${VERSION:-v1}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
PUSH_IMAGE=false
USE_MIRROR=false
DOCKERFILE="Dockerfile"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            echo -e "${YELLOW}💡 版本标签: $VERSION${NC}"
            shift 2
            ;;
        --tag)
            # --tag 参数用于设置版本标签，而不是镜像名称
            VERSION="$2"
            echo -e "${YELLOW}💡 版本标签: $VERSION${NC}"
            shift 2
            ;;
        --image)
            # 新增 --image 参数用于设置镜像名称
            IMAGE_NAME="$2"
            echo -e "${YELLOW}💡 镜像名称: $IMAGE_NAME${NC}"
            shift 2
            ;;
        --platform)
            DOCKER_PLATFORM="$2"
            echo -e "${YELLOW}💡 目标平台: $DOCKER_PLATFORM${NC}"
            shift 2
            ;;
        --push)
            PUSH_IMAGE=true
            echo -e "${YELLOW}💡 构建后推送镜像${NC}"
            shift
            ;;
        --use-mirror)
            USE_MIRROR=true
            DOCKERFILE="Dockerfile.mirror"
            echo -e "${YELLOW}💡 使用国内镜像源${NC}"
            shift
            ;;
        --help)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  --version VERSION   设置镜像版本标签 (默认: v1)"
            echo "  --tag TAG           设置版本标签，等同于 --version (默认: v1)"
            echo "  --image IMAGE       设置镜像名称 (默认: aigen2025/dino-backend)"
            echo "  --platform PLATFORM 设置目标平台 (默认: linux/amd64)"
            echo "  --push              构建后推送镜像到仓库"
            echo "  --use-mirror        使用国内镜像源 (解决 Docker Hub 访问问题)"
            echo "  --help              显示此帮助信息"
            echo ""
            echo "示例:"
            echo "  $0                                    # 构建 aigen2025/dino-backend:v1"
            echo "  $0 --tag dino                         # 构建 aigen2025/dino-backend:dino"
            echo "  $0 --version v2.0.0                  # 构建 aigen2025/dino-backend:v2.0.0"
            echo "  $0 --image myrepo/backend --tag v1    # 构建 myrepo/backend:v1"
            echo "  $0 --tag dino --push                  # 构建并推送 aigen2025/dino-backend:dino"
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

# 配置文件说明
# 配置文件应该在运行时通过 volume 挂载，不需要打包进镜像
# 示例: docker run -v $(pwd)/config.yaml:/root/config.backend.yaml ...

# 检查 Go 环境（用于交叉编译选项）
HAS_GO=false
if command -v go &> /dev/null; then
    HAS_GO=true
    GO_VERSION=$(go version | awk '{print $3}')
    echo -e "${BLUE}📋 Go 版本: ${GO_VERSION}${NC}"
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
    
    docker build \
        -f "${DOCKERFILE}" \
        -t "${FULL_IMAGE_TAG}" \
        .
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
        echo -e "   docker run -p 3001:3001 -v \$(pwd)/config.yaml:/root/config.backend.yaml ${FULL_IMAGE_TAG}"
        echo -e "   或使用 docker-compose.yml 配置"
    fi
else
    echo -e "${RED}❌ Docker 镜像构建失败${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 构建完成！${NC}"

