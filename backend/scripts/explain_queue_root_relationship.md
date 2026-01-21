# Queue Root 关系说明

## 理论上的两个 QueueRoot 记录

对于 root `0xb8e68690b3821915b9439951faf563d313c7275476cac7413ebf79c1741e4f90`，理论上应该对应两个 QueueRoot 记录：

### 记录 1：作为 `root` 的记录
- **`root`**: `0xb8e68690b3821915b9439951faf563d313c7275476cac7413ebf79c1741e4f90`
- **`previous_root`**: 某个之前的 root（比如 `0x...`）
- **`created_by_commitment`**: 创建这个 root 的 commitment hash
- **含义**: 这个记录表示某个 commitment 被提交到链上后，创建了这个新的 queue root

### 记录 2：作为 `previous_root` 的记录
- **`root`**: 某个后续的 root（比如 `0x...`）
- **`previous_root`**: `0xb8e68690b3821915b9439951faf563d313c7275476cac7413ebf79c1741e4f90`
- **`created_by_commitment`**: 创建后续 root 的 commitment hash
- **含义**: 这个记录表示某个后续的 commitment 被提交到链上后，创建了新的 root，而 `0xb8e68690b3821915b9439951faf563d313c7275476cac7413ebf79c1741e4f90` 是它的前一个 root

## 数据结构关系

```
Queue Root 链：
... -> Root_A -> Root_B (0xb8e68690...) -> Root_C -> ...
       ↑              ↑                      ↑
   记录1的         目标 root              记录2的
   previous_root                        root
```

## 查询 SQL

```sql
-- 记录 1：作为 root 的记录
SELECT * FROM queue_roots 
WHERE root = '0xb8e68690b3821915b9439951faf563d313c7275476cac7413ebf79c1741e4f90';

-- 记录 2：作为 previous_root 的记录
SELECT * FROM queue_roots 
WHERE previous_root = '0xb8e68690b3821915b9439951faf563d313c7275476cac7413ebf79c1741e4f90';
```












