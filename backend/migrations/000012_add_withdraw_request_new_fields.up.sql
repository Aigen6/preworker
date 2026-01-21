-- Migration: Add new fields to withdraw_requests table
-- Based on WITHDRAW_REQUEST_COMPLETE_DESIGN.md and WITHDRAW_REQUEST_RETRY_DESIGN.md

-- Route Constraints (user-defined constraints for payout execution)
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS max_slippage_bps SMALLINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS min_output_amount VARCHAR(78);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS payout_deadline TIMESTAMP;

-- Worker execution fields
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS worker_type SMALLINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS worker_params TEXT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS actual_output VARCHAR(78);

-- Bridge/Cross-chain tracking (for cross-chain scenarios)
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS bridge_type VARCHAR(50);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS bridge_submission_id VARCHAR(255);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS bridge_status VARCHAR(50);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS bridge_error TEXT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS bridge_error_timestamp TIMESTAMP;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS expected_arrival_time TIMESTAMP;

-- Hook CallData (from WithdrawRequested event)
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_intent_type SMALLINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_chain_id INT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_token_id SMALLINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_worker_id SMALLINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS hook_min_output_amount VARCHAR(78);

-- Fallback Transfer (when Worker/Hook fails)
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fallback_transferred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fallback_error TEXT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fallback_retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fallback_last_retry_at TIMESTAMP;

-- Add indexes for beneficiary queries (for beneficiary API)
CREATE INDEX IF NOT EXISTS idx_withdraw_beneficiary ON withdraw_requests(recipient_slip44_chain_id, recipient_data);
CREATE INDEX IF NOT EXISTS idx_withdraw_payout_status ON withdraw_requests(payout_status);
CREATE INDEX IF NOT EXISTS idx_withdraw_hook_status ON withdraw_requests(hook_status);
CREATE INDEX IF NOT EXISTS idx_withdraw_beneficiary_status ON withdraw_requests(recipient_slip44_chain_id, recipient_data, status);

-- Add index for bridge tracking
CREATE INDEX IF NOT EXISTS idx_withdraw_bridge_submission_id ON withdraw_requests(bridge_submission_id) WHERE bridge_submission_id IS NOT NULL;

-- Add index for fallback retry queries
CREATE INDEX IF NOT EXISTS idx_withdraw_fallback_retry ON withdraw_requests(fallback_retry_count, fallback_transferred) WHERE fallback_transferred = FALSE;
















