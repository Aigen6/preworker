#!/bin/bash

# Go Backend Stop Script
# Stop all running Go backend processes

echo "Searching for Go Backend processes..."

# Find and stop go run processes
GO_PROCESSES=$(ps aux | grep "go run cmd/server/main.go" | grep -v grep | awk '{print $2}')

if [ -z "$GO_PROCESSES" ]; then
    echo "No running Go Backend processes found"
else
    echo "Found processes: $GO_PROCESSES"
    echo "Stopping processes..."
    echo "$GO_PROCESSES" | xargs kill -9
    echo "Go Backend processes stopped"
fi

# Check if port 3001 is still occupied
PORT_PROCESS=$(lsof -ti:3001)
if [ ! -z "$PORT_PROCESS" ]; then
    echo "Port 3001 still occupied, process ID: $PORT_PROCESS"
    echo "Stopping process occupying port..."
    kill -9 $PORT_PROCESS
    echo "Port 3001 released"
fi

echo "Cleanup complete" 