-- Verify checkbooks table column sizes
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'checkbooks'
AND column_name IN ('user_data', 'token_key', 'owner_data', 'recipient_data')
ORDER BY column_name;

-- Check if there are any constraints or issues
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
AND table_name = 'checkbooks';

