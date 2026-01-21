package services

import (
	"fmt"
	"go-backend/internal/clients"
	"go-backend/internal/utils"
	"log"
	"sync"
	"time"

	"go-backend/internal/models"

	"gorm.io/gorm"
)

// unified polling service
type UnifiedPollingService struct {
	db            *gorm.DB
	blockchains   map[uint32]models.BlockchainClientInterface // clients for each chain
	pushService   *WebSocketPushService
	scannerClient *clients.BlockchainScannerClient
	running       bool
	stopCh        chan struct{}
	mutex         sync.RWMutex
	batchSize     int           // batch processing task count
	pollInterval  time.Duration // main polling interval
}

// Createunified polling service
func NewUnifiedPollingService(db *gorm.DB, pushService *WebSocketPushService, scannerClient *clients.BlockchainScannerClient) *UnifiedPollingService {
	return &UnifiedPollingService{
		db:            db,
		blockchains:   make(map[uint32]models.BlockchainClientInterface),
		pushService:   pushService,
		scannerClient: scannerClient,
		stopCh:        make(chan struct{}),
		batchSize:     10,
		pollInterval:  5 * time.Second,
	}
}

// blockchainclient
func (s *UnifiedPollingService) RegisterBlockchainClient(chainID uint32, client models.BlockchainClientInterface) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.blockchains[chainID] = client
	log.Printf("📋 Registered blockchain client for chain %d", chainID)
}

// getBlockchainClient 获取区块链客户端，支持 SLIP44 ID 和 EVM Chain ID 的自动转换
// 首先尝试直接用 chainID 查找，如果找不到，尝试转换后再查找
func (s *UnifiedPollingService) getBlockchainClient(chainID uint32) (models.BlockchainClientInterface, bool) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	// 首先尝试直接用 chainID 查找
	if client, exists := s.blockchains[chainID]; exists {
		return client, true
	}

	// 如果找不到，尝试将 EVM Chain ID 转换为 SLIP44 ID
	slip44ID, err := utils.GlobalChainIDMapping.EVMToSLIP44(chainID)
	if err == nil {
		if client, exists := s.blockchains[slip44ID]; exists {
			log.Printf("🔍 [getBlockchainClient] Found client using SLIP44 ID %d (from EVM ID %d)", slip44ID, chainID)
			return client, true
		}
	}

	// 如果还找不到，尝试将 SLIP44 ID 转换为 EVM Chain ID
	evmID, err := utils.GlobalChainIDMapping.SLIP44ToEVM(chainID)
	if err == nil {
		if client, exists := s.blockchains[evmID]; exists {
			log.Printf("🔍 [getBlockchainClient] Found client using EVM ID %d (from SLIP44 ID %d)", evmID, chainID)
			return client, true
		}
	}

	return nil, false
}

// Startunified polling service
func (s *UnifiedPollingService) Start() {
	s.mutex.Lock()
	if s.running {
		s.mutex.Unlock()
		return
	}
	s.running = true
	s.mutex.Unlock()

	log.Printf("🚀 Starting unified polling service...")

	// notcompleted
	go s.recoverPendingTasks()

	// Startpolling
	go s.pollTaskLoop()

	// Startstatus
	go s.syncWithScannerLoop()

	log.Printf("✅ Unified polling service started")
}

// stoppollingservice
func (s *UnifiedPollingService) Stop() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if !s.running {
		return
	}

	s.running = false
	close(s.stopCh)
	log.Printf("🛑 Unified polling service stopped")
}

// notcompletedpolling
func (s *UnifiedPollingService) recoverPendingTasks() {
	log.Printf("🔄 Recovering pending polling tasks...")

	// timeoutFailed
	result := s.db.Model(&models.PollingTask{}).
		Where("status = ? AND started_at < ?", models.PollingTaskStatusRunning, time.Now().Add(-10*time.Minute)).
		Updates(map[string]interface{}{
			"status":     models.PollingTaskStatusFailed,
			"last_error": "Task timeout during recovery",
		})

	if result.Error != nil {
		log.Printf("❌ Failed to recover timeout tasks: %v", result.Error)
	} else if result.RowsAffected > 0 {
		log.Printf("⚠️ Marked %d timeout tasks as failed", result.RowsAffected)
	}

	// Failedandprocess
	result = s.db.Model(&models.PollingTask{}).
		Where("status IN ? AND retry_count < max_retries", []models.PollingTaskStatus{
			models.PollingTaskStatusFailed,
			models.PollingTaskStatusCancelled,
		}).
		Updates(map[string]interface{}{
			"status":       models.PollingTaskStatusPending,
			"next_poll_at": time.Now().Add(10 * time.Second),
		})

	if result.Error != nil {
		log.Printf("❌ Failed to recover failed tasks: %v", result.Error)
	} else if result.RowsAffected > 0 {
		log.Printf("🔄 Recovered %d failed tasks for retry", result.RowsAffected)
	}

	log.Printf("✅ Task recovery completed")
}

