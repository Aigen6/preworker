package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"go-backend/internal/models"

	"github.com/ethereum/go-ethereum/common"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TransactionQueueService 交易队列服务
// 确保同一地址的交易按顺序执行，避免 nonce 冲突
type TransactionQueueService struct {
	db                *gorm.DB
	blockchainService *BlockchainTransactionService // 用于实际提交交易
	processingLocks   map[string]*sync.Mutex        // 地址级别的锁：address:chainID -> mutex
	lockMutex         sync.RWMutex                  // 保护 processingLocks 的锁
	stopChan          chan struct{}
	wg                sync.WaitGroup
}

// NewTransactionQueueService 创建交易队列服务
func NewTransactionQueueService(db *gorm.DB, blockchainService *BlockchainTransactionService) *TransactionQueueService {
	return &TransactionQueueService{
		db:                db,
		blockchainService: blockchainService,
		processingLocks:   make(map[string]*sync.Mutex),
		stopChan:          make(chan struct{}),
	}
}

// getOrCreateLock 获取或创建地址级别的锁
func (s *TransactionQueueService) getOrCreateLock(address string, chainID uint32) *sync.Mutex {
	key := fmt.Sprintf("%s:%d", address, chainID)

	s.lockMutex.RLock()
	lock, exists := s.processingLocks[key]
	s.lockMutex.RUnlock()

	if exists {
		return lock
	}

	s.lockMutex.Lock()
	defer s.lockMutex.Unlock()

	// 双重检查
	if lock, exists := s.processingLocks[key]; exists {
		return lock
	}

	lock = &sync.Mutex{}
	s.processingLocks[key] = lock
	return lock
}

// EnqueueCommitment 将 commitment 交易加入队列
func (s *TransactionQueueService) EnqueueCommitment(
	address string,
	chainID uint32,
	checkbookID string,
	commitmentReq *CommitmentRequest,
	priority int,
) (string, error) {
	txData, err := json.Marshal(commitmentReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal commitment request: %w", err)
	}

	pendingTx := &models.PendingTransaction{
		ID:          uuid.New().String(),
		Type:        models.PendingTransactionTypeCommitment,
		Status:      models.PendingTransactionStatusPending,
		Address:     address,
		ChainID:     chainID,
		Nonce:       0, // 将在处理时分配
		TxData:      string(txData),
		CheckbookID: checkbookID,
		RequestID:   checkbookID,
		Priority:    priority,
		MaxRetries:  3,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.db.Create(pendingTx).Error; err != nil {
		return "", fmt.Errorf("failed to enqueue commitment: %w", err)
	}

	log.Printf("✅ [Queue] Commitment enqueued: ID=%s, CheckbookID=%s, Address=%s, ChainID=%d",
		pendingTx.ID, checkbookID, address, chainID)

	// 触发处理（异步）
	go s.processQueueForAddress(address, chainID)

	return pendingTx.ID, nil
}

// EnqueueWithdraw 将 withdraw 交易加入队列
func (s *TransactionQueueService) EnqueueWithdraw(
	address string,
	chainID uint32,
	requestID string,
	checkbookID string,
	checkID string,
	withdrawReq *WithdrawRequest,
	priority int,
) (string, error) {
	txData, err := json.Marshal(withdrawReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal withdraw request: %w", err)
	}

	pendingTx := &models.PendingTransaction{
		ID:          uuid.New().String(),
		Type:        models.PendingTransactionTypeWithdraw,
		Status:      models.PendingTransactionStatusPending,
		Address:     address,
		ChainID:     chainID,
		Nonce:       0, // 将在处理时分配
		TxData:      string(txData),
		CheckbookID: checkbookID,
		CheckID:     checkID,
		RequestID:   requestID,
		Priority:    priority,
		MaxRetries:  3,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.db.Create(pendingTx).Error; err != nil {
		return "", fmt.Errorf("failed to enqueue withdraw: %w", err)
	}

	log.Printf("✅ [Queue] Withdraw enqueued: ID=%s, RequestID=%s, Address=%s, ChainID=%d",
		pendingTx.ID, requestID, address, chainID)

	// 触发处理（异步）
	go s.processQueueForAddress(address, chainID)

	return pendingTx.ID, nil
}

// processQueueForAddress 处理指定地址的队列
func (s *TransactionQueueService) processQueueForAddress(address string, chainID uint32) {
	lock := s.getOrCreateLock(address, chainID)
	lock.Lock()
	defer lock.Unlock()

	// 查找下一个待处理的交易（按优先级和创建时间排序）
	var pendingTx models.PendingTransaction
	err := s.db.Where("address = ? AND chain_id = ? AND status = ?", address, chainID, models.PendingTransactionStatusPending).
		Order("priority ASC, created_at ASC").
		First(&pendingTx).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// 没有待处理的交易
			return
		}
		log.Printf("❌ [Queue] Failed to query pending transaction: %v", err)
		return
	}

	// 更新状态为 processing
	if err := s.db.Model(&pendingTx).Update("status", models.PendingTransactionStatusProcessing).Error; err != nil {
		log.Printf("❌ [Queue] Failed to update status to processing: %v", err)
		return
	}

	log.Printf("🔄 [Queue] Processing transaction: ID=%s, Type=%s, Address=%s",
		pendingTx.ID, pendingTx.Type, address)

	// 处理交易
	if err := s.processTransaction(&pendingTx); err != nil {
		log.Printf("❌ [Queue] Failed to process transaction %s: %v", pendingTx.ID, err)
		// 更新状态为 failed，等待重试
		s.markAsFailed(&pendingTx, err.Error())
		return
	}

	// 处理完成后，继续处理下一个
	go s.processQueueForAddress(address, chainID)
}

