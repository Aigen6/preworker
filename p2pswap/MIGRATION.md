# 迁移指南

本文档说明如何从 `preworker/webfront` 迁移预处理功能到独立的 `p2pswap` 项目。

## 迁移步骤

### 1. 复制依赖文件

运行以下脚本复制所有必要的依赖文件：

```bash
#!/bin/bash
# migrate-dependencies.sh

SOURCE_DIR="/Users/qizhongzhu/enclave/preworker/webfront"
TARGET_DIR="/Users/qizhongzhu/enclave/preworker/p2pswap/frontend"

# 创建目录结构
mkdir -p $TARGET_DIR/src/{components/{ui,deposit,providers},hooks,lib/{stores,utils},app}

# 复制 UI 组件
cp -r $SOURCE_DIR/src/components/ui $TARGET_DIR/src/components/
cp $SOURCE_DIR/src/components/deposit/tron-gas-rental-option.tsx $TARGET_DIR/src/components/deposit/
cp -r $SOURCE_DIR/src/components/providers $TARGET_DIR/src/components/

# 复制 Hooks
cp $SOURCE_DIR/src/lib/hooks/use-wallet-connection.ts $TARGET_DIR/src/lib/hooks/
cp $SOURCE_DIR/src/lib/hooks/use-wallet-balance.ts $TARGET_DIR/src/lib/hooks/
cp $SOURCE_DIR/src/lib/hooks/use-translation.ts $TARGET_DIR/src/lib/hooks/
cp $SOURCE_DIR/src/hooks/use-bottom-sheet.ts $TARGET_DIR/src/hooks/

# 复制 Stores
cp $SOURCE_DIR/src/lib/stores/sdk-store.ts $TARGET_DIR/src/lib/stores/
cp $SOURCE_DIR/src/lib/stores/index.ts $TARGET_DIR/src/lib/stores/ 2>/dev/null || true

# 复制工具函数
cp $SOURCE_DIR/src/lib/utils/token-decimals.ts $TARGET_DIR/src/lib/utils/
cp $SOURCE_DIR/src/lib/utils/cn.ts $TARGET_DIR/src/lib/utils/ 2>/dev/null || true

# 复制样式和配置
cp $SOURCE_DIR/src/app/globals.css $TARGET_DIR/src/app/
cp $SOURCE_DIR/tailwind.config.ts $TARGET_DIR/
cp $SOURCE_DIR/postcss.config.mjs $TARGET_DIR/

echo "✅ 依赖文件复制完成"
```

### 2. 修复导入路径

检查并修复 `src/app/preprocess/page.tsx` 中的导入路径，确保所有导入都正确。

### 3. 创建必要的配置文件

- `src/app/layout.tsx` - Next.js 根布局
- `src/app/page.tsx` - 首页（重定向到 /preprocess）
- `.env.local` - 环境变量配置

### 4. 安装依赖

```bash
cd frontend
npm install
```

### 5. 测试运行

```bash
npm run dev
```

访问 http://localhost:5173/preprocess

## 依赖关系图

```
preprocess/page.tsx
├── use-deposit-vault.ts
│   ├── sdk-store.ts
│   ├── deployment-config.ts
│   └── tron-address-converter.ts
├── use-wallet-connection.ts
├── use-wallet-balance.ts
├── use-translation.ts
├── use-bottom-sheet.ts
├── UI Components
│   ├── SvgIcon
│   ├── BottomSheet
│   ├── AddressInput
│   └── TronGasRentalOption
└── Toast Provider
```

## 注意事项

1. **环境变量**: 确保配置了所有必要的环境变量（见 README.md）
2. **钱包 SDK**: 需要配置 `@enclave-hq/wallet-sdk` 的 URL
3. **TreasuryConfigCore**: 需要配置各链的 TreasuryConfigCore 地址
4. **TRON Energy**: 如果使用 TRON 链，需要配置 Energy 相关环境变量
