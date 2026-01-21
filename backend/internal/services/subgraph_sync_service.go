package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/config"
	"go-backend/internal/models"
	"go-backend/internal/utils"

	"gorm.io/gorm"
)

// SubgraphSyncService 子图同步服务
type SubgraphSyncService struct {
	db        *gorm.DB
	natsClient *clients.NATSClient
	config    *config.Config
}

// SubgraphConfig 子图配置
type SubgraphConfig struct {
	ChainID     int64  // SLIP-44 Chain ID
	SubgraphURL string // 子图API URL
	APIKey      string // API Key (可选)
}

// 支持的链配置（BSC/ETH/TRON）
var subgraphConfigs = map[int64]SubgraphConfig{
	714: { // BSC
		ChainID:     714,
		SubgraphURL: "", // 需要配置
		APIKey:      "", // 需要配置
	},
	60: { // Ethereum
		ChainID:     60,
		SubgraphURL: "", // 需要配置
		APIKey:      "", // 需要配置
	},
	195: { // TRON
		ChainID:     195,
		SubgraphURL: "", // 需要配置
		APIKey:      "", // 需要配置
	},
}

// NewSubgraphSyncService 创建子图同步服务
func NewSubgraphSyncService(db *gorm.DB, natsClient *clients.NATSClient, cfg *config.Config) *SubgraphSyncService {
	// 从环境变量或配置加载子图URL
	loadSubgraphConfigs(cfg)

	return &SubgraphSyncService{
		db:         db,
		natsClient: natsClient,
		config:     cfg,
	}
}

// loadSubgraphConfigs 从配置加载子图URL
func loadSubgraphConfigs(cfg *config.Config) {
	// 从环境变量加载子图URL
	// BSC
	if bscURL := getEnv("SUBGRAPH_URL_BSC", ""); bscURL != "" {
		config := subgraphConfigs[714]
		config.SubgraphURL = bscURL
		if apiKey := getEnv("SUBGRAPH_API_KEY_BSC", ""); apiKey != "" {
			config.APIKey = apiKey
		}
		subgraphConfigs[714] = config
	}

	// Ethereum
	if ethURL := getEnv("SUBGRAPH_URL_ETH", ""); ethURL != "" {
		config := subgraphConfigs[60]
		config.SubgraphURL = ethURL
		if apiKey := getEnv("SUBGRAPH_API_KEY_ETH", ""); apiKey != "" {
			config.APIKey = apiKey
		}
		subgraphConfigs[60] = config
	}

	// TRON
	if tronURL := getEnv("SUBGRAPH_URL_TRON", ""); tronURL != "" {
		config := subgraphConfigs[195]
		config.SubgraphURL = tronURL
		if apiKey := getEnv("SUBGRAPH_API_KEY_TRON", ""); apiKey != "" {
			config.APIKey = apiKey
		}
		subgraphConfigs[195] = config
	}
}

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// SyncAllChains 同步所有链
func (s *SubgraphSyncService) SyncAllChains() error {
	log.Println("🔄 Starting subgraph sync for all chains...")

	for chainID, subgraphConfig := range subgraphConfigs {
		if subgraphConfig.SubgraphURL == "" {
			log.Printf("⚠️  Subgraph URL not configured for chain %d, skipping", chainID)
			continue
		}

		if err := s.SyncChain(chainID, subgraphConfig); err != nil {
			log.Printf("❌ Failed to sync chain %d: %v", chainID, err)
			// 继续处理其他链，不中断
			continue
		}
	}

	log.Println("✅ Subgraph sync completed for all chains")
	return nil
}

