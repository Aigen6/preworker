#!/bin/bash

# Configuration
API_URL=${1:-"http://localhost:3001"} # Default port from config.local.yaml
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="zkpay"
DB_PASS="zkpay"
DB_NAME="zkpay-backend"

echo "🔍 Testing Allocation Search API (Multiple Addresses)"
echo "URL: $API_URL/api/allocations/search"
echo "----------------------------------------"

# Try to fetch data from database
echo "📊 Fetching test data from database..."

export PGPASSWORD=$DB_PASS

# 1. Get a valid Chain ID from the latest checkbook
CHAIN_ID=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT chain_id FROM checkbooks ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | xargs)

ADDRESSES_JSON="[]"

if [ -z "$CHAIN_ID" ]; then
  echo "⚠️  No data found in database or connection failed. Using dummy data."
  CHAIN_ID=${2:-714}
  # Dummy addresses (32-byte Universal Address format)
  ADDRESSES_JSON='["0x0000000000000000000000001234567890123456789012345678901234567890", "0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd"]'
else
  echo "✅ Found Chain ID: $CHAIN_ID"
  
  # 2. Get up to 5 distinct depositor addresses (user_data) for this chain
  # These are the addresses that made deposits (depositor addresses)
  ADDRESSES=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT DISTINCT user_data FROM checkbooks WHERE user_chain_id = $CHAIN_ID LIMIT 5;" 2>/dev/null)
  
  # Format as JSON array
  # ADDRESSES will be newline separated strings
  ADDRESSES_JSON="["
  FIRST=true
  for addr in $ADDRESSES; do
      # Trim whitespace just in case
      addr=$(echo $addr | xargs)
      if [ -n "$addr" ]; then
          if [ "$FIRST" = true ]; then
              ADDRESSES_JSON="$ADDRESSES_JSON\"$addr\""
              FIRST=false
          else
              ADDRESSES_JSON="$ADDRESSES_JSON, \"$addr\""
          fi
      fi
  done
  ADDRESSES_JSON="$ADDRESSES_JSON]"
  
  echo "✅ Found addresses: $ADDRESSES_JSON"
fi

echo "Chain ID: $CHAIN_ID"
echo "----------------------------------------"

# Request Payload
PAYLOAD=$(cat <<EOF
{
  "chain_slip44_id": $CHAIN_ID,
  "addresses": $ADDRESSES_JSON,
  "status": ""
}
EOF
)

echo "Payload: $PAYLOAD"
echo "----------------------------------------"

# Execute Request
curl -s -X POST "$API_URL/api/allocations/search" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .

echo ""
echo "----------------------------------------"
