// Package handlers provides common helper functions for HTTP handlers
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"go-backend/internal/db"
	"go-backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ============ Unified utility functions ============

// ShouldIncludeChecksForStatus determines if status should return checks
func ShouldIncludeChecksForStatus(status string) bool {
	statusesWithChecks := map[string]bool{
		"commitment_pending": true,
		"with_checkbook":     true,
		"completed":          true,
		"proof_failed":       true,
		"submission_failed":  true,
	}
	return statusesWithChecks[status]
}

// respondWithError unified error response function
func respondWithError(c *gin.Context, statusCode int, errorType, message string, details interface{}) {
	response := gin.H{
		"error":   errorType,
		"message": message,
	}
	if details != nil {
		response["details"] = details
	}
	c.JSON(statusCode, response)
}

// findCheckbookByID unified checkbook query function
func findCheckbookByID(checkbookID string) (*models.Checkbook, error) {
	var checkbook models.Checkbook
	err := db.DB.Where("id = ?", checkbookID).First(&checkbook).Error
	return &checkbook, err
}

// findCheckbookByChainAndDeposit unified checkbook query function (by chain ID and deposit ID)
func findCheckbookByChainAndDeposit(chainID string, localDepositID string) (*models.Checkbook, error) {
	var checkbook models.Checkbook
	err := db.DB.Where("chain_id = ? AND local_deposit_id = ?", chainID, localDepositID).First(&checkbook).Error
	return &checkbook, err
}

// UpdateCheckbookStatusSafely unified status update function with push service
// TODO: In Phase 4, inject push service via dependency injection
func UpdateCheckbookStatusSafely(checkbookID string, status models.CheckbookStatus, context string) error {
	// Temporarily fallback: only update database
	// In Phase 4, this will use injected DatabaseWithPushService
	return db.DB.Model(&models.Checkbook{}).Where("id = ?", checkbookID).Update("status", status).Error
}

// logError unified error logging function
func logError(operation, message string, err error) {
	log.Printf("❌ [V2] %s: %s: %v", operation, message, err)
}

// logSuccess unified success logging function
func logSuccess(operation, message string, args ...interface{}) {
	log.Printf("✅ [V2] %s: %s", operation, fmt.Sprintf(message, args...))
}

// validateCheckbookStatus unified checkbook status verification function
func validateCheckbookStatus(checkbook *models.Checkbook, allowedStatuses []models.CheckbookStatus) error {
	for _, allowedStatus := range allowedStatuses {
		if checkbook.Status == allowedStatus {
			return nil
		}
	}
	return fmt.Errorf("invalid checkbook status: current=%s, allowed=%v", checkbook.Status, allowedStatuses)
}

// updateCheckbookWithPush unified checkbook update function with push
// TODO: In Phase 4, inject push service via dependency injection
func updateCheckbookWithPush(checkbookID string, updates map[string]interface{}, context string) error {
	// Temporarily fallback: only update database
	// In Phase 4, this will use injected DatabaseWithPushService
	return db.DB.Model(&models.Checkbook{}).Where("id = ?", checkbookID).Updates(updates).Error
}

// findCheckByID unified check query function
func findCheckByID(checkID string) (*models.Check, error) {
	var check models.Check
	err := db.DB.Where("id = ?", checkID).First(&check).Error
	return &check, err
}

// updateCheckStatusWithPush unified check status update function with push
// TODO: In Phase 4, inject push service via dependency injection
func updateCheckStatusWithPush(checkID string, status models.CheckStatus, context string) error {
	// Temporarily fallback: only update database
	// In Phase 4, this will use injected DatabaseWithPushService
	return db.DB.Model(&models.Check{}).Where("id = ?", checkID).Updates(map[string]interface{}{
		"status":     status,
		"updated_at": time.Now(),
	}).Error
}

// validateRequestBinding unified request binding validation function
func validateRequestBinding(c *gin.Context, req interface{}, operation string) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		logError(operation, "request parameter validation failed", err)
		respondWithError(c, http.StatusBadRequest, "Invalid request parameters", "", err)
		return false
	}
	return true
}

// CalculateWithdrawalStatus withdraw status summary for user-friendly display
func CalculateWithdrawalStatus(statusCounts map[string]int) map[string]interface{} {
	totalChecks := 0
	for _, count := range statusCounts {
		totalChecks += count
	}

	if totalChecks == 0 {
		return map[string]interface{}{
			"status":         "no_withdrawals",
			"message":        "No withdrawal checks generated yet",
			"total_checks":   0,
			"ready_to_claim": 0,
		}
	}

	// Count different categories
	readyCount := statusCounts["proved"] + statusCounts["completed"]
	pendingCount := statusCounts["pending"] + statusCounts["processing"]
	failedCount := statusCounts["proof_failed"] + statusCounts["submission_failed"]

	var overallStatus string
	var message string

	if readyCount == totalChecks {
		overallStatus = "all_ready"
		message = "All withdrawal checks are ready to claim"
	} else if failedCount > 0 {
		overallStatus = "partially_failed"
		message = fmt.Sprintf("%d checks ready, %d failed, %d pending", readyCount, failedCount, pendingCount)
	} else if readyCount > 0 {
		overallStatus = "partially_ready"
		message = fmt.Sprintf("%d checks ready, %d pending", readyCount, pendingCount)
	} else {
		overallStatus = "processing"
		message = "Withdrawal checks are being generated"
	}

	return map[string]interface{}{
		"status":         overallStatus,
		"message":        message,
		"total_checks":   totalChecks,
		"ready_to_claim": readyCount,
		"pending":        pendingCount,
		"failed":         failedCount,
		"status_details": statusCounts,
	}
}
