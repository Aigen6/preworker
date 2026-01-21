-- Migration: 000003_extend_adapter_fields.up.sql
-- Description: Extend IntentAdapter table with rich display fields (including image configurations)

-- ============ Add UI Display Fields (图片配置) ============
ALTER TABLE intent_adapters 
    ADD COLUMN IF NOT EXISTS icon_url VARCHAR(200),             -- Small icon for list
    ADD COLUMN IF NOT EXISTS logo_url VARCHAR(200),             -- Large logo for detail page
    ADD COLUMN IF NOT EXISTS banner_url VARCHAR(200),           -- Banner image
    ADD COLUMN IF NOT EXISTS protocol_logo_url VARCHAR(200),    -- Protocol logo (e.g., Aave logo)
    ADD COLUMN IF NOT EXISTS background_color VARCHAR(7),       -- Background color (hex)
    ADD COLUMN IF NOT EXISTS theme_color VARCHAR(7),            -- Theme color (hex)
    ADD COLUMN IF NOT EXISTS gradient_colors JSONB;             -- Gradient colors array

-- ============ Add Basic Information ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS name_i18n JSONB,                   -- Multi-language names
    ADD COLUMN IF NOT EXISTS protocol_version VARCHAR(20);      -- Protocol version (v3.0, v2.5)

-- ============ Add Description ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS description_i18n JSONB,            -- Multi-language descriptions
    ADD COLUMN IF NOT EXISTS summary VARCHAR(500),              -- Short summary
    ADD COLUMN IF NOT EXISTS summary_i18n JSONB;                -- Multi-language summaries

-- ============ Add Contract Information ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS proxy_address VARCHAR(42);         -- Proxy address (if upgradeable)

-- ============ Add Capabilities ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS supports_deposit BOOLEAN NOT NULL DEFAULT TRUE,    -- Deposit support
    ADD COLUMN IF NOT EXISTS supports_withdraw BOOLEAN NOT NULL DEFAULT TRUE;   -- Withdraw support

-- ============ Add Protocol Information (URLs) ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS protocol_url VARCHAR(200),         -- Protocol website
    ADD COLUMN IF NOT EXISTS docs_url VARCHAR(200),             -- Documentation
    ADD COLUMN IF NOT EXISTS github_url VARCHAR(200),           -- GitHub repo
    ADD COLUMN IF NOT EXISTS whitepaper_url VARCHAR(200);       -- Whitepaper

-- ============ Add Security & Audit ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS audit_reports JSONB,               -- [{"firm": "...", "report_url": "..."}, ...]
    ADD COLUMN IF NOT EXISTS security_score INTEGER,            -- Security score (0-100)
    ADD COLUMN IF NOT EXISTS last_audit_date DATE,              -- Last audit date
    ADD COLUMN IF NOT EXISTS compliance_info JSONB;             -- Compliance information

-- ============ Add Financial Details ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS min_conversion_amount VARCHAR(78), -- Minimum conversion amount
    ADD COLUMN IF NOT EXISTS max_conversion_amount VARCHAR(78), -- Maximum conversion amount
    ADD COLUMN IF NOT EXISTS conversion_fee VARCHAR(10),        -- Conversion fee percentage
    ADD COLUMN IF NOT EXISTS gas_estimate VARCHAR(78);          -- Estimated gas cost

-- ============ Add Statistics ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS total_conversions BIGINT DEFAULT 0,  -- Total conversions
    ADD COLUMN IF NOT EXISTS total_volume VARCHAR(78) DEFAULT '0', -- Total volume
    ADD COLUMN IF NOT EXISTS tvl VARCHAR(78),                     -- Current TVL
    ADD COLUMN IF NOT EXISTS apy VARCHAR(10);                     -- Current APY

-- ============ Add Status & Flags ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,  -- Featured flag
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,  -- Verified flag
    ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE;       -- New badge

-- ============ Add Metadata ============
ALTER TABLE intent_adapters
    ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMP,               -- Deployment date
    ADD COLUMN IF NOT EXISTS last_upgrade_at TIMESTAMP,           -- Last upgrade date
    ADD COLUMN IF NOT EXISTS search_keywords JSONB,               -- Search keywords
    ADD COLUMN IF NOT EXISTS tags JSONB,                          -- Tags
    ADD COLUMN IF NOT EXISTS category VARCHAR(30),                -- lending, staking, yield
    ADD COLUMN IF NOT EXISTS featured_at TIMESTAMP,               -- When featured
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;               -- When verified

-- ============ Add Indexes ============
CREATE INDEX IF NOT EXISTS idx_intent_adapters_is_featured ON intent_adapters(is_featured);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_is_verified ON intent_adapters(is_verified);
CREATE INDEX IF NOT EXISTS idx_intent_adapters_category ON intent_adapters(category);

-- ============ Add Comments ============
COMMENT ON COLUMN intent_adapters.icon_url IS 'Small icon for list display';
COMMENT ON COLUMN intent_adapters.logo_url IS 'Large logo for detail page';
COMMENT ON COLUMN intent_adapters.banner_url IS 'Banner image for adapter display';
COMMENT ON COLUMN intent_adapters.protocol_logo_url IS 'Protocol logo (e.g., Aave, Lido logo)';
COMMENT ON COLUMN intent_adapters.audit_reports IS 'Audit reports array with firm, date, and report URL';
COMMENT ON COLUMN intent_adapters.gradient_colors IS 'Gradient colors for UI display';

