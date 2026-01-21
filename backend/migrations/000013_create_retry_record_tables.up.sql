-- Migration: Create retry record tables
-- Based on WITHDRAW_REQUEST_RETRY_DESIGN.md

-- PayoutRetryRecord table
CREATE TABLE IF NOT EXISTS payout_retry_records (
    id BIGSERIAL PRIMARY KEY,
    record_id VARCHAR(66) UNIQUE NOT NULL,
    request_id VARCHAR(66) NOT NULL,
    
    -- Retry data
    recipient VARCHAR(66) NOT NULL,
    token_key VARCHAR(50) NOT NULL,
    amount VARCHAR(78) NOT NULL,
    worker_type SMALLINT NOT NULL,
    worker_params TEXT,
    
    -- Retry tracking
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    last_retry_at TIMESTAMP,
    error_reason TEXT,
    
    -- Chain tracking
    chain_id BIGINT NOT NULL,
    contract_address VARCHAR(66),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FallbackRetryRecord table
CREATE TABLE IF NOT EXISTS fallback_retry_records (
    id BIGSERIAL PRIMARY KEY,
    record_id VARCHAR(66) UNIQUE NOT NULL,
    request_id VARCHAR(66) NOT NULL,
    
    -- Retry data
    intent_manager_address VARCHAR(66) NOT NULL,
    token VARCHAR(66) NOT NULL,
    beneficiary VARCHAR(66) NOT NULL,
    amount VARCHAR(78) NOT NULL,
    
    -- Retry tracking
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    last_retry_at TIMESTAMP,
    error_reason TEXT,
    
    -- Chain tracking
    chain_id BIGINT NOT NULL,
    contract_address VARCHAR(66),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payout_retry_request_id ON payout_retry_records(request_id);
CREATE INDEX IF NOT EXISTS idx_payout_retry_record_id ON payout_retry_records(record_id);
CREATE INDEX IF NOT EXISTS idx_payout_retry_chain_id ON payout_retry_records(chain_id);

CREATE INDEX IF NOT EXISTS idx_fallback_retry_request_id ON fallback_retry_records(request_id);
CREATE INDEX IF NOT EXISTS idx_fallback_retry_record_id ON fallback_retry_records(record_id);
CREATE INDEX IF NOT EXISTS idx_fallback_retry_chain_id ON fallback_retry_records(chain_id);

