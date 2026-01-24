-- 策略表
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  plan_id TEXT NOT NULL,
  total_amount REAL NOT NULL,
  total_tasks INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  high_risk_addresses TEXT NOT NULL, -- JSON 字符串
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  strategy_id TEXT,
  plan_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'deposit' | 'claim' | 'enclave_deposit' | 'enclave_withdraw' | 'normal'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  scheduled_time INTEGER NOT NULL,
  source_address TEXT NOT NULL,
  target_address TEXT,
  amount REAL NOT NULL,
  chain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ready' | 'in_progress' | 'completed' | 'skipped'
  completed_at INTEGER,
  completed_by TEXT,
  notes TEXT,
  steps TEXT, -- JSON 字符串
  related_task_id TEXT,
  deposit_id TEXT,
  commitment TEXT,
  intended_recipients TEXT, -- JSON 字符串
  allocations TEXT, -- JSON 字符串
  final_targets TEXT, -- JSON 字符串
  is_high_risk INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 操作计划表
CREATE TABLE IF NOT EXISTS operation_plans (
  id TEXT PRIMARY KEY, -- strategy_id
  chain_id INTEGER NOT NULL,
  plan_id TEXT NOT NULL,
  total_amount REAL NOT NULL,
  total_transactions INTEGER NOT NULL,
  source_addresses INTEGER NOT NULL,
  transactions TEXT, -- JSON 字符串
  generated_at TEXT NOT NULL,
  strategy_config TEXT NOT NULL, -- JSON 字符串
  strategy_validation TEXT NOT NULL, -- JSON 字符串
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_strategies_chain_id ON strategies(chain_id);
CREATE INDEX IF NOT EXISTS idx_tasks_strategy_id ON tasks(strategy_id);
CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_time ON tasks(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_operation_plans_chain_id ON operation_plans(chain_id);
