-- Add owner_address fields to withdraw_requests table
-- 为 withdraw_requests 表添加 owner_address 字段

ALTER TABLE withdraw_requests
ADD COLUMN IF NOT EXISTS owner_chain_id INTEGER,
ADD COLUMN IF NOT EXISTS owner_evm_chain_id INTEGER,
ADD COLUMN IF NOT EXISTS owner_data VARCHAR(66);

-- Add index on owner_chain_id for faster queries by owner
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_owner_chain_id ON withdraw_requests(owner_chain_id);

-- Add comment
COMMENT ON COLUMN withdraw_requests.owner_chain_id IS 'Owner SLIP-44 Chain ID';
COMMENT ON COLUMN withdraw_requests.owner_evm_chain_id IS 'Owner EVM Chain ID (optional)';
COMMENT ON COLUMN withdraw_requests.owner_data IS 'Owner address data (bytes32 hex)';