// SyncChain 同步单条链
func (s *SubgraphSyncService) SyncChain(chainID int64, subgraphConfig SubgraphConfig) error {
	log.Printf("🔗 Syncing chain %d from subgraph...", chainID)

	// 1. 获取上次同步位置
	lastSyncedBlock, err := s.getLastSyncedBlock(chainID)
	if err != nil {
		return fmt.Errorf("failed to get last synced block: %w", err)
	}

	// 2. 获取子图当前索引到的区块
	subgraphLatestBlock, err := s.getSubgraphLatestBlock(subgraphConfig.SubgraphURL, subgraphConfig.APIKey)
	if err != nil {
		return fmt.Errorf("failed to get subgraph latest block: %w", err)
	}

	// 3. 如果没有新数据，直接返回
	if subgraphLatestBlock <= lastSyncedBlock {
		log.Printf("ℹ️  No new blocks to sync for chain %d (last: %d, subgraph: %d)", chainID, lastSyncedBlock, subgraphLatestBlock)
		// 即使没有新事件，也更新位置，避免重复查询
		if err := s.updateLastSyncedBlock(chainID, subgraphConfig.SubgraphURL, subgraphLatestBlock); err != nil {
			log.Printf("⚠️  Failed to update last synced block: %v", err)
		}
		return nil
	}

	// 4. 查询子图事件
	events, err := s.querySubgraphEvents(subgraphConfig.SubgraphURL, subgraphConfig.APIKey, lastSyncedBlock, subgraphLatestBlock)
	if err != nil {
		return fmt.Errorf("failed to query subgraph events: %w", err)
	}

	log.Printf("📊 Found %d new events for chain %d", len(events), chainID)

	// 5. 处理事件（对比数据库，存储缺失的，通过NATS发送）
	newEventsCount := 0
	for _, event := range events {
		// 检查数据库中是否已存在
		exists, err := s.eventExists(chainID, event.TransactionHash, event.LogIndex)
		if err != nil {
			log.Printf("⚠️  Failed to check if event exists: %v", err)
			continue
		}

		if exists {
			log.Printf("ℹ️  Event already exists in database: txHash=%s, logIndex=%d", event.TransactionHash, event.LogIndex)
			continue
		}

		// 存储到数据库
		if err := s.saveEventToDatabase(chainID, event); err != nil {
			log.Printf("❌ Failed to save event to database: %v", err)
			continue
		}

		// 通过NATS发送
		if err := s.publishEventToNATS(chainID, event); err != nil {
			log.Printf("⚠️  Failed to publish event to NATS: %v", err)
			// 即使NATS失败，事件已存储到数据库，可以后续恢复
		}

		newEventsCount++
	}

	// 6. 更新同步位置
	if err := s.updateLastSyncedBlock(chainID, subgraphConfig.SubgraphURL, subgraphLatestBlock); err != nil {
		log.Printf("⚠️  Failed to update last synced block: %v", err)
	}

	log.Printf("✅ Synced chain %d: %d new events, synced to block %d", chainID, newEventsCount, subgraphLatestBlock)
	return nil
}

