# 部署配置文件

此目录包含各链的合约部署结果配置文件。

## 文件格式

文件名格式：`result_<network>.json`

例如：
- `result_bsc.json` - BSC 链部署结果
- `result_eth.json` - Ethereum 链部署结果
- `result_polygon.json` - Polygon 链部署结果
- `result_tron.json` - TRON 链部署结果

## JSON 结构

```json
{
  "network": "bsc",
  "chainId": "56",
  "deployer": "0x...",
  "timestamp": "2026-01-14T10:38:53.879Z",
  "contracts": {
    "DepositVault": {
      "address": "0x...",
      "owner": "0x...",
      "defaultLendingDelegate": "0x...",
      "defaultLendingTarget": "0x...",
      "recoveryDelay": "259200"
    },
    "AAVEv3Delegate": {
      "address": "0x..."
    }
  },
  "configuration": {
    "aavePool": "0x..."
  }
}
```

## 使用方法

前端代码会自动根据当前连接的链（chainId）从对应的 JSON 文件读取合约地址。

### ChainId 映射

- `1` 或 `60` → `eth` (Ethereum)
- `56` 或 `714` → `bsc` (BSC)
- `137` 或 `966` → `polygon` (Polygon)
- `195` → `tron` (TRON)

## 更新配置

当部署新合约后，将 `result_xxx.json` 文件复制到此目录即可。前端会自动使用新的合约地址。

## 回退机制

如果 JSON 文件不存在或读取失败，系统会自动回退到从 `TreasuryConfigCore` 合约读取配置。
