package services

import (
	"sync"
)

// SubscriptionType defines the type of subscription
type SubscriptionType string

const (
	// Subscription types
	SubscriptionTypeDeposits        SubscriptionType = "deposits"
	SubscriptionTypeCheckbooks      SubscriptionType = "checkbooks"
	SubscriptionTypeWithdrawRequest SubscriptionType = "withdraw_requests"
	SubscriptionTypePrice           SubscriptionType = "prices"
)

// SubscriptionFilter contains filters for a subscription
type SubscriptionFilter struct {
	Type      SubscriptionType `json:"type"`
	Address   string           `json:"address,omitempty"`   // For deposits/checkbooks/withdraw_requests
	AssetIDs  []string         `json:"asset_ids,omitempty"` // For prices
	Timestamp int64            `json:"timestamp"`
}

// ClientSubscription represents a client's subscriptions
type ClientSubscription struct {
	ClientID      string
	Address       string // User address from JWT
	Subscriptions map[SubscriptionType]*SubscriptionFilter
	MessageChan   chan interface{}
	mu            sync.RWMutex
}

// WebSocketSubscriptionManager manages all active subscriptions
type WebSocketSubscriptionManager struct {
	// Map of connection ID to client subscription
	clients map[string]*ClientSubscription
	mu      sync.RWMutex

	// Subscription indexes for fast lookup
	// Key: subscription type (e.g., "prices"), Value: map of criteria to client IDs
	depositSubscriptions         map[string]map[string]bool // address -> clientID set
	checkbookSubscriptions       map[string]map[string]bool // address -> clientID set
	withdrawRequestSubscriptions map[string]map[string]bool // address -> clientID set
	priceSubscriptions           map[string]map[string]bool // assetID -> clientID set
	subscriptionMu               sync.RWMutex
}

// NewWebSocketSubscriptionManager creates a new subscription manager
func NewWebSocketSubscriptionManager() *WebSocketSubscriptionManager {
	return &WebSocketSubscriptionManager{
		clients:                      make(map[string]*ClientSubscription),
		depositSubscriptions:         make(map[string]map[string]bool),
		checkbookSubscriptions:       make(map[string]map[string]bool),
		withdrawRequestSubscriptions: make(map[string]map[string]bool),
		priceSubscriptions:           make(map[string]map[string]bool),
	}
}

// RegisterClient registers a new client connection
func (m *WebSocketSubscriptionManager) RegisterClient(clientID, address string, messageChan chan interface{}) *ClientSubscription {
	m.mu.Lock()
	defer m.mu.Unlock()

	client := &ClientSubscription{
		ClientID:      clientID,
		Address:       address,
		Subscriptions: make(map[SubscriptionType]*SubscriptionFilter),
		MessageChan:   messageChan,
	}
	m.clients[clientID] = client
	return client
}

// UnregisterClient removes a client and all its subscriptions
func (m *WebSocketSubscriptionManager) UnregisterClient(clientID string) {
	m.mu.Lock()
	_, exists := m.clients[clientID]
	delete(m.clients, clientID)
	m.mu.Unlock()

	if !exists {
		return
	}

	// Remove from all subscription indexes
	m.subscriptionMu.Lock()
	defer m.subscriptionMu.Unlock()

	// Remove from deposits
	for addr := range m.depositSubscriptions {
		delete(m.depositSubscriptions[addr], clientID)
	}

	// Remove from checkbooks
	for addr := range m.checkbookSubscriptions {
		delete(m.checkbookSubscriptions[addr], clientID)
	}

	// Remove from withdraw requests
	for addr := range m.withdrawRequestSubscriptions {
		delete(m.withdrawRequestSubscriptions[addr], clientID)
	}

	// Remove from prices
	for assetID := range m.priceSubscriptions {
		delete(m.priceSubscriptions[assetID], clientID)
	}
}

// Subscribe adds a subscription for a client
func (m *WebSocketSubscriptionManager) Subscribe(clientID string, filter *SubscriptionFilter) error {
	m.mu.RLock()
	client, exists := m.clients[clientID]
	m.mu.RUnlock()

	if !exists {
		return ErrClientNotFound
	}

	client.mu.Lock()
	client.Subscriptions[filter.Type] = filter
	client.mu.Unlock()

	// Add to subscription indexes
	m.subscriptionMu.Lock()
	defer m.subscriptionMu.Unlock()

	switch filter.Type {
	case SubscriptionTypeDeposits:
		if m.depositSubscriptions[filter.Address] == nil {
			m.depositSubscriptions[filter.Address] = make(map[string]bool)
		}
		m.depositSubscriptions[filter.Address][clientID] = true

	case SubscriptionTypeCheckbooks:
		if m.checkbookSubscriptions[filter.Address] == nil {
			m.checkbookSubscriptions[filter.Address] = make(map[string]bool)
		}
		m.checkbookSubscriptions[filter.Address][clientID] = true

	case SubscriptionTypeWithdrawRequest:
		if m.withdrawRequestSubscriptions[filter.Address] == nil {
			m.withdrawRequestSubscriptions[filter.Address] = make(map[string]bool)
		}
		m.withdrawRequestSubscriptions[filter.Address][clientID] = true

	case SubscriptionTypePrice:
		for _, assetID := range filter.AssetIDs {
			if m.priceSubscriptions[assetID] == nil {
				m.priceSubscriptions[assetID] = make(map[string]bool)
			}
			m.priceSubscriptions[assetID][clientID] = true
		}
	}

	return nil
}

