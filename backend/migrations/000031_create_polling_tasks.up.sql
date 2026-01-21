-- Create polling_tasks table
CREATE TABLE IF NOT EXISTS polling_tasks (
    id VARCHAR(255) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    chain_id BIGINT NOT NULL,
    tx_hash VARCHAR(66),
    target_status VARCHAR(50) NOT NULL,
    current_status VARCHAR(50) NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 180,
    next_poll_at TIMESTAMP NOT NULL,
    poll_interval INTEGER DEFAULT 10,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    last_error TEXT
);

-- Create indexes for polling_tasks
CREATE INDEX IF NOT EXISTS idx_polling_tasks_status_next_poll ON polling_tasks(status, next_poll_at);
CREATE INDEX IF NOT EXISTS idx_polling_tasks_entity ON polling_tasks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_polling_tasks_task_type ON polling_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_polling_tasks_chain_id ON polling_tasks(chain_id);
CREATE INDEX IF NOT EXISTS idx_polling_tasks_tx_hash ON polling_tasks(tx_hash);

