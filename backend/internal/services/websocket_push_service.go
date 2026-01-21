package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"go-backend/internal/models"

	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// WebSocket Upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Should check in production environment Origin
		return true
	},
}

// Connection information
type Connection struct {
	ID          string          `json:"id"`
	UserAddress string          `json:"user_address"`
	Conn        *websocket.Conn `json:"-"`
	Send        chan []byte     `json:"-"`
	LastPing    time.Time       `json:"last_ping"`
}

// Push message base structure
type PushMessage struct {
	Type        string      `json:"type"`
	Timestamp   string      `json:"timestamp"`
	MessageID   string      `json:"message_id"`
	UserAddress string      `json:"user_address"`
	Data        interface{} `json:"data"`
}

// Checkbook update data (SDK compatible format)
type CheckbookUpdateData struct {
	Action      string            `json:"action"`                 // 'created' | 'updated' | 'deleted'
	Checkbook   models.Checkbook  `json:"checkbook"`              // Complete Checkbook object
	Previous    *models.Checkbook `json:"previous,omitempty"`     // Previous state (for updates)
	UserMessage string            `json:"user_message,omitempty"` // User-friendly message
	Progress    int               `json:"progress,omitempty"`     // Progress percentage
}

// Allocation update data (SDK compatible format)
// Check (Allocation) is the backend model for Allocation in SDK
type AllocationUpdateData struct {
	Action      string        `json:"action"`                 // 'created' | 'updated' | 'deleted'
	Allocation  models.Check  `json:"allocation"`             // Complete Check (Allocation) object
	Previous    *models.Check `json:"previous,omitempty"`     // Previous state (for updates)
	UserMessage string        `json:"user_message,omitempty"` // User-friendly message
	Progress    int           `json:"progress,omitempty"`     // Progress percentage
}

// Withdrawal update data (SDK compatible format)
// NOTE: Withdrawal field should be WithdrawRequest, not Check (Allocation)
// Check and WithdrawRequest are different entities:
// - Check = Allocation (belongs to Checkbook)
// - WithdrawRequest = Withdrawal request (contains multiple Checks via AllocationIDs)
type WithdrawalUpdateData struct {
	Action      string                  `json:"action"`                 // 'created' | 'updated' | 'deleted'
	Withdrawal  models.WithdrawRequest  `json:"withdrawal"`             // Complete WithdrawRequest object (NOT Check)
	Previous    *models.WithdrawRequest `json:"previous,omitempty"`     // Previous state (for updates)
	UserMessage string                  `json:"user_message,omitempty"` // User-friendly message
	Progress    int                     `json:"progress,omitempty"`     // Progress percentage
}

// ========== Legacy types (for backward compatibility) ==========
// Checkbook Status update data (Legacy - kept for backward compatibility)
type CheckbookStatusUpdateData struct {
	CheckbookID         string                 `json:"checkbook_id"`
	OldStatus           string                 `json:"old_status"`
	NewStatus           string                 `json:"new_status"`
	UserMessage         string                 `json:"user_message"`
	Progress            int                    `json:"progress"`
	BusinessChainData   map[string]interface{} `json:"business_chain_data,omitempty"`
	ManagementChainData map[string]interface{} `json:"management_chain_data,omitempty"`
	ProofData           map[string]interface{} `json:"proof_data,omitempty"`
	CommitmentData      map[string]interface{} `json:"commitment_data,omitempty"`
	Metadata            map[string]interface{} `json:"metadata,omitempty"`
	CanCreateChecks     bool                   `json:"can_create_checks,omitempty"`
	FullyReady          bool                   `json:"fully_ready,omitempty"`
	AutoSubmitting      bool                   `json:"auto_submitting,omitempty"`
}

// Check Status update data (Legacy - kept for backward compatibility)
type CheckStatusUpdateData struct {
	CheckID             string                 `json:"check_id"`
	CheckbookID         string                 `json:"checkbook_id"`
	OldStatus           string                 `json:"old_status"`
	NewStatus           string                 `json:"new_status"`
	UserMessage         string                 `json:"user_message"`
	Progress            int                    `json:"progress"`
	WithdrawalInfo      map[string]interface{} `json:"withdrawal_info,omitempty"`
	ProofInfo           map[string]interface{} `json:"proof_info,omitempty"`
	FinalTransaction    map[string]interface{} `json:"final_transaction,omitempty"`
	ManagementConfirmed bool                   `json:"management_confirmed,omitempty"`
	WithdrawalCompleted bool                   `json:"withdrawal_completed,omitempty"`
	ErrorInfo           map[string]interface{} `json:"error_info,omitempty"`
	CanRetry            bool                   `json:"can_retry,omitempty"`
	RetryOptions        map[string]interface{} `json:"retry_options,omitempty"`
	RetryInfo           map[string]interface{} `json:"retry_info,omitempty"`
}

// WebSocketPush service
type WebSocketPushService struct {
	connections map[string]*Connection   // key: connectionID
	userConns   map[string][]*Connection // key: userAddress, value: connections
	hub         chan PushMessage
	register    chan *Connection
	unregister  chan *Connection
	mutex       sync.RWMutex
}

