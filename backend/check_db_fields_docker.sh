#!/bin/bash

# Docker 查询数据库表结构的脚本
# 用于检查 withdraw_requests 表中的 proof 和 public_values 字段

echo "🔍 检查 Docker 容器中的数据库表结构..."
echo ""

# 检查容器是否运行
if ! docker ps | grep -q zkpay-postgres; then
    echo "❌ PostgreSQL 容器未运行"
    echo "   请先启动容器: docker-compose up -d postgres"
    exit 1
fi

echo "✅ PostgreSQL 容器正在运行"
echo ""

# 查询所有字段
echo "📋 withdraw_requests 表的所有字段："
docker exec zkpay-postgres psql -U zkpay -d zkpay-backend -c "
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'withdraw_requests' 
ORDER BY ordinal_position;
"

echo ""
echo "🔍 检查 proof 和 public_values 字段："
docker exec zkpay-postgres psql -U zkpay -d zkpay-backend -c "
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'withdraw_requests' 
AND (column_name = 'proof' OR column_name = 'public_values')
ORDER BY column_name;
"

echo ""
echo "🔍 查询包含 'proof' 或 'public' 的字段："
docker exec zkpay-postgres psql -U zkpay -d zkpay-backend -c "
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'withdraw_requests' 
AND (column_name LIKE '%proof%' OR column_name LIKE '%public%')
ORDER BY column_name;
"

echo ""
echo "✅ 查询完成"

