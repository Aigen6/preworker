package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"go-backend/internal/services"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// WebSocketHandler manages WebSocket connections and subscriptions
type WebSocketHandler struct {
	pushService        *services.WebSocketPushService
	subscriptionMgr    *services.WebSocketSubscriptionManager
	priceUpdateService *services.PriceUpdateService
	upgrader           websocket.Upgrader
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(
	pushService *services.WebSocketPushService,
	subscriptionMgr *services.WebSocketSubscriptionManager,
	priceUpdateService *services.PriceUpdateService,
) *WebSocketHandler {
	return &WebSocketHandler{
		pushService:        pushService,
		subscriptionMgr:    subscriptionMgr,
		priceUpdateService: priceUpdateService,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

// SubscriptionMessage represents a client subscription request
type SubscriptionMessage struct {
	Action    string                    `json:"action"`              // "subscribe" or "unsubscribe"
	Type      services.SubscriptionType `json:"type"`                // "deposits", "checkbooks", "prices", etc.
	Address   string                    `json:"address,omitempty"`   // For address-based subscriptions
	AssetIDs  []string                  `json:"asset_ids,omitempty"` // For price subscriptions
	Timestamp int64                     `json:"timestamp"`
}

// PriceChangeMessage represents a price update to send to clients
type PriceChangeMessage struct {
	Type      string    `json:"type"`
	AssetID   string    `json:"asset_id"`
	Price     string    `json:"price"`
	Change24h string    `json:"change_24h"`
	Timestamp time.Time `json:"timestamp"`
}

// HandleWebSocket handles new WebSocket connections with subscription support
func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Extract user address from JWT token
	userAddress := h.extractUserFromToken(r)
	if userAddress == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("❌ WebSocket upgrade failed: %v", err)
		http.Error(w, "WebSocket upgrade failed", http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	// Create unique client ID
	clientID := uuid.New().String()
	messageChan := make(chan interface{}, 256)
	// Channel for pong responses (to avoid concurrent write issues)
	pongChan := make(chan map[string]interface{}, 10)

	// Register client with subscription manager
	h.subscriptionMgr.RegisterClient(clientID, userAddress, messageChan)
	defer h.subscriptionMgr.UnregisterClient(clientID)

	// Register connection with push service (for receiving push messages)
	// Push service uses Universal Address format for user identification
	// NOTE: We only register the connection mapping, NOT the connection management
	// The push service will send messages to conn.Send channel, which we handle in the write loop below
	pushConnection := &services.Connection{
		ID:          clientID,
		UserAddress: userAddress, // Already in Universal Address format from JWT
		Conn:        conn,
		Send:        make(chan []byte, 256),
		LastPing:    time.Now(),
	}
	// Only register connection mapping, don't let pushService manage the connection
	// This avoids double read/write goroutines that cause connection conflicts
	h.pushService.RegisterConnectionMapping(pushConnection)
	defer h.pushService.UnregisterConnectionMapping(pushConnection)

	// Start goroutine to handle price updates
	priceListener := h.createPriceListener(clientID)
	h.priceUpdateService.RegisterListener(priceListener)
	defer h.priceUpdateService.UnregisterListener(priceListener)

	log.Printf("📡 WebSocket client connected: %s (user: %s)", clientID, userAddress)

	// Send connection success message
	conn.WriteJSON(map[string]interface{}{
		"type":      "connected",
		"client_id": clientID,
		"message":   "Connected to WebSocket service",
		"timestamp": time.Now(),
	})

	// Read messages from client in one goroutine
	// Don't close messageChan here - let it be closed when connection is closed
	readDone := make(chan struct{})
	go func() {
		// Add panic recovery to prevent goroutine crash from affecting the entire backend
		defer func() {
			if r := recover(); r != nil {
				log.Printf("❌ [WebSocket] PANIC recovered in read goroutine for client %s: %v", clientID, r)
			}
			close(readDone)
		}()
		log.Printf("📖 [WebSocket] Read goroutine started for client %s", clientID)

		// Set read deadline to prevent blocking (60 seconds timeout, refreshed on each read)
		// Use a longer initial deadline to allow time for first message
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		// Set up pong handler for WebSocket protocol-level pong messages
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			log.Printf("🏓 [WebSocket] Received WebSocket protocol-level pong from client %s", clientID)
			return nil
		})

		// Add a ticker to log read goroutine health
		healthTicker := time.NewTicker(30 * time.Second)
		defer healthTicker.Stop()

		go func() {
			for {
				select {
				case <-healthTicker.C:
					log.Printf("💓 [WebSocket] Read goroutine alive for client %s", clientID)
				case <-readDone:
					return
				}
			}
		}()

		for {
			// Refresh read deadline before each read
			// This ensures we don't timeout if client is slow to send messages
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))

			// Read message as raw bytes first to quickly check if it's a ping
			// ReadMessage blocks until a message is received or deadline expires
			messageType, messageBytes, err := conn.ReadMessage()
			if err != nil {
				// Check if it's a timeout error
				if netErr, ok := err.(interface{ Timeout() bool }); ok && netErr.Timeout() {
					log.Printf("⏱️ [WebSocket] Read timeout for client %s (no message received in 60s)", clientID)
					// Check if connection is still valid before continuing
					// If connection is closed, we should exit instead of continuing
					if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)); err != nil {
						log.Printf("❌ [WebSocket] Connection check failed for client %s: %v", clientID, err)
						return
					}
					// Connection is still valid, continue reading
					continue
				}
				// Check if connection is closed (normal or abnormal)
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("🔌 [WebSocket] Connection closed for client %s: %v", clientID, err)
					return
				}
				// Check for "repeated read on failed websocket connection" error
				if err.Error() == "repeated read on failed websocket connection" || 
				   strings.Contains(err.Error(), "failed websocket connection") {
					log.Printf("❌ [WebSocket] Connection failed for client %s, stopping read loop: %v", clientID, err)
					return
				}
				// Log other read errors for debugging
				log.Printf("⚠️ [WebSocket] Read error for client %s: %v (type: %T)", clientID, err, err)
				return
			}

			// Log all received messages for debugging
			log.Printf("📨 [WebSocket] Received message from client %s, type: %d, length: %d", clientID, messageType, len(messageBytes))

			// Only process text messages (JSON)
			if messageType != websocket.TextMessage {
				continue
			}

			// Parse JSON message
			var rawMsg map[string]interface{}
			if err := json.Unmarshal(messageBytes, &rawMsg); err != nil {
				log.Printf("⚠️ Failed to parse JSON message: %v", err)
				continue
			}

			// Handle ping messages (keepalive) - highest priority
			// Check type field first for fast path
			if msgType, ok := rawMsg["type"].(string); ok && msgType == "ping" {
				// Log ping received for debugging
				log.Printf("📡 [WebSocket] Received ping from client %s", clientID)

				// Send pong response through channel to avoid concurrent write issues
				// This ensures all writes go through the main write loop
				pongMsg := map[string]interface{}{
					"type":      "pong",
					"timestamp": time.Now(),
				}
				select {
				case pongChan <- pongMsg:
					log.Printf("✅ [WebSocket] Pong queued for client %s", clientID)
				default:
					log.Printf("⚠️ [WebSocket] Pong channel full for client %s, dropping pong", clientID)
				}
				// Reset read deadline after queuing pong
				conn.SetReadDeadline(time.Now().Add(60 * time.Second))
				continue
			}

			// Handle subscription messages (with action field)
			if action, ok := rawMsg["action"].(string); ok && action != "" {
				var msg SubscriptionMessage
				// Convert map to SubscriptionMessage
				if actionVal, ok := rawMsg["action"].(string); ok {
					msg.Action = actionVal
				}
				if typeVal, ok := rawMsg["type"].(string); ok {
					msg.Type = services.SubscriptionType(typeVal)
				}
				if addrVal, ok := rawMsg["address"].(string); ok {
					msg.Address = addrVal
				}
				if assetIDsVal, ok := rawMsg["asset_ids"].([]interface{}); ok {
					assetIDs := make([]string, 0, len(assetIDsVal))
					for _, id := range assetIDsVal {
						if idStr, ok := id.(string); ok {
							assetIDs = append(assetIDs, idStr)
						}
					}
					msg.AssetIDs = assetIDs
				}
				if tsVal, ok := rawMsg["timestamp"].(float64); ok {
					msg.Timestamp = int64(tsVal)
				}

				// Process subscription/unsubscription
				h.handleSubscriptionMessage(clientID, userAddress, &msg)
				continue
			}

			// Unknown message format
			if action, ok := rawMsg["action"].(string); ok {
				log.Printf("⚠️ Unknown action: %s", action)
			} else {
				log.Printf("⚠️ Unknown message format (missing action field): %v", rawMsg)
			}
		}
	}()

	// Write messages to client from multiple sources:
	// 1. Subscription manager (messageChan)
	// 2. Push service (pushConnection.Send)
	// 3. Pong responses (pongChan)
	// All writes go through this single loop to ensure thread safety
	// Also send WebSocket protocol-level ping messages to keep connection alive
	pingTicker := time.NewTicker(54 * time.Second)
	defer pingTicker.Stop()

	log.Printf("✍️ [WebSocket] Write loop started for client %s", clientID)

	for {
		select {
		case message, ok := <-messageChan:
			// Message from subscription manager
			if !ok {
				// Channel closed - connection is closing
				log.Printf("📭 [WebSocket] Subscription channel closed for client %s", clientID)
				return
			}
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteJSON(message); err != nil {
				log.Printf("❌ [WebSocket] Write error for client %s: %v", clientID, err)
				return
			}
			log.Printf("✅ [WebSocket] Subscription message sent to client %s", clientID)
		case message, ok := <-pushConnection.Send:
			// Message from push service (unified write path)
			if !ok {
				// Channel closed - connection is closing
				log.Printf("📭 [WebSocket] Push channel closed for client %s", clientID)
				return
			}
			log.Printf("📨 [WebSocket] Writing push message to client %s, length: %d bytes", clientID, len(message))
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("❌ [WebSocket] Write error for client %s: %v", clientID, err)
				return
			}
			log.Printf("✅ [WebSocket] Push message sent successfully to client %s", clientID)
		case pongMsg := <-pongChan:
			// Pong response to ping (from read goroutine)
			// This ensures all writes go through the main write loop to avoid concurrent write issues
			conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
			if err := conn.WriteJSON(pongMsg); err != nil {
				log.Printf("❌ [WebSocket] Pong write error for client %s: %v", clientID, err)
				return
			}
			log.Printf("✅ [WebSocket] Sent pong to client %s", clientID)
		case <-pingTicker.C:
			// Send WebSocket protocol-level ping to keep connection alive
			// This helps with proxies/load balancers that may close idle connections
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("❌ [WebSocket] Ping error for client %s: %v", clientID, err)
				return
			}
			log.Printf("🏓 [WebSocket] Sent protocol-level ping to client %s", clientID)
		case <-readDone:
			// Read goroutine exited - connection is closing
			log.Printf("📖 [WebSocket] Read goroutine exited for client %s", clientID)
			return
		}
	}
}

