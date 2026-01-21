-- Rollback migration: Recreate ChainAdapterConfig table
-- Note: This will not restore the original data, only the table structure

CREATE TABLE IF NOT EXISTS chain_adapter_configs (
    id BIGSERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    adapter_id INTEGER NOT NULL,
    adapter_address VARCHAR(66) NOT NULL,
    protocol VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_chain_adapter UNIQUE (chain_id, adapter_id)
);

CREATE INDEX IF NOT EXISTS idx_chain_adapter_configs_chain_id ON chain_adapter_configs(chain_id);
CREATE INDEX IF NOT EXISTS idx_chain_adapter_configs_adapter_id ON chain_adapter_configs(adapter_id);
CREATE INDEX IF NOT EXISTS idx_chain_adapter_configs_is_active ON chain_adapter_configs(is_active);

COMMENT ON TABLE chain_adapter_configs IS 'Adapter contract addresses for each chain (deprecated - use intent_adapters instead)';