// User-friendly status message mapping
var checkbookStatusMessages = map[models.CheckbookStatus]struct {
	Message  string
	Progress int
	Icon     string
}{
	models.CheckbookStatusPending:              {"💰 Deposit submitted, processing...", 10, "💰"},
	models.CheckbookStatusUnsigned:             {"✅ Deposit confirmed, encrypting securely...", 30, "✅"},
	models.CheckbookStatusReadyForCommitment:   {"🔐 Funds encrypted securely, please set recipient info", 50, "🔐"},
	models.CheckbookStatusGeneratingProof:      {"⚡ Generating your exclusive privacy transfer credential...", 70, "⚡"},
	models.CheckbookStatusSubmittingCommitment: {"📝 Privacy transfer credential generated, saving to blockchain...", 85, "📝"},
	models.CheckbookStatusCommitmentPending:    {"⏳ Privacy transfer credential submitted, waiting for blockchain confirmation...", 95, "⏳"},
	models.CheckbookStatusWithCheckbook:        {"🎉 Privacy transfer credential completed, ready for recipient to withdraw privately", 100, "🎉"},
	models.CheckbookStatusProofFailed:          {"❌ Proof generation failed, please retry", 0, "❌"},
	models.CheckbookStatusSubmissionFailed:     {"⚠️ Submission failed, please retry", 0, "⚠️"},
}

var checkStatusMessages = map[models.CheckStatus]struct {
	Message  string
	Progress int
	Icon     string
}{
	models.CheckStatusPendingProof:           {"🔒 Generating secure withdrawal credential for you...", 20, "🔒"},
	models.CheckStatusSubmittingToManagement: {"💳 Withdrawal credential generated, submitting for processing...", 40, "💳"},
	models.CheckStatusManagementPending:      {"📤 Withdrawal request submitted, processing securely...", 60, "📤"},
	models.CheckStatusCrossChainProcessing:   {"🌐 Transferring to target network, please wait...", 80, "🌐"},
	models.CheckStatusCompleted:              {"🎊 Withdrawal successful! Funds arrived securely", 100, "🎊"},
	models.CheckStatusProofFailed:            {"❌ Withdrawal credential generation failed, please retry", 0, "❌"},
	models.CheckStatusSubmissionFailed:       {"⚠️ Submission processing failed, please retry", 0, "⚠️"},
	models.CheckStatusCrossChainFailed:       {"⚠️ Cross-chain processing encountered issue, system retrying...", 0, "⚠️"},
}

// createWebSocketPush service
func NewWebSocketPushService() *WebSocketPushService {
	service := &WebSocketPushService{
		connections: make(map[string]*Connection),
		userConns:   make(map[string][]*Connection),
		hub:         make(chan PushMessage, 256),
		register:    make(chan *Connection),
		unregister:  make(chan *Connection),
	}

	go service.run()
	return service
}

// Push service
func (s *WebSocketPushService) run() {
	for {
		select {
		case conn := <-s.register:
			s.handleRegister(conn)

		case conn := <-s.unregister:
			s.handleUnregister(conn)

		case message := <-s.hub:
			s.handleBroadcast(message)
		}
	}
}

// RegisterConnection registers a connection with the push service
// This is a public method to allow external handlers to register connections
func (s *WebSocketPushService) RegisterConnection(conn *Connection) {
	s.register <- conn
}

// UnregisterConnection unregisters a connection from the push service
// This is a public method to allow external handlers to unregister connections
func (s *WebSocketPushService) UnregisterConnection(conn *Connection) {
	s.unregister <- conn
}

// RegisterConnectionMapping registers only the connection mapping without starting read/write goroutines
// This is used when the connection is managed by another handler (e.g., websocket_handler.go)
// The connection's Send channel will be used to receive push messages, but the handler manages the connection
func (s *WebSocketPushService) RegisterConnectionMapping(conn *Connection) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.connections[conn.ID] = conn

	// Add to user connection mapping
	if s.userConns[conn.UserAddress] == nil {
		s.userConns[conn.UserAddress] = make([]*Connection, 0)
	}
	s.userConns[conn.UserAddress] = append(s.userConns[conn.UserAddress], conn)

	log.Printf("📱 WebSocket connection mapping registered: user=%s, connID=%s (connection managed externally)", conn.UserAddress, conn.ID)
}

// UnregisterConnectionMapping removes only the connection mapping without closing the connection
// This is used when the connection is managed by another handler
func (s *WebSocketPushService) UnregisterConnectionMapping(conn *Connection) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Remove from connection mapping
	delete(s.connections, conn.ID)

	// Remove from user connection mapping
	if userConns, exists := s.userConns[conn.UserAddress]; exists {
		for i, c := range userConns {
			if c.ID == conn.ID {
				s.userConns[conn.UserAddress] = append(userConns[:i], userConns[i+1:]...)
				break
			}
		}

		// If user has no more connections, delete user mapping
		if len(s.userConns[conn.UserAddress]) == 0 {
			delete(s.userConns, conn.UserAddress)
		}
	}

	// Don't close connection or Send channel - let the external handler manage it
	log.Printf("📱 WebSocket connection mapping unregistered: user=%s, connID=%s", conn.UserAddress, conn.ID)
}

// Handle connection registration
func (s *WebSocketPushService) handleRegister(conn *Connection) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.connections[conn.ID] = conn

	// Add to user connection mapping
	if s.userConns[conn.UserAddress] == nil {
		s.userConns[conn.UserAddress] = make([]*Connection, 0)
	}
	s.userConns[conn.UserAddress] = append(s.userConns[conn.UserAddress], conn)

	log.Printf("📱 WebSocket connection registered: user=%s, connID=%s", conn.UserAddress, conn.ID)

	// Send connection confirmation message (only if connection has Send channel)
	if conn.Send != nil {
		confirmMsg := PushMessage{
			Type:        "connection_established",
			Timestamp:   time.Now().Format(time.RFC3339),
			MessageID:   generateMessageID(),
			UserAddress: conn.UserAddress,
			Data: map[string]interface{}{
				"user_address":  conn.UserAddress,
				"connection_id": conn.ID,
				"message":       "Real-time status connection established",
			},
		}

		s.sendToConnection(conn, confirmMsg)
	}
}

