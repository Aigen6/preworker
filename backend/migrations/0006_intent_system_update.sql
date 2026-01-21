-- Migration: Intent System Update
-- Version: 2.0.0
-- Description: Add Intent system columns to existing tables (Checkbook, Check/Allocation, WithdrawRequest)
-- Reference: docs/backend/MIGRATION_GUIDE.md, docs/backend/SYSTEM_DESIGN.md
-- NOTE: This migrates EXISTING tables, not creating new tables with V2 suffix

-- ============================================
-- 1. Update Checks Table (Allocations)
-- ============================================

-- Add new columns for Allocation model
ALTER TABLE checks ADD COLUMN IF NOT EXISTS seq SMALLINT;
ALTER TABLE checks ADD COLUMN IF NOT EXISTS withdraw_request_id VARCHAR(36);

-- Update status column to use new enum values (idle, pending, used)
-- Migrate existing statuses if needed
UPDATE checks SET status = 'idle' WHERE status = 'available' OR status = 'pending_proof';
UPDATE checks SET status = 'used' WHERE status = 'completed' OR status = 'withdrawn';

-- Add index for withdraw_request_id
CREATE INDEX IF NOT EXISTS idx_checks_withdraw_request_id ON checks(withdraw_request_id);

-- Update foreign key (if not exists)
-- Note: This might fail if the table already has constraints, so we wrap it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_checks_withdraw_request' 
        AND table_name = 'checks'
    ) THEN
        ALTER TABLE checks ADD CONSTRAINT fk_checks_withdraw_request 
        FOREIGN KEY (withdraw_request_id) REFERENCES withdraw_requests(id) ON DELETE SET NULL;
    END IF;
END$$;

-- ============================================
-- 2. Update Checkbooks Table
-- ============================================

-- Add new columns
ALTER TABLE checkbooks ADD COLUMN IF NOT EXISTS commitment_tx_hash VARCHAR(66);
ALTER TABLE checkbooks ADD COLUMN IF NOT EXISTS commitment_block_number BIGINT;
ALTER TABLE checkbooks ADD COLUMN IF NOT EXISTS signature TEXT;

-- Rename proof_signature to proof_signature (if schema uses different name)
-- Note: Check your existing schema and adjust accordingly

-- Add index for commitment_tx_hash
CREATE INDEX IF NOT EXISTS idx_checkbooks_commitment_tx ON checkbooks(commitment_tx_hash);

-- ============================================
-- 3. Update WithdrawRequests Table
-- ============================================

-- Add Intent-related columns
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS intent_type SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS token_identifier VARCHAR(66);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS asset_id VARCHAR(66);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS preferred_chain INT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS allocation_ids JSON;

-- Add Stage 1: Proof Generation columns
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS proof_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS proof_generated_at TIMESTAMP;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS proof_error TEXT;

-- Add Stage 2: On-chain Verification columns
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS execute_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS execute_tx_hash VARCHAR(66);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS execute_block_number BIGINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS execute_error TEXT;

-- Add Stage 3: Intent Execution (Payout) columns
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_tx_hash VARCHAR(66);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_block_number BIGINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_completed_at TIMESTAMP;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_error TEXT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_last_retry_at TIMESTAMP;

-- Add Stage 4: Hook Purchase (Optional) columns
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_status VARCHAR(20) NOT NULL DEFAULT 'not_required';
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_tx_hash VARCHAR(66);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_completed_at TIMESTAMP;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_error TEXT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_last_retry_at TIMESTAMP;

-- Add indexes for new status columns
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_proof_status ON withdraw_requests(proof_status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_execute_status ON withdraw_requests(execute_status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_payout_status ON withdraw_requests(payout_status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_hook_status ON withdraw_requests(hook_status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_intent_type ON withdraw_requests(intent_type);

-- ============================================
-- 4. Data Migration (Optional)
-- ============================================

-- Migrate existing WithdrawRequest data to new fields
-- Set execute_status based on old status field
UPDATE withdraw_requests 
SET execute_status = 'success', 
    proof_status = 'completed'
WHERE status = 'verified' OR status = 'executed';

UPDATE withdraw_requests 
SET execute_status = 'failed', 
    proof_status = 'failed'
WHERE status = 'failed';

-- Set transaction_hash to execute_tx_hash for backward compatibility
UPDATE withdraw_requests 
SET execute_tx_hash = transaction_hash 
WHERE transaction_hash IS NOT NULL AND transaction_hash != '';

-- Set default Intent type to RawToken (0) for existing records
UPDATE withdraw_requests 
SET intent_type = 0 
WHERE intent_type IS NULL;

-- ============================================
-- 5. Add Comments (Optional, for documentation)
-- ============================================

COMMENT ON COLUMN checks.seq IS 'Sequence number (0-255) within checkbook';
COMMENT ON COLUMN checks.withdraw_request_id IS 'Foreign key to withdraw_requests (NULL if idle)';
COMMENT ON COLUMN checks.status IS 'Allocation status: idle (available), pending (locked by WithdrawRequest), used (nullifier consumed on-chain)';

COMMENT ON COLUMN checkbooks.commitment_tx_hash IS 'Commitment transaction hash (executeCommitment)';
COMMENT ON COLUMN checkbooks.commitment_block_number IS 'Block number where commitment was confirmed';
COMMENT ON COLUMN checkbooks.signature IS 'User signature (EIP-191/TIP-191)';

COMMENT ON COLUMN withdraw_requests.intent_type IS 'Intent type: 0=RawToken (native token), 1=AssetToken (derivative token)';
COMMENT ON COLUMN withdraw_requests.token_identifier IS 'For RawToken: token contract address';
COMMENT ON COLUMN withdraw_requests.asset_id IS 'For AssetToken: asset identifier (bytes32)';
COMMENT ON COLUMN withdraw_requests.preferred_chain IS 'Optional: preferred target chain for AssetToken';
COMMENT ON COLUMN withdraw_requests.allocation_ids IS 'JSON array of allocation UUIDs';

COMMENT ON COLUMN withdraw_requests.proof_status IS 'Stage 1 status: pending/in_progress/completed/failed';
COMMENT ON COLUMN withdraw_requests.execute_status IS 'Stage 2 status: pending/submitted/success/failed';
COMMENT ON COLUMN withdraw_requests.payout_status IS 'Stage 3 status: pending/processing/completed/failed';
COMMENT ON COLUMN withdraw_requests.hook_status IS 'Stage 4 status: not_required/pending/processing/completed/failed';

-- ============================================
-- 6. Update Triggers (if needed)
-- ============================================

-- Ensure updated_at trigger is working for all tables
-- (This assumes you already have update_updated_at_column function)

-- ============================================
-- Migration Complete
-- ============================================

-- Verification queries (run these to check migration success):
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'checks' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'checkbooks' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'withdraw_requests' ORDER BY ordinal_position;


