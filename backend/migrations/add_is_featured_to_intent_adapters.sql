-- Add is_featured column to intent_adapters table if it doesn't exist
-- This is a safety migration to ensure the column exists even if migration 000003 wasn't run

-- Check if column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'intent_adapters' 
        AND column_name = 'is_featured'
    ) THEN
        ALTER TABLE intent_adapters 
        ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;
        
        -- Create index for better query performance
        CREATE INDEX IF NOT EXISTS idx_intent_adapters_is_featured ON intent_adapters(is_featured);
        
        RAISE NOTICE 'Column is_featured added to intent_adapters table';
    ELSE
        RAISE NOTICE 'Column is_featured already exists in intent_adapters table';
    END IF;
END $$;

