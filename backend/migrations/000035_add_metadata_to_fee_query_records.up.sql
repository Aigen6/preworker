-- Migration: Add metadata field to fee_query_records table
-- This allows storing complete detailed information from KYT Oracle and MistTrack API responses

-- Add metadata column to fee_query_records table
ALTER TABLE fee_query_records
    ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add comment for documentation
COMMENT ON COLUMN fee_query_records.metadata IS 'Complete detailed information from last query (JSON format), including MistTrack risk details, risk_detail list, etc.';






























