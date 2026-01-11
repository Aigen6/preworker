# Enclave SDK 集成说明

## 🚀 项目已成功集成 @enclave-hq/sdk

### 📦 已安装的包
- `@enclave-hq/sdk@2.0.2` - Enclave 官方 SDK
- `mobx@6.15.0` - 状态管理
- `mobx-react-lite@4.1.1` - React 集成

## 📚 @enclave-hq/sdk 完整 API 文档

### 🔧 EnclaveClient 主客户端

#### 初始化配置
```typescript
import { EnclaveClient, EnclaveConfig } from '@enclave-hq/sdk'

const config: EnclaveConfig = {
  // 必需配置
  apiUrl: 'https://api.enclave-hq.com',           // 后端 API 基础 URL
  wsUrl: 'wss://api.enclave-hq.com/ws',           // WebSocket URL
  signer: '0x...',                                // 私钥或签名器对象
  
  // 可选配置
  address?: UniversalAddress,                     // 用户通用地址
  autoReconnect?: boolean,                        // 自动重连 (默认: true)
  maxReconnectAttempts?: number,                  // 最大重连次数 (默认: 5)
  reconnectDelay?: number,                        // 重连延迟毫秒 (默认: 1000)
  timeout?: number,                               // 请求超时毫秒 (默认: 30000)
  logLevel?: LogLevel,                            // 日志级别 (默认: INFO)
  logger?: ILogger,                               // 自定义日志器
  storageAdapter?: IStorageAdapter,               // 存储适配器
  wsAdapter?: IWebSocketAdapter,                  // WebSocket 适配器
  cacheAuth?: boolean,                            // 认证缓存 (默认: true)
  authToken?: string,                             // 认证令牌
  headers?: Record<string, string>,               // 额外请求头
  env?: 'development' | 'staging' | 'production'  // 环境模式 (默认: production)
}

const client = new EnclaveClient(config)
```

#### 连接和断开
```typescript
// 连接到 Enclave 服务
await client.connect()

// 断开连接
client.disconnect()

// 检查连接状态
const isConnected = client.isConnected
const connectionInfo = client.connection
const userAddress = client.address
```

#### 创建 Commitment (分配)
```typescript
// 完整流程 - 自动签名并提交
const allocations = await client.createCommitment({
  checkbookId: 'checkbook-id',
  amounts: ['1000000', '2000000'],  // 分配金额数组 (最小单位)
  tokenId: 'token-id'
})

// 分步流程 - 准备签名数据
const signData = client.prepareCommitment({
  checkbookId: 'checkbook-id',
  amounts: ['1000000', '2000000'],
  tokenId: 'token-id'
})
console.log('签名消息:', signData.message)
console.log('消息哈希:', signData.messageHash)

// 提交已签名数据
const allocations = await client.submitCommitment({
  checkbookId: 'checkbook-id',
  amounts: ['1000000', '2000000'],
  tokenId: 'token-id'
}, '0x...签名')
```

#### 创建提现请求
```typescript
// 完整流程 - 自动签名并提交
const withdrawal = await client.withdraw({
  allocationIds: ['allocation-1', 'allocation-2'],
  targetChain: 1,                    // 目标链 ID (1 = Ethereum)
  targetAddress: '0x...',           // 接收地址
  intent: 'withdraw',               // 意图类型
  metadata?: { note: '提现备注' }    // 可选元数据
})

// 分步流程 - 准备签名数据
const signData = client.prepareWithdraw({
  allocationIds: ['allocation-1', 'allocation-2'],
  targetChain: 1,
  targetAddress: '0x...',
  intent: 'withdraw'
})

// 提交已签名数据
const withdrawal = await client.submitWithdraw({
  allocationIds: ['allocation-1', 'allocation-2'],
  targetChain: 1,
  targetAddress: '0x...',
  intent: 'withdraw'
}, '0x...签名')

// 重试失败的提现
const retried = await client.retryWithdraw('withdrawal-id')

// 取消待处理的提现
const cancelled = await client.cancelWithdraw('withdrawal-id')
```

### 🏪 Store 响应式状态管理

