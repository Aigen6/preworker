package clients

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// KYTOracleClient client for KYT Oracle service
type KYTOracleClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewKYTOracleClient creates a new KYT Oracle client
func NewKYTOracleClient(baseURL string) *KYTOracleClient {
	if baseURL == "" {
		baseURL = "http://localhost:8090"
	}
	return &KYTOracleClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			// GET requests should be fast (cache-only), but increase timeout for network issues
			// POST requests may query MistTrack API, so need more time
			Timeout: 30 * time.Second,
		},
	}
}

// MistTrackDetails represents detailed MistTrack risk information
type MistTrackDetails struct {
	Score         int           `json:"score"`
	HackingEvent  string        `json:"hacking_event,omitempty"`
	DetailList    []string      `json:"detail_list,omitempty"`
	RiskLevel     string        `json:"risk_level,omitempty"`
	RiskDetail    []interface{} `json:"risk_detail,omitempty"`
	RiskReportURL string        `json:"risk_report_url,omitempty"`
	// Address labels
	Labels    []string `json:"labels,omitempty"`
	LabelType string   `json:"label_type,omitempty"`
	// Malicious events statistics
	MaliciousEvents *MaliciousEvents `json:"malicious_events,omitempty"`
	// Used platforms
	UsedPlatforms *UsedPlatforms `json:"used_platforms,omitempty"`
	// Relation information
	RelationInfo   *RelationInfo          `json:"relation_info,omitempty"`
	AdditionalData map[string]interface{} `json:"-"` // For any additional fields
}

// MaliciousEvents represents malicious events statistics
type MaliciousEvents struct {
	Phishing       int      `json:"phishing"`
	Ransom         int      `json:"ransom"`
	Stealing       int      `json:"stealing"`
	Laundering     int      `json:"laundering"`
	PhishingList   []string `json:"phishing_list,omitempty"`
	RansomList     []string `json:"ransom_list,omitempty"`
	StealingList   []string `json:"stealing_list,omitempty"`
	LaunderingList []string `json:"laundering_list,omitempty"`
}

// UsedPlatforms represents platforms the address has used
type UsedPlatforms struct {
	Exchange *PlatformInfo `json:"exchange,omitempty"`
	DEX      *PlatformInfo `json:"dex,omitempty"`
	Mixer    *PlatformInfo `json:"mixer,omitempty"`
	NFT      *PlatformInfo `json:"nft,omitempty"`
}

// PlatformInfo represents platform information
type PlatformInfo struct {
	Count int      `json:"count"`
	List  []string `json:"list,omitempty"`
}

// RelationInfo represents related information
type RelationInfo struct {
	Wallet  *RelationItem `json:"wallet,omitempty"`
	ENS     *RelationItem `json:"ens,omitempty"`
	Twitter *RelationItem `json:"twitter,omitempty"`
}

// RelationItem represents a relation item
type RelationItem struct {
	Count int      `json:"count"`
	List  []string `json:"list,omitempty"`
}

// FeeInfo represents fee information from KYT Oracle
type FeeInfo struct {
	Success bool `json:"success"`
	Data    struct {
		BaseFee             string            `json:"baseFee"`
		FeeRateBps          int               `json:"feeRateBps"`
		Chain               string            `json:"chain"`
		Address             string            `json:"address"`
		TokenKey            string            `json:"tokenKey"`
		RiskLevel           string            `json:"riskLevel"`
		RiskScore           int               `json:"riskScore"`
		BaseFeeRatePercent  float64           `json:"baseFeeRatePercent"`
		RiskBasedFeePercent float64           `json:"riskBasedFeePercent"`
		FinalFeeRatePercent float64           `json:"finalFeeRatePercent"`
		InvitationCode      string            `json:"invitationCode"`
		InvitationSource    string            `json:"invitationSource"`
		MistTrackDetails    *MistTrackDetails `json:"mistTrackDetails,omitempty"`
	} `json:"data"`
	Error string `json:"error,omitempty"`
}

// InvitationCodeInfoData represents a single invitation code data item
type InvitationCodeInfoData struct {
	Code           string      `json:"code"`
	FeeRatePercent float64     `json:"fee_rate_percent"`
	Description    string      `json:"description"`
	Enabled        interface{} `json:"enabled"` // Can be bool or int (1/0)
	Source         string      `json:"source"`
	CreatedAt      interface{} `json:"created_at"` // Can be int64 or string
	UpdatedAt      interface{} `json:"updated_at"` // Can be int64 or string
}

// InvitationCodeInfo represents invitation code information
type InvitationCodeInfo struct {
	Success bool                   `json:"success"`
	Data    InvitationCodeInfoData `json:"data"`
	Error   string                 `json:"error,omitempty"`
}

// IsEnabled checks if the invitation code is enabled (handles both bool and int)
func (i *InvitationCodeInfo) IsEnabled() bool {
	if i.Data.Enabled == nil {
		return false
	}
	switch v := i.Data.Enabled.(type) {
	case bool:
		return v
	case int:
		return v != 0
	case float64:
		return v != 0
	default:
		return false
	}
}

// AssociateAddressRequest request to associate address with invitation code
type AssociateAddressRequest struct {
	Address string `json:"address"`
	Code    string `json:"code"`
	Chain   string `json:"chain,omitempty"`
}

// AssociateAddressResponse response from associating address
type AssociateAddressResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

// GetFeeInfo queries fee information for a given chain, address, and token
// GetFeeInfo queries fee information from cache only (GET request)
func (c *KYTOracleClient) GetFeeInfo(chain, address, tokenKey string) (*FeeInfo, error) {
	return c.getFeeInfoWithMethod("GET", chain, address, tokenKey)
}