// Handle connection unregistration
func (s *WebSocketPushService) handleUnregister(conn *Connection) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Remove from connection mapping
	delete(s.connections, conn.ID)

	// Remove from user connection mapping
	if userConns, exists := s.userConns[conn.UserAddress]; exists {
		for i, c := range userConns {
			if c.ID == conn.ID {
				s.userConns[conn.UserAddress] = append(userConns[:i], userConns[i+1:]...)
				break
			}
		}

		// If user has no more connections, delete user mapping
		if len(s.userConns[conn.UserAddress]) == 0 {
			delete(s.userConns, conn.UserAddress)
		}
	}

	// Close connection
	if conn.Send != nil {
		close(conn.Send)
	}
	if conn.Conn != nil {
		conn.Conn.Close()
	}

	log.Printf("📱 WebSocket connection unregistered: user=%s, connID=%s", conn.UserAddress, conn.ID)
}

// processmessage
func (s *WebSocketPushService) handleBroadcast(message PushMessage) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	// gettargetuserconnection
	userConns, exists := s.userConns[message.UserAddress]
	if !exists {
		log.Printf("📭 No connections for user: %s", message.UserAddress)
		return
	}

	// message
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("❌ Failed to marshal message: %v", err)
		return
	}

	// ============= WebSocketpushLOG =============
	log.Printf("🔔 [WebSocketpush] : %s", message.Type)
	log.Printf("🔔 [WebSocketpush] targetuser: %s", message.UserAddress)
	log.Printf("🔔 [WebSocketpush] messageID: %s", message.MessageID)
	log.Printf("🔔 [WebSocketpush] timestamp: %s", message.Timestamp)

	// messagedata
	switch message.Type {
	case "checkbook_status_update":
		if checkbookData, ok := message.Data.(CheckbookStatusUpdateData); ok {
			log.Printf("🔔 [WebSocketpush] Checkbookdata: ID=%s, status=%s→%s, usermessage='%s', =%d%%",
				checkbookData.CheckbookID, checkbookData.OldStatus, checkbookData.NewStatus,
				checkbookData.UserMessage, checkbookData.Progress)
			if len(checkbookData.BusinessChainData) > 0 {
				log.Printf("🔔 [WebSocketpush] data: %+v", checkbookData.BusinessChainData)
			}
			if len(checkbookData.ProofData) > 0 {
				log.Printf("🔔 [WebSocketpush] data: %+v", checkbookData.ProofData)
			}
		}
	case "checkbook_update":
		// SDK-compatible checkbook update format
		if checkbookData, ok := message.Data.(CheckbookUpdateData); ok {
			log.Printf("🔔 [WebSocketpush] CheckbookUpdate (SDK): ID=%s, Action=%s, Status=%s, Progress=%d%%",
				checkbookData.Checkbook.ID, checkbookData.Action, checkbookData.Checkbook.Status, checkbookData.Progress)
		} else {
			log.Printf("🔔 [WebSocketpush] CheckbookUpdate (SDK) data: %+v", message.Data)
		}
	case "allocation_update":
		// SDK-compatible allocation update format
		if allocationData, ok := message.Data.(AllocationUpdateData); ok {
			log.Printf("🔔 [WebSocketpush] AllocationUpdate (SDK): ID=%s, Action=%s, Status=%s",
				allocationData.Allocation.ID, allocationData.Action, allocationData.Allocation.Status)
		} else {
			log.Printf("🔔 [WebSocketpush] AllocationUpdate (SDK) data: %+v", message.Data)
		}
	case "withdrawal_update":
		// SDK-compatible withdrawal update format
		if withdrawalData, ok := message.Data.(WithdrawalUpdateData); ok {
			log.Printf("🔔 [WebSocketpush] WithdrawalUpdate (SDK): ID=%s, Action=%s, Status=%s",
				withdrawalData.Withdrawal.ID, withdrawalData.Action, withdrawalData.Withdrawal.Status)
		} else {
			log.Printf("🔔 [WebSocketpush] WithdrawalUpdate (SDK) data: %+v", message.Data)
		}
	case "check_status_update":
		if checkData, ok := message.Data.(CheckStatusUpdateData); ok {
			log.Printf("🔔 [WebSocketpush] Checkdata: ID=%s, CheckbookID=%s, status=%s→%s, usermessage='%s', =%d%%",
				checkData.CheckID, checkData.CheckbookID, checkData.OldStatus, checkData.NewStatus,
				checkData.UserMessage, checkData.Progress)
			if len(checkData.WithdrawalInfo) > 0 {
				log.Printf("🔔 [WebSocketpush] withdraw: %+v", checkData.WithdrawalInfo)
			}
			if len(checkData.ProofInfo) > 0 {
				log.Printf("🔔 [WebSocketpush] : %+v", checkData.ProofInfo)
			}
		}
	case "connection_established":
		log.Printf("🔔 [WebSocketpush] connectionconfirmdata: %+v", message.Data)
	case "status_sync":
		log.Printf("🔔 [WebSocketpush] statusdata: %+v", message.Data)
	default:
		log.Printf("🔔 [WebSocketpush] data: %+v", message.Data)
	}

	// JSONdata（）
	log.Printf("🔔 [WebSocketpush] JSONdata: %s", string(data))
	// ================================================

	// userconnection
	successCount := 0
	failedCount := 0
	for _, conn := range userConns {
		select {
		case conn.Send <- data:
			// success
			successCount++
			log.Printf("✅ [WebSocketpush] Message queued to connection: %s (user: %s)", conn.ID, message.UserAddress)
		default:
			// failed，connectionalready
			failedCount++
			log.Printf("⚠️ [WebSocketpush] Failed to send to connection: %s (channel full or closed)", conn.ID)
		}
	}

	log.Printf("📤 [WebSocketpush] Message delivery summary: sent=%d, failed=%d, total=%d, user=%s, type=%s",
		successCount, failedCount, len(userConns), message.UserAddress, message.Type)
}

