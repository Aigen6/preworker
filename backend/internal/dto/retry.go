package dto

// ==================== Retry DTOs ====================

// RetryRequest Retry request
type RetryRequest struct {
	EntityID     string `json:"entity_id"`
	EntityType   string `json:"entity_type"` // "checkbook" | "check"
	FromStep     string `json:"from_step,omitempty"`
	ForceRestart bool   `json:"force_restart,omitempty"`
}

// RetryResponse Retry response
type RetryResponse struct {
	Success      bool   `json:"success"`
	Message      string `json:"message"`
	RetryStarted bool   `json:"retry_started"`
	FromStep     string `json:"from_step"`
}

// StatusResponse Status response
type StatusResponse struct {
	ID           string                 `json:"id"`
	Status       string                 `json:"status"`
	UserMessage  string                 `json:"user_message"`
	CanRetry     bool                   `json:"can_retry"`
	RetryOptions map[string]interface{} `json:"retry_options,omitempty"`
}

