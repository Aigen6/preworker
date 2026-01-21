package app

import (
	"fmt"
	"log"
	"sync"

	"go-backend/internal/clients"
	"go-backend/internal/config"
	"go-backend/internal/db"
	"go-backend/internal/repository"
	"go-backend/internal/services"

	"gorm.io/gorm"
)

// ServiceContainer  -
type ServiceContainer struct {
	// Database
	DB *gorm.DB

	// Repositories
	CheckbookRepo     repository.CheckbookRepository
	CommitmentRepo    repository.CommitmentRepository
	AllocationRepo    repository.AllocationRepository
	DepositEventRepo  repository.DepositEventRepository
	WithdrawEventRepo repository.WithdrawEventRepository
	QueueRootRepo     repository.QueueRootRepository

	// Core Services
	CheckbookService     *services.CheckbookService
	IntentService        *services.IntentService
	BlockchainTxService  *services.BlockchainTransactionService
	KeyManagementService *services.KeyManagementService
	ZKVMClient           *clients.ZKVMClient
	QueueRootManager     *services.QueueRootManager

	// Event & Query Services
	NATSClient               *clients.NATSClient
	BlockchainEventProcessor *services.BlockchainEventProcessor

	// Push & Polling Services
	WebSocketPushService    *services.WebSocketPushService
	UnifiedPollingService   *services.UnifiedPollingService
	DatabaseWithPushService *services.DatabaseWithPushService

	// WebSocket & Price Services
	WebSocketSubscriptionManager *services.WebSocketSubscriptionManager
	PriceUpdateService           *services.PriceUpdateService

	// Withdraw Services
	WithdrawTimeoutService *services.WithdrawTimeoutService

	// Scanner Services
	UniversalScannerClient *clients.UniversalScannerClient
	BlockscannerAPIClient  *clients.BlockScannerAPIClient

	// Monitoring Service
	MonitoringService *services.MonitoringService

	// Transaction Queue Service
	TransactionQueueService *services.TransactionQueueService

	// Proof Generation Service
	ProofGenerationService *services.ProofGenerationService

	// Initialization flags
	natsOnce             sync.Once
	eventProcessorOnce   sync.Once
	pushServiceOnce      sync.Once
	databaseWithPushOnce sync.Once
}

// Global service container instance
var Container *ServiceContainer
var containerOnce sync.Once

// InitializeContainer （）
func InitializeContainer() (*ServiceContainer, error) {
	var initErr error

	containerOnce.Do(func() {
		log.Println("🚀 Initializing Service Container...")

		container := &ServiceContainer{
			DB: db.DB,
		}

		// 1. Initialize Repositories
		if err := container.initRepositories(); err != nil {
			initErr = fmt.Errorf("failed to initialize repositories: %w", err)
			return
		}

		// 2. Initialize Core Services
		if err := container.initCoreServices(); err != nil {
			initErr = fmt.Errorf("failed to initialize core services: %w", err)
			return
		}

		// 3. Initialize Event Services (optional, based on config)
		if err := container.initEventServices(); err != nil {
			// Event services are optional, log but don't fail
			log.Printf("⚠️ Event services initialization skipped or failed: %v", err)
		}

		Container = container
		log.Println("✅ Service Container initialized successfully")
	})

	return Container, initErr
}

// initRepositories  Repository
func (c *ServiceContainer) initRepositories() error {
	log.Println("📦 Initializing Repositories...")

	c.CheckbookRepo = repository.NewCheckbookRepository(c.DB)
	c.CommitmentRepo = repository.NewCommitmentRepository(c.DB)
	c.AllocationRepo = repository.NewAllocationRepository(c.DB)
	c.DepositEventRepo = repository.NewDepositEventRepository(c.DB)
	c.WithdrawEventRepo = repository.NewWithdrawEventRepository(c.DB)
	c.QueueRootRepo = repository.NewQueueRootRepository(c.DB)

	log.Println("✅ Repositories initialized")
	return nil
}

