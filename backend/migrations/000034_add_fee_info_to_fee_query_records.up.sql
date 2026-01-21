-- Migration: Add fee information fields to fee_query_records table
-- This allows storing complete fee information from last query for rate limit responses

-- Add fee information columns to fee_query_records table
ALTER TABLE fee_query_records
    ADD COLUMN IF NOT EXISTS last_base_fee VARCHAR(78),
    ADD COLUMN IF NOT EXISTS last_fee_rate_bps INTEGER,
    ADD COLUMN IF NOT EXISTS last_base_fee_rate_percent DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_risk_based_fee_percent DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_final_fee_rate_percent DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_invitation_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS last_invitation_source VARCHAR(50);

-- Add comments for documentation
COMMENT ON COLUMN fee_query_records.last_base_fee IS 'Last base fee from query (wei as string)';
COMMENT ON COLUMN fee_query_records.last_fee_rate_bps IS 'Last fee rate in basis points from query';
COMMENT ON COLUMN fee_query_records.last_base_fee_rate_percent IS 'Last base fee rate percentage from query';
COMMENT ON COLUMN fee_query_records.last_risk_based_fee_percent IS 'Last risk-based fee percentage from query';
COMMENT ON COLUMN fee_query_records.last_final_fee_rate_percent IS 'Last final fee rate percentage from query';
COMMENT ON COLUMN fee_query_records.last_invitation_code IS 'Last invitation code from query';
COMMENT ON COLUMN fee_query_records.last_invitation_source IS 'Last invitation source from query (local or node-nft)';



