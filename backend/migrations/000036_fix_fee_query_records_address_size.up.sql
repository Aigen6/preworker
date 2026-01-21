-- Migration: Fix address column size in fee_query_records table
-- Issue: Address field was VARCHAR(42) which is too short for some chains (e.g., Tron addresses can be 34+ chars)
-- Solution: Increase to VARCHAR(66) to support all address formats (Ethereum, Tron, Bitcoin, etc.)

-- Fix address column size
ALTER TABLE fee_query_records
    ALTER COLUMN address TYPE VARCHAR(66);

-- Add comment for documentation
COMMENT ON COLUMN fee_query_records.address IS 'Deposit address (supports all chain formats: Ethereum 0x42, Tron Base58 34+, Bitcoin Base58 34+, etc.)';






























