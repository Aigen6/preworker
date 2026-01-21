-- Migration: Merge ChainAdapterConfig into IntentAdapter
-- This migration merges the redundant ChainAdapterConfig table into IntentAdapter
-- ChainAdapterConfig and IntentAdapter store the same information (chain_id, adapter_id, address)

-- Step 1: Migrate data from chain_adapter_configs to intent_adapters
-- Only insert records that don't already exist in intent_adapters
INSERT INTO intent_adapters (
    adapter_id,
    chain_id,
    address,
    protocol,
    is_active,
    created_at,
    updated_at
)
SELECT 
    cac.adapter_id,
    cac.chain_id,
    LOWER(cac.adapter_address) as address,
    COALESCE(cac.protocol, 'Unknown') as protocol,
    cac.is_active,
    cac.created_at,
    cac.updated_at
FROM chain_adapter_configs cac
WHERE NOT EXISTS (
    SELECT 1 
    FROM intent_adapters ia 
    WHERE ia.chain_id = cac.chain_id 
      AND ia.adapter_id = cac.adapter_id
)
ON CONFLICT (chain_id, adapter_id) DO NOTHING;

-- Step 2: Update existing IntentAdapter records with data from ChainAdapterConfig
-- Update address, protocol, and is_active if they differ
UPDATE intent_adapters ia
SET 
    address = LOWER(cac.adapter_address),
    protocol = COALESCE(cac.protocol, ia.protocol),
    is_active = cac.is_active,
    updated_at = GREATEST(ia.updated_at, cac.updated_at)
FROM chain_adapter_configs cac
WHERE ia.chain_id = cac.chain_id 
  AND ia.adapter_id = cac.adapter_id
  AND (
    LOWER(ia.address) != LOWER(cac.adapter_address)
    OR COALESCE(ia.protocol, '') != COALESCE(cac.protocol, '')
    OR ia.is_active != cac.is_active
  );

-- Step 3: Drop the redundant chain_adapter_configs table
DROP TABLE IF EXISTS chain_adapter_configs;

-- Comments
COMMENT ON TABLE intent_adapters IS 'Adapter configuration for each chain. Merged from chain_adapter_configs table.';

