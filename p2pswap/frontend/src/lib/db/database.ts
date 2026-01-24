import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// 数据库文件路径：项目根目录下的 data 文件夹
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? path.join(process.cwd(), 'data', 'p2pswap.db')
  : path.join(process.cwd(), 'data', 'p2pswap.db')

// 确保数据目录存在
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// 初始化数据库
export function initDatabase(): Database.Database {
  const db = new Database(DB_PATH)
  
  // 启用外键约束
  db.pragma('foreign_keys = ON')
  
  // 读取并执行 schema
  const schemaPath = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql')
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)
  } else {
    // 如果文件不存在，直接执行 SQL
    db.exec(`
      CREATE TABLE IF NOT EXISTS strategies (
        id TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        total_amount REAL NOT NULL,
        total_tasks INTEGER NOT NULL,
        generated_at TEXT NOT NULL,
        high_risk_addresses TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        strategy_id TEXT,
        plan_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        scheduled_time INTEGER NOT NULL,
        source_address TEXT NOT NULL,
        target_address TEXT,
        amount REAL NOT NULL,
        chain TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        completed_at INTEGER,
        completed_by TEXT,
        notes TEXT,
        steps TEXT,
        related_task_id TEXT,
        deposit_id TEXT,
        commitment TEXT,
        intended_recipients TEXT,
        allocations TEXT,
        final_targets TEXT,
        is_high_risk INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS operation_plans (
        id TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        total_amount REAL NOT NULL,
        total_transactions INTEGER NOT NULL,
        source_addresses INTEGER NOT NULL,
        transactions TEXT,
        generated_at TEXT NOT NULL,
        strategy_config TEXT NOT NULL,
        strategy_validation TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS task_chain_reviews (
        chain_root_task_id TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        approved_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        reviewed_by TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_strategies_chain_id ON strategies(chain_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_strategy_id ON tasks(strategy_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_time ON tasks(scheduled_time);
      CREATE INDEX IF NOT EXISTS idx_operation_plans_chain_id ON operation_plans(chain_id);
      CREATE INDEX IF NOT EXISTS idx_task_chain_reviews_chain_id ON task_chain_reviews(chain_id);
    `)
  }
  
  return db
}

// 获取数据库实例（单例模式）
let dbInstance: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    dbInstance = initDatabase()
  } else {
    // 确保表存在（即使数据库实例已存在，也要检查表）
    try {
      dbInstance.prepare('SELECT 1 FROM task_chain_reviews LIMIT 1').get()
    } catch (error: any) {
      // 如果表不存在，重新初始化数据库
      if (error.message && error.message.includes('no such table')) {
        console.warn('[数据库] task_chain_reviews 表不存在，重新初始化数据库')
        dbInstance.close()
        dbInstance = null
        dbInstance = initDatabase()
      } else {
        throw error
      }
    }
  }
  return dbInstance
}

// 关闭数据库连接
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
