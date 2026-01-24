# P2PSwap 项目

## 项目结构

本项目包含三个核心页面：

1. **设计页面** (`/designer`) - 输入高风险地址和数量，生成策略
2. **任务页面** (`/tasks`) - 显示任务列表和完成情况
3. **统计页面** (`/statistics`) - 显示统计信息

## 快速开始

### 1. 配置地址池

地址池从配置文件读取，请编辑 `frontend/public/config/address-pool.json`：

```json
[
  {
    "address": "0x...",
    "chainId": 714,
    "label": "低风险地址1"
  },
  {
    "address": "0x...",
    "chainId": 714,
    "label": "低风险地址2"
  }
]
```

### 2. 环境变量

在 `frontend/.env.local` 中配置：

```env
NEXT_PUBLIC_PRIVATE_KEY=0x...
NEXT_PUBLIC_DEPOSIT_VAULT_714=0x...
```

### 3. 运行

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173/designer

## 使用流程

1. **设计页面**：
   - 输入高风险地址和数量（USDT）
   - 点击"添加"添加到列表
   - 点击"生成策略"按钮生成任务

2. **任务页面**：
   - 查看生成的任务列表
   - 点击"执行"按钮执行任务
   - 查看任务完成状态

3. **统计页面**：
   - 查看任务统计信息
   - 查看策略验证结果

## 功能说明

- 地址池从配置文件自动加载（`/config/address-pool.json`）
- 使用 Signer 模式自动签名执行任务
- 支持金额不匹配、时间扩展、正常交易混合等策略
