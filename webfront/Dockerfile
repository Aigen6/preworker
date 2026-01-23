# Multi-stage build for Next.js Standalone mode
# Stage 1: Build the application
FROM node:20-alpine AS builder

# Install dependencies
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV REFRESH_DATE=2025-12-08-v4

# Copy package files
COPY package.json package-lock.json* ./

# Configure npm to use Chinese mirror for better network connectivity
RUN npm config set registry https://registry.npmmirror.com

# Install dependencies
# Note: package.json now uses npm versions of @enclave-hq/* packages
# This ensures consistent builds between local and Docker environments
RUN npm ci --production=false

# Debug: Verify packages are installed
RUN ls -la node_modules/@enclave-hq/ 2>&1 || echo "No @enclave-hq packages found" && \
    ls -la node_modules/@enclave-hq/sdk/ 2>&1 | head -5 || echo "SDK not found" && \
    ls -la node_modules/@enclave-hq/sdk/dist/ 2>&1 | head -5 || echo "SDK dist not found"

# Copy source code
COPY . .

# Build arguments for API configuration
# These will be embedded into the client-side code during build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_STATISTICS_API_URL
ARG NEXT_PUBLIC_ENERGY_RENTAL_API_URL

# Build the Next.js application (standalone mode)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_STATISTICS_API_URL=${NEXT_PUBLIC_STATISTICS_API_URL}
ENV NEXT_PUBLIC_ENERGY_RENTAL_API_URL=${NEXT_PUBLIC_ENERGY_RENTAL_API_URL}
# Allow font loading to fail during build (use fallback fonts)
ENV NEXT_FONT_LOAD_ERROR=ignore

RUN npm run build

# Stage 2: Production image with Node.js runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone files from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 安全加固：移除危险工具（Alpine 基础镜像默认包含 wget、busybox、sh）
# 移除 wget, curl 等可能被用于下载和执行恶意代码的工具
# 注意：busybox 和 sh 是 Alpine 的核心组件，完全删除会导致系统无法运行
# 我们只删除网络工具（wget、curl）的符号链接，保留基本的系统功能
RUN \
    # 删除 wget（通常是 busybox 的符号链接）
    rm -f /usr/bin/wget /bin/wget /sbin/wget 2>/dev/null || true && \
    # 删除 curl（如果存在）
    rm -f /usr/bin/curl /bin/curl /sbin/curl 2>/dev/null || true && \
    # 删除其他网络工具（nc、netcat、telnet 等）
    find /bin /usr/bin /sbin /usr/sbin -type l -lname "*busybox*" \( \
        -name "wget" -o \
        -name "curl" -o \
        -name "nc" -o \
        -name "netcat" -o \
        -name "telnet" -o \
        -name "ftp" \
    \) -delete 2>/dev/null || true && \
    # 删除 bash（如果存在）
    rm -f /bin/bash /usr/bin/bash /usr/local/bin/bash 2>/dev/null || true && \
    # 清理临时文件和缓存
    rm -rf /tmp/* /var/tmp/* /var/cache/apk/* 2>/dev/null || true && \
    # 验证删除结果
    (test ! -f /usr/bin/wget && test ! -f /usr/bin/curl && test ! -f /bin/wget && test ! -f /bin/curl) || echo "Warning: Some tools may still exist"

# 创建必要的可写目录（仅 /tmp）
RUN mkdir -p /tmp && \
    chown -R nextjs:nodejs /tmp && \
    chmod 1777 /tmp

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

