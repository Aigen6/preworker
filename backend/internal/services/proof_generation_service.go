package services

import (
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/models"
	"go-backend/internal/types"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ProofGenerationService ZKVM 证明生成异步服务
type ProofGenerationService struct {
	db            *gorm.DB
	zkvmClient    *clients.ZKVMClient
	blockchainService *BlockchainTransactionService
	processingTasks map[string]bool // 正在处理的任务ID
	taskMutex      sync.RWMutex
	stopChan       chan struct{}
	wg             sync.WaitGroup
	webSocketPushService *WebSocketPushService
}

// NewProofGenerationService 创建证明生成服务
func NewProofGenerationService(
	db *gorm.DB,
	zkvmClient *clients.ZKVMClient,
	blockchainService *BlockchainTransactionService,
	webSocketPushService *WebSocketPushService,
) *ProofGenerationService {
	return &ProofGenerationService{
		db:                  db,
		zkvmClient:          zkvmClient,
		blockchainService:  blockchainService,
		processingTasks:    make(map[string]bool),
		stopChan:           make(chan struct{}),
		webSocketPushService: webSocketPushService,
	}
}

// Start 启动服务
func (s *ProofGenerationService) Start() {
	log.Printf("🚀 [ProofGenerationService] Starting proof generation service...")
	
	// 启动工作协程
	s.wg.Add(1)
	go s.processTasks()
	
	// 恢复未完成的任务
	if err := s.recoverPendingTasks(); err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to recover pending tasks: %v", err)
	}
	
	log.Printf("✅ [ProofGenerationService] Proof generation service started")
}

// Stop 停止服务
func (s *ProofGenerationService) Stop() {
	log.Printf("🛑 [ProofGenerationService] Stopping proof generation service...")
	close(s.stopChan)
	s.wg.Wait()
	log.Printf("✅ [ProofGenerationService] Proof generation service stopped")
}

// SubmissionContext 提交上下文（用于后续区块链提交）
type SubmissionContext struct {
	ChainID           int    `json:"chain_id"`
	DepositID         int64  `json:"deposit_id"`
	TokenKey          string `json:"token_key"`
	AllocatableAmount string `json:"allocatable_amount"`
}

// WithdrawSubmissionContext 提现提交上下文（用于后续链上提交）
type WithdrawSubmissionContext struct {
	ChainID           int    `json:"chain_id"`
	CheckbookID       string `json:"checkbook_id"`
	CheckID           string `json:"check_id"`
	WithdrawRequestID string `json:"withdraw_request_id"`
	TokenKey          string `json:"token_key"`
	Recipient         string `json:"recipient"`
	Amount            string `json:"amount"`
	NullifierHash     string `json:"nullifier_hash"`
	QueueRoot         string `json:"queue_root"`
}

