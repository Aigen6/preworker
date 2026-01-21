package services

import (
	"fmt"
	"go-backend/internal/models"
	"log"

	"gorm.io/gorm"
)

// DatabaseWithPushService pushdataservice
// CheckbookCheckdatatriggerWebSocketpush
type DatabaseWithPushService struct {
	db          *gorm.DB
	pushService *WebSocketPushService
}

// NewDatabaseWithPushService createpushdataservice
func NewDatabaseWithPushService(db *gorm.DB, pushService *WebSocketPushService) *DatabaseWithPushService {
	return &DatabaseWithPushService{
		db:          db,
		pushService: pushService,
	}
}

// ============ Checkbook ============

// UpdateCheckbook updateCheckbookpush
func (s *DatabaseWithPushService) UpdateCheckbook(checkbookID string, updates map[string]interface{}, context string) error {
	// 2. Get old status before update (for WebSocket push)
	var oldStatus string
	if s.pushService != nil {
		var oldCheckbook models.Checkbook
		if err := s.db.First(&oldCheckbook, "id = ?", checkbookID).Error; err == nil {
			oldStatus = string(oldCheckbook.Status)
		} else {
			oldStatus = "unknown"
		}
	}

	// 1. updatedata
	if err := s.db.Model(&models.Checkbook{}).Where("id = ?", checkbookID).Updates(updates).Error; err != nil {
		log.Printf("❌ [%s] updateCheckbookfailed: %v", context, err)
		return fmt.Errorf("updateCheckbookfailed: %w", err)
	}

	log.Printf("✅ [%s] Checkbookupdatesuccess: ID=%s", context, checkbookID)

	// 3. pushupdate
	if s.pushService != nil {
		// querycheckbook
		var updatedCheckbook models.Checkbook
		if err := s.db.First(&updatedCheckbook, "id = ?", checkbookID).Error; err == nil {
			// Use oldStatus from before update (already fetched above)
			s.pushService.PushCheckbookStatusUpdateDirect(&updatedCheckbook, oldStatus, context)
		}
	}

	return nil
}

// CreateCheckbook createCheckbookpush
func (s *DatabaseWithPushService) CreateCheckbook(checkbook *models.Checkbook, context string) error {
	// 1. createdatarecord
	if err := s.db.Create(checkbook).Error; err != nil {
		log.Printf("❌ [%s] createCheckbookfailed: %v", context, err)
		return fmt.Errorf("createCheckbookfailed: %w", err)
	}

	log.Printf("✅ [%s] Checkbookcreatesuccess: ID=%s", context, checkbook.ID)

	// 2. pushcreatedata
	if s.pushService != nil {
		// checkbook（emptypending）
		s.pushService.PushCheckbookStatusUpdateDirect(checkbook, "pending", context)
	}

	return nil
}

// ============ Check ============

// UpdateCheck updateCheckpush
func (s *DatabaseWithPushService) UpdateCheck(checkID string, updates map[string]interface{}, context string) error {
	// 1. updatedata
	if err := s.db.Model(&models.Check{}).Where("id = ?", checkID).Updates(updates).Error; err != nil {
		log.Printf("❌ [%s] updateCheckfailed: %v", context, err)
		return fmt.Errorf("updateCheckfailed: %w", err)
	}

	log.Printf("✅ [%s] Checkupdate success: ID=%s", context, checkID)

	// 2. pushupdate
	// When Check (Allocation) status changes:
	// - Always push allocation_update (Check is Allocation, AllocationsStore needs update)
	// - If Check is associated with WithdrawRequest, also push withdrawal_update (WithdrawalsStore needs update)
	if s.pushService != nil {
		var updatedCheck models.Check
		if err := s.db.First(&updatedCheck, "id = ?", checkID).Error; err == nil {
			oldStatus := "unknown"
			if oldStatusVal, exists := updates["status"]; exists {
				oldStatus = fmt.Sprintf("%v", oldStatusVal)
			}

			// Always push Allocation update (Check is Allocation)
			s.pushService.PushCheckStatusUpdate(s.db, checkID, oldStatus, context)

			// If Check is associated with WithdrawRequest, also push WithdrawRequest update
			// Get old WithdrawRequest status before pushing update (not Check's oldStatus)
			if updatedCheck.WithdrawRequestID != nil && *updatedCheck.WithdrawRequestID != "" {
				var oldWithdrawRequest models.WithdrawRequest
				oldWithdrawRequestStatus := ""
				if err := s.db.First(&oldWithdrawRequest, "id = ?", *updatedCheck.WithdrawRequestID).Error; err == nil {
					oldWithdrawRequestStatus = oldWithdrawRequest.Status
				}
				s.pushService.PushWithdrawRequestStatusUpdate(s.db, *updatedCheck.WithdrawRequestID, oldWithdrawRequestStatus, context)
			}
		}
	}

	return nil
}

// UpdateCheckStatus updateCheckstatuspush
func (s *DatabaseWithPushService) UpdateCheckStatus(checkID string, newStatus models.AllocationStatus, context string) error {
	updates := map[string]interface{}{
		"status": newStatus,
	}
	log.Printf("✅ [%s] CheckStatus update success: ID=%s, status=%s", context, checkID, newStatus)

	// 2. push status change
	// When Check (Allocation) status changes:
	// - Always push allocation_update (Check is Allocation, AllocationsStore needs update)
	// - Always push checkbook_update (Checkbook's allocations have changed)
	// - If Check is associated with WithdrawRequest, also push withdrawal_update (WithdrawalsStore needs update)
	if s.pushService != nil {
		var updatedCheck models.Check
		if err := s.db.First(&updatedCheck, "id = ?", checkID).Error; err == nil {
			// Always push Allocation update (Check is Allocation)
			s.pushService.PushCheckStatusUpdate(s.db, checkID, "", context)

			// Always push Checkbook update (Checkbook's allocations have changed)
			if updatedCheck.CheckbookID != "" {
				var checkbook models.Checkbook
				if err := s.db.First(&checkbook, "id = ?", updatedCheck.CheckbookID).Error; err == nil {
					s.pushService.PushCheckbookStatusUpdateDirect(&checkbook, string(checkbook.Status), context)
					log.Printf("✅ [%s] Pushed Checkbook update: ID=%s, Status=%s", context, checkbook.ID, checkbook.Status)
				}
			}

			// If Check is associated with WithdrawRequest, also push WithdrawRequest update
			// Get old WithdrawRequest status before pushing update
			if updatedCheck.WithdrawRequestID != nil && *updatedCheck.WithdrawRequestID != "" {
				var oldWithdrawRequest models.WithdrawRequest
				oldStatus := ""
				if err := s.db.First(&oldWithdrawRequest, "id = ?", *updatedCheck.WithdrawRequestID).Error; err == nil {
					oldStatus = oldWithdrawRequest.Status
				}
				s.pushService.PushWithdrawRequestStatusUpdate(s.db, *updatedCheck.WithdrawRequestID, oldStatus, context)
			}
		}
	}
	return s.UpdateCheck(checkID, updates, context)
}

// ============  ============
// ()

// ============  ============
// ()
