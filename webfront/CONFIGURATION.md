# 配置指南

本文档说明如何配置应用的 LOGO 和样式主题。

## 配置方式

有两种方式可以配置应用：

### 方式 1: 环境变量（推荐）

创建 `.env.local` 文件（或使用 `.env.example` 作为模板），设置环境变量：

```bash
# 复制示例文件
cp .env.example .env.local
```

然后修改 `.env.local` 中的值。

### 方式 2: 直接修改配置文件

直接修改 `src/lib/config/app-config.ts` 和 `src/lib/config/theme-config.ts` 中的默认值。

## LOGO 配置

### 环境变量

```bash
# 品牌名称
NEXT_PUBLIC_BRAND_NAME=Enclave

# 品牌副标题
NEXT_PUBLIC_BRAND_SUBTITLE=区块链上的私有银行

# Logo 图标路径（相对于 public 目录）
NEXT_PUBLIC_LOGO_ICON=/icons/logo-icon.png

# Logo 尺寸（像素）
NEXT_PUBLIC_LOGO_WIDTH=34
NEXT_PUBLIC_LOGO_HEIGHT=34

# Favicon 路径（相对于 public 目录）
NEXT_PUBLIC_FAVICON=/icons/bunny.svg
```

### 使用说明

1. 将你的 LOGO 图片放在 `public/icons/` 目录下
2. 设置 `NEXT_PUBLIC_LOGO_ICON` 为图片路径（相对于 public 目录）
3. 设置 `NEXT_PUBLIC_LOGO_WIDTH` 和 `NEXT_PUBLIC_LOGO_HEIGHT` 为图片尺寸
4. 设置 `NEXT_PUBLIC_BRAND_NAME` 为你的品牌名称
5. 设置 `NEXT_PUBLIC_BRAND_SUBTITLE` 为副标题（可选，会覆盖翻译文件中的值）

## 主题样式配置

### 深色模式配置

```bash
# 背景色
NEXT_PUBLIC_THEME_BG_BASE=#151515
NEXT_PUBLIC_THEME_BG_SURFACE=#242424
NEXT_PUBLIC_THEME_BG_OVERLAY=#1515154d
NEXT_PUBLIC_THEME_BG_HAIRLINE=#FFFFFF0d

# 文字颜色
NEXT_PUBLIC_THEME_TEXT_MAIN=#F4F4F4
NEXT_PUBLIC_THEME_TEXT_MUTED=#939393
NEXT_PUBLIC_THEME_TEXT_DANGER=#B73C3C
NEXT_PUBLIC_THEME_TEXT_ON_PRIMARY=#13131C

# 边框颜色
NEXT_PUBLIC_THEME_BORDER_LINE=#3A3A3A

# 主色
NEXT_PUBLIC_THEME_PRIMARY=#E5F240

# 黑色系列
NEXT_PUBLIC_THEME_BLACK_1=#1D1D1D
NEXT_PUBLIC_THEME_BLACK_2=#242424
NEXT_PUBLIC_THEME_BLACK_3=#2A2A2A
NEXT_PUBLIC_THEME_BLACK_4=#3A3A3A
NEXT_PUBLIC_THEME_BLACK_9=#939393
```

### 浅色模式配置

```bash
# 背景色
NEXT_PUBLIC_THEME_LIGHT_BG_BASE=#FFFFFF
NEXT_PUBLIC_THEME_LIGHT_BG_SURFACE=#F5F5F5
NEXT_PUBLIC_THEME_LIGHT_BG_OVERLAY=#0000000d
NEXT_PUBLIC_THEME_LIGHT_BG_HAIRLINE=#0000000d

# 文字颜色
NEXT_PUBLIC_THEME_LIGHT_TEXT_MAIN=#13131C
NEXT_PUBLIC_THEME_LIGHT_TEXT_MUTED=#3A3A3A
NEXT_PUBLIC_THEME_LIGHT_TEXT_DANGER=#B73C3C
NEXT_PUBLIC_THEME_LIGHT_TEXT_ON_PRIMARY=#13131C

# 边框颜色
NEXT_PUBLIC_THEME_LIGHT_BORDER_LINE=#D1D1D1

# 主色
NEXT_PUBLIC_THEME_LIGHT_PRIMARY=#E5F240

# 黑色系列
NEXT_PUBLIC_THEME_LIGHT_BLACK_1=#1D1D1D
NEXT_PUBLIC_THEME_LIGHT_BLACK_2=#242424
NEXT_PUBLIC_THEME_LIGHT_BLACK_3=#2A2A2A
NEXT_PUBLIC_THEME_LIGHT_BLACK_4=#3A3A3A
NEXT_PUBLIC_THEME_LIGHT_BLACK_9=#939393
```

## 配置文件位置

- **应用配置**: `src/lib/config/app-config.ts`
- **主题配置**: `src/lib/config/theme-config.ts`
- **环境变量示例**: `.env.example`

## 使用配置

配置会自动应用到以下位置：

1. **Header 组件**: 使用配置的 LOGO 和品牌名称
2. **页面元数据**: 使用配置的标题、描述和 favicon
3. **全局样式**: 使用配置的主题颜色变量
4. **所有页面**: 包括存入隐私池、DEFI提取、提现历史等所有页面的样式都会跟随主题配置改变

### 样式统一性

所有页面的颜色现在都使用统一的主题配置：

- **文字颜色**: `text-main`, `text-muted`, `text-danger` 等
- **背景颜色**: `bg-base`, `bg-surface`, `bg-black-3` 等
- **边框颜色**: `border-line`, `border-primary`, `border-danger` 等
- **主色**: `bg-primary`, `text-primary`, `border-primary` 等

修改主题配置后，所有页面的样式都会自动更新，无需逐个修改。

## 注意事项

1. 所有环境变量必须以 `NEXT_PUBLIC_` 开头才能在客户端使用
2. 修改环境变量后需要重启开发服务器
3. 颜色值可以使用十六进制格式（如 `#E5F240`）或 rgba 格式（如 `#1515154d`）
4. Logo 图片路径是相对于 `public` 目录的

## 示例：自定义品牌

假设你要将应用改为 "MyApp" 品牌：

1. 将你的 LOGO 放在 `public/icons/myapp-logo.png`
2. 在 `.env.local` 中设置：

```bash
NEXT_PUBLIC_BRAND_NAME=MyApp
NEXT_PUBLIC_BRAND_SUBTITLE=我的区块链应用
NEXT_PUBLIC_LOGO_ICON=/icons/myapp-logo.png
NEXT_PUBLIC_LOGO_WIDTH=40
NEXT_PUBLIC_LOGO_HEIGHT=40
NEXT_PUBLIC_FAVICON=/icons/myapp-logo.png
```

3. 重启开发服务器，LOGO 和品牌名称会自动更新

