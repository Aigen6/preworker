# 预处理功能事件监听方案对比

## 背景

预处理功能需要监听 `DepositVault` 合约的以下事件：
- **Deposit**: 地址A存入借贷池
- **Claim**: 地址B领取凭证代币
- **Recover**: 地址A在时间锁后取回凭证代币

## 方案对比

### 方案一：使用现有 BlockScanner 架构（推荐）✅

#### 架构说明
```
BlockScanner (独立服务)
    ↓ (NATS 消息)
Backend (事件处理)
    ↓ (业务逻辑)
数据库存储 + WebSocket 推送
```

#### 优势
1. **架构统一**: 与现有系统（Treasury、ZKPay）使用相同的架构
2. **完全控制**: 可以自定义事件处理逻辑、重试机制、错误处理
3. **高性能**: Go 实现的 BlockScanner 支持批量扫描、并发处理
4. **多链支持**: 已支持 BSC、TRON、Ethereum 等多条链
5. **可靠性**: 有确认保护机制，避免链重组风险
6. **可扩展**: 可以轻松添加新的事件类型和业务逻辑
7. **数据一致性**: 事件直接存储到数据库，便于查询和分析

#### 劣势
1. **需要维护**: 需要维护 BlockScanner 服务
2. **资源消耗**: 需要运行额外的服务实例
3. **开发成本**: 需要配置监听规则和事件处理逻辑

#### 实现步骤
1. 在 `blockscanner/listener-config.yaml` 中添加 DepositVault 合约监听配置
2. 配置需要监听的事件：
   - `Deposit(address indexed depositor, uint256 indexed depositId, uint256 amount, address indexed intendedRecipient)`
   - `Claim(address indexed depositor, uint256 indexed depositId, address indexed recipient)`
   - `Recover(address indexed depositor, uint256 indexed depositId)`
3. 在 Backend 中添加对应的事件处理逻辑
4. 通过 NATS 接收事件并处理业务逻辑

#### 配置示例
```yaml
# blockscanner/listener-config.yaml
listeners:
  chains:
    bsc:
      chain_id: 714
      evm_chain_id: 56
      enabled: true
      listeners:
        - contract_address: "0x..." # DepositVault 地址
          contract_name: DepositVault
          enabled: true
          events:
            - name: Deposit
              enabled: true
              notify_services:
                - backend
              storage_strategy: structured
            - name: Claim
              enabled: true
              notify_services:
                - backend
              storage_strategy: structured
            - name: Recover
              enabled: true
              notify_services:
                - backend
              storage_strategy: structured
```

---

### 方案二：使用 CatFee 区块链监控服务

#### 架构说明
```
CatFee 监控服务
    ↓ (HTTP Webhook 回调)
Backend (接收回调)
    ↓ (业务逻辑)
数据库存储 + WebSocket 推送
```

#### 优势
1. **无需维护**: 不需要运行额外的扫描服务
2. **快速集成**: 只需配置 Webhook URL 即可
3. **可靠重发**: CatFee 提供可靠的重发机制（10次重试）
4. **多链支持**: 支持 BTC、ETH、TRON
5. **成本较低**: 不需要额外的服务器资源

#### 劣势
1. **功能限制**: 
   - 主要监控交易和余额变化，不是专门的事件监听
   - 需要从交易数据中解析事件，可能不够精确
2. **依赖外部服务**: 依赖 CatFee 服务的可用性
3. **数据格式**: 需要适配 CatFee 的回调格式
4. **实时性**: 可能不如直接监听合约事件实时
5. **扩展性**: 添加新的事件类型需要修改解析逻辑
6. **多链支持**: 主要支持 TRON，EVM 链支持可能有限

#### 实现步骤
1. 在 CatFee.io 配置监控钱包地址（DepositVault 合约地址）
2. 配置回调 URL（Backend 接收端点）
3. 在 Backend 中实现 Webhook 接收接口
4. 从回调数据中解析交易，提取事件信息
5. 处理业务逻辑

#### 回调数据格式（参考 CatFee 文档）
```json
{
  "tx_hash": "0x...",
  "block_number": 12345,
  "monitored_address": "0x...", // DepositVault 地址
  "from_address": "0x...",
  "to_address": "0x...",
  "contract_address": "0x...",
  "amount": "1000000",
  "token": "USDT",
  "chain": "TRON"
}
```

#### 注意事项
- 需要从交易数据中解析合约事件（可能需要调用 RPC 获取交易日志）
- 需要处理重发机制（使用 `chain+tx_hash` 作为主键防重）
- 需要验证回调来源（建议使用签名验证）

---

## 推荐方案：方案一（BlockScanner）

### 推荐理由

1. **架构一致性**: 与现有系统保持一致，降低维护成本
2. **功能完整**: 专门用于监听合约事件，功能更精确
3. **可控性强**: 完全控制事件处理流程，便于调试和优化
4. **扩展性好**: 未来添加新功能更容易
5. **数据准确**: 直接监听合约事件，数据更准确

### 实施建议

1. **复用现有 BlockScanner**: 
   - 在现有的 `blockscanner` 服务中添加 DepositVault 监听配置
   - 不需要创建新的服务

2. **事件处理**:
   - 在 Backend 中添加 DepositVault 事件处理逻辑
   - 参考现有的 `ProcessDepositReceived` 实现

3. **数据库设计**:
   - 创建 `deposit_vault_events` 表存储事件
   - 包含字段：depositor, deposit_id, amount, intended_recipient, event_type, tx_hash 等

4. **API 设计**:
   - 提供查询接口供前端调用
   - 支持 WebSocket 实时推送事件状态

### 如果选择方案二（CatFee）

如果决定使用 CatFee，建议：

1. **仅用于 TRON 链**: CatFee 对 TRON 支持最好
2. **作为补充**: 可以作为 BlockScanner 的补充，用于快速验证
3. **实现防重**: 必须实现防重机制，避免重复处理
4. **事件解析**: 需要实现交易日志解析逻辑

---

## 混合方案（可选）

可以同时使用两种方案：
- **BlockScanner**: 作为主要事件监听源（EVM 链）
- **CatFee**: 作为 TRON 链的补充或备用方案

这样可以：
- 利用 BlockScanner 的精确性（EVM 链）
- 利用 CatFee 的便利性（TRON 链）
- 提供冗余保障

---

## 总结

| 对比项 | BlockScanner | CatFee |
|--------|-------------|--------|
| 维护成本 | 需要维护服务 | 无需维护 |
| 功能完整性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 实时性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 可控性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 扩展性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 多链支持 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 实施难度 | 中等 | 简单 |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**最终推荐**: 使用 **BlockScanner 架构**，与现有系统保持一致，功能更完整，可控性更强。