// processTransaction 处理单个交易
func (s *TransactionQueueService) processTransaction(pendingTx *models.PendingTransaction) error {
	if s.blockchainService == nil {
		return fmt.Errorf("blockchain service not set")
	}

	// 解析交易数据
	var txHash string

	switch pendingTx.Type {
	case models.PendingTransactionTypeCommitment:
		var req CommitmentRequest
		if err := json.Unmarshal([]byte(pendingTx.TxData), &req); err != nil {
			return fmt.Errorf("failed to unmarshal commitment request: %w", err)
		}

		// 直接调用内部提交方法（避免循环调用队列）
		resp, err := s.blockchainService.submitCommitmentDirect(&req)
		if err != nil {
			return fmt.Errorf("failed to submit commitment: %w", err)
		}
		txHash = resp.TxHash

	case models.PendingTransactionTypeWithdraw:
		var req WithdrawRequest
		if err := json.Unmarshal([]byte(pendingTx.TxData), &req); err != nil {
			return fmt.Errorf("failed to unmarshal withdraw request: %w", err)
		}

		// 确保 recipient 有 0x 前缀且是 32 字节格式（66 字符：0x + 64 hex）
		recipient := req.Recipient
		// 移除可能存在的 0x 前缀，统一处理
		recipient = strings.TrimPrefix(recipient, "0x")
		// 补齐到 32 字节（64 hex chars）
		if len(recipient) < 64 {
			recipient = strings.Repeat("0", 64-len(recipient)) + recipient
		} else if len(recipient) > 64 {
			// 如果超过 64 字符，截取后 64 个字符
			recipient = recipient[len(recipient)-64:]
		}
		// 添加 0x 前缀
		req.Recipient = "0x" + recipient

		// 直接调用内部提交方法（避免循环调用队列）
		resp, err := s.blockchainService.submitWithdrawDirect(&req)
		if err != nil {
			// 更新 withdraw request 状态为 submit_failed
			if pendingTx.RequestID != "" {
				if updateErr := s.updateWithdrawRequestStatus(pendingTx.RequestID, models.ExecuteStatusSubmitFailed, err.Error()); updateErr != nil {
					log.Printf("⚠️ [Queue] Failed to update withdraw request status: %v", updateErr)
				}
			}
			return fmt.Errorf("failed to submit withdraw: %w", err)
		}
		txHash = resp.TxHash
	default:
		return fmt.Errorf("unknown transaction type: %s", pendingTx.Type)
	}

	// 更新状态为 submitted
	now := time.Now()
	if err := s.db.Model(pendingTx).Updates(map[string]interface{}{
		"status":       models.PendingTransactionStatusSubmitted,
		"tx_hash":      txHash,
		"submitted_at": &now,
		"updated_at":   time.Now(),
	}).Error; err != nil {
		return fmt.Errorf("failed to update status to submitted: %w", err)
	}

	log.Printf("✅ [Queue] Transaction submitted: ID=%s, TxHash=%s", pendingTx.ID, txHash)
	return nil
}

