-- Rollback migration: Remove metadata field from fee_query_records table

ALTER TABLE fee_query_records
    DROP COLUMN IF EXISTS metadata;






























