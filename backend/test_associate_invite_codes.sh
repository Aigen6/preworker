#!/bin/bash

# Test associate address with invitation codes
BASE_URL="http://localhost:3001"
KYT_ORACLE_URL="http://localhost:8090"
TEST_ADDRESS1="0x$(openssl rand -hex 20)"
TEST_ADDRESS2="0x$(openssl rand -hex 20)"
TEST_CHAIN="bsc"

echo "=========================================="
echo "Testing Associate Address with Invitation Codes"
echo "=========================================="
echo "Test Address 1: $TEST_ADDRESS1"
echo "Test Address 2: $TEST_ADDRESS2"
echo ""

# Test 1: Associate Address 1 with INVATE3
echo "1. Testing Associate Address 1 with INVATE3:"
RESPONSE1=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/associate-address" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"code\": \"INVATE3\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE1" | jq '.' 2>/dev/null || echo "$RESPONSE1"
echo ""

# Test 2: Associate Address 2 with TEST001
echo "2. Testing Associate Address 2 with TEST001:"
RESPONSE2=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/associate-address" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS2\",
    \"code\": \"TEST001\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE2" | jq '.' 2>/dev/null || echo "$RESPONSE2"
echo ""

# Test 3: Query invitation code for Address 1 (should return INVATE3)
echo "3. Testing Query Invitation Code for Address 1 (should return INVATE3):"
RESPONSE3=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/invitation-code" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE3" | jq '.' 2>/dev/null || echo "$RESPONSE3"
echo ""

# Test 4: Query invitation code for Address 2 (should return TEST001)
echo "4. Testing Query Invitation Code for Address 2 (should return TEST001):"
RESPONSE4=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/invitation-code" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS2\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE4" | jq '.' 2>/dev/null || echo "$RESPONSE4"
echo ""

# Test 5: Query fee info for Address 1 (should use INVATE3 rate)
echo "5. Testing Query Fee Info for Address 1 (should use INVATE3 rate):"
RESPONSE5=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"USDT\"
  }")
echo "$RESPONSE5" | jq '{success, data: {baseFeeRatePercent, finalFeeRatePercent, invitationCode, invitationSource}}' 2>/dev/null || echo "$RESPONSE5"
echo ""

# Test 6: Query fee info for Address 2 (should use TEST001 rate)
echo "6. Testing Query Fee Info for Address 2 (should use TEST001 rate):"
RESPONSE6=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS2\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"USDT\"
  }")
echo "$RESPONSE6" | jq '{success, data: {baseFeeRatePercent, finalFeeRatePercent, invitationCode, invitationSource}}' 2>/dev/null || echo "$RESPONSE6"
echo ""

# Test 7: Re-associate Address 1 with TEST001 (should update to lower rate)
echo "7. Testing Re-associate Address 1 with TEST001 (should update to lower rate):"
RESPONSE7=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/associate-address" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"code\": \"TEST001\",
    \"chain\": \"$TEST_CHAIN\"
  }")
echo "$RESPONSE7" | jq '.' 2>/dev/null || echo "$RESPONSE7"
echo ""

# Test 8: Query fee info for Address 1 again (should now use TEST001 rate)
echo "8. Testing Query Fee Info for Address 1 again (should now use TEST001 rate):"
RESPONSE8=$(curl -s -X POST "$BASE_URL/api/kyt-oracle/fee-info" \
  -H "Content-Type: application/json" \
  -d "{
    \"address\": \"$TEST_ADDRESS1\",
    \"chain\": \"$TEST_CHAIN\",
    \"token_key\": \"USDT\"
  }")
echo "$RESPONSE8" | jq '{success, data: {baseFeeRatePercent, finalFeeRatePercent, invitationCode, invitationSource}}' 2>/dev/null || echo "$RESPONSE8"
echo ""

echo "=========================================="
echo "Test completed!"
echo "=========================================="

