package db

import (
	"database/sql"
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/models"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() {
	var err error

	if config.AppConfig == nil || config.AppConfig.Database.DSN == "" {
		log.Fatalf("Database DSN is required")
	}

	dsn := config.AppConfig.Database.DSN
	log.Printf("Connecting to database: %s", dsn)

	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		SkipDefaultTransaction:                   true,
		DisableAutomaticPing:                     true,
		PrepareStmt:                              true,
		CreateBatchSize:                          1000,
		Logger:                                   logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}

	log.Println("✅ Database connected successfully")

	// Fix NULL chain_id values before migration
	// This must be done before AutoMigrate tries to add NOT NULL constraint
	log.Println("🔧 Fixing NULL chain_id values in intent_asset_tokens...")
	if err := fixNullChainIDs(DB); err != nil {
		log.Printf("⚠️ Failed to fix NULL chain_id values: %v", err)
		log.Println("⚠️ Attempting to continue with migration anyway...")
	}

	// Fix all Universal Address columns that should be VARCHAR(66)
	// Universal Address format requires 66 characters (0x + 64 hex chars)
	// IMPORTANT: GORM AutoMigrate does NOT modify existing column sizes, only adds new columns
	// So we must manually fix column sizes BEFORE AutoMigrate runs
	log.Println("🔧 Fixing Universal Address column sizes...")
	if err := fixAllUniversalAddressColumns(DB); err != nil {
		log.Printf("⚠️ Failed to fix Universal Address column sizes: %v", err)
		log.Println("⚠️ Attempting to continue with migration anyway...")
	}

	// Auto migrate all models
	log.Println("🚀 Starting database schema migration with GORM AutoMigrate...")

	if err := DB.AutoMigrate(
		&models.EventDepositReceived{},
		&models.EventDepositRecorded{},
		&models.EventDepositUsed{},
		&models.EventCommitmentRootUpdated{},
		&models.EventWithdrawRequested{},
		&models.EventWithdrawExecuted{},
		&models.IntentAdapter{},
		&models.IntentAdapterStats{},
		&models.IntentAdapterMetrics{},
		&models.IntentAssetToken{}, // Use base struct only to avoid field definition conflicts
		&models.IntentAssetTokenMetrics{},
		&models.IntentRawToken{},
		&models.IntentRawTokenChain{},
		&models.WithdrawRequest{},
		&models.Checkbook{},
		&models.Check{},
		&models.DepositInfo{},                 // Deposit information table
		&models.FailedTransaction{},           // Add missing table
		&models.ChainConfig{},                 // Chain configuration
		&models.GlobalConfig{},                // Global system configuration
		&models.PollingTask{},                 // Polling tasks table
		&models.QueueRoot{},                   // Queue roots table
		&models.FeeQueryRecord{},              // Fee query records (DEPRECATED: no longer used, kept for backward compatibility)
		&models.PendingTransaction{},          // Transaction queue table
		&models.ProofGenerationTask{},         // Proof generation task table
		&models.WithdrawProofGenerationTask{}, // Withdraw proof generation task table
	); err != nil {
		log.Fatalf("AutoMigrate failed: %v", err)
	}

	// Initialize default global config if not exists
	initGlobalConfig(DB)

	log.Println("✅ Database schema migrated successfully")
}

