package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DeFiClient DeFi protocol data client
type DeFiClient struct {
	httpClient *http.Client
}

// NewDeFiClient creates a new DeFi client
func NewDeFiClient() *DeFiClient {
	return &DeFiClient{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// AaveMarketData represents Aave market data from DeFiLlama
type AaveMarketData struct {
	Chain      string  `json:"chain"`
	Project    string  `json:"project"`
	Symbol     string  `json:"symbol"`
	TVL        float64 `json:"tvlUsd"`
	APY        float64 `json:"apy"`
	APYBase    float64 `json:"apyBase"`
	APYReward  float64 `json:"apyReward"`
	Pool       string  `json:"pool"`
	Underlying string  `json:"underlyingTokens"`
}

// DeFiLlamaYieldsResponse represents DeFiLlama yields API response
type DeFiLlamaYieldsResponse struct {
	Status string            `json:"status"`
	Data   []AaveMarketData  `json:"data"`
}

// ProtocolData represents aggregated protocol data
type ProtocolData struct {
	Protocol     string
	Chain        string
	BaseToken    string
	YieldToken   string
	TokenAddress string
	CurrentAPY   string
	APY7d        string
	APY30d       string
	TVL          string
	Utilization  string
	Available    string
}

// GetAaveData gets Aave protocol data from DeFiLlama
func (c *DeFiClient) GetAaveData(ctx context.Context, chainID uint32, baseToken string) (*ProtocolData, error) {
	// DeFiLlama Yields API
	url := "https://yields.llama.fi/pools"

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("DeFiLlama API error (status %d): %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var yieldsResp DeFiLlamaYieldsResponse
	if err := json.Unmarshal(body, &yieldsResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Find Aave pool for the specified chain and token
	chainName := getChainNameForDeFiLlama(chainID)
	for _, pool := range yieldsResp.Data {
		if strings.EqualFold(pool.Project, "aave-v3") &&
			strings.EqualFold(pool.Chain, chainName) &&
			strings.Contains(strings.ToUpper(pool.Symbol), strings.ToUpper(baseToken)) {
			
			return &ProtocolData{
				Protocol:     "Aave V3",
				Chain:        pool.Chain,
				BaseToken:    baseToken,
				YieldToken:   "a" + baseToken,
				TokenAddress: "", // Need to get from Aave contracts
				CurrentAPY:   fmt.Sprintf("%.2f%%", pool.APY),
				APY7d:        fmt.Sprintf("%.2f%%", pool.APY), // DeFiLlama doesn't provide historical
				APY30d:       fmt.Sprintf("%.2f%%", pool.APY),
				TVL:          formatTVL(pool.TVL),
				Utilization:  "N/A", // Need to calculate from Aave data
				Available:    formatTVL(pool.TVL * 0.8), // Rough estimate
			}, nil
		}
	}

	return nil, fmt.Errorf("Aave pool not found for %s on chain %d", baseToken, chainID)
}

// GetCompoundData gets Compound protocol data
func (c *DeFiClient) GetCompoundData(ctx context.Context, chainID uint32, baseToken string) (*ProtocolData, error) {
	// Similar to Aave, query DeFiLlama for Compound
	url := "https://yields.llama.fi/pools"

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DeFiLlama API error")
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var yieldsResp DeFiLlamaYieldsResponse
	if err := json.Unmarshal(body, &yieldsResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	chainName := getChainNameForDeFiLlama(chainID)
	for _, pool := range yieldsResp.Data {
		if strings.EqualFold(pool.Project, "compound-v3") &&
			strings.EqualFold(pool.Chain, chainName) &&
			strings.Contains(strings.ToUpper(pool.Symbol), strings.ToUpper(baseToken)) {
			
			return &ProtocolData{
				Protocol:     "Compound V3",
				Chain:        pool.Chain,
				BaseToken:    baseToken,
				YieldToken:   "c" + baseToken,
				TokenAddress: "",
				CurrentAPY:   fmt.Sprintf("%.2f%%", pool.APY),
				APY7d:        fmt.Sprintf("%.2f%%", pool.APY),
				APY30d:       fmt.Sprintf("%.2f%%", pool.APY),
				TVL:          formatTVL(pool.TVL),
				Utilization:  "N/A",
				Available:    formatTVL(pool.TVL * 0.75),
			}, nil
		}
	}

	return nil, fmt.Errorf("Compound pool not found for %s on chain %d", baseToken, chainID)
}

// GetTokenPrice gets token price from CoinGecko
func (c *DeFiClient) GetTokenPrice(ctx context.Context, symbol string) (float64, error) {
	// CoinGecko simple price API (no API key required for basic usage)
	tokenID := getCoingeckoTokenID(symbol)
	url := fmt.Sprintf("https://api.coingecko.com/api/v3/simple/price?ids=%s&vs_currencies=usd", tokenID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("CoinGecko API error (status %d)", resp.StatusCode)
	}

	var priceResp map[string]map[string]float64
	if err := json.NewDecoder(resp.Body).Decode(&priceResp); err != nil {
		return 0, fmt.Errorf("failed to decode response: %w", err)
	}

	if price, ok := priceResp[tokenID]["usd"]; ok {
		return price, nil
	}

	return 0, fmt.Errorf("price not found for %s", symbol)
}

// Helper functions

func getChainNameForDeFiLlama(chainID uint32) string {
	switch chainID {
	case 1:
		return "Ethereum"
	case 56:
		return "Binance"
	case 137:
		return "Polygon"
	case 42161:
		return "Arbitrum"
	case 10:
		return "Optimism"
	case 8453:
		return "Base"
	default:
		return fmt.Sprintf("Chain%d", chainID)
	}
}

func getCoingeckoTokenID(symbol string) string {
	// Map common token symbols to CoinGecko IDs
	symbolMap := map[string]string{
		"ETH":  "ethereum",
		"BNB":  "binancecoin",
		"USDT": "tether",
		"USDC": "usd-coin",
		"DAI":  "dai",
		"WBTC": "wrapped-bitcoin",
		"MATIC": "matic-network",
	}

	if id, ok := symbolMap[strings.ToUpper(symbol)]; ok {
		return id
	}
	return strings.ToLower(symbol)
}

func formatTVL(tvl float64) string {
	if tvl >= 1e9 {
		return fmt.Sprintf("%.1fB USD", tvl/1e9)
	} else if tvl >= 1e6 {
		return fmt.Sprintf("%.1fM USD", tvl/1e6)
	} else if tvl >= 1e3 {
		return fmt.Sprintf("%.1fK USD", tvl/1e3)
	}
	return fmt.Sprintf("%.2f USD", tvl)
}






























