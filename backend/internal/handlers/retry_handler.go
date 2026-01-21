package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"go-backend/internal/dto"
	"go-backend/internal/models"
	"go-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// use dto
type RetryRequest = dto.RetryRequest
type RetryResponse = dto.RetryResponse
type StatusResponse = dto.StatusResponse

// retryprocess
type RetryHandler struct {
	db               *gorm.DB
	pollingService   *services.UnifiedPollingService
	pushService      *services.WebSocketPushService
	checkbookService *services.CheckbookService
	// checkService     *services.CheckService // ，wait
}

// createretryprocess
func NewRetryHandler(
	db *gorm.DB,
	pollingService *services.UnifiedPollingService,
	pushService *services.WebSocketPushService,
	checkbookService *services.CheckbookService,
	// checkService *services.CheckService, // ，wait
) *RetryHandler {
	return &RetryHandler{
		db:               db,
		pollingService:   pollingService,
		pushService:      pushService,
		checkbookService: checkbookService,
		// checkService:     checkService, // ，wait
	}
}

// retryinterface
func (h *RetryHandler) HandleRetry(w http.ResponseWriter, r *http.Request) {
	var req RetryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// verifyrequest
	if req.EntityID == "" || req.EntityType == "" {
		http.Error(w, "Missing entity_id or entity_type", http.StatusBadRequest)
		return
	}

	if req.EntityType != "checkbook" && req.EntityType != "check" {
		http.Error(w, "Invalid entity_type, must be 'checkbook' or 'check'", http.StatusBadRequest)
		return
	}

	// retry
	err := h.executeRetry(req)
	if err != nil {
		response := RetryResponse{
			Success: false,
			Message: err.Error(),
		}
		h.sendJSONResponse(w, response, http.StatusInternalServerError)
		return
	}

	// returnsuccessresponse
	response := RetryResponse{
		Success:      true,
		Message:      "🔄 retryrequestalready，statusupdate",
		RetryStarted: true,
		FromStep:     req.FromStep,
	}

	h.sendJSONResponse(w, response, http.StatusOK)
}

// Checkbookretryinterface
func (h *RetryHandler) HandleCheckbookRetry(w http.ResponseWriter, r *http.Request) {
	// URLID
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid URL path", http.StatusBadRequest)
		return
	}
	// Fix: Get ID from last part of path, not second-to-last
	// URL: /api/retry/checkbook/{id}
	// pathParts: ["", "api", "retry", "checkbook", "{id}"]
	checkbookID := pathParts[len(pathParts)-1] // Get last part (the ID)

	var req struct {
		FromStep     string `json:"from_step,omitempty"`
		ForceRestart bool   `json:"force_restart,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	retryReq := RetryRequest{
		EntityID:     checkbookID,
		EntityType:   "checkbook",
		FromStep:     req.FromStep,
		ForceRestart: req.ForceRestart,
	}

	err := h.executeRetry(retryReq)
	if err != nil {
		response := RetryResponse{
			Success: false,
			Message: err.Error(),
		}
		h.sendJSONResponse(w, response, http.StatusInternalServerError)
		return
	}

	response := RetryResponse{
		Success:      true,
		Message:      "🔄 transferretryalreadystart",
		RetryStarted: true,
		FromStep:     req.FromStep,
	}

	h.sendJSONResponse(w, response, http.StatusOK)
}

// HandleCheckbookRetryWithContext uses Gin context to get ID parameter
// This is the preferred method when using Gin router
func (h *RetryHandler) HandleCheckbookRetryWithContext(c *gin.Context) {
	checkbookID := c.Param("id")
	if checkbookID == "" {
		c.JSON(http.StatusBadRequest, RetryResponse{
			Success: false,
			Message: "Missing checkbook ID",
		})
		return
	}

	var req struct {
		FromStep     string `json:"from_step,omitempty"`
		ForceRestart bool   `json:"force_restart,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, RetryResponse{
			Success: false,
			Message: fmt.Sprintf("Invalid JSON: %v", err),
		})
		return
	}

	retryReq := RetryRequest{
		EntityID:     checkbookID,
		EntityType:   "checkbook",
		FromStep:     req.FromStep,
		ForceRestart: req.ForceRestart,
	}

	err := h.executeRetry(retryReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, RetryResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, RetryResponse{
		Success:      true,
		Message:      "🔄 transferretryalreadystart",
		RetryStarted: true,
		FromStep:     req.FromStep,
	})
}

