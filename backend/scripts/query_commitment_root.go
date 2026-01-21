package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	// Get database connection string from environment
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")
	dbName := getEnv("DB_NAME", "zkpay")

	root := "0x9c86add5c8a822b6d66a07570744bb483285a74ebc809b2b0fd5eefbb7ffd0ba"
	if len(os.Args) > 1 {
		root = os.Args[1]
	}

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	fmt.Printf("=== Querying Commitment Root: %s ===\n\n", root)

	// 1. Query queue_roots table
	fmt.Println("📋 Queue Roots:")
	queryQueueRoots(db, root)

	// 2. Query commitments table (by new_root or old_root)
	fmt.Println("\n📦 Commitments:")
	queryCommitments(db, root)

	// 3. Query checkbooks table (by commitment)
	fmt.Println("\n📚 Checkbooks:")
	queryCheckbooks(db, root)

	// 4. Query withdraw_requests (if any field references this root)
	fmt.Println("\n💸 Withdraw Requests:")
	queryWithdrawRequests(db, root)
}

func queryQueueRoots(db *sql.DB, root string) {
	rows, err := db.Query(`
		SELECT id, root, previous_root, created_by_commitment, created_at
		FROM queue_roots
		WHERE root = $1 OR previous_root = $1 OR created_by_commitment = $1
		ORDER BY created_at DESC
	`, root)
	if err != nil {
		log.Printf("Error querying queue_roots: %v", err)
		return
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		found = true
		var id, qRoot, prevRoot, createdBy, createdAt string
		if err := rows.Scan(&id, &qRoot, &prevRoot, &createdBy, &createdAt); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		fmt.Printf("  ID: %s\n", id)
		fmt.Printf("    Root: %s\n", qRoot)
		fmt.Printf("    Previous Root: %s\n", prevRoot)
		fmt.Printf("    Created By Commitment: %s\n", createdBy)
		fmt.Printf("    Created At: %s\n", createdAt)
		fmt.Println()
	}
	if !found {
		fmt.Println("  No records found in queue_roots")
	}
}

func queryCommitments(db *sql.DB, root string) {
	rows, err := db.Query(`
		SELECT id, commitment, old_root, new_root, status, transaction_hash, created_at
		FROM commitments
		WHERE old_root = $1 OR new_root = $1 OR commitment = $1
		ORDER BY created_at DESC
	`, root)
	if err != nil {
		log.Printf("Error querying commitments: %v", err)
		return
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		found = true
		var id, commitment, oldRoot, newRoot, status, txHash, createdAt string
		if err := rows.Scan(&id, &commitment, &oldRoot, &newRoot, &status, &txHash, &createdAt); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		fmt.Printf("  ID: %s\n", id)
		fmt.Printf("    Commitment: %s\n", commitment)
		fmt.Printf("    Old Root: %s\n", oldRoot)
		fmt.Printf("    New Root: %s\n", newRoot)
		fmt.Printf("    Status: %s\n", status)
		fmt.Printf("    Transaction Hash: %s\n", txHash)
		fmt.Printf("    Created At: %s\n", createdAt)
		fmt.Println()
	}
	if !found {
		fmt.Println("  No records found in commitments")
	}
}

func queryCheckbooks(db *sql.DB, root string) {
	rows, err := db.Query(`
		SELECT id, commitment, status, created_at
		FROM checkbooks
		WHERE commitment = $1
		ORDER BY created_at DESC
	`, root)
	if err != nil {
		log.Printf("Error querying checkbooks: %v", err)
		return
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		found = true
		var id, commitment, status, createdAt string
		if err := rows.Scan(&id, &commitment, &status, &createdAt); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		fmt.Printf("  ID: %s\n", id)
		fmt.Printf("    Commitment: %s\n", commitment)
		fmt.Printf("    Status: %s\n", status)
		fmt.Printf("    Created At: %s\n", createdAt)
		fmt.Println()
	}
	if !found {
		fmt.Println("  No records found in checkbooks")
	}
}

func queryWithdrawRequests(db *sql.DB, root string) {
	// Check if there's any field that might reference this root
	// Note: withdraw_requests doesn't directly store root, but we can check public_values
	rows, err := db.Query(`
		SELECT id, status, proof_status, execute_status, public_values, created_at
		FROM withdraw_requests
		WHERE public_values LIKE $1
		ORDER BY created_at DESC
		LIMIT 10
	`, "%"+root[2:]+"%") // Remove 0x prefix for LIKE search
	if err != nil {
		log.Printf("Error querying withdraw_requests: %v", err)
		return
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		found = true
		var id, status, proofStatus, executeStatus, publicValues, createdAt string
		if err := rows.Scan(&id, &status, &proofStatus, &executeStatus, &publicValues, &createdAt); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		fmt.Printf("  ID: %s\n", id)
		fmt.Printf("    Status: %s\n", status)
		fmt.Printf("    Proof Status: %s\n", proofStatus)
		fmt.Printf("    Execute Status: %s\n", executeStatus)
		if len(publicValues) > 100 {
			fmt.Printf("    Public Values: %s... (truncated)\n", publicValues[:100])
		} else {
			fmt.Printf("    Public Values: %s\n", publicValues)
		}
		fmt.Printf("    Created At: %s\n", createdAt)
		fmt.Println()
	}
	if !found {
		fmt.Println("  No records found in withdraw_requests")
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