// polling
func (s *UnifiedPollingService) pollTaskLoop() {
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.processPendingTasks()
		case <-s.stopCh:
			return
		}
	}
}

// processpolling
func (s *UnifiedPollingService) processPendingTasks() {
	tasks := s.getReadyTasks(s.batchSize)
	if len(tasks) == 0 {
		return
	}

	// 只在处理大量任务时输出日志，减少日志量
	if len(tasks) >= 5 {
		log.Printf("📋 Processing %d pending polling tasks", len(tasks))
	}

	var wg sync.WaitGroup
	for _, task := range tasks {
		wg.Add(1)
		go func(t *models.PollingTask) {
			defer wg.Done()
			s.executePollingTask(t)
		}(task)
	}
	wg.Wait()
}

// Get
func (s *UnifiedPollingService) getReadyTasks(limit int) []*models.PollingTask {
	var tasks []*models.PollingTask

	err := s.db.Where("status = ? AND next_poll_at <= ?", models.PollingTaskStatusPending, time.Now()).
		Order("next_poll_at ASC").
		Limit(limit).
		Find(&tasks).Error

	if err != nil {
		log.Printf("❌ Failed to get ready tasks: %v", err)
		return nil
	}

	// ，
	for _, task := range tasks {
		now := time.Now()
		s.db.Model(task).Updates(map[string]interface{}{
			"status":     models.PollingTaskStatusRunning,
			"started_at": &now,
		})
	}

	return tasks
}

// polling
func (s *UnifiedPollingService) executePollingTask(task *models.PollingTask) {
	// 只在第一次执行或每10次重试时输出日志，减少日志量
	if task.RetryCount == 0 || task.RetryCount%10 == 0 {
		log.Printf("🔍 Executing polling task: %s, type: %s, entity: %s, retry: %d/%d", 
			task.ID, task.TaskType, task.EntityID, task.RetryCount, task.MaxRetries)
	}

	success := false
	var err error

	switch task.TaskType {
	case models.PollingDepositBusinessChain:
		success, err = s.pollDepositBusinessChain(task)
	case models.PollingDepositManagementChain:
		success, err = s.pollDepositManagementChain(task)
	case models.PollingCommitmentSubmission:
		success, err = s.pollCommitmentSubmission(task)
	case models.PollingCommitmentConfirmation:
		success, err = s.pollCommitmentConfirmation(task)
	case models.PollingWithdrawSubmission:
		success, err = s.pollWithdrawSubmission(task)
	case models.PollingWithdrawManagement:
		success, err = s.pollWithdrawManagement(task)
	case models.PollingWithdrawCrossChain:
		success, err = s.pollWithdrawCrossChain(task)
	case models.PollingWithdrawExecute:
		success, err = s.pollWithdrawExecute(task)
	default:
		err = fmt.Errorf("unknown task type: %s", task.TaskType)
	}

	// Updatestatus
	s.updateTaskResult(task, success, err)
}

// Update
func (s *UnifiedPollingService) updateTaskResult(task *models.PollingTask, success bool, err error) {
	now := time.Now()
	updates := map[string]interface{}{
		"retry_count": task.RetryCount + 1,
	}

	if success {
		// Successcompleted
		updates["status"] = models.PollingTaskStatusCompleted
		updates["completed_at"] = &now
		log.Printf("✅ Polling task completed: %s", task.ID)
	} else {
		// Failed
		if err != nil {
			updates["last_error"] = err.Error()
		}

		if task.RetryCount+1 >= task.MaxRetries {
			// reached maximum retry attempts，Failed
			updates["status"] = models.PollingTaskStatusFailed
			updates["completed_at"] = &now
			log.Printf("❌ Polling task failed after max retries: %s, error: %v", task.ID, err)

			// notificationFailed
			s.notifyTaskFailed(task, err)
		} else {
			// continueretry
			updates["status"] = models.PollingTaskStatusPending
			updates["next_poll_at"] = s.calculateNextPollTime(task.RetryCount + 1)
			// 只在每10次重试时输出日志，减少日志量
			nextRetry := task.RetryCount + 1
			if nextRetry%10 == 0 || nextRetry == 1 {
				log.Printf("⏳ Polling task will retry: %s, attempt: %d/%d", task.ID, nextRetry, task.MaxRetries)
			}
		}
	}

	if dbErr := s.db.Model(task).Updates(updates).Error; dbErr != nil {
		log.Printf("❌ Failed to update task status: %v", dbErr)
	}
}

