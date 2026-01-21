-- Rollback: Revert user_data column size back to VARCHAR(50)
-- Note: This may fail if there are existing records with data longer than 50 characters

ALTER TABLE checkbooks ALTER COLUMN user_data TYPE VARCHAR(50);

