#!/usr/bin/env node

/**
 * Debug script to check why checkbooks are not being returned
 * 
 * Usage:
 *   node debug-checkbook.js [user_address] [chain_id]
 * 
 * Example:
 *   node debug-checkbook.js 0x6f3995e2e40ca58adcbd47A2EdAD192E43D98638 714
 */

const { Client } = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'zkpay',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zkpay',
};

// Get user address and chain ID from command line or use defaults
const userAddress = process.argv[2] || '0x6f3995e2e40ca58adcbd47A2EdAD192E43D98638';
const chainId = parseInt(process.argv[3] || '714');

// SLIP-44 conversion (BSC EVM 56 -> SLIP-44 714)
const SLIP44_CHAIN_ID = chainId === 56 ? 714 : chainId;

console.log('🔍 Checkbook Debug Script');
console.log('='.repeat(60));
console.log(`User Address: ${userAddress}`);
console.log(`Chain ID: ${chainId} (SLIP-44: ${SLIP44_CHAIN_ID})`);
console.log(`API URL: ${API_URL}`);
console.log('='.repeat(60));
console.log('');

// Load config.yaml to get database DSN if available
function loadConfig() {
  const configPath = path.join(__dirname, 'config.yaml');
  if (fs.existsSync(configPath)) {
    const yaml = require('js-yaml');
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    if (config.database?.dsn) {
      // Parse PostgreSQL DSN
      const dsn = config.database.dsn;
      const match = dsn.match(/host=([^\s]+).*user=([^\s]+).*password=([^\s]+).*dbname=([^\s]+).*port=(\d+)/);
      if (match) {
        DB_CONFIG.host = match[1];
        DB_CONFIG.user = match[2];
        DB_CONFIG.password = match[3];
        DB_CONFIG.database = match[4];
        DB_CONFIG.port = parseInt(match[5]);
        console.log('✅ Loaded database config from config.yaml');
      }
    }
  }
}

// Normalize address for querying
function normalizeAddress(address, chainId) {
  if (!address) return '';
  const addr = address.toLowerCase();
  // For TRON (195), keep case-sensitive
  if (chainId === 195) {
    return addr;
  }
  // For EVM chains, lowercase
  return addr;
}

