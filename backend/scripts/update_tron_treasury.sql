-- Update TRON Chain Configuration - Treasury Address
-- This script updates the Treasury contract address for TRON (chain_id = 195)
-- 
-- Usage:
--   psql -d zkpay-backend -f scripts/update_tron_treasury.sql
--   Or connect to database and run this script manually
--
-- Note: This updates only the Treasury address. Other contract addresses should be updated separately if needed.

INSERT INTO chain_configs (
    chain_id,
    chain_name,
    treasury_address,
    intent_manager_address,
    zkpay_address,
    rpc_endpoint,
    explorer_url,
    sync_enabled,
    is_active,
    created_at,
    updated_at
) VALUES (
    195,  -- TRON SLIP-44 Chain ID
    'TRON',
    'TWYKaMvx6MzwLt12MWXDvANeC5d9n3uQH2',  -- TRON Treasury address
    '',  -- IntentManager address (update if needed)
    '',  -- ZKPay address (update if needed)
    'https://api.trongrid.io',
    'https://tronscan.org',
    true,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (chain_id) DO UPDATE
SET
    treasury_address = EXCLUDED.treasury_address,
    rpc_endpoint = EXCLUDED.rpc_endpoint,
    explorer_url = EXCLUDED.explorer_url,
    updated_at = NOW();

-- Verify the update
SELECT 
    chain_id,
    chain_name,
    treasury_address,
    rpc_endpoint,
    is_active,
    updated_at
FROM chain_configs
WHERE chain_id = 195;