// getLastSyncedBlock 获取上次同步的区块号
func (s *SubgraphSyncService) getLastSyncedBlock(chainID int64) (uint64, error) {
	var syncState models.SubgraphSyncState
	err := s.db.Where("chain_id = ?", chainID).First(&syncState).Error
	if err == gorm.ErrRecordNotFound {
		// 首次同步，返回0
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return syncState.LastSyncedBlock, nil
}

// updateLastSyncedBlock 更新上次同步的区块号
func (s *SubgraphSyncService) updateLastSyncedBlock(chainID int64, subgraphURL string, blockNumber uint64) error {
	syncState := models.SubgraphSyncState{
		ChainID:         chainID,
		SubgraphURL:     subgraphURL,
		LastSyncedBlock: blockNumber,
		UpdatedAt:       time.Now(),
	}

	// 使用 Upsert
	return s.db.Where("chain_id = ?", chainID).
		Assign(models.SubgraphSyncState{
			SubgraphURL:     subgraphURL,
			LastSyncedBlock: blockNumber,
			UpdatedAt:       time.Now(),
		}).
		FirstOrCreate(&syncState).Error
}

// getSubgraphLatestBlock 获取子图当前索引到的区块号
func (s *SubgraphSyncService) getSubgraphLatestBlock(subgraphURL, apiKey string) (uint64, error) {
	query := `{
		_meta {
			block {
				number
			}
		}
	}`

	result, err := s.querySubgraph(subgraphURL, apiKey, query)
	if err != nil {
		return 0, err
	}

	// 解析结果
	meta, ok := result["data"].(map[string]interface{})
	if !ok {
		return 0, fmt.Errorf("invalid subgraph response format")
	}

	block, ok := meta["_meta"].(map[string]interface{})
	if !ok {
		return 0, fmt.Errorf("invalid _meta format")
	}

	blockData, ok := block["block"].(map[string]interface{})
	if !ok {
		return 0, fmt.Errorf("invalid block format")
	}

	number, ok := blockData["number"].(float64)
	if !ok {
		return 0, fmt.Errorf("invalid block number format")
	}

	return uint64(number), nil
}

// SubgraphEvent 子图事件结构
type SubgraphEvent struct {
	ID              string `json:"id"`
	BlockNumber     string `json:"blockNumber"`
	TransactionHash string `json:"txHash"`
	LogIndex        string `json:"logIndex"`
	Timestamp       string `json:"timestamp"`
	Depositor       string `json:"depositor"`
	Token           string `json:"token"`
	Amount          string `json:"amount"`
	LocalDepositId  string `json:"localDepositId"`
	ChainId         string `json:"chainId"`
	PromoteCode     string `json:"promoteCode"`
}

// querySubgraphEvents 查询子图事件
func (s *SubgraphSyncService) querySubgraphEvents(subgraphURL, apiKey string, fromBlock, toBlock uint64) ([]SubgraphEvent, error) {
	query := fmt.Sprintf(`{
		depositReceiveds(
			where: {
				blockNumber_gt: "%d"
				blockNumber_lte: "%d"
			}
			orderBy: blockNumber
			orderDirection: asc
		) {
			id
			blockNumber
			txHash
			logIndex
			timestamp
			depositor
			token
			amount
			localDepositId
			chainId
			promoteCode
		}
	}`, fromBlock, toBlock)

	result, err := s.querySubgraph(subgraphURL, apiKey, query)
	if err != nil {
		return nil, err
	}

	// 解析结果
	data, ok := result["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid response format")
	}

	eventsData, ok := data["depositReceiveds"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid events format")
	}

	events := make([]SubgraphEvent, 0, len(eventsData))
	for _, eventData := range eventsData {
		eventMap, ok := eventData.(map[string]interface{})
		if !ok {
			continue
		}

		event := SubgraphEvent{
			ID:              getString(eventMap, "id"),
			BlockNumber:     getString(eventMap, "blockNumber"),
			TransactionHash: getString(eventMap, "txHash"),
			LogIndex:        getString(eventMap, "logIndex"),
			Timestamp:       getString(eventMap, "timestamp"),
			Depositor:       getString(eventMap, "depositor"),
			Token:           getString(eventMap, "token"),
			Amount:          getString(eventMap, "amount"),
			LocalDepositId:  getString(eventMap, "localDepositId"),
			ChainId:         getString(eventMap, "chainId"),
			PromoteCode:     getString(eventMap, "promoteCode"),
		}
		events = append(events, event)
	}

	return events, nil
}

