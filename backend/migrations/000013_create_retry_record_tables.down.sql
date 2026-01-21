-- Rollback migration: Drop retry record tables

DROP INDEX IF EXISTS idx_fallback_retry_chain_id;
DROP INDEX IF EXISTS idx_fallback_retry_record_id;
DROP INDEX IF EXISTS idx_fallback_retry_request_id;

DROP INDEX IF EXISTS idx_payout_retry_chain_id;
DROP INDEX IF EXISTS idx_payout_retry_record_id;
DROP INDEX IF EXISTS idx_payout_retry_request_id;

DROP TABLE IF EXISTS fallback_retry_records;
DROP TABLE IF EXISTS payout_retry_records;
















