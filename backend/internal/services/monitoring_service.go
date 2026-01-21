package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"go-backend/internal/clients"
	"go-backend/internal/config"
	"go-backend/internal/metrics"
	"go-backend/internal/utils"
	"io"
	"log"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"gorm.io/gorm"
)

// MonitoringService 监控服务，负责定期更新 Prometheus metrics
type MonitoringService struct {
	db                  *gorm.DB
	keyMgmtService      *KeyManagementService
	blockchainTxService *BlockchainTransactionService
	stopCh              chan struct{}
	wg                  sync.WaitGroup
	balanceCheckInterval time.Duration
}

// NewMonitoringService 创建监控服务
func NewMonitoringService(
	db *gorm.DB,
	keyMgmtService *KeyManagementService,
	blockchainTxService *BlockchainTransactionService,
) *MonitoringService {
	return &MonitoringService{
		db:                  db,
		keyMgmtService:      keyMgmtService,
		blockchainTxService: blockchainTxService,
		stopCh:              make(chan struct{}),
		balanceCheckInterval: 60 * time.Second, // 默认60秒检查一次
	}
}

// Start 启动监控服务
func (m *MonitoringService) Start() {
	log.Println("🚀 Starting monitoring service...")

	// 启动数据库连接监控
	m.wg.Add(1)
	go m.monitorDatabaseConnection()

	// 启动余额监控
	m.wg.Add(1)
	go m.monitorBalances()

	log.Println("✅ Monitoring service started")
}

// Stop 停止监控服务
func (m *MonitoringService) Stop() {
	log.Println("🛑 Stopping monitoring service...")
	close(m.stopCh)
	m.wg.Wait()
	log.Println("✅ Monitoring service stopped")
}

// monitorDatabaseConnection 监控数据库连接
func (m *MonitoringService) monitorDatabaseConnection() {
	defer m.wg.Done()

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.updateDatabaseMetrics()
		}
	}
}

// updateDatabaseMetrics 更新数据库指标
func (m *MonitoringService) updateDatabaseMetrics() {
	sqlDB, err := m.db.DB()
	if err != nil {
		metrics.DBConnectionStatus.Set(0)
		return
	}

	stats := sqlDB.Stats()
	metrics.DBConnectionPoolSize.Set(float64(stats.MaxOpenConnections))
	metrics.DBConnectionActive.Set(float64(stats.OpenConnections - stats.Idle))
	metrics.DBConnectionIdle.Set(float64(stats.Idle))

	// 检查连接状态
	if err := sqlDB.Ping(); err != nil {
		metrics.DBConnectionStatus.Set(0)
	} else {
		metrics.DBConnectionStatus.Set(1)
	}
}

// monitorBalances 监控余额
func (m *MonitoringService) monitorBalances() {
	defer m.wg.Done()

	ticker := time.NewTicker(m.balanceCheckInterval)
	defer ticker.Stop()

	// 立即执行一次
	m.updateBalances()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.updateBalances()
		}
	}
}

// updateBalances 更新余额指标
func (m *MonitoringService) updateBalances() {
	if config.AppConfig == nil || config.AppConfig.Blockchain.Networks == nil {
		return
	}

	if m.blockchainTxService == nil {
		return
	}

	for networkName, networkConfig := range config.AppConfig.Blockchain.Networks {
		if !networkConfig.Enabled {
			continue
		}

		// 获取地址
		address, err := m.keyMgmtService.GetSigningAddress(&networkConfig)
		if err != nil {
			log.Printf("⚠️ Failed to get signing address for %s: %v", networkName, err)
			continue
		}

		chainID := uint32(networkConfig.ChainID)
		
		// TRON 链特殊处理
		if clients.IsTronChain(chainID) {
			balanceValue, err := m.getTronBalance(address, &networkConfig)
			if err != nil {
				log.Printf("⚠️ Failed to get balance for tron address %s: %v", address, err)
				continue
			}
			// 更新指标
			metrics.PrivateKeyBalance.WithLabelValues(networkName, address).Set(balanceValue)
			continue
		}

		// EVM 链处理
		var balance *big.Int
		var success bool

		// 1. 优先尝试使用服务中已缓存的 Client
		client, exists := m.blockchainTxService.GetClient(int(chainID))
		if exists && client != nil {
			// 增加超时控制 (10秒)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			var err error
			balance, err = client.BalanceAt(ctx, common.HexToAddress(address), nil)
			cancel()
			
			if err == nil {
				success = true
			} else {
				log.Printf("⚠️ [Monitor] Primary client for %s failed (err: %v), attempting failover...", networkName, err)
			}
		}

		// 2. 故障转移：如果主 Client 失败，遍历所有 RPC 端点尝试
		if !success {
			if len(networkConfig.RPCEndpoints) == 0 {
				log.Printf("❌ [Monitor] No RPC endpoints configured for %s", networkName)
				continue
			}

			for _, endpoint := range networkConfig.RPCEndpoints {
				// 创建临时连接
				tempClient, err := ethclient.Dial(endpoint)
				if err != nil {
					continue
				}

				// 尝试查询 (5秒超时)
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				bal, err := tempClient.BalanceAt(ctx, common.HexToAddress(address), nil)
				cancel()
				tempClient.Close() // 立即释放资源

				if err == nil {
					balance = bal
					success = true
					log.Printf("✅ [Monitor] Failover success: retrieved balance for %s from %s", networkName, endpoint)
					break
				}
			}
		}

		if !success {
			log.Printf("❌ [Monitor] Failed to get balance for %s address %s: all RPC endpoints failed", networkName, address)
			continue
		}

		// 转换为 ETH/BNB (wei to ether)
		balanceFloat := new(big.Float).Quo(new(big.Float).SetInt(balance), big.NewFloat(1e18))
		balanceValue, _ := balanceFloat.Float64()

		// 更新指标
		metrics.PrivateKeyBalance.WithLabelValues(networkName, address).Set(balanceValue)
	}
}