// querySubgraph 查询子图
func (s *SubgraphSyncService) querySubgraph(subgraphURL, apiKey, query string) (map[string]interface{}, error) {
	// 构建请求
	requestBody := map[string]interface{}{
		"query": query,
	}

	requestData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// 发送HTTP请求
	headers := map[string]string{
		"Content-Type": "application/json",
	}
	if apiKey != "" {
		headers["Authorization"] = fmt.Sprintf("Bearer %s", apiKey)
	}

	// 创建HTTP请求
	req, err := http.NewRequest("POST", subgraphURL, bytes.NewBuffer(requestData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// 设置请求头
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	// 发送请求
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("subgraph query failed with status: %d", resp.StatusCode)
	}

	// 解析响应
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// 检查错误
	if errors, ok := result["errors"].([]interface{}); ok && len(errors) > 0 {
		return nil, fmt.Errorf("subgraph query errors: %v", errors)
	}

	return result, nil
}

// eventExists 检查事件是否已存在
func (s *SubgraphSyncService) eventExists(chainID int64, txHash string, logIndexStr string) (bool, error) {
	logIndex, err := strconv.ParseUint(logIndexStr, 10, 32)
	if err != nil {
		return false, fmt.Errorf("invalid log index: %w", err)
	}

	var count int64
	err = s.db.Model(&models.EventDepositReceived{}).
		Where("chain_id = ? AND transaction_hash = ? AND log_index = ?", chainID, txHash, uint(logIndex)).
		Count(&count).Error

	if err != nil {
		return false, err
	}

	return count > 0, nil
}

// saveEventToDatabase 保存事件到数据库
func (s *SubgraphSyncService) saveEventToDatabase(chainID int64, event SubgraphEvent) error {
	// 解析字段
	blockNumber, _ := strconv.ParseUint(event.BlockNumber, 10, 64)
	logIndex, _ := strconv.ParseUint(event.LogIndex, 10, 32)
	localDepositId, _ := strconv.ParseUint(event.LocalDepositId, 10, 64)
	timestamp, _ := strconv.ParseInt(event.Timestamp, 10, 64)
	blockTimestamp := time.Unix(timestamp, 0)

	// 转换ChainID（子图返回的可能是EVM Chain ID）
	eventChainId, _ := strconv.ParseUint(event.ChainId, 10, 32)
	slip44ChainID := int64(utils.SmartToSlip44(int(eventChainId)))
	if slip44ChainID == 0 {
		slip44ChainID = chainID // 如果转换失败，使用配置的chainID
	}

	eventRecord := models.EventDepositReceived{
		ChainID:         slip44ChainID,
		SLIP44ChainID:   slip44ChainID,
		ContractAddress: "", // 需要从子图获取或配置
		EventName:       "DepositReceived",
		BlockNumber:     blockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        uint(logIndex),
		BlockTimestamp:  blockTimestamp,
		Depositor:       event.Depositor,
		Token:           event.Token,
		Amount:          event.Amount,
		LocalDepositId:  localDepositId,
		EventChainId:    uint32(eventChainId),
		PromoteCode:     event.PromoteCode,
	}

	// 使用 Upsert
	return s.db.Where("chain_id = ? AND transaction_hash = ? AND log_index = ?",
		slip44ChainID, event.TransactionHash, uint(logIndex)).
		FirstOrCreate(&eventRecord).Error
}

// publishEventToNATS 通过NATS发送事件
func (s *SubgraphSyncService) publishEventToNATS(chainID int64, event SubgraphEvent) error {
	if s.natsClient == nil {
		return fmt.Errorf("NATS client not initialized")
	}

	// 解析字段
	blockNumber, _ := strconv.ParseUint(event.BlockNumber, 10, 64)
	logIndex, _ := strconv.ParseUint(event.LogIndex, 10, 32)
	localDepositId, _ := strconv.ParseUint(event.LocalDepositId, 10, 64)
	timestamp, _ := strconv.ParseInt(event.Timestamp, 10, 64)
	blockTimestamp := time.Unix(timestamp, 0)
	eventChainId, _ := strconv.ParseUint(event.ChainId, 10, 32)

	// 转换ChainID（子图返回的可能是EVM Chain ID）
	slip44ChainID := int64(utils.SmartToSlip44(int(eventChainId)))
	if slip44ChainID == 0 {
		slip44ChainID = chainID // 如果转换失败，使用配置的chainID
	}

	// 构建NATS事件响应格式（匹配 EventDepositReceivedResponse）
	eventResponse := &clients.EventDepositReceivedResponse{
		ChainID:         slip44ChainID,
		ContractAddress: "", // 需要从配置获取
		EventName:       "DepositReceived",
		BlockNumber:     blockNumber,
		TransactionHash: event.TransactionHash,
		LogIndex:        uint(logIndex),
		BlockTimestamp:  blockTimestamp,
	}
	// 设置 EventData 字段（匿名结构体）
	eventResponse.EventData.Depositor = event.Depositor
	eventResponse.EventData.Token = event.Token
	eventResponse.EventData.Amount = event.Amount
	eventResponse.EventData.LocalDepositId = localDepositId
	eventResponse.EventData.ChainId = uint32(eventChainId)
	eventResponse.EventData.PromoteCode = event.PromoteCode

	// 使用现有的 PublishDepositEvent 方法
	return s.natsClient.PublishDepositEvent(eventResponse)
}

// getString 安全获取字符串
func getString(m map[string]interface{}, key string) string {
	if val, ok := m[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}


