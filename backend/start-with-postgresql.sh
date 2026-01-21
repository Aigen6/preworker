#!/bin/bash

echo "🚀 启动 go-backend (PostgreSQL版本)"
echo "=================================="

# CheckPostgreSQL是否安装
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL未安装，请先安装PostgreSQL"
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt install postgresql postgresql-contrib"
    exit 1
fi

# CheckPostgreSQLservice是否运行
if ! pg_isready -h localhost -p 5432 &> /dev/null; then
    echo "❌ PostgreSQLservice未运行，请启动PostgreSQLservice"
    echo "   macOS: brew services start postgresql"
    echo "   Ubuntu: sudo systemctl start postgresql"
    exit 1
fi

echo "✅ PostgreSQLservice正在运行"

# CheckDatabase和用户是否存在
DB_EXISTS=$(psql -h localhost -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='zkpay_scanner'" 2>/dev/null)
USER_EXISTS=$(psql -h localhost -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='zkpay_user'" 2>/dev/null)

if [[ "$USER_EXISTS" != "1" ]] || [[ "$DB_EXISTS" != "1" ]]; then
    echo "⚠️  Database用户或Database不存在"
    echo "正在初始化PostgreSQLDatabase..."
    
    # 尝试CreateDatabase和用户
    if sudo -u postgres psql -f setup-postgresql.sql 2>/dev/null; then
        echo "✅ PostgreSQLDatabase初始化成功"
    else
        echo "⚠️  自动初始化失败，请手动运行："
        echo "   sudo -u postgres psql -f setup-postgresql.sql"
        echo "或者按照 POSTGRESQL_SETUP.md 手动设置"
    fi
else
    echo "✅ PostgreSQLDatabase和用户已存在"
fi

# 编译service器
echo "🔨 编译go-backendservice器..."
if go build -o bin/server cmd/server/main.go; then
    echo "✅ 编译成功"
else
    echo "❌ 编译失败"
    exit 1
fi

# 启动service器
echo "🚀 启动go-backendservice器..."
echo "configuration file: ../config.yaml (goBackendconfiguration段)"
echo "Database: PostgreSQL (zkpay_scanner)"
echo "监听端口: 3001"
echo "按 Ctrl+C 停止service器"
echo "=================================="

./bin/server 