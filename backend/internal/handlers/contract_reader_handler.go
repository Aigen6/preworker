package handlers

import (
	"context"
	"fmt"
	"go-backend/internal/models"
	"go-backend/internal/services"
	"go-backend/internal/utils"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/gin-gonic/gin"
)

// ContractReaderHandler handles reading ERC20 contract information
type ContractReaderHandler struct {
	intentService *services.IntentService
}

// NewContractReaderHandler creates a new handler
func NewContractReaderHandler() *ContractReaderHandler {
	return &ContractReaderHandler{
		intentService: services.NewIntentService(),
	}
}

// ERC20 ABI for name(), symbol(), decimals()
const erc20ABI = `[
	{
		"constant": true,
		"inputs": [],
		"name": "name",
		"outputs": [{"name": "", "type": "string"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "symbol",
		"outputs": [{"name": "", "type": "string"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "decimals",
		"outputs": [{"name": "", "type": "uint8"}],
		"type": "function"
	}
]`

// ReadERC20ContractHandler reads ERC20 token information from blockchain (with pool_id)
// POST /api/admin/tokens/read-contract
func (h *ContractReaderHandler) ReadERC20ContractHandler(c *gin.Context) {
	var req struct {
		PoolID          uint32 `json:"pool_id" binding:"required"`
		ContractAddress string `json:"contract_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	// Normalize address
	if !strings.HasPrefix(req.ContractAddress, "0x") || len(req.ContractAddress) != 42 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid contract address format"})
		return
	}

	// Get pool to determine chain ID (SLIP-44)
	db := h.intentService.DB()
	var pool models.IntentAdapter
	if err := db.Where("id = ?", req.PoolID).First(&pool).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pool not found"})
		return
	}

	// Get RPC endpoint using ChainRegistry
	rpcURL, err := utils.GlobalChainRegistry.GetRPCEndpoint(pool.ChainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":    "Unsupported chain",
			"chain_id": pool.ChainID,
			"message":  err.Error(),
		})
		return
	}

	// Read contract information
	tokenInfo, err := h.readERC20Contract(rpcURL, req.ContractAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to read contract",
			"details": err.Error(),
			"rpc":     rpcURL,
		})
		return
	}

	c.JSON(http.StatusOK, tokenInfo)
}

// ReadERC20ByChainHandler reads ERC20 token information from blockchain by chain ID (without pool)
// POST /api/admin/tokens/read-contract-by-chain
func (h *ContractReaderHandler) ReadERC20ByChainHandler(c *gin.Context) {
	var req struct {
		ChainID         uint32 `json:"chain_id" binding:"required"`
		ContractAddress string `json:"contract_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	// Normalize address
	if !strings.HasPrefix(req.ContractAddress, "0x") || len(req.ContractAddress) != 42 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid contract address format"})
		return
	}

	// Get RPC endpoint using ChainRegistry
	rpcURL, err := utils.GlobalChainRegistry.GetRPCEndpoint(req.ChainID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":    "Unsupported chain",
			"chain_id": req.ChainID,
			"message":  err.Error(),
		})
		return
	}

	// Read contract information
	tokenInfo, err := h.readERC20Contract(rpcURL, req.ContractAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to read contract",
			"details": err.Error(),
			"rpc":     rpcURL,
		})
		return
	}

	c.JSON(http.StatusOK, tokenInfo)
}

// readERC20Contract reads name, symbol, and decimals from an ERC20 contract
func (h *ContractReaderHandler) readERC20Contract(rpcURL, contractAddress string) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect to the Ethereum client
	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC: %v", err)
	}
	defer client.Close()

	// Parse the contract address
	address := common.HexToAddress(contractAddress)

	// Parse the ABI
	parsedABI, err := abi.JSON(strings.NewReader(erc20ABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %v", err)
	}

	// Read symbol
	symbol, err := h.callContractString(ctx, client, address, parsedABI, "symbol")
	if err != nil {
		return nil, fmt.Errorf("failed to read symbol: %v", err)
	}

	// Read name
	name, err := h.callContractString(ctx, client, address, parsedABI, "name")
	if err != nil {
		return nil, fmt.Errorf("failed to read name: %v", err)
	}

	// Read decimals
	decimals, err := h.callContractUint8(ctx, client, address, parsedABI, "decimals")
	if err != nil {
		return nil, fmt.Errorf("failed to read decimals: %v", err)
	}

	return map[string]interface{}{
		"symbol":   symbol,
		"name":     name,
		"decimals": decimals,
		"address":  contractAddress,
	}, nil
}

// callContractString calls a contract method that returns a string
func (h *ContractReaderHandler) callContractString(ctx context.Context, client *ethclient.Client, address common.Address, parsedABI abi.ABI, method string) (string, error) {
	data, err := parsedABI.Pack(method)
	if err != nil {
		return "", err
	}

	msg := ethereum.CallMsg{
		To:   &address,
		Data: data,
	}

	result, err := client.CallContract(ctx, msg, nil)
	if err != nil {
		return "", err
	}

	var value string
	err = parsedABI.UnpackIntoInterface(&value, method, result)
	if err != nil {
		return "", err
	}

	return value, nil
}

// callContractUint8 calls a contract method that returns a uint8
func (h *ContractReaderHandler) callContractUint8(ctx context.Context, client *ethclient.Client, address common.Address, parsedABI abi.ABI, method string) (uint8, error) {
	data, err := parsedABI.Pack(method)
	if err != nil {
		return 0, err
	}

	msg := ethereum.CallMsg{
		To:   &address,
		Data: data,
	}

	result, err := client.CallContract(ctx, msg, nil)
	if err != nil {
		return 0, err
	}

	// Unpack the result
	unpacked, err := parsedABI.Unpack(method, result)
	if err != nil {
		return 0, err
	}

	if len(unpacked) == 0 {
		return 0, fmt.Errorf("empty result from contract")
	}

	// Try to extract uint8 from the result
	switch v := unpacked[0].(type) {
	case uint8:
		return v, nil
	case *big.Int:
		return uint8(v.Uint64()), nil
	default:
		return 0, fmt.Errorf("unexpected type %T for decimals", v)
	}
}
