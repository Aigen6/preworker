package handlers

import (
	"go-backend/internal/models"
	"go-backend/internal/services"
	"net/http"
	"strings"
	"time"

	"strconv"

	"github.com/gin-gonic/gin"
)

// PriceHandler handles token price and market data queries
type PriceHandler struct {
	intentService *services.IntentService
}

// NewPriceHandler creates a new PriceHandler instance
func NewPriceHandler() *PriceHandler {
	return &PriceHandler{
		intentService: services.NewIntentService(),
	}
}

// ============================================================================
// Token Price Queries
// ============================================================================

// GetTokenPriceHandler gets price and 24h change for a single token
// GET /api/tokens/:asset_id/price
func (h *PriceHandler) GetTokenPriceHandler(c *gin.Context) {
	assetID := c.Param("asset_id")
	if assetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id is required"})
		return
	}

	// Normalize asset_id (add 0x if missing)
	if !strings.HasPrefix(assetID, "0x") {
		assetID = "0x" + assetID
	}

	var tokenPrice models.TokenPrice
	db := h.intentService.DB()

	// Get the latest price for today
	if err := db.Where("asset_id = ? AND DATE(date) = ?", assetID, time.Now().Format("2006-01-02")).
		Order("date DESC").
		First(&tokenPrice).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error":    "Price data not found",
			"asset_id": assetID,
		})
		return
	}

	// Get token details
	var token models.IntentAssetToken
	if err := db.Where("asset_id = ?", assetID).First(&token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch token details"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token_price": gin.H{
			"asset_id":   tokenPrice.AssetID,
			"symbol":     token.Symbol,
			"name":       token.Name,
			"price":      tokenPrice.Price,
			"change_24h": tokenPrice.Change24h,
			"date":       tokenPrice.Date,
		},
	})
}