#### CheckbooksStore - 支票簿存储
```typescript
const store = client.stores.checkbooks

// 获取所有支票簿
const allCheckbooks = store.all
const count = store.count

// 按状态筛选
const pending = store.pending
const unsigned = store.unsigned
const active = store.active
const completed = store.completed
const byStatus = store.byStatus

// 按条件筛选
const byToken = store.getByTokenId('token-id')
const byOwner = store.getByOwner('0x...')

// 统计数据
const totalDeposited = store.totalDeposited
const totalRemaining = store.totalRemaining
const totalByToken = store.totalByToken

// API 调用
const checkbooks = await store.fetchList({
  owner: '0x...',
  status: 'active',
  tokenId: 'token-id',
  page: 1,
  limit: 20
})

const checkbook = await store.fetchById('checkbook-id')
const byOwner = await store.fetchByOwner('0x...', 'token-id', 'active')

// 更新数据 (通常由 WebSocket 调用)
store.updateCheckbook(checkbook)
store.updateCheckbooks([checkbook1, checkbook2])
store.removeCheckbook('checkbook-id')
```

#### AllocationsStore - 分配存储
```typescript
const store = client.stores.allocations

// 获取所有分配
const all = store.all
const byStatus = store.byStatus

// 按状态筛选
const idle = store.idle        // 可用于提现
const pending = store.pending  // 提现中
const used = store.used        // 已提现

// 按条件筛选
const byCheckbook = store.getByCheckbookId('checkbook-id')
const byCheckbookAndStatus = store.getByCheckbookIdAndStatus('checkbook-id', 'idle')
const byToken = store.getByTokenId('token-id')
const byTokenAndStatus = store.getByTokenIdAndStatus('token-id', 'idle')
const byOwner = store.getByOwner('0x...')
const byWithdrawRequest = store.getByWithdrawRequestId('withdrawal-id')

// 统计数据
const totalAmount = store.getTotalAmount('idle')
const totalByToken = store.getTotalByToken('idle')

// 分组数据
const byCheckbook = store.byCheckbook
const byToken = store.byToken

// API 调用
const allocations = await store.fetchList({
  owner: '0x...',
  checkbookId: 'checkbook-id',
  tokenId: 'token-id',
  status: 'idle',
  page: 1,
  limit: 20
})

const byCheckbook = await store.fetchByCheckbookId('checkbook-id', 'idle')
const byTokenAndStatus = await store.fetchByTokenIdAndStatus('token-id', 'idle')

// 创建分配
const allocations = await store.create({
  checkbookId: 'checkbook-id',
  amounts: ['1000000', '2000000'],
  tokenId: 'token-id',
  signature: '0x...',
  message: 'commitment:...',
  commitments: ['0x...'] // 可选
})

// 更新数据
store.updateAllocation(allocation)
store.updateAllocations([allocation1, allocation2])
store.removeAllocation('allocation-id')
```

#### WithdrawalsStore - 提现请求存储
```typescript
const store = client.stores.withdrawals

// 获取所有提现请求
const all = store.all
const byStatus = store.byStatus

// 按状态筛选
const pending = store.pending
const completed = store.completed
const failed = store.failed

// 按条件筛选
const byToken = store.getByTokenId('token-id')
const byOwner = store.getByOwner('0x...')
const byTargetChain = store.getByTargetChain(1)
const byNullifier = store.getByNullifier('0x...')

// 统计数据
const totalAmount = store.getTotalAmount('completed')
const totalByToken = store.getTotalByToken('completed')
const countByStatus = store.countByStatus

// 分组数据
const byTargetChain = store.byTargetChain
const byToken = store.byToken

// API 调用
const withdrawals = await store.fetchList({
  owner: '0x...',
  status: 'pending',
  tokenId: 'token-id',
  targetChain: 1,
  page: 1,
  limit: 20
})

const withdrawal = await store.fetchById('withdrawal-id')
const byNullifier = await store.fetchByNullifier('0x...')

// 创建提现请求
const withdrawal = await store.create({
  allocationIds: ['allocation-1', 'allocation-2'],
  targetChain: 1,
  targetAddress: '0x...',
  intent: 'withdraw',
  signature: '0x...',
  message: 'withdraw:...',
  nullifier: '0x...',
  proof: '0x...', // 可选
  metadata: { note: '提现备注' } // 可选
})

// 重试和取消
const retried = await store.retry('withdrawal-id')
const cancelled = await store.cancel('withdrawal-id')

// 获取统计
const stats = await store.fetchStats('0x...', 'token-id')

// 更新数据
store.updateWithdrawal(withdrawal)
store.updateWithdrawals([withdrawal1, withdrawal2])
store.removeWithdrawal('withdrawal-id')
```

