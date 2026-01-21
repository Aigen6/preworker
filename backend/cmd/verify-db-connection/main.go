package main

import (
	"database/sql"
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"log"
)

func main() {
	fmt.Println("🔍 Verifying database connection and column sizes...")
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

	// Get database name
	var dbName string
	err = sqlDB.QueryRow("SELECT current_database()").Scan(&dbName)
	if err != nil {
		log.Fatalf("Failed to get database name: %v", err)
	}
	fmt.Printf("📋 Connected to database: %s\n", dbName)

	// Check checkbooks.user_data column size
	var size sql.NullInt64
	err = sqlDB.QueryRow(`
		SELECT character_maximum_length 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		AND table_name = 'checkbooks' 
		AND column_name = 'user_data'
	`).Scan(&size)

	if err != nil {
		log.Fatalf("Failed to query column size: %v", err)
	}

	if !size.Valid {
		fmt.Println("❌ user_data column does not exist!")
		return
	}

	fmt.Printf("📋 checkbooks.user_data column size: VARCHAR(%d)\n", size.Int64)

	if size.Int64 < 66 {
		fmt.Printf("❌ Column size is too small! Need VARCHAR(66), but got VARCHAR(%d)\n", size.Int64)
		fmt.Println("\n🔧 Fixing column size...")
		
		_, err = sqlDB.Exec(`ALTER TABLE checkbooks ALTER COLUMN user_data TYPE VARCHAR(66)`)
		if err != nil {
			log.Fatalf("Failed to fix column size: %v", err)
		}
		
		fmt.Println("✅ Column size fixed to VARCHAR(66)")
		
		// Verify
		err = sqlDB.QueryRow(`
			SELECT character_maximum_length 
			FROM information_schema.columns 
			WHERE table_schema = 'public'
			AND table_name = 'checkbooks' 
			AND column_name = 'user_data'
		`).Scan(&size)
		
		if err == nil && size.Valid {
			fmt.Printf("✅ Verified: user_data is now VARCHAR(%d)\n", size.Int64)
		}
	} else {
		fmt.Printf("✅ Column size is correct: VARCHAR(%d)\n", size.Int64)
	}

	// Test insert to see if it works
	fmt.Println("\n🧪 Testing with a sample value...")
	testValue := "0x0000000000000000000000006f3995e2e40ca58adcbd47a2edad192e43d98638"
	fmt.Printf("   Test value length: %d characters\n", len(testValue))
	fmt.Printf("   Test value: %s\n", testValue)
	
	if len(testValue) > int(size.Int64) {
		fmt.Printf("❌ Test value (%d chars) is longer than column size (%d)!\n", len(testValue), size.Int64)
	} else {
		fmt.Printf("✅ Test value fits in column size\n")
	}
}