// messageconnection
func (s *WebSocketPushService) sendToConnection(conn *Connection, message PushMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("❌ Failed to marshal message: %v", err)
		return
	}

	select {
	case conn.Send <- data:
		// success
	default:
		log.Printf("⚠️ Failed to send to connection: %s", conn.ID)
	}
}

// SSEconnectionprocess
func (s *WebSocketPushService) HandleSSE(w http.ResponseWriter, r *http.Request, userAddress string) {
	// SSEresponse
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, Cache-Control, Accept")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Type")

	// 🔥 ：flushresponse，clientresponsetriggeronopenevent
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
		log.Printf("✅ SSEresponsealreadyflushclient")
	} else {
		log.Printf("❌ ResponseWritersupportFlush")
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// createSSEconnection
	connection := &Connection{
		ID:          generateConnectionID(),
		UserAddress: userAddress,
		Conn:        nil, // SSEneedWebSocketconnection
		Send:        make(chan []byte, 256),
		LastPing:    time.Now(),
	}

	log.Printf("📡 SSEconnection: user=%s, connID=%s", userAddress, connection.ID)

	// connection
	s.register <- connection

	// 🔥 connectionmessage（clientonopentrigger）
	welcomeMsg := fmt.Sprintf(`{"type":"connection_established","timestamp":"%s","message_id":"%s","user_address":"%s"}`,
		time.Now().Format(time.RFC3339),
		generateMessageID(),
		userAddress,
	)
	if flusher, ok := w.(http.Flusher); ok {
		fmt.Fprintf(w, "data: %s\n\n", welcomeMsg)
		flusher.Flush()
		log.Printf("📤 alreadyconnectionmessage")
	}

	// userequestcontext（client）
	ctx := r.Context()

	// startSSE
	writeFinished := make(chan struct{})
	go func() {
		defer close(writeFinished)
		s.handleSSEWriteWithContext(ctx, w, connection)
	}()

	// waitconnection
	select {
	case <-ctx.Done():
		log.Printf("📡 SSEconnection: user=%s, connID=%s, : %v", userAddress, connection.ID, ctx.Err())
	case <-writeFinished:
		log.Printf("📡 SSEend: user=%s, connID=%s", userAddress, connection.ID)
	}

	// connection
	s.unregister <- connection
}

// processSSE
func (s *WebSocketPushService) handleSSEWrite(w http.ResponseWriter, conn *Connection) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Printf("❌ SSE not supported")
		return
	}

	// addpanic
	defer func() {
		if r := recover(); r != nil {
			log.Printf("⚠️ SSEpanicalready: %v, connectionID: %s", r, conn.ID)
		}
	}()

	for {
		select {
		case message, ok := <-conn.Send:
			if !ok {
				log.Printf("📡 SSEconnectionchannelalready，: %s", conn.ID)
				return
			}

			// SSEmessage，checkerror
			if err := s.safeSSEWrite(w, flusher, fmt.Sprintf("data: %s\n\n", string(message))); err != nil {
				log.Printf("⚠️ SSEmessagefailed，connectionalready: %s, error: %v", conn.ID, err)
				return
			}

		case <-time.After(30 * time.Second):

			heartbeatMsg := fmt.Sprintf("data: {\"type\":\"heartbeat\",\"timestamp\":\"%s\"}\n\n", time.Now().Format(time.RFC3339))
			if err := s.safeSSEWrite(w, flusher, heartbeatMsg); err != nil {
				log.Printf("⚠️ SSEfailed，connectionalready: %s, error: %v", conn.ID, err)
				return
			}
		}
	}
}

// SSE，errorprocess
func (s *WebSocketPushService) safeSSEWrite(w http.ResponseWriter, flusher http.Flusher, message string) error {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("⚠️ SSEpanic: %v", r)
		}
	}()

	// checkResponseWriterwhether（check）
	if w == nil {
		return fmt.Errorf("ResponseWriternil")
	}

	// attemptWrite message
	_, err := fmt.Fprint(w, message)
	if err != nil {
		return fmt.Errorf("SSEmessagefailed: %w", err)
	}

	// attemptflush（panic）
	if flusher != nil {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("⚠️ SSE flushpanic: %v", r)
				}
			}()
			flusher.Flush()
		}()
	}

	return nil
}

