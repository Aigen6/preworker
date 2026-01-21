-- Migration: Add adapter_id field to intent_adapters
-- Date: 2025-10-23
-- Description: Add business-level adapter_id field (unique per chain)
--              adapter_id is used in Asset ID encoding: ChainID + AdapterID + TokenID
--              Different from database ID (auto-increment), this is chain-specific

-- Add adapter_id column
ALTER TABLE intent_adapters 
ADD COLUMN IF NOT EXISTS adapter_id INTEGER;

-- Migrate existing data: use ID as adapter_id for backward compatibility
UPDATE intent_adapters 
SET adapter_id = id 
WHERE adapter_id IS NULL;

-- Make it NOT NULL after migration
ALTER TABLE intent_adapters 
ALTER COLUMN adapter_id SET NOT NULL;

-- Create unique constraint: (chain_id, adapter_id) must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_chain_adapter 
ON intent_adapters(chain_id, adapter_id);

-- Add comment
COMMENT ON COLUMN intent_adapters.adapter_id IS 'Business Adapter ID (unique per chain, used in Asset ID encoding)';

