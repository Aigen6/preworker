package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"go-backend/internal/models"
	"go-backend/internal/repository"

	"gorm.io/gorm"
)

// WithdrawTimeoutService handles timeout checks for WithdrawRequest
type WithdrawTimeoutService struct {
	db           *gorm.DB
	withdrawRepo repository.WithdrawRequestRepository
	running      bool
	stopCh       chan struct{}
	checkInterval time.Duration
	timeoutDuration time.Duration // 5 minutes
}

// NewWithdrawTimeoutService creates a new WithdrawTimeoutService
func NewWithdrawTimeoutService(db *gorm.DB, withdrawRepo repository.WithdrawRequestRepository) *WithdrawTimeoutService {
	return &WithdrawTimeoutService{
		db:             db,
		withdrawRepo:  withdrawRepo,
		stopCh:         make(chan struct{}),
		checkInterval:  30 * time.Second, // Check every 30 seconds
		timeoutDuration: 5 * time.Minute,  // 5 minutes timeout
	}
}

// Start begins the timeout check loop
func (s *WithdrawTimeoutService) Start() {
	if s.running {
		return
	}
	s.running = true

	log.Printf("🚀 Starting WithdrawTimeoutService (check interval: %v, timeout: %v)", s.checkInterval, s.timeoutDuration)

	go s.timeoutCheckLoop()

	log.Printf("✅ WithdrawTimeoutService started")
}

// Stop gracefully stops the timeout check loop
func (s *WithdrawTimeoutService) Stop() {
	if !s.running {
		return
	}
	s.running = false
	close(s.stopCh)
	log.Printf("🛑 WithdrawTimeoutService stopped")
}

// timeoutCheckLoop periodically checks for timed-out withdraw requests
func (s *WithdrawTimeoutService) timeoutCheckLoop() {
	ticker := time.NewTicker(s.checkInterval)
	defer ticker.Stop()

	// Run initial check on startup
	s.checkTimeouts()

	for {
		select {
		case <-ticker.C:
			s.checkTimeouts()
		case <-s.stopCh:
			return
		}
	}
}

// checkTimeouts checks for timed-out withdraw requests and updates their status
func (s *WithdrawTimeoutService) checkTimeouts() {
	ctx := context.Background()
	now := time.Now()
	timeoutThreshold := now.Add(-s.timeoutDuration)

	log.Printf("🔍 [WithdrawTimeout] Checking for timed-out withdraw requests (threshold: %s)", timeoutThreshold.Format(time.RFC3339))

	// Check Stage 1: proof_status = in_progress, created_at < timeoutThreshold
	// Note: We check created_at because proof_status is set to in_progress when proof generation starts
	proofTimeoutCount := s.checkProofTimeouts(ctx, timeoutThreshold)
	
	// Check Stage 2: execute_status = pending or submitted, created_at < timeoutThreshold
	// Note: For submitted status, we should check when it was submitted, but for simplicity,
	// we check created_at. If execute_status is submitted, we could also check updated_at
	executeTimeoutCount := s.checkExecuteTimeouts(ctx, timeoutThreshold)

	if proofTimeoutCount > 0 || executeTimeoutCount > 0 {
		log.Printf("✅ [WithdrawTimeout] Processed timeouts: proof=%d, execute=%d", proofTimeoutCount, executeTimeoutCount)
	}
}

// checkProofTimeouts checks for timed-out proof generation (Stage 1)
func (s *WithdrawTimeoutService) checkProofTimeouts(ctx context.Context, timeoutThreshold time.Time) int {
	var requests []models.WithdrawRequest
	
	// Find requests with proof_status = in_progress that were created more than 5 minutes ago
	err := s.db.Where("proof_status = ? AND created_at < ?", models.ProofStatusInProgress, timeoutThreshold).
		Find(&requests).Error
	
	if err != nil {
		log.Printf("❌ [WithdrawTimeout] Failed to query proof timeout requests: %v", err)
		return 0
	}

	if len(requests) == 0 {
		return 0
	}

	log.Printf("⚠️ [WithdrawTimeout] Found %d proof generation requests that timed out", len(requests))

	count := 0
	for _, request := range requests {
		// Check if it's actually timed out (more than 5 minutes since creation)
		elapsed := time.Since(request.CreatedAt)
		if elapsed >= s.timeoutDuration {
			log.Printf("⏰ [WithdrawTimeout] Proof generation timeout for request %s (elapsed: %v)", request.ID, elapsed)
			
			// Update proof_status to failed
			if err := s.withdrawRepo.UpdateProofStatus(ctx, request.ID, models.ProofStatusFailed, "", "", fmt.Sprintf("Proof generation timeout after %v", elapsed)); err != nil {
				log.Printf("❌ [WithdrawTimeout] Failed to update proof_status to failed for request %s: %v", request.ID, err)
			} else {
				log.Printf("✅ [WithdrawTimeout] Updated proof_status to failed for request %s", request.ID)
				count++
			}
		}
	}

	return count
}