// ContextSSEprocess（supporttimeout）
func (s *WebSocketPushService) handleSSEWriteWithContext(ctx context.Context, w http.ResponseWriter, conn *Connection) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Printf("❌ SSEsupportflush: %s", conn.ID)
		return
	}

	// addpanic
	defer func() {
		if r := recover(); r != nil {
			log.Printf("⚠️ SSEpanicalready: %v, connectionID: %s", r, conn.ID)
		}
	}()

	// （30connection）
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	// timeout（60thentimeout）
	idleTimeout := 60 * time.Second
	idleTimer := time.NewTimer(idleTimeout)
	defer idleTimer.Stop()

	resetIdleTimer := func() {
		if !idleTimer.Stop() {
			select {
			case <-idleTimer.C:
			default:
			}
		}
		idleTimer.Reset(idleTimeout)
	}

	for {
		select {
		case <-ctx.Done():
			log.Printf("📡 SSEcontextend: %s, : %v", conn.ID, ctx.Err())
			return

		case <-idleTimer.C:
			log.Printf("⏱️ SSEconnectiontimeout（60data）: %s", conn.ID)
			return

		case message, ok := <-conn.Send:
			if !ok {
				log.Printf("📡 SSEconnectionchannelalready，: %s", conn.ID)
				return
			}

			// SSEmessage
			if err := s.safeSSEWrite(w, flusher, fmt.Sprintf("data: %s\n\n", string(message))); err != nil {
				log.Printf("⚠️ SSEmessagefailed，connectionalready: %s, error: %v", conn.ID, err)
				return
			}

			// message
			resetIdleTimer()

		case <-heartbeatTicker.C:
			// （context）
			select {
			case <-ctx.Done():
				return
			default:
				heartbeatMsg := fmt.Sprintf("data: {\"type\":\"heartbeat\",\"timestamp\":\"%s\"}\n\n", time.Now().Format(time.RFC3339))
				if err := s.safeSSEWrite(w, flusher, heartbeatMsg); err != nil {
					log.Printf("⚠️ SSEfailed，connectionalready: %s, error: %v", conn.ID, err)
					return
				}

				resetIdleTimer()
			}
		}
	}
}

// WebSocketconnectionprocess
func (s *WebSocketPushService) HandleWebSocket(w http.ResponseWriter, r *http.Request, userAddress string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("❌ WebSocket upgrade failed: %v", err)
		return
	}

	connection := &Connection{
		ID:          generateConnectionID(),
		UserAddress: userAddress,
		Conn:        conn,
		Send:        make(chan []byte, 256),
		LastPing:    time.Now(),
	}

	// connection
	s.register <- connection

	// start
	go s.handleConnectionWrite(connection)
	go s.handleConnectionRead(connection)
}

// processconnection
func (s *WebSocketPushService) handleConnectionWrite(conn *Connection) {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		conn.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-conn.Send:
			conn.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				conn.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := conn.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("❌ Write message failed: %v", err)
				return
			}

		case <-ticker.C:
			conn.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// processconnection
func (s *WebSocketPushService) handleConnectionRead(conn *Connection) {
	defer func() {
		s.unregister <- conn
		conn.Conn.Close()
	}()

	conn.Conn.SetReadLimit(512)
	conn.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.Conn.SetPongHandler(func(string) error {
		conn.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.LastPing = time.Now()
		return nil
	})

	for {
		_, _, err := conn.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("❌ WebSocket read error: %v", err)
			}
			break
		}
	}
}

// ========== NEW SDK-Compatible Broadcast Functions ==========

// BroadcastCheckbookUpdateSDK sends SDK-compatible checkbook update
func (s *WebSocketPushService) BroadcastCheckbookUpdateSDK(userAddress string, data CheckbookUpdateData) {
	log.Printf("🚀 [WebSocket SDK] Pushing Checkbook update")
	log.Printf("🚀 [WebSocket SDK] Target user: %s", userAddress)
	log.Printf("🚀 [WebSocket SDK] Checkbook ID: %s", data.Checkbook.ID)
	log.Printf("🚀 [WebSocket SDK] Action: %s", data.Action)
	log.Printf("🚀 [WebSocket SDK] Status: %s", data.Checkbook.Status)

	// Get user-friendly message if it's an update
	if data.Action == "updated" {
		if msgInfo, exists := checkbookStatusMessages[data.Checkbook.Status]; exists {
			data.UserMessage = msgInfo.Message
			data.Progress = msgInfo.Progress
		}
	}

	message := PushMessage{
		Type:        "checkbook_update", // SDK expects "checkbook_update", not "checkbook_status_update"
		Timestamp:   time.Now().Format(time.RFC3339),
		MessageID:   generateMessageID(),
		UserAddress: userAddress,
		Data:        data,
	}

	s.hub <- message
	log.Printf("✅ [WebSocket SDK] Checkbook update queued for delivery")
}

// BroadcastAllocationUpdateSDK sends SDK-compatible allocation update
// Check (Allocation) status changes should push allocation_update to AllocationsStore
func (s *WebSocketPushService) BroadcastAllocationUpdateSDK(userAddress string, data AllocationUpdateData) {
	log.Printf("🚀 [WebSocket SDK] Pushing Allocation update")
	log.Printf("🚀 [WebSocket SDK] Target user: %s", userAddress)
	log.Printf("🚀 [WebSocket SDK] Allocation ID: %s", data.Allocation.ID)
	log.Printf("🚀 [WebSocket SDK] Action: %s", data.Action)
	log.Printf("🚀 [WebSocket SDK] Status: %s", data.Allocation.Status)

	message := PushMessage{
		Type:        "allocation_update",
		Timestamp:   time.Now().Format(time.RFC3339),
		MessageID:   generateMessageID(),
		UserAddress: userAddress,
		Data:        data,
	}

	s.hub <- message
	log.Printf("✅ [WebSocket SDK] Allocation update queued for delivery")
}

