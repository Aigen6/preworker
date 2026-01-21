package main

import (
	"flag"
	"fmt"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"log"
	"strings"
)

func main() {
	var fromStatus string
	var toStatus string
	var checkbookID string
	var dryRun bool

	flag.StringVar(&fromStatus, "from", "with_checkbook", "Source status to update from")
	flag.StringVar(&toStatus, "to", "ready_for_commitment", "Target status to update to")
	flag.StringVar(&checkbookID, "id", "", "Specific checkbook ID to update (optional, if empty, updates all matching)")
	flag.BoolVar(&dryRun, "dry-run", false, "Dry run mode (show what would be updated without actually updating)")
	flag.Parse()

	fmt.Println("🔄 Checkbook Status Update Script")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("From Status: %s\n", fromStatus)
	fmt.Printf("To Status: %s\n", toStatus)
	if checkbookID != "" {
		fmt.Printf("Checkbook ID: %s\n", checkbookID)
	} else {
		fmt.Printf("Checkbook ID: ALL (all matching checkbooks)\n")
	}
	if dryRun {
		fmt.Printf("Mode: DRY RUN (no changes will be made)\n")
	} else {
		fmt.Printf("Mode: LIVE (will update database)\n")
	}
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println()

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

	// Query checkbooks with the source status
	var checkbooks []models.Checkbook
	query := db.DB.Where("status = ?", fromStatus)

	if checkbookID != "" {
		query = query.Where("id = ?", checkbookID)
	}

	if err := query.Find(&checkbooks).Error; err != nil {
		log.Fatalf("❌ Failed to query checkbooks: %v", err)
	}

	if len(checkbooks) == 0 {
		fmt.Printf("✅ No checkbooks found with status '%s'\n", fromStatus)
		if checkbookID != "" {
			fmt.Printf("   Checkbook ID: %s\n", checkbookID)
		}
		return
	}

	fmt.Printf("📋 Found %d checkbook(s) with status '%s':\n", len(checkbooks), fromStatus)
	fmt.Println(strings.Repeat("-", 60))
	for i, cb := range checkbooks {
		fmt.Printf("%d. ID: %s\n", i+1, cb.ID)
		fmt.Printf("   Status: %s\n", cb.Status)
		fmt.Printf("   Local Deposit ID: %d\n", cb.LocalDepositID)
		fmt.Printf("   Chain ID: %d\n", cb.SLIP44ChainID)
		if cb.Commitment != nil {
			fmt.Printf("   Commitment: %s\n", *cb.Commitment)
		}
		if cb.CommitmentTxHash != "" {
			fmt.Printf("   Commitment Tx Hash: %s\n", cb.CommitmentTxHash)
		}
		fmt.Println()
	}

	if dryRun {
		fmt.Println("🔍 DRY RUN: Would update the above checkbook(s) to status '" + toStatus + "'")
		fmt.Println("   Run without --dry-run flag to actually update the database")
		return
	}

	// Confirm update
	fmt.Printf("⚠️  About to update %d checkbook(s) from '%s' to '%s'\n", len(checkbooks), fromStatus, toStatus)
	fmt.Print("Continue? (yes/no): ")
	var confirm string
	fmt.Scanln(&confirm)
	if strings.ToLower(confirm) != "yes" {
		fmt.Println("❌ Update cancelled")
		return
	}

	// Update checkbooks
	result := db.DB.Model(&models.Checkbook{}).
		Where("status = ?", fromStatus)
	
	if checkbookID != "" {
		result = result.Where("id = ?", checkbookID)
	}

	result = result.Update("status", toStatus)

	if result.Error != nil {
		log.Fatalf("❌ Failed to update checkbooks: %v", result.Error)
	}

	fmt.Printf("✅ Successfully updated %d checkbook(s) from '%s' to '%s'\n", result.RowsAffected, fromStatus, toStatus)

	// Verify update
	var updatedCheckbooks []models.Checkbook
	verifyQuery := db.DB.Where("status = ?", toStatus)
	if checkbookID != "" {
		verifyQuery = verifyQuery.Where("id = ?", checkbookID)
	}
	if err := verifyQuery.Find(&updatedCheckbooks).Error; err == nil {
		fmt.Printf("\n📋 Verification: Found %d checkbook(s) with status '%s'\n", len(updatedCheckbooks), toStatus)
	}
}