// getTronBalance 获取 TRON 地址余额
func (m *MonitoringService) getTronBalance(address string, networkConfig *config.NetworkConfig) (float64, error) {
	// 将 EVM 地址转换为 TRON Base58 地址（只有 TRON 链才需要转换）
	var tronAddress string
	if utils.IsTronAddress(address) {
		// 如果已经是 TRON Base58 地址，直接使用
		tronAddress = address
		log.Printf("✅ Using TRON Base58 address: %s", tronAddress)
	} else {
		// EVM 地址（0x...）需要转换为 TRON Base58 地址
		var err error
		tronAddress, err = utils.EvmToTronAddress(address)
		if err != nil {
			return 0, fmt.Errorf("failed to convert EVM address %s to TRON: %w", address, err)
		}
		log.Printf("✅ Converted EVM address %s to TRON Base58: %s", address, tronAddress)
	}

	// 获取 TRON RPC 端点
	rpcEndpoint := "https://api.trongrid.io"
	if len(networkConfig.RPCEndpoints) > 0 {
		rpcEndpoint = networkConfig.RPCEndpoints[0]
	}

	// TRON API: POST /wallet/getaccount
	url := strings.TrimSuffix(rpcEndpoint, "/") + "/wallet/getaccount"
	
	// 构建请求体（使用转换后的 TRON Base58 地址）
	reqBody := map[string]string{
		"address": tronAddress,
		"visible": "true",
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal request: %w", err)
	}

	log.Printf("🔍 Querying TRON balance for address %s (Base58: %s) via %s", address, tronAddress, url)

	// 发送 HTTP POST 请求
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return 0, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("TRON API error: %d %s: %s (requested address: %s, converted to: %s)", resp.StatusCode, resp.Status, string(body), address, tronAddress)
	}

	// 解析响应
	var accountInfo struct {
		Balance int64 `json:"balance"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&accountInfo); err != nil {
		return 0, fmt.Errorf("failed to decode response: %w", err)
	}

	// TRON 余额单位是 sun (1 TRX = 1e6 sun)
	balanceFloat := float64(accountInfo.Balance) / 1e6
	log.Printf("✅ TRON balance for %s: %.6f TRX", tronAddress, balanceFloat)
	return balanceFloat, nil
}

// UpdateNATSConnectionStatus 更新 NATS 连接状态（由 NATS 客户端调用）
func UpdateNATSConnectionStatus(connected bool) {
	if connected {
		metrics.NATSConnectionStatus.Set(1)
	} else {
		metrics.NATSConnectionStatus.Set(0)
	}
}

// RecordNATSMessageReceived 记录 NATS 消息接收（由事件处理器调用）
func RecordNATSMessageReceived(eventType string) {
	metrics.NATSMessagesReceived.WithLabelValues(eventType).Inc()
}

// RecordNATSMessageProcessed 记录 NATS 消息处理成功（由事件处理器调用）
func RecordNATSMessageProcessed(eventType string) {
	metrics.NATSMessagesProcessed.WithLabelValues(eventType).Inc()
}

// RecordNATSMessageFailed 记录 NATS 消息处理失败（由事件处理器调用）
func RecordNATSMessageFailed(eventType string, errorType string) {
	metrics.NATSMessagesFailed.WithLabelValues(eventType, errorType).Inc()
}

// RecordEventListenerError 记录事件监听错误（由事件处理器调用）
func RecordEventListenerError(eventType string, errorType string) {
	metrics.EventListenerErrors.WithLabelValues(eventType, errorType).Inc()
}

// RecordEventProcessingDuration 记录事件处理耗时（由事件处理器调用）
func RecordEventProcessingDuration(eventType string, duration time.Duration) {
	metrics.EventProcessingDuration.WithLabelValues(eventType).Observe(duration.Seconds())
}