#### PricesStore - 价格存储
```typescript
const store = client.stores.prices

// 获取价格数据
const all = store.all
const symbols = store.symbols
const priceMap = store.priceMap

// 按符号获取价格
const price = store.getBySymbol('USDT')
const prices = store.getBySymbols(['USDT', 'USDC'])

// 价格计算
const priceUSD = store.getPriceUSD('USDT')
const amountUSD = store.toUSD('USDT', '1000000', 6) // 符号, 金额, 小数位
const change24h = store.getChange24h('USDT')

// 涨跌榜
const gainers = store.gainers  // 24h 涨幅为正
const losers = store.losers    // 24h 涨幅为负

// API 调用
const prices = await store.fetchPrices(['USDT', 'USDC'])
const price = await store.fetchPrice('USDT')

// 自动刷新
store.startAutoRefresh(30000) // 30秒刷新一次
store.stopAutoRefresh()

// 更新数据
store.updatePrice(price)
store.updatePrices([price1, price2])

// 清理
store.destroy()
```

#### PoolsStore - 池子和代币存储
```typescript
const store = client.stores.pools

// 获取池子数据
const all = store.all
const activePools = store.activePools
const totalTVL = store.totalTVL
const poolsByToken = store.poolsByToken

// 获取代币数据
const allTokens = store.allTokens
const activeTokens = store.activeTokens
const tokensByChain = store.tokensByChain

// 按条件筛选
const token = store.getToken('token-id')
const tokenBySymbol = store.getTokenBySymbol('USDT')
const tokensByChain = store.getTokensByChain(1)
const poolByToken = store.getPoolByTokenId('token-id')

// API 调用
const pools = await store.fetchPools(true) // 只获取活跃池子
const pool = await store.fetchPoolById('pool-id')
const tokens = await store.fetchTokens(true, 1) // 活跃代币, 链ID
const token = await store.fetchTokenById('token-id')
const activeTokens = await store.fetchActiveTokens(1)

// 更新数据
store.updatePool(pool)
store.updatePools([pool1, pool2])
store.setToken('token-id', token)
store.updateTokens([token1, token2])

// 清理
store.clearTokens()
store.clear()
```

### 🔌 API 客户端

#### CheckbooksAPI - 支票簿 API
```typescript
const api = new CheckbooksAPI(apiClient)

// 列出支票簿
const response = await api.listCheckbooks({
  owner: '0x...',
  status: 'active',
  tokenId: 'token-id',
  page: 1,
  limit: 20
})

// 获取单个支票簿
const checkbook = await api.getCheckbookById({ id: 'checkbook-id' })

// 按所有者获取
const checkbooks = await api.getCheckbooksByOwner('0x...', 'token-id', 'active')

// 删除支票簿
const result = await api.deleteCheckbook('checkbook-id')
```

#### AllocationsAPI - 分配 API
```typescript
const api = new AllocationsAPI(apiClient)

// 列出分配
const response = await api.listAllocations({
  owner: '0x...',
  checkbookId: 'checkbook-id',
  tokenId: 'token-id',
  status: 'idle',
  page: 1,
  limit: 20
})

// 创建分配 (Commitment)
const response = await api.createAllocations({
  checkbookId: 'checkbook-id',
  amounts: ['1000000', '2000000'],
  tokenId: 'token-id',
  signature: '0x...',
  message: 'commitment:...',
  commitments: ['0x...'] // 可选
})

// 按支票簿获取
const allocations = await api.getAllocationsByCheckbookId('checkbook-id', 'idle')

// 按代币和状态获取
const allocations = await api.getAllocationsByTokenIdAndStatus('token-id', 'idle')
```

