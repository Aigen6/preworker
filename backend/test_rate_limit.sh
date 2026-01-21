#!/bin/bash

# Test rate limiting specifically
BASE_URL="http://localhost:3001"
TEST_ADDRESS="0x$(openssl rand -hex 20)"
TEST_CHAIN="bsc"
TEST_TOKEN_KEY="USDT"

echo "=========================================="
echo "Testing Rate Limiting Logic"
echo "=========================================="
echo "Test Address: $TEST_ADDRESS"
echo ""

# First query - should succeed
echo "1. First query (should succeed):"
RESPONSE1=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "$RESPONSE1" | jq '{success, rate_limit_error, last_query_time}' 2>/dev/null || echo "$RESPONSE1"
echo ""

# Second query immediately - should be rate limited
echo "2. Second query immediately (should be rate limited):"
sleep 1
RESPONSE2=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "$RESPONSE2" | jq '{success, rate_limit_error, last_query_time, risk_score, risk_level}' 2>/dev/null || echo "$RESPONSE2"
echo ""

# Check HTTP status code
HTTP_CODE2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "HTTP Status Code: $HTTP_CODE2 (should be 429 for rate limit)"
echo ""

echo "=========================================="