// next timepolling（）
func (s *UnifiedPollingService) calculateNextPollTime(retryCount int) time.Time {
	delay := 10 * time.Second // Default10seconds

	// ：5Failed
	if retryCount > 5 {
		multiplier := (retryCount-5)/5 + 1
		if multiplier > 6 { // 6
			multiplier = 6
		}
		delay = delay * time.Duration(multiplier)
	}

	return time.Now().Add(delay)
}

// pollingdepositconfirm
func (s *UnifiedPollingService) pollDepositBusinessChain(task *models.PollingTask) (bool, error) {
	client, exists := s.getBlockchainClient(task.ChainID)
	if !exists {
		return false, fmt.Errorf("blockchain client not found for chain %d", task.ChainID)
	}

	// Checkstatus
	txStatus, err := client.CheckTransactionStatus(task.TxHash)
	if err != nil {
		return false, fmt.Errorf("failed to check transaction status: %w", err)
	}

	if !txStatus.Exists {
		return false, nil // exists，continuepolling
	}

	if !txStatus.Confirmed {
		return false, nil // notconfirm，continuepolling
	}

	if !txStatus.Success {
		// Failed
		s.updateEntityStatus(task.EntityType, task.EntityID, "deposit_failed")
		return true, nil // pollingcompleted（Failed）
	}

	// Successconfirm，Updatestatus
	s.updateEntityStatus(task.EntityType, task.EntityID, task.TargetStatus)
	return true, nil
}

// pollingdepositconfirm
func (s *UnifiedPollingService) pollDepositManagementChain(task *models.PollingTask) (bool, error) {
	// ScannerCheckwhethercorresponding todepositrecord
	// needScanner APIquerydepositevent

	// Checkwhetheralreadydepositrecord
	var checkbook models.Checkbook
	err := s.db.Where("id = ?", task.EntityID).First(&checkbook).Error
	if err != nil {
		return false, fmt.Errorf("failed to get checkbook: %w", err)
	}

	// ifalreadyLocalDepositID，alreadyprocess
	if checkbook.LocalDepositID > 0 {
		s.updateEntityStatus(task.EntityType, task.EntityID, task.TargetStatus)
		return true, nil
	}

	// continuepollingWaitmultisignerprocess
	return false, nil
}

// pollingcommitmentconfirm
func (s *UnifiedPollingService) pollCommitmentSubmission(task *models.PollingTask) (bool, error) {
	return s.pollTransactionConfirmation(task, task.ChainID)
}

// pollingcommitmentconfirm
func (s *UnifiedPollingService) pollCommitmentConfirmation(task *models.PollingTask) (bool, error) {
	// Checkcommitmentwhetherconfirm
	var checkbook models.Checkbook
	err := s.db.Where("id = ?", task.EntityID).First(&checkbook).Error
	if err != nil {
		return false, fmt.Errorf("failed to get checkbook: %w", err)
	}

	client, exists := s.getBlockchainClient(task.ChainID)
	if !exists {
		return false, fmt.Errorf("blockchain client not found for chain %d", task.ChainID)
	}

	commitmentStr := getCommitmentString(checkbook.Commitment)
	commitmentStatus, err := client.CheckCommitmentExists(commitmentStr)
	if err != nil {
		return false, fmt.Errorf("failed to check commitment: %w", err)
	}

	if !commitmentStatus.Exists || !commitmentStatus.Confirmed {
		return false, nil // continuepolling
	}

	// Commitmentalreadyconfirm，Updatestatus
	s.updateEntityStatus(task.EntityType, task.EntityID, task.TargetStatus)
	return true, nil
}

// pollingwithdrawconfirm
func (s *UnifiedPollingService) pollWithdrawSubmission(task *models.PollingTask) (bool, error) {
	return s.pollTransactionConfirmation(task, task.ChainID)
}

