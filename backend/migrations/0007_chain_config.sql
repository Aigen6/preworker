-- Migration: Add Chain Configuration Tables
-- Created: 2025-10-23
-- Description: Adds tables for managing contract addresses across different chains

-- Chain Configuration (stores contract addresses for each chain)
CREATE TABLE IF NOT EXISTS chain_configs (
    id BIGSERIAL PRIMARY KEY,
    chain_id INTEGER UNIQUE NOT NULL,                    -- SLIP-44 Chain ID (60=ETH, 714=BSC, 966=Polygon, 195=TRON)
    chain_name VARCHAR(50) NOT NULL,                     -- Ethereum, BSC, Polygon, TRON
    treasury_address VARCHAR(66) NOT NULL,               -- Treasury contract address
    intent_manager_address VARCHAR(66) NOT NULL,         -- IntentManager contract address
    zkpay_address VARCHAR(66) NOT NULL,                  -- ZKPay contract address
    rpc_endpoint VARCHAR(200) NOT NULL,                  -- RPC endpoint for chain interaction
    explorer_url VARCHAR(200),                           -- Block explorer URL
    sync_enabled BOOLEAN NOT NULL DEFAULT true,          -- Whether to sync RawToken from this chain
    sync_block_number BIGINT DEFAULT 0,                  -- Last synced block number
    last_synced_at TIMESTAMP,                            -- Last sync timestamp
    is_active BOOLEAN NOT NULL DEFAULT true,             -- Active status
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for active chain lookups
CREATE INDEX IF NOT EXISTS idx_chain_configs_is_active ON chain_configs(is_active);

-- Chain Adapter Configuration (stores Adapter addresses for each chain)
CREATE TABLE IF NOT EXISTS chain_adapter_configs (
    id BIGSERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,                           -- SLIP-44 Chain ID
    adapter_id INTEGER NOT NULL,                         -- Adapter ID (references intent_adapters.id)
    adapter_address VARCHAR(66) NOT NULL,                -- Adapter contract address on this chain
    protocol VARCHAR(30),                                -- Aave V3, Lido, Yearn
    is_active BOOLEAN NOT NULL DEFAULT true,             -- Active status
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one adapter per chain
    CONSTRAINT unique_chain_adapter UNIQUE (chain_id, adapter_id)
);

-- Indexes for adapter lookups
CREATE INDEX IF NOT EXISTS idx_chain_adapter_configs_chain_id ON chain_adapter_configs(chain_id);
CREATE INDEX IF NOT EXISTS idx_chain_adapter_configs_adapter_id ON chain_adapter_configs(adapter_id);
CREATE INDEX IF NOT EXISTS idx_chain_adapter_configs_is_active ON chain_adapter_configs(is_active);

-- Comments
COMMENT ON TABLE chain_configs IS 'Stores contract addresses and RPC endpoints for each supported chain';
COMMENT ON TABLE chain_adapter_configs IS 'Stores Adapter contract addresses for each chain';

COMMENT ON COLUMN chain_configs.chain_id IS 'SLIP-44 Chain ID (60=Ethereum, 714=BSC, 966=Polygon, 195=TRON)';
COMMENT ON COLUMN chain_configs.sync_enabled IS 'Whether to sync RawToken whitelist from this chain';
COMMENT ON COLUMN chain_configs.sync_block_number IS 'Last block number that was synced for RawToken updates';

COMMENT ON COLUMN chain_adapter_configs.adapter_id IS 'References intent_adapters.id, represents the protocol adapter';


