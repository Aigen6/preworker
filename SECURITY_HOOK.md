# Git Pre-commit Hook - 敏感信息检查

## 概述

项目已配置 Git pre-commit hook，用于在提交代码前自动检查敏感信息，防止意外提交密钥、密码、助记词、令牌等敏感数据。

## 检测的敏感信息类型

Hook 会检测以下类型的敏感信息：

### 1. 私钥 (Private Keys)
- 64 位十六进制私钥（带或不带 0x 前缀）
- 独立的 64 字符十六进制字符串
- 排除已知的占位符和测试密钥

### 2. 助记词 (Mnemonic Phrases) ⚠️ 区块链项目特别关注
- 12 或 24 词助记词短语
- 检测 `mnemonic`, `seed`, `seed_phrase`, `recovery_phrase` 等关键词
- 排除测试和示例助记词

### 3. 密码 (Passwords)
- 密码字段中的长字符串
- 排除常见的占位符和测试密码

### 4. 密钥 (Secrets)
- 密钥字段中的长字符串
- 排除占位符和示例

### 5. API 密钥和令牌
- **API Keys**: `api_key`, `apikey` 等格式
- **Docker Tokens**: `dckr_pat_*` 格式
- **GitHub Tokens**: `ghp_*`, `ghs_*`, `github_pat_*` 格式
- **AWS Keys**: `AKIA[0-9A-Z]{16}` 格式
- **AWS Secret Keys**: 40+ 字符的 base64 字符串
- **Stripe Keys**: `sk_live_*`, `pk_live_*` 格式
- **JWT Tokens**: `eyJ...` 格式的 JWT 令牌
- **通用 Tokens**: 32+ 字符的令牌字符串

### 6. 数据库连接字符串
- PostgreSQL、MySQL、MongoDB、Redis 连接字符串
- 排除 localhost 和示例连接

### 7. 敏感文件
以下类型的文件会被阻止提交：
- `config.yaml` (非示例文件)
- `config.local.yaml`
- `config.production.yaml`
- `.env` 文件
- `.key`, `.pem`, `.p12` 证书文件
- `.mnemonic` 助记词文件
- 其他包含 `private` 或 `secret` 的配置文件

## 使用方法

Hook 会在每次 `git commit` 时自动运行。如果检测到敏感信息，提交会被阻止。

### 正常提交
```bash
git add .
git commit -m "your message"
# Hook 会自动检查，如果没有敏感信息，提交成功
```

### 检测到敏感信息时
如果检测到敏感信息，你会看到类似以下的错误信息：
```
🔒 Checking for sensitive information...
❌ ERROR: Found potential mnemonic phrase in scripts/deploy.ts
   mnemonic: "word1 word2 ... word12"
❌ Commit blocked: Sensitive information detected!
```

### 绕过检查（不推荐）
如果确实需要绕过检查（例如在紧急情况下），可以使用：
```bash
git commit --no-verify
```

**⚠️ 警告**: 绕过检查可能导致敏感信息泄露，请谨慎使用！

## 修复敏感信息

如果检测到敏感信息，请按以下步骤修复：

1. **移除硬编码的敏感信息**
   - 使用环境变量替代
   - 使用配置文件（并添加到 `.gitignore`）
   - 使用密钥管理服务

2. **更新 .gitignore**
   - 确保敏感文件已被忽略
   - 例如：`.env.local`, `*.key`, `*.pem`, `*.mnemonic` 等

3. **使用占位符**
   - 在示例文件中使用占位符，如 `your-api-key`, `your-password` 等

## 区块链项目特别注意事项

### 私钥和助记词
- **永远不要**将私钥或助记词提交到代码仓库
- 使用环境变量或安全的密钥管理服务
- 测试时使用已知的测试密钥（如 Hardhat 默认测试密钥）

### 示例：修复助记词泄露

**错误示例**:
```typescript
const mnemonic = "word1 word2 word3 ... word12";
```

**正确做法**:
```typescript
// 使用环境变量
const mnemonic = process.env.MNEMONIC;

// 或从密钥管理服务获取
const mnemonic = await getSecret('wallet-mnemonic');
```

### 示例：修复私钥泄露

**错误示例**:
```typescript
const privateKey = "0x1234567890abcdef...";
```

**正确做法**:
```typescript
// 使用环境变量
const privateKey = process.env.PRIVATE_KEY;

// 或从密钥管理服务获取
const privateKey = await getSecret('wallet-private-key');
```

## 维护

Hook 文件位置：`.git/hooks/pre-commit`

如果需要修改检测规则，请编辑该文件。修改后确保文件具有执行权限：
```bash
chmod +x .git/hooks/pre-commit
```

## 注意事项

1. Hook 只在本地仓库生效，不会推送到远程仓库
2. 每个开发者克隆仓库后需要手动安装 hook（或使用工具如 husky 自动安装）
3. Hook 不会检查已提交的历史记录，只检查当前提交的文件
4. 如果敏感信息已经提交到仓库，需要：
   - 立即撤销提交
   - 轮换所有泄露的密钥和助记词
   - 考虑使用 `git filter-branch` 或 `git filter-repo` 清理历史
   - **对于区块链项目，如果私钥或助记词泄露，必须立即转移所有资金到新地址**

## 相关文件

- Hook 脚本: `.git/hooks/pre-commit`
- Git 忽略规则: `.gitignore`
- 环境变量示例: 查看各子项目的 `env.example` 文件
