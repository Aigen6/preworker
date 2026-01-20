#!/bin/bash

# Statistics Service API 测试脚本
# 用于测试各个 API 端点是否正常工作

BASE_URL="${STATISTICS_API_URL:-http://localhost:4000}"

echo "🧪 Statistics Service API 测试"
echo "================================"
echo "服务地址: ${BASE_URL}"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    
    echo -n "测试 ${name}... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "${url}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "${method}" \
            -H "Content-Type: application/json" \
            -d "${data}" \
            "${url}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ 成功 (${http_code})${NC}"
        echo "  响应: $(echo "$body" | jq -c '.' 2>/dev/null || echo "$body" | head -c 200)"
        return 0
    else
        echo -e "${RED}✗ 失败 (${http_code})${NC}"
        echo "  错误: $(echo "$body" | jq -r '.message // .error // .' 2>/dev/null || echo "$body" | head -c 200)"
        return 1
    fi
}

# 1. 测试池统计数据查询
echo "1️⃣  测试池统计数据查询"
test_endpoint "池统计数据" "GET" \
    "${BASE_URL}/statistics/pools"
echo ""

# 2. 测试按链ID过滤查询
echo "2️⃣  测试按链ID过滤查询 (BSC)"
test_endpoint "BSC 池统计" "GET" \
    "${BASE_URL}/statistics/pools?chainId=56"
echo ""

# 3. 测试按日期范围查询
echo "3️⃣  测试按日期范围查询"
START_DATE=$(date -u -v-7d +%Y-%m-%d 2>/dev/null || date -u -d '7 days ago' +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
END_DATE=$(date -u +%Y-%m-%d)
test_endpoint "日期范围统计" "GET" \
    "${BASE_URL}/statistics/pools?startDate=${START_DATE}&endDate=${END_DATE}"
echo ""

# 4. 测试匹配分析摘要
echo "4️⃣  测试匹配分析摘要"
test_endpoint "匹配分析摘要" "GET" \
    "${BASE_URL}/matching/summary?startDate=${START_DATE}&endDate=${END_DATE}"
echo ""

# 5. 测试执行匹配分析
echo "5️⃣  测试执行匹配分析"
test_endpoint "执行匹配分析" "GET" \
    "${BASE_URL}/matching/analyze?startDate=${START_DATE}&endDate=${END_DATE}"
echo ""

# 6. 测试查询匹配结果
echo "6️⃣  测试查询匹配结果"
test_endpoint "查询匹配结果" "GET" \
    "${BASE_URL}/matching/results?matchType=pool_to_backend_deposit"
echo ""

# 7. 测试记录本机服务输入的 Deposit
echo "7️⃣  测试记录本机服务输入的 Deposit"
test_endpoint "记录 Deposit" "POST" \
    "${BASE_URL}/api/deposit-in-this-server" \
    '{"chainId":56,"checkbookId":"test-checkbook-id","depositTxHash":"0x123","depositAmount":"1000000000000000000","tokenAddress":"0x55d398326f99059fF775485246999027B3197955","userAddress":"0x1234567890123456789012345678901234567890","source":"test"}'
echo ""

# 8. 测试查询本机服务输入的 Deposit 列表
echo "8️⃣  测试查询本机服务输入的 Deposit 列表"
test_endpoint "查询 Deposit 列表" "GET" \
    "${BASE_URL}/api/deposit-in-this-server"
echo ""

echo "================================"
echo "✅ 测试完成"
echo ""
echo "💡 提示:"
echo "   - 如果查询返回空数组，可能是数据库中没有数据"
echo "   - 确保数据库已连接并包含 deposit_vault_events 表"
echo "   - 确保 Backend API 可访问（如果测试匹配分析）"
echo "   - 使用 'curl -v' 查看详细请求/响应"