// BroadcastWithdrawalUpdateSDK sends SDK-compatible withdrawal update
// When WithdrawRequest status changes, push withdrawal_update to WithdrawalsStore
func (s *WebSocketPushService) BroadcastWithdrawalUpdateSDK(userAddress string, data WithdrawalUpdateData) {
	log.Printf("🚀 [WebSocket SDK] Pushing Withdrawal update")
	log.Printf("🚀 [WebSocket SDK] Target user: %s", userAddress)
	log.Printf("🚀 [WebSocket SDK] Withdrawal ID: %s", data.Withdrawal.ID)
	log.Printf("🚀 [WebSocket SDK] Action: %s", data.Action)
	log.Printf("🚀 [WebSocket SDK] Status: %s", data.Withdrawal.Status)

	// Get user-friendly message if it's an update
	// WithdrawRequest.Status is the main status string, map it to CheckStatus for user messages
	if data.Action == "updated" {
		// Convert WithdrawRequest.Status to CheckStatus for message lookup
		checkStatus := models.CheckStatus(data.Withdrawal.Status)
		if msgInfo, exists := checkStatusMessages[checkStatus]; exists {
			data.UserMessage = msgInfo.Message
			data.Progress = msgInfo.Progress
		}
	}

	message := PushMessage{
		Type:        "withdrawal_update", // SDK expects "withdrawal_update", not "check_status_update"
		Timestamp:   time.Now().Format(time.RFC3339),
		MessageID:   generateMessageID(),
		UserAddress: userAddress,
		Data:        data,
	}

	s.hub <- message
	log.Printf("✅ [WebSocket SDK] Withdrawal update queued for delivery")
}

// ========== LEGACY Broadcast Functions (for backward compatibility) ==========

// Checkbookstatusupdate (Legacy)
func (s *WebSocketPushService) BroadcastCheckbookUpdate(userAddress string, data CheckbookStatusUpdateData) {
	// ============= WebSocketpushLOG =============
	log.Printf("🚀 [WebSocketpush] pushCheckbookstatusupdate")
	log.Printf("🚀 [WebSocketpush] targetuser: %s", userAddress)
	log.Printf("🚀 [WebSocketpush] Checkbook ID: %s", data.CheckbookID)
	log.Printf("🚀 [WebSocketpush] status: %s → %s", data.OldStatus, data.NewStatus)
	// ===============================================

	// getusermessage
	if msgInfo, exists := checkbookStatusMessages[models.CheckbookStatus(data.NewStatus)]; exists {
		data.UserMessage = msgInfo.Message
		data.Progress = msgInfo.Progress
		log.Printf("🚀 [WebSocketpush] usermessage: %s (: %d%%)", data.UserMessage, data.Progress)
	}

	message := PushMessage{
		Type:        "checkbook_status_update",
		Timestamp:   time.Now().Format(time.RFC3339),
		MessageID:   generateMessageID(),
		UserAddress: userAddress,
		Data:        data,
	}

	log.Printf("🚀 [WebSocketpush] messagealreadyhub，wait")
	s.hub <- message
}

// Checkstatusupdate
func (s *WebSocketPushService) BroadcastCheckUpdate(userAddress string, data CheckStatusUpdateData) {
	// ============= WebSocketpushLOG =============
	log.Printf("🚀 [WebSocketpush] pushCheckstatusupdate")
	log.Printf("🚀 [WebSocketpush] targetuser: %s", userAddress)
	log.Printf("🚀 [WebSocketpush] Check ID: %s", data.CheckID)
	log.Printf("🚀 [WebSocketpush] Checkbook ID: %s", data.CheckbookID)
	log.Printf("🚀 [WebSocketpush] status: %s → %s", data.OldStatus, data.NewStatus)
	// ===============================================

	// getusermessage
	if msgInfo, exists := checkStatusMessages[models.CheckStatus(data.NewStatus)]; exists {
		data.UserMessage = msgInfo.Message
		data.Progress = msgInfo.Progress
		log.Printf("🚀 [WebSocketpush] usermessage: %s (: %d%%)", data.UserMessage, data.Progress)
	}

	message := PushMessage{
		Type:        "check_status_update",
		Timestamp:   time.Now().Format(time.RFC3339),
		MessageID:   generateMessageID(),
		UserAddress: userAddress,
		Data:        data,
	}

	log.Printf("🚀 [WebSocketpush] messagealreadyhub，wait")
	s.hub <- message
}

// statusmessage
func (s *WebSocketPushService) BroadcastStatusSync(userAddress string, checkbooks []models.Checkbook, checks []models.Check) {
	syncData := map[string]interface{}{
		"checkbooks": checkbooks,
		"checks":     checks,
		"sync_time":  time.Now().Format(time.RFC3339),
	}

	message := PushMessage{
		Type:        "status_sync",
		Timestamp:   time.Now().Format(time.RFC3339),
		MessageID:   generateMessageID(),
		UserAddress: userAddress,
		Data:        syncData,
	}

	s.hub <- message
}

// getconnection
func (s *WebSocketPushService) GetActiveConnections() int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return len(s.connections)
}

// getuserconnection
func (s *WebSocketPushService) GetUserConnections(userAddress string) int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	if conns, exists := s.userConns[userAddress]; exists {
		return len(conns)
	}
	return 0
}

// ==================== pushprocess ====================

