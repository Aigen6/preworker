package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
	"go-backend/internal/types"
)

func main() {
	// Command line flags
	dryRun := flag.Bool("dry-run", false, "Dry run mode: only check, don't update")
	flag.Parse()

	// Database connection
	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "localhost"
	}
	dbPort := os.Getenv("DB_PORT")
	if dbPort == "" {
		dbPort = "5432"
	}
	dbUser := os.Getenv("DB_USER")
	if dbUser == "" {
		dbUser = "zkpay"
	}
	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		dbPassword = "zkpay" // Default password from docker-compose
	}
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "zkpay-backend"
	}

	if *dryRun {
		log.Printf("🔍 Running in DRY-RUN mode (no changes will be made)")
	}

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Query checkbooks with commitment and public_values
	query := `
		SELECT 
			id,
			commitment,
			public_values,
			status,
			local_deposit_id
		FROM checkbooks
		WHERE commitment IS NOT NULL
		  AND commitment != ''
		  AND public_values IS NOT NULL
		  AND public_values != ''
		ORDER BY created_at DESC
	`

	rows, err := db.Query(query)
	if err != nil {
		log.Fatalf("Failed to query checkbooks: %v", err)
	}
	defer rows.Close()

	var fixedCount, errorCount, correctCount int

	for rows.Next() {
		var id, commitment, publicValues, status string
		var localDepositID int64

		err := rows.Scan(&id, &commitment, &publicValues, &status, &localDepositID)
		if err != nil {
			log.Printf("❌ Failed to scan row: %v", err)
			errorCount++
			continue
		}

		// Parse public_values to get the correct commitment hash
		parsedValues, err := types.ParseCommitmentPublicValues(publicValues)
		if err != nil {
			log.Printf("❌ [%s] Failed to parse public_values: %v", id, err)
			errorCount++
			continue
		}

		correctCommitment := parsedValues.Commitment

		// Compare with current commitment
		if commitment == correctCommitment {
			log.Printf("✅ [%s] Commitment is correct: %s", id, commitment)
			correctCount++
			continue
		}

		// Commitment mismatch - need to fix
		log.Printf("⚠️  [%s] Commitment mismatch detected:", id)
		log.Printf("   Current: %s", commitment)
		log.Printf("   Correct: %s (from public_values)", correctCommitment)
		log.Printf("   Status: %s, DepositID: %d", status, localDepositID)

		if *dryRun {
			log.Printf("   [DRY-RUN] Would update commitment to: %s", correctCommitment)
			fixedCount++
			continue
		}

		// Update commitment
		updateQuery := `
			UPDATE checkbooks
			SET commitment = $1, updated_at = NOW()
			WHERE id = $2
		`
		_, err = db.Exec(updateQuery, correctCommitment, id)
		if err != nil {
			log.Printf("❌ [%s] Failed to update commitment: %v", id, err)
			errorCount++
			continue
		}

		log.Printf("✅ [%s] Fixed commitment: %s -> %s", id, commitment, correctCommitment)
		fixedCount++
	}

	if err = rows.Err(); err != nil {
		log.Fatalf("Error iterating rows: %v", err)
	}

	log.Printf("\n📊 Summary:")
	log.Printf("   ✅ Correct commitments: %d", correctCount)
	log.Printf("   🔧 Fixed commitments: %d", fixedCount)
	log.Printf("   ❌ Errors: %d", errorCount)
	log.Printf("   📋 Total processed: %d", correctCount+fixedCount+errorCount)
}

