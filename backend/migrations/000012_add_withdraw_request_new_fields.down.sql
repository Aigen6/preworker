-- Rollback migration: Remove new fields from withdraw_requests table

-- Remove indexes
DROP INDEX IF EXISTS idx_withdraw_fallback_retry;
DROP INDEX IF EXISTS idx_withdraw_bridge_submission_id;
DROP INDEX IF EXISTS idx_withdraw_beneficiary_status;
DROP INDEX IF EXISTS idx_withdraw_hook_status;
DROP INDEX IF EXISTS idx_withdraw_payout_status;
DROP INDEX IF EXISTS idx_withdraw_beneficiary;

-- Remove Fallback Transfer fields
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS fallback_last_retry_at;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS fallback_retry_count;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS fallback_error;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS fallback_transferred;

-- Remove Hook CallData fields
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS hook_min_output_amount;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS hook_worker_id;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS hook_token_id;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS hook_chain_id;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS hook_intent_type;

-- Remove Bridge/Cross-chain tracking fields
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS expected_arrival_time;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS bridge_error_timestamp;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS bridge_error;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS bridge_status;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS bridge_submission_id;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS bridge_type;

-- Remove Worker execution fields
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS actual_output;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS worker_params;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS worker_type;

-- Remove Route Constraints fields
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS payout_deadline;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS min_output_amount;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS max_slippage_bps;
