// EnqueueProofGeneration 将证明生成任务加入队列
func (s *ProofGenerationService) EnqueueProofGeneration(
	checkbookID string,
	zkvmReq *clients.BuildCommitmentRequest,
	submissionContext *SubmissionContext,
	priority int,
) (string, error) {
	// 序列化 ZKVM 请求
	taskData, err := json.Marshal(zkvmReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal ZKVM request: %w", err)
	}

	// 序列化提交上下文
	var submissionContextData string
	if submissionContext != nil {
		contextData, err := json.Marshal(submissionContext)
		if err != nil {
			return "", fmt.Errorf("failed to marshal submission context: %w", err)
		}
		submissionContextData = string(contextData)
	}

	task := &models.ProofGenerationTask{
		ID:                uuid.New().String(),
		Status:            models.ProofGenerationTaskStatusPending,
		CheckbookID:       checkbookID,
		TaskData:          string(taskData),
		SubmissionContext: submissionContextData,
		Priority:          priority,
		MaxRetries:        3,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	if err := s.db.Create(task).Error; err != nil {
		return "", fmt.Errorf("failed to enqueue proof generation task: %w", err)
	}

	log.Printf("✅ [ProofGenerationService] Proof generation task enqueued: ID=%s, CheckbookID=%s",
		task.ID, checkbookID)

	// 触发处理（异步）
	go s.processTask(task.ID)

	return task.ID, nil
}

// EnqueueWithdrawProofGeneration 将提现证明生成任务加入队列
func (s *ProofGenerationService) EnqueueWithdrawProofGeneration(
	withdrawRequestID string,
	zkvmReq *clients.WithdrawProofRequest,
	submissionContext *WithdrawSubmissionContext,
	priority int,
) (string, error) {
	// 序列化 ZKVM 请求
	taskData, err := json.Marshal(zkvmReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal ZKVM request: %w", err)
	}

	// 序列化提交上下文
	var submissionContextData string
	if submissionContext != nil {
		contextData, err := json.Marshal(submissionContext)
		if err != nil {
			return "", fmt.Errorf("failed to marshal submission context: %w", err)
		}
		submissionContextData = string(contextData)
	}

	task := &models.WithdrawProofGenerationTask{
		ID:                uuid.New().String(),
		Status:            models.WithdrawProofTaskStatusPending,
		WithdrawRequestID: withdrawRequestID,
		TaskData:          string(taskData),
		SubmissionContext: submissionContextData,
		Priority:          priority,
		MaxRetries:        3,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	if err := s.db.Create(task).Error; err != nil {
		return "", fmt.Errorf("failed to enqueue withdraw proof generation task: %w", err)
	}

	log.Printf("✅ [ProofGenerationService] Withdraw proof generation task enqueued: ID=%s, WithdrawRequestID=%s",
		task.ID, withdrawRequestID)

	// 触发处理（异步）
	go s.processWithdrawProofTask(task.ID)

	return task.ID, nil
}

// processTasks 处理任务的主循环
func (s *ProofGenerationService) processTasks() {
	defer s.wg.Done()

	ticker := time.NewTicker(5 * time.Second) // 每5秒检查一次
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			// 查找待处理的 commitment 证明生成任务
			var commitmentTasks []models.ProofGenerationTask
			if err := s.db.Where("status = ?", models.ProofGenerationTaskStatusPending).
				Where("(next_retry_at IS NULL OR next_retry_at <= ?)", time.Now()).
				Order("priority ASC, created_at ASC").
				Limit(10).
				Find(&commitmentTasks).Error; err != nil {
				log.Printf("❌ [ProofGenerationService] Failed to query pending commitment tasks: %v", err)
			} else {
				for _, task := range commitmentTasks {
					s.taskMutex.RLock()
					processing := s.processingTasks[task.ID]
					s.taskMutex.RUnlock()

					if !processing {
						go s.processTask(task.ID)
					}
				}
			}

			// 查找待处理的提现证明生成任务
			var withdrawTasks []models.WithdrawProofGenerationTask
			if err := s.db.Where("status = ?", models.WithdrawProofTaskStatusPending).
				Where("(next_retry_at IS NULL OR next_retry_at <= ?)", time.Now()).
				Order("priority ASC, created_at ASC").
				Limit(10).
				Find(&withdrawTasks).Error; err != nil {
				log.Printf("❌ [ProofGenerationService] Failed to query pending withdraw tasks: %v", err)
			} else {
				for _, task := range withdrawTasks {
					s.taskMutex.RLock()
					processing := s.processingTasks[task.ID]
					s.taskMutex.RUnlock()

					if !processing {
						go s.processWithdrawProofTask(task.ID)
					}
				}
			}
		}
	}
}

// processTask 处理单个任务
func (s *ProofGenerationService) processTask(taskID string) {
	// 标记为正在处理
	s.taskMutex.Lock()
	if s.processingTasks[taskID] {
		s.taskMutex.Unlock()
		return
	}
	s.processingTasks[taskID] = true
	s.taskMutex.Unlock()

	defer func() {
		s.taskMutex.Lock()
		delete(s.processingTasks, taskID)
		s.taskMutex.Unlock()
	}()

	// 查询任务
	var task models.ProofGenerationTask
	if err := s.db.Where("id = ?", taskID).First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return
		}
		log.Printf("❌ [ProofGenerationService] Failed to query task %s: %v", taskID, err)
		return
	}

	// 更新状态为 processing
	now := time.Now()
	if err := s.db.Model(&task).Updates(map[string]interface{}{
		"status":     models.ProofGenerationTaskStatusProcessing,
		"started_at":  &now,
		"updated_at": time.Now(),
	}).Error; err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to update task status: %v", err)
		return
	}

	log.Printf("🔄 [ProofGenerationService] Processing task: ID=%s, CheckbookID=%s",
		task.ID, task.CheckbookID)

	// 解析 ZKVM 请求
	var zkvmReq clients.BuildCommitmentRequest
	if err := json.Unmarshal([]byte(task.TaskData), &zkvmReq); err != nil {
		s.markAsFailed(&task, fmt.Sprintf("failed to unmarshal ZKVM request: %v", err))
		return
	}

	// 调用 ZKVM 服务
	zkvmResp, err := s.zkvmClient.BuildCommitment(&zkvmReq)
	if err != nil {
		log.Printf("❌ [ProofGenerationService] ZKVM service call failed: %v", err)
		s.markAsFailed(&task, fmt.Sprintf("ZKVM service call failed: %v", err))
		return
	}

	if !zkvmResp.Success {
		errorMsg := "Unknown error"
		if zkvmResp.ErrorMessage != nil {
			errorMsg = *zkvmResp.ErrorMessage
		}
		log.Printf("❌ [ProofGenerationService] ZKVM service returned error: %s", errorMsg)
		s.markAsFailed(&task, fmt.Sprintf("ZKVM service returned error: %s", errorMsg))
		return
	}

	// 序列化结果
	resultData, err := json.Marshal(zkvmResp)
	if err != nil {
		s.markAsFailed(&task, fmt.Sprintf("failed to marshal ZKVM response: %v", err))
		return
	}

	// 更新任务状态为已完成
	completedAt := time.Now()
	if err := s.db.Model(&task).Updates(map[string]interface{}{
		"status":       models.ProofGenerationTaskStatusCompleted,
		"result_data":  string(resultData),
		"completed_at": &completedAt,
		"updated_at":   time.Now(),
	}).Error; err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to update task status: %v", err)
		return
	}

	log.Printf("✅ [ProofGenerationService] Task completed: ID=%s, CheckbookID=%s",
		task.ID, task.CheckbookID)

	// 继续后续的区块链提交流程
	if err := s.continueCommitmentSubmission(&task, zkvmResp); err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to continue commitment submission: %v", err)
		// 注意：这里不标记任务为失败，因为 ZKVM 证明已经生成成功
		// 区块链提交失败可以通过重试机制处理
	}
}

