#!/bin/bash

# 查询哈希值是否在数据库中存在
# 用法: ./query-hash.sh <hash_value>

HASH_VALUE="${1:-0x0858929efd53d65a18a784b2213b2c4286ca123d6cd2f2a1043e7fa3528a7732}"

echo "🔍 查询哈希值: $HASH_VALUE"
echo "=========================================="
echo ""

# 检查 Docker 容器是否运行
if ! docker ps | grep -q zkpay-postgres; then
    echo "❌ PostgreSQL 容器未运行，请先启动 Docker Compose"
    exit 1
fi

# 使用正确的数据库名 zkpay_backend
DB_NAME="zkpay_backend"

# 查询 checkbooks 表的 commitment 字段
echo "📋 1. 检查 checkbooks.commitment (数据库: $DB_NAME):"
docker exec zkpay-postgres psql -U zkpay -d $DB_NAME -c "
SELECT 
    id,
    commitment,
    status,
    local_deposit_id,
    slip44_chain_id,
    amount,
    created_at
FROM checkbooks 
WHERE commitment = '$HASH_VALUE'
LIMIT 5;" 2>/dev/null || echo "   ⚠️ 查询失败或表不存在"

echo ""

# 查询 checks 表的 nullifier 字段
echo "📋 2. 检查 checks.nullifier (数据库: $DB_NAME):"
docker exec zkpay-postgres psql -U zkpay -d $DB_NAME -c "
SELECT 
    id,
    nullifier,
    checkbook_id,
    seq,
    amount,
    status,
    created_at
FROM checks 
WHERE nullifier = '$HASH_VALUE'
LIMIT 5;" 2>/dev/null || echo "   ⚠️ 查询失败或表不存在"

echo ""

# 查询 commitments 表的 commitment 字段
echo "📋 3. 检查 commitments.commitment (数据库: $DB_NAME):"
docker exec zkpay-postgres psql -U zkpay -d $DB_NAME -c "
SELECT 
    id,
    commitment,
    status,
    local_deposit_id,
    slip44_chain_id,
    allocatable_amount,
    created_at
FROM commitments 
WHERE commitment = '$HASH_VALUE'
LIMIT 5;" 2>/dev/null || echo "   ⚠️ 查询失败或表不存在"

echo ""

# 查询 failed_transactions 表的 nullifier 字段
echo "📋 4. 检查 failed_transactions.nullifier (数据库: $DB_NAME):"
docker exec zkpay-postgres psql -U zkpay -d $DB_NAME -c "
SELECT 
    id,
    nullifier,
    tx_type,
    status,
    checkbook_id,
    check_id,
    tx_hash,
    retry_count,
    created_at
FROM failed_transactions 
WHERE nullifier = '$HASH_VALUE'
LIMIT 5;" 2>/dev/null || echo "   ⚠️ 查询失败或表不存在"

echo ""

# 查询 withdraw_requests 表（可能包含相关哈希）
echo "📋 5. 检查 withdraw_requests.withdraw_nullifier (数据库: $DB_NAME):"
docker exec zkpay-postgres psql -U zkpay -d $DB_NAME -c "
SELECT 
    id,
    status,
    amount,
    withdraw_nullifier,
    transaction_hash,
    created_at
FROM withdraw_requests 
WHERE withdraw_nullifier = '$HASH_VALUE'
LIMIT 5;" 2>/dev/null || echo "   ⚠️ 查询失败或表不存在"

echo ""

# 综合查询：在所有可能包含该哈希值的字段中搜索
echo "📋 6. 综合搜索（所有表的所有相关字段，数据库: $DB_NAME）:"
docker exec zkpay-postgres psql -U zkpay -d $DB_NAME -c "
SELECT 
    'checkbooks' as table_name,
    id,
    commitment as hash_field,
    'commitment' as field_name,
    created_at
FROM checkbooks 
WHERE commitment = '$HASH_VALUE'

UNION ALL

SELECT 
    'checks' as table_name,
    id,
    nullifier as hash_field,
    'nullifier' as field_name,
    created_at
FROM checks 
WHERE nullifier = '$HASH_VALUE'

UNION ALL

SELECT 
    'commitments' as table_name,
    id,
    commitment as hash_field,
    'commitment' as field_name,
    created_at
FROM commitments 
WHERE commitment = '$HASH_VALUE'

UNION ALL

SELECT 
    'failed_transactions' as table_name,
    id,
    nullifier as hash_field,
    'nullifier' as field_name,
    created_at
FROM failed_transactions 
WHERE nullifier = '$HASH_VALUE'

UNION ALL

SELECT 
    'withdraw_requests' as table_name,
    id,
    withdraw_nullifier as hash_field,
    'withdraw_nullifier' as field_name,
    created_at
FROM withdraw_requests 
WHERE withdraw_nullifier = '$HASH_VALUE'

ORDER BY created_at DESC
LIMIT 10;" 2>/dev/null || echo "   ⚠️ 查询失败"

echo ""
echo "=========================================="
echo "✅ 查询完成"

