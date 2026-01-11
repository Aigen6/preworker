# webfront Git 提交指南

## 提交步骤

### 1. 检查状态

```bash
cd /Users/qizhongzhu/enclave/webfront
git status
```

### 2. 添加更改

```bash
# 添加所有更改
git add .

# 或添加特定文件
git add src/ package.json
```

### 3. 提交更改

```bash
git commit -m "描述你的更改"
```

### 4. 推送到 GitHub

```bash
# 如果 webfront 是独立的仓库
git push origin main
# 或
git push origin master

# 如果 webfront 是 submodule，需要：
# 1. 先推送 submodule
cd /Users/qizhongzhu/enclave/webfront
git push origin main

# 2. 然后在父仓库中更新 submodule 引用
cd /Users/qizhongzhu/enclave
git add webfront
git commit -m "Update webfront submodule"
git push
```

## 如果是 Submodule

如果 webfront 是 git submodule，需要：

1. **在 submodule 中提交**：
```bash
cd webfront
git add .
git commit -m "Update webfront"
git push
```

2. **在父仓库中更新 submodule 引用**：
```bash
cd ..
git add webfront
git commit -m "Update webfront submodule to latest"
git push
```

## 检查 Remote 配置

```bash
cd webfront
git remote -v
```

如果没有 remote，需要添加：
```bash
git remote add origin https://github.com/your-username/webfront.git
```

