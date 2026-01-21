package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// LiFiClient LiFi API client
type LiFiClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewLiFiClient creates a new LiFi client
func NewLiFiClient() *LiFiClient {
	return &LiFiClient{
		baseURL: "https://li.quest/v1",
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// LiFiQuoteRequest represents LiFi quote request
type LiFiQuoteRequest struct {
	FromChain   string `json:"fromChain"`
	ToChain     string `json:"toChain"`
	FromToken   string `json:"fromToken"`
	ToToken     string `json:"toToken"`
	FromAmount  string `json:"fromAmount"`
	FromAddress string `json:"fromAddress,omitempty"`
	ToAddress   string `json:"toAddress,omitempty"`
}

// LiFiQuoteResponse represents LiFi quote response
type LiFiQuoteResponse struct {
	Type      string `json:"type"`
	Id        string `json:"id"`
	Tool      string `json:"tool"`
	Action    struct {
		FromChainId int    `json:"fromChainId"`
		ToChainId   int    `json:"toChainId"`
		FromToken   Token  `json:"fromToken"`
		ToToken     Token  `json:"toToken"`
		FromAmount  string `json:"fromAmount"`
		ToAmount    string `json:"toAmount"`
		Slippage    string `json:"slippage"`
	} `json:"action"`
	Estimate struct {
		Tool            string `json:"tool"`
		FromAmount      string `json:"fromAmount"`
		ToAmount        string `json:"toAmount"`
		ToAmountMin     string `json:"toAmountMin"`
		ApprovalAddress string `json:"approvalAddress"`
		ExecutionDuration int  `json:"executionDuration"` // seconds
		FeeCosts        []FeeCost `json:"feeCosts"`
		GasCosts        []GasCost `json:"gasCosts"`
	} `json:"estimate"`
	TransactionRequest interface{} `json:"transactionRequest,omitempty"`
}

// Token represents a token
type Token struct {
	Address  string `json:"address"`
	ChainId  int    `json:"chainId"`
	Symbol   string `json:"symbol"`
	Decimals int    `json:"decimals"`
	Name     string `json:"name"`
	PriceUSD string `json:"priceUSD"`
}

// FeeCost represents fee cost
type FeeCost struct {
	Name      string `json:"name"`
	Amount    string `json:"amount"`
	AmountUSD string `json:"amountUSD"`
	Token     Token  `json:"token"`
}

// GasCost represents gas cost
type GasCost struct {
	Type      string `json:"type"`
	Amount    string `json:"amount"`
	AmountUSD string `json:"amountUSD"`
	Token     Token  `json:"token"`
	Estimate  string `json:"estimate"`
	Limit     string `json:"limit"`
}

// GetQuote gets a quote from LiFi
func (c *LiFiClient) GetQuote(ctx context.Context, req *LiFiQuoteRequest) (*LiFiQuoteResponse, error) {
	// Build query parameters
	params := url.Values{}
	params.Add("fromChain", req.FromChain)
	params.Add("toChain", req.ToChain)
	params.Add("fromToken", req.FromToken)
	params.Add("toToken", req.ToToken)
	params.Add("fromAmount", req.FromAmount)
	
	if req.FromAddress != "" {
		params.Add("fromAddress", req.FromAddress)
	}
	if req.ToAddress != "" {
		params.Add("toAddress", req.ToAddress)
	}

	// Build URL
	reqURL := fmt.Sprintf("%s/quote?%s", c.baseURL, params.Encode())

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Execute request
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	// Check status code
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("LiFi API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var quoteResp LiFiQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&quoteResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &quoteResp, nil
}

// GetChainId converts chain ID to LiFi chain ID string
func GetLiFiChainId(chainID uint32) string {
	// LiFi uses string chain IDs
	switch chainID {
	case 1:
		return "1" // Ethereum
	case 56:
		return "56" // BSC
	case 137:
		return "137" // Polygon
	case 42161:
		return "42161" // Arbitrum
	case 10:
		return "10" // Optimism
	case 8453:
		return "8453" // Base
	default:
		return fmt.Sprintf("%d", chainID)
	}
}

// FormatDuration formats execution duration in seconds to human-readable string
func FormatDuration(seconds int) string {
	if seconds < 60 {
		return fmt.Sprintf("%ds", seconds)
	}
	minutes := seconds / 60
	remaining := seconds % 60
	if remaining > 0 {
		return fmt.Sprintf("%d-%dmin", minutes, minutes+1)
	}
	return fmt.Sprintf("%dmin", minutes)
}






