// PushCheckbookStatusUpdate pushes SDK-compatible checkbook update (queries checkbook by ID)
func (s *WebSocketPushService) PushCheckbookStatusUpdate(db *gorm.DB, checkbookID string, oldStatus string, context string) error {
	var checkbook models.Checkbook
	if err := db.First(&checkbook, "id = ?", checkbookID).Error; err != nil {
		log.Printf("❌ [%s] Failed to query Checkbook (ID=%s): %v", context, checkbookID, err)
		return err
	}

	// useraddress - Convert to Universal Address format (chainID:32-byte-hex)
	// Database stores normal address format, but JWT uses Universal Address format
	userAddressStr := s.formatUniversalAddressForPush(checkbook.UserAddress.SLIP44ChainID, checkbook.UserAddress.Data)

	// Determine action (always 'updated' for status changes)
	action := "updated"
	if oldStatus == "" {
		action = "created"
	}

	// Send SDK-compatible update
	s.BroadcastCheckbookUpdateSDK(userAddressStr, CheckbookUpdateData{
		Action:    action,
		Checkbook: checkbook,
		Previous:  nil, // Could store previous state if needed
	})

	log.Printf("📡 [%s] Pushed SDK checkbook update: user=%s, checkbook=%s, %s→%s",
		context, userAddressStr, checkbook.ID, oldStatus, checkbook.Status)
	return nil
}

// PushCheckStatusUpdate pushes SDK-compatible allocation update (queries check by ID)
// NOTE: When Check (Allocation) status changes, we should push allocation_update to AllocationsStore
// NOT withdrawal_update, because Check and WithdrawRequest are different entities
func (s *WebSocketPushService) PushCheckStatusUpdate(db *gorm.DB, checkID string, oldStatus string, context string) error {
	var check models.Check
	if err := db.First(&check, "id = ?", checkID).Error; err != nil {
		log.Printf("❌ [%s] Failed to query Check (ID=%s): %v", context, checkID, err)
		return err
	}

	// Query Checkbook to get user address
	var checkbook models.Checkbook
	if err := db.First(&checkbook, "id = ?", check.CheckbookID).Error; err != nil {
		log.Printf("❌ [%s] Failed to query Checkbook (CheckbookID=%s): %v", context, check.CheckbookID, err)
		return err
	}

	// Get user address from Checkbook
	userAddressStr := s.formatUniversalAddressForPush(checkbook.UserAddress.SLIP44ChainID, checkbook.UserAddress.Data)

	// Determine action
	action := "updated"
	if oldStatus == "" {
		action = "created"
	}

	// Send SDK-compatible allocation update (Check is Allocation in SDK)
	// Note: AllocationUpdateData.Allocation is interface{}, so we can pass Check directly
	s.BroadcastAllocationUpdateSDK(userAddressStr, AllocationUpdateData{
		Action:     action,
		Allocation: check, // Push Check (Allocation), not WithdrawRequest
		Previous:   nil,   // Could store previous state if needed
	})

	log.Printf("📡 [%s] Pushed SDK allocation update: user=%s, check=%s, %s→%s",
		context, userAddressStr, check.ID, oldStatus, check.Status)
	return nil
}

// PushWithdrawRequestStatusUpdate pushes SDK-compatible withdrawal update (queries withdrawRequest by ID)
// When WithdrawRequest status changes, push withdrawal_update to WithdrawalsStore
func (s *WebSocketPushService) PushWithdrawRequestStatusUpdate(db *gorm.DB, withdrawRequestID string, oldStatus string, context string) error {
	var withdrawRequest models.WithdrawRequest
	// Use Unscoped() to ensure we get the latest data, and reload to get computed status
	if err := db.Unscoped().First(&withdrawRequest, "id = ?", withdrawRequestID).Error; err != nil {
		log.Printf("❌ [%s] Failed to query WithdrawRequest (ID=%s): %v", context, withdrawRequestID, err)
		return err
	}

	// Reload to ensure we have the latest computed main status
	// UpdateMainStatus computes Status from sub-statuses, so we need to ensure it's up-to-date
	if err := db.First(&withdrawRequest, "id = ?", withdrawRequestID).Error; err != nil {
		log.Printf("❌ [%s] Failed to reload WithdrawRequest (ID=%s): %v", context, withdrawRequestID, err)
		return err
	}

	// Ensure main status is computed correctly
	withdrawRequest.UpdateMainStatus()

	// Get user address from WithdrawRequest
	userAddressStr := s.formatUniversalAddressForPush(withdrawRequest.OwnerAddress.SLIP44ChainID, withdrawRequest.OwnerAddress.Data)

	// Determine action
	action := "updated"
	if oldStatus == "" {
		action = "created"
	}

	// Send SDK-compatible withdrawal update
	s.BroadcastWithdrawalUpdateSDK(userAddressStr, WithdrawalUpdateData{
		Action:     action,
		Withdrawal: withdrawRequest, // Push WithdrawRequest
		Previous:   nil,             // Could store previous state if needed
	})

	log.Printf("📡 [%s] Pushed SDK withdrawal update: user=%s, withdrawRequest=%s, %s→%s",
		context, userAddressStr, withdrawRequest.ID, oldStatus, withdrawRequest.Status)
	return nil
}

