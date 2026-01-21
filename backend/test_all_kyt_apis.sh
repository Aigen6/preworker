#!/bin/bash

# Comprehensive test for all three KYT Oracle API endpoints
BASE_URL="http://localhost:3001"
TEST_ADDRESS1="0x$(openssl rand -hex 20)"
TEST_ADDRESS2="0x$(openssl rand -hex 20)"
TEST_CHAIN="bsc"
TEST_TOKEN_KEY="USDT"

echo "=========================================="
echo "Comprehensive Test: All Three KYT Oracle APIs"
echo "=========================================="
echo "Test Address 1: $TEST_ADDRESS1"
echo "Test Address 2: $TEST_ADDRESS2"
echo ""

# ============ Test 1: Associate Address with Invitation Code ============
echo "=========================================="
echo "Test 1: Associate Address with Invitation Code"
echo "=========================================="
echo ""

echo "1.1 Associate Address 1 with INVATE3:"
RESPONSE1=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/associate-address" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"code\": \"INVATE3\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE1" | jq '.' 2>/dev/null || echo "$RESPONSE1"
echo ""

echo "1.2 Associate Address 2 with TEST001:"
RESPONSE2=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/associate-address" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS2\",
    \"code\": \"TEST001\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE2" | jq '.' 2>/dev/null || echo "$RESPONSE2"
echo ""

# ============ Test 2: Query Invitation Code by Address ============
echo "=========================================="
echo "Test 2: Query Invitation Code by Address"
echo "=========================================="
echo ""

echo "2.1 Query Invitation Code for Address 1 (should return INVATE3):"
RESPONSE3=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/invitation-code" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE3" | jq '.' 2>/dev/null || echo "$RESPONSE3"
echo ""

echo "2.2 Query Invitation Code for Address 2 (should return TEST001):"
RESPONSE4=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/invitation-code" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS2\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE4" | jq '.' 2>/dev/null || echo "$RESPONSE4"
echo ""

# ============ Test 3: Query Fee Info with Rate Limiting ============
echo "=========================================="
echo "Test 3: Query Fee Info with Rate Limiting"
echo "=========================================="
echo ""

echo "3.1 First Fee Query for Address 1 (should succeed and show INVATE3 rate):"
RESPONSE5=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "$RESPONSE5" | jq '{success, data: {baseFeeRatePercent, finalFeeRatePercent, invitationCode, invitationSource, riskScore, riskLevel}, last_query_time, rate_limit_error}' 2>/dev/null || echo "$RESPONSE5"
echo ""

echo "3.2 Second Fee Query for Address 1 immediately (should be rate limited):"
sleep 1
RESPONSE6=$(curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "$RESPONSE6" | jq '{success, rate_limit_error, last_query_time, risk_score, risk_level}' 2>/dev/null || echo "$RESPONSE6"
echo ""

echo "3.3 First Fee Query for Address 2 (should succeed and show TEST001 rate):"
RESPONSE7=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS2\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"$TEST_TOKEN_KEY\"
  }")
echo "$RESPONSE7" | jq '{success, data: {baseFeeRatePercent, finalFeeRatePercent, invitationCode, invitationSource, riskScore, riskLevel}, last_query_time}' 2>/dev/null || echo "$RESPONSE7"
echo ""

# ============ Test 4: Re-associate and Verify ============
echo "=========================================="
echo "Test 4: Re-associate Address (Update to Lower Rate)"
echo "=========================================="
echo ""

echo "4.1 Re-associate Address 1 with TEST001 (should update to lower rate):"
RESPONSE8=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/associate-address" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"code\": \"TEST001\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE8" | jq '.' 2>/dev/null || echo "$RESPONSE8"
echo ""

echo "4.2 Query Invitation Code for Address 1 again (should now return TEST001):"
RESPONSE9=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/invitation-code" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE9" | jq '.' 2>/dev/null || echo "$RESPONSE9"
echo ""

echo "=========================================="
echo "All Tests Completed!"
echo "=========================================="