async function checkDatabase() {
  console.log('\n📊 Step 1: Checking Database');
  console.log('-'.repeat(60));
  
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Check total checkbooks
    const totalResult = await client.query('SELECT COUNT(*) as count FROM checkbooks');
    console.log(`\n📋 Total checkbooks in database: ${totalResult.rows[0].count}`);
    
    // Check checkbooks for this user
    const normalizedAddr = normalizeAddress(userAddress, SLIP44_CHAIN_ID);
    const query = `
      SELECT 
        id,
        chain_id,
        local_deposit_id,
        user_chain_id,
        user_data,
        token_id,
        amount,
        status,
        commitment,
        created_at,
        updated_at
      FROM checkbooks
      WHERE user_chain_id = $1 
        AND LOWER(user_data) = LOWER($2)
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const result = await client.query(query, [SLIP44_CHAIN_ID, normalizedAddr]);
    console.log(`\n📋 Checkbooks for user ${userAddress} (chain_id=${SLIP44_CHAIN_ID}):`);
    console.log(`   Found: ${result.rows.length} checkbook(s)`);
    
    if (result.rows.length > 0) {
      console.log('\n   Details:');
      result.rows.forEach((row, idx) => {
        console.log(`\n   [${idx + 1}] ID: ${row.id}`);
        console.log(`       Chain ID: ${row.chain_id} (user_chain_id: ${row.user_chain_id})`);
        console.log(`       User Data: ${row.user_data}`);
        console.log(`       Local Deposit ID: ${row.local_deposit_id}`);
        console.log(`       Token ID: ${row.token_id}`);
        console.log(`       Amount: ${row.amount}`);
        console.log(`       Status: ${row.status}`);
        console.log(`       Commitment: ${row.commitment || 'NULL'}`);
        console.log(`       Created: ${row.created_at}`);
      });
    } else {
      // Check if there are any checkbooks with different addresses
      const allCheckbooks = await client.query(`
        SELECT DISTINCT user_chain_id, user_data, COUNT(*) as count
        FROM checkbooks
        GROUP BY user_chain_id, user_data
        ORDER BY count DESC
        LIMIT 5
      `);
      
      if (allCheckbooks.rows.length > 0) {
        console.log('\n   ⚠️  No checkbooks found for this user, but found checkbooks for other users:');
        allCheckbooks.rows.forEach((row) => {
          console.log(`      Chain ID: ${row.user_chain_id}, User: ${row.user_data}, Count: ${row.count}`);
        });
      }
      
      // Check exact match (case-sensitive)
      const exactMatch = await client.query(`
        SELECT COUNT(*) as count
        FROM checkbooks
        WHERE user_chain_id = $1 AND user_data = $2
      `, [SLIP44_CHAIN_ID, userAddress]);
      
      console.log(`\n   🔍 Exact match (case-sensitive): ${exactMatch.rows[0].count} checkbook(s)`);
      
      // Check case-insensitive match
      const caseInsensitiveMatch = await client.query(`
        SELECT COUNT(*) as count
        FROM checkbooks
        WHERE user_chain_id = $1 AND LOWER(user_data) = LOWER($2)
      `, [SLIP44_CHAIN_ID, userAddress]);
      
      console.log(`   🔍 Case-insensitive match: ${caseInsensitiveMatch.rows[0].count} checkbook(s)`);
    }
    
    // Check allocations
    if (result.rows.length > 0) {
      const checkbookIds = result.rows.map(r => r.id);
      const allocationsResult = await client.query(`
        SELECT checkbook_id, COUNT(*) as count, status
        FROM checks
        WHERE checkbook_id = ANY($1)
        GROUP BY checkbook_id, status
        ORDER BY checkbook_id, status
      `, [checkbookIds]);
      
      if (allocationsResult.rows.length > 0) {
        console.log('\n   📦 Allocations:');
        allocationsResult.rows.forEach((row) => {
          console.log(`      Checkbook ${row.checkbook_id}: ${row.count} allocations (status: ${row.status})`);
        });
      }
    }
    
    await client.end();
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure PostgreSQL is running and accessible');
    } else if (error.code === '28P01') {
      console.error('   Authentication failed. Check database credentials.');
    }
    throw error;
  }
}

async function checkAPI() {
  console.log('\n🌐 Step 2: Checking API');
  console.log('-'.repeat(60));
  
  try {
    // First, try to authenticate
    console.log('\n1️⃣  Testing authentication...');
    
    // Get nonce
    const nonceResponse = await axios.get(`${API_URL}/api/auth/nonce`, {
      params: { address: userAddress, chainId: chainId }
    });
    console.log(`   ✅ Nonce endpoint works: ${nonceResponse.status}`);
    console.log(`   Nonce: ${nonceResponse.data.nonce || 'N/A'}`);
    
    // For now, we'll test without auth token (will get 401, but that's expected)
    console.log('\n2️⃣  Testing checkbooks API (without auth - will fail, but shows endpoint exists)...');
    try {
      const checkbooksResponse = await axios.get(`${API_URL}/api/checkbooks`, {
        params: { page: 1, limit: 20 }
      });
      console.log(`   ✅ API returned: ${checkbooksResponse.status}`);
      console.log(`   Data:`, JSON.stringify(checkbooksResponse.data, null, 2));
    } catch (apiError) {
      if (apiError.response) {
        console.log(`   ⚠️  API returned: ${apiError.response.status} ${apiError.response.statusText}`);
        console.log(`   Error: ${JSON.stringify(apiError.response.data, null, 2)}`);
        if (apiError.response.status === 401) {
          console.log('   ℹ️  This is expected - authentication required');
        }
      } else {
        console.error('   ❌ API request failed:', apiError.message);
      }
    }
    
    // Check allocations API
    console.log('\n3️⃣  Testing allocations API...');
    try {
      const allocationsResponse = await axios.get(`${API_URL}/api/allocations`, {
        params: { status: 'idle', page: 1, limit: 100 }
      });
      console.log(`   ✅ Allocations API returned: ${allocationsResponse.status}`);
      console.log(`   Data:`, JSON.stringify(allocationsResponse.data, null, 2));
    } catch (allocError) {
      if (allocError.response) {
        console.log(`   ⚠️  Allocations API returned: ${allocError.response.status}`);
        console.log(`   Error: ${JSON.stringify(allocError.response.data, null, 2)}`);
      } else {
        console.error('   ❌ Allocations API request failed:', allocError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ API check failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure the backend server is running on', API_URL);
    }
  }
}

async function main() {
  try {
    loadConfig();
    
    await checkDatabase();
    await checkAPI();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Debug check completed');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

