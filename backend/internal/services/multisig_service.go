package services

import (
	"encoding/hex"
	"fmt"
	"go-backend/internal/models"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"gorm.io/gorm"
)

type MultisigService struct {
	db *gorm.DB
}

func NewMultisigService(db *gorm.DB) *MultisigService {
	return &MultisigService{db: db}
}

// GetProposals 获取提案列表
func (s *MultisigService) GetProposals(page, pageSize int, status string, chainID *int64, proposalType string) ([]models.MultisigProposal, int64, error) {
	var proposals []models.MultisigProposal
	query := s.db.Model(&models.MultisigProposal{})

	// 应用过滤条件
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if chainID != nil {
		query = query.Where("chain_id = ?", *chainID)
	}
	if proposalType != "" {
		query = query.Where("type = ?", proposalType)
	}

	// 获取总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页查询
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&proposals).Error; err != nil {
		return nil, 0, err
	}

	return proposals, total, nil
}

// GetProposal 获取单个提案
func (s *MultisigService) GetProposal(proposalID string, chainID int64) (*models.MultisigProposal, error) {
	var proposal models.MultisigProposal
	err := s.db.Where("proposal_id = ? AND chain_id = ?", proposalID, chainID).First(&proposal).Error
	if err != nil {
		return nil, err
	}
	return &proposal, nil
}

// GetProposalSignatures 获取提案签名列表
func (s *MultisigService) GetProposalSignatures(proposalID string, chainID int64) ([]models.MultisigProposalSignature, error) {
	var signatures []models.MultisigProposalSignature
	err := s.db.Where("proposal_id = ? AND chain_id = ?", proposalID, chainID).
		Order("created_at ASC").Find(&signatures).Error
	return signatures, err
}

// GetProposalStatusFromChain 从链上获取提案状态
func (s *MultisigService) GetProposalStatusFromChain(proposalID string, chainID int64) (map[string]interface{}, error) {
	// TODO: 实现从链上查询提案状态的逻辑
	// 需要连接到对应链的RPC节点，调用多签合约的getProposal方法
	
	// 先从数据库获取提案信息
	proposal, err := s.GetProposal(proposalID, chainID)
	if err != nil {
		return nil, err
	}

	// 返回数据库中的状态（后续可以扩展为从链上实时查询）
	return map[string]interface{}{
		"proposal_id":         proposal.ProposalID,
		"status":              proposal.Status,
		"signature_count":     proposal.SignatureCount,
		"required_signatures": proposal.RequiredSignatures,
		"rejection_count":     proposal.RejectionCount,
		"executed":           proposal.Status == models.MultisigProposalStatusExecuted,
		"expired":            proposal.ExpiredAt != nil && proposal.ExpiredAt.Before(time.Now()),
		"deadline":           proposal.Deadline,
	}, nil
}

// RetryProposal 重新执行失败的提案
func (s *MultisigService) RetryProposal(proposalID string, chainID int64) (map[string]interface{}, error) {
	// 获取提案
	proposal, err := s.GetProposal(proposalID, chainID)
	if err != nil {
		return nil, err
	}

	// 检查提案状态
	if proposal.Status != models.MultisigProposalStatusFailed {
		return nil, fmt.Errorf("proposal is not in failed status, current status: %s", proposal.Status)
	}

	// 检查提案是否已过期
	if proposal.Deadline.Before(time.Now()) {
		return nil, fmt.Errorf("proposal has expired")
	}

	// TODO: 实现重新执行的逻辑
	// 1. 检查提案在链上的状态
	// 2. 如果签名数足够，调用executeProposal
	// 3. 如果签名数不足，返回需要更多签名的信息

	// 更新提案状态为执行中
	proposal.Status = models.MultisigProposalStatusExecuting
	proposal.UpdatedAt = time.Now()
	if err := s.db.Save(proposal).Error; err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"proposal_id": proposalID,
		"status":       "executing",
		"message":      "Proposal retry initiated",
	}, nil
}

// GetSystemStatus 获取多签系统状态
func (s *MultisigService) GetSystemStatus(chainID *int64) (map[string]interface{}, error) {
	query := s.db.Model(&models.MultisigProposal{})
	if chainID != nil {
		query = query.Where("chain_id = ?", *chainID)
	}

	var stats struct {
		TotalProposals    int64
		PendingProposals  int64
		ExecutedProposals int64
		FailedProposals   int64
		ActiveProposals   int64
	}

	query.Count(&stats.TotalProposals)
	query.Where("status = ?", models.MultisigProposalStatusPending).Count(&stats.PendingProposals)
	query.Where("status = ?", models.MultisigProposalStatusExecuted).Count(&stats.ExecutedProposals)
	query.Where("status = ?", models.MultisigProposalStatusFailed).Count(&stats.FailedProposals)
	query.Where("status IN ?", []string{
		string(models.MultisigProposalStatusPending),
		string(models.MultisigProposalStatusExecuting),
	}).Count(&stats.ActiveProposals)

	return map[string]interface{}{
		"total_proposals":    stats.TotalProposals,
		"pending_proposals":  stats.PendingProposals,
		"executed_proposals": stats.ExecutedProposals,
		"failed_proposals":   stats.FailedProposals,
		"active_proposals":   stats.ActiveProposals,
	}, nil
}

// SaveProposal 保存提案到数据库
func (s *MultisigService) SaveProposal(proposal *models.MultisigProposal) error {
	return s.db.Save(proposal).Error
}

// UpdateProposalStatus 更新提案状态
func (s *MultisigService) UpdateProposalStatus(proposalID string, chainID int64, status models.MultisigProposalStatus) error {
	return s.db.Model(&models.MultisigProposal{}).
		Where("proposal_id = ? AND chain_id = ?", proposalID, chainID).
		Update("status", status).Error
}

// Helper function to parse proposal ID from big.Int
func parseProposalID(proposalID *big.Int) string {
	if proposalID == nil {
		return "0"
	}
	return proposalID.String()
}

// Helper function to parse address
func parseAddress(addr common.Address) string {
	return addr.Hex()
}

// Helper function to parse bytes
func parseBytes(data []byte) string {
	return "0x" + hex.EncodeToString(data)
}

// Note: The following functions are placeholders for future implementation
// They will be implemented when connecting to blockchain RPC nodes