// markAsFailed 标记交易为失败
func (s *TransactionQueueService) markAsFailed(pendingTx *models.PendingTransaction, errorMsg string) {
	pendingTx.RetryCount++
	pendingTx.LastError = errorMsg
	pendingTx.Status = models.PendingTransactionStatusPending

	if pendingTx.RetryCount >= pendingTx.MaxRetries {
		pendingTx.Status = models.PendingTransactionStatusFailed
	} else {
		// 计算下次重试时间（指数退避）
		delay := time.Duration(1<<uint(pendingTx.RetryCount)) * 10 * time.Second
		if delay > 10*time.Minute {
			delay = 10 * time.Minute
		}
		nextRetry := time.Now().Add(delay)
		pendingTx.NextRetryAt = &nextRetry
	}

	s.db.Save(pendingTx)
}

// updateWithdrawRequestStatus 更新 withdraw request 的状态
func (s *TransactionQueueService) updateWithdrawRequestStatus(requestID string, executeStatus models.ExecuteStatus, errorMsg string) error {
	// 更新 execute_status
	updates := map[string]interface{}{
		"execute_status": executeStatus,
		"updated_at":     time.Now(),
	}
	if errorMsg != "" {
		updates["last_error"] = errorMsg
	}

	if err := s.db.Model(&models.WithdrawRequest{}).
		Where("id = ?", requestID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to update withdraw request status: %w", err)
	}

	// 更新主状态
	var request models.WithdrawRequest
	if err := s.db.Where("id = ?", requestID).First(&request).Error; err != nil {
		return fmt.Errorf("failed to query withdraw request: %w", err)
	}

	request.UpdateMainStatus()
	if err := s.db.Model(&request).Update("status", request.Status).Error; err != nil {
		return fmt.Errorf("failed to update main status: %w", err)
	}

	// 更新所有关联的 Check 状态
	if err := s.updateChecksStatusForWithdrawRequest(requestID, executeStatus); err != nil {
		log.Printf("⚠️ [Queue] Failed to update Checks status: %v", err)
		// 不返回错误，因为 WithdrawRequest 状态已经更新成功
	}

	log.Printf("✅ [Queue] Updated withdraw request status: ID=%s, ExecuteStatus=%s", requestID, executeStatus)
	return nil
}

// updateChecksStatusForWithdrawRequest 更新与 WithdrawRequest 关联的所有 Check 状态
func (s *TransactionQueueService) updateChecksStatusForWithdrawRequest(requestID string, executeStatus models.ExecuteStatus) error {
	// 查找所有关联的 Checks
	var checks []models.Check
	if err := s.db.Where("withdraw_request_id = ?", requestID).Find(&checks).Error; err != nil {
		return fmt.Errorf("failed to query checks: %w", err)
	}

	if len(checks) == 0 {
		log.Printf("⚠️ [Queue] No checks found for WithdrawRequest ID=%s", requestID)
		return nil
	}

	log.Printf("🔄 [Queue] Updating %d checks for WithdrawRequest ID=%s, ExecuteStatus=%s", len(checks), requestID, executeStatus)

	// 根据 executeStatus 决定 Check 的状态
	switch executeStatus {
	case models.ExecuteStatusSubmitFailed:
		// submit_failed：网络/RPC 错误，可以重试，Check 保持 pending 状态
		log.Printf("ℹ️ [Queue] ExecuteStatus=submit_failed, Checks remain in pending status (can retry)")
		// 不需要更新 Check 状态，保持 pending

	case models.ExecuteStatusVerifyFailed:
		// verify_failed：Proof 无效或 nullifier 已使用，不可重试，Check 回退到 idle
		log.Printf("🔄 [Queue] ExecuteStatus=verify_failed, releasing Checks back to idle status")
		checkIDs := make([]string, 0, len(checks))
		for _, check := range checks {
			checkIDs = append(checkIDs, check.ID)
		}

		// 释放 allocations（pending -> idle）
		if err := s.db.Model(&models.Check{}).
			Where("id IN ? AND status = ?", checkIDs, models.AllocationStatusPending).
			Updates(map[string]interface{}{
				"status":              models.AllocationStatusIdle,
				"withdraw_request_id": nil,
				"updated_at":          time.Now(),
			}).Error; err != nil {
			return fmt.Errorf("failed to release allocations: %w", err)
		}

		log.Printf("✅ [Queue] Released %d checks back to idle status", len(checkIDs))

	default:
		// 其他状态（如 success, submitted 等）不需要更新 Check 状态
		log.Printf("ℹ️ [Queue] ExecuteStatus=%s, no Check status update needed", executeStatus)
	}

	return nil
}

