package main

import (
	"database/sql"
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"log"
)

func main() {
	fmt.Println("🔧 Fixing user_data column size in checkbooks table...")
	fmt.Println("=" + string(make([]byte, 60)))

	// Load config
	if err := config.LoadConfig(""); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize database
	db.InitDB()
	defer func() {
		sqlDB, err := db.DB.DB()
		if err == nil {
			sqlDB.Close()
		}
	}()

	// Check current size
	var currentSize sql.NullInt64
	err := db.DB.Raw(`
		SELECT character_maximum_length 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		AND table_name = 'checkbooks' 
		AND column_name = 'user_data'
	`).Scan(&currentSize).Error

	if err != nil {
		log.Fatalf("❌ Failed to check user_data column size: %v", err)
	}

	if !currentSize.Valid {
		log.Fatalf("❌ user_data column does not exist in checkbooks table")
	}

	size := int(currentSize.Int64)
	fmt.Printf("📋 Current user_data column size: VARCHAR(%d)\n", size)

	if size >= 66 {
		fmt.Printf("✅ user_data column already has correct size (%d)\n", size)
		return
	}

	// Fix the column size
	fmt.Printf("🔧 Updating user_data column from VARCHAR(%d) to VARCHAR(66)...\n", size)
	result := db.DB.Exec(`ALTER TABLE checkbooks ALTER COLUMN user_data TYPE VARCHAR(66)`)
	if result.Error != nil {
		log.Fatalf("❌ Failed to update user_data column size: %v", result.Error)
	}

	fmt.Println("✅ Updated user_data column size to VARCHAR(66)")

	// Verify
	var newSize sql.NullInt64
	db.DB.Raw(`
		SELECT character_maximum_length 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		AND table_name = 'checkbooks' 
		AND column_name = 'user_data'
	`).Scan(&newSize)

	if newSize.Valid {
		fmt.Printf("✅ Verified: user_data column size is now VARCHAR(%d)\n", newSize.Int64)
	}
}