// pollingwithdrawconfirm
func (s *UnifiedPollingService) pollWithdrawManagement(task *models.PollingTask) (bool, error) {
	// commitmentconfirm，Checkwithdrawrequestwhetherconfirm
	return s.pollTransactionConfirmation(task, task.ChainID)
}

// pollingwithdrawrequestexecute
// Polling task only handles execute_status = submitting (checking if transaction is confirmed)
// It should NOT update status if execute_status is already success or other final states
func (s *UnifiedPollingService) pollWithdrawExecute(task *models.PollingTask) (bool, error) {
	// First, check if the withdraw request is already in a final status
	// This prevents unnecessary updates and potential conflicts
	var request models.WithdrawRequest
	err := s.db.Where("id = ?", task.EntityID).First(&request).Error
	if err != nil {
		return false, fmt.Errorf("failed to get withdraw request: %w", err)
	}

	// Polling task only handles execute_status = submitting
	// If execute_status is not submitting, skip polling (may have been updated by event listener)
	if request.ExecuteStatus != models.ExecuteStatusSubmitted {
		log.Printf("⚠️ [Polling] Withdraw request %s execute_status=%s (not submitting), skipping polling task. Event listener may have already updated it.",
			task.EntityID, request.ExecuteStatus)
		return true, nil // Complete polling task (no longer needed)
	}

	// If already in final status, complete the polling task
	if s.isFinalStatus("withdraw_request", string(request.ExecuteStatus)) {
		log.Printf("⚠️ [Polling] Withdraw request %s already in final status: %s, completing polling task", 
			task.EntityID, request.ExecuteStatus)
		return true, nil
	}

	client, exists := s.getBlockchainClient(task.ChainID)
	if !exists {
		return false, fmt.Errorf("blockchain client not found for chain %d", task.ChainID)
	}

	txStatus, err := client.CheckTransactionStatus(task.TxHash)
	if err != nil {
		return false, fmt.Errorf("failed to check transaction status: %w", err)
	}

	if !txStatus.Exists {
		return false, nil // Transaction not found yet, continue polling
	}

	if !txStatus.Confirmed {
		return false, nil // Transaction not confirmed yet, continue polling
	}

	// Transaction is confirmed, update status
	if !txStatus.Success {
		// Transaction failed
		s.updateWithdrawRequestExecuteStatus(task.EntityID, string(models.ExecuteStatusVerifyFailed), task.TxHash, txStatus.BlockNumber, "Transaction reverted on-chain")
		return true, nil // Polling completed (Failed)
	}

	// Transaction succeeded
	s.updateWithdrawRequestExecuteStatus(task.EntityID, string(models.ExecuteStatusSuccess), task.TxHash, txStatus.BlockNumber, "")
	return true, nil // Polling completed (Success)
}

// pollingwithdrawcompleted
func (s *UnifiedPollingService) pollWithdrawCrossChain(task *models.PollingTask) (bool, error) {
	// Checkwithdrawwhethertargetcompleted
	client, exists := s.getBlockchainClient(task.ChainID)
	if !exists {
		return false, fmt.Errorf("blockchain client not found for chain %d", task.ChainID)
	}

	// ifhash，Checkstatus
	if task.TxHash != "" {
		txStatus, err := client.CheckTransactionStatus(task.TxHash)
		if err != nil {
			return false, fmt.Errorf("failed to check transaction status: %w", err)
		}

		if txStatus.Exists && txStatus.Confirmed && txStatus.Success {
			s.updateEntityStatus(task.EntityType, task.EntityID, task.TargetStatus)
			return true, nil
		}
	}

	// ornullifierCheck
	var check models.Check
	err := s.db.Where("id = ?", task.EntityID).First(&check).Error
	if err != nil {
		return false, fmt.Errorf("failed to get check: %w", err)
	}

	// Checknullifierwhetherexists，ifemptythenproofnot
	if check.Nullifier == "" {
		return false, nil // nullifier，Check
	}

	nullifierStatus, err := client.CheckNullifierUsed(check.Nullifier)
	if err != nil {
		return false, fmt.Errorf("failed to check nullifier: %w", err)
	}

	if nullifierStatus.Used {
		s.updateEntityStatus(task.EntityType, task.EntityID, task.TargetStatus)
		return true, nil
	}

	return false, nil // continuepolling
}

