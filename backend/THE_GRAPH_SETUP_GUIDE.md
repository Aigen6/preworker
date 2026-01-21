# The Graph 子图配置完整指南

## 概述

本指南将帮助你为 ZKPay 的 Treasury 合约创建和配置 The Graph 子图，用于索引 `DepositReceived` 事件。

## 一、准备工作

### 1. 安装 The Graph CLI

```bash
npm install -g @graphprotocol/graph-cli
```

### 2. 创建子图项目

为每条链创建独立的子图项目：

```bash
# 创建 BSC 子图
graph init --studio treasury-bsc

# 创建 Ethereum 子图
graph init --studio treasury-eth

# 创建 TRON 子图（如果支持）
graph init --studio treasury-tron
```

或者手动创建项目结构：

```bash
mkdir treasury-subgraph
cd treasury-subgraph
npm init -y
npm install @graphprotocol/graph-cli @graphprotocol/graph-ts
```

## 二、创建子图文件

### 1. 项目结构

```
treasury-subgraph/
├── package.json
├── subgraph.yaml          # 子图配置
├── schema.graphql         # 数据模型
├── abis/
│   └── Treasury.json      # 合约 ABI
└── src/
    └── mapping.ts         # 事件处理逻辑
```

### 2. package.json

```json
{
  "name": "treasury-subgraph",
  "version": "1.0.0",
  "scripts": {
    "codegen": "graph codegen",
    "build": "graph build",
    "deploy": "graph deploy --studio treasury-treasury"
  },
  "dependencies": {
    "@graphprotocol/graph-cli": "^0.66.0",
    "@graphprotocol/graph-ts": "^0.32.0"
  }
}
```

### 3. schema.graphql

定义数据模型：

```graphql
type DepositReceived @entity {
  id: ID!                    # txHash-logIndex
  blockNumber: BigInt!       # 区块号
  blockTimestamp: BigInt!     # 区块时间戳
  txHash: Bytes!             # 交易哈希
  logIndex: BigInt!           # 日志索引
  
  depositor: Bytes!           # address indexed depositor
  token: Bytes!               # address indexed token
  amount: BigInt!             # uint256 amount (已转换为18位小数)
  localDepositId: BigInt!    # uint64 indexed localDepositId
  chainId: BigInt!            # uint32 chainId
  promoteCode: Bytes!         # bytes6 promoteCode
}
```

**注意**：`amount` 字段存储的是**已转换为18位小数的金额**，不是链上的原始值。

### 4. subgraph.yaml

子图配置文件（以 BSC 为例）：

```yaml
specVersion: 0.0.5
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum
    name: Treasury
    network: bsc  # 或 mainnet (Ethereum), tron (TRON)
    source:
      address: "0x..."  # Treasury 合约地址
      abi: Treasury
      startBlock: 12345678  # 合约部署的区块号
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - DepositReceived
      abis:
        - name: Treasury
          file: ./abis/Treasury.json
      eventHandlers:
        - event: DepositReceived(indexed address,indexed address,uint256,indexed uint64,uint32)
          handler: handleDepositReceived
          
  # 注意：如果合约中还有 promoteCode 参数，需要包含：
  # - event: DepositReceived(indexed address,indexed address,uint256,indexed uint64,uint32,bytes6)
      file: ./src/mapping.ts
```

**不同链的配置：**

- **BSC**: `network: bsc`
- **Ethereum**: `network: mainnet`
- **TRON**: `network: tron`（如果 The Graph 支持）

### 5. src/mapping.ts

事件处理逻辑（包含 decimal 转换）：