// continueCommitmentSubmission 继续后续的区块链提交流程
func (s *ProofGenerationService) continueCommitmentSubmission(
	task *models.ProofGenerationTask,
	zkvmResp *clients.BuildCommitmentResponse,
) error {
	log.Printf("🔄 [ProofGenerationService] Continuing commitment submission for CheckbookID=%s", task.CheckbookID)

	// 解析提交上下文
	var submissionContext SubmissionContext
	if task.SubmissionContext != "" {
		if err := json.Unmarshal([]byte(task.SubmissionContext), &submissionContext); err != nil {
			return fmt.Errorf("failed to unmarshal submission context: %w", err)
		}
	} else {
		return fmt.Errorf("submission context is missing")
	}

	// 查询 checkbook
	var checkbook models.Checkbook
	if err := s.db.Where("id = ?", task.CheckbookID).First(&checkbook).Error; err != nil {
		return fmt.Errorf("failed to query checkbook: %w", err)
	}

	// 解析 public values 获取 commitment
	// 使用 types.ParseCommitmentPublicValues（与 handler 中相同）
	parsedValues, err := parsePublicValues(zkvmResp.PublicValues)
	if err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to parse public values: %v", err)
		// 更新状态为 proof_failed
		s.db.Model(&checkbook).Update("status", models.CheckbookStatusProofFailed)
		return fmt.Errorf("failed to parse public values: %w", err)
	}

	commitmentStr := parsedValues.Commitment
	log.Printf("✅ [ProofGenerationService] Parsed commitment: %s", commitmentStr)

	// 更新 checkbook 状态和保存证明数据
	oldStatus := checkbook.Status
	updates := map[string]interface{}{
		"status":          models.CheckbookStatusSubmittingCommitment,
		"commitment":      commitmentStr,
		"proof_signature": zkvmResp.ProofData,
		"public_values":   zkvmResp.PublicValues,
		"updated_at":      time.Now(),
	}

	if err := s.db.Model(&checkbook).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to update checkbook: %w", err)
	}

	// 更新 nullifiers（使用新的 commitment）
	if err := s.updateNullifiers(task.CheckbookID, commitmentStr); err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to update nullifiers: %v", err)
		// 不返回错误，因为这不是致命错误
	}

	// 推送 WebSocket 通知
	if s.webSocketPushService != nil {
		if err := s.webSocketPushService.PushCheckbookStatusUpdate(
			s.db, checkbook.ID, string(oldStatus), "ProofGenerationService",
		); err != nil {
			log.Printf("⚠️ [ProofGenerationService] Failed to push WebSocket notification: %v", err)
		}
	}

	// 构建 CommitmentRequest
	commitmentReq := &CommitmentRequest{
		ChainID:           submissionContext.ChainID,
		LocalDepositID:    uint64(submissionContext.DepositID),
		TokenKey:          submissionContext.TokenKey,
		CheckbookTokenKey: submissionContext.TokenKey,
		AllocatableAmount: submissionContext.AllocatableAmount,
		Commitment:        commitmentStr,
		SP1Proof:          zkvmResp.ProofData,
		PublicValues:      []string{zkvmResp.PublicValues},
		CheckbookID:       task.CheckbookID,
	}

	// 调用区块链提交服务
	if s.blockchainService == nil {
		return fmt.Errorf("blockchain service is not initialized")
	}

	// 初始化区块链客户端（如果需要）
	if err := s.blockchainService.InitializeClients(); err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to initialize blockchain clients: %v", err)
		// 不返回错误，可能已经初始化过了
	}

	// 提交到区块链
	commitmentResponse, err := s.blockchainService.SubmitCommitment(commitmentReq)
	if err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to submit commitment: %v", err)
		// 更新状态为 submission_failed
		s.db.Model(&checkbook).Update("status", models.CheckbookStatusSubmissionFailed)
		if s.webSocketPushService != nil {
			s.webSocketPushService.PushCheckbookStatusUpdate(
				s.db, checkbook.ID, string(models.CheckbookStatusSubmittingCommitment), "ProofGenerationService",
			)
		}
		return fmt.Errorf("failed to submit commitment: %w", err)
	}

	// 如果使用队列模式（有 QueueID 但 TxHash 为空），任务已完成
	if commitmentResponse.QueueID != "" && commitmentResponse.TxHash == "" {
		log.Printf("✅ [ProofGenerationService] Commitment enqueued: QueueID=%s", commitmentResponse.QueueID)
		// 状态已经在队列服务中更新为 submitting_commitment
		return nil
	}

	// 如果直接提交成功（有 TxHash）
	if commitmentResponse.TxHash != "" {
		log.Printf("✅ [ProofGenerationService] Commitment submitted: TxHash=%s", commitmentResponse.TxHash)
		// 状态已经在区块链服务中更新
		return nil
	}

	return nil
}

