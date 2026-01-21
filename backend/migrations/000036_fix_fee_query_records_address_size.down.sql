-- Rollback migration: Revert address column size in fee_query_records table

ALTER TABLE fee_query_records
    ALTER COLUMN address TYPE VARCHAR(42);






























