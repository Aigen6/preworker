package clients

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"go-backend/internal/config"
)

// =====  Scanner Client =====

// ScannerClient  BlockScanner HTTP 
type ScannerClient struct {
	BaseURL string
	Client  *http.Client
}

// NewScannerClient  Scanner 
func NewScannerClient(baseURL string) *ScannerClient {
	// timeoutfrom configuration file， 30
	timeout := 30 * time.Second

	if config.AppConfig != nil && config.AppConfig.Scanner.Timeout > 0 {
		timeout = time.Duration(config.AppConfig.Scanner.Timeout) * time.Second
	}

	return &ScannerClient{
		BaseURL: baseURL,
		Client: &http.Client{
			Timeout: timeout,
		},
	}
}

// ===== Deposit  =====

// GetDepositsByAddress  deposit 
func (c *ScannerClient) GetDepositsByAddress(address string, page, limit int) (*DepositsByAddressResponse, error) {
	url := fmt.Sprintf("%s/api/data/deposits/by-address/%s?page=%d&limit=%d", c.BaseURL, address, page, limit)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var result DepositsByAddressResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetDeposit  deposit 
func (c *ScannerClient) GetDeposit(chainID int, depositID int64) (*DepositResponse, error) {
	url := fmt.Sprintf("%s/api/data/deposit/%d/%d", c.BaseURL, chainID, depositID)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var result DepositResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// ===== Commitment  =====

// GetCommitmentsByAddress  commitment 
func (c *ScannerClient) GetCommitmentsByAddress(address string, page, limit int) (*CommitmentsByAddressResponse, error) {
	url := fmt.Sprintf("%s/api/data/commitments/by-address/%s?page=%d&limit=%d", c.BaseURL, address, page, limit)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var result CommitmentsByAddressResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// CheckCommitmentExists  commitment exists
func (c *ScannerClient) CheckCommitmentExists(chainID int, commitment string) (*CommitmentExistsResponse, error) {
	url := fmt.Sprintf("%s/api/data/commitment/exists?chainId=%d&commitment=%s", c.BaseURL, chainID, commitment)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var result CommitmentExistsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetCommitmentRoot  commitment corresponding to root
func (c *ScannerClient) GetCommitmentRoot(commitment string) (*CommitmentRootResponse, error) {
	url := fmt.Sprintf("%s/api/commitment/root?commitment=%s", c.BaseURL, commitment)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scanner service returned error: %s", string(body))
	}

	var result CommitmentRootResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetCommitmentsFromCommitment  commitment started commitment
func (c *ScannerClient) GetCommitmentsFromCommitment(commitment string) (*CommitmentsFromCommitmentResponse, error) {
	url := fmt.Sprintf("%s/api/commitment/from?commitment=%s", c.BaseURL, commitment)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scanner service returned error: %s", string(body))
	}

	var result CommitmentsFromCommitmentResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetCommitmentRootUpdatedByNewRoot  CommitmentRootUpdated event by NewRoot
// chainID should be SLIP-44 chain ID (e.g., 714 for BSC, 60 for Ethereum)
// BlockScanner stores data using SLIP-44 chain ID, so we use it directly for query
func (c *ScannerClient) GetCommitmentRootUpdatedByNewRoot(newRoot string, chainID int64) (*EventCommitmentRootUpdatedResponse, error) {
	// BlockScanner stores data using SLIP-44 chain ID (from s.chain.SLIP44ChainID)
	// So we use SLIP-44 chain ID directly for query
	url := fmt.Sprintf("%s/api/data/events?chainId=%d&newQueueRoot=%s", c.BaseURL, chainID, newRoot)

	log.Printf("🔍 [Scanner API] Querying CommitmentRootUpdated: SLIP44=%d, newRoot=%s", chainID, newRoot)

	resp, err := c.Client.Get(url)
	if err != nil {
		log.Printf("❌ [Scanner API] failed: %v", err)
		return nil, fmt.Errorf("failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("❌ [Scanner API] HTTP error: status=%d", resp.StatusCode)
		return nil, fmt.Errorf("API failed: status=%d", resp.StatusCode)
	}

	var response struct {
		Success    bool                     `json:"success"`
		Events     []map[string]interface{} `json:"events"`
		TotalCount int64                    `json:"totalCount"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		log.Printf("❌ [Scanner API] parsing failed: %v", err)
		return nil, fmt.Errorf("failed: %w", err)
	}

	if !response.Success || len(response.Events) == 0 {
		log.Printf("📍 [Scanner API] not found CommitmentRootUpdated event: newRoot=%s", newRoot)
		return nil, nil
	}

	eventData := response.Events[0]

	event := &EventCommitmentRootUpdatedResponse{
		ChainID:         chainID,
		ContractAddress: getString(eventData, "contractAddress"),
		ContractName:    "ZKPayProxy",
		EventName:       getString(eventData, "eventName"),
		BlockNumber:     getUint64(eventData, "blockNumber"),
		TransactionHash: getString(eventData, "txHash"),
		LogIndex:        uint(getUint64(eventData, "logIndex")),
		BlockTimestamp:  getTime(eventData, "timestamp"),
		EventData: struct {
			OldRoot    string `json:"oldRoot"`
			Commitment string `json:"commitment"`
			NewRoot    string `json:"newRoot"`
		}{
			OldRoot:    getString(eventData, "oldRoot"),
			Commitment: getString(eventData, "commitment"),
			NewRoot:    getString(eventData, "newRoot"),
		},
	}

	log.Printf("✅ [Scanner API]  CommitmentRootUpdated: OldRoot=%s, NewRoot=%s", event.EventData.OldRoot, event.EventData.NewRoot)
	return event, nil
}

// GetCommitmentRootUpdatedHistory  CommitmentRootUpdated 
func (c *ScannerClient) GetCommitmentRootUpdatedHistory(chainID int64, limit int) ([]*EventCommitmentRootUpdatedResponse, error) {
	url := fmt.Sprintf("%s/api/events/commitment-root-updated/history", c.BaseURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed: %w", err)
	}

	q := req.URL.Query()
	q.Add("chainId", fmt.Sprintf("%d", chainID))
	q.Add("limit", fmt.Sprintf("%d", limit))
	req.URL.RawQuery = q.Encode()

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API failed: status=%d", resp.StatusCode)
	}

	var events []*EventCommitmentRootUpdatedResponse
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return nil, fmt.Errorf("failed: %w", err)
	}

	return events, nil
}

// ===== Nullifier  =====

// CheckNullifierUsed  nullifier use
func (c *ScannerClient) CheckNullifierUsed(chainID int, nullifierHash string) (*NullifierUsedResponse, error) {
	url := fmt.Sprintf("%s/api/data/nullifier/used?chainId=%d&nullifierHash=%s", c.BaseURL, chainID, nullifierHash)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var result NullifierUsedResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// =====  =====

// QueryEvents 
func (c *ScannerClient) QueryEvents(params EventQueryParams) (*EventSearchResponse, error) {
	apiURL := fmt.Sprintf("%s/api/data/events", c.BaseURL)

	queryParams := url.Values{}
	queryParams.Add("chainId", strconv.FormatInt(params.ChainID, 10))

	
	if params.Address != "" {
		queryParams.Add("address", params.Address)
	}
	if params.ContractAddr != "" {
		queryParams.Add("contractAddr", params.ContractAddr)
	}
	if params.TxHash != "" {
		queryParams.Add("txHash", params.TxHash)
	}
	if params.EventType != "" {
		queryParams.Add("eventType", params.EventType)
	}
	if params.FromBlock != "" {
		queryParams.Add("fromBlock", params.FromBlock)
	}
	if params.ToBlock != "" {
		queryParams.Add("toBlock", params.ToBlock)
	}

	
	if params.Depositor != "" {
		queryParams.Add("depositor", params.Depositor)
	}
	if params.Recipient != "" {
		queryParams.Add("recipient", params.Recipient)
	}
	if params.Token != "" {
		queryParams.Add("token", params.Token)
	}
	if params.Amount != "" {
		queryParams.Add("amount", params.Amount)
	}
	if params.LocalDepositID != "" {
		queryParams.Add("localDepositId", params.LocalDepositID)
	}
	if params.PromoteCode != "" {
		queryParams.Add("promoteCode", params.PromoteCode)
	}
	if params.Commitment != "" {
		queryParams.Add("commitment", params.Commitment)
	}
	if params.NullifierHash != "" {
		queryParams.Add("nullifierHash", params.NullifierHash)
	}
	if params.Submitter != "" {
		queryParams.Add("submitter", params.Submitter)
	}

	
	if params.Page > 0 {
		queryParams.Add("page", strconv.Itoa(params.Page))
	}
	if params.Limit > 0 {
		queryParams.Add("limit", strconv.Itoa(params.Limit))
	}

	fullURL := fmt.Sprintf("%s?%s", apiURL, queryParams.Encode())

	resp, err := c.Client.Get(fullURL)
	if err != nil {
		return nil, fmt.Errorf("failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed，: %d", resp.StatusCode)
	}

	var result EventSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed: %w", err)
	}

	return &result, nil
}

// =====  =====

// QueryDepositsByAddress  deposit event
func (c *ScannerClient) QueryDepositsByAddress(chainID int64, address string, page, limit int) (*EventSearchResponse, error) {
	return c.QueryEvents(EventQueryParams{
		ChainID:   chainID,
		Depositor: address,
		EventType: "DepositReceived",
		Page:      page,
		Limit:     limit,
	})
}

// QueryDepositsByAmount  deposit event
func (c *ScannerClient) QueryDepositsByAmount(chainID int64, amount string, page, limit int) (*EventSearchResponse, error) {
	return c.QueryEvents(EventQueryParams{
		ChainID:   chainID,
		Amount:    amount,
		EventType: "DepositReceived",
		Page:      page,
		Limit:     limit,
	})
}

// QueryDepositsByPromoteCode  deposit event
func (c *ScannerClient) QueryDepositsByPromoteCode(chainID int64, promoteCode string, page, limit int) (*EventSearchResponse, error) {
	return c.QueryEvents(EventQueryParams{
		ChainID:     chainID,
		PromoteCode: promoteCode,
		EventType:   "DepositReceived",
		Page:        page,
		Limit:       limit,
	})
}

// QueryWithdrawalsByNullifier  nullifier  withdraw event
func (c *ScannerClient) QueryWithdrawalsByNullifier(chainID int64, nullifierHash string, page, limit int) (*EventSearchResponse, error) {
	return c.QueryEvents(EventQueryParams{
		ChainID:       chainID,
		NullifierHash: nullifierHash,
		EventType:     "WithdrawRequested",
		Page:          page,
		Limit:         limit,
	})
}

// QueryEventsByTxHash  event
func (c *ScannerClient) QueryEventsByTxHash(chainID int64, txHash string) (*EventSearchResponse, error) {
	return c.QueryEvents(EventQueryParams{
		ChainID: chainID,
		TxHash:  txHash,
		Limit:   100,
	})
}

// QueryRecentDeposits  deposit event
func (c *ScannerClient) QueryRecentDeposits(chainID int64, fromBlock string, limit int) (*EventSearchResponse, error) {
	return c.QueryEvents(EventQueryParams{
		ChainID:   chainID,
		EventType: "DepositReceived",
		FromBlock: fromBlock,
		Limit:     limit,
	})
}

// QueryCommitmentRootUpdates  event
func (c *ScannerClient) QueryCommitmentRootUpdates(chainID int64, fromBlock string, limit int) (*EventSearchResponse, error) {
	return c.QueryEvents(EventQueryParams{
		ChainID:   chainID,
		EventType: "CommitmentRootUpdated",
		FromBlock: fromBlock,
		Limit:     limit,
	})
}

// =====  =====

// getString  map 
func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// getUint64  map  uint64
func getUint64(m map[string]interface{}, key string) uint64 {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case float64:
			return uint64(val)
		case int:
			return uint64(val)
		case int64:
			return uint64(val)
		case uint64:
			return val
		}
	}
	return 0
}

// getTime  map 
func getTime(m map[string]interface{}, key string) time.Time {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				return t
			}
		}
	}
	return time.Now()
}

// ===== （） =====

// BlockchainScannerClient for compatibility
type BlockchainScannerClient = ScannerClient

// NewBlockchainScannerClient  Scanner （）
func NewBlockchainScannerClient(baseURL string) *BlockchainScannerClient {
	return NewScannerClient(baseURL)
}

// UniversalScannerClient for compatibility
type UniversalScannerClient = ScannerClient

// NewUniversalScannerClient  Scanner （）
func NewUniversalScannerClient(baseURL string) *UniversalScannerClient {
	return NewScannerClient(baseURL)
}

// BlockScannerAPIClient for compatibility
type BlockScannerAPIClient = ScannerClient

// NewBlockScannerAPIClient  Scanner （）
func NewBlockScannerAPIClient(baseURL string) *BlockScannerAPIClient {
	return NewScannerClient(baseURL)
}