// parsePublicValues 解析 public values（使用 types 包）
func parsePublicValues(publicValuesHex string) (*types.CommitmentPublicValues, error) {
	parsed, err := types.ParseCommitmentPublicValues(publicValuesHex)
	if err != nil {
		return nil, fmt.Errorf("failed to parse public values: %w", err)
	}
	return parsed, nil
}

// updateNullifiers 更新所有 checks 的 nullifiers
func (s *ProofGenerationService) updateNullifiers(checkbookID string, commitment string) error {
	// 查询所有 checks
	var checks []models.Check
	if err := s.db.Where("checkbook_id = ?", checkbookID).Find(&checks).Error; err != nil {
		return fmt.Errorf("failed to query checks: %w", err)
	}

	if len(checks) == 0 {
		return nil
	}

	commitmentHash := common.HexToHash(commitment)
	updated := 0

	for _, check := range checks {
		// 生成 nullifier: keccak256(commitment || seq || amount)
		amountBig, ok := new(big.Int).SetString(check.Amount, 10)
		if !ok {
			log.Printf("⚠️ [ProofGenerationService] Failed to parse amount %s for check %s", check.Amount, check.ID)
			continue
		}

		seqByte := byte(check.Seq)
		amountBytes := make([]byte, 32)
		amountBig.FillBytes(amountBytes) // Big-endian encoding (U256)

		// Build data: commitment || seq || amount
		data := make([]byte, 0, 65) // 32 + 1 + 32 = 65 bytes
		data = append(data, commitmentHash.Bytes()...)
		data = append(data, seqByte)
		data = append(data, amountBytes...)

		// Compute keccak256 hash
		hash := crypto.Keccak256(data)
		nullifier := "0x" + common.Bytes2Hex(hash)

		// 更新 nullifier
		if err := s.db.Model(&check).Update("nullifier", nullifier).Error; err != nil {
			log.Printf("⚠️ [ProofGenerationService] Failed to update nullifier for check %s: %v", check.ID, err)
			continue
		}

		updated++
	}

	log.Printf("✅ [ProofGenerationService] Updated nullifiers for %d/%d checks", updated, len(checks))
	return nil
}