// initCoreServices
func (c *ServiceContainer) initCoreServices() error {
	log.Println("🔧 Initializing Core Services...")

	// ZKVM Client
	c.ZKVMClient = clients.NewZKVMClient(config.AppConfig.ZKVM.BaseURL)

	// Push Service (will be set later if needed)
	c.WebSocketPushService = services.NewWebSocketPushService()

	// BlockScanner API Client (TODO: Initialize properly)
	scannerBase := "http://zkpay-blockscanner:18080"
	if config.AppConfig != nil && config.AppConfig.Scanner.HTTP.BaseURL != "" {
		scannerBase = config.AppConfig.Scanner.HTTP.BaseURL
	}
	c.BlockscannerAPIClient = clients.NewBlockScannerAPIClient(scannerBase)

	// Blockchain Scanner Client (TODO: Initialize properly)
	scannerClient := clients.NewBlockchainScannerClient(scannerBase)

	// Polling Service
	c.UnifiedPollingService = services.NewUnifiedPollingService(c.DB, c.WebSocketPushService, scannerClient)

	// Start polling service (will process pending polling tasks)
	c.UnifiedPollingService.Start()
	log.Printf("✅ [ServiceContainer] Unified polling service started")

	// Key Management Service (must be created before BlockchainTxService)
	c.KeyManagementService = services.NewKeyManagementService(config.AppConfig, c.DB)

	// Blockchain Transaction Service (must be created before CheckbookService)
	c.BlockchainTxService = services.NewBlockchainTransactionService(c.KeyManagementService)

	// Initialize blockchain clients (required for submitting transactions)
	if err := c.BlockchainTxService.InitializeClients(); err != nil {
		log.Printf("⚠️ [ServiceContainer] Failed to initialize blockchain clients: %v", err)
		log.Printf("   → Blockchain transactions will fail until clients are initialized")
		log.Printf("   → Check blockchain network configuration in config.yaml")
	} else {
		clientCount := c.BlockchainTxService.GetClientCount()
		log.Printf("✅ [ServiceContainer] Blockchain clients initialized: %d client(s)", clientCount)
	}

	// Transaction Queue Service (must be created after BlockchainTxService)
	c.TransactionQueueService = services.NewTransactionQueueService(c.DB, c.BlockchainTxService)

	// Inject queue service into BlockchainTxService
	c.BlockchainTxService.SetQueueService(c.TransactionQueueService)

	// Start queue service (will recover pending transactions)
	c.TransactionQueueService.Start()
	log.Printf("✅ [ServiceContainer] Transaction queue service started")

	// Proof Generation Service (must be created after BlockchainTxService and WebSocketPushService)
	c.ProofGenerationService = services.NewProofGenerationService(
		c.DB,
		c.ZKVMClient,
		c.BlockchainTxService,
		c.WebSocketPushService,
	)

	// Start proof generation service (will recover pending tasks)
	c.ProofGenerationService.Start()
	log.Printf("✅ [ServiceContainer] Proof generation service started")

	// Checkbook Service (now can use BlockchainTxService from container)
	c.CheckbookService = services.NewCheckbookService(
		c.CheckbookRepo,
		c.DB, // TODO: Remove after full DI
		c.UnifiedPollingService,
		c.WebSocketPushService,
		c.ZKVMClient,
		c.BlockchainTxService, // Pass service container instance
	)

	// Queue Root Manager
	c.QueueRootManager = services.NewQueueRootManager(c.DB, c.BlockscannerAPIClient)

	// Intent Service
	c.IntentService = services.NewIntentService()

	// WebSocket Subscription Manager
	c.WebSocketSubscriptionManager = services.NewWebSocketSubscriptionManager()

	// Price Update Service
	c.PriceUpdateService = services.NewPriceUpdateService(c.DB)

	// Withdraw Timeout Service
	withdrawRepo := repository.NewWithdrawRequestRepository(c.DB)
	c.WithdrawTimeoutService = services.NewWithdrawTimeoutService(c.DB, withdrawRepo)
	c.WithdrawTimeoutService.Start()

	// Monitoring Service (requires blockchain clients)
	c.MonitoringService = services.NewMonitoringService(
		c.DB,
		c.KeyManagementService,
		c.BlockchainTxService,
	)

	log.Println("✅ Core Services initialized")
	return nil
}

// initEventServices （NATS, Scanner, etc.）
func (c *ServiceContainer) initEventServices() error {
	// Check if NATS is configured
	if config.AppConfig == nil || config.AppConfig.NATS.URL == "" {
		return fmt.Errorf("NATS not configured")
	}

	if config.AppConfig.Scanner.Type != "nats" {
		return fmt.Errorf("scanner type is not NATS")
	}

	log.Println("📡 Initializing Event Services...")

	// Initialize NATS Client
	if err := c.InitNATSClient(); err != nil {
		return fmt.Errorf("failed to initialize NATS client: %w", err)
	}

	log.Println("✅ Event Services initialized")
	return nil
}

// InitNATSClient  NATS
func (c *ServiceContainer) InitNATSClient() error {
	var initErr error

	c.natsOnce.Do(func() {
		log.Println("🔌 Connecting to NATS...")

		natsURL := config.AppConfig.NATS.URL
		streamName := "zkpay-events"        // TODO: Get from config
		consumerName := "backend-consumer"  // TODO: Get from config
		subjects := make(map[string]string) // TODO: Get from config

		natsClient, err := clients.NewNATSClient(natsURL, streamName, consumerName, subjects)
		if err != nil {
			log.Printf("❌ Failed to connect to NATS at %s: %v", natsURL, err)
			log.Printf("   → Please ensure NATS server is running on port 4222 (or configured port)")
			log.Printf("   → Check: docker ps | grep nats, or: lsof -i :4222")
			initErr = fmt.Errorf("failed to create NATS client: %w", err)
			return
		}

		c.NATSClient = natsClient
		log.Printf("✅ NATS client connected: %s", natsURL)
	})

	return initErr
}

// GetPushService returns the WebSocket push service
func (c *ServiceContainer) GetPushService() *services.WebSocketPushService {
	c.pushServiceOnce.Do(func() {
		c.WebSocketPushService = services.NewWebSocketPushService()
	})
	return c.WebSocketPushService
}

// SetPushService sets the WebSocket push service
func (c *ServiceContainer) SetPushService(svc *services.WebSocketPushService) {
	c.WebSocketPushService = svc
}

// GetDatabaseWithPushService returns the database with push service
func (c *ServiceContainer) GetDatabaseWithPushService() *services.DatabaseWithPushService {
	c.databaseWithPushOnce.Do(func() {
		if c.DatabaseWithPushService == nil {
			pushService := c.GetPushService() // Changed from GetUnifiedPushService()
			c.DatabaseWithPushService = services.NewDatabaseWithPushService(c.DB, pushService)
		}
	})
	return c.DatabaseWithPushService
}

// Cleanup
func (c *ServiceContainer) Cleanup() {
	log.Println("🧹 Cleaning up Service Container...")

	if c.MonitoringService != nil {
		c.MonitoringService.Stop()
	}

	if c.NATSClient != nil {
		c.NATSClient.Close()
	}

	if c.WithdrawTimeoutService != nil {
		c.WithdrawTimeoutService.Stop()
	}

	log.Println("✅ Service Container cleaned up")
}

// ===== Global Service Getters =====

// GetBlockchainTransactionService
func GetBlockchainTransactionService() *services.BlockchainTransactionService {
	if Container == nil {
		return nil
	}
	return Container.BlockchainTxService
}