```typescript
import { DepositReceived as DepositReceivedEvent } from "../generated/Treasury/Treasury";
import { DepositReceived } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

// USDT 在不同链上的小数位数
const USDT_DECIMALS_BSC = 18;
const USDT_DECIMALS_ETH = 6;
const USDT_DECIMALS_TRON = 6;
const MANAGEMENT_DECIMALS = 18; // 系统统一使用18位小数

// USDT 合约地址（需要根据实际部署地址配置）
const USDT_ADDRESS_BSC = "0x55d398326f99059fF775485246999027B3197955";
const USDT_ADDRESS_ETH = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_ADDRESS_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export function handleDepositReceived(event: DepositReceivedEvent): void {
  // 创建实体 ID（使用 txHash + logIndex 确保唯一性）
  let entity = new DepositReceived(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  // 设置字段
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.logIndex = event.logIndex;

  // 事件参数
  entity.depositor = event.params.depositor;
  entity.token = event.params.token;
  entity.localDepositId = event.params.localDepositId;
  entity.chainId = event.params.chainId;
  entity.promoteCode = event.params.promoteCode;

  // ⚠️ 金额处理说明：
  // 方案1：在子图中转换（6位->18位）
  // 方案2：存储原始值，后端转换（推荐）
  
  // 方案1：在子图中转换（如果采用此方案，取消下面的注释）
  // let originalAmount = event.params.amount;
  // let convertedAmount = convertToManagementAmount(
  //   originalAmount,
  //   event.params.token,
  //   event.params.chainId
  // );
  // entity.amount = convertedAmount;
  
  // 方案2：存储原始值（推荐，后端会转换）
  entity.amount = event.params.amount; // 存储链上原始值

  // 保存实体
  entity.save();
}

/**
 * 将链上金额转换为管理合约金额（统一18位小数）
 * @param amount 原始金额（链上格式）
 * @param tokenAddress Token 地址
 * @param chainId 链ID
 * @returns 转换后的金额（18位小数）
 */
function convertToManagementAmount(
  amount: BigInt,
  tokenAddress: Address,
  chainId: BigInt
): BigInt {
  // 判断是否为 USDT
  let isUSDT = false;
  let sourceDecimals = 18; // 默认18位

  // 根据链ID和Token地址判断小数位数
  if (chainId.equals(BigInt.fromI32(60))) {
    // Ethereum
    if (tokenAddress.toHexString().toLowerCase() == USDT_ADDRESS_ETH.toLowerCase()) {
      isUSDT = true;
      sourceDecimals = USDT_DECIMALS_ETH; // 6位
    }
  } else if (chainId.equals(BigInt.fromI32(195))) {
    // TRON
    if (tokenAddress.toHexString().toLowerCase() == USDT_ADDRESS_TRON.toLowerCase()) {
      isUSDT = true;
      sourceDecimals = USDT_DECIMALS_TRON; // 6位
    }
  } else if (chainId.equals(BigInt.fromI32(714))) {
    // BSC
    if (tokenAddress.toHexString().toLowerCase() == USDT_ADDRESS_BSC.toLowerCase()) {
      isUSDT = true;
      sourceDecimals = USDT_DECIMALS_BSC; // 18位
    }
  }

  // 如果小数位数相同，直接返回
  if (sourceDecimals == MANAGEMENT_DECIMALS) {
    return amount;
  }

  // 需要转换：6位 -> 18位（乘以 10^12）
  if (sourceDecimals < MANAGEMENT_DECIMALS) {
    let multiplier = BigInt.fromI32(10).pow(
      BigInt.fromI32(MANAGEMENT_DECIMALS - sourceDecimals)
    );
    return amount.times(multiplier);
  }

  // 如果源小数位数大于目标（理论上不会发生，但保留逻辑）
  if (sourceDecimals > MANAGEMENT_DECIMALS) {
    let divisor = BigInt.fromI32(10).pow(
      BigInt.fromI32(sourceDecimals - MANAGEMENT_DECIMALS)
    );
    return amount.div(divisor);
  }

  return amount;
}
```

**关键点说明：**

1. **ETH/TRON USDT 是 6 位小数**：链上实际值需要乘以 10^12 转换为 18 位小数
2. **BSC USDT 是 18 位小数**：不需要转换
3. **转换公式**：
   - 6位 -> 18位：`amount * 10^12`
   - 18位 -> 18位：`amount * 1`（不转换）

**示例：**
- ETH 链上：1 USDT = 1000000 (6位小数)
- 转换后：1 USDT = 1000000000000000000 (18位小数)
- 计算：1000000 * 10^12 = 1000000000000000000

**重要说明（如果采用子图转换方案）：**

1. **子图存储转换后的金额**：子图中存储的 `amount` 已经是18位小数格式
2. **后端处理问题**：
   - 子图同步服务存储事件时，直接使用子图返回的 `amount`（18位）
   - 但在 `ProcessDepositReceived` 创建 Checkbook 时，会调用 `ConvertToManagementAmount`
   - `ConvertToManagementAmount` 根据配置认为源是6位，会再次转换（导致错误）
3. **解决方案**：
   - **方案A**：修改 `ProcessDepositReceived`，识别子图来源的数据，跳过转换
   - **方案B**：子图不转换，存储原始值，后端统一转换（推荐，更简单）

**推荐采用方案B（子图不转换）**：
- 子图存储原始值（6位），与链上数据一致
- 后端统一使用 `ConvertToManagementAmount` 转换
- 不需要修改现有逻辑，保持一致性

