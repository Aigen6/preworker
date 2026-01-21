#!/bin/bash

# Go Backend Startup Script
# Ensure running in correct directory with CGO support enabled

set -e

# Check if in correct directory
if [ ! -f "cmd/server/main.go" ]; then
    echo "Error: Please run this script in the go-backend directory"
    echo "Current directory: $(pwd)"
    exit 1
fi

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "Error: Go is not installed or not in PATH"
    exit 1
fi

echo "Starting Go Backend server..."
echo "Service address: http://localhost:3001"
echo "Health check: curl http://localhost:3001/ping"
echo ""

# Enable CGO and run server
export CGO_ENABLED=1
go run cmd/server/main.go 