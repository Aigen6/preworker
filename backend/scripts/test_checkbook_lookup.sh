#!/bin/bash

# Configuration
API_URL=${1:-"http://localhost:3001"} # Default port from config.local.yaml
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="zkpay"
DB_PASS="zkpay"
DB_NAME="zkpay-backend"

echo "🔍 Testing Checkbook Lookup by Deposit API"
echo "----------------------------------------"

# Try to fetch data from database
echo "📊 Fetching test data from database..."

export PGPASSWORD=$DB_PASS
DB_DATA=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT chain_id, deposit_transaction_hash FROM checkbooks WHERE deposit_transaction_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1;" 2>/dev/null)

if [ -z "$DB_DATA" ]; then
  echo "⚠️  No data found in database or connection failed. Using dummy data."
  CHAIN_ID=${2:-714}
  TX_HASH=${3:-"0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"}
else
  # Parse DB output
  if [[ $DB_DATA == *"|"* ]]; then
      CHAIN_ID=$(echo $DB_DATA | cut -d '|' -f 1 | xargs)
      TX_HASH=$(echo $DB_DATA | cut -d '|' -f 2 | xargs)
  else
      CHAIN_ID=$(echo $DB_DATA | awk '{print $1}')
      TX_HASH=$(echo $DB_DATA | awk '{print $3}')
  fi
  echo "✅ Found data: ChainID=$CHAIN_ID, TxHash=$TX_HASH"
fi

echo "URL: $API_URL/api/checkbooks/by-deposit/$CHAIN_ID/$TX_HASH"
echo "----------------------------------------"

# Execute Request
curl -s -X GET "$API_URL/api/checkbooks/by-deposit/$CHAIN_ID/$TX_HASH" \
  -H "Content-Type: application/json" | jq .

echo ""
echo "----------------------------------------"
