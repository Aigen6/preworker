# Chain ID 数据迁移指南

## 📋 迁移前检查

### 第一步：检查当前数据

```sql
-- 查看 intent_adapters 表中的 chain_id
SELECT DISTINCT chain_id, COUNT(*) as count
FROM intent_adapters 
GROUP BY chain_id 
ORDER BY chain_id;

-- 查看 intent_raw_token_chains 表中的 chain_id
SELECT DISTINCT chain_id, COUNT(*) as count
FROM intent_raw_token_chains 
GROUP BY chain_id 
ORDER BY chain_id;

-- 查看 chain_configs 表中的 chain_id
SELECT DISTINCT chain_id, COUNT(*) as count
FROM chain_configs 
GROUP BY chain_id 
ORDER BY chain_id;
```

### 判断是否需要迁移

**如果看到这些值** → **Native Chain ID**，需要迁移：
- `1` (Ethereum)
- `56` (BSC)
- `137` (Polygon)
- `42161` (Arbitrum)
- `10` (Optimism)
- `8453` (Base)

**如果看到这些值** → **SLIP-44 ID**，无需迁移：
- `60` (Ethereum)
- `714` (BSC)
- `966` (Polygon)
- `1042161` (Arbitrum)
- `1000010` (Optimism)
- `1008453` (Base)

---

## 🔄 迁移方案 A：使用事务（推荐）

**优点**：
- ✅ 安全（失败自动回滚）
- ✅ 不需要临时列
- ✅ 操作简单

```sql
-- 开始事务
BEGIN TRANSACTION;

-- 1. 创建备份表（可选，但强烈推荐）
CREATE TABLE intent_adapters_backup_20251023 AS 
SELECT * FROM intent_adapters;

-- 2. 更新 intent_adapters
UPDATE intent_adapters SET chain_id = 
    CASE chain_id
        WHEN 1 THEN 60           -- Ethereum: 1 → 60
        WHEN 56 THEN 714         -- BSC: 56 → 714
        WHEN 137 THEN 966        -- Polygon: 137 → 966
        WHEN 42161 THEN 1042161  -- Arbitrum: 42161 → 1042161
        WHEN 10 THEN 1000010     -- Optimism: 10 → 1000010
        WHEN 8453 THEN 1008453   -- Base: 8453 → 1008453
        ELSE chain_id            -- 已经是 SLIP-44 或未知链
    END
WHERE chain_id IN (1, 56, 137, 42161, 10, 8453);

-- 3. 更新 intent_raw_token_chains
UPDATE intent_raw_token_chains SET chain_id = 
    CASE chain_id
        WHEN 1 THEN 60
        WHEN 56 THEN 714
        WHEN 137 THEN 966
        WHEN 42161 THEN 1042161
        WHEN 10 THEN 1000010
        WHEN 8453 THEN 1008453
        ELSE chain_id
    END
WHERE chain_id IN (1, 56, 137, 42161, 10, 8453);

-- 4. 更新 intent_asset_token_chains
UPDATE intent_asset_token_chains SET chain_id = 
    CASE chain_id
        WHEN 1 THEN 60
        WHEN 56 THEN 714
        WHEN 137 THEN 966
        WHEN 42161 THEN 1042161
        WHEN 10 THEN 1000010
        WHEN 8453 THEN 1008453
        ELSE chain_id
    END
WHERE chain_id IN (1, 56, 137, 42161, 10, 8453);

-- 5. 更新 chain_configs
UPDATE chain_configs SET chain_id = 
    CASE chain_id
        WHEN 1 THEN 60
        WHEN 56 THEN 714
        WHEN 137 THEN 966
        WHEN 42161 THEN 1042161
        WHEN 10 THEN 1000010
        WHEN 8453 THEN 1008453
        ELSE chain_id
    END
WHERE chain_id IN (1, 56, 137, 42161, 10, 8453);

-- 6. 验证结果
SELECT 'intent_adapters' as table_name, chain_id, COUNT(*) as count
FROM intent_adapters GROUP BY chain_id
UNION ALL
SELECT 'intent_raw_token_chains', chain_id, COUNT(*)
FROM intent_raw_token_chains GROUP BY chain_id
UNION ALL
SELECT 'intent_asset_token_chains', chain_id, COUNT(*)
FROM intent_asset_token_chains GROUP BY chain_id
UNION ALL
SELECT 'chain_configs', chain_id, COUNT(*)
FROM chain_configs GROUP BY chain_id
ORDER BY table_name, chain_id;

-- 7. 如果一切正常，提交事务
COMMIT;

-- 如果有问题，回滚
-- ROLLBACK;
```

---

## 🔄 迁移方案 B：带临时列（更安全但更复杂）

**优点**：
- ✅ 可以对比新旧值
- ✅ 可以逐步验证
- ✅ 容易回滚

**缺点**：
- ❌ 需要更多步骤
- ❌ 需要更多空间

