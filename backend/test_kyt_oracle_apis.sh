#!/bin/bash

# Test script for KYT Oracle API endpoints
# Backend service should be running on port 3001
# KYT Oracle service should be running on port 8090

BASE_URL="http://localhost:3001"
TEST_ADDRESS="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
TEST_CHAIN="bsc"
TEST_TOKEN_KEY="USDT"

echo "=========================================="
echo "Testing KYT Oracle API Endpoints"
echo "=========================================="
echo ""

# Test 1: Get Invitation Code by Address
echo "1. Testing GET /api/kyt-oracle/invitation-code"
echo "   Request: address=$TEST_ADDRESS, chain=$TEST_CHAIN"
echo ""
RESPONSE1=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/invitation-code" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "   Response:"
echo "$RESPONSE1" | jq '.' 2>/dev/null || echo "$RESPONSE1"
echo ""
echo "----------------------------------------"
echo ""

# Test 2: Get Fee Info by Address (with rate limiting)
echo "2. Testing GET /api/kyt-oracle/fee-info"
echo "   Request: address=$TEST_ADDRESS, chain=$TEST_CHAIN, token_key=$TEST_TOKEN_KEY"
echo ""
RESPONSE2=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "   Response:"
echo "$RESPONSE2" | jq '.' 2>/dev/null || echo "$RESPONSE2"
echo ""
echo "----------------------------------------"
echo ""

# Test 3: Test rate limiting - query again immediately
echo "3. Testing Rate Limiting - Query again immediately (should be rate limited)"
echo ""
RESPONSE3=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "   Response (should show rate limit error):"
echo "$RESPONSE3" | jq '.' 2>/dev/null || echo "$RESPONSE3"
echo ""
echo "----------------------------------------"
echo ""

# Test 4: Associate Address with Invitation Code
echo "4. Testing POST /api/kyt-oracle/associate-address"
echo "   Request: address=$TEST_ADDRESS, code=TESTCODE123, chain=$TEST_CHAIN"
echo ""
RESPONSE4=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/associate-address" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"code\": \"TESTCODE123\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "   Response:"
echo "$RESPONSE4" | jq '.' 2>/dev/null || echo "$RESPONSE4"
echo ""
echo "----------------------------------------"
echo ""

# Test 5: Get Fee Info again after association (should use new code)
echo "5. Testing GET /api/kyt-oracle/fee-info after association"
echo "   (Note: This will fail rate limit, but shows the association was made)"
echo ""
RESPONSE5=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "   Response:"
echo "$RESPONSE5" | jq '.' 2>/dev/null || echo "$RESPONSE5"
echo ""
echo "=========================================="
echo "Test completed!"
echo "=========================================="