#### WithdrawalsAPI - 提现 API
```typescript
const api = new WithdrawalsAPI(apiClient)

// 列出提现请求
const response = await api.listWithdrawRequests({
  owner: '0x...',
  status: 'pending',
  tokenId: 'token-id',
  targetChain: 1,
  page: 1,
  limit: 20
})

// 获取单个提现请求
const withdrawal = await api.getWithdrawRequestById({ id: 'withdrawal-id' })
const withdrawal = await api.getWithdrawRequestByNullifier({ nullifier: '0x...' })

// 创建提现请求
const withdrawal = await api.createWithdrawRequest({
  allocationIds: ['allocation-1', 'allocation-2'],
  targetChain: 1,
  targetAddress: '0x...',
  intent: 'withdraw',
  signature: '0x...',
  message: 'withdraw:...',
  nullifier: '0x...',
  proof: '0x...', // 可选
  metadata: { note: '提现备注' } // 可选
})

// 重试和取消
const retried = await api.retryWithdrawRequest({ id: 'withdrawal-id' })
const cancelled = await api.cancelWithdrawRequest({ id: 'withdrawal-id' })

// 获取统计
const stats = await api.getWithdrawStats({
  owner: '0x...',
  tokenId: 'token-id'
})
```

#### PricesAPI - 价格 API
```typescript
const api = new PricesAPI(apiClient)

// 获取代币价格
const prices = await api.getTokenPrices({ symbols: ['USDT', 'USDC'] })
const price = await api.getTokenPrice('USDT')
const allPrices = await api.getAllPrices()
```

#### PoolsAPI - 池子和代币 API
```typescript
const api = new PoolsAPI(apiClient)

// 池子相关
const pools = await api.listPools({ isActive: true })
const pool = await api.getPoolById({ id: 'pool-id' })

// 代币相关
const tokens = await api.listTokens({ isActive: true, chainId: 1 })
const token = await api.getTokenById({ id: 'token-id' })
const activeTokens = await api.getActiveTokens(1)
```

### 📊 数据类型定义

#### Checkbook - 支票簿
```typescript
interface Checkbook {
  id: string                    // 支票簿 ID
  owner: UniversalAddress      // 所有者地址
  token: Token                 // 关联代币
  depositAmount: string        // 存款金额 (最小单位)
  remainingAmount: string      // 剩余金额
  depositTxHash: string        // 存款交易哈希
  depositBlockNumber: number   // 存款区块号
  status: CheckbookStatus      // 状态
  signature?: string           // 后端签名 (可选)
  createdAt: number           // 创建时间戳
  updatedAt: number           // 更新时间戳
  allocationCount?: number    // 分配数量
  allocationIds?: string[]    // 分配 ID 数组
}

enum CheckbookStatus {
  Pending = "pending",           // 等待后端签名
  Unsigned = "unsigned",         // 缺少后端签名
  WithCheckbook = "with_checkbook", // 已签名，可创建分配
  AllocationsDone = "allocations_done", // 分配完成
  Completed = "completed",       // 生命周期完成
  Failed = "failed"             // 失败
}
```

#### Allocation - 分配
```typescript
interface Allocation {
  id: string                    // 分配 ID
  checkbookId: string          // 关联支票簿 ID
  owner: UniversalAddress      // 所有者地址
  token: Token                 // 关联代币
  amount: string               // 分配金额 (最小单位)
  status: AllocationStatus     // 状态
  withdrawRequestId?: string   // 关联提现请求 ID
  commitment?: string          // 承诺哈希
  nullifier?: string           // 空值器
  createdAt: number           // 创建时间戳
  updatedAt: number           // 更新时间戳
}

enum AllocationStatus {
  Idle = "idle",               // 可用，可包含在新提现请求中
  Pending = "pending",         // 属于活跃提现请求
  Used = "used"                // 已成功提现
}
```

