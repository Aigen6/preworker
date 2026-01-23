# Next.js 13 + Tailwind CSS 完整前端项目模板

这是一个基于 Next.js 13 (App Router) + Tailwind CSS 的完整前端项目模板，集成了主题系统、国际化、响应式设计等现代前端开发所需的功能。

## ✨ 主要功能

- 🎨 **主题系统** - 支持亮/暗模式切换和自定义主题色
- 🌍 **国际化** - 支持中英文切换
- 📱 **响应式设计** - 完美适配移动端、平板和PC
- 🧩 **组件库** - 丰富的可复用组件
- 🔧 **TypeScript** - 完整的类型支持
- 📦 **状态管理** - 使用 Zustand 进行状态管理
- 🎯 **现代化工具链** - ESLint、PostCSS 等开发工具

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看项目。

### 构建生产版本

```bash
npm run build
npm start
```

## 🐳 Docker 构建

### 使用 build-docker.sh 脚本

项目提供了统一的 Docker 构建脚本 `build-docker.sh`，支持多种配置选项。

#### 基本用法

```bash
# 使用默认配置构建
./build-docker.sh

# 构建并推送镜像
./build-docker.sh --push

# 指定版本标签
./build-docker.sh --version v2.0.0

# 使用测试标签
./build-docker.sh --test
```

#### 配置后端服务 URL

##### 方式 1: 使用基础域名自动生成（推荐）

通过 `--domain` 参数配置基础域名，脚本会自动生成三个子域名：

```bash
# 自动生成三个子域名
./build-docker.sh --domain enclave-hq.com --push

# 将自动生成:
# - https://backend.enclave-hq.com  → NEXT_PUBLIC_API_URL
# - https://stats.enclave-hq.com    → NEXT_PUBLIC_STATISTICS_API_URL
# - https://energyrent.enclave-hq.com → NEXT_PUBLIC_ENERGY_RENTAL_API_URL
```

**支持的协议：**
- 默认使用 `https` 协议
- 支持 `http://` 前缀：`./build-docker.sh --domain http://enclave-hq.com`
- 支持 `https://` 前缀：`./build-docker.sh --domain https://enclave-hq.com`

##### 方式 2: 手动指定后端 API URL

```bash
# 使用 --api 参数指定完整 URL
./build-docker.sh --api https://backend.enclave-hq.com --push
```

**注意：** 如果同时使用 `--api` 和 `--domain`，`--api` 的值会优先作为后端 URL，统计和能量租赁服务仍使用自动生成的子域名。

#### 完整参数说明

```bash
./build-docker.sh [选项]

选项:
  --version VERSION   设置镜像版本标签 (默认: v1)
  --test              使用测试版本标签 (构建 aigen2025/enclave-webserver:test)
  --tag TAG           设置完整镜像标签 (默认: aigen2025/enclave-webserver)
  --platform PLATFORM 设置目标平台 (默认: linux/amd64)
  --api URL           设置后端 API URL (例如: https://backend.enclave-hq.com)
  --domain DOMAIN     设置基础域名，自动生成子域名 (例如: enclave-hq.com)
                      将自动生成: backend.DOMAIN, stats.DOMAIN, energyrent.DOMAIN
  --push              构建后推送镜像到仓库
  --use-mirror        使用国内镜像源 (解决 Docker Hub 连接问题)
  --no-cache          不使用缓存构建
  --help              显示此帮助信息
```

#### 使用示例

```bash
# 示例 1: 使用基础域名自动生成所有服务 URL
./build-docker.sh --domain enclave-hq.com --push

# 示例 2: 使用 http 协议
./build-docker.sh --domain http://enclave-hq.com --push

# 示例 3: 自定义后端 URL，其他服务使用自动生成
./build-docker.sh --api https://custom-backend.example.com --domain enclave-hq.com --push

# 示例 4: 构建测试版本
./build-docker.sh --domain enclave-hq.com --test --push

# 示例 5: 使用国内镜像源构建
./build-docker.sh --domain enclave-hq.com --use-mirror --push
```

#### 环境变量配置

构建时会自动设置以下环境变量到 Docker 镜像中：

- `NEXT_PUBLIC_API_URL` - 主后端服务 URL
- `NEXT_PUBLIC_WS_URL` - WebSocket URL（从 API URL 自动推导）
- `NEXT_PUBLIC_STATISTICS_API_URL` - 统计服务 URL（使用 `--domain` 时自动生成）
- `NEXT_PUBLIC_ENERGY_RENTAL_API_URL` - 能量租赁服务 URL（使用 `--domain` 时自动生成）

