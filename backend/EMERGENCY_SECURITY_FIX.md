# 🚨 紧急安全修复指南

## 情况说明

如果真实的私钥、密码或其他敏感信息被提交到 GitHub，需要立即采取以下措施：

## ⚡ 立即执行的步骤

### 1. 立即轮换所有泄露的密钥

**如果私钥泄露：**
- 立即将相关地址中的资金转移到新地址
- 生成新的私钥
- 更新所有使用该私钥的服务

**如果密码泄露：**
- 立即更改所有相关密码
- 更改数据库密码
- 更改 JWT secret
- 更改所有 API 密钥

### 2. 从 Git 历史中完全删除敏感文件

```bash
# 使用 git filter-repo（推荐）
# 安装: brew install git-filter-repo 或 pip install git-filter-repo

cd /Users/qizhongzhu/enclave/backend

# 从整个 Git 历史中删除文件
git filter-repo --path backend-config.yaml --invert-paths
git filter-repo --path temp-config.yaml --invert-paths
git filter-repo --path config.yaml --invert-paths

# 强制推送到远程（⚠️ 警告：这会重写历史）
git push origin --force --all
git push origin --force --tags
```

**或者使用 BFG Repo-Cleaner（更快）：**
```bash
# 下载 BFG: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files backend-config.yaml
java -jar bfg.jar --delete-files temp-config.yaml
java -jar bfg.jar --delete-files config.yaml
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push origin --force --all
```

### 3. 检查 GitHub 是否已缓存

- 检查 GitHub 的 Security 页面是否有泄露警告
- 如果仓库是公开的，立即设为私有
- 考虑使用 GitHub 的 Secret Scanning 功能

### 4. 通知团队成员

- 通知所有有仓库访问权限的成员
- 要求他们立即拉取最新代码并删除本地敏感文件
- 要求他们更改可能泄露的凭据

## 🔍 检查是否有真实私钥泄露

运行以下命令检查：

```bash
cd /Users/qizhongzhu/enclave/backend

# 检查是否有真实的私钥（64字符十六进制）
git log --all -p -- backend-config.yaml temp-config.yaml config.yaml | \
  grep -E "privateKey.*0x[a-fA-F0-9]{64}" | \
  grep -v "your-private-key\|REMOVED\|example"

# 检查所有配置文件中的私钥
git log --all -p | \
  grep -E "0x[a-fA-F0-9]{64}" | \
  grep -v "your-private-key\|REMOVED\|example\|commit"
```

## 📋 后续预防措施

1. **使用环境变量**：所有敏感信息必须从环境变量读取
2. **使用 .gitignore**：确保所有配置文件都被忽略
3. **使用 pre-commit hooks**：检查提交中是否包含敏感信息
4. **使用 Secret Scanning**：启用 GitHub 的 Secret Scanning 功能
5. **代码审查**：所有提交必须经过代码审查

## ⚠️ 重要提醒

- **不要**只是删除文件，必须从 Git 历史中完全清除
- **不要**在提交消息中提及敏感信息
- **不要**使用 `git rm --cached`，这不会从历史中删除
- **必须**使用 `git filter-repo` 或 `BFG` 来清理历史

## 🔐 当前已修复的问题

✅ 已更新 `.gitignore` 忽略所有配置文件
✅ 已从 Git 索引中移除 `backend-config.yaml` 和 `temp-config.yaml`
✅ 已添加 `.env.*` 规则忽略所有环境变量文件

## 📞 需要帮助？

如果发现真实的私钥泄露，请立即：
1. 转移资金到新地址
2. 联系安全团队
3. 考虑使用专业的安全审计服务























