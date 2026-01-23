#!/bin/bash
# 从 webfront 迁移依赖文件到 p2pswap

SOURCE_DIR="/Users/qizhongzhu/enclave/preworker/webfront"
TARGET_DIR="/Users/qizhongzhu/enclave/preworker/p2pswap/frontend"

echo "🚀 开始迁移依赖文件..."
echo "源目录: $SOURCE_DIR"
echo "目标目录: $TARGET_DIR"
echo ""

# 创建目录结构
echo "📁 创建目录结构..."
mkdir -p $TARGET_DIR/src/{components/{ui,deposit,providers},hooks,lib/{stores,utils},app}
mkdir -p $TARGET_DIR/public

# 复制 UI 组件
echo "📦 复制 UI 组件..."
if [ -d "$SOURCE_DIR/src/components/ui" ]; then
    cp -r $SOURCE_DIR/src/components/ui $TARGET_DIR/src/components/
    echo "  ✅ UI 组件"
else
    echo "  ⚠️  UI 组件目录不存在"
fi

if [ -f "$SOURCE_DIR/src/components/deposit/tron-gas-rental-option.tsx" ]; then
    mkdir -p $TARGET_DIR/src/components/deposit
    cp $SOURCE_DIR/src/components/deposit/tron-gas-rental-option.tsx $TARGET_DIR/src/components/deposit/
    echo "  ✅ TronGasRentalOption"
else
    echo "  ⚠️  TronGasRentalOption 不存在"
fi

if [ -d "$SOURCE_DIR/src/components/providers" ]; then
    cp -r $SOURCE_DIR/src/components/providers $TARGET_DIR/src/components/
    echo "  ✅ Providers"
else
    echo "  ⚠️  Providers 目录不存在"
fi

# 复制 Hooks
echo "🪝 复制 Hooks..."
if [ -f "$SOURCE_DIR/src/lib/hooks/use-wallet-connection.ts" ]; then
    cp $SOURCE_DIR/src/lib/hooks/use-wallet-connection.ts $TARGET_DIR/src/lib/hooks/
    echo "  ✅ use-wallet-connection"
fi

if [ -f "$SOURCE_DIR/src/lib/hooks/use-wallet-balance.ts" ]; then
    cp $SOURCE_DIR/src/lib/hooks/use-wallet-balance.ts $TARGET_DIR/src/lib/hooks/
    echo "  ✅ use-wallet-balance"
fi

if [ -f "$SOURCE_DIR/src/lib/hooks/use-translation.ts" ]; then
    cp $SOURCE_DIR/src/lib/hooks/use-translation.ts $TARGET_DIR/src/lib/hooks/
    echo "  ✅ use-translation"
fi

if [ -f "$SOURCE_DIR/src/hooks/use-bottom-sheet.ts" ]; then
    cp $SOURCE_DIR/src/hooks/use-bottom-sheet.ts $TARGET_DIR/src/hooks/
    echo "  ✅ use-bottom-sheet"
fi

# 复制 Stores
echo "📦 复制 Stores..."
if [ -f "$SOURCE_DIR/src/lib/stores/sdk-store.ts" ]; then
    cp $SOURCE_DIR/src/lib/stores/sdk-store.ts $TARGET_DIR/src/lib/stores/
    echo "  ✅ sdk-store"
fi

if [ -f "$SOURCE_DIR/src/lib/stores/index.ts" ]; then
    cp $SOURCE_DIR/src/lib/stores/index.ts $TARGET_DIR/src/lib/stores/
    echo "  ✅ stores/index"
fi

# 复制工具函数
echo "🛠️  复制工具函数..."
if [ -f "$SOURCE_DIR/src/lib/utils/token-decimals.ts" ]; then
    cp $SOURCE_DIR/src/lib/utils/token-decimals.ts $TARGET_DIR/src/lib/utils/
    echo "  ✅ token-decimals"
fi

if [ -f "$SOURCE_DIR/src/lib/utils/cn.ts" ]; then
    cp $SOURCE_DIR/src/lib/utils/cn.ts $TARGET_DIR/src/lib/utils/
    echo "  ✅ cn"
fi

# 复制样式和配置
echo "🎨 复制样式和配置..."
if [ -f "$SOURCE_DIR/src/app/globals.css" ]; then
    cp $SOURCE_DIR/src/app/globals.css $TARGET_DIR/src/app/
    echo "  ✅ globals.css"
fi

if [ -f "$SOURCE_DIR/tailwind.config.ts" ]; then
    cp $SOURCE_DIR/tailwind.config.ts $TARGET_DIR/
    echo "  ✅ tailwind.config.ts"
fi

if [ -f "$SOURCE_DIR/postcss.config.mjs" ]; then
    cp $SOURCE_DIR/postcss.config.mjs $TARGET_DIR/
    echo "  ✅ postcss.config.mjs"
fi

echo ""
echo "✅ 依赖文件迁移完成！"
echo ""
echo "下一步："
echo "1. 检查并修复导入路径"
echo "2. 创建 src/app/layout.tsx 和 src/app/page.tsx"
echo "3. 配置环境变量 (.env.local)"
echo "4. 运行 npm install && npm run dev"