#### WithdrawRequest - 提现请求
```typescript
interface WithdrawRequest {
  id: string                    // 提现请求 ID
  owner: UniversalAddress      // 所有者地址
  targetChain: number          // 目标链 ID
  targetAddress: string        // 目标接收地址
  token: Token                 // 关联代币
  amount: string               // 总提现金额
  status: WithdrawRequestStatus // 状态
  intent: string               // 意图类型
  allocationIds: string[]      // 包含的分配 ID 数组
  root?: string                // Merkle 树根哈希
  nullifier?: string           // 空值器哈希
  proof?: string               // ZK 证明
  txHash?: string              // 链上交易哈希
  blockNumber?: number         // 区块号
  conversionStatus?: string    // 跨链转换状态
  errorMessage?: string        // 错误消息
  createdAt: number           // 创建时间戳
  updatedAt: number           // 更新时间戳
  completedAt?: number        // 完成时间戳
}

enum WithdrawRequestStatus {
  Pending = "pending",         // 链上提现请求待处理
  Completed = "completed",     // 阶段1完成
  Failed = "failed"            // 提现请求失败
}
```

#### Token - 代币
```typescript
interface Token {
  id: string                    // 代币 ID
  symbol: string               // 代币符号
  name: string                 // 代币全名
  decimals: number             // 小数位数
  contractAddress: string      // 合约地址
  chainId: number              // 链 ID
  iconUrl?: string             // 图标 URL
  isActive: boolean            // 是否活跃
}
```

#### TokenPrice - 代币价格
```typescript
interface TokenPrice {
  symbol: string               // 代币符号
  price: number                // USD 价格
  change24h?: number           // 24h 价格变化百分比
  timestamp: number            // 最后更新时间戳
}
```

#### Pool - 池子
```typescript
interface Pool {
  id: string                    // 池子 ID
  name: string                 // 池子名称
  token: Token                 // 关联代币
  tvl: string                  // 总锁定价值
  utilizationRate: number      // 利用率 (0-1)
  apy?: number                 // 年化收益率
  isActive: boolean            // 是否活跃
}
```

#### UniversalAddress - 通用地址
```typescript
interface UniversalAddress {
  chainId: number              // 链 ID
  chainName: string            // 链名称
  address: string              // 链特定格式地址
  universalFormat: string      // 统一格式地址
}
```

### 🔧 工具函数

#### 地址工具
```typescript
import { 
  toChecksumAddress,
  addressEquals,
  formatAddressShort,
  createUniversalAddress,
  formatUniversalAddress,
  universalAddressEquals
} from '@enclave-hq/sdk'

// 地址格式化
const checksum = toChecksumAddress('0x...')
const isEqual = addressEquals('0x...', '0x...')
const short = formatAddressShort('0x...', 6, 4) // 0x1234...5678

// 通用地址
const universal = createUniversalAddress('0x...', 1)
const formatted = formatUniversalAddress(universal)
const isEqual = universalAddressEquals(addr1, addr2)
```

#### 金额工具
```typescript
import {
  formatAmount,
  parseAmount,
  addAmounts,
  subtractAmounts,
  multiplyAmount,
  divideAmount,
  compareAmounts,
  isZeroAmount,
  formatAmountWithSeparators
} from '@enclave-hq/sdk'

// 金额格式化
const formatted = formatAmount('1000000000000000000', 18) // "1.0"
const parsed = parseAmount('1.5', 18) // "1500000000000000000"

// 金额计算
const sum = addAmounts('1000', '2000') // "3000"
const diff = subtractAmounts('3000', '1000') // "2000"
const product = multiplyAmount('1000', 2) // "2000"
const quotient = divideAmount('2000', 2) // "1000"

// 金额比较
const comparison = compareAmounts('1000', '2000') // -1, 0, 1
const isZero = isZeroAmount('0') // true

// 格式化带分隔符
const withSeparators = formatAmountWithSeparators('1234567.89', 2) // "1,234,567.89"
```

#### 加密工具
```typescript
import {
  keccak256,
  ensureHexPrefix,
  removeHexPrefix,
  isValidHex,
  isValidAddress
} from '@enclave-hq/sdk'

// 哈希计算
const hash = keccak256('message') // "0x..."

// 十六进制处理
const withPrefix = ensureHexPrefix('abc') // "0xabc"
const withoutPrefix = removeHexPrefix('0xabc') // "abc"
const isValid = isValidHex('0xabc', 1) // true
const isValidAddr = isValidAddress('0x...') // true
```

### 📡 事件系统

