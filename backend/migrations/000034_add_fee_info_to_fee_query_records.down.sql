-- Rollback migration: Remove fee information fields from fee_query_records table

ALTER TABLE fee_query_records
    DROP COLUMN IF EXISTS last_base_fee,
    DROP COLUMN IF EXISTS last_fee_rate_bps,
    DROP COLUMN IF EXISTS last_base_fee_rate_percent,
    DROP COLUMN IF EXISTS last_risk_based_fee_percent,
    DROP COLUMN IF EXISTS last_final_fee_rate_percent,
    DROP COLUMN IF EXISTS last_invitation_code,
    DROP COLUMN IF EXISTS last_invitation_source;



