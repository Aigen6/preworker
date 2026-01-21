FROM golang:1.23-alpine AS builder

# Install build dependencies (git for go mod download)
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy dependency files (leverage Docker cache)
COPY go.mod go.sum ./

# Disable CGO - PostgreSQL driver (jackc/pgx/v5) is pure Go and doesn't need CGO
# SQLite is not used in production, so we can disable CGO to avoid cross-compilation issues
ENV CGO_ENABLED=0
# Use auto toolchain to allow Go to download the required toolchain version
ENV GOTOOLCHAIN=auto
# Use default Go proxy (faster and more reliable)
# ENV GOPROXY=https://proxy.golang.org,direct
# Keep checksum verification enabled for security
# ENV GOSUMDB=sum.golang.org
ENV GO111MODULE=on

# Download dependencies (leverage Docker cache)
# Use -x flag for verbose output if needed for debugging
RUN go mod download

# Copy source code (code changes won't affect dependency layer cache)
COPY . .

# Update go.mod to ensure it's in sync with dependencies
RUN go mod tidy

# Build the application
# Use TARGETOS and TARGETARCH build args for cross-compilation support
# These are automatically set by Docker buildx when using --platform
ARG TARGETOS=linux
ARG TARGETARCH=amd64

# Cross-compile without CGO (pure Go build)
# PostgreSQL driver (jackc/pgx/v5) is pure Go, so CGO is not needed
# This avoids Go 1.23 compiler crash issues with CGO cross-compilation
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o zkpay-backend ./cmd/server

# Final stage
FROM alpine:latest

# Install runtime dependencies
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

# Copy compiled binary from builder
COPY --from=builder /app/zkpay-backend .

# Copy admin UI HTML file
COPY --from=builder /app/admin-token-config.html .

# Verify that admin-token-config.html exists (for debugging)
RUN ls -la admin-token-config.html || echo "WARNING: admin-token-config.html not found!"

# Note: Configuration file should be mounted at runtime via volume
# Example: -v $(pwd)/config.yaml:/root/config.backend.yaml

# Expose service port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

# Run the application
CMD ["./zkpay-backend", "-conf", "config.backend.yaml"]