// RecoverPendingTransactions 恢复未完成的交易（重启后调用）
func (s *TransactionQueueService) RecoverPendingTransactions() error {
	log.Printf("🔄 [Queue] Recovering pending transactions...")

	// 查找所有 pending、processing 或 submitted 状态的交易
	var pendingTxs []models.PendingTransaction
	if err := s.db.Where("status IN ?", []models.PendingTransactionStatus{
		models.PendingTransactionStatusPending,
		models.PendingTransactionStatusProcessing,
		models.PendingTransactionStatusSubmitted,
	}).Find(&pendingTxs).Error; err != nil {
		return fmt.Errorf("failed to query pending transactions: %w", err)
	}

	log.Printf("📋 [Queue] Found %d pending transactions to recover", len(pendingTxs))

	now := time.Now()
	timeoutDuration := 5 * time.Minute // 超时时间：5分钟

	// 处理每个交易
	for _, tx := range pendingTxs {
		switch tx.Status {
		case models.PendingTransactionStatusSubmitted:
			// Submitted 状态：检查是否已确认
			if tx.SubmittedAt != nil {
				// 立即检查一次交易状态
				if err := s.checkTransactionStatus(&tx); err != nil {
					log.Printf("⚠️ [Queue] Failed to check submitted transaction %s: %v", tx.ID, err)
				}
			}

		case models.PendingTransactionStatusProcessing:
			// Processing 状态：检查是否超时
			elapsed := now.Sub(tx.CreatedAt)
			if elapsed > timeoutDuration {
				// 超时了，检查是否有 txHash（可能提交成功但状态没更新）
				if tx.TxHash != "" {
					// 有 txHash，说明可能已经提交了，更新为 submitted 并检查状态
					log.Printf("⚠️ [Queue] Processing transaction %s has txHash but status is processing, updating to submitted", tx.ID)
					submittedAt := tx.CreatedAt.Add(timeoutDuration / 2) // 假设在中间时间提交的
					s.db.Model(&tx).Updates(map[string]interface{}{
						"status":       models.PendingTransactionStatusSubmitted,
						"submitted_at": &submittedAt,
					})
					// 检查交易状态
					if err := s.checkTransactionStatus(&tx); err != nil {
						log.Printf("⚠️ [Queue] Failed to check transaction %s: %v", tx.ID, err)
					}
				} else {
					// 没有 txHash，说明确实中断了，重置为 pending 等待重试
					log.Printf("⚠️ [Queue] Processing transaction %s timed out without txHash, resetting to pending", tx.ID)
					s.db.Model(&tx).Update("status", models.PendingTransactionStatusPending)
				}
			} else {
				// 未超时，检查是否有 txHash
				if tx.TxHash != "" {
					// 有 txHash 但状态是 processing，可能是状态更新失败，更新为 submitted
					log.Printf("⚠️ [Queue] Processing transaction %s has txHash, updating to submitted", tx.ID)
					now := time.Now()
					s.db.Model(&tx).Updates(map[string]interface{}{
						"status":       models.PendingTransactionStatusSubmitted,
						"submitted_at": &now,
					})
					// 检查交易状态
					if err := s.checkTransactionStatus(&tx); err != nil {
						log.Printf("⚠️ [Queue] Failed to check transaction %s: %v", tx.ID, err)
					}
				} else {
					// 没有 txHash 且未超时，重置为 pending 继续处理
					log.Printf("🔄 [Queue] Processing transaction %s not timed out, resetting to pending", tx.ID)
					s.db.Model(&tx).Update("status", models.PendingTransactionStatusPending)
				}
			}

		case models.PendingTransactionStatusPending:
			// Pending 状态：继续处理即可
		}
	}

	// 按地址分组，为每个地址启动处理
	addressGroups := make(map[string][]models.PendingTransaction)
	for _, tx := range pendingTxs {
		// 只处理 pending 状态的交易（其他状态已经在上面的循环中处理了）
		if tx.Status == models.PendingTransactionStatusPending {
			key := fmt.Sprintf("%s:%d", tx.Address, tx.ChainID)
			addressGroups[key] = append(addressGroups[key], tx)
		}
	}

	// 为每个地址启动处理
	for key, txs := range addressGroups {
		var address string
		var chainID uint32
		fmt.Sscanf(key, "%s:%d", &address, &chainID)
		log.Printf("🔄 [Queue] Recovering %d pending transactions for %s", len(txs), key)
		go s.processQueueForAddress(address, chainID)
	}

	return nil
}

