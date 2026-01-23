# Tatum.io 智能合约事件监听方案

## 概述

Tatum.io 提供了两种方式来监听智能合约的 LOG 事件（Event Logs）：

1. **RPC 查询方式**：使用 `eth_getLogs` 主动查询事件
2. **Webhook 订阅方式**：创建 `CONTRACT_LOG_EVENT` 订阅，实时接收事件推送

## 方案一：RPC 查询方式（eth_getLogs）

### 特点
- **主动查询**：需要定期轮询查询
- **灵活性高**：可以精确控制查询范围和过滤条件
- **适合场景**：历史数据查询、批量处理、按需查询

### API 使用示例

```typescript
import { TatumSDK, Network, Ethereum } from '@tatumio/tatum';

const tatum = await TatumSDK.init<Ethereum>({ 
  network: Network.ETHEREUM_MAINNET,
  apiKey: 'YOUR_API_KEY'
});

// 查询指定区块范围内的事件
const logs = await tatum.rpc.getLogs({
  address: '0x...', // DepositVault 合约地址
  fromBlock: '0x123456', // 起始区块
  toBlock: 'latest', // 结束区块
  topics: [
    '0x...', // Event signature (keccak256 hash)
    null,    // topic[0] - 第一个 indexed 参数
    null,    // topic[1] - 第二个 indexed 参数
  ]
});
```

### 获取事件签名

```typescript
import { ethers } from 'ethers';

// Deposit 事件签名
const depositEventSignature = ethers.utils.id(
  'Deposit(address,uint256,uint256,address)'
);

// Claim 事件签名
const claimEventSignature = ethers.utils.id(
  'Claim(address,uint256,address)'
);

// Recover 事件签名
const recoverEventSignature = ethers.utils.id(
  'Recover(address,uint256)'
);
```

---

## 方案二：Webhook 订阅方式（推荐）✅

### 特点
- **实时推送**：事件发生后自动推送
- **自动重试**：Tatum 内置重试机制
- **批量处理**：按区块批次推送事件
- **适合场景**：实时监听、生产环境

### 创建订阅

#### 使用 SDK

```typescript
import { TatumSDK, Network, Ethereum } from '@tatumio/tatum';

const tatum = await TatumSDK.init<Ethereum>({ 
  network: Network.ETHEREUM_MAINNET,
  apiKey: 'YOUR_API_KEY'
});

// 创建 CONTRACT_LOG_EVENT 订阅
const subscription = await tatum.notification.subscribe.contractLogEvent({
  chain: 'ethereum-mainnet', // 或 'bsc-mainnet', 'polygon-mainnet' 等
  url: 'https://your-backend.com/api/webhooks/tatum',
  attr: {
    // 可选：指定合约地址（只监听特定合约）
    contractAddresses: ['0x...'], // DepositVault 地址
    
    // 可选：指定事件 topics（只监听特定事件）
    topics: [
      '0x...', // Deposit 事件签名
      // 可以添加多个事件签名
    ]
  }
});

console.log('Subscription ID:', subscription.id);
```

#### 使用 REST API

```bash
POST https://api.tatum.io/v4/subscription
Headers:
  Content-Type: application/json
  x-api-key: YOUR_API_KEY

Body:
{
  "type": "CONTRACT_LOG_EVENT",
  "attr": {
    "chain": "ethereum-mainnet",
    "url": "https://your-backend.com/api/webhooks/tatum",
    "contractAddresses": ["0x..."], // DepositVault 地址
    "topics": [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" // 事件签名
    ]
  }
}
```

### Webhook 接收端点实现

#### Node.js/TypeScript 示例