// GetMultipleTokenPricesHandler gets prices for multiple tokens
// POST /api/tokens/prices
// Request body: {"asset_ids": ["0x...", "0x..."]}
func (h *PriceHandler) GetMultipleTokenPricesHandler(c *gin.Context) {
	var req struct {
		AssetIDs []string `json:"asset_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if len(req.AssetIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_ids cannot be empty"})
		return
	}

	if len(req.AssetIDs) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Maximum 100 asset_ids allowed"})
		return
	}

	// Normalize asset_ids
	normalizedAssetIDs := make([]string, len(req.AssetIDs))
	for i, id := range req.AssetIDs {
		if !strings.HasPrefix(id, "0x") {
			normalizedAssetIDs[i] = "0x" + id
		} else {
			normalizedAssetIDs[i] = id
		}
	}

	var tokenPrices []models.TokenPrice
	db := h.intentService.DB()

	// Get the latest prices for today for each asset
	if err := db.Where("asset_id IN ? AND DATE(date) = ?", normalizedAssetIDs, time.Now().Format("2006-01-02")).
		Order("asset_id, date DESC").
		Find(&tokenPrices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch price data"})
		return
	}

	// Get token details for all assets
	var tokens []models.IntentAssetToken
	db.Where("asset_id IN ?", normalizedAssetIDs).Find(&tokens)

	// Create a map for quick token lookup
	tokenMap := make(map[string]models.IntentAssetToken)
	for _, token := range tokens {
		tokenMap[token.AssetID] = token
	}

	// Build response with prices and token details
	type PriceInfo struct {
		AssetID   string    `json:"asset_id"`
		Symbol    string    `json:"symbol"`
		Name      string    `json:"name"`
		Price     string    `json:"price"`
		Change24h string    `json:"change_24h"`
		Date      time.Time `json:"date"`
	}

	pricesMap := make(map[string]PriceInfo)
	for _, price := range tokenPrices {
		if token, exists := tokenMap[price.AssetID]; exists {
			pricesMap[price.AssetID] = PriceInfo{
				AssetID:   price.AssetID,
				Symbol:    token.Symbol,
				Name:      token.Name,
				Price:     price.Price,
				Change24h: price.Change24h,
				Date:      price.Date,
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"prices":          pricesMap,
		"count":           len(pricesMap),
		"requested_count": len(normalizedAssetIDs),
	})
}

// GetTokenPriceHistoryHandler gets historical prices for a token
// GET /api/tokens/:asset_id/price-history
// Query params: days (default: 30), limit (default: 100)
func (h *PriceHandler) GetTokenPriceHistoryHandler(c *gin.Context) {
	assetID := c.Param("asset_id")
	if assetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id is required"})
		return
	}

	// Normalize asset_id
	if !strings.HasPrefix(assetID, "0x") {
		assetID = "0x" + assetID
	}

	// Get query parameters
	daysStr := c.DefaultQuery("days", "30")
	limitStr := c.DefaultQuery("limit", "100")

	var daysInt int
	var limitInt int
	if val, err := strconv.Atoi(daysStr); err == nil && val > 0 {
		daysInt = val
	} else {
		daysInt = 30
	}
	if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
		limitInt = val
	} else {
		limitInt = 100
	}

	var prices []models.TokenPrice
	db := h.intentService.DB()

	// Get prices from the last N days
	startDate := time.Now().AddDate(0, 0, -daysInt)
	if err := db.Where("asset_id = ? AND date >= ?", assetID, startDate).
		Order("date DESC").
		Limit(limitInt).
		Find(&prices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch price history"})
		return
	}

	if len(prices) == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error":    "Price history not found",
			"asset_id": assetID,
		})
		return
	}

	// Get token details
	var token models.IntentAssetToken
	db.Where("asset_id = ?", assetID).First(&token)

	c.JSON(http.StatusOK, gin.H{
		"asset_id": assetID,
		"symbol":   token.Symbol,
		"name":     token.Name,
		"prices":   prices,
		"count":    len(prices),
	})
}

// GetPricesHandler handles GET /api/prices
// Query params: symbols (optional, comma-separated)
// Returns: { prices: TokenPrice[], timestamp: number }
// This endpoint is for SDK compatibility
func (h *PriceHandler) GetPricesHandler(c *gin.Context) {
	symbolsParam := c.Query("symbols")
	
	var symbols []string
	if symbolsParam != "" {
		symbols = strings.Split(symbolsParam, ",")
		// Trim whitespace
		for i, s := range symbols {
			symbols[i] = strings.TrimSpace(s)
		}
	}

	db := h.intentService.DB()
	var tokenPrices []models.TokenPrice

	if len(symbols) > 0 {
		// Get tokens by symbols
		var tokens []models.IntentAssetToken
		if err := db.Where("symbol IN ?", symbols).Find(&tokens).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tokens"})
			return
		}

		if len(tokens) == 0 {
			c.JSON(http.StatusOK, gin.H{
				"prices":    []interface{}{},
				"timestamp": time.Now().Unix(),
			})
			return
		}

		// Get asset_ids from tokens
		assetIDs := make([]string, len(tokens))
		for i, token := range tokens {
			assetIDs[i] = token.GetAssetID()
		}

		// Get latest prices for today
		if err := db.Where("asset_id IN ? AND DATE(date) = ?", assetIDs, time.Now().Format("2006-01-02")).
			Order("asset_id, date DESC").
			Find(&tokenPrices).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch price data"})
			return
		}

		// Create token map for lookup
		tokenMap := make(map[string]models.IntentAssetToken)
		for _, token := range tokens {
			assetID := token.GetAssetID()
			tokenMap[assetID] = token
		}

		// Build response in SDK format
		type SDKTokenPrice struct {
			Symbol    string  `json:"symbol"`
			Name      string  `json:"name"`
			AssetID   string  `json:"asset_id"`
			Price     float64 `json:"price"`
			Change24h float64 `json:"change_24h,omitempty"`
		}

		sdkPrices := make([]SDKTokenPrice, 0, len(tokenPrices))
		for _, price := range tokenPrices {
			if token, exists := tokenMap[price.AssetID]; exists {
				priceFloat, _ := strconv.ParseFloat(price.Price, 64)
				change24hFloat, _ := strconv.ParseFloat(price.Change24h, 64)
				sdkPrices = append(sdkPrices, SDKTokenPrice{
					Symbol:    token.Symbol,
					Name:      token.Name,
					AssetID:   price.AssetID,
					Price:     priceFloat,
					Change24h: change24hFloat,
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"prices":    sdkPrices,
			"timestamp": time.Now().Unix(),
		})
	} else {
		// Get all prices for today (if no symbols specified, return empty array instead of error)
		if err := db.Where("DATE(date) = ?", time.Now().Format("2006-01-02")).
			Order("asset_id, date DESC").
			Find(&tokenPrices).Error; err != nil {
			// If no prices found, return empty array instead of error
			c.JSON(http.StatusOK, gin.H{
				"prices":    []interface{}{},
				"timestamp": time.Now().Unix(),
			})
			return
		}

		// Get all tokens
		var tokens []models.IntentAssetToken
		db.Find(&tokens)
		tokenMap := make(map[string]models.IntentAssetToken)
		for _, token := range tokens {
			assetID := token.GetAssetID()
			tokenMap[assetID] = token
		}

		// Build response in SDK format
		type SDKTokenPrice struct {
			Symbol    string `json:"symbol"`
			Name      string `json:"name"`
			AssetID   string `json:"asset_id"`
			Price     string `json:"price"`
			Change24h string `json:"change_24h"`
		}

		sdkPrices := make([]SDKTokenPrice, 0, len(tokenPrices))
		seenAssetIDs := make(map[string]bool)
		for _, price := range tokenPrices {
			if !seenAssetIDs[price.AssetID] {
				seenAssetIDs[price.AssetID] = true
				if token, exists := tokenMap[price.AssetID]; exists {
					sdkPrices = append(sdkPrices, SDKTokenPrice{
						Symbol:    token.Symbol,
						Name:      token.Name,
						AssetID:   price.AssetID,
						Price:     price.Price,
						Change24h: price.Change24h,
					})
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"prices":    sdkPrices,
			"timestamp": time.Now().Unix(),
		})
	}
}