// initGlobalConfig initializes default global configuration if not exists
func initGlobalConfig(db *gorm.DB) {
	// Initialize ZKPay Proxy address if not exists
	var zkpayConfig models.GlobalConfig
	if err := db.Where("config_key = ?", "zkpay_proxy").First(&zkpayConfig).Error; err != nil {
		// Config doesn't exist, create default
		defaultZKPay := "0x0000000000000000000000000000000000000000"

		// Try to get from config file or environment
		if config.AppConfig != nil && config.AppConfig.Blockchain.ZKPayProxy != "" {
			defaultZKPay = config.AppConfig.Blockchain.ZKPayProxy
		} else if envZKPay := os.Getenv("ZKPAY_PROXY"); envZKPay != "" {
			defaultZKPay = envZKPay
		}

		zkpayConfig = models.GlobalConfig{
			ConfigKey:   "zkpay_proxy",
			ConfigValue: defaultZKPay,
			Description: "Global ZKPay Proxy contract address (same for all chains)",
			UpdatedBy:   "system",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if err := db.Create(&zkpayConfig).Error; err != nil {
			log.Printf("⚠️ Failed to create default global config: %v", err)
		} else {
			log.Printf("✅ Initialized global config: zkpay_proxy = %s", defaultZKPay)
		}
	}
}

// fixNullChainIDs fixes NULL chain_id values in intent_asset_tokens table
func fixNullChainIDs(db *gorm.DB) error {
	// First, check if chain_id column exists
	var columnExists bool
	err := db.Raw(`
		SELECT EXISTS (
			SELECT 1 
			FROM information_schema.columns 
			WHERE table_name = 'intent_asset_tokens' 
			AND column_name = 'chain_id'
		)
	`).Scan(&columnExists).Error

	if err != nil {
		log.Printf("⚠️ Failed to check if chain_id column exists: %v", err)
		return nil // Continue anyway
	}

	var result *gorm.DB
	if !columnExists {
		log.Println("📋 chain_id column does not exist yet, adding it...")
		// Add column as nullable first
		result = db.Exec(`ALTER TABLE intent_asset_tokens ADD COLUMN chain_id INTEGER`)
		if result.Error != nil {
			log.Printf("⚠️ Failed to add chain_id column: %v", result.Error)
			return result.Error
		}
		log.Println("✅ Added chain_id column (nullable)")
	} else {
		log.Println("📋 chain_id column already exists")
	}

	// Step 2: Try to populate from asset_id
	result = db.Exec(`
		UPDATE intent_asset_tokens
		SET chain_id = (
			('x' || SUBSTRING(asset_id FROM 3 FOR 2))::bit(8)::int * 16777216 +
			('x' || SUBSTRING(asset_id FROM 5 FOR 2))::bit(8)::int * 65536 +
			('x' || SUBSTRING(asset_id FROM 7 FOR 2))::bit(8)::int * 256 +
			('x' || SUBSTRING(asset_id FROM 9 FOR 2))::bit(8)::int
		)
		WHERE chain_id IS NULL 
		  AND asset_id IS NOT NULL 
		  AND asset_id LIKE '0x%'
		  AND LENGTH(asset_id) >= 10
	`)
	if result.Error != nil {
		log.Printf("⚠️ Failed to populate from asset_id: %v", result.Error)
	} else {
		log.Printf("✅ Updated %d records from asset_id", result.RowsAffected)
	}

	// Step 3: Try to populate from IntentAdapter
	result = db.Exec(`
		UPDATE intent_asset_tokens iat
		SET chain_id = ia.chain_id
		FROM intent_adapters ia
		WHERE iat.chain_id IS NULL 
		  AND iat.adapter_id = ia.adapter_id
		  AND ia.chain_id IS NOT NULL
	`)
	if result.Error != nil {
		log.Printf("⚠️ Failed to populate from IntentAdapter: %v", result.Error)
	} else {
		log.Printf("✅ Updated %d records from IntentAdapter", result.RowsAffected)
	}

	// Step 4: Set default for remaining NULL values
	result = db.Exec(`
		UPDATE intent_asset_tokens
		SET chain_id = 714
		WHERE chain_id IS NULL
	`)
	if result.Error != nil {
		return fmt.Errorf("failed to set default chain_id: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		log.Printf("✅ Updated %d records with default chain_id (714 = BSC)", result.RowsAffected)
	}

	return nil
}

// fixAllUniversalAddressColumns fixes all Universal Address column sizes
// Changes from VARCHAR(50) to VARCHAR(66) to accommodate 32-byte Universal Address
func fixAllUniversalAddressColumns(db *gorm.DB) error {
	// List of tables and columns that use Universal Address (VARCHAR(66))
	universalAddressColumns := []struct {
		tableName  string
		columnName string
		comment    string
	}{
		{"checkbooks", "user_data", "User's universal address"},
		{"deposit_infos", "owner_data", "Owner's universal address"},
		{"checks", "recipient_data", "Recipient's universal address (deprecated)"},
		{"checkbooks", "withdraw_recipient_data", "Withdraw recipient's universal address (deprecated)"},
		{"fee_query_records", "address", "Deposit address (Universal Address format, 0x + 64 hex chars = 66 chars)"},
		// withdraw_requests.owner_data and recipient_data should already be VARCHAR(66) from migration 000004
	}

	// Fix Universal Address columns (VARCHAR(66))
	for _, col := range universalAddressColumns {
		if err := fixUniversalAddressColumn(db, col.tableName, col.columnName, col.comment); err != nil {
			log.Printf("⚠️ Failed to fix %s.%s: %v", col.tableName, col.columnName, err)
		}
	}

	// Fix token_key column (VARCHAR(50) for original string like "USDT")
	if err := fixTokenKeyColumn(db, "checkbooks", "token_key", "Token key (original string like USDT, USDC, max 50 chars)"); err != nil {
		log.Printf("⚠️ Failed to fix checkbooks.token_key: %v", err)
	}

	// Fix NULL token_key values before applying NOT NULL constraint
	log.Println("🔧 Fixing NULL token_key values in checkbooks...")
	if err := fixNullTokenKeys(db); err != nil {
		log.Printf("⚠️ Failed to fix NULL token_key values: %v", err)
		log.Println("⚠️ Attempting to continue with migration anyway...")
	}

	return nil
}

// fixNullTokenKeys fixes NULL token_key values in checkbooks table
// Sets default value "USDT" for NULL token_key before applying NOT NULL constraint
func fixNullTokenKeys(db *gorm.DB) error {
	// Check if table exists
	var tableExists bool
	err := db.Raw(`
		SELECT EXISTS (
			SELECT 1 
			FROM information_schema.tables 
			WHERE table_schema = 'public'
			AND table_name = 'checkbooks'
		)
	`).Scan(&tableExists).Error

	if err != nil {
		return fmt.Errorf("failed to check if checkbooks table exists: %w", err)
	}

	if !tableExists {
		log.Printf("📋 checkbooks table does not exist yet, will be created by AutoMigrate")
		return nil
	}

	// Count NULL token_key values
	var nullCount int64
	err = db.Raw(`
		SELECT COUNT(*) 
		FROM checkbooks 
		WHERE token_key IS NULL OR token_key = ''
	`).Scan(&nullCount).Error

	if err != nil {
		return fmt.Errorf("failed to count NULL token_key values: %w", err)
	}

	if nullCount == 0 {
		log.Printf("✅ No NULL token_key values found")
		return nil
	}

	log.Printf("📋 Found %d NULL or empty token_key values, fixing...", nullCount)

	// Update NULL token_key to default "USDT"
	// Note: This is a best-effort fix. Ideally, we should try to determine the correct tokenKey
	// from other sources (like TokenAddress lookup), but for now we use a safe default
	result := db.Exec(`
		UPDATE checkbooks 
		SET token_key = 'USDT' 
		WHERE token_key IS NULL OR token_key = ''
	`)
	if result.Error != nil {
		return fmt.Errorf("failed to update NULL token_key values: %w", result.Error)
	}

	log.Printf("✅ Updated %d NULL token_key values to 'USDT'", result.RowsAffected)

	return nil
}

// fixTokenKeyColumn fixes token_key column size to VARCHAR(50) for original tokenKey strings
func fixTokenKeyColumn(db *gorm.DB, tableName, columnName, comment string) error {
	// Check if table exists
	var tableExists bool
	err := db.Raw(`
		SELECT EXISTS (
			SELECT 1 
			FROM information_schema.tables 
			WHERE table_schema = 'public'
			AND table_name = ?
		)
	`, tableName).Scan(&tableExists).Error

	if err != nil {
		return fmt.Errorf("failed to check if %s table exists: %w", tableName, err)
	}

	if !tableExists {
		log.Printf("📋 %s table does not exist yet, will be created by AutoMigrate", tableName)
		return nil
	}

	// Check current column size
	var currentSize sql.NullInt64
	err = db.Raw(`
		SELECT character_maximum_length 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		AND table_name = ? 
		AND column_name = ?
	`, tableName, columnName).Scan(&currentSize).Error

	if err != nil {
		return fmt.Errorf("failed to check %s.%s column size: %w", tableName, columnName, err)
	}

	if !currentSize.Valid {
		log.Printf("📋 %s.%s column does not exist yet, will be created by AutoMigrate", tableName, columnName)
		return nil
	}

	size := int(currentSize.Int64)
	log.Printf("📋 Current %s.%s column size: VARCHAR(%d)", tableName, columnName, size)

	// token_key should be VARCHAR(50) for original strings like "USDT", "USDC"
	targetSize := 50
	if size == targetSize {
		log.Printf("✅ %s.%s column already has correct size (%d)", tableName, columnName, size)
		return nil
	}

	// Fix the column size
	log.Printf("🔧 Updating %s.%s column from VARCHAR(%d) to VARCHAR(%d)...", tableName, columnName, size, targetSize)
	result := db.Exec(fmt.Sprintf(`ALTER TABLE %s ALTER COLUMN %s TYPE VARCHAR(%d)`, tableName, columnName, targetSize))
	if result.Error != nil {
		return fmt.Errorf("failed to update %s.%s column size: %w", tableName, columnName, result.Error)
	}

	log.Printf("✅ Updated %s.%s column size to VARCHAR(%d)", tableName, columnName, targetSize)

	// Add comment if possible
	if comment != "" {
		db.Exec(fmt.Sprintf(`COMMENT ON COLUMN %s.%s IS '%s'`, tableName, columnName, comment))
	}

	return nil
}

// fixUniversalAddressColumn fixes a single Universal Address column size
func fixUniversalAddressColumn(db *gorm.DB, tableName, columnName, comment string) error {
	// Check if table exists
	var tableExists bool
	err := db.Raw(`
		SELECT EXISTS (
			SELECT 1 
			FROM information_schema.tables 
			WHERE table_schema = 'public'
			AND table_name = ?
		)
	`, tableName).Scan(&tableExists).Error

	if err != nil {
		return fmt.Errorf("failed to check if %s table exists: %w", tableName, err)
	}

	if !tableExists {
		log.Printf("📋 %s table does not exist yet, will be created by AutoMigrate", tableName)
		return nil
	}

	// Check current column size
	var currentSize sql.NullInt64
	err = db.Raw(`
		SELECT character_maximum_length 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		AND table_name = ? 
		AND column_name = ?
	`, tableName, columnName).Scan(&currentSize).Error

	if err != nil {
		return fmt.Errorf("failed to check %s.%s column size: %w", tableName, columnName, err)
	}

	// If column doesn't exist, AutoMigrate will create it with correct size
	if !currentSize.Valid {
		log.Printf("📋 %s.%s column does not exist yet, will be created by AutoMigrate", tableName, columnName)
		return nil
	}

	size := int(currentSize.Int64)
	log.Printf("📋 Current %s.%s column size: VARCHAR(%d)", tableName, columnName, size)

	// If already correct size, skip
	if size >= 66 {
		log.Printf("✅ %s.%s column already has correct size (%d)", tableName, columnName, size)
		return nil
	}

	// Fix the column size
	log.Printf("🔧 Updating %s.%s column from VARCHAR(%d) to VARCHAR(66)...", tableName, columnName, size)
	result := db.Exec(fmt.Sprintf(`ALTER TABLE %s ALTER COLUMN %s TYPE VARCHAR(66)`, tableName, columnName))
	if result.Error != nil {
		return fmt.Errorf("failed to update %s.%s column size: %w", tableName, columnName, result.Error)
	}

	log.Printf("✅ Updated %s.%s column size to VARCHAR(66)", tableName, columnName)

	// Add comment if possible (ignore error if comment already exists)
	if comment != "" {
		db.Exec(fmt.Sprintf(`
			COMMENT ON COLUMN %s.%s IS '32-byte Universal Address in hex format (0x + 64 hex chars = 66 chars) - %s'
		`, tableName, columnName, comment))
	}

	return nil
}