```typescript
// backend/src/webhooks/tatum-webhook.ts
import express from 'express';
import { ethers } from 'ethers';

const router = express.Router();

// DepositVault ABI（仅事件部分）
const DEPOSIT_VAULT_ABI = [
  "event Deposit(address indexed depositor, uint256 indexed depositId, uint256 amount, address indexed intendedRecipient)",
  "event Claim(address indexed depositor, uint256 indexed depositId, address indexed recipient)",
  "event Recover(address indexed depositor, uint256 indexed depositId)"
];

// 创建 Interface 用于解析事件
const depositVaultInterface = new ethers.utils.Interface(DEPOSIT_VAULT_ABI);

// Webhook 接收端点
router.post('/tatum', async (req, res) => {
  try {
    const payload = req.body;
    
    // Tatum Webhook 格式
    // {
    //   "events": [
    //     {
    //       "txId": "0x...",
    //       "logIndex": 5,
    //       "timestamp": 1700000000000,
    //       "address": "0xContractAddress...",
    //       "topic_0": "0x...", // 事件签名
    //       "topic_1": "0x...", // indexed 参数 1
    //       "topic_2": "0x...", // indexed 参数 2
    //       "topic_3": "0x...", // indexed 参数 3
    //       "data": "0x..."     // 非 indexed 参数
    //     }
    //   ],
    //   "blockNumber": 12345678,
    //   "chain": "ethereum-mainnet",
    //   "subscriptionType": "CONTRACT_LOG_EVENT"
    // }
    
    const { events, blockNumber, chain } = payload;
    
    // 处理每个事件
    for (const event of events) {
      await processEvent(event, blockNumber, chain);
    }
    
    // 返回成功响应（Tatum 需要）
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 处理单个事件
async function processEvent(event: any, blockNumber: number, chain: string) {
  const { txId, logIndex, address, topic_0, topic_1, topic_2, topic_3, data } = event;
  
  // 根据 topic_0（事件签名）判断事件类型
  if (topic_0 === depositVaultInterface.getEvent('Deposit').topicHash) {
    // 解析 Deposit 事件
    const decoded = depositVaultInterface.decodeEventLog(
      'Deposit',
      {
        topics: [topic_0, topic_1, topic_2, topic_3],
        data: data
      }
    );
    
    console.log('Deposit Event:', {
      depositor: decoded.depositor,
      depositId: decoded.depositId.toString(),
      amount: decoded.amount.toString(),
      intendedRecipient: decoded.intendedRecipient,
      txHash: txId,
      blockNumber,
      chain
    });
    
    // 保存到数据库
    await saveDepositEvent({
      depositor: decoded.depositor,
      depositId: decoded.depositId.toString(),
      amount: decoded.amount.toString(),
      intendedRecipient: decoded.intendedRecipient,
      txHash: txId,
      blockNumber,
      chain
    });
    
  } else if (topic_0 === depositVaultInterface.getEvent('Claim').topicHash) {
    // 解析 Claim 事件
    const decoded = depositVaultInterface.decodeEventLog(
      'Claim',
      {
        topics: [topic_0, topic_1, topic_2, topic_3],
        data: data
      }
    );
    
    console.log('Claim Event:', {
      depositor: decoded.depositor,
      depositId: decoded.depositId.toString(),
      recipient: decoded.recipient,
      txHash: txId,
      blockNumber,
      chain
    });
    
    await saveClaimEvent({
      depositor: decoded.depositor,
      depositId: decoded.depositId.toString(),
      recipient: decoded.recipient,
      txHash: txId,
      blockNumber,
      chain
    });
    
  } else if (topic_0 === depositVaultInterface.getEvent('Recover').topicHash) {
    // 解析 Recover 事件
    const decoded = depositVaultInterface.decodeEventLog(
      'Recover',
      {
        topics: [topic_0, topic_1, topic_2],
        data: data
      }
    );
    
    console.log('Recover Event:', {
      depositor: decoded.depositor,
      depositId: decoded.depositId.toString(),
      txHash: txId,
      blockNumber,
      chain
    });
    
    await saveRecoverEvent({
      depositor: decoded.depositor,
      depositId: decoded.depositId.toString(),
      txHash: txId,
      blockNumber,
      chain
    });
  }
}

export default router;
```

### Webhook 安全验证

Tatum 支持 HMAC 签名验证，确保请求来自 Tatum：

