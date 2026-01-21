-- Create Intent Configuration Tables
-- Migration: 000001_create_intent_tables.up.sql
-- Description: Create Intent RawToken, AssetToken, and Adapter tables

-- ============ IntentRawToken Table ============
CREATE TABLE IF NOT EXISTS intent_raw_tokens (
    id BIGSERIAL PRIMARY KEY,
    token_identifier VARCHAR(66) UNIQUE NOT NULL, -- bytes32 hex (0x...)
    symbol VARCHAR(10) NOT NULL,                  -- USDT, USDC, ETH
    name VARCHAR(50),                             -- Tether USD
    decimals SMALLINT NOT NULL,                   -- 6, 18
    icon_url VARCHAR(200),                        -- Icon URL
    description TEXT,                             -- Description
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intent_raw_tokens_is_active ON intent_raw_tokens(is_active);

-- ============ IntentRawTokenChain Table ============
CREATE TABLE IF NOT EXISTS intent_raw_token_chains (
    id BIGSERIAL PRIMARY KEY,
    token_identifier VARCHAR(66) NOT NULL,        -- Foreign key
    chain_id INTEGER NOT NULL,                    -- 56, 1, 137
    chain_name VARCHAR(20),                       -- BSC, Ethereum, Polygon
    token_address VARCHAR(42) NOT NULL,           -- Token address on this chain
    is_native BOOLEAN NOT NULL DEFAULT FALSE,     -- Is native token (like ETH)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    min_withdraw VARCHAR(78) DEFAULT '0',         -- Minimum withdraw amount
    max_withdraw VARCHAR(78) DEFAULT '0',         -- Maximum withdraw amount (0 = no limit)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_raw_token_identifier FOREIGN KEY (token_identifier) REFERENCES intent_raw_tokens(token_identifier) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intent_raw_token_chains_token_id ON intent_raw_token_chains(token_identifier);
CREATE INDEX IF NOT EXISTS idx_intent_raw_token_chains_chain_id ON intent_raw_token_chains(chain_id);
CREATE INDEX IF NOT EXISTS idx_intent_raw_token_chains_is_active ON intent_raw_token_chains(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_raw_token_chains_unique ON intent_raw_token_chains(token_identifier, chain_id);

-- ============ IntentAssetToken Table ============
-- Asset Token ID encoding (bytes32 = 256 bits):
--   ┌──────────────┬────────────┬─────────────────────────┐
--   │  Adapter ID  │  Token ID  │      Reserved           │
--   │   4 bytes    │   2 bytes  │      26 bytes (zeros)   │
--   │  (uint32)    │  (uint16)  │                         │
--   └──────────────┴────────────┴─────────────────────────┘
-- Example: Aave V3 aUSDT = 0x0000000100010000000000000000000000000000000000000000000000000000
--          (Adapter ID = 1, Token ID = 1, rest = zeros)
CREATE TABLE IF NOT EXISTS intent_asset_tokens (
    id BIGSERIAL PRIMARY KEY,
    asset_id VARCHAR(66) UNIQUE NOT NULL,         -- bytes32 hex (0x...), encoded as AdapterID || TokenID || Reserved
    adapter_id INTEGER NOT NULL,                  -- High 4 bytes, for quick routing (0-4294967295)
    token_id SMALLINT NOT NULL,                   -- Bytes 5-6, specific token within adapter (1-65535)
    
    -- Basic Information
    symbol VARCHAR(10) NOT NULL,                  -- aUSDT, stETH, yvUSDT
    name VARCHAR(50),                             -- Aave USDT, Lido Staked ETH
    name_i18n JSONB,                              -- Multi-language names: {"en": "Aave USDT", "zh": "Aave USDT", "ja": "Aave USDT"}
    protocol VARCHAR(30),                         -- Aave V3, Lido, Yearn Finance
    protocol_version VARCHAR(20),                 -- v3.0, v2.5
    base_token VARCHAR(10),                       -- USDT, ETH, DAI
    decimals SMALLINT NOT NULL DEFAULT 18,        -- Token decimals
    
    -- UI Display
    icon_url VARCHAR(200),                        -- Icon URL (small, for list)
    logo_url VARCHAR(200),                        -- Logo URL (large, for detail page)
    banner_url VARCHAR(200),                      -- Banner image URL
    color VARCHAR(7),                             -- Theme color (hex: #3B82F6)
    display_order INTEGER DEFAULT 0,              -- Display order (larger = higher priority)
    
    -- Description (Multi-language)
    description TEXT,                             -- English description
    description_i18n JSONB,                       -- Multi-language descriptions
    
    -- Protocol Information
    protocol_url VARCHAR(200),                    -- Protocol official website
    protocol_logo_url VARCHAR(200),               -- Protocol logo URL
    docs_url VARCHAR(200),                        -- Documentation URL
    audit_report_url VARCHAR(200),                -- Audit report URL
    audit_firm VARCHAR(50),                       -- Audit firm name (CertiK, PeckShield)
    
    -- Risk Assessment
    risk_level VARCHAR(10) DEFAULT 'medium',      -- low, medium, high
    risk_score INTEGER DEFAULT 50,                -- Risk score (0-100, lower = safer)
    risk_factors JSONB,                           -- Risk factors array: ["smart_contract", "impermanent_loss"]
    
    -- Category & Tags
    category VARCHAR(30),                         -- lending, staking, liquidity, yield_farming
    tags JSONB,                                   -- Tags: ["stable", "high-yield", "audited", "blue-chip"]
    
    -- Yield Information (Global defaults, can be overridden per chain)
    default_apy VARCHAR(10),                      -- Default APY (e.g., "5.23")
    apy_type VARCHAR(20),                         -- fixed, variable, dynamic
    compound_frequency VARCHAR(20),               -- daily, weekly, monthly, real-time
    
    -- Financial Details
    min_deposit VARCHAR(78),                      -- Minimum deposit amount
    withdrawal_fee_percent VARCHAR(10),           -- Withdrawal fee percentage (e.g., "0.5")
    performance_fee_percent VARCHAR(10),          -- Performance fee percentage (e.g., "10")
    maturity_days INTEGER,                        -- Lock-up period in days (0 = flexible)
    
    -- Social & Community
    social_links JSONB,                           -- Social media: {"twitter": "...", "discord": "...", "telegram": "..."}
    
    -- Statistics (Global aggregates)
    total_tvl VARCHAR(78),                        -- Total TVL across all chains
    total_users BIGINT DEFAULT 0,                 -- Total users across all chains
    popularity_score INTEGER DEFAULT 0,           -- Popularity score (0-100)
    
    -- Status & Flags
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,   -- Featured on homepage
    is_new BOOLEAN NOT NULL DEFAULT FALSE,        -- New asset (show "NEW" badge)
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,   -- Verified by platform
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    featured_at TIMESTAMP,                        -- When it was featured
    verified_at TIMESTAMP                         -- When it was verified
);

CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_adapter_id ON intent_asset_tokens(adapter_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_token_id ON intent_asset_tokens(token_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_protocol ON intent_asset_tokens(protocol);
CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_is_active ON intent_asset_tokens(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_asset_tokens_adapter_token ON intent_asset_tokens(adapter_id, token_id);

-- ============ IntentAssetTokenChain Table ============
CREATE TABLE IF NOT EXISTS intent_asset_token_chains (
    id BIGSERIAL PRIMARY KEY,
    asset_id VARCHAR(66) NOT NULL,                -- Foreign key
    chain_id INTEGER NOT NULL,                    -- 56, 1
    chain_name VARCHAR(20),                       -- BSC, Ethereum
    adapter_address VARCHAR(42) NOT NULL,         -- Adapter contract address
    adapter_name VARCHAR(50),                     -- AaveV3USDTAdapter
    asset_token_address VARCHAR(42) NOT NULL,     -- Asset token (aUSDT) contract address
    description TEXT,                             -- Chain-specific description
    apy VARCHAR(10),                              -- Annual Percentage Yield (optional)
    tvl VARCHAR(50),                              -- Total Value Locked (optional)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    supports_cross_chain BOOLEAN NOT NULL DEFAULT FALSE, -- Supports cross-chain
    min_withdraw VARCHAR(78) DEFAULT '0',         -- Minimum withdraw amount
    max_withdraw VARCHAR(78) DEFAULT '0',         -- Maximum withdraw amount (0 = no limit)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_asset_id FOREIGN KEY (asset_id) REFERENCES intent_asset_tokens(asset_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_asset_id ON intent_asset_token_chains(asset_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_chain_id ON intent_asset_token_chains(chain_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_adapter_addr ON intent_asset_token_chains(adapter_address);
CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_is_active ON intent_asset_token_chains(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_asset_token_chains_unique ON intent_asset_token_chains(asset_id, chain_id);

-- ============ IntentAdapter Table ============
CREATE TABLE IF NOT EXISTS intent_adapters (
    id BIGSERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,                    -- Chain ID
    address VARCHAR(42) NOT NULL,                 -- Adapter address
    name VARCHAR(50),                             -- Adapter name
    protocol VARCHAR(30),                         -- Protocol name (Aave V3, Lido)
    version VARCHAR(20),                          -- Version (v1.0.0)
    asset_token_address VARCHAR(42),              -- Asset token address
    base_token_address VARCHAR(42),               -- Base token address
    supports_cross_chain BOOLEAN NOT NULL DEFAULT FALSE, -- Supports cross-chain
    supports_conversion BOOLEAN NOT NULL DEFAULT TRUE,   -- Supports conversion
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Is active
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,     -- Is paused
    implementation_address VARCHAR(42),           -- Implementation contract address
    admin_address VARCHAR(42),                    -- Admin address
    description TEXT,                             -- Description
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_chain_address UNIQUE (chain_id, address)
);

CREATE INDEX IF NOT EXISTS idx_intent_adapters_chain_id ON intent_adapters(chain_id);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_protocol ON intent_adapters(protocol);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_is_active ON intent_adapters(is_active);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_is_paused ON intent_adapters(is_paused);

-- ============ IntentAdapterStats Table ============
CREATE TABLE IF NOT EXISTS intent_adapter_stats (
    id BIGSERIAL PRIMARY KEY,
    adapter_id BIGINT UNIQUE NOT NULL,            -- Foreign key to intent_adapters
    total_conversions BIGINT NOT NULL DEFAULT 0,  -- Total number of conversions
    total_volume VARCHAR(78) NOT NULL DEFAULT '0', -- Total volume (in base token)
    last_conversion_at TIMESTAMP,                 -- Last conversion time
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_adapter_id FOREIGN KEY (adapter_id) REFERENCES intent_adapters(id) ON DELETE CASCADE
);

-- ============ Trigger Functions for Updated_At ============
-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all Intent tables
CREATE TRIGGER update_intent_raw_tokens_updated_at BEFORE UPDATE ON intent_raw_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_raw_token_chains_updated_at BEFORE UPDATE ON intent_raw_token_chains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_asset_tokens_updated_at BEFORE UPDATE ON intent_asset_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_asset_token_chains_updated_at BEFORE UPDATE ON intent_asset_token_chains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_adapters_updated_at BEFORE UPDATE ON intent_adapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_adapter_stats_updated_at BEFORE UPDATE ON intent_adapter_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ Comments ============
COMMENT ON TABLE intent_raw_tokens IS 'Raw Token configuration (native tokens like USDT, USDC, ETH)';
COMMENT ON TABLE intent_raw_token_chains IS 'Raw Token chain-specific configurations';
COMMENT ON TABLE intent_asset_tokens IS 'Asset Token configuration (DeFi protocol tokens)';
COMMENT ON TABLE intent_asset_token_chains IS 'Asset Token chain-specific configurations';
COMMENT ON TABLE intent_adapters IS 'Adapter contract detailed information';
COMMENT ON TABLE intent_adapter_stats IS 'Adapter statistics for monitoring';


-- Description: Create Intent RawToken, AssetToken, and Adapter tables

-- ============ IntentRawToken Table ============
CREATE TABLE IF NOT EXISTS intent_raw_tokens (
    id BIGSERIAL PRIMARY KEY,
    token_identifier VARCHAR(66) UNIQUE NOT NULL, -- bytes32 hex (0x...)
    symbol VARCHAR(10) NOT NULL,                  -- USDT, USDC, ETH
    name VARCHAR(50),                             -- Tether USD
    decimals SMALLINT NOT NULL,                   -- 6, 18
    icon_url VARCHAR(200),                        -- Icon URL
    description TEXT,                             -- Description
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intent_raw_tokens_is_active ON intent_raw_tokens(is_active);

-- ============ IntentRawTokenChain Table ============
CREATE TABLE IF NOT EXISTS intent_raw_token_chains (
    id BIGSERIAL PRIMARY KEY,
    token_identifier VARCHAR(66) NOT NULL,        -- Foreign key
    chain_id INTEGER NOT NULL,                    -- 56, 1, 137
    chain_name VARCHAR(20),                       -- BSC, Ethereum, Polygon
    token_address VARCHAR(42) NOT NULL,           -- Token address on this chain
    is_native BOOLEAN NOT NULL DEFAULT FALSE,     -- Is native token (like ETH)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    min_withdraw VARCHAR(78) DEFAULT '0',         -- Minimum withdraw amount
    max_withdraw VARCHAR(78) DEFAULT '0',         -- Maximum withdraw amount (0 = no limit)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_raw_token_identifier FOREIGN KEY (token_identifier) REFERENCES intent_raw_tokens(token_identifier) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intent_raw_token_chains_token_id ON intent_raw_token_chains(token_identifier);
CREATE INDEX IF NOT EXISTS idx_intent_raw_token_chains_chain_id ON intent_raw_token_chains(chain_id);
CREATE INDEX IF NOT EXISTS idx_intent_raw_token_chains_is_active ON intent_raw_token_chains(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_raw_token_chains_unique ON intent_raw_token_chains(token_identifier, chain_id);

-- ============ IntentAssetToken Table ============
-- Asset Token ID encoding (bytes32 = 256 bits):
--   ┌──────────────┬────────────┬─────────────────────────┐
--   │  Adapter ID  │  Token ID  │      Reserved           │
--   │   4 bytes    │   2 bytes  │      26 bytes (zeros)   │
--   │  (uint32)    │  (uint16)  │                         │
--   └──────────────┴────────────┴─────────────────────────┘
-- Example: Aave V3 aUSDT = 0x0000000100010000000000000000000000000000000000000000000000000000
--          (Adapter ID = 1, Token ID = 1, rest = zeros)
CREATE TABLE IF NOT EXISTS intent_asset_tokens (
    id BIGSERIAL PRIMARY KEY,
    asset_id VARCHAR(66) UNIQUE NOT NULL,         -- bytes32 hex (0x...), encoded as AdapterID || TokenID || Reserved
    adapter_id INTEGER NOT NULL,                  -- High 4 bytes, for quick routing (0-4294967295)
    token_id SMALLINT NOT NULL,                   -- Bytes 5-6, specific token within adapter (1-65535)
    
    -- Basic Information
    symbol VARCHAR(10) NOT NULL,                  -- aUSDT, stETH, yvUSDT
    name VARCHAR(50),                             -- Aave USDT, Lido Staked ETH
    name_i18n JSONB,                              -- Multi-language names: {"en": "Aave USDT", "zh": "Aave USDT", "ja": "Aave USDT"}
    protocol VARCHAR(30),                         -- Aave V3, Lido, Yearn Finance
    protocol_version VARCHAR(20),                 -- v3.0, v2.5
    base_token VARCHAR(10),                       -- USDT, ETH, DAI
    decimals SMALLINT NOT NULL DEFAULT 18,        -- Token decimals
    
    -- UI Display
    icon_url VARCHAR(200),                        -- Icon URL (small, for list)
    logo_url VARCHAR(200),                        -- Logo URL (large, for detail page)
    banner_url VARCHAR(200),                      -- Banner image URL
    color VARCHAR(7),                             -- Theme color (hex: #3B82F6)
    display_order INTEGER DEFAULT 0,              -- Display order (larger = higher priority)
    
    -- Description (Multi-language)
    description TEXT,                             -- English description
    description_i18n JSONB,                       -- Multi-language descriptions
    
    -- Protocol Information
    protocol_url VARCHAR(200),                    -- Protocol official website
    protocol_logo_url VARCHAR(200),               -- Protocol logo URL
    docs_url VARCHAR(200),                        -- Documentation URL
    audit_report_url VARCHAR(200),                -- Audit report URL
    audit_firm VARCHAR(50),                       -- Audit firm name (CertiK, PeckShield)
    
    -- Risk Assessment
    risk_level VARCHAR(10) DEFAULT 'medium',      -- low, medium, high
    risk_score INTEGER DEFAULT 50,                -- Risk score (0-100, lower = safer)
    risk_factors JSONB,                           -- Risk factors array: ["smart_contract", "impermanent_loss"]
    
    -- Category & Tags
    category VARCHAR(30),                         -- lending, staking, liquidity, yield_farming
    tags JSONB,                                   -- Tags: ["stable", "high-yield", "audited", "blue-chip"]
    
    -- Yield Information (Global defaults, can be overridden per chain)
    default_apy VARCHAR(10),                      -- Default APY (e.g., "5.23")
    apy_type VARCHAR(20),                         -- fixed, variable, dynamic
    compound_frequency VARCHAR(20),               -- daily, weekly, monthly, real-time
    
    -- Financial Details
    min_deposit VARCHAR(78),                      -- Minimum deposit amount
    withdrawal_fee_percent VARCHAR(10),           -- Withdrawal fee percentage (e.g., "0.5")
    performance_fee_percent VARCHAR(10),          -- Performance fee percentage (e.g., "10")
    maturity_days INTEGER,                        -- Lock-up period in days (0 = flexible)
    
    -- Social & Community
    social_links JSONB,                           -- Social media: {"twitter": "...", "discord": "...", "telegram": "..."}
    
    -- Statistics (Global aggregates)
    total_tvl VARCHAR(78),                        -- Total TVL across all chains
    total_users BIGINT DEFAULT 0,                 -- Total users across all chains
    popularity_score INTEGER DEFAULT 0,           -- Popularity score (0-100)
    
    -- Status & Flags
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,   -- Featured on homepage
    is_new BOOLEAN NOT NULL DEFAULT FALSE,        -- New asset (show "NEW" badge)
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,   -- Verified by platform
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    featured_at TIMESTAMP,                        -- When it was featured
    verified_at TIMESTAMP                         -- When it was verified
);

CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_adapter_id ON intent_asset_tokens(adapter_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_token_id ON intent_asset_tokens(token_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_protocol ON intent_asset_tokens(protocol);
CREATE INDEX IF NOT EXISTS idx_intent_asset_tokens_is_active ON intent_asset_tokens(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_asset_tokens_adapter_token ON intent_asset_tokens(adapter_id, token_id);

-- ============ IntentAssetTokenChain Table ============
CREATE TABLE IF NOT EXISTS intent_asset_token_chains (
    id BIGSERIAL PRIMARY KEY,
    asset_id VARCHAR(66) NOT NULL,                -- Foreign key
    chain_id INTEGER NOT NULL,                    -- 56, 1
    chain_name VARCHAR(20),                       -- BSC, Ethereum
    adapter_address VARCHAR(42) NOT NULL,         -- Adapter contract address
    adapter_name VARCHAR(50),                     -- AaveV3USDTAdapter
    asset_token_address VARCHAR(42) NOT NULL,     -- Asset token (aUSDT) contract address
    description TEXT,                             -- Chain-specific description
    apy VARCHAR(10),                              -- Annual Percentage Yield (optional)
    tvl VARCHAR(50),                              -- Total Value Locked (optional)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Active status
    supports_cross_chain BOOLEAN NOT NULL DEFAULT FALSE, -- Supports cross-chain
    min_withdraw VARCHAR(78) DEFAULT '0',         -- Minimum withdraw amount
    max_withdraw VARCHAR(78) DEFAULT '0',         -- Maximum withdraw amount (0 = no limit)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_asset_id FOREIGN KEY (asset_id) REFERENCES intent_asset_tokens(asset_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_asset_id ON intent_asset_token_chains(asset_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_chain_id ON intent_asset_token_chains(chain_id);
CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_adapter_addr ON intent_asset_token_chains(adapter_address);
CREATE INDEX IF NOT EXISTS idx_intent_asset_token_chains_is_active ON intent_asset_token_chains(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_asset_token_chains_unique ON intent_asset_token_chains(asset_id, chain_id);

-- ============ IntentAdapter Table ============
CREATE TABLE IF NOT EXISTS intent_adapters (
    id BIGSERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,                    -- Chain ID
    address VARCHAR(42) NOT NULL,                 -- Adapter address
    name VARCHAR(50),                             -- Adapter name
    protocol VARCHAR(30),                         -- Protocol name (Aave V3, Lido)
    version VARCHAR(20),                          -- Version (v1.0.0)
    asset_token_address VARCHAR(42),              -- Asset token address
    base_token_address VARCHAR(42),               -- Base token address
    supports_cross_chain BOOLEAN NOT NULL DEFAULT FALSE, -- Supports cross-chain
    supports_conversion BOOLEAN NOT NULL DEFAULT TRUE,   -- Supports conversion
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Is active
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,     -- Is paused
    implementation_address VARCHAR(42),           -- Implementation contract address
    admin_address VARCHAR(42),                    -- Admin address
    description TEXT,                             -- Description
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_chain_address UNIQUE (chain_id, address)
);

CREATE INDEX IF NOT EXISTS idx_intent_adapters_chain_id ON intent_adapters(chain_id);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_protocol ON intent_adapters(protocol);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_is_active ON intent_adapters(is_active);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_is_paused ON intent_adapters(is_paused);

-- ============ IntentAdapterStats Table ============
CREATE TABLE IF NOT EXISTS intent_adapter_stats (
    id BIGSERIAL PRIMARY KEY,
    adapter_id BIGINT UNIQUE NOT NULL,            -- Foreign key to intent_adapters
    total_conversions BIGINT NOT NULL DEFAULT 0,  -- Total number of conversions
    total_volume VARCHAR(78) NOT NULL DEFAULT '0', -- Total volume (in base token)
    last_conversion_at TIMESTAMP,                 -- Last conversion time
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_adapter_id FOREIGN KEY (adapter_id) REFERENCES intent_adapters(id) ON DELETE CASCADE
);

-- ============ Trigger Functions for Updated_At ============
-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all Intent tables
CREATE TRIGGER update_intent_raw_tokens_updated_at BEFORE UPDATE ON intent_raw_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_raw_token_chains_updated_at BEFORE UPDATE ON intent_raw_token_chains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_asset_tokens_updated_at BEFORE UPDATE ON intent_asset_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_asset_token_chains_updated_at BEFORE UPDATE ON intent_asset_token_chains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_adapters_updated_at BEFORE UPDATE ON intent_adapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_adapter_stats_updated_at BEFORE UPDATE ON intent_adapter_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ Comments ============
COMMENT ON TABLE intent_raw_tokens IS 'Raw Token configuration (native tokens like USDT, USDC, ETH)';
COMMENT ON TABLE intent_raw_token_chains IS 'Raw Token chain-specific configurations';
COMMENT ON TABLE intent_asset_tokens IS 'Asset Token configuration (DeFi protocol tokens)';
COMMENT ON TABLE intent_asset_token_chains IS 'Asset Token chain-specific configurations';
COMMENT ON TABLE intent_adapters IS 'Adapter contract detailed information';
COMMENT ON TABLE intent_adapter_stats IS 'Adapter statistics for monitoring';

