# 批量取消 Withdraw 请求脚本

## 说明

这个脚本用于批量取消失败的 Withdraw 请求。**注意：此脚本直接操作数据库，绕过了 API 认证，适合管理员使用。**

### 为什么需要这个脚本？

- **API 限制**：通过 API (`DELETE /api/my/withdraw-requests/:id`) 取消请求需要：
  1. 用户认证（JWT Token）
  2. 验证请求的所有者必须是当前认证用户
  3. 每个用户只能取消自己的请求
  
- **批量操作需求**：当有多个用户的请求需要批量取消时，使用 API 需要：
  - 每个用户分别登录认证
  - 逐个调用 API
  - 效率低且不便于管理

- **管理员场景**：此脚本直接调用服务层，可以：
  - 批量查询和取消任意用户的请求
  - 无需认证（直接数据库操作）
  - 自动释放关联的 Allocation（pending → idle）

## 使用方法

### 1. 编译脚本

```bash
cd /Users/qizhongzhu/enclave/backend
go build -o batch-cancel-withdraw ./cmd/batch-cancel-withdraw
```

### 2. 使用方式

#### 方式一：按状态筛选（推荐）

取消所有 `execute_status=verify_failed` 且 `payout_status=pending` 的请求：

```bash
./batch-cancel-withdraw \
  -execute-status=verify_failed \
  -payout-status=pending \
  -dry-run  # 先预览，确认无误后去掉 -dry-run 参数
```

取消所有 `proof_status=failed` 的请求：

```bash
./batch-cancel-withdraw -proof-status=failed
```

#### 方式二：指定请求 ID

```bash
./batch-cancel-withdraw -ids="id1,id2,id3,id4,id5,id6,id7,id8,id9"
```

### 3. 参数说明

- `-execute-status`: 按 execute_status 筛选（如：`verify_failed`, `submit_failed`, `pending`）
- `-payout-status`: 按 payout_status 筛选（如：`pending`, `failed`）
- `-proof-status`: 按 proof_status 筛选（如：`failed`, `completed`）
- `-ids`: 逗号分隔的请求 ID 列表
- `-dry-run`: 预览模式，只显示会取消的请求，不实际执行
- `-config`: 配置文件路径（默认：`config.yaml`）

### 4. 针对您的情况

根据您提供的信息，有 9 个请求需要取消，它们的状态是：
- `proof_status`: `failed` 或 `completed`
- `execute_status`: `verify_failed`
- `payout_status`: `pending`

**推荐命令：**

```bash
# 1. 先预览（dry-run）
./batch-cancel-withdraw \
  -execute-status=verify_failed \
  -payout-status=pending \
  -dry-run

# 2. 确认无误后执行
./batch-cancel-withdraw \
  -execute-status=verify_failed \
  -payout-status=pending
```

或者，如果您知道具体的请求 ID：

```bash
./batch-cancel-withdraw -ids="id1,id2,id3,id4,id5,id6,id7,id8,id9"
```

## 脚本功能

1. **自动筛选**：根据状态筛选可取消的请求
2. **安全检查**：只取消满足 `CanCancel()` 条件的请求（`execute_status != success`）
3. **自动释放**：取消时会自动将关联的 Allocation 从 `pending` 转为 `idle`
4. **确认机制**：执行前需要输入 `yes` 确认
5. **详细日志**：显示每个请求的详细信息和处理结果

## 注意事项

⚠️ **重要提示**：

1. **权限要求**：此脚本需要直接访问数据库，需要管理员权限
2. **数据备份**：执行前建议备份数据库
3. **测试环境**：建议先在测试环境验证
4. **确认状态**：使用 `-dry-run` 先预览，确认无误后再执行

## 取消后的效果

取消成功后：
- ✅ Withdraw 请求状态变为 `cancelled`
- ✅ 关联的 Allocation 状态从 `pending` 转为 `idle`（可重新使用）
- ✅ 用户可以重新创建 Withdraw 请求

## 替代方案：通过 API（需要用户认证）

如果用户需要自己取消，可以通过 API：

```bash
# 需要 JWT Token
curl -X DELETE \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://api.example.com/api/my/withdraw-requests/<request_id>
```

或使用 SDK：

```typescript
await sdk.apis.withdrawals.cancelWithdrawRequest({ id: requestId })
```

但这种方式：
- 需要每个用户分别认证
- 只能取消自己的请求
- 不适合批量操作