// handleSubscriptionMessage processes subscribe/unsubscribe requests
func (h *WebSocketHandler) handleSubscriptionMessage(clientID, userAddress string, msg *SubscriptionMessage) {
	switch msg.Action {
	case "subscribe":
		filter := &services.SubscriptionFilter{
			Type:      msg.Type,
			Address:   msg.Address,
			AssetIDs:  msg.AssetIDs,
			Timestamp: time.Now().Unix(),
		}

		if err := h.subscriptionMgr.Subscribe(clientID, filter); err != nil {
			log.Printf("❌ Subscription failed for %s: %v", clientID, err)
			return
		}

		log.Printf("✅ Client %s subscribed to %s", clientID, msg.Type)

		// Send confirmation
		if client, exists := h.subscriptionMgr.GetClient(clientID); exists {
			confirmationMsg := map[string]interface{}{
				"type":      "subscription_confirmed",
				"sub_type":  msg.Type,
				"message":   fmt.Sprintf("Subscribed to %s", msg.Type),
				"timestamp": time.Now(),
			}
			select {
			case client.MessageChan <- confirmationMsg:
				log.Printf("✅ [WebSocket] Subscription confirmation sent to client %s for type: %s", clientID, msg.Type)
			default:
				log.Printf("⚠️ [WebSocket] Failed to send subscription confirmation to client %s (channel full)", clientID)
			}
		} else {
			log.Printf("⚠️ [WebSocket] Client %s not found when sending subscription confirmation", clientID)
		}

	case "unsubscribe":
		if err := h.subscriptionMgr.Unsubscribe(clientID, msg.Type); err != nil {
			log.Printf("❌ Unsubscription failed for %s: %v", clientID, err)
			return
		}

		log.Printf("✅ Client %s unsubscribed from %s", clientID, msg.Type)

		// Send confirmation
		if client, exists := h.subscriptionMgr.GetClient(clientID); exists {
			select {
			case client.MessageChan <- map[string]interface{}{
				"type":      "unsubscription_confirmed",
				"sub_type":  msg.Type,
				"message":   fmt.Sprintf("Unsubscribed from %s", msg.Type),
				"timestamp": time.Now(),
			}:
			default:
			}
		}

	default:
		log.Printf("⚠️ Unknown action: %s", msg.Action)
	}
}

