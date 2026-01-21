package models

import (
	"time"
)

// ProofGenerationTaskStatus 证明生成任务状态
type ProofGenerationTaskStatus string

const (
	ProofGenerationTaskStatusPending   ProofGenerationTaskStatus = "pending"   // 等待处理
	ProofGenerationTaskStatusProcessing ProofGenerationTaskStatus = "processing" // 正在处理
	ProofGenerationTaskStatusCompleted  ProofGenerationTaskStatus = "completed"  // 已完成
	ProofGenerationTaskStatusFailed    ProofGenerationTaskStatus = "failed"    // 失败
)

// ProofGenerationTask 证明生成任务
type ProofGenerationTask struct {
	ID        string                    `json:"id" gorm:"primaryKey"` // UUID
	Status    ProofGenerationTaskStatus `json:"status" gorm:"not null;default:pending;index"`
	CheckbookID string                  `json:"checkbook_id" gorm:"not null;index"`
	
	// 任务数据（JSON 序列化）
	TaskData  string `json:"task_data" gorm:"type:text"` // ZKVM 请求数据（JSON）
	
	// 提交上下文数据（JSON 序列化）- 用于后续区块链提交
	SubmissionContext string `json:"submission_context" gorm:"type:text"` // 包含 chainID, depositID, tokenKey, allocatableAmount 等
	
	// 结果数据（JSON 序列化）
	ResultData string `json:"result_data" gorm:"type:text"` // ZKVM 响应数据（JSON）
	
	// 重试信息
	RetryCount  int        `json:"retry_count" gorm:"default:0"`
	MaxRetries  int        `json:"max_retries" gorm:"default:3"`
	NextRetryAt *time.Time `json:"next_retry_at"`
	
	// 错误信息
	LastError string `json:"last_error" gorm:"type:text"`
	
	// 优先级（数字越小优先级越高）
	Priority int `json:"priority" gorm:"default:100"`
	
	// 时间戳
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

// TableName 指定表名
func (ProofGenerationTask) TableName() string {
	return "proof_generation_tasks"
}

