# 快速开始

## 当前状态

✅ **已迁移**:
- 预处理页面 (`src/app/preprocess/page.tsx`)
- 核心 Hook (`use-deposit-vault.ts`)
- 合约 ABI 文件
- 基础工具函数

❌ **缺失的依赖** (需要从 `webfront` 复制):

### 必需文件

1. **UI 组件** (`src/components/`)
   - `ui/SvgIcon.tsx`
   - `ui/bottom-sheet.tsx`
   - `ui/address-input.tsx`
   - `deposit/tron-gas-rental-option.tsx`
   - `providers/toast-provider.tsx`
   - `providers/client-layout.tsx` (用于 layout)

2. **Hooks** (`src/lib/hooks/` 或 `src/hooks/`)
   - `use-wallet-connection.ts`
   - `use-wallet-balance.ts`
   - `use-translation.ts`
   - `use-bottom-sheet.ts` (在 `src/hooks/`)

3. **Stores** (`src/lib/stores/`)
   - `sdk-store.ts`
   - `index.ts` (如果有)

4. **工具函数** (`src/lib/utils/`)
   - `token-decimals.ts` ⚠️ **必需**
   - `tron-energy-estimator.ts`
   - `debug-tron-energy.ts` (可选)
   - `cn.ts` (工具函数)

5. **配置文件**
   - `src/app/layout.tsx` ⚠️ **必需**
   - `src/app/page.tsx` (首页，重定向到 /preprocess)
   - `src/app/globals.css` ⚠️ **必需**
   - `tailwind.config.ts` ⚠️ **必需**
   - `postcss.config.mjs` ⚠️ **必需**
   - `src/lib/config/index.ts` (appConfig)

## 快速迁移

### 方法 1: 运行迁移脚本（推荐）

```bash
cd /Users/qizhongzhu/enclave/preworker/p2pswap
./migrate-dependencies.sh
```

### 方法 2: 手动复制

```bash
cd /Users/qizhongzhu/enclave/preworker

# UI 组件
cp -r webfront/src/components/ui p2pswap/frontend/src/components/
cp -r webfront/src/components/deposit p2pswap/frontend/src/components/
cp -r webfront/src/components/providers p2pswap/frontend/src/components/

# Hooks
cp webfront/src/lib/hooks/use-wallet-connection.ts p2pswap/frontend/src/lib/hooks/
cp webfront/src/lib/hooks/use-wallet-balance.ts p2pswap/frontend/src/lib/hooks/
cp webfront/src/lib/hooks/use-translation.ts p2pswap/frontend/src/lib/hooks/
cp webfront/src/hooks/use-bottom-sheet.ts p2pswap/frontend/src/hooks/

# Stores
cp webfront/src/lib/stores/sdk-store.ts p2pswap/frontend/src/lib/stores/
cp webfront/src/lib/stores/index.ts p2pswap/frontend/src/lib/stores/ 2>/dev/null || true

# 工具函数
cp webfront/src/lib/utils/token-decimals.ts p2pswap/frontend/src/lib/utils/
cp webfront/src/lib/utils/tron-energy-estimator.ts p2pswap/frontend/src/lib/utils/
cp webfront/src/lib/utils/debug-tron-energy.ts p2pswap/frontend/src/lib/utils/ 2>/dev/null || true
cp webfront/src/lib/utils/cn.ts p2pswap/frontend/src/lib/utils/

# 配置文件
cp webfront/src/app/layout.tsx p2pswap/frontend/src/app/
cp webfront/src/app/globals.css p2pswap/frontend/src/app/
cp webfront/tailwind.config.ts p2pswap/frontend/
cp webfront/postcss.config.mjs p2pswap/frontend/
cp webfront/src/lib/config/index.ts p2pswap/frontend/src/lib/config/ 2>/dev/null || true

# 创建首页（重定向到 /preprocess）
cat > p2pswap/frontend/src/app/page.tsx << 'EOF'
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/preprocess')
}
EOF
```

## Wallet SDK 配置

**Wallet SDK 是必需的**，已经在 `package.json` 中：

```json
"@enclave-hq/wallet-sdk": "^1.2.4"
```

需要配置环境变量 `.env.local`:

```bash
# Wallet SDK URL（必需）
NEXT_PUBLIC_WALLET_SDK_URL=https://wallet.enclave-hq.com

# TreasuryConfigCore 地址（按链配置）
NEXT_PUBLIC_TREASURY_CONFIG_CORE_60=0x...   # Ethereum
NEXT_PUBLIC_TREASURY_CONFIG_CORE_714=0x...   # BSC
NEXT_PUBLIC_TREASURY_CONFIG_CORE_195=0x...   # TRON

# TRON Energy 配置（可选，如果使用 TRON）
NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY=...
NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY=...
```

## 安装和运行

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173/preprocess

## 常见问题

### Q: 可以直接运行吗？
A: **不能**，需要先复制缺失的依赖文件。运行迁移脚本后即可。

### Q: 需要 Wallet SDK 吗？
A: **是的，必需**。这是钱包交互功能，已经在 package.json 中，只需要配置环境变量。

### Q: 还需要后端吗？
A: **不需要**。这是纯前端 + 合约的项目，不依赖后端服务。
