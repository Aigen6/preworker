# Git Pre-commit Security Hook

## 概述

这个 pre-commit hook 会在每次提交前自动检查是否有敏感信息（私钥、密码、密钥等），防止意外提交敏感数据。

## 功能

Hook 会检查以下内容：

1. **私钥检查**
   - 检测 64 位十六进制私钥
   - 排除已知占位符（如 `your-private-key`、`placeholder` 等）

2. **密码检查**
   - 检测配置文件中的密码
   - 排除占位符和测试密码

3. **密钥检查**
   - 检测 secrets 和 API keys
   - 排除占位符

4. **敏感文件检查**
   - 防止提交 `config.yaml`、`.env` 等敏感配置文件
   - 允许提交 `.example` 和 `.template` 文件

## 安装

Hook 已自动安装到 `.git/hooks/pre-commit`。

如果需要在其他仓库安装：

```bash
cp .git/hooks/pre-commit /path/to/other/repo/.git/hooks/pre-commit
chmod +x /path/to/other/repo/.git/hooks/pre-commit
```

## 使用

Hook 会在每次 `git commit` 时自动运行。

如果检测到敏感信息，提交会被阻止，并显示错误信息。

## 绕过检查（不推荐）

如果确实需要绕过检查（例如提交测试数据）：

```bash
git commit --no-verify
```

**警告：** 只有在完全确定没有敏感信息时才使用此选项。

## 测试

测试 hook 是否正常工作：

```bash
# 创建一个测试文件（包含占位符，应该通过）
echo 'privateKey: "0x_your-private-key"' > test.yaml
git add test.yaml
git commit -m "test"  # 应该通过

# 创建一个包含真实私钥的测试文件（应该被阻止）
echo 'privateKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"' > test.yaml
git add test.yaml
git commit -m "test"  # 应该被阻止
```

## 维护

如果发现误报，可以修改 `.git/hooks/pre-commit` 文件，添加更多的排除规则。

## 相关文件

- `.git/hooks/pre-commit` - 实际的 hook 脚本
- `.gitignore` - Git 忽略规则（应该包含所有敏感文件）
