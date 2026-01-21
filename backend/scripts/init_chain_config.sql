-- Initialize BSC Chain Configuration
-- This script creates the chain configuration for BSC (chain_id = 714)
-- 
-- Usage:
--   psql -d zkpay-backend -f scripts/init_chain_config.sql
--   Or connect to database and run this script manually
--
-- Note: Update the contract addresses below to match your deployment

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
    714,  -- BSC SLIP-44 Chain ID
    'Binance Smart Chain',
    '0xc213D61801D3578F53A030752C8A32E7E3a3CcF8',  -- Enclave Treasury Proxy (update if needed)
    '0xb11b31743495504A9897b7Cc6EF739ebb4DdE219',  -- IntentManager (update if needed)
    '0xF5Dc3356F755E027550d82F665664b06977fa6d0',  -- ZKPay Proxy (from config.yaml)
    'https://bsc-dataseed1.binance.org/',
    'https://bscscan.com',
    true,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (chain_id) DO UPDATE
SET
    treasury_address = EXCLUDED.treasury_address,
    intent_manager_address = EXCLUDED.intent_manager_address,
    zkpay_address = EXCLUDED.zkpay_address,
    rpc_endpoint = EXCLUDED.rpc_endpoint,
    explorer_url = EXCLUDED.explorer_url,
    updated_at = NOW();




