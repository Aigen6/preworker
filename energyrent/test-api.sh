#!/bin/bash

# Energy Rental Service API 测试脚本
# 用于测试各个 API 端点是否正常工作

BASE_URL="${ENERGY_RENTAL_API_URL:-http://localhost:4001}"
API_BASE="${BASE_URL}/api/energy-rental"

echo "🧪 Energy Rental Service API 测试"
echo "=================================="
echo "服务地址: ${BASE_URL}"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
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
        echo "  响应: $(echo "$body" | jq -c '.' 2>/dev/null || echo "$body" | head -c 100)"
        return 0
    else
        echo -e "${RED}✗ 失败 (${http_code})${NC}"
        echo "  错误: $(echo "$body" | jq -r '.message // .error // .' 2>/dev/null || echo "$body" | head -c 200)"
        return 1
    fi
}

# 1. 测试 CatFee 费用估算
echo "1️⃣  测试 CatFee 费用估算"
test_endpoint "CatFee 估算" "GET" \
    "${API_BASE}/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h"
echo ""

# 2. 测试 GasStation 费用估算
echo "2️⃣  测试 GasStation 费用估算"
test_endpoint "GasStation 估算" "GET" \
    "${API_BASE}/estimate?provider=gasstation&energyAmount=131000&bandwidthAmount=600&duration=1h"
echo ""

# 3. 测试 TronXEnergy 费用估算
echo "3️⃣  测试 TronXEnergy 费用估算"
test_endpoint "TronXEnergy 估算" "GET" \
    "${API_BASE}/estimate?provider=tronxenergy&energyAmount=131000&bandwidthAmount=600&duration=1h"
echo ""

# 4. 测试创建 CatFee 订单（需要有效的 TRON 地址）
echo "4️⃣  测试创建 CatFee 订单"
TEST_ADDRESS="TTestAddress1234567890123456789012345"  # 测试地址，实际使用时需要替换
test_endpoint "创建 CatFee 订单" "POST" \
    "${API_BASE}/order" \
    "{\"provider\":\"catfee\",\"receiverAddress\":\"${TEST_ADDRESS}\",\"energyAmount\":131000,\"bandwidthAmount\":600,\"duration\":\"1h\"}"
echo ""

# 5. 测试订单状态查询（需要有效的订单ID）
if [ -n "$1" ]; then
    ORDER_ID=$1
    PROVIDER=${2:-catfee}
    echo "5️⃣  测试查询订单状态 (${PROVIDER}/${ORDER_ID})"
    test_endpoint "查询订单状态" "GET" \
        "${API_BASE}/order/${PROVIDER}/${ORDER_ID}"
    echo ""
    
    echo "6️⃣  测试获取支付信息 (${PROVIDER}/${ORDER_ID})"
    test_endpoint "获取支付信息" "GET" \
        "${API_BASE}/payment/${PROVIDER}/${ORDER_ID}"
    echo ""
else
    echo "5️⃣  跳过订单状态查询（需要提供订单ID）"
    echo "   用法: $0 <orderId> [provider]"
    echo ""
fi

echo "=================================="
echo "✅ 测试完成"
echo ""
echo "💡 提示:"
echo "   - 如果 CatFee 估算返回 0，检查 .env 文件中的 CATFEE_API_KEY 和 CATFEE_API_SECRET"
echo "   - 查看后端日志了解详细错误信息"
echo "   - 使用 'curl -v' 查看详细请求/响应"