// checkExecuteTimeouts checks for timed-out execute status (Stage 2)
func (s *WithdrawTimeoutService) checkExecuteTimeouts(ctx context.Context, timeoutThreshold time.Time) int {
	// Check pending status: created_at < timeoutThreshold
	var pendingRequests []models.WithdrawRequest
	err := s.db.Where("execute_status = ? AND created_at < ?", 
		models.ExecuteStatusPending, timeoutThreshold).
		Find(&pendingRequests).Error
	
	if err != nil {
		log.Printf("❌ [WithdrawTimeout] Failed to query pending execute requests: %v", err)
	} else if len(pendingRequests) > 0 {
		log.Printf("⚠️ [WithdrawTimeout] Found %d pending execute requests that may have timed out", len(pendingRequests))
	}

	// Check submitted status: updated_at < timeoutThreshold (when status was set to submitted)
	var submittedRequests []models.WithdrawRequest
	err2 := s.db.Where("execute_status = ? AND updated_at < ?", 
		models.ExecuteStatusSubmitted, timeoutThreshold).
		Find(&submittedRequests).Error
	
	if err2 != nil {
		log.Printf("❌ [WithdrawTimeout] Failed to query submitted execute requests: %v", err2)
	} else if len(submittedRequests) > 0 {
		log.Printf("⚠️ [WithdrawTimeout] Found %d submitted execute requests that may have timed out", len(submittedRequests))
	}

	if len(pendingRequests) == 0 && len(submittedRequests) == 0 {
		return 0
	}

	count := 0
	
	// Process pending requests
	for _, request := range pendingRequests {
		elapsed := time.Since(request.CreatedAt)
		if elapsed >= s.timeoutDuration {
			log.Printf("⏰ [WithdrawTimeout] Execute timeout for request %s (status: pending, elapsed: %v)", request.ID, elapsed)
			
			// Use repository method which should handle concurrent updates
			// Note: Repository method doesn't use FOR UPDATE, but timeout service runs infrequently
			// and checks status before updating, so conflict risk is low
			errorMsg := fmt.Sprintf("Execute timeout after %v (status was pending)", elapsed)
			if err := s.withdrawRepo.UpdateExecuteStatus(ctx, request.ID, models.ExecuteStatusVerifyFailed, "", nil, errorMsg); err != nil {
				// Check if error is due to concurrent update (already in final status)
				if strings.Contains(err.Error(), "no rows updated") {
					log.Printf("⚠️ [WithdrawTimeout] Request %s already updated by another process, skipping", request.ID)
				} else {
				log.Printf("❌ [WithdrawTimeout] Failed to update execute_status to verify_failed for request %s: %v", request.ID, err)
				}
			} else {
				log.Printf("✅ [WithdrawTimeout] Updated execute_status to verify_failed for request %s", request.ID)
				count++
			}
		}
	}

	// Process submitted requests
	for _, request := range submittedRequests {
		elapsed := time.Since(request.UpdatedAt)
		if elapsed >= s.timeoutDuration {
			log.Printf("⏰ [WithdrawTimeout] Execute timeout for request %s (status: submitted, elapsed: %v, txHash: %s)", 
				request.ID, elapsed, request.ExecuteTxHash)
			
			// Use repository method which should handle concurrent updates
			errorMsg := fmt.Sprintf("Execute timeout after %v (status was submitted, txHash: %s)", elapsed, request.ExecuteTxHash)
			if err := s.withdrawRepo.UpdateExecuteStatus(ctx, request.ID, models.ExecuteStatusVerifyFailed, request.ExecuteTxHash, nil, errorMsg); err != nil {
				// Check if error is due to concurrent update (already in final status)
				if strings.Contains(err.Error(), "no rows updated") {
					log.Printf("⚠️ [WithdrawTimeout] Request %s already updated by another process, skipping", request.ID)
				} else {
				log.Printf("❌ [WithdrawTimeout] Failed to update execute_status to verify_failed for request %s: %v", request.ID, err)
				}
			} else {
				log.Printf("✅ [WithdrawTimeout] Updated execute_status to verify_failed for request %s", request.ID)
				count++
			}
		}
	}

	return count
}

