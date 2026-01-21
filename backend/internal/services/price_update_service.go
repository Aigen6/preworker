package services

import (
	"fmt"
	"go-backend/internal/models"
	"log"
	"math/rand"
	"sync"
	"time"

	"gorm.io/gorm"
)

// PriceUpdateService handles periodic price updates and notifications
type PriceUpdateService struct {
	db                   *gorm.DB
	ticker               *time.Ticker
	done                 chan bool
	mu                   sync.RWMutex
	priceChangeListeners []PriceChangeListener
	isRunning            bool
}

// PriceChangeListener interface for receiving price updates
type PriceChangeListener interface {
	OnPriceChange(assetID string, price string, change24h string)
}

// NewPriceUpdateService creates a new price update service
func NewPriceUpdateService(db *gorm.DB) *PriceUpdateService {
	return &PriceUpdateService{
		db:                   db,
		done:                 make(chan bool),
		priceChangeListeners: make([]PriceChangeListener, 0),
	}
}

// Start begins the price update loop (every minute)
func (s *PriceUpdateService) Start() {
	s.mu.Lock()
	if s.isRunning {
		s.mu.Unlock()
		return
	}
	s.isRunning = true
	s.mu.Unlock()

	s.ticker = time.NewTicker(1 * time.Minute)

	go func() {
		// Update prices immediately on start
		s.updatePrices()

		for {
			select {
			case <-s.done:
				s.ticker.Stop()
				return
			case <-s.ticker.C:
				s.updatePrices()
			}
		}
	}()

	log.Println("✅ Price Update Service started (1-minute interval)")
}

// Stop stops the price update loop
func (s *PriceUpdateService) Stop() {
	s.mu.Lock()
	if !s.isRunning {
		s.mu.Unlock()
		return
	}
	s.isRunning = false
	s.mu.Unlock()

	select {
	case s.done <- true:
	default:
	}
	log.Println("🛑 Price Update Service stopped")
}

// updatePrices updates all token prices in the database
func (s *PriceUpdateService) updatePrices() {
	// Get all active tokens
	var tokens []models.IntentAssetToken
	if err := s.db.Where("is_active = ?", true).Find(&tokens).Error; err != nil {
		log.Printf("❌ Error fetching tokens: %v", err)
		return
	}

	today := time.Now().Format("2006-01-02")
	now := time.Now()

	for _, token := range tokens {
		// Generate simulated price data (in production, fetch from price oracle)
		price := generateRandomPrice()
		change24h := generateRandomChange()

		// Check if price for today already exists
		var existingPrice models.TokenPrice
		if err := s.db.Where("asset_id = ? AND DATE(date) = ?", token.AssetID, today).
			First(&existingPrice).Error; err == gorm.ErrRecordNotFound {
			// Create new price record
			tokenPrice := models.TokenPrice{
				AssetID:   token.AssetID,
				Date:      now,
				Price:     price,
				Change24h: change24h,
			}
			if err := s.db.Create(&tokenPrice).Error; err != nil {
				log.Printf("❌ Error creating price for %s: %v", token.AssetID, err)
				continue
			}
			log.Printf("📈 Created new price for %s: %s (24h: %s)", token.Symbol, price, change24h)
		} else if err == nil {
			// Update existing price record
			if err := s.db.Model(&existingPrice).
				Updates(map[string]interface{}{
					"price":      price,
					"change_24h": change24h,
					"date":       now,
				}).Error; err != nil {
				log.Printf("❌ Error updating price for %s: %v", token.AssetID, err)
				continue
			}
			log.Printf("📊 Updated price for %s: %s (24h: %s)", token.Symbol, price, change24h)
		}

		// Notify all listeners about the price change
		s.notifyPriceChange(token.AssetID, price, change24h)
	}
}

// notifyPriceChange notifies all registered listeners about price changes
func (s *PriceUpdateService) notifyPriceChange(assetID, price, change24h string) {
	s.mu.RLock()
	listeners := make([]PriceChangeListener, len(s.priceChangeListeners))
	copy(listeners, s.priceChangeListeners)
	s.mu.RUnlock()

	for _, listener := range listeners {
		// Non-blocking send
		go func(l PriceChangeListener) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("⚠️ Price listener panic: %v", r)
				}
			}()
			l.OnPriceChange(assetID, price, change24h)
		}(listener)
	}
}

// RegisterListener registers a listener for price changes
func (s *PriceUpdateService) RegisterListener(listener PriceChangeListener) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.priceChangeListeners = append(s.priceChangeListeners, listener)
}

// UnregisterListener removes a listener
func (s *PriceUpdateService) UnregisterListener(listener PriceChangeListener) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, l := range s.priceChangeListeners {
		if l == listener {
			s.priceChangeListeners = append(s.priceChangeListeners[:i], s.priceChangeListeners[i+1:]...)
			break
		}
	}
}

// generateRandomPrice generates a simulated price
// In production, this would fetch from a price oracle
func generateRandomPrice() string {
	basePrice := 1000.0 + rand.Float64()*1000.0 // 1000-2000 range
	return fmt.Sprintf("%.2f", basePrice)
}

// generateRandomChange generates a simulated 24h change percentage
// In production, this would be calculated from historical data
func generateRandomChange() string {
	change := (rand.Float64() - 0.5) * 10.0 // -5% to +5%
	if change >= 0 {
		return fmt.Sprintf("+%.1f%%", change)
	}
	return fmt.Sprintf("%.1f%%", change)
}