// createPriceListener creates a price change listener for a client
func (h *WebSocketHandler) createPriceListener(clientID string) services.PriceChangeListener {
	return &ClientPriceListener{
		clientID:        clientID,
		subscriptionMgr: h.subscriptionMgr,
	}
}

// ClientPriceListener implements PriceChangeListener
type ClientPriceListener struct {
	clientID        string
	subscriptionMgr *services.WebSocketSubscriptionManager
}

// OnPriceChange is called when a price changes
func (l *ClientPriceListener) OnPriceChange(assetID, price, change24h string) {
	// Get all clients subscribed to this price
	clientIDs := l.subscriptionMgr.GetClientsForPrice(assetID)

	if len(clientIDs) == 0 {
		return
	}

	message := PriceChangeMessage{
		Type:      "price_update",
		AssetID:   assetID,
		Price:     price,
		Change24h: change24h,
		Timestamp: time.Now(),
	}

	// Send to all subscribed clients
	l.subscriptionMgr.SendMessageToClients(clientIDs, message)
}

// HandleSSE handles Server-Sent Events (kept for backward compatibility)
func (h *WebSocketHandler) HandleSSE(w http.ResponseWriter, r *http.Request) {
	userAddress := h.extractUserFromToken(r)
	if userAddress == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	h.pushService.HandleSSE(w, r, userAddress)
}

// GetConnectionStatus returns WebSocket connection status
func (h *WebSocketHandler) GetConnectionStatus(w http.ResponseWriter, r *http.Request) {
	userAddress := h.extractUserFromToken(r)
	if userAddress == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "connected",
		"message":      "WebSocket status service",
		"user_address": userAddress,
	})
}

// extractUserFromToken extracts user address from JWT token
func (h *WebSocketHandler) extractUserFromToken(r *http.Request) string {
	token := r.URL.Query().Get("token")
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if token == "" {
		return ""
	}

	userAddress, err := h.validateJWTAndGetUser(token)
	if err != nil {
		log.Printf("❌ JWT validation failed: %v", err)
		return ""
	}

	return userAddress
}

// validateJWTAndGetUser validates JWT and returns user address
func (h *WebSocketHandler) validateJWTAndGetUser(token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("empty token")
	}

	claims, err := ValidateJWTToken(token)
	if err != nil {
		return "", fmt.Errorf("JWT validation failed: %w", err)
	}

	userAddress := claims.UniversalAddress
	log.Printf("✅ JWT verified: user=%s, universal=%s", claims.UserAddress, userAddress)
	return userAddress, nil
}