// Unsubscribe removes a subscription for a client
func (m *WebSocketSubscriptionManager) Unsubscribe(clientID string, subType SubscriptionType) error {
	m.mu.RLock()
	client, exists := m.clients[clientID]
	m.mu.RUnlock()

	if !exists {
		return ErrClientNotFound
	}

	client.mu.Lock()
	filter, exists := client.Subscriptions[subType]
	delete(client.Subscriptions, subType)
	client.mu.Unlock()

	if !exists {
		return ErrSubscriptionNotFound
	}

	// Remove from subscription indexes
	m.subscriptionMu.Lock()
	defer m.subscriptionMu.Unlock()

	switch subType {
	case SubscriptionTypeDeposits:
		delete(m.depositSubscriptions[filter.Address], clientID)
	case SubscriptionTypeCheckbooks:
		delete(m.checkbookSubscriptions[filter.Address], clientID)
	case SubscriptionTypeWithdrawRequest:
		delete(m.withdrawRequestSubscriptions[filter.Address], clientID)
	case SubscriptionTypePrice:
		for _, assetID := range filter.AssetIDs {
			delete(m.priceSubscriptions[assetID], clientID)
		}
	}

	return nil
}

// GetClientsForDeposit returns all clients subscribed to deposit changes for an address
func (m *WebSocketSubscriptionManager) GetClientsForDeposit(address string) []string {
	m.subscriptionMu.RLock()
	defer m.subscriptionMu.RUnlock()

	var clientIDs []string
	for clientID := range m.depositSubscriptions[address] {
		clientIDs = append(clientIDs, clientID)
	}
	return clientIDs
}

// GetClientsForCheckbook returns all clients subscribed to checkbook changes for an address
func (m *WebSocketSubscriptionManager) GetClientsForCheckbook(address string) []string {
	m.subscriptionMu.RLock()
	defer m.subscriptionMu.RUnlock()

	var clientIDs []string
	for clientID := range m.checkbookSubscriptions[address] {
		clientIDs = append(clientIDs, clientID)
	}
	return clientIDs
}

// GetClientsForWithdrawRequest returns all clients subscribed to withdraw request changes for an address
func (m *WebSocketSubscriptionManager) GetClientsForWithdrawRequest(address string) []string {
	m.subscriptionMu.RLock()
	defer m.subscriptionMu.RUnlock()

	var clientIDs []string
	for clientID := range m.withdrawRequestSubscriptions[address] {
		clientIDs = append(clientIDs, clientID)
	}
	return clientIDs
}

// GetClientsForPrice returns all clients subscribed to price changes for an asset
func (m *WebSocketSubscriptionManager) GetClientsForPrice(assetID string) []string {
	m.subscriptionMu.RLock()
	defer m.subscriptionMu.RUnlock()

	var clientIDs []string
	for clientID := range m.priceSubscriptions[assetID] {
		clientIDs = append(clientIDs, clientID)
	}
	return clientIDs
}

// GetClient returns a client by ID
func (m *WebSocketSubscriptionManager) GetClient(clientID string) (*ClientSubscription, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	client, exists := m.clients[clientID]
	return client, exists
}

// SendMessageToClients sends a message to multiple clients
func (m *WebSocketSubscriptionManager) SendMessageToClients(clientIDs []string, message interface{}) {
	m.mu.RLock()
	clients := make([]*ClientSubscription, 0, len(clientIDs))
	for _, id := range clientIDs {
		if client, exists := m.clients[id]; exists {
			clients = append(clients, client)
		}
	}
	m.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.MessageChan <- message:
		default:
			// Channel full, skip to avoid blocking
		}
	}
}

// Error types
var (
	ErrClientNotFound       = NewError("client not found")
	ErrSubscriptionNotFound = NewError("subscription not found")
)

// Error helper
type Error struct {
	Message string
}

func NewError(msg string) Error {
	return Error{Message: msg}
}

func (e Error) Error() string {
	return e.Message
}