```sql
-- 1. 添加临时列
ALTER TABLE intent_adapters ADD COLUMN chain_id_slip44 uint32;
ALTER TABLE intent_raw_token_chains ADD COLUMN chain_id_slip44 uint32;
ALTER TABLE intent_asset_token_chains ADD COLUMN chain_id_slip44 uint32;
ALTER TABLE chain_configs ADD COLUMN chain_id_slip44 uint32;

-- 2. 填充新列
UPDATE intent_adapters SET chain_id_slip44 = 
    CASE chain_id
        WHEN 1 THEN 60
        WHEN 56 THEN 714
        WHEN 137 THEN 966
        WHEN 42161 THEN 1042161
        WHEN 10 THEN 1000010
        WHEN 8453 THEN 1008453
        ELSE chain_id
    END;

-- ... 对其他表重复相同操作 ...

-- 3. 验证转换（查看差异）
SELECT 
    chain_id AS native_id,
    chain_id_slip44 AS slip44_id,
    COUNT(*) as count
FROM intent_adapters
WHERE chain_id != chain_id_slip44
GROUP BY chain_id, chain_id_slip44;

-- 4. 如果验证通过，替换列
-- 4.1 删除旧列
ALTER TABLE intent_adapters DROP COLUMN chain_id;

-- 4.2 重命名新列
ALTER TABLE intent_adapters RENAME COLUMN chain_id_slip44 TO chain_id;

-- ... 对其他表重复相同操作 ...

-- 5. 删除备份（如果需要）
-- DROP TABLE intent_adapters_backup_20251023;
```

---

## 🛡️ 回滚方案

### 如果使用方案 A（事务）

```sql
-- 在 COMMIT 之前如果发现问题
ROLLBACK;
```

### 如果已经 COMMIT

```sql
-- 从备份表恢复
TRUNCATE TABLE intent_adapters;
INSERT INTO intent_adapters SELECT * FROM intent_adapters_backup_20251023;
```

---

## ✅ 迁移后验证

### 验证脚本

```sql
-- 1. 检查所有表的 chain_id 分布
SELECT 'intent_adapters' as table_name, 
       chain_id, 
       COUNT(*) as count,
       CASE 
           WHEN chain_id = 60 THEN 'Ethereum (SLIP-44)'
           WHEN chain_id = 714 THEN 'BSC (SLIP-44)'
           WHEN chain_id = 966 THEN 'Polygon (SLIP-44)'
           WHEN chain_id = 1042161 THEN 'Arbitrum (SLIP-44)'
           WHEN chain_id = 1000010 THEN 'Optimism (SLIP-44)'
           WHEN chain_id = 1008453 THEN 'Base (SLIP-44)'
           ELSE 'Unknown'
       END as chain_name
FROM intent_adapters 
GROUP BY chain_id
ORDER BY chain_id;

-- 2. 检查是否还有 Native Chain ID
SELECT COUNT(*) as native_chain_id_count
FROM intent_adapters
WHERE chain_id IN (1, 56, 137, 42161, 10, 8453);

-- 应该返回 0

-- 3. 检查 SLIP-44 ID 数量
SELECT COUNT(*) as slip44_chain_id_count
FROM intent_adapters
WHERE chain_id IN (60, 714, 966, 1042161, 1000010, 1008453);

-- 应该等于总记录数
```

---

## 📝 迁移记录

### 迁移日志模板

```
迁移日期：____-__-__
执行人：________
使用方案：A / B
备份表名：________________

迁移前记录数：
- intent_adapters: ____
- intent_raw_token_chains: ____
- intent_asset_token_chains: ____
- chain_configs: ____

迁移后记录数：
- intent_adapters: ____
- intent_raw_token_chains: ____
- intent_asset_token_chains: ____
- chain_configs: ____

验证结果：
[ ] 所有 Native Chain ID 已转换
[ ] 记录数量一致
[ ] 应用程序测试通过
[ ] 可以删除备份表

问题记录：
____________________
____________________
```

---

## ⚠️ 注意事项

1. **一定要备份**
   ```sql
   -- PostgreSQL
   pg_dump -U postgres -d zkpay > backup_before_migration.sql
   
   -- 或者只备份相关表
   CREATE TABLE intent_adapters_backup AS SELECT * FROM intent_adapters;
   ```

2. **在测试环境先执行**
   - 不要直接在生产环境操作
   - 先在开发/测试环境验证

3. **停止应用服务**
   - 迁移期间停止后端服务
   - 避免并发写入

4. **验证完整性**
   ```sql
   -- 确保记录数不变
   SELECT COUNT(*) FROM intent_adapters;
   SELECT COUNT(*) FROM intent_adapters_backup_20251023;
   ```

---

## 🎯 快速决策指南

**场景 1：当前是 Native Chain ID**
→ 必须迁移
→ 推荐使用**方案 A（事务）**

**场景 2：当前已经是 SLIP-44 ID**
→ 无需迁移
→ 只需更新代码注释

**场景 3：不确定**
→ 先运行检查脚本
→ 根据结果决定

---

**创建日期**: 2025-10-23
**版本**: v1.0

