-- Revert: Remove owner_address fields from withdraw_requests table
-- 回滚：从 withdraw_requests 表移除 owner_address 字段

-- Drop index
DROP INDEX IF EXISTS idx_withdraw_requests_owner_chain_id;

-- Drop columns
ALTER TABLE withdraw_requests
DROP COLUMN IF EXISTS owner_chain_id,
DROP COLUMN IF EXISTS owner_evm_chain_id,
DROP COLUMN IF EXISTS owner_data;

