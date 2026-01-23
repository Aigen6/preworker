# 使用 Signer 模式（私钥签名）

**好消息**：钱包 SDK **支持 Signer 模式**！你可以使用私钥通过钱包 SDK 连接，无需用户交互。

适用于：
- 服务端脚本
- 自动化脚本
- 不需要用户交互的场景
- 测试环境

## 两种签名方式对比

### 方式 1: 钱包 SDK（当前默认）

**优点**：
- 支持多种钱包（MetaMask、WalletConnect、TronLink 等）
- 用户友好的交互体验
- 自动处理不同链的签名标准

**缺点**：
- 需要用户连接钱包
- 需要配置 Wallet SDK URL

### 方式 2: Signer（私钥签名）

**优点**：
- 无需用户交互
- 适合自动化场景
- 不需要 Wallet SDK

**缺点**：
- 需要管理私钥（安全风险）
- 仅支持 EVM 链（ethers.js）
- 不适合前端用户场景

## 部署脚本已使用 Signer

部署脚本（`contracts/script/`）已经使用 Signer 模式：

```javascript
// deployDepositVaultBSC.cjs
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);  // 使用 Signer
```

## 前端使用 Signer 模式（通过钱包 SDK）

钱包 SDK 支持通过私钥连接，无需用户交互！

### 方法 1: 使用 WalletManager.connectWithPrivateKey

```typescript
// 在组件中或初始化时
import { useWallet } from '@enclave-hq/wallet-sdk/react'

function YourComponent() {
  const { walletManager } = useWallet()

  // 使用私钥连接（无需用户交互）
  const connectWithPrivateKey = async () => {
    const privateKey = process.env.NEXT_PUBLIC_PRIVATE_KEY // 从环境变量读取
    const chainId = 56 // BSC
    
    if (!privateKey) {
      throw new Error('Private key not configured')
    }

    // 使用钱包 SDK 的私钥连接
    const account = await walletManager.connectWithPrivateKey(privateKey, chainId)
    console.log('Connected:', account.nativeAddress)
    
    // 之后可以正常使用 walletManager 的所有功能
    // deposit, claim, recover 等操作都可以正常使用
  }

  return (
    <button onClick={connectWithPrivateKey}>
      使用私钥连接
    </button>
  )
}
```

### 方法 2: 直接使用 EVMPrivateKeyAdapter

```typescript
import { EVMPrivateKeyAdapter } from '@enclave-hq/wallet-sdk'

// 创建适配器
const adapter = new EVMPrivateKeyAdapter()
adapter.setPrivateKey('0x...')

// 连接
const account = await adapter.connect(56) // BSC

// 使用适配器的方法
const txHash = await adapter.writeContract(...)
```

### 环境变量配置

```bash
# .env.local（仅用于开发/测试，生产环境不要暴露私钥！）
NEXT_PUBLIC_PRIVATE_KEY=0x...
NEXT_PUBLIC_RPC_URL=https://bsc-dataseed1.binance.org  # 可选，适配器会自动配置
```

### 优势

使用钱包 SDK 的 Signer 模式相比直接使用 ethers.js：
- ✅ **统一接口**：与钱包连接使用相同的 API
- ✅ **多链支持**：自动处理不同链的差异
- ✅ **类型安全**：完整的 TypeScript 支持
- ✅ **无需修改现有代码**：`useDepositVault` Hook 可以直接使用

## 使用场景建议

### 使用钱包 SDK + 用户钱包（推荐用于前端用户）

- ✅ 用户交互的前端应用
- ✅ 需要支持多种钱包（MetaMask、TronLink 等）
- ✅ 需要用户授权

### 使用钱包 SDK + 私钥（推荐用于自动化）

- ✅ 前端自动化脚本
- ✅ 测试环境
- ✅ 服务端脚本
- ✅ 不需要用户交互的场景
- ✅ **优势**：与用户钱包使用相同的 API，代码无需修改

### 使用 ethers.js Signer（仅用于部署脚本）

- ✅ 部署脚本（已实现）
- ✅ 纯 Node.js 环境
- ✅ 不需要钱包 SDK 的场景

## 安全注意事项

⚠️ **重要**：使用 Signer 模式时：

1. **永远不要在前端暴露私钥**
   - 私钥应该只在服务端使用
   - 如果必须在前端使用，确保是测试环境

2. **环境变量安全**
   - 不要将包含私钥的 `.env` 文件提交到 Git
   - 使用 `.env.local` 并添加到 `.gitignore`

3. **生产环境**
   - 生产环境应该使用钱包 SDK 或硬件钱包
   - 私钥签名仅用于自动化脚本和服务端

## 当前实现状态

- ✅ **部署脚本**：已使用 Signer（ethers.Wallet）
- ✅ **前端**：钱包 SDK 支持 Signer 模式（`connectWithPrivateKey`）
- ✅ **现有 Hook**：`useDepositVault` 可以直接使用，无需修改代码

## 示例：使用 Signer 的部署脚本

```bash
# 部署脚本已经使用 Signer
cd contracts
export PRIVATE_KEY="0x..."
npm run deploy:vault:bsc
```

脚本内部使用：
```javascript
const wallet = new ethers.Wallet(privateKey, provider)
// 直接使用 wallet 签名和发送交易
```

## 总结

- ✅ **部署脚本**：已支持 Signer 模式（ethers.Wallet）
- ✅ **前端应用**：钱包 SDK 支持 Signer 模式（`connectWithPrivateKey`）
- ✅ **推荐**：
  - 用户交互：使用钱包 SDK + 用户钱包
  - 自动化场景：使用钱包 SDK + 私钥（`connectWithPrivateKey`）
  - 部署脚本：使用 ethers.js Signer

## 快速开始（使用钱包 SDK + 私钥）

```typescript
import { useWallet } from '@enclave-hq/wallet-sdk/react'

function App() {
  const { walletManager } = useWallet()

  useEffect(() => {
    // 自动使用私钥连接（无需用户交互）
    const privateKey = process.env.NEXT_PUBLIC_PRIVATE_KEY
    if (privateKey) {
      walletManager.connectWithPrivateKey(privateKey, 56) // BSC
        .then(account => {
          console.log('Connected:', account.nativeAddress)
        })
    }
  }, [])

  // 之后可以正常使用 useDepositVault Hook
  // 所有功能都可以正常使用，无需修改代码
}
```