// markAsFailed 标记任务为失败
func (s *ProofGenerationService) markAsFailed(task *models.ProofGenerationTask, errorMsg string) {
	task.RetryCount++
	task.LastError = errorMsg
	task.Status = models.ProofGenerationTaskStatusPending

	if task.RetryCount >= task.MaxRetries {
		task.Status = models.ProofGenerationTaskStatusFailed
		
		// 更新 checkbook 状态为 proof_failed
		if err := s.db.Model(&models.Checkbook{}).
			Where("id = ?", task.CheckbookID).
			Update("status", models.CheckbookStatusProofFailed).Error; err != nil {
			log.Printf("⚠️ [ProofGenerationService] Failed to update checkbook status: %v", err)
		}

		// 推送 WebSocket 通知
		if s.webSocketPushService != nil {
			if err := s.webSocketPushService.PushCheckbookStatusUpdate(
				s.db, task.CheckbookID, "generating_proof", "ProofGenerationService",
			); err != nil {
				log.Printf("⚠️ [ProofGenerationService] Failed to push WebSocket notification: %v", err)
			}
		}
	} else {
		// 计算下次重试时间（指数退避）
		delay := time.Duration(1<<uint(task.RetryCount)) * 10 * time.Second
		if delay > 10*time.Minute {
			delay = 10 * time.Minute
		}
		nextRetry := time.Now().Add(delay)
		task.NextRetryAt = &nextRetry
	}

	if err := s.db.Save(task).Error; err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to save task: %v", err)
	}
}

// recoverPendingTasks 恢复未完成的任务
func (s *ProofGenerationService) recoverPendingTasks() error {
	log.Printf("🔄 [ProofGenerationService] Recovering pending tasks...")

	// 恢复 commitment 证明生成任务
	var commitmentTasks []models.ProofGenerationTask
	if err := s.db.Where("status = ?", models.ProofGenerationTaskStatusProcessing).
		Find(&commitmentTasks).Error; err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to query processing commitment tasks: %v", err)
	} else {
		log.Printf("📋 [ProofGenerationService] Found %d processing commitment tasks to recover", len(commitmentTasks))
		for _, task := range commitmentTasks {
			if err := s.db.Model(&task).Update("status", models.ProofGenerationTaskStatusPending).Error; err != nil {
				log.Printf("⚠️ [ProofGenerationService] Failed to reset commitment task %s: %v", task.ID, err)
			}
		}
	}

	// 恢复提现证明生成任务
	var withdrawTasks []models.WithdrawProofGenerationTask
	if err := s.db.Where("status = ?", models.WithdrawProofTaskStatusProcessing).
		Find(&withdrawTasks).Error; err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to query processing withdraw tasks: %v", err)
	} else {
		log.Printf("📋 [ProofGenerationService] Found %d processing withdraw tasks to recover", len(withdrawTasks))
		for _, task := range withdrawTasks {
			if err := s.db.Model(&task).Update("status", models.WithdrawProofTaskStatusPending).Error; err != nil {
				log.Printf("⚠️ [ProofGenerationService] Failed to reset withdraw task %s: %v", task.ID, err)
			}
		}
	}

	// 恢复已完成证明但未提交的提现请求
	if err := s.recoverCompletedWithdrawProofs(); err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to recover completed withdraw proofs: %v", err)
	}

	return nil
}

// recoverCompletedWithdrawProofs 恢复已完成证明但未提交的提现请求
func (s *ProofGenerationService) recoverCompletedWithdrawProofs() error {
	log.Printf("🔄 [ProofGenerationService] Recovering completed withdraw proofs...")

	// 查找已完成证明但未提交的请求
	var requests []models.WithdrawRequest
	if err := s.db.Where("proof_status = ? AND execute_status = ?",
		models.ProofStatusCompleted, models.ExecuteStatusPending).
		Find(&requests).Error; err != nil {
		return fmt.Errorf("failed to query completed withdraw requests: %w", err)
	}

	log.Printf("📋 [ProofGenerationService] Found %d completed withdraw proofs to recover", len(requests))

	// 为每个请求继续执行链上提交
	for _, req := range requests {
		// 查找对应的任务
		var task models.WithdrawProofGenerationTask
		if err := s.db.Where("withdraw_request_id = ? AND status = ?",
			req.ID, models.WithdrawProofTaskStatusCompleted).
			First(&task).Error; err != nil {
			log.Printf("⚠️ [ProofGenerationService] No completed task found for withdraw request %s", req.ID)
			continue
		}

		// 解析 ZKVM 响应
		var zkvmResp clients.BuildWithdrawResponse
		if err := json.Unmarshal([]byte(task.ResultData), &zkvmResp); err != nil {
			log.Printf("⚠️ [ProofGenerationService] Failed to unmarshal ZKVM response for task %s: %v", task.ID, err)
			continue
		}

		// 继续执行链上提交
		log.Printf("🔄 [ProofGenerationService] Recovering withdraw submission for request %s", req.ID)
		if err := s.continueWithdrawSubmission(&task, &zkvmResp); err != nil {
			log.Printf("⚠️ [ProofGenerationService] Failed to recover withdraw submission for request %s: %v", req.ID, err)
		}
	}

	return nil
}

