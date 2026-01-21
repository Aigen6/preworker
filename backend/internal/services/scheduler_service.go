// Scheduler Service
// Manages periodic tasks like RawToken sync
package services

import (
	"context"
	"log"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/config"

	"gorm.io/gorm"
)

// SchedulerService manages periodic background tasks
type SchedulerService struct {
	db                    *gorm.DB
	rawTokenSyncService   *RawTokenSyncService
	subgraphSyncService   *SubgraphSyncService
	stopChan              chan struct{}
	syncInterval          time.Duration
	subgraphSyncInterval  time.Duration
}

// NewSchedulerService creates a new SchedulerService instance
func NewSchedulerService(db *gorm.DB, syncInterval time.Duration, natsClient interface{}, cfg interface{}) *SchedulerService {
	var subgraphSyncService *SubgraphSyncService
	var subgraphSyncInterval time.Duration = 3 * time.Minute // 默认3分钟

	// 初始化子图同步服务（如果NATS客户端和配置可用）
	if natsClient != nil && cfg != nil {
		if nc, ok := natsClient.(*clients.NATSClient); ok {
			if config, ok := cfg.(*config.Config); ok {
				subgraphSyncService = NewSubgraphSyncService(db, nc, config)
				
				// 从配置读取同步间隔（分钟），默认3分钟
				if config.Subgraph.SyncInterval > 0 {
					subgraphSyncInterval = time.Duration(config.Subgraph.SyncInterval) * time.Minute
				}
			}
		}
	}

	return &SchedulerService{
		db:                    db,
		rawTokenSyncService:   NewRawTokenSyncService(db),
		subgraphSyncService:   subgraphSyncService,
		stopChan:              make(chan struct{}),
		syncInterval:          syncInterval,
		subgraphSyncInterval:  subgraphSyncInterval,
	}
}

// Start begins all scheduled tasks
func (s *SchedulerService) Start() {
	log.Println("🚀 Scheduler service starting...")
	log.Printf("📅 RawToken sync interval: %v", s.syncInterval)

	// Start RawToken sync task
	go s.runRawTokenSync()

	// Start Subgraph sync task (if service is initialized)
	if s.subgraphSyncService != nil {
		log.Printf("📅 Subgraph sync interval: %v", s.subgraphSyncInterval)
		go s.runSubgraphSync()
	} else {
		log.Println("⚠️  Subgraph sync service not initialized, skipping")
	}

	log.Println("✅ Scheduler service started")
}

// Stop gracefully stops all scheduled tasks
func (s *SchedulerService) Stop() {
	log.Println("🛑 Stopping scheduler service...")
	close(s.stopChan)
	log.Println("✅ Scheduler service stopped")
}

// runRawTokenSync periodically syncs RawToken whitelist from all chains
func (s *SchedulerService) runRawTokenSync() {
	// Initial sync on startup
	log.Println("🔄 Running initial RawToken sync...")
	if err := s.rawTokenSyncService.SyncAllChains(context.Background()); err != nil {
		log.Printf("❌ Initial RawToken sync failed: %v", err)
	}

	ticker := time.NewTicker(s.syncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			log.Println("⏰ RawToken sync scheduled task triggered")
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

			if err := s.rawTokenSyncService.SyncAllChains(ctx); err != nil {
				log.Printf("❌ Scheduled RawToken sync failed: %v", err)
			}

			cancel()

		case <-s.stopChan:
			log.Println("🛑 RawToken sync task stopped")
			return
		}
	}
}

// ManualSync triggers a manual sync of RawToken whitelist
func (s *SchedulerService) ManualSync(ctx context.Context) error {
	log.Println("🔧 Manual RawToken sync triggered")
	return s.rawTokenSyncService.SyncAllChains(ctx)
}

// GetRawTokenSyncService returns the underlying RawTokenSyncService
func (s *SchedulerService) GetRawTokenSyncService() *RawTokenSyncService {
	return s.rawTokenSyncService
}

// runSubgraphSync periodically syncs events from subgraph (every 3 minutes)
func (s *SchedulerService) runSubgraphSync() {
	// Initial sync on startup (optional, can be skipped)
	log.Println("🔄 Running initial subgraph sync...")
	if err := s.subgraphSyncService.SyncAllChains(); err != nil {
		log.Printf("❌ Initial subgraph sync failed: %v", err)
	}

	ticker := time.NewTicker(s.subgraphSyncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			log.Println("⏰ Subgraph sync scheduled task triggered")
			if err := s.subgraphSyncService.SyncAllChains(); err != nil {
				log.Printf("❌ Scheduled subgraph sync failed: %v", err)
			}

		case <-s.stopChan:
			log.Println("🛑 Subgraph sync task stopped")
			return
		}
	}
}