### 6. 获取合约 ABI

从合约部署或验证平台获取 Treasury 合约的 ABI：

```bash
# 方法1：从已验证的合约获取（如 Etherscan/BscScan）
# 访问合约页面，下载 ABI JSON 文件

# 方法2：从编译后的 artifacts 获取
# 从 Hardhat/Truffle 编译输出中复制 ABI
```

将 ABI 保存到 `abis/Treasury.json`

## 三、部署子图

### 1. 在 The Graph Studio 创建子图

1. 访问 https://thegraph.com/studio/
2. 登录账户（如果没有，先注册）
3. 点击 "Create a Subgraph"
4. 填写信息：
   - **Subgraph slug**: `treasury-bsc`（或 `treasury-eth`, `treasury-tron`）
   - **Subgraph name**: `Treasury Deposit Events`
   - 选择网络类型（EVM 链选择 "Smart Contract"）
5. 创建后会显示 **Deploy Key**，复制保存

### 2. 身份验证

```bash
graph auth https://api.studio.thegraph.com/deploy/ <YOUR_DEPLOY_KEY>
```

### 3. 生成代码

```bash
npm run codegen
```

这会根据 `schema.graphql` 生成 TypeScript 类型。

### 4. 构建子图

```bash
npm run build
```

### 5. 部署子图

```bash
# 部署到 Studio（替换为你的子图名称）
graph deploy --studio treasury-bsc
```

或者使用 npm 脚本：

```bash
npm run deploy
```

### 6. 等待同步

部署后，在 The Graph Studio 中：
- 查看同步状态（Current Block）
- 等待同步完成（可能需要几分钟到几小时，取决于历史事件数量）

## 四、获取子图 URL 和 API Key

### 1. 获取子图 URL

部署成功后，在 The Graph Studio 中：

1. 进入子图详情页
2. 找到 "API" 或 "Query URL" 部分
3. 复制 GraphQL API 端点，格式类似：
   ```
   https://api.studio.thegraph.com/query/1718673/treasury-bsc/v1
   ```

### 2. 创建 API Key（推荐）

1. 在子图详情页，找到 "API Keys" 部分
2. 点击 "Create API Key"
3. 输入名称（如 `production`）
4. 复制 API Key（只显示一次，请妥善保存）

**注意**：
- 免费计划：每月 100,000 次查询
- 不配置 API Key 也可以使用，但可能遇到限流
- 生产环境强烈建议配置 API Key

## 五、配置到系统

### 1. 环境变量配置

在 `.env` 文件中添加：

```bash
# BSC 链子图配置
SUBGRAPH_URL_BSC=https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/treasury-bsc/v1
SUBGRAPH_API_KEY_BSC=your-bsc-api-key

# Ethereum 链子图配置
SUBGRAPH_URL_ETH=https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/treasury-eth/v1
SUBGRAPH_API_KEY_ETH=your-eth-api-key

# TRON 链子图配置
SUBGRAPH_URL_TRON=https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/treasury-tron/v1
SUBGRAPH_API_KEY_TRON=your-tron-api-key
```

### 2. 配置文件设置

在 `config.yaml` 中添加：

```yaml
subgraph:
  syncInterval: 3  # 同步间隔（分钟），默认3分钟
```

### 3. 重启服务

配置完成后，重启后端服务使配置生效。

## 六、金额转换说明

### 为什么需要转换？

- **ETH/TRON 上的 USDT**：链上实际是 6 位小数
- **系统内部**：统一使用 18 位小数（ManagementDecimals = 18）
- **子图存储**：应该存储转换后的金额（18位小数），与系统保持一致

### 转换逻辑（两种方案）

#### 方案1：在子图中转换（6位->18位）

在子图的 `mapping.ts` 中转换：

```typescript
// ETH/TRON USDT: 6位 -> 18位
// 1 USDT = 1000000 (6位) -> 1000000000000000000 (18位)
// 转换：1000000 * 10^12 = 1000000000000000000

// BSC USDT: 18位 -> 18位
// 1 USDT = 1000000000000000000 (18位) -> 1000000000000000000 (18位)
// 转换：不需要转换
```

**注意**：如果采用此方案，后端需要修改逻辑，识别子图来源的数据已经转换过。

#### 方案2：子图存储原始值，后端转换（推荐）

子图直接存储链上原始值，后端在创建 Checkbook 时使用 `ConvertToManagementAmount` 转换。