// GetTaskStatus 查询任务状态
func (s *ProofGenerationService) GetTaskStatus(taskID string) (*models.ProofGenerationTask, error) {
	var task models.ProofGenerationTask
	if err := s.db.Where("id = ?", taskID).First(&task).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

// processWithdrawProofTask 处理提现证明生成任务
func (s *ProofGenerationService) processWithdrawProofTask(taskID string) {
	// 标记为正在处理
	s.taskMutex.Lock()
	if s.processingTasks[taskID] {
		s.taskMutex.Unlock()
		return
	}
	s.processingTasks[taskID] = true
	s.taskMutex.Unlock()

	defer func() {
		s.taskMutex.Lock()
		delete(s.processingTasks, taskID)
		s.taskMutex.Unlock()
	}()

	// 查询任务
	var task models.WithdrawProofGenerationTask
	if err := s.db.Where("id = ?", taskID).First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return
		}
		log.Printf("❌ [ProofGenerationService] Failed to query withdraw task %s: %v", taskID, err)
		return
	}

	// 更新状态为 processing
	now := time.Now()
	if err := s.db.Model(&task).Updates(map[string]interface{}{
		"status":     models.WithdrawProofTaskStatusProcessing,
		"started_at":  &now,
		"updated_at": time.Now(),
	}).Error; err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to update withdraw task status: %v", err)
		return
	}

	log.Printf("🔄 [ProofGenerationService] Processing withdraw proof task: ID=%s, WithdrawRequestID=%s",
		task.ID, task.WithdrawRequestID)

	// 解析 ZKVM 请求
	var zkvmReq clients.WithdrawProofRequest
	if err := json.Unmarshal([]byte(task.TaskData), &zkvmReq); err != nil {
		s.markWithdrawTaskAsFailed(&task, fmt.Sprintf("failed to unmarshal ZKVM request: %v", err))
		return
	}

	// 调用 ZKVM 服务（使用 GenerateWithdrawProofV2）
	zkvmResp, err := s.zkvmClient.GenerateWithdrawProofV2(&zkvmReq)
	if err != nil {
		log.Printf("❌ [ProofGenerationService] ZKVM service call failed: %v", err)
		s.markWithdrawTaskAsFailed(&task, fmt.Sprintf("ZKVM service call failed: %v", err))
		return
	}

	if !zkvmResp.Success {
		errorMsg := "Unknown error"
		if zkvmResp.ErrorMessage != nil {
			errorMsg = *zkvmResp.ErrorMessage
		}
		log.Printf("❌ [ProofGenerationService] ZKVM service returned error: %s", errorMsg)
		s.markWithdrawTaskAsFailed(&task, fmt.Sprintf("ZKVM service returned error: %s", errorMsg))
		return
	}

	// 序列化结果
	resultData, err := json.Marshal(zkvmResp)
	if err != nil {
		s.markWithdrawTaskAsFailed(&task, fmt.Sprintf("failed to marshal ZKVM response: %v", err))
		return
	}

	// 更新任务状态为已完成
	completedAt := time.Now()
	if err := s.db.Model(&task).Updates(map[string]interface{}{
		"status":       models.WithdrawProofTaskStatusCompleted,
		"result_data":  string(resultData),
		"completed_at": &completedAt,
		"updated_at":   time.Now(),
	}).Error; err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to update withdraw task status: %v", err)
		return
	}

	log.Printf("✅ [ProofGenerationService] Withdraw proof task completed: ID=%s, WithdrawRequestID=%s",
		task.ID, task.WithdrawRequestID)

	// 继续后续的链上提交流程
	if err := s.continueWithdrawSubmission(&task, zkvmResp); err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to continue withdraw submission: %v", err)
		// 注意：这里不标记任务为失败，因为 ZKVM 证明已经生成成功
		// 链上提交失败可以通过重试机制处理
	}
}

