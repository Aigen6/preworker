package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
	"go-backend/internal/config"
)

func main() {
	// Load config
	if len(os.Args) < 2 {
		log.Fatal("Usage: go run fix_chain_id_nulls.go <config.yaml>")
	}

	configPath := os.Args[1]
	if err := config.LoadConfig(configPath); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if config.AppConfig == nil || config.AppConfig.Database.DSN == "" {
		log.Fatal("Database DSN is required")
	}

	// Connect to database
	db, err := sql.Open("postgres", config.AppConfig.Database.DSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("✅ Connected to database")

	// Check NULL count
	var nullCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM intent_asset_tokens WHERE chain_id IS NULL").Scan(&nullCount); err != nil {
		log.Fatalf("Failed to check NULL count: %v", err)
	}

	log.Printf("📊 Found %d records with NULL chain_id", nullCount)

	if nullCount == 0 {
		log.Println("✅ No NULL values found, database is ready!")
		return
	}

	// Step 1: Try to populate from asset_id
	log.Println("🔄 Step 1: Populating chain_id from asset_id...")
	result, err := db.Exec(`
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
	if err != nil {
		log.Printf("⚠️ Failed to populate from asset_id: %v", err)
	} else {
		rows, _ := result.RowsAffected()
		log.Printf("✅ Updated %d records from asset_id", rows)
	}

	// Step 2: Try to populate from IntentAdapter
	log.Println("🔄 Step 2: Populating chain_id from IntentAdapter...")
	result, err = db.Exec(`
		UPDATE intent_asset_tokens iat
		SET chain_id = ia.chain_id
		FROM intent_adapters ia
		WHERE iat.chain_id IS NULL 
		  AND iat.adapter_id = ia.adapter_id
		  AND ia.chain_id IS NOT NULL
	`)
	if err != nil {
		log.Printf("⚠️ Failed to populate from IntentAdapter: %v", err)
	} else {
		rows, _ := result.RowsAffected()
		log.Printf("✅ Updated %d records from IntentAdapter", rows)
	}

	// Step 3: Set default for remaining NULL values
	log.Println("🔄 Step 3: Setting default chain_id (714 = BSC) for remaining NULL values...")
	result, err = db.Exec(`
		UPDATE intent_asset_tokens
		SET chain_id = 714
		WHERE chain_id IS NULL
	`)
	if err != nil {
		log.Fatalf("❌ Failed to set default chain_id: %v", err)
	}
	rows, _ := result.RowsAffected()
	log.Printf("✅ Updated %d records with default chain_id (714)", rows)

	// Step 4: Verify no NULL values remain
	if err := db.QueryRow("SELECT COUNT(*) FROM intent_asset_tokens WHERE chain_id IS NULL").Scan(&nullCount); err != nil {
		log.Fatalf("Failed to verify NULL count: %v", err)
	}

	if nullCount == 0 {
		log.Println("✅ All NULL values have been fixed!")
	} else {
		log.Fatalf("❌ Still have %d NULL values", nullCount)
	}

	log.Println("✅ Database is ready for migration!")
}












