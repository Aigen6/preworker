package handlers

import (
	"go-backend/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MultisigHandler struct {
	db      *gorm.DB
	service *services.MultisigService
}

func NewMultisigHandler(db *gorm.DB) *MultisigHandler {
	return &MultisigHandler{
		db:      db,
		service: services.NewMultisigService(db),
	}
}

// GetProposals 获取多签提案列表
// GET /api/multisig/proposals
func (h *MultisigHandler) GetProposals(c *gin.Context) {
	// 解析查询参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status")
	chainIDStr := c.Query("chain_id")
	proposalType := c.Query("type")

	var chainID *int64
	if chainIDStr != "" {
		if id, err := strconv.ParseInt(chainIDStr, 10, 64); err == nil {
			chainID = &id
		}
	}

	proposals, total, err := h.service.GetProposals(page, pageSize, status, chainID, proposalType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    proposals,
		"pagination": gin.H{
			"page":       page,
			"page_size":  pageSize,
			"total":      total,
			"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
		},
	})
}

// GetProposal 获取单个提案详情
// GET /api/multisig/proposals/:proposalId
func (h *MultisigHandler) GetProposal(c *gin.Context) {
	proposalID := c.Param("proposalId")
	chainIDStr := c.Query("chain_id")

	var chainID int64
	if chainIDStr != "" {
		if id, err := strconv.ParseInt(chainIDStr, 10, 64); err == nil {
			chainID = id
		}
	}

	proposal, err := h.service.GetProposal(proposalID, chainID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Proposal not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// 获取签名列表
	signatures, _ := h.service.GetProposalSignatures(proposalID, chainID)

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"data":       proposal,
		"signatures": signatures,
	})
}

// GetProposalStatus 获取提案状态（从链上查询）
// GET /api/multisig/proposals/:proposalId/status
func (h *MultisigHandler) GetProposalStatus(c *gin.Context) {
	proposalID := c.Param("proposalId")
	chainIDStr := c.Query("chain_id")

	var chainID int64
	if chainIDStr != "" {
		if id, err := strconv.ParseInt(chainIDStr, 10, 64); err == nil {
			chainID = id
		}
	}

	status, err := h.service.GetProposalStatusFromChain(proposalID, chainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status,
	})
}

// RetryProposal 重新执行失败的提案
// POST /api/multisig/proposals/:proposalId/retry
func (h *MultisigHandler) RetryProposal(c *gin.Context) {
	proposalID := c.Param("proposalId")
	chainIDStr := c.Query("chain_id")

	var chainID int64
	if chainIDStr != "" {
		if id, err := strconv.ParseInt(chainIDStr, 10, 64); err == nil {
			chainID = id
		}
	}

	result, err := h.service.RetryProposal(proposalID, chainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// GetSystemStatus 获取多签系统状态
// GET /api/multisig/status
func (h *MultisigHandler) GetSystemStatus(c *gin.Context) {
	chainIDStr := c.Query("chain_id")

	var chainID *int64
	if chainIDStr != "" {
		if id, err := strconv.ParseInt(chainIDStr, 10, 64); err == nil {
			chainID = &id
		}
	}

	status, err := h.service.GetSystemStatus(chainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status,
	})
}





