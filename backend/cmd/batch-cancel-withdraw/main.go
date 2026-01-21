package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/models"
	"go-backend/internal/repository"
	"go-backend/internal/services"
)

func main() {
	var (
		executeStatus = flag.String("execute-status", "", "Filter by execute_status (e.g., verify_failed)")
		payoutStatus  = flag.String("payout-status", "", "Filter by payout_status (e.g., pending)")
		proofStatus   = flag.String("proof-status", "", "Filter by proof_status (e.g., failed)")
		requestIDs    = flag.String("ids", "", "Comma-separated list of request IDs to cancel")
		dryRun        = flag.Bool("dry-run", false, "Only show what would be cancelled, don't actually cancel")
		configPath    = flag.String("config", "config.yaml", "Path to config file")
	)
	flag.Parse()

	// Load configuration
	if err := config.LoadConfig(*configPath); err != nil {
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
	database := db.DB

	ctx := context.Background()
	withdrawRepo := repository.NewWithdrawRequestRepository(database)
	allocationRepo := repository.NewAllocationRepository(database)
	withdrawService := services.NewWithdrawRequestService(
		withdrawRepo,
		allocationRepo,
		nil, // zkvmClient not needed for cancellation
		nil, // blockchainService not needed for cancellation
	)

	var requestsToCancel []*models.WithdrawRequest

	// If specific IDs provided, use those
	if *requestIDs != "" {
		ids := strings.Split(*requestIDs, ",")
		for _, id := range ids {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			request, err := withdrawRepo.GetByID(ctx, id)
			if err != nil {
				log.Printf("⚠️  Failed to get request %s: %v", id, err)
				continue
			}
			requestsToCancel = append(requestsToCancel, request)
		}
	} else {
		// Query by status filters
		var allRequests []*models.WithdrawRequest

		if *executeStatus != "" {
			requests, err := withdrawRepo.FindByExecuteStatus(ctx, models.ExecuteStatus(*executeStatus))
			if err != nil {
				log.Fatalf("Failed to query by execute_status: %v", err)
			}
			allRequests = requests
		} else if *payoutStatus != "" {
			requests, err := withdrawRepo.FindByPayoutStatus(ctx, models.PayoutStatus(*payoutStatus))
			if err != nil {
				log.Fatalf("Failed to query by payout_status: %v", err)
			}
			allRequests = requests
		} else if *proofStatus != "" {
			requests, err := withdrawRepo.FindByProofStatus(ctx, models.ProofStatus(*proofStatus))
			if err != nil {
				log.Fatalf("Failed to query by proof_status: %v", err)
			}
			allRequests = requests
		} else {
			log.Fatal("Please specify either -ids, -execute-status, -payout-status, or -proof-status")
		}

		// Apply additional filters
		for _, req := range allRequests {
			include := true

			if *executeStatus != "" && string(req.ExecuteStatus) != *executeStatus {
				include = false
			}
			if *payoutStatus != "" && string(req.PayoutStatus) != *payoutStatus {
				include = false
			}
			if *proofStatus != "" && string(req.ProofStatus) != *proofStatus {
				include = false
			}

			// Only include requests that can be cancelled
			if include && req.CanCancel() {
				requestsToCancel = append(requestsToCancel, req)
			}
		}
	}

	if len(requestsToCancel) == 0 {
		log.Println("No requests found to cancel")
		return
	}

	log.Printf("Found %d requests to cancel:\n", len(requestsToCancel))
	for _, req := range requestsToCancel {
		log.Printf("  - ID: %s, Owner: %s, Status: %s, ExecuteStatus: %s, PayoutStatus: %s, ProofStatus: %s",
			req.ID,
			req.OwnerAddress.Data,
			req.Status,
			req.ExecuteStatus,
			req.PayoutStatus,
			req.ProofStatus,
		)
	}

	if *dryRun {
		log.Println("\n🔍 DRY RUN MODE - No requests were actually cancelled")
		return
	}

	// Confirm before proceeding
	fmt.Print("\n⚠️  Are you sure you want to cancel these requests? (yes/no): ")
	var confirmation string
	fmt.Scanln(&confirmation)
	if confirmation != "yes" {
		log.Println("Cancelled by user")
		return
	}

	// Cancel each request
	successCount := 0
	failCount := 0
	for _, req := range requestsToCancel {
		log.Printf("\n🔄 Cancelling request %s...", req.ID)
		err := withdrawService.CancelWithdrawRequest(ctx, req.ID)
		if err != nil {
			log.Printf("❌ Failed to cancel request %s: %v", req.ID, err)
			failCount++
		} else {
			log.Printf("✅ Successfully cancelled request %s", req.ID)
			successCount++
		}
		// Small delay to avoid overwhelming the database
		time.Sleep(100 * time.Millisecond)
	}

	log.Printf("\n📊 Summary:")
	log.Printf("  ✅ Successfully cancelled: %d", successCount)
	log.Printf("  ❌ Failed: %d", failCount)
	log.Printf("  📝 Total processed: %d", len(requestsToCancel))
}

