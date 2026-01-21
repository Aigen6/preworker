# Docker 镜像推送失败问题解决方案

## 问题分析

错误信息显示：
```
ERROR: failed to push dino:v1: push access denied, repository does not exist or may require authorization
```

## 可能的原因

1. **镜像名称错误**：构建时使用了 `dino` 而不是 `ploto/enclave-backend`
2. **未登录 Docker registry**：需要先登录到 Docker Hub 或私有 registry
3. **没有推送权限**：账户没有推送到该仓库的权限

## 解决方案

### 方案 1：使用正确的镜像名称构建（推荐）

```bash
cd /Users/qizhongzhu/enclave/backend
./build-docker.sh --tag ploto/enclave-backend --version v1 --push
```

### 方案 2：先登录 Docker registry

```bash
# 登录 Docker Hub
docker login

# 或登录私有 registry
docker login your-registry.com
```

### 方案 3：只构建不推送（本地测试）

```bash
# 去掉 --push 参数，只构建本地镜像
./build-docker.sh --tag ploto/enclave-backend --version v1
```

### 方案 4：检查构建命令

如果使用 Docker Desktop 的构建功能，检查：
1. 镜像名称是否设置为 `ploto/enclave-backend` 而不是 `dino`
2. 是否启用了自动推送功能
3. 是否已登录到正确的 registry

## 正确的构建命令

```bash
# 构建并推送到 Docker Hub
./build-docker.sh --tag ploto/enclave-backend --version v1 --push

# 或使用环境变量
IMAGE_NAME=ploto/enclave-backend VERSION=v1 ./build-docker.sh --push
```

## 验证

构建成功后，验证镜像：
```bash
docker images | grep ploto/enclave-backend
```