// GetFeeInfoWithRefresh queries fee information with optional MistTrack refresh (POST request)
func (c *KYTOracleClient) GetFeeInfoWithRefresh(chain, address, tokenKey string) (*FeeInfo, error) {
	return c.getFeeInfoWithMethod("POST", chain, address, tokenKey)
}

// getFeeInfoWithMethod is the internal method that handles both GET and POST requests
func (c *KYTOracleClient) getFeeInfoWithMethod(method, chain, address, tokenKey string) (*FeeInfo, error) {
	var req *http.Request
	var err error

	if method == "GET" {
		url := fmt.Sprintf("%s/api/v1/fees?chain=%s", c.baseURL, chain)
		if address != "" {
			url += fmt.Sprintf("&address=%s", address)
		}
		if tokenKey != "" {
			url += fmt.Sprintf("&tokenKey=%s", tokenKey)
		}

		req, err = http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
	} else {
		// POST request
		url := fmt.Sprintf("%s/api/v1/fees", c.baseURL)
		body := map[string]interface{}{
			"chain": chain,
		}
		if address != "" {
			body["address"] = address
		}
		if tokenKey != "" {
			body["tokenKey"] = tokenKey
		}

		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}

		req, err = http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("oracle returned status %d: %s", resp.StatusCode, string(body))
	}

	var feeInfo FeeInfo
	if err := json.Unmarshal(body, &feeInfo); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if !feeInfo.Success {
		return nil, fmt.Errorf("oracle returned error: %s", feeInfo.Error)
	}

	// Parse mistTrackDetails if present (it may be a map[string]interface{} in JSON)
	// If struct unmarshaling failed, try to extract from raw JSON
	if feeInfo.Data.MistTrackDetails == nil {
		// Try to extract from raw JSON and manually parse
		var rawData map[string]interface{}
		if err := json.Unmarshal(body, &rawData); err == nil {
			if data, ok := rawData["data"].(map[string]interface{}); ok {
				if mistTrackRaw, ok := data["mistTrackDetails"].(map[string]interface{}); ok {
					// Extract counterparty and other additional fields before unmarshaling
					additionalData := make(map[string]interface{})
					if counterparty, ok := mistTrackRaw["counterparty"]; ok {
						additionalData["counterparty"] = counterparty
					}

					// Create a temporary struct to hold all fields, then convert to MistTrackDetails
					// Use json.Marshal/Unmarshal to properly handle nested structures
					mistTrackJSON, err := json.Marshal(mistTrackRaw)
					if err == nil {
						var mistTrackDetails MistTrackDetails
						if err := json.Unmarshal(mistTrackJSON, &mistTrackDetails); err == nil {
							// Store additional fields in AdditionalData
							mistTrackDetails.AdditionalData = additionalData
							feeInfo.Data.MistTrackDetails = &mistTrackDetails
						}
					}
				}
			}
		}
	} else {
		// If MistTrackDetails was parsed successfully, also check for counterparty in raw JSON
		var rawData map[string]interface{}
		if err := json.Unmarshal(body, &rawData); err == nil {
			if data, ok := rawData["data"].(map[string]interface{}); ok {
				if mistTrackRaw, ok := data["mistTrackDetails"].(map[string]interface{}); ok {
					if counterparty, ok := mistTrackRaw["counterparty"]; ok {
						if feeInfo.Data.MistTrackDetails.AdditionalData == nil {
							feeInfo.Data.MistTrackDetails.AdditionalData = make(map[string]interface{})
						}
						feeInfo.Data.MistTrackDetails.AdditionalData["counterparty"] = counterparty
					}
				}
			}
		}
	}

	return &feeInfo, nil
}

// GetInvitationCodeByAddress queries invitation code for a given address
func (c *KYTOracleClient) GetInvitationCodeByAddress(address, chain string) (*InvitationCodeInfo, error) {
	// Query invitation codes by address
	url := fmt.Sprintf("%s/api/v1/invitation-codes?address=%s&chain=%s", c.baseURL, address, chain)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("no invitation code found for address")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("oracle returned status %d: %s", resp.StatusCode, string(body))
	}

	// Response is an array of invitation codes
	var response struct {
		Success bool                     `json:"success"`
		Data    []InvitationCodeInfoData `json:"data"`
		Error   string                   `json:"error,omitempty"`
	}

	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if !response.Success {
		return nil, fmt.Errorf("oracle returned error: %s", response.Error)
	}

	if len(response.Data) == 0 {
		return nil, fmt.Errorf("no invitation code found for address")
	}

	// Return the first invitation code (most recent or primary)
	result := &InvitationCodeInfo{
		Success: true,
		Data:    response.Data[0],
	}

	return result, nil
}

// AssociateAddressWithCode associates an address with an invitation code
func (c *KYTOracleClient) AssociateAddressWithCode(address, code, chain string) error {
	url := fmt.Sprintf("%s/api/v1/address-invitations", c.baseURL)

	reqBody := AssociateAddressRequest{
		Address: address,
		Code:    code,
		Chain:   chain,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("oracle returned status %d: %s", resp.StatusCode, string(body))
	}

	var result AssociateAddressResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("oracle returned error: %s", result.Error)
	}

	return nil
}

// TestConnection tests the connection to KYT Oracle service
func (c *KYTOracleClient) TestConnection() error {
	// Try to call the health check endpoint or a simple endpoint
	url := fmt.Sprintf("%s/health", c.baseURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create test request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to KYT Oracle: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("KYT Oracle health check returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