// continueWithdrawSubmission 继续后续的链上提交流程
func (s *ProofGenerationService) continueWithdrawSubmission(
	task *models.WithdrawProofGenerationTask,
	zkvmResp *clients.BuildWithdrawResponse,
) error {
	log.Printf("🔄 [ProofGenerationService] Continuing withdraw submission for WithdrawRequestID=%s", task.WithdrawRequestID)

	// 解析提交上下文
	var submissionContext WithdrawSubmissionContext
	if task.SubmissionContext != "" {
		if err := json.Unmarshal([]byte(task.SubmissionContext), &submissionContext); err != nil {
			return fmt.Errorf("failed to unmarshal submission context: %w", err)
		}
	} else {
		return fmt.Errorf("submission context is missing")
	}

	// 查询 withdraw request
	var withdrawRequest models.WithdrawRequest
	if err := s.db.Where("id = ?", task.WithdrawRequestID).First(&withdrawRequest).Error; err != nil {
		return fmt.Errorf("failed to query withdraw request: %w", err)
	}

	// 验证 ZKVM 返回的数据
	if zkvmResp.ProofData == "" {
		log.Printf("❌ [ProofGenerationService] ProofData is empty from ZKVM response")
		// 更新 proof_status 为 failed
		s.db.Model(&withdrawRequest).Update("proof_status", models.ProofStatusFailed)
		return fmt.Errorf("proof data is empty")
	}
	if zkvmResp.PublicValues == "" {
		log.Printf("❌ [ProofGenerationService] PublicValues is empty from ZKVM response")
		s.db.Model(&withdrawRequest).Update("proof_status", models.ProofStatusFailed)
		return fmt.Errorf("public values is empty")
	}

	// 更新 withdraw request 的证明状态和保存证明数据
	if err := s.db.Model(&withdrawRequest).Updates(map[string]interface{}{
		"proof_status":  models.ProofStatusCompleted,
		"proof":         zkvmResp.ProofData,
		"public_values": zkvmResp.PublicValues,
		"updated_at":    time.Now(),
	}).Error; err != nil {
		return fmt.Errorf("failed to update withdraw request: %w", err)
	}

	// ========== 更新 withdraw_nullifier 为 public_values 中的第一个 nullifier ==========
	// 这是关键修复：链上的 request_id 是 public_values[0]（第一个 nullifier）
	// 需要确保 withdraw_nullifier 与链上的 request_id 一致
	log.Printf("🔍 [ProofGenerationService] 解析 public_values 以获取第一个 nullifier...")
	parsedPublicValues, err := types.ParseWithdrawPublicValues(zkvmResp.PublicValues)
	if err != nil {
		log.Printf("⚠️ [ProofGenerationService] 无法解析 public_values: %v", err)
		log.Printf("   继续使用原有的 withdraw_nullifier，但链上事件可能无法匹配")
	} else if len(parsedPublicValues.Nullifiers) > 0 {
		firstNullifierFromPublicValues := parsedPublicValues.Nullifiers[0]
		currentNullifier := withdrawRequest.WithdrawNullifier

		// 标准化格式进行比较
		firstNullifierNormalized := strings.ToLower(strings.TrimPrefix(firstNullifierFromPublicValues, "0x"))
		currentNullifierNormalized := strings.ToLower(strings.TrimPrefix(currentNullifier, "0x"))

		if firstNullifierNormalized != currentNullifierNormalized {
			log.Printf("🔄 [ProofGenerationService] 检测到 withdraw_nullifier 不匹配，需要更新：")
			log.Printf("   当前值（allocation_ids[0]）: %s", currentNullifier)
			log.Printf("   public_values[0]（链上 request_id）: %s", firstNullifierFromPublicValues)
			log.Printf("   正在更新 withdraw_nullifier 为 public_values[0]...")

			if err := s.db.Model(&withdrawRequest).Update("withdraw_nullifier", firstNullifierFromPublicValues).Error; err != nil {
				log.Printf("❌ [ProofGenerationService] 更新 withdraw_nullifier 失败: %v", err)
				log.Printf("   ⚠️  链上事件可能无法匹配到 WithdrawRequest")
			} else {
				log.Printf("✅ [ProofGenerationService] withdraw_nullifier 已更新为 public_values[0]")
				log.Printf("   现在 withdraw_nullifier 与链上的 request_id 一致")
				// 更新内存中的值，以便后续使用
				withdrawRequest.WithdrawNullifier = firstNullifierFromPublicValues
			}
		} else {
			log.Printf("✅ [ProofGenerationService] withdraw_nullifier 与 public_values[0] 一致，无需更新")
		}
	} else {
		log.Printf("⚠️ [ProofGenerationService] public_values 中没有 nullifiers")
	}

	// 推送 WebSocket 通知
	if s.webSocketPushService != nil {
		// 注意：这里需要推送 WithdrawRequest 状态更新，而不是 Checkbook
		// 如果 WebSocketPushService 有 PushWithdrawRequestStatusUpdate 方法，使用它
		// 否则暂时跳过
		log.Printf("📝 [ProofGenerationService] Withdraw proof generated, should push WebSocket notification")
	}

	// 构建 WithdrawRequest 用于链上提交
	// 使用 withdrawRequest.QueueRoot（如果 submissionContext 中的为空）
	queueRoot := submissionContext.QueueRoot
	if queueRoot == "" {
		queueRoot = withdrawRequest.QueueRoot
	}

	// 确保 recipient 有 0x 前缀且是 32 字节格式（66 字符：0x + 64 hex）
	recipient := submissionContext.Recipient
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
	recipient = "0x" + recipient

	blockchainReq := &WithdrawRequest{
		ChainID:           submissionContext.ChainID,
		NullifierHash:     submissionContext.NullifierHash,
		Recipient:         recipient,
		Amount:            submissionContext.Amount,
		QueueRoot:         queueRoot,
		OriginalProofHash: "", // Not used in new signature
		SP1Proof:          zkvmResp.ProofData,
		PublicValues:      zkvmResp.PublicValues,
		Token:             "", // Will be set from checkbook if needed
		TokenKey:          submissionContext.TokenKey,
		CheckbookID:       submissionContext.CheckbookID,
		CheckID:           submissionContext.CheckID,
	}

	// 调用区块链提交服务
	if s.blockchainService == nil {
		return fmt.Errorf("blockchain service is not initialized")
	}

	// 初始化区块链客户端（如果需要）
	if err := s.blockchainService.InitializeClients(); err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to initialize blockchain clients: %v", err)
		// 不返回错误，可能已经初始化过了
	}

	// 更新 execute_status 为 submitted（在提交前）
	if err := s.db.Model(&withdrawRequest).Update("execute_status", models.ExecuteStatusSubmitted).Error; err != nil {
		log.Printf("⚠️ [ProofGenerationService] Failed to update execute_status: %v", err)
	}

	// 提交到区块链
	withdrawResponse, err := s.blockchainService.SubmitWithdraw(blockchainReq)
	if err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to submit withdraw: %v", err)
		
		// 判断错误类型
		errorMsg := err.Error()
		isContractRevert := strings.Contains(errorMsg, "execution reverted") ||
			strings.Contains(errorMsg, "revert") ||
			strings.Contains(errorMsg, "invalid proof") ||
			strings.Contains(errorMsg, "nullifier already used")

		if isContractRevert {
			// 验证失败，不可重试
			s.db.Model(&withdrawRequest).Update("execute_status", models.ExecuteStatusVerifyFailed)
		} else {
			// 网络错误，可重试
			s.db.Model(&withdrawRequest).Update("execute_status", models.ExecuteStatusSubmitFailed)
		}
		return fmt.Errorf("failed to submit withdraw: %w", err)
	}

	// 如果使用队列模式（有 QueueID 但 TxHash 为空），任务已完成
	if withdrawResponse.QueueID != "" && withdrawResponse.TxHash == "" {
		log.Printf("✅ [ProofGenerationService] Withdraw enqueued: QueueID=%s", withdrawResponse.QueueID)
		// 状态已经在队列服务中更新
		return nil
	}

	// 如果直接提交成功（有 TxHash）
	if withdrawResponse.TxHash != "" {
		log.Printf("✅ [ProofGenerationService] Withdraw submitted: TxHash=%s", withdrawResponse.TxHash)
		// 更新 TX hash
		s.db.Model(&withdrawRequest).Updates(map[string]interface{}{
			"execute_tx_hash": withdrawResponse.TxHash,
			"updated_at":      time.Now(),
		})
		// 创建 polling task 等待确认（如果需要）
		// 这里可以调用 UnifiedPollingService 创建 polling task
		return nil
	}

	return nil
}