// confirmpolling
func (s *UnifiedPollingService) pollTransactionConfirmation(task *models.PollingTask, chainID uint32) (bool, error) {
	client, exists := s.getBlockchainClient(chainID)
	if !exists {
		return false, fmt.Errorf("blockchain client not found for chain %d", chainID)
	}

	txStatus, err := client.CheckTransactionStatus(task.TxHash)
	if err != nil {
		return false, fmt.Errorf("failed to check transaction status: %w", err)
	}

	if !txStatus.Exists {
		return false, nil // exists，continuepolling
	}

	if !txStatus.Confirmed {
		return false, nil // notconfirm，continuepolling
	}

	if !txStatus.Success {
		// Failed
		failedStatus := s.getFailedStatus(task.TaskType)
		s.updateEntityStatus(task.EntityType, task.EntityID, failedStatus)
		return true, nil // pollingcompleted（Failed）
	}

	// Successconfirm，Updatestatus
	s.updateEntityStatus(task.EntityType, task.EntityID, task.TargetStatus)
	return true, nil
}

// GetFailedstatus
func (s *UnifiedPollingService) getFailedStatus(taskType models.PollingTaskType) string {
	switch taskType {
	case models.PollingCommitmentSubmission:
		return string(models.CheckbookStatusSubmissionFailed)
	case models.PollingWithdrawSubmission:
		return string(models.CheckStatusSubmissionFailed)
	case models.PollingWithdrawExecute:
		return string(models.ExecuteStatusVerifyFailed)
	default:
		return "failed"
	}
}

// Updatestatus
func (s *UnifiedPollingService) updateEntityStatus(entityType, entityID, newStatus string) {
	switch entityType {
	case "checkbook":
		s.updateCheckbookStatus(entityID, newStatus)
	case "check":
		s.updateCheckStatus(entityID, newStatus)
	case "withdraw_request":
		s.updateWithdrawRequestStatus(entityID, newStatus)
	}
}

// UpdateCheckbookstatus
func (s *UnifiedPollingService) updateCheckbookStatus(checkbookID, newStatus string) {
	var checkbook models.Checkbook
	err := s.db.Where("id = ?", checkbookID).First(&checkbook).Error
	if err != nil {
		log.Printf("❌ Failed to get checkbook %s: %v", checkbookID, err)
		return
	}

	oldStatus := string(checkbook.Status)
	checkbook.Status = models.CheckbookStatus(newStatus)

	err = s.db.Save(&checkbook).Error
	if err != nil {
		log.Printf("❌ Failed to update checkbook status: %v", err)
		return
	}

	log.Printf("✅ Updated checkbook %s status: %s → %s", checkbookID, oldStatus, newStatus)

	// pushstatusUpdate (ifpushservice)
	if s.pushService != nil {
		// UniversalAddressConvert
		userAddressStr := fmt.Sprintf("%d:%s", checkbook.UserAddress.SLIP44ChainID, checkbook.UserAddress.Data)
		s.pushService.BroadcastCheckbookUpdate(userAddressStr, CheckbookStatusUpdateData{
			CheckbookID: checkbookID,
			OldStatus:   oldStatus,
			NewStatus:   newStatus,
		})
	}

	// if，polling
	if s.isFinalStatus("checkbook", newStatus) {
		s.cancelRelatedTasks("checkbook", checkbookID)
	}
}

// UpdateCheckstatus
func (s *UnifiedPollingService) updateCheckStatus(checkID, newStatus string) {
	var check models.Check
	err := s.db.Where("id = ?", checkID).First(&check).Error
	if err != nil {
		log.Printf("❌ Failed to get check %s: %v", checkID, err)
		return
	}

	// GetcheckbookGetuseraddress
	var checkbook models.Checkbook
	err = s.db.Where("id = ?", check.CheckbookID).First(&checkbook).Error
	if err != nil {
		log.Printf("❌ Failed to get checkbook for check %s: %v", checkID, err)
		return
	}

	oldStatus := check.Status
	check.Status = models.AllocationStatus(newStatus)

	err = s.db.Save(&check).Error
	if err != nil {
		log.Printf("❌ Failed to update check status: %v", err)
		return
	}

	log.Printf("✅ Updated check %s status: %s → %s", checkID, oldStatus, newStatus)

	// pushstatusUpdate (ifpushservice)
	if s.pushService != nil {
		// UniversalAddressConvert
		userAddressStr := fmt.Sprintf("%d:%s", checkbook.UserAddress.SLIP44ChainID, checkbook.UserAddress.Data)
		s.pushService.BroadcastCheckUpdate(userAddressStr, CheckStatusUpdateData{
			CheckID:     checkID,
			CheckbookID: check.CheckbookID,
			OldStatus:   string(oldStatus),
			NewStatus:   newStatus,
		})
	}

	// if，polling
	if s.isFinalStatus("check", newStatus) {
		s.cancelRelatedTasks("check", checkID)
	}
}