```typescript
import crypto from 'crypto';

function verifyTatumWebhook(req: express.Request, secret: string): boolean {
  const signature = req.headers['x-tatum-signature'] as string;
  const payload = JSON.stringify(req.body);
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// 在路由中使用
router.post('/tatum', async (req, res) => {
  // 验证签名
  if (!verifyTatumWebhook(req, process.env.TATUM_WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // 处理事件...
});
```

---

## 多链支持

Tatum 支持多条链，可以为每条链创建独立的订阅：

```typescript
const chains = [
  { name: 'ethereum-mainnet', chainId: 1 },
  { name: 'bsc-mainnet', chainId: 56 },
  { name: 'polygon-mainnet', chainId: 137 },
  { name: 'tron-mainnet', chainId: 195 } // TRON 支持可能有限
];

for (const chain of chains) {
  await tatum.notification.subscribe.contractLogEvent({
    chain: chain.name,
    url: 'https://your-backend.com/api/webhooks/tatum',
    attr: {
      contractAddresses: [getDepositVaultAddress(chain.chainId)],
      topics: [
        getEventSignature('Deposit'),
        getEventSignature('Claim'),
        getEventSignature('Recover')
      ]
    }
  });
}
```

---

## 防重处理

使用 `txHash + logIndex` 作为唯一标识，避免重复处理：

```typescript
async function saveDepositEvent(event: DepositEvent) {
  // 使用 txHash + logIndex 作为唯一键
  const eventId = `${event.txHash}-${event.logIndex}`;
  
  // 检查是否已处理
  const existing = await db.query(
    'SELECT id FROM deposit_events WHERE event_id = $1',
    [eventId]
  );
  
  if (existing.rows.length > 0) {
    console.log('Event already processed:', eventId);
    return;
  }
  
  // 保存事件
  await db.query(
    `INSERT INTO deposit_events 
     (event_id, depositor, deposit_id, amount, intended_recipient, tx_hash, block_number, chain)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      eventId,
      event.depositor,
      event.depositId,
      event.amount,
      event.intendedRecipient,
      event.txHash,
      event.blockNumber,
      event.chain
    ]
  );
}
```

---

## 与现有架构对比

### Tatum.io vs BlockScanner

| 特性 | Tatum.io | BlockScanner |
|------|----------|--------------|
| **维护成本** | 无需维护 | 需要维护 |
| **实时性** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **可控性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **成本** | 付费服务 | 自建成本 |
| **多链支持** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **定制化** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **可靠性** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 推荐使用场景

**使用 Tatum.io 适合：**
- 快速原型开发
- 中小规模项目
- 不想维护扫描服务
- 需要快速上线

**使用 BlockScanner 适合：**
- 大规模生产环境
- 需要完全控制
- 已有基础设施
- 需要高度定制化

---

## 实施建议

### 混合方案（推荐）

可以同时使用两种方案：
- **Tatum.io**: 用于快速验证和开发阶段
- **BlockScanner**: 用于生产环境的稳定运行

### 实施步骤

1. **注册 Tatum.io 账户**
   - 访问 https://tatum.io
   - 获取 API Key

2. **创建 Webhook 订阅**
   - 为每条链创建订阅
   - 配置合约地址和事件过滤

3. **实现 Webhook 接收端点**
   - 验证签名
   - 解析事件
   - 保存到数据库
   - 实现防重机制

4. **测试和监控**
   - 测试事件接收
   - 监控处理延迟
   - 检查错误日志

---

## 参考资源

- [Tatum.io 官方文档](https://docs.tatum.io)
- [Tatum SDK (TypeScript)](https://github.com/tatumio/tatum-js)
- [Webhook 认证文档](https://docs.tatum.io/docs/authenticating-notification-webhooks)
- [RPC API 文档](https://docs.tatum.io/reference/rpc-base-eth_getlogs)

---

## 总结

Tatum.io 提供了便捷的智能合约事件监听方案，特别适合：
- 快速开发和原型验证
- 不想维护扫描服务的项目
- 需要多链支持的应用

对于生产环境，建议结合使用 Tatum.io 和 BlockScanner，提供冗余保障和更高的可靠性。
