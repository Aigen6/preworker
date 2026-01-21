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

// DeBridgeClient deBridge API client
type DeBridgeClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewDeBridgeClient creates a new deBridge client
func NewDeBridgeClient() *DeBridgeClient {
	return &DeBridgeClient{
		baseURL: "https://api.dln.trade/v1.0",
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// DeBridgeQuoteRequest represents deBridge quote request
type DeBridgeQuoteRequest struct {
	SrcChainId                string `json:"srcChainId"`
	SrcChainTokenIn           string `json:"srcChainTokenIn"`
	SrcChainTokenInAmount     string `json:"srcChainTokenInAmount"`
	DstChainId                string `json:"dstChainId"`
	DstChainTokenOut          string `json:"dstChainTokenOut"`
	DstChainTokenOutRecipient string `json:"dstChainTokenOutRecipient,omitempty"`
}

// DeBridgeQuoteResponse represents deBridge quote response
type DeBridgeQuoteResponse struct {
	Estimation struct {
		SrcChainTokenIn struct {
			Address  string `json:"address"`
			Symbol   string `json:"symbol"`
			Name     string `json:"name"`
			Decimals int    `json:"decimals"`
			Amount   string `json:"amount"`
		} `json:"srcChainTokenIn"`
		DstChainTokenOut struct {
			Address         string `json:"address"`
			Symbol          string `json:"symbol"`
			Name            string `json:"name"`
			Decimals        int    `json:"decimals"`
			Amount          string `json:"amount"`
			MaxRefundAmount string `json:"maxRefundAmount"`
		} `json:"dstChainTokenOut"`
		DstChainTokenOutMin struct {
			Amount string `json:"amount"`
		} `json:"dstChainTokenOutMin,omitempty"`
		RecommendedSlippage float64 `json:"recommendedSlippage"`
		CostsDetails        []struct {
			Chain   string `json:"chain"`
			Type    string `json:"type"`
			Payload struct {
				NativeCurrency string `json:"nativeCurrency"`
				NativeAmount   string `json:"nativeAmount"`
				USDAmount      string `json:"usdAmount"`
			} `json:"payload"`
		} `json:"costsDetails"`
	} `json:"estimation"`
	Tx struct {
		To    string `json:"to"`
		Data  string `json:"data"`
		Value string `json:"value"`
	} `json:"tx"`
	Order struct {
		ApproximateFulfillmentDelay int `json:"approximateFulfillmentDelay"` // seconds
	} `json:"order"`
}

// GetQuote gets a quote from deBridge
func (c *DeBridgeClient) GetQuote(ctx context.Context, req *DeBridgeQuoteRequest) (*DeBridgeQuoteResponse, error) {
	// Build query parameters
	params := url.Values{}
	params.Add("srcChainId", req.SrcChainId)
	params.Add("srcChainTokenIn", req.SrcChainTokenIn)
	params.Add("srcChainTokenInAmount", req.SrcChainTokenInAmount)
	params.Add("dstChainId", req.DstChainId)
	params.Add("dstChainTokenOut", req.DstChainTokenOut)

	if req.DstChainTokenOutRecipient != "" {
		params.Add("dstChainTokenOutRecipient", req.DstChainTokenOutRecipient)
	}

	// Build URL
	reqURL := fmt.Sprintf("%s/dln/order/quote?%s", c.baseURL, params.Encode())

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
		return nil, fmt.Errorf("deBridge API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var quoteResp DeBridgeQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&quoteResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &quoteResp, nil
}

// GetDeBridgeChainId converts chain ID to deBridge Internal Chain ID string
// For DLN API, we need to use deBridge's internal chain IDs (not standard blockchain chain IDs)
func GetDeBridgeChainId(chainID uint32) string {
	// deBridge DLN uses Internal Chain IDs
	// Reference: https://docs.debridge.com/dln-details/overview/fees-supported-chains
	switch chainID {
	case 195: // TRON SLIP-44
		return "100000026" // TRON Internal Chain ID for DLN (NOT 728126428)
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
	case 43114:
		return "43114" // Avalanche
	default:
		return fmt.Sprintf("%d", chainID)
	}
}

// GetTronTokenAddress converts EVM token address format for TRON
func GetTronTokenAddress(token string) string {
	// TRON uses different address format (base58)
	// This is a placeholder - actual implementation would need proper conversion
	// For USDT on TRON: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

	// Common TRON tokens
	tronTokens := map[string]string{
		"USDT": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
		"USDC": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
		"TRX":  "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR", // Native TRX
	}

	// Try to map common tokens
	for symbol, addr := range tronTokens {
		if token == symbol {
			return addr
		}
	}

	return token
}

// IsTronChain checks if a chain ID is TRON
func IsTronChain(chainID uint32) bool {
	return chainID == 195 // TRON SLIP-44 chain ID
}

// FormatDeBridgeDuration formats execution duration to human-readable string
func FormatDeBridgeDuration(seconds int) string {
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
