package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"time"
)

// GasPriceClient Gas price API client
type GasPriceClient struct {
	httpClient *http.Client
}

// NewGasPriceClient creates a new Gas price client
func NewGasPriceClient() *GasPriceClient {
	return &GasPriceClient{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// EtherscanGasResponse Etherscan Gas Tracker API response
type EtherscanGasResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Result  struct {
		SafeGasPrice    string `json:"SafeGasPrice"`
		ProposeGasPrice string `json:"ProposeGasPrice"`
		FastGasPrice    string `json:"FastGasPrice"`
		SuggestBaseFee  string `json:"suggestBaseFee"`
		GasUsedRatio    string `json:"gasUsedRatio"`
	} `json:"result"`
}

// BSCScanGasResponse BSCScan Gas Tracker API response (similar to Etherscan)
type BSCScanGasResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Result  struct {
		SafeGasPrice    string `json:"SafeGasPrice"`
		ProposeGasPrice string `json:"ProposeGasPrice"`
		FastGasPrice    string `json:"FastGasPrice"`
	} `json:"result"`
}

// GetGasPrice gets current gas price for a chain
func (c *GasPriceClient) GetGasPrice(ctx context.Context, chainID uint32) (string, error) {
	switch chainID {
	case 1: // Ethereum
		return c.getEthereumGasPrice(ctx)
	case 56: // BSC
		return c.getBSCGasPrice(ctx)
	case 137: // Polygon
		return c.getPolygonGasPrice(ctx)
	case 42161: // Arbitrum
		return c.getArbitrumGasPrice(ctx)
	case 10: // Optimism
		return c.getOptimismGasPrice(ctx)
	default:
		// Fallback to default gas price
		return "10 gwei", nil
	}
}

// getEthereumGasPrice gets Ethereum gas price from Etherscan
func (c *GasPriceClient) getEthereumGasPrice(ctx context.Context) (string, error) {
	// Using Etherscan Gas Tracker API (no API key required)
	url := "https://api.etherscan.io/api?module=gastracker&action=gasoracle"
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		// Fallback on network error
		return "30 gwei", nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "30 gwei", nil // Fallback
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "30 gwei", nil
	}

	var gasResp EtherscanGasResponse
	if err := json.Unmarshal(body, &gasResp); err != nil {
		return "30 gwei", nil
	}

	if gasResp.Status != "1" {
		return "30 gwei", nil
	}

	// Return proposed gas price (standard)
	return fmt.Sprintf("%s gwei", gasResp.Result.ProposeGasPrice), nil
}

// getBSCGasPrice gets BSC gas price
func (c *GasPriceClient) getBSCGasPrice(ctx context.Context) (string, error) {
	// Using BSCScan Gas Tracker API
	url := "https://api.bscscan.com/api?module=gastracker&action=gasoracle"
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		// Fallback on network error
		return "5 gwei", nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "5 gwei", nil // Fallback
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "5 gwei", nil
	}

	var gasResp BSCScanGasResponse
	if err := json.Unmarshal(body, &gasResp); err != nil {
		return "5 gwei", nil
	}

	if gasResp.Status != "1" {
		return "5 gwei", nil
	}

	// Return proposed gas price (standard)
	return fmt.Sprintf("%s gwei", gasResp.Result.ProposeGasPrice), nil
}

// getPolygonGasPrice gets Polygon gas price
func (c *GasPriceClient) getPolygonGasPrice(ctx context.Context) (string, error) {
	// Using Polygonscan Gas Tracker API
	url := "https://api.polygonscan.com/api?module=gastracker&action=gasoracle"
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "50 gwei", nil // Fallback
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "50 gwei", nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "50 gwei", nil
	}

	var gasResp EtherscanGasResponse
	if err := json.Unmarshal(body, &gasResp); err != nil {
		return "50 gwei", nil
	}

	if gasResp.Status != "1" {
		return "50 gwei", nil
	}

	return fmt.Sprintf("%s gwei", gasResp.Result.ProposeGasPrice), nil
}

// getArbitrumGasPrice gets Arbitrum gas price
func (c *GasPriceClient) getArbitrumGasPrice(ctx context.Context) (string, error) {
	// Arbitrum typically has low gas prices
	return "0.1 gwei", nil
}

// getOptimismGasPrice gets Optimism gas price
func (c *GasPriceClient) getOptimismGasPrice(ctx context.Context) (string, error) {
	// Optimism typically has low gas prices
	return "0.001 gwei", nil
}

// CalculateGasCostUSD calculates gas cost in USD
func CalculateGasCostUSD(gasLimit string, gasPriceGwei string, nativeTokenPriceUSD float64) (string, error) {
	// Parse gas limit
	limit := new(big.Int)
	if _, ok := limit.SetString(gasLimit, 10); !ok {
		return "", fmt.Errorf("invalid gas limit: %s", gasLimit)
	}

	// Parse gas price (remove "gwei" suffix if present)
	gasPriceStr := gasPriceGwei
	if len(gasPriceStr) > 5 && gasPriceStr[len(gasPriceStr)-5:] == " gwei" {
		gasPriceStr = gasPriceStr[:len(gasPriceStr)-5]
	}

	gasPrice := new(big.Float)
	if _, ok := gasPrice.SetString(gasPriceStr); !ok {
		return "", fmt.Errorf("invalid gas price: %s", gasPriceGwei)
	}

	// Calculate: gasLimit * gasPrice(gwei) * 1e-9 * nativeTokenPrice
	gasCost := new(big.Float).Mul(
		new(big.Float).SetInt(limit),
		gasPrice,
	)
	gasCost.Mul(gasCost, big.NewFloat(1e-9)) // gwei to ETH/BNB
	gasCost.Mul(gasCost, big.NewFloat(nativeTokenPriceUSD))

	return fmt.Sprintf("%.2f", gasCost), nil
}









































