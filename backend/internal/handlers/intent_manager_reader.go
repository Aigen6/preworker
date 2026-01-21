package handlers

import (
	"context"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"go-backend/internal/utils"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/gin-gonic/gin"
)

type IntentManagerReaderHandler struct {
	intentService IntentServiceInterface
}

// IntentServiceInterface defines methods needed for import
type IntentServiceInterface interface {
	CheckAdapterExists(chainID uint32, adapterID uint32) (bool, error)
	CreateAdapterFromChain(chainID uint32, info interface{}) error
}

type AdapterInfoForImport struct {
	AdapterID uint32 `json:"adapter_id"`
	Address   string `json:"address"`
	IsActive  bool   `json:"is_active"`
}

func NewIntentManagerReaderHandler(intentService IntentServiceInterface) *IntentManagerReaderHandler {
	return &IntentManagerReaderHandler{
		intentService: intentService,
	}
}

// AdapterInfo represents basic adapter information from chain
type AdapterInfo struct {
	AdapterID uint32 `json:"adapter_id"`
	Address   string `json:"address"`
	IsActive  bool   `json:"is_active"`
}

// ReadAdaptersFromChainHandler reads all adapters from Intent Manager contract
// POST /api/admin/read-adapters-from-chain
// Request body: { "chain_id": 60, "manager_address": "0x..." }
func (h *IntentManagerReaderHandler) ReadAdaptersFromChainHandler(c *gin.Context) {
	var req struct {
		ChainID        uint32 `json:"chain_id" binding:"required"`
		ManagerAddress string `json:"manager_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	// Get RPC URL for the chain
	chainRegistry := &utils.ChainRegistry{}
	nativeChainID, err := chainRegistry.SLIP44ToNative(req.ChainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Unsupported chain ID: %d", req.ChainID)})
		return
	}

	rpcURL := getRPCURL(nativeChainID)
	if rpcURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("No RPC URL configured for chain %d", nativeChainID)})
		return
	}

	// Connect to blockchain
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to blockchain", "details": err.Error()})
		return
	}
	defer client.Close()

	// Read adapters from contract
	adapters, err := h.readAdaptersFromContract(client, req.ManagerAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read adapters from chain", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"chain_id":        req.ChainID,
		"manager_address": req.ManagerAddress,
		"adapters":        adapters,
		"count":           len(adapters),
	})
}

// readAdaptersFromContract reads adapter information from Intent Manager contract
func (h *IntentManagerReaderHandler) readAdaptersFromContract(client *ethclient.Client, managerAddress string) ([]AdapterInfo, error) {
	contractAddress := common.HexToAddress(managerAddress)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Method 1: Try to get adapter count first
	// getAdapterCount() returns uint256
	adapterCountABI := `[{"inputs":[],"name":"getAdapterCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]`
	parsedABI, err := abi.JSON(strings.NewReader(adapterCountABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %w", err)
	}

	// Call getAdapterCount()
	data, err := parsedABI.Pack("getAdapterCount")
	if err != nil {
		return nil, fmt.Errorf("failed to pack getAdapterCount: %w", err)
	}

	msg := ethereum.CallMsg{
		To:   &contractAddress,
		Data: data,
	}

	result, err := client.CallContract(ctx, msg, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to call getAdapterCount: %w", err)
	}

	var count *big.Int
	err = parsedABI.UnpackIntoInterface(&count, "getAdapterCount", result)
	if err != nil {
		return nil, fmt.Errorf("failed to unpack adapter count: %w", err)
	}

	adapterCount := int(count.Int64())
	if adapterCount == 0 {
		return []AdapterInfo{}, nil
	}

	// Method 2: Read each adapter by index
	// getAdapterByIndex(uint256 index) returns (uint32 adapterId, address adapterAddress, bool isActive)
	getAdapterABI := `[{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"getAdapterByIndex","outputs":[{"internalType":"uint32","name":"adapterId","type":"uint32"},{"internalType":"address","name":"adapterAddress","type":"address"},{"internalType":"bool","name":"isActive","type":"bool"}],"stateMutability":"view","type":"function"}]`

	adapterParsedABI, err := abi.JSON(strings.NewReader(getAdapterABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse adapter ABI: %w", err)
	}

	adapters := make([]AdapterInfo, 0, adapterCount)

	for i := 0; i < adapterCount; i++ {
		// Call getAdapterByIndex(i)
		data, err := adapterParsedABI.Pack("getAdapterByIndex", big.NewInt(int64(i)))
		if err != nil {
			continue // Skip this adapter on error
		}

		msg := ethereum.CallMsg{
			To:   &contractAddress,
			Data: data,
		}

		result, err := client.CallContract(ctx, msg, nil)
		if err != nil {
			continue // Skip this adapter on error
		}

		// Unpack result
		var unpacked []interface{}
		err = adapterParsedABI.UnpackIntoInterface(&unpacked, "getAdapterByIndex", result)
		if err != nil {
			continue
		}

		if len(unpacked) >= 3 {
			adapterInfo := AdapterInfo{
				AdapterID: unpacked[0].(uint32),
				Address:   unpacked[1].(common.Address).Hex(),
				IsActive:  unpacked[2].(bool),
			}
			adapters = append(adapters, adapterInfo)
		}
	}

	return adapters, nil
}

// getRPCURL returns RPC URL for the given native chain ID
func getRPCURL(nativeChainID uint32) string {
	// TODO: Move this to configuration
	rpcURLs := map[uint32]string{
		1:     "https://eth.llamarpc.com",              // Ethereum
		56:    "https://bsc-dataseed1.binance.org",     // BSC
		137:   "https://polygon-rpc.com",               // Polygon
		42161: "https://arb1.arbitrum.io/rpc",          // Arbitrum
		10:    "https://mainnet.optimism.io",           // Optimism
		8453:  "https://mainnet.base.org",              // Base
		324:   "https://mainnet.era.zksync.io",         // zkSync Era
		43114: "https://api.avax.network/ext/bc/C/rpc", // Avalanche
	}
	return rpcURLs[nativeChainID]
}

// ImportAdaptersHandler imports adapters from chain to database
// POST /api/admin/import-adapters-from-chain
// Request body: { "chain_id": 60, "manager_address": "0x...", "adapters": [...] }
func (h *IntentManagerReaderHandler) ImportAdaptersHandler(c *gin.Context) {
	var req struct {
		ChainID        uint32        `json:"chain_id" binding:"required"`
		ManagerAddress string        `json:"manager_address" binding:"required"`
		Adapters       []AdapterInfo `json:"adapters" binding:"required"`
		IntentService  interface{}   `json:"-"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	imported := 0
	skipped := 0
	errors := []string{}

	for _, adapter := range req.Adapters {
		// Check if adapter already exists (by chain_id + adapter_id)
		exists, err := h.intentService.CheckAdapterExists(req.ChainID, adapter.AdapterID)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Error checking adapter %d: %v", adapter.AdapterID, err))
			continue
		}

		if exists {
			skipped++
			continue // Skip existing adapters
		}

		// Create new adapter record
		importInfo := AdapterInfoForImport{
			AdapterID: adapter.AdapterID,
			Address:   adapter.Address,
			IsActive:  adapter.IsActive,
		}
		err = h.intentService.CreateAdapterFromChain(req.ChainID, importInfo)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Error importing adapter %d: %v", adapter.AdapterID, err))
			continue
		}

		imported++
	}

	response := gin.H{
		"imported": imported,
		"skipped":  skipped,
		"total":    len(req.Adapters),
		"message":  fmt.Sprintf("Successfully imported %d new adapters, skipped %d existing", imported, skipped),
	}

	if len(errors) > 0 {
		response["errors"] = errors
	}

	c.JSON(http.StatusOK, response)
}