**优点**：
- 不需要修改现有后端逻辑
- 子图数据与链上数据一致，便于验证
- 转换逻辑统一在后端处理

### 后端处理

**重要**：如果子图已经在 mapping.ts 中做了转换，需要注意：

1. **存储事件时**：直接使用子图返回的 `amount`（已经是18位小数）
2. **创建 Checkbook 时**：`ProcessDepositReceived` 会调用 `ConvertToManagementAmount` 转换金额
   - 如果子图已经转换，`ConvertToManagementAmount` 会检测到源和目标都是18位，不会重复转换
   - 但需要确保 `ConvertToManagementAmount` 能正确识别链和Token的小数位数

**推荐方案（子图转换）**：

1. **子图转换**：在 mapping.ts 中转换（6位->18位）
2. **后端处理**：
   - 子图同步服务存储事件时，直接使用子图返回的 `amount`（已经是18位）
   - 在 `ProcessDepositReceived` 创建 Checkbook 时，`ConvertToManagementAmount` 会检查
   - **问题**：`ConvertToManagementAmount` 根据配置认为源是6位，会再次转换（错误）
   - **解决**：需要修改逻辑，识别子图来源的数据已经转换过

**更简单的方案（推荐）**：

1. **子图不转换**：存储原始值（6位），保持链上原始格式
2. **后端转换**：使用现有的 `ConvertToManagementAmount` 逻辑转换
3. **优点**：
   - 不需要修改现有逻辑
   - 子图数据与链上数据一致，便于对比和验证
   - 转换逻辑统一在后端处理

**建议**：采用"子图不转换，后端转换"的方案，这样：
- 子图存储原始值，便于验证和调试
- 后端统一处理转换逻辑
- 不需要修改现有的 `ConvertToManagementAmount` 逻辑

### 验证转换

部署子图后，可以通过查询验证：

```graphql
{
  depositReceiveds(first: 1) {
    amount
    chainId
    token
  }
}
```

检查：
- ETH/TRON 链上的 USDT 存款，`amount` 应该是 18 位小数的格式
- 例如：1 USDT 应该显示为 `1000000000000000000`（18个0）

## 七、验证配置

### 1. 测试子图查询

在 The Graph Studio 的 Playground 中测试：

```graphql
{
  depositReceiveds(
    first: 10
    orderBy: blockNumber
    orderDirection: desc
  ) {
    id
    blockNumber
    txHash
    depositor
    token
    amount
    localDepositId
    chainId
  }
  
  _meta {
    block {
      number
    }
  }
}
```

### 2. 检查同步状态

查看日志，确认子图同步服务正常运行：

```
🔄 Starting subgraph sync for all chains...
🔗 Syncing chain 714 from subgraph...
📊 Found 5 new events for chain 714
✅ Synced chain 714: 5 new events, synced to block 999950
```

## 八、多链配置示例

### BSC 链配置

```yaml
# subgraph.yaml
network: bsc
source:
  address: "0x..."  # BSC Treasury 合约地址
  startBlock: 12345678
```

### Ethereum 链配置

```yaml
# subgraph.yaml
network: mainnet
source:
  address: "0x..."  # Ethereum Treasury 合约地址
  startBlock: 18000000
```

### TRON 链配置

```yaml
# subgraph.yaml
network: tron  # 如果 The Graph 支持
source:
  address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"  # TRON 地址格式
  startBlock: 50000000
```

## 九、常见问题

### 1. 子图同步很慢

- **原因**：历史事件数量多
- **解决**：设置合适的 `startBlock`，只从合约部署后开始索引

### 2. 查询返回空结果

- **检查**：子图是否已同步到最新区块
- **检查**：查询的区块范围是否正确
- **检查**：合约地址和网络配置是否正确

### 3. API 限流

- **解决**：配置 API Key
- **解决**：减少查询频率
- **解决**：升级到付费计划

### 4. 事件字段不匹配

- **检查**：ABI 文件是否与合约版本匹配
- **检查**：schema.graphql 中的字段类型是否正确
- **检查**：mapping.ts 中的字段映射是否正确

## 十、参考资源

- [The Graph 官方文档](https://thegraph.com/docs/)
- [The Graph Studio](https://thegraph.com/studio/)
- [子图开发指南](https://thegraph.com/docs/en/developing/creating-a-subgraph/)
- [GraphQL 查询语法](https://thegraph.com/docs/en/querying/graphql-api/)

## 十一、完整示例

可以参考项目中的 NFT 子图实现：
- 路径：`enclave/node-nft/subgraph/`
- 包含完整的配置、schema、mapping 示例

