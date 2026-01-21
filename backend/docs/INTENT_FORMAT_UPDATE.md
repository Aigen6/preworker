# Intent 格式更新说明

## 问题

根据 ZKPay.sol 合约和 ZKVM 程序的 `WithdrawPublicValues` 结构，原来的 intent 格式不完整，缺少必要的字段。

## ZKVM 程序要求

根据 `zkpay_withdraw/src/main.rs`，ZKVM 程序期望的输入格式：

### RawToken (type = 0)
1. `beneficiary_chain_id: u32`
2. `beneficiary_data: [u8; 32]`
3. `token_contract: [u8; 32]` (32 bytes，从 20-byte 地址转换)
4. `token_symbol: String` (用于签名显示)

### AssetToken (type = 1)
1. `asset_id: [u8; 32]` (32 bytes)
2. `beneficiary_chain_id: u32`
3. `beneficiary_data: [u8; 32]`
4. `preferred_chain_flag: u8` (0 或 1)
5. `preferred_chain: u32` (如果 flag = 1)
6. `asset_token_symbol: String` (用于签名显示，即 tokenKey)

## 更新内容

### 1. 后端模型更新 (`backend/internal/models/zkpay_models.go`)

**之前**:
```go
type Intent struct {
    Type            IntentType       `json:"type"`
    Beneficiary     UniversalAddress `json:"beneficiary"`
    TokenIdentifier string           `json:"tokenIdentifier"` // 不明确
    AssetID         string           `json:"assetId"`
    PreferredChain  *uint32          `json:"preferredChain"`
}
```

**之后**:
```go
type Intent struct {
    Type            IntentType       `json:"type"`            // 0=RawToken, 1=AssetToken
    Beneficiary     UniversalAddress `json:"beneficiary"`      // Target beneficiary address
    TokenContract   string           `json:"tokenContract"`    // For RawToken: 20-byte ERC20 address
    TokenSymbol     string           `json:"tokenSymbol"`     // Token symbol (RawToken: "USDT", AssetToken: "aUSDT")
    AssetID         string           `json:"assetId"`         // For AssetToken: 32-byte asset identifier
    PreferredChain  *uint32          `json:"preferredChain"`  // Optional: preferred target chain
}
```

**说明**: `tokenSymbol` 和 `tokenKey` 本质上是同一个概念（token symbol），只是在不同场景下的命名：
- 在 Intent 输入中，统一使用 `tokenSymbol`
- 在 ZKVM 程序中，RawToken 使用 `token_symbol`，AssetToken 使用 `asset_token_symbol`
- 在 PublicValues 输出中，只有 AssetToken 的 symbol 存储在 `tokenKey` 字段中（RawToken 的 `tokenKey` 为空字符串）

### 2. API 请求格式更新 (`backend/internal/handlers/withdraw_request_handler.go`)

**之前**:
```json
{
  "allocations": ["id1", "id2"],
  "intent": {
    "type": 0,
    "beneficiaryChainId": 714,
    "beneficiaryAddress": "0x...",
    "tokenIdentifier": "0x...",  // 不明确
    "assetId": "0x...",
    "preferredChain": 1
  }
}
```

**之后**:
```json
{
  "allocations": ["id1", "id2"],
  "intent": {
    "type": 0,  // 0=RawToken, 1=AssetToken
    "beneficiaryChainId": 714,
    "beneficiaryAddress": "0x...",  // 32-byte Universal Address (hex without 0x prefix)
    
    // For RawToken (type = 0):
    "tokenContract": "0x55d398326f99059fF775485246999027B3197955",  // 20-byte ERC20 address
    
    // For AssetToken (type = 1):
    "assetId": "0x...",  // 32-byte Asset ID
    "preferredChain": 1  // Optional
    
    // Common field (used for both types):
    "tokenSymbol": "USDT",  // Token symbol (RawToken: "USDT", AssetToken: "aUSDT")
  }
}
```

### 3. 字段映射说明

- **RawToken**:
  - `tokenContract` → 存储在 `WithdrawRequest.TokenIdentifier` (20-byte 地址)
  - `tokenSymbol` → 存储在 Intent 对象中，用于 ZKVM proof 生成（在 ZKVM 中作为 `token_symbol` 输入）
  - 在 ZKVM 中，`tokenContract` 会被转换为 32-byte 格式

- **AssetToken**:
  - `assetId` → 存储在 `WithdrawRequest.AssetID` (32-byte)
  - `tokenSymbol` → 存储在 Intent 对象中，用于 ZKVM proof 生成（在 ZKVM 中作为 `asset_token_symbol` 输入，在 PublicValues 中存储在 `tokenKey` 字段）
  - `preferredChain` → 存储在 `WithdrawRequest.PreferredChain`

### 4. 注意事项

1. **minOutput**: 不在 intent 中，由后端根据业务逻辑设置（默认 0）
2. **sourceChainId** 和 **sourceTokenKey**: 从 allocations 的 checkbook 中自动获取，不在 intent 中
3. **TokenSymbol** 和 **TokenKey**: 用于签名消息显示和链上验证，必须提供
4. **TokenContract**: 20-byte 地址，后端在调用 ZKVM 时会转换为 32-byte 格式

## 后续工作

1. **SDK 更新**: 需要更新 SDK 的 `WithdrawalAction` 和 `WithdrawalsAPI` 以匹配新的 intent 格式
2. **验证逻辑**: 需要在 Handler 中添加验证，确保：
   - RawToken 时，`tokenContract` 和 `tokenSymbol` 必须提供
   - AssetToken 时，`assetId` 和 `tokenSymbol` 必须提供
3. **ZKVM 集成**: 确保在调用 ZKVM 生成 proof 时，正确传递 `tokenSymbol`：
   - RawToken: 作为 `token_symbol` 输入
   - AssetToken: 作为 `asset_token_symbol` 输入（在 PublicValues 中存储在 `tokenKey` 字段）

