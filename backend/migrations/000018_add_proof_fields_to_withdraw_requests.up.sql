-- Migration: Add proof and public_values fields to withdraw_requests table
-- These fields are required to store ZKVM-generated proof data and public values

-- Add proof field (stores ZKVM proof data)
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS proof TEXT;

-- Add public_values field (stores ZKVM encoded public values)
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS public_values TEXT;

-- Add comment
COMMENT ON COLUMN withdraw_requests.proof IS 'ZKVM proof data (hex string)';
COMMENT ON COLUMN withdraw_requests.public_values IS 'ZKVM encoded public values (hex string, ready to use in executeWithdraw)';

