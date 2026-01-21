-- Migration: 000003_extend_adapter_fields.down.sql
-- Description: Rollback extended fields for IntentAdapter table

-- Drop indexes first
DROP INDEX IF EXISTS idx_intent_adapters_is_featured;
DROP INDEX IF EXISTS idx_intent_adapters_is_verified;
DROP INDEX IF EXISTS idx_intent_adapters_category;

-- Remove all extended columns
ALTER TABLE intent_adapters 
    DROP COLUMN IF EXISTS icon_url,
    DROP COLUMN IF EXISTS logo_url,
    DROP COLUMN IF EXISTS banner_url,
    DROP COLUMN IF EXISTS protocol_logo_url,
    DROP COLUMN IF EXISTS background_color,
    DROP COLUMN IF EXISTS theme_color,
    DROP COLUMN IF EXISTS gradient_colors,
    DROP COLUMN IF EXISTS name_i18n,
    DROP COLUMN IF EXISTS protocol_version,
    DROP COLUMN IF EXISTS description_i18n,
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS summary_i18n,
    DROP COLUMN IF EXISTS proxy_address,
    DROP COLUMN IF EXISTS supports_deposit,
    DROP COLUMN IF EXISTS supports_withdraw,
    DROP COLUMN IF EXISTS protocol_url,
    DROP COLUMN IF EXISTS docs_url,
    DROP COLUMN IF EXISTS github_url,
    DROP COLUMN IF EXISTS whitepaper_url,
    DROP COLUMN IF EXISTS audit_reports,
    DROP COLUMN IF EXISTS security_score,
    DROP COLUMN IF EXISTS last_audit_date,
    DROP COLUMN IF EXISTS compliance_info,
    DROP COLUMN IF EXISTS min_conversion_amount,
    DROP COLUMN IF EXISTS max_conversion_amount,
    DROP COLUMN IF EXISTS conversion_fee,
    DROP COLUMN IF EXISTS gas_estimate,
    DROP COLUMN IF EXISTS total_conversions,
    DROP COLUMN IF EXISTS total_volume,
    DROP COLUMN IF EXISTS tvl,
    DROP COLUMN IF EXISTS apy,
    DROP COLUMN IF EXISTS is_featured,
    DROP COLUMN IF EXISTS is_verified,
    DROP COLUMN IF EXISTS is_new,
    DROP COLUMN IF EXISTS deployed_at,
    DROP COLUMN IF EXISTS last_upgrade_at,
    DROP COLUMN IF EXISTS search_keywords,
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS featured_at,
    DROP COLUMN IF EXISTS verified_at;

