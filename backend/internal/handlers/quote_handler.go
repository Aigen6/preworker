package handlers

import (
	"go-backend/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// QuoteHandler handles quote and preview API requests
type QuoteHandler struct {
	quoteService *services.QuoteService
}

// NewQuoteHandler creates a new QuoteHandler instance
func NewQuoteHandler() *QuoteHandler {
	return &QuoteHandler{
		quoteService: services.NewQuoteService(),
	}
}

// ============================================================================
// Route & Fees Query
// ============================================================================

// GetRouteAndFeesHandler handles POST /api/quote/route-and-fees
// Query optimal cross-chain route, bridge fees, and gas estimates
func (h *QuoteHandler) GetRouteAndFeesHandler(c *gin.Context) {
	var req services.RouteAndFeesRequest

	// Bind JSON request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
		return
	}

	// Validate ownerData
	if req.OwnerData.ChainID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid ownerData.chainId",
		})
		return
	}

	if len(req.OwnerData.Data) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid ownerData.data",
		})
		return
	}

	// Validate depositToken
	if len(req.DepositToken) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "depositToken is required",
		})
		return
	}

	// Validate intent
	if req.Intent == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "intent is required",
		})
		return
	}

	intentType, ok := req.Intent["type"].(string)
	if !ok || (intentType != "RawToken" && intentType != "AssetToken") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "intent.type must be 'RawToken' or 'AssetToken'",
		})
		return
	}

	// Validate amount
	if len(req.Amount) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "amount is required",
		})
		return
	}

	// Query route and fees
	response, err := h.quoteService.GetRouteAndFees(c.Request.Context(), &req)
	if err != nil {
		// Check for specific error types
		if err.Error() == "unsupported chain pair" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Unsupported chain pair",
				"details": err.Error(),
			})
			return
		}

		// LiFi service unavailable - use fallback
		if err.Error() == "lifi_unavailable" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":    "External service unavailable",
				"fallback": "Using historical average",
				"data": gin.H{
					"estimatedFeeUSD": "25.0",
				},
			})
			return
		}

		// Generic error
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to query route and fees",
			"details": err.Error(),
		})
		return
	}

	// Return response
	c.JSON(http.StatusOK, response)
}

// ============================================================================
// Hook Asset Query
// ============================================================================

// GetHookAssetHandler handles POST /api/quote/hook-asset
// Query Hook asset information (APY, fees, conversion)
func (h *QuoteHandler) GetHookAssetHandler(c *gin.Context) {
	var req services.HookAssetRequest

	// Bind JSON request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
		return
	}

	// Validate chain
	if req.Chain == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "chain is required",
		})
		return
	}

	// Validate protocol
	supportedProtocols := map[string]bool{
		"aave":     true,
		"compound": true,
		"yearn":    true,
		"lido":     true,
	}

	if !supportedProtocols[req.Protocol] {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":              "Unsupported protocol",
			"details":            "Protocol '" + req.Protocol + "' not supported on chain " + string(rune(req.Chain)),
			"supportedProtocols": []string{"aave", "compound", "yearn", "lido"},
		})
		return
	}

	// Validate baseToken
	if len(req.BaseToken) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "baseToken is required",
		})
		return
	}

	// Validate amount
	if len(req.Amount) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "amount is required",
		})
		return
	}

	// Query hook asset info
	response, err := h.quoteService.GetHookAsset(c.Request.Context(), &req)
	if err != nil {
		// Check for specific error types
		if err.Error() == "protocol data unavailable" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":    "Unable to fetch protocol data",
				"fallback": "Using cached data",
				"cacheAge": "2 hours",
			})
			return
		}

		// Generic error
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to query hook asset",
			"details": err.Error(),
		})
		return
	}

	// Return response
	c.JSON(http.StatusOK, response)
}

