// markWithdrawTaskAsFailed 标记提现任务为失败
func (s *ProofGenerationService) markWithdrawTaskAsFailed(task *models.WithdrawProofGenerationTask, errorMsg string) {
	task.RetryCount++
	task.LastError = errorMsg
	task.Status = models.WithdrawProofTaskStatusPending

	if task.RetryCount >= task.MaxRetries {
		task.Status = models.WithdrawProofTaskStatusFailed
		
		// 更新 withdraw request 状态为 proof_failed
		if err := s.db.Model(&models.WithdrawRequest{}).
			Where("id = ?", task.WithdrawRequestID).
			Update("proof_status", models.ProofStatusFailed).Error; err != nil {
			log.Printf("⚠️ [ProofGenerationService] Failed to update withdraw request status: %v", err)
		}
	} else {
		// 计算下次重试时间（指数退避）
		delay := time.Duration(1<<uint(task.RetryCount)) * 10 * time.Second
		if delay > 10*time.Minute {
			delay = 10 * time.Minute
		}
		nextRetry := time.Now().Add(delay)
		task.NextRetryAt = &nextRetry
	}

	if err := s.db.Save(task).Error; err != nil {
		log.Printf("❌ [ProofGenerationService] Failed to save withdraw task: %v", err)
	}
}

