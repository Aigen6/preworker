# 白U操作计划生成工具 (Designer)

独立的 Web 应用，用于生成和管理白U操作计划，确保资金经过预处理和Enclave隐私化处理。

## 功能特性

1. **白U地址管理** - 添加/删除白U地址，支持多链
2. **策略配置** - 4个防匹配策略的配置界面
3. **参数输入** - 输入总量、地址数、每笔金额等
4. **计划生成** - 自动生成符合策略的操作计划
5. **策略验证** - 实时显示策略验证结果
6. **计划导出** - 支持导出 JSON 和 CSV 格式

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3001

### 构建生产版本

```bash
npm run build
npm start
```

## 项目结构

```
designer/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── layout.tsx    # 根布局
│   │   ├── page.tsx      # 主页面
│   │   └── globals.css   # 全局样式
│   ├── lib/              # 工具函数
│   │   └── strategy-utils.ts  # 策略验证工具
│   └── components/       # React 组件
├── package.json
├── tsconfig.json
└── next.config.ts
```

## 是否需要后端？

当前版本是纯前端应用，数据保存在浏览器本地存储（localStorage）。

如果需要以下功能，可以考虑添加后端：

- ✅ **持久化存储** - 将计划保存到数据库
- ✅ **多用户支持** - 用户认证和权限管理
- ✅ **计划历史** - 查看和管理历史计划
- ✅ **链上数据查询** - 查询地址余额、交易历史等
- ✅ **与现有系统集成** - 与 Backend/Statistics 服务集成

如果需要后端，可以：
1. 创建 Node.js/Express API 服务
2. 或使用 NestJS（与现有 backend 保持一致）
3. 或集成到现有的 backend 服务中

## 技术栈

- **Next.js 16** - React 框架
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式框架
- **React 19** - UI 库

## 许可证

私有项目