// Start 启动队列服务
func (s *TransactionQueueService) Start() {
	log.Printf("🚀 [Queue] Starting transaction queue service...")

	// 恢复未完成的交易
	if err := s.RecoverPendingTransactions(); err != nil {
		log.Printf("❌ [Queue] Failed to recover pending transactions: %v", err)
	}

	// 启动定期检查任务（处理超时的 submitted 交易）
	s.wg.Add(1)
	go s.periodicCheck()
}

// periodicCheck 定期检查 submitted 状态的交易是否已确认
func (s *TransactionQueueService) periodicCheck() {
	defer s.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			// 检查 submitted 状态的交易（超过1分钟未确认的，需要重新查询状态）
			var submittedTxs []models.PendingTransaction
			oneMinuteAgo := time.Now().Add(-1 * time.Minute)
			if err := s.db.Where("status = ? AND submitted_at < ?", models.PendingTransactionStatusSubmitted, oneMinuteAgo).
				Find(&submittedTxs).Error; err == nil {
				for _, tx := range submittedTxs {
					// 查询链上交易状态
					if err := s.checkTransactionStatus(&tx); err != nil {
						log.Printf("⚠️ [Queue] Failed to check transaction status %s: %v", tx.ID, err)
					}
				}
			}
		}
	}
}

// checkTransactionStatus 检查交易状态
func (s *TransactionQueueService) checkTransactionStatus(pendingTx *models.PendingTransaction) error {
	if pendingTx.TxHash == "" {
		return nil
	}

	if s.blockchainService == nil {
		return fmt.Errorf("blockchain service not set")
	}

	// 获取链客户端
	client, exists := s.blockchainService.GetClient(int(pendingTx.ChainID))
	if !exists {
		return fmt.Errorf("client not found for chain ID %d", pendingTx.ChainID)
	}

	// 查询交易收据
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	txHash := common.HexToHash(pendingTx.TxHash)
	receipt, err := client.TransactionReceipt(ctx, txHash)
	if err != nil {
		// 交易可能还在 pending，继续等待
		return nil
	}

	// 交易已确认
	now := time.Now()
	updates := map[string]interface{}{
		"updated_at": now,
	}

	if receipt.Status == 1 {
		// 成功
		updates["status"] = models.PendingTransactionStatusConfirmed
		updates["confirmed_at"] = &now
		if receipt.BlockNumber != nil {
			blockNum := receipt.BlockNumber.Uint64()
			updates["block_number"] = &blockNum
		}
		log.Printf("✅ [Queue] Transaction confirmed: ID=%s, TxHash=%s", pendingTx.ID, pendingTx.TxHash)
	} else {
		// 失败
		updates["status"] = models.PendingTransactionStatusFailed
		updates["last_error"] = "Transaction reverted"
		log.Printf("❌ [Queue] Transaction failed: ID=%s, TxHash=%s", pendingTx.ID, pendingTx.TxHash)
	}

	return s.db.Model(pendingTx).Updates(updates).Error
}

// Stop 停止队列服务
func (s *TransactionQueueService) Stop() {
	log.Printf("🛑 [Queue] Stopping transaction queue service...")
	close(s.stopChan)
	s.wg.Wait()
	log.Printf("✅ [Queue] Transaction queue service stopped")
}