// UpdateWithdrawRequeststatus
func (s *UnifiedPollingService) updateWithdrawRequestStatus(requestID, newStatus string) {
	s.updateWithdrawRequestExecuteStatus(requestID, newStatus, "", 0, "")
}

// updateWithdrawRequestExecuteStatus updates withdraw request execute status with transaction details
// Uses database transaction to prevent concurrent update conflicts
func (s *UnifiedPollingService) updateWithdrawRequestExecuteStatus(requestID, newStatus, txHash string, blockNumber uint64, errMsg string) {
	// Use transaction to ensure atomicity and prevent deadlocks
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			log.Printf("❌ Panic in updateWithdrawRequestExecuteStatus: %v", r)
		}
	}()

	var request models.WithdrawRequest
	// Use FOR UPDATE to lock the row and prevent concurrent updates
	err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("id = ?", requestID).
		First(&request).Error
	if err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to get withdraw request %s: %v", requestID, err)
		return
	}

	oldStatus := string(request.ExecuteStatus)
	
	// Polling service only updates execute_status from submitting to success/failed
	// If execute_status is not submitting, skip update (may have been updated by event listener)
	if request.ExecuteStatus != models.ExecuteStatusSubmitted {
		tx.Rollback()
		log.Printf("⚠️ [Polling] Withdraw request %s execute_status=%s (not submitting), skipping update. Event listener may have already updated it.", requestID, oldStatus)
		return
	}
	
	// Check if already in final status - avoid unnecessary updates
	if s.isFinalStatus("withdraw_request", oldStatus) {
		tx.Rollback()
		log.Printf("⚠️ [Polling] Withdraw request %s already in final status: %s, skipping update", requestID, oldStatus)
		return
	}

	// Prepare updates
	updates := map[string]interface{}{
		"execute_status": models.ExecuteStatus(newStatus),
	}

	if txHash != "" {
		updates["execute_tx_hash"] = txHash
	}

	if newStatus == string(models.ExecuteStatusSuccess) {
		updates["executed_at"] = gorm.Expr("NOW()")
		if blockNumber > 0 {
			updates["execute_block_number"] = blockNumber
		}
	} else if newStatus == string(models.ExecuteStatusVerifyFailed) || newStatus == string(models.ExecuteStatusSubmitFailed) {
		if errMsg != "" {
			updates["execute_error"] = errMsg
		}
	}

	// Update database within transaction
	err = tx.Model(&request).Updates(updates).Error
	if err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to update withdraw request status: %v", err)
		return
	}

	// Reload to get updated status
	err = tx.Where("id = ?", requestID).First(&request).Error
	if err != nil {
		tx.Rollback()
		log.Printf("⚠️ Failed to reload withdraw request after update: %v", err)
		return
	}

	// Update main status if needed
	request.UpdateMainStatus()
	if err := tx.Save(&request).Error; err != nil {
		tx.Rollback()
		log.Printf("⚠️ Failed to update main status: %v", err)
		return
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		log.Printf("❌ Failed to commit transaction: %v", err)
		return
	}

	log.Printf("✅ Updated withdraw request %s execute_status: %s → %s (txHash=%s, blockNumber=%d)", 
		requestID, oldStatus, newStatus, txHash, blockNumber)

	// Push WebSocket update for WithdrawRequest status change (outside transaction)
	if s.pushService != nil {
		// Reload withdraw request to get latest computed status
		var updatedRequest models.WithdrawRequest
		if err := s.db.Where("id = ?", requestID).First(&updatedRequest).Error; err == nil {
			// Ensure main status is computed correctly (UpdateMainStatus was already called in transaction, but reload to be safe)
			updatedRequest.UpdateMainStatus()
			// Push WebSocket update (no need to save again, just push the update)
			s.pushService.PushWithdrawRequestStatusUpdateDirect(&updatedRequest, oldStatus, "PollingService")
			log.Printf("📡 [Polling] Pushed WebSocket update for withdraw request %s: %s → %s", 
				requestID, oldStatus, updatedRequest.Status)
		} else {
			log.Printf("⚠️ [Polling] Failed to reload withdraw request for WebSocket push: %v", err)
		}
	}

	// Cancel related polling tasks if final status (outside transaction)
	if s.isFinalStatus("withdraw_request", newStatus) {
		s.cancelRelatedTasks("withdraw_request", requestID)
	}
}

