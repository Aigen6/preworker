-- Migration: Fix checkbook user_data column size
-- Version: 2.0.1
-- Description: Increase user_data column size from VARCHAR(50) to VARCHAR(66) to accommodate 32-byte Universal Address (0x + 64 hex chars)
-- Issue: Universal Address in hex format is 66 characters, but column was defined as VARCHAR(50)

-- Fix user_data column size in checkbooks table
-- Universal Address format: 0x + 64 hex characters = 66 characters total
ALTER TABLE checkbooks ALTER COLUMN user_data TYPE VARCHAR(66);

-- Add comment for documentation
COMMENT ON COLUMN checkbooks.user_data IS '32-byte Universal Address in hex format (0x + 64 hex chars = 66 chars)';