// PushWithdrawRequestStatusUpdateDirect pushes SDK-compatible withdrawal update (with existing withdrawRequest object)
// When WithdrawRequest status changes, push withdrawal_update to WithdrawalsStore
func (s *WebSocketPushService) PushWithdrawRequestStatusUpdateDirect(withdrawRequest *models.WithdrawRequest, oldStatus string, context string) {
	if withdrawRequest == nil {
		log.Printf("⚠️ [%s] WithdrawRequest is nil, cannot push status update", context)
		return
	}

	// Get user address from WithdrawRequest
	userAddressStr := s.formatUniversalAddressForPush(withdrawRequest.OwnerAddress.SLIP44ChainID, withdrawRequest.OwnerAddress.Data)

	// Determine action
	action := "updated"
	if oldStatus == "" {
		action = "created"
	}

	// Send SDK-compatible withdrawal update
	s.BroadcastWithdrawalUpdateSDK(userAddressStr, WithdrawalUpdateData{
		Action:     action,
		Withdrawal: *withdrawRequest, // Push WithdrawRequest
		Previous:   nil,              // Could store previous state if needed
	})

	log.Printf("📡 [%s] Pushed SDK withdrawal update (direct): user=%s, withdrawRequest=%s, %s→%s",
		context, userAddressStr, withdrawRequest.ID, oldStatus, withdrawRequest.Status)
}

// PushCheckbookStatusUpdateDirect pushes SDK-compatible checkbook update (with existing checkbook object)
func (s *WebSocketPushService) PushCheckbookStatusUpdateDirect(checkbook *models.Checkbook, oldStatus string, context string) {
	// Use formatUniversalAddressForPush to ensure address format matches JWT Universal Address format
	userAddressStr := s.formatUniversalAddressForPush(checkbook.UserAddress.SLIP44ChainID, checkbook.UserAddress.Data)

	// Determine action
	action := "updated"
	if oldStatus == "" {
		action = "created"
	}

	// Send SDK-compatible update
	s.BroadcastCheckbookUpdateSDK(userAddressStr, CheckbookUpdateData{
		Action:    action,
		Checkbook: *checkbook,
		Previous:  nil,
	})

	log.Printf("📡 [%s] Pushed SDK checkbook update (direct): user=%s, checkbook=%s, %s→%s",
		context, userAddressStr, checkbook.ID, oldStatus, checkbook.Status)
}

// formatUniversalAddressForPush converts a normal address to Universal Address format for push messages
// This ensures the address format matches the JWT Universal Address format
func (s *WebSocketPushService) formatUniversalAddressForPush(chainID uint32, addressData string) string {
	// If address is already in Universal Address format (32 bytes = 64 hex chars + 0x = 66 chars)
	if strings.HasPrefix(strings.ToLower(addressData), "0x") && len(addressData) == 66 {
		return fmt.Sprintf("%d:%s", chainID, strings.ToLower(addressData))
	}

	// Convert normal address (20 bytes = 40 hex chars + 0x = 42 chars) to Universal Address format
	// Remove 0x prefix if present
	hexStr := strings.TrimPrefix(strings.ToLower(addressData), "0x")

	// If it's already 64 hex chars, it's already in Universal Address format
	if len(hexStr) == 64 {
		return fmt.Sprintf("%d:0x%s", chainID, hexStr)
	}

	// Normal address (40 hex chars) - pad to 32 bytes (64 hex chars)
	if len(hexStr) == 40 {
		// Pad with zeros: 12 bytes (24 hex chars) of zeros + 20 bytes (40 hex chars) of address
		padded := "000000000000000000000000" + hexStr
		return fmt.Sprintf("%d:0x%s", chainID, padded)
	}

	// If format is unknown, return as-is (shouldn't happen in normal operation)
	log.Printf("⚠️ Unknown address format for push: chainID=%d, address=%s", chainID, addressData)
	return fmt.Sprintf("%d:%s", chainID, addressData)
}

// PushCheckStatusUpdateDirect pushes SDK-compatible withdrawal update (with existing check object)
// NOTE: When Check status changes, we should push the corresponding WithdrawRequest, not the Check itself
// because frontend WithdrawalsStore expects WithdrawRequest objects, not Check (Allocation) objects
// This function requires a DB connection to query the WithdrawRequest, so it's deprecated.
// Use PushCheckStatusUpdate() instead, which has DB access.
func (s *WebSocketPushService) PushCheckStatusUpdateDirect(check *models.Check, checkbook *models.Checkbook, oldStatus string, context string) {
	if checkbook == nil {
		log.Printf("⚠️ [%s] Checkbook is nil, cannot push Check status: CheckID=%s", context, check.ID)
		return
	}

	// If Check is not associated with a WithdrawRequest, skip push
	// (Check status changes for idle allocations don't need to be pushed as withdrawal updates)
	if check.WithdrawRequestID == nil || *check.WithdrawRequestID == "" {
		log.Printf("⚠️ [%s] Check (ID=%s) has no WithdrawRequestID, skipping withdrawal update push", context, check.ID)
		return
	}

	// NOTE: This function cannot query WithdrawRequest without DB access
	// The caller should use PushCheckStatusUpdate() instead, which has DB access
	// Log both WithdrawRequestID (UUID, database FK) and Nullifier (hex, on-chain RequestId) for clarity
	nullifierInfo := "N/A"
	if check.Nullifier != "" {
		nullifierInfo = check.Nullifier
	}
	log.Printf("⚠️ [%s] PushCheckStatusUpdateDirect called but needs DB to query WithdrawRequest. Use PushCheckStatusUpdate() instead. CheckID=%s, WithdrawRequestID=%s (UUID), Nullifier=%s (on-chain RequestId)",
		context, check.ID, *check.WithdrawRequestID, nullifierInfo)

	// TODO: Refactor to add DB parameter or always use PushCheckStatusUpdate()
}

// ====================  ====================

func generateConnectionID() string {
	return fmt.Sprintf("conn_%d", time.Now().UnixNano())
}

func generateMessageID() string {
	return fmt.Sprintf("msg_%d", time.Now().UnixNano())
}
