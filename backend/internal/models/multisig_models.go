package models

import (
	"time"
)

// MultisigProposalStatus 多签提案状态
type MultisigProposalStatus string

const (
	MultisigProposalStatusPending   MultisigProposalStatus = "pending"   // 等待签名
	MultisigProposalStatusExecuting MultisigProposalStatus = "executing"  // 执行中
	MultisigProposalStatusExecuted  MultisigProposalStatus = "executed"  // 已执行
	MultisigProposalStatusFailed    MultisigProposalStatus = "failed"    // 执行失败
	MultisigProposalStatusRejected  MultisigProposalStatus = "rejected" // 已拒绝
	MultisigProposalStatusExpired   MultisigProposalStatus = "expired"   // 已过期
)

// MultisigProposalType 多签提案类型
type MultisigProposalType string

const (
	MultisigProposalTypeDeposit MultisigProposalType = "deposit" // 存款
	MultisigProposalTypePayout  MultisigProposalType = "payout"  // 提现
)

// MultisigProposal 多签提案记录
type MultisigProposal struct {
	ID        uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ProposalID string   `json:"proposal_id" gorm:"size:66;uniqueIndex;not null"` // 链上提案ID (uint256 as string)
	ChainID   int64    `json:"chain_id" gorm:"not null;index"`                  // 链ID
	
	// 提案类型和关联信息
	Type         MultisigProposalType `json:"type" gorm:"not null;index"` // 提案类型
	RequestID    string                `json:"request_id" gorm:"size:66;index"` // 关联的请求ID (deposit或withdraw)
	EventTxHash  string                `json:"event_tx_hash" gorm:"size:66;index"` // 触发事件的交易哈希
	
	// 提案内容
	Target       string `json:"target" gorm:"size:66;not null"`       // 目标合约地址
	Value        string `json:"value" gorm:"not null"`                // 发送的ETH数量 (wei)
	Data         string `json:"data" gorm:"type:text;not null"`        // 调用数据 (hex)
	Description  string `json:"description" gorm:"type:text"`         // 提案描述
	
	// 提案状态
	Status       MultisigProposalStatus `json:"status" gorm:"not null;default:'pending';index"`
	Proposer     string                  `json:"proposer" gorm:"size:66;not null"` // 提案发起人
	SignatureCount int                   `json:"signature_count" gorm:"default:0"` // 当前签名数
	RequiredSignatures int               `json:"required_signatures" gorm:"not null"` // 所需签名数
	RejectionCount    int                `json:"rejection_count" gorm:"default:0"` // 拒绝数
	
	// 时间信息
	CreatedAt    time.Time  `json:"created_at"`                      // 提案创建时间
	Deadline     time.Time  `json:"deadline"`                        // 提案截止时间
	ExecutedAt   *time.Time `json:"executed_at"`                     // 执行时间
	ExpiredAt    *time.Time `json:"expired_at"`                      // 过期时间
	
	// 执行结果
	ExecuteTxHash string `json:"execute_tx_hash" gorm:"size:66;index"` // 执行交易哈希
	ExecuteBlockNumber *uint64 `json:"execute_block_number"`          // 执行区块号
	Success      *bool   `json:"success"`                             // 执行是否成功
	ReturnData   string  `json:"return_data" gorm:"type:text"`         // 执行返回数据
	ErrorReason  string  `json:"error_reason" gorm:"type:text"`        // 失败原因
	
	// 多签合约信息
	MultisigAddress string `json:"multisig_address" gorm:"size:66;not null;index"` // 多签合约地址
	
	// 元数据
	Metadata    string `json:"metadata" gorm:"type:jsonb"` // 额外的元数据 (JSON)
	
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName 指定表名
func (MultisigProposal) TableName() string {
	return "multisig_proposals"
}

// MultisigProposalSignature 多签提案签名记录
type MultisigProposalSignature struct {
	ID          uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ProposalID  string    `json:"proposal_id" gorm:"size:66;not null;index"` // 提案ID
	Signer      string    `json:"signer" gorm:"size:66;not null;index"`      // 签名人地址
	ChainID     int64     `json:"chain_id" gorm:"not null;index"`            // 链ID
	TxHash      string    `json:"tx_hash" gorm:"size:66;index"`              // 签名交易哈希
	BlockNumber uint64    `json:"block_number"`                              // 区块号
	CreatedAt   time.Time `json:"created_at"`                                 // 签名时间
	
	// 唯一索引：同一提案同一签名人只能签名一次
	// gorm:"uniqueIndex:idx_proposal_signer"
}

// TableName 指定表名
func (MultisigProposalSignature) TableName() string {
	return "multisig_proposal_signatures"
}

// MultisigExecution 多签执行记录（用于跟踪执行历史）
type MultisigExecution struct {
	ID              uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	ProposalID      string    `json:"proposal_id" gorm:"size:66;not null;index"` // 提案ID
	ChainID         int64     `json:"chain_id" gorm:"not null;index"`            // 链ID
	ExecuteTxHash   string    `json:"execute_tx_hash" gorm:"size:66;uniqueIndex;not null"` // 执行交易哈希
	ExecuteBlockNumber uint64  `json:"execute_block_number" gorm:"not null"`     // 执行区块号
	Success          bool      `json:"success" gorm:"not null"`                   // 是否成功
	ReturnData       string    `json:"return_data" gorm:"type:text"`              // 返回数据
	ErrorReason      string    `json:"error_reason" gorm:"type:text"`              // 错误原因
	GasUsed          string    `json:"gas_used"`                                   // Gas使用量
	CreatedAt        time.Time `json:"created_at"`                                 // 执行时间
}

// TableName 指定表名
func (MultisigExecution) TableName() string {
	return "multisig_executions"
}
















