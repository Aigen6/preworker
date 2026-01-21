package main

import (
	"database/sql"
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	fmt.Println("🔍 Checking VARCHAR(50) address columns in database...")
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

	// 1. Check all VARCHAR(50) columns
	fmt.Println("\n📋 All VARCHAR(50) columns:")
	fmt.Println(string(make([]byte, 60)))
	rows, err := sqlDB.Query(`
		SELECT 
			table_name,
			column_name,
			data_type,
			character_maximum_length,
			is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public'
		AND data_type = 'character varying'
		AND character_maximum_length = 50
		ORDER BY table_name, column_name
	`)
	if err != nil {
		log.Fatalf("Failed to query: %v", err)
	}
	defer rows.Close()

	var foundAny bool
	for rows.Next() {
		var tableName, columnName, dataType, isNullable string
		var maxLength sql.NullInt64
		if err := rows.Scan(&tableName, &columnName, &dataType, &maxLength, &isNullable); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		foundAny = true
		fmt.Printf("  %s.%s: VARCHAR(%d) %s\n", tableName, columnName, maxLength.Int64, isNullable)
	}
	if !foundAny {
		fmt.Println("  ✅ No VARCHAR(50) columns found")
	}

	// 2. Check Universal Address columns specifically
	fmt.Println("\n📋 Universal Address columns (should be VARCHAR(66)):")
	fmt.Println(string(make([]byte, 60)))
	rows2, err := sqlDB.Query(`
		SELECT 
			table_name,
			column_name,
			data_type,
			character_maximum_length,
			CASE 
				WHEN character_maximum_length < 66 THEN '❌ NEEDS FIX'
				WHEN character_maximum_length = 66 THEN '✅ OK'
				ELSE '⚠️  LARGER'
			END as status
		FROM information_schema.columns
		WHERE table_schema = 'public'
		AND column_name IN (
			'user_data',
			'owner_data', 
			'recipient_data',
			'withdraw_recipient_data'
		)
		ORDER BY table_name, column_name
	`)
	if err != nil {
		log.Fatalf("Failed to query: %v", err)
	}
	defer rows2.Close()

	foundAny = false
	for rows2.Next() {
		var tableName, columnName, dataType, status string
		var maxLength sql.NullInt64
		if err := rows2.Scan(&tableName, &columnName, &dataType, &maxLength, &status); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		foundAny = true
		if maxLength.Valid {
			fmt.Printf("  %s.%s: VARCHAR(%d) - %s\n", tableName, columnName, maxLength.Int64, status)
		} else {
			fmt.Printf("  %s.%s: NULL - %s\n", tableName, columnName, status)
		}
	}
	if !foundAny {
		fmt.Println("  ⚠️  No Universal Address columns found (they may not exist yet)")
	}

	// 3. Summary
	fmt.Println("\n📊 Summary:")
	fmt.Println(string(make([]byte, 60)))
	rows3, err := sqlDB.Query(`
		SELECT 
			table_name,
			column_name,
			character_maximum_length
		FROM information_schema.columns
		WHERE table_schema = 'public'
		AND column_name IN (
			'user_data',
			'owner_data', 
			'recipient_data',
			'withdraw_recipient_data'
		)
		AND character_maximum_length < 66
		ORDER BY table_name, column_name
	`)
	if err != nil {
		log.Fatalf("Failed to query: %v", err)
	}
	defer rows3.Close()

	var needsFix []string
	for rows3.Next() {
		var tableName, columnName string
		var maxLength sql.NullInt64
		if err := rows3.Scan(&tableName, &columnName, &maxLength); err != nil {
			continue
		}
		if maxLength.Valid {
			needsFix = append(needsFix, fmt.Sprintf("%s.%s (VARCHAR(%d))", tableName, columnName, maxLength.Int64))
		}
	}

	if len(needsFix) > 0 {
		fmt.Println("  ❌ Columns that need fixing:")
		for _, col := range needsFix {
			fmt.Printf("    - %s\n", col)
		}
		os.Exit(1)
	} else {
		fmt.Println("  ✅ All Universal Address columns are correct size (VARCHAR(66))")
		os.Exit(0)
	}
}