// Checkwhether
func (s *UnifiedPollingService) isFinalStatus(entityType, status string) bool {
	switch entityType {
	case "checkbook":
		return status == string(models.CheckbookStatusWithCheckbook) ||
			status == string(models.CheckbookStatusProofFailed) ||
			status == string(models.CheckbookStatusSubmissionFailed)
	case "check":
		return status == string(models.CheckStatusCompleted) ||
			status == string(models.CheckStatusProofFailed) ||
			status == string(models.CheckStatusSubmissionFailed) ||
			status == string(models.CheckStatusCrossChainFailed)
	case "withdraw_request":
		return status == string(models.ExecuteStatusSuccess) ||
			status == string(models.ExecuteStatusVerifyFailed) ||
			status == string(models.ExecuteStatusSubmitFailed)
	}
	return false
}

// polling
func (s *UnifiedPollingService) cancelRelatedTasks(entityType, entityID string) {
	err := s.db.Model(&models.PollingTask{}).
		Where("entity_type = ? AND entity_id = ? AND status IN ?", entityType, entityID, []models.PollingTaskStatus{
			models.PollingTaskStatusPending,
			models.PollingTaskStatusRunning,
		}).
		Update("status", models.PollingTaskStatusCancelled).Error

	if err != nil {
		log.Printf("❌ Failed to cancel related tasks: %v", err)
	} else {
		log.Printf("✅ Cancelled related polling tasks for %s %s", entityType, entityID)
	}
}

// notificationFailed
func (s *UnifiedPollingService) notifyTaskFailed(task *models.PollingTask, err error) {
	// canFailednotification，、record
	log.Printf("⚠️ Task failed notification: task=%s, entity=%s, error=%v", task.ID, task.EntityID, err)

	// canWebSocketpushFailedInfo
	// s.pushService.BroadcastTaskFailed(...)
}

// different fromScannerstatus
func (s *UnifiedPollingService) syncWithScannerLoop() {
	ticker := time.NewTicker(2 * time.Minute) // 2minutes
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.syncWithScanner()
		case <-s.stopCh:
			return
		}
	}
}

// different fromScannerstatus
func (s *UnifiedPollingService) syncWithScanner() {
	// Getcheckbookandcheck
	var checkbooks []models.Checkbook
	var checks []models.Check

	s.db.Where("status NOT IN ?", []string{
		string(models.CheckbookStatusWithCheckbook),
		string(models.CheckbookStatusProofFailed),
		string(models.CheckbookStatusSubmissionFailed),
	}).Find(&checkbooks)

	s.db.Where("status NOT IN ?", []string{
		string(models.CheckStatusCompleted),
		string(models.CheckStatusProofFailed),
		string(models.CheckStatusSubmissionFailed),
		string(models.CheckStatusCrossChainFailed),
	}).Find(&checks)

	// CheckcheckbookScannerstatus
	for _, checkbook := range checkbooks {
		s.syncCheckbookWithScanner(&checkbook)
	}

	// CheckcheckScannerstatus
	for _, check := range checks {
		s.syncCheckWithScanner(&check)
	}
}

// checkbookstatus
func (s *UnifiedPollingService) syncCheckbookWithScanner(checkbook *models.Checkbook) {
	// different fromScanner
	// Scanner API
}

// checkstatus
func (s *UnifiedPollingService) syncCheckWithScanner(check *models.Check) {
	// different fromScanner
	// Scanner API
}

