# CatFee Mate API 自动回退机制

## 问题

`/v1/mate/open/transaction` 端点返回认证错误：
```
auth error:Invalid API Key (code: 2)
```

## 解决方案

已实现自动回退机制：如果 Mate API 认证失败，会自动回退到常规模式。

### 当前行为

1. **尝试使用 Mate API**（如果 `useDirectPayment: true`）
   - 调用 `/v1/mate/open/transaction` 端点
   - 如果成功，返回支付地址，用户直接支付

2. **自动回退到常规模式**（如果 Mate API 认证失败）
   - 捕获认证错误
   - 自动使用 `/v1/order` 端点
   - 根据账户余额自动选择支付方式

### 代码实现

```typescript
if (useDirectPayment) {
  try {
    return await this.createOrderWithDirectPayment(...);
  } catch (error) {
    // 如果是认证错误，回退到常规模式
    if (error.message?.includes('Invalid API Key')) {
      console.warn('⚠️  Mate API 认证失败，回退到常规模式');
      // 继续使用常规模式
    } else {
      throw error;
    }
  }
}
```

## 使用建议

### 方案 1：使用常规模式（当前默认）

```typescript
{
  "useDirectPayment": false  // 使用常规模式
}
```

**优点：**
- 不需要特殊权限
- 工作稳定
- 如果账户余额不足，会自动返回支付地址

**缺点：**
- 如果账户有余额，费用会从账户扣除（API 模式）
- 需要清空账户余额才能强制用户直接支付

### 方案 2：尝试 Mate API（带自动回退）

```typescript
{
  "useDirectPayment": true  // 尝试 Mate API，失败时自动回退
}
```

**优点：**
- 优先使用 Mate API（如果可用）
- 自动回退，不会导致订单创建失败

**缺点：**
- Mate API 可能需要特殊权限
- 如果认证失败，会回退到常规模式

### 方案 3：强制用户直接支付（清空账户余额）

如果使用常规模式，可以通过清空账户余额来强制返回支付地址：

1. 登录 CatFee 后台：https://catfee.io
2. 提取或使用完账户余额
3. 确保账户余额为 0 或不足以支付订单
4. 创建订单时，系统会自动返回支付地址（TRANSFER 模式）

## 获取 Mate API 权限

如果需要使用 Mate API，需要：

1. **联系 CatFee 支持**
   - 确认账户是否有权限使用 Mate API
   - 申请启用 "Per-Order Payment" 功能

2. **检查 API 密钥**
   - 确认是否需要不同的 API 密钥
   - 检查 API 密钥是否有 Mate API 权限

3. **验证权限**
   - 测试 Mate API 端点是否可用
   - 确认认证是否成功

## 相关文档

- CatFee 官方文档: https://docs.catfee.io
- Mate API 文档: https://docs.catfee.io/en/api-reference/transaction/create-order
- 认证错误解决方案: `CATFEE_MATE_API_AUTH_ERROR.md`