#### 事件监听
```typescript
import { EventName } from '@enclave-hq/sdk'

// 连接状态变化
client.on(EventName.CONNECTION_STATE_CHANGED, (event) => {
  console.log('连接状态:', event.newState)
})

// 认证成功
client.on(EventName.AUTHENTICATED, (event) => {
  console.log('用户地址:', event.address)
  console.log('认证令牌:', event.token)
})

// 支票簿更新
client.on(EventName.CHECKBOOKS_UPDATED, (event) => {
  console.log('支票簿更新:', event.checkbooks)
})

// 分配更新
client.on(EventName.ALLOCATIONS_UPDATED, (event) => {
  console.log('分配更新:', event.allocations)
})

// 提现更新
client.on(EventName.WITHDRAWALS_UPDATED, (event) => {
  console.log('提现更新:', event.withdrawals)
})

// 价格更新
client.on(EventName.PRICES_UPDATED, (event) => {
  console.log('价格更新:', event.prices)
})

// WebSocket 消息
client.on(EventName.WS_MESSAGE, (event) => {
  console.log('WebSocket 消息:', event.type, event.data)
})

// 错误处理
client.on(EventName.CONNECTION_ERROR, (event) => {
  console.error('连接错误:', event.error)
})

client.on(EventName.STORE_ERROR, (event) => {
  console.error('存储错误:', event.store, event.error)
})
```

### ⚠️ 错误处理

#### 错误类型
```typescript
import {
  EnclaveError,
  ConfigError,
  AuthError,
  NetworkError,
  APIError,
  WebSocketError,
  ValidationError,
  SignerError,
  StoreError,
  TransactionError,
  TimeoutError,
  NotFoundError,
  InsufficientBalanceError,
  InvalidStateError,
  isEnclaveError,
  formatError
} from '@enclave-hq/sdk'

try {
  await client.connect()
} catch (error) {
  if (isEnclaveError(error)) {
    console.error('SDK 错误:', error.code, error.message)
    
    if (error instanceof ConfigError) {
      console.error('配置错误:', error.details)
    } else if (error instanceof AuthError) {
      console.error('认证错误:', error.details)
    } else if (error instanceof NetworkError) {
      console.error('网络错误:', error.statusCode)
    } else if (error instanceof APIError) {
      console.error('API 错误:', error.statusCode, error.endpoint)
    }
  } else {
    console.error('未知错误:', formatError(error))
  }
}
```

### 🔄 完整使用示例

```typescript
import { EnclaveClient, LogLevel } from '@enclave-hq/sdk'

async function main() {
  // 1. 创建客户端
  const client = new EnclaveClient({
    apiUrl: 'https://api.enclave-hq.com',
    wsUrl: 'wss://api.enclave-hq.com/ws',
    signer: '0x...', // 私钥
    logLevel: LogLevel.INFO
  })

  // 2. 连接
  await client.connect()
  console.log('已连接:', client.isConnected)
  console.log('用户地址:', client.address)

  // 3. 监听事件
  client.on(EventName.PRICES_UPDATED, (event) => {
    console.log('价格更新:', event.prices)
  })

  // 4. 获取数据
  const checkbooks = client.stores.checkbooks.all
  const allocations = client.stores.allocations.idle
  const prices = client.stores.prices.all

  // 5. 创建 Commitment
  const allocations = await client.createCommitment({
    checkbookId: 'checkbook-id',
    amounts: ['1000000', '2000000'],
    tokenId: 'token-id'
  })

  // 6. 创建提现
  const withdrawal = await client.withdraw({
    allocationIds: ['allocation-1', 'allocation-2'],
    targetChain: 1,
    targetAddress: '0x...',
    intent: 'withdraw'
  })

  // 7. 断开连接
  client.disconnect()
}

main().catch(console.error)
```

### 🎯 当前功能状态
- ✅ 项目结构完整
- ✅ MobX 状态管理
- ✅ 完整 SDK API 集成
- ✅ 响应式 UI 组件
- ✅ 主题系统
- ✅ 国际化支持

### 🔄 下一步
1. 配置真实的 Enclave API 密钥
2. 启用真实 SDK 连接
3. 测试完整数据流
4. 优化错误处理和用户体验

### 📞 支持
如有问题，请参考：
- [Enclave SDK 官方文档](https://github.com/enclave-hq/sdk)
- [MobX 文档](https://mobx.js.org)
- [Next.js 文档](https://nextjs.org/docs)