// Createpolling
func (s *UnifiedPollingService) CreatePollingTask(config models.PollingTaskConfig) error {
	// Check if a similar task already exists (to prevent duplicates)
	var existingTask models.PollingTask
	err := s.db.Where("entity_type = ? AND entity_id = ? AND task_type = ? AND status IN ?",
		config.EntityType,
		config.EntityID,
		config.TaskType,
		[]models.PollingTaskStatus{
			models.PollingTaskStatusPending,
			models.PollingTaskStatusRunning,
		},
	).First(&existingTask).Error

	if err == nil {
		// Task already exists, skip creation
		log.Printf("⚠️ Polling task already exists for entity %s (%s), skipping creation. Existing task: %s", 
			config.EntityID, config.EntityType, existingTask.ID)
		return nil
	}

	// If error is not "record not found", it's a real error
	if err != gorm.ErrRecordNotFound {
		return fmt.Errorf("failed to check existing task: %w", err)
	}

	// Calculate initial delay: use shorter delay for first poll to detect failures quickly
	// For withdraw execute tasks, use 2 seconds for first poll (transactions may fail quickly)
	// For other tasks, use 3 seconds for first poll
	initialDelay := 3 * time.Second
	if config.TaskType == models.PollingWithdrawExecute {
		initialDelay = 2 * time.Second // Withdraw execute: check sooner (transactions may fail quickly)
	}

	task := &models.PollingTask{
		ID:            generateTaskID(),
		EntityType:    config.EntityType,
		EntityID:      config.EntityID,
		TaskType:      config.TaskType,
		Status:        models.PollingTaskStatusPending,
		ChainID:       config.ChainID,
		TxHash:        config.TxHash,
		TargetStatus:  config.TargetStatus,
		CurrentStatus: config.CurrentStatus,
		MaxRetries:    config.MaxRetries,
		PollInterval:  config.PollInterval,
		NextPollAt:    time.Now().Add(initialDelay), // Shorter initial delay for faster failure detection
		CreatedAt:     time.Now(),
	}

	if task.MaxRetries == 0 {
		task.MaxRetries = 180 // Default30minutes
	}
	if task.PollInterval == 0 {
		task.PollInterval = 10 // Default10seconds
	}

	err = s.db.Create(task).Error
	if err != nil {
		return fmt.Errorf("failed to create polling task: %w", err)
	}

	log.Printf("✅ Created polling task: %s, type: %s, entity: %s", task.ID, task.TaskType, task.EntityID)
	return nil
}

// GetPollingStatus Getpollingservicestatus
func (s *UnifiedPollingService) GetPollingStatus() map[string]interface{} {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	var activeTaskCount int64
	s.db.Model(&models.PollingTask{}).Where("status = ?", models.PollingTaskStatusRunning).Count(&activeTaskCount)

	var totalTaskCount int64
	s.db.Model(&models.PollingTask{}).Count(&totalTaskCount)

	// Get
	var recentTasks []models.PollingTask
	s.db.Model(&models.PollingTask{}).
		Order("created_at DESC").
		Limit(10).
		Find(&recentTasks)

	return map[string]interface{}{
		"service_running":   s.running,
		"active_tasks":      activeTaskCount,
		"total_tasks":       totalTaskCount,
		"batch_size":        s.batchSize,
		"poll_interval":     s.pollInterval.String(),
		"registered_chains": len(s.blockchains),
		"recent_tasks":      recentTasks,
	}
}

// GetTaskStatus Getstatus
func (s *UnifiedPollingService) GetTaskStatus(taskID string) (*models.PollingTask, error) {
	var task models.PollingTask
	err := s.db.Where("id = ?", taskID).First(&task).Error
	if err != nil {
		return nil, fmt.Errorf("exists: %s", taskID)
	}
	return &task, nil
}

// ListTasksByEntity query
func (s *UnifiedPollingService) ListTasksByEntity(entityType, entityID string) ([]models.PollingTask, error) {
	var tasks []models.PollingTask
	err := s.db.Where("entity_type = ? AND entity_id = ?", entityType, entityID).
		Order("created_at DESC").
		Find(&tasks).Error
	return tasks, err
}

// StopTask stop
func (s *UnifiedPollingService) StopTask(taskID string) error {
	var task models.PollingTask
	err := s.db.Where("id = ?", taskID).First(&task).Error
	if err != nil {
		return fmt.Errorf("exists: %s", taskID)
	}

	if task.Status == models.PollingTaskStatusCompleted ||
		task.Status == models.PollingTaskStatusFailed ||
		task.Status == models.PollingTaskStatusCancelled {
		return fmt.Errorf("alreadystatus: %s", task.Status)
	}

	// Updatestatusstop
	task.Status = models.PollingTaskStatusCancelled
	now := time.Now()
	task.CompletedAt = &now

	err = s.db.Save(&task).Error
	if err != nil {
		return fmt.Errorf("stopfailed: %w", err)
	}

	log.Printf("🛑 alreadystop: ID=%s, EntityType=%s, EntityID=%s",
		taskID, task.EntityType, task.EntityID)

	return nil
}

func generateTaskID() string {
	return fmt.Sprintf("task_%d", time.Now().UnixNano())
}