这些环境变量会在构建时嵌入到客户端代码中，无需在运行时配置。

#### 默认镜像配置

- **镜像名称**: `aigen2025/enclave-webserver`
- **默认版本**: `v1`
- **默认平台**: `linux/amd64`

## 📁 项目结构

```
src/
├── app/                    # App Router 页面
│   ├── globals.css        # 全局样式
│   ├── layout.tsx         # 根布局
│   ├── page.tsx          # 首页
│   └── settings/         # 设置页面
├── components/           # 组件
│   ├── layout/           # 布局组件
│   │   ├── header.tsx    # 头部组件
│   │   └── footer.tsx    # 底部组件
│   ├── providers/        # 提供者组件
│   │   └── theme-provider.tsx
│   └── ui/               # UI 组件
│       ├── button.tsx    # 按钮组件
│       ├── card.tsx      # 卡片组件
│       ├── theme-toggle.tsx    # 主题切换组件
│       └── language-toggle.tsx # 语言切换组件
├── lib/                  # 工具库
│   ├── hooks/            # 自定义 Hooks
│   │   └── use-translation.ts
│   ├── stores/           # 状态管理
│   │   └── theme-store.ts
│   └── utils/            # 工具函数
│       ├── cn.ts        # 类名工具
│       └── theme.ts     # 主题工具
└── public/
    └── locales/          # 国际化文件
        ├── zh/           # 中文
        └── en/           # 英文
```

## 🎨 主题系统

### 主题模式
- **亮色模式** - 适合日间使用
- **暗色模式** - 适合夜间使用  
- **跟随系统** - 自动根据系统设置切换

### 自定义主题色
支持 8 种预设主题色：
- 蓝色 (默认)
- 绿色
- 紫色
- 红色
- 橙色
- 粉色
- 靛蓝
- 青色

### 使用主题

```tsx
import { useThemeStore } from '@/lib/stores/theme-store'

function MyComponent() {
  const { theme, setTheme, primaryColor, setPrimaryColor } = useThemeStore()
  
  return (
    <div>
      <button onClick={() => setTheme('dark')}>切换到暗色模式</button>
      <button onClick={() => setPrimaryColor('#10b981')}>设置绿色主题</button>
    </div>
  )
}
```

## 🌍 国际化

### 支持语言
- 中文 (zh) - 默认
- 英文 (en)

### 使用翻译

```tsx
import { useTranslation } from '@/lib/hooks/use-translation'

function MyComponent() {
  const { t } = useTranslation()
  
  return <h1>{t('home.title')}</h1>
}
```

### 添加新语言

1. 在 `public/locales/` 下创建新的语言文件夹
2. 复制现有语言文件并翻译内容
3. 更新 `next-i18next.config.js` 配置

## 🧩 组件使用

### Button 组件

```tsx
import { Button } from '@/components/ui/button'

// 不同变体
<Button>默认按钮</Button>
<Button variant="outline">轮廓按钮</Button>
<Button variant="ghost">幽灵按钮</Button>

// 不同尺寸
<Button size="sm">小按钮</Button>
<Button size="lg">大按钮</Button>
```

### Card 组件

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>卡片标题</CardTitle>
  </CardHeader>
  <CardContent>
    卡片内容
  </CardContent>
</Card>
```

## 📱 响应式设计

项目使用 Tailwind CSS 的响应式断点：

- `sm:` - 640px 及以上 (平板)
- `md:` - 768px 及以上 (小桌面)
- `lg:` - 1024px 及以上 (桌面)
- `xl:` - 1280px 及以上 (大桌面)

### 响应式示例

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* 移动端: 1列, 平板: 2列, 桌面: 3列 */}
</div>
```

## 🔧 开发工具

### 代码检查
```bash
npm run lint
```

### 类型检查
```bash
npx tsc --noEmit
```

## 📦 技术栈

- **框架**: Next.js 13 (App Router)
- **样式**: Tailwind CSS 4
- **语言**: TypeScript
- **状态管理**: Zustand
- **国际化**: 自定义 Hook
- **字体**: Geist Sans & Geist Mono
- **图标**: Lucide React

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**开始构建您的下一个项目吧！** 🚀