// Checkretryinterface
func (h *RetryHandler) HandleCheckRetry(w http.ResponseWriter, r *http.Request) {
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid URL path", http.StatusBadRequest)
		return
	}
	checkID := pathParts[len(pathParts)-2]

	var req struct {
		FromStep     string `json:"from_step,omitempty"`
		ForceRestart bool   `json:"force_restart,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	retryReq := RetryRequest{
		EntityID:     checkID,
		EntityType:   "check",
		FromStep:     req.FromStep,
		ForceRestart: req.ForceRestart,
	}

	err := h.executeRetry(retryReq)
	if err != nil {
		response := RetryResponse{
			Success: false,
			Message: err.Error(),
		}
		h.sendJSONResponse(w, response, http.StatusInternalServerError)
		return
	}

	response := RetryResponse{
		Success:      true,
		Message:      "🔄 retryalreadystart",
		RetryStarted: true,
		FromStep:     req.FromStep,
	}

	h.sendJSONResponse(w, response, http.StatusOK)
}

// Checkbookstatusquery
func (h *RetryHandler) HandleCheckbookStatus(w http.ResponseWriter, r *http.Request) {
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid URL path", http.StatusBadRequest)
		return
	}
	checkbookID := pathParts[len(pathParts)-2]

	var checkbook models.Checkbook
	err := h.db.Where("id = ?", checkbookID).First(&checkbook).Error
	if err != nil {
		http.Error(w, "Checkbook not found", http.StatusNotFound)
		return
	}

	response := h.buildCheckbookStatusResponse(&checkbook)
	h.sendJSONResponse(w, response, http.StatusOK)
}

// Checkstatusquery
func (h *RetryHandler) HandleCheckStatus(w http.ResponseWriter, r *http.Request) {
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid URL path", http.StatusBadRequest)
		return
	}
	checkID := pathParts[len(pathParts)-2]

	var check models.Check
	err := h.db.Where("id = ?", checkID).First(&check).Error
	if err != nil {
		http.Error(w, "Check not found", http.StatusNotFound)
		return
	}

	response := h.buildCheckStatusResponse(&check)
	h.sendJSONResponse(w, response, http.StatusOK)
}

// retry
func (h *RetryHandler) executeRetry(req RetryRequest) error {
	switch req.EntityType {
	case "checkbook":
		return h.retryCheckbook(req)
	case "check":
		return h.retryCheck(req)
	default:
		return fmt.Errorf("unsupported entity type: %s", req.EntityType)
	}
}

// retryCheckbook
func (h *RetryHandler) retryCheckbook(req RetryRequest) error {
	var checkbook models.Checkbook
	err := h.db.Where("id = ?", req.EntityID).First(&checkbook).Error
	if err != nil {
		return fmt.Errorf("checkbook not found: %w", err)
	}

	// retry
	fromStep := req.FromStep
	if fromStep == "" && !req.ForceRestart {
		fromStep = h.determineCheckbookRetryStep(checkbook.Status)
	}

	// forcestart
	if req.ForceRestart {
		fromStep = string(models.CheckbookStatusGeneratingProof)
		// data
		h.clearCheckbookProofData(req.EntityID)
	}

	// retry
	switch fromStep {
	case string(models.CheckbookStatusGeneratingProof), string(models.CheckbookStatusProofFailed):
		return h.retryCheckbookFromProofGeneration(req.EntityID, &checkbook)
	case string(models.CheckbookStatusSubmittingCommitment), string(models.CheckbookStatusSubmissionFailed):
		return h.retryCheckbookFromCommitmentSubmission(req.EntityID, &checkbook)
	default:
		return fmt.Errorf("status %s retry", checkbook.Status)
	}
}

// retryCheck
func (h *RetryHandler) retryCheck(req RetryRequest) error {
	var check models.Check
	err := h.db.Where("id = ?", req.EntityID).First(&check).Error
	if err != nil {
		return fmt.Errorf("check not found: %w", err)
	}

	// retry
	fromStep := req.FromStep
	if fromStep == "" && !req.ForceRestart {
		fromStep = h.determineCheckRetryStep(string(check.Status)) // check.Status convert to string
	}

	// forcestart
	if req.ForceRestart {
		fromStep = string(models.CheckStatusPendingProof)
		// data
		h.clearCheckProofData(req.EntityID)
	}

	// retry
	switch fromStep {
	case string(models.CheckStatusPendingProof), string(models.CheckStatusProofFailed):
		return h.retryCheckFromProofGeneration(req.EntityID, &check)
	case string(models.CheckStatusSubmittingToManagement), string(models.CheckStatusSubmissionFailed):
		return h.retryCheckFromManagementSubmission(req.EntityID, &check)
	case string(models.CheckStatusManagementPending):
		return h.retryCheckFromManagementPending(req.EntityID, &check)
	case string(models.CheckStatusCrossChainProcessing), string(models.CheckStatusCrossChainFailed):
		return h.retryCheckFromCrossChain(req.EntityID, &check)
	default:
		return fmt.Errorf("status %s retry", check.Status)
	}
}

// Checkbookretry
func (h *RetryHandler) determineCheckbookRetryStep(status models.CheckbookStatus) string {
	switch status {
	case models.CheckbookStatusProofFailed:
		return string(models.CheckbookStatusGeneratingProof)
	case models.CheckbookStatusSubmissionFailed:
		return string(models.CheckbookStatusSubmittingCommitment)
	default:
		return string(status)
	}
}

// Checkretry
func (h *RetryHandler) determineCheckRetryStep(status string) string {
	switch status {
	case string(models.CheckStatusProofFailed):
		return string(models.CheckStatusPendingProof)
	case string(models.CheckStatusSubmissionFailed):
		return string(models.CheckStatusSubmittingToManagement)
	case string(models.CheckStatusCrossChainFailed):
		return string(models.CheckStatusCrossChainProcessing)
	default:
		return status
	}
}

// retryCheckbook
func (h *RetryHandler) retryCheckbookFromProofGeneration(checkbookID string, checkbook *models.Checkbook) error {
	// CheckbookServiceretry
	// needretry
	return h.checkbookService.RetryProofGeneration(checkbookID)
}

// commitmentretryCheckbook
func (h *RetryHandler) retryCheckbookFromCommitmentSubmission(checkbookID string, checkbook *models.Checkbook) error {
	// CheckbookServiceretry
	return h.checkbookService.RetryCommitmentSubmission(checkbookID)
}

// retryCheck
func (h *RetryHandler) retryCheckFromProofGeneration(checkID string, check *models.Check) error {
	// CheckServiceretry
	// return h.checkService.RetryProofGeneration(checkID) // ，wait
	return fmt.Errorf("Check service temporarily disabled for refactoring")
}

// retryCheck
func (h *RetryHandler) retryCheckFromManagementSubmission(checkID string, check *models.Check) error {
	// return h.checkService.RetryManagementSubmission(checkID) // ，wait
	return fmt.Errorf("Check service temporarily disabled for refactoring")
}

// waitretryCheck
func (h *RetryHandler) retryCheckFromManagementPending(checkID string, check *models.Check) error {
	// return h.checkService.RetryFromManagementPending(checkID) // ，wait
	return fmt.Errorf("Check service temporarily disabled for refactoring")
}

// processretryCheck
func (h *RetryHandler) retryCheckFromCrossChain(checkID string, check *models.Check) error {
	// return h.checkService.RetryFromCrossChain(checkID) // ，wait
	return fmt.Errorf("Check service temporarily disabled for refactoring")
}

// Checkbookdata
func (h *RetryHandler) clearCheckbookProofData(checkbookID string) {
	h.db.Model(&models.Checkbook{}).
		Where("id = ?", checkbookID).
		Updates(map[string]interface{}{
			"proof_signature": "",
			"commitment":      "",
		})
}

// Checkdata
func (h *RetryHandler) clearCheckProofData(checkID string) {
	h.db.Model(&models.Check{}).
		Where("id = ?", checkID).
		Updates(map[string]interface{}{
			"proof":     "",
			"proved_at": nil,
		})
}

// Checkbookstatusresponse
func (h *RetryHandler) buildCheckbookStatusResponse(checkbook *models.Checkbook) StatusResponse {
	response := StatusResponse{
		ID:          checkbook.ID,
		Status:      string(checkbook.Status),
		UserMessage: h.getCheckbookUserMessage(checkbook.Status),
		CanRetry:    h.canRetryCheckbook(checkbook.Status),
	}

	if response.CanRetry {
		response.RetryOptions = h.getCheckbookRetryOptions(checkbook.Status)
	}

	return response
}

// Checkstatusresponse
func (h *RetryHandler) buildCheckStatusResponse(check *models.Check) StatusResponse {
	response := StatusResponse{
		ID:          check.ID,
		Status:      string(check.Status), // check.Status convert to string
		UserMessage: h.getCheckUserMessage(string(check.Status)),
		CanRetry:    h.canRetryCheck(string(check.Status)),
	}

	if response.CanRetry {
		response.RetryOptions = h.getCheckRetryOptions(string(check.Status))
	}

	return response
}

// getCheckbookusermessage
func (h *RetryHandler) getCheckbookUserMessage(status models.CheckbookStatus) string {
	messages := map[models.CheckbookStatus]string{
		models.CheckbookStatusPending:              "💰 depositalready，in progressprocess...",
		models.CheckbookStatusUnsigned:             "✅ depositalreadyconfirm，in progress...",
		models.CheckbookStatusReadyForCommitment:   "🔐 already，",
		models.CheckbookStatusGeneratingProof:      "⚡ in progresstransfer...",
		models.CheckbookStatusSubmittingCommitment: "📝 transferalready，in progresssaveblockchain...",
		models.CheckbookStatusCommitmentPending:    "⏳ transferalready，waitblockchainconfirm...",
		models.CheckbookStatusWithCheckbook:        "🎉 transferalreadycompleted，can",
		models.CheckbookStatusProofFailed:          "❌ failed，retry",
		models.CheckbookStatusSubmissionFailed:     "⚠️ failed，retry",
	}

	if msg, exists := messages[status]; exists {
		return msg
	}
	return string(status)
}

// getCheckusermessage
func (h *RetryHandler) getCheckUserMessage(status string) string {
	messages := map[string]string{
		string(models.CheckStatusPendingProof):           "🔒 in progresswithdraw...",
		string(models.CheckStatusSubmittingToManagement): "💳 withdrawalready，in progressprocess...",
		string(models.CheckStatusManagementPending):      "📤 withdrawrequestalready，in progressprocess...",
		string(models.CheckStatusCrossChainProcessing):   "🌐 in progresstransfertargetnetwork，...",
		string(models.CheckStatusCompleted):              "🎊 withdrawsuccess！already",
		string(models.CheckStatusProofFailed):            "❌ withdrawfailed，retry",
		string(models.CheckStatusSubmissionFailed):       "⚠️ processfailed，retry",
		string(models.CheckStatusCrossChainFailed):       "⚠️ process，in progressretry...",
	}

	if msg, exists := messages[status]; exists {
		return msg
	}
	return string(status)
}

// checkCheckbookwhethercanretry
func (h *RetryHandler) canRetryCheckbook(status models.CheckbookStatus) bool {
	retryableStatuses := []models.CheckbookStatus{
		models.CheckbookStatusProofFailed,
		models.CheckbookStatusSubmissionFailed,
	}

	for _, s := range retryableStatuses {
		if status == s {
			return true
		}
	}
	return false
}

// checkCheckwhethercanretry
func (h *RetryHandler) canRetryCheck(status string) bool {
	retryableStatuses := []string{
		string(models.CheckStatusProofFailed),
		string(models.CheckStatusSubmissionFailed),
		string(models.CheckStatusCrossChainFailed),
	}

	for _, s := range retryableStatuses {
		if status == s {
			return true
		}
	}
	return false
}

// getCheckbookretry
func (h *RetryHandler) getCheckbookRetryOptions(status models.CheckbookStatus) map[string]interface{} {
	options := make(map[string]interface{})

	switch status {
	case models.CheckbookStatusProofFailed:
		options["from_current"] = map[string]interface{}{
			"step":  "generating_proof",
			"label": "🔄 ",
		}
		options["from_beginning"] = map[string]interface{}{
			"step":  "generating_proof",
			"label": "🆕 start",
		}
	case models.CheckbookStatusSubmissionFailed:
		options["from_current"] = map[string]interface{}{
			"step":  "submitting_commitment",
			"label": "🔄 ",
		}
		options["from_beginning"] = map[string]interface{}{
			"step":  "generating_proof",
			"label": "🆕 start",
		}
	}

	return options
}

// getCheckretry
func (h *RetryHandler) getCheckRetryOptions(status string) map[string]interface{} {
	options := make(map[string]interface{})

	switch status {
	case string(models.CheckStatusProofFailed):
		options["from_current"] = map[string]interface{}{
			"step":  "pending_proof",
			"label": "🔄 ",
		}
		options["from_beginning"] = map[string]interface{}{
			"step":  "pending_proof",
			"label": "🆕 start",
		}
	case string(models.CheckStatusSubmissionFailed):
		options["from_current"] = map[string]interface{}{
			"step":  "submitting_to_management",
			"label": "🔄 ",
		}
		options["from_beginning"] = map[string]interface{}{
			"step":  "pending_proof",
			"label": "🆕 start",
		}
	case string(models.CheckStatusCrossChainFailed):
		options["from_current"] = map[string]interface{}{
			"step":  "cross_chain_processing",
			"label": "🔄 process",
		}
		options["from_beginning"] = map[string]interface{}{
			"step":  "pending_proof",
			"label": "🆕 start",
		}
	}

	return options
}

// JSONresponse
func (h *RetryHandler) sendJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}
