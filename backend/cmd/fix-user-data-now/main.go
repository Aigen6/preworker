package main

import (
	"database/sql"
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"log"
	"os"
)

func main() {
	fmt.Println("🔧 强制修复 checkbooks.user_data 列大小...")
	fmt.Println("=" + string(make([]byte, 60)))

	// Load config
	if err := config.LoadConfig(""); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize database
	db.InitDB()

	// Get database connection
	sqlDB, err := db.DB.DB()
	if err != nil {
		log.Fatalf("Failed to get database connection: %v", err)
	}
	defer sqlDB.Close()

	// Check current size
	var currentSize sql.NullInt64
	err = sqlDB.QueryRow(`
		SELECT character_maximum_length 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		AND table_name = 'checkbooks' 
		AND column_name = 'user_data'
	`).Scan(&currentSize)

	if err != nil {
		log.Fatalf("❌ Failed to check column size: %v", err)
	}

	if !currentSize.Valid {
		log.Fatalf("❌ user_data column does not exist!")
	}

	size := int(currentSize.Int64)
	fmt.Printf("📋 Current user_data column size: VARCHAR(%d)\n", size)

	if size >= 66 {
		fmt.Printf("✅ Column already has correct size (%d)\n", size)
		os.Exit(0)
	}

	// Force fix the column size
	fmt.Printf("🔧 FORCING update from VARCHAR(%d) to VARCHAR(66)...\n", size)
	
	// Use transaction to ensure it works
	tx, err := sqlDB.Begin()
	if err != nil {
		log.Fatalf("❌ Failed to begin transaction: %v", err)
	}

	_, err = tx.Exec(`ALTER TABLE checkbooks ALTER COLUMN user_data TYPE VARCHAR(66)`)
	if err != nil {
		tx.Rollback()
		log.Fatalf("❌ Failed to update column size: %v", err)
	}

	if err := tx.Commit(); err != nil {
		log.Fatalf("❌ Failed to commit transaction: %v", err)
	}

	fmt.Println("✅ Column size updated to VARCHAR(66)")

	// Verify
	err = sqlDB.QueryRow(`
		SELECT character_maximum_length 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		AND table_name = 'checkbooks' 
		AND column_name = 'user_data'
	`).Scan(&currentSize)

	if err == nil && currentSize.Valid {
		fmt.Printf("✅ Verified: user_data is now VARCHAR(%d)\n", currentSize.Int64)
		if currentSize.Int64 >= 66 {
			fmt.Println("\n🎉 修复成功！现在可以正常使用了。")
			os.Exit(0)
		}
	}

	os.Exit(1)
}

