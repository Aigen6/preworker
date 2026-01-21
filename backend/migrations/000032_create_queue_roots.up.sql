-- Create queue_roots table
CREATE TABLE IF NOT EXISTS queue_roots (
    id VARCHAR(255) PRIMARY KEY,
    root VARCHAR(66) NOT NULL,
    previous_root VARCHAR(66),
    is_recent_root BOOLEAN DEFAULT FALSE,
    created_by_commitment VARCHAR(66),
    block_number BIGINT,
    chain_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(root, chain_id)
);

-- Create indexes for queue_roots
CREATE INDEX IF NOT EXISTS idx_queue_roots_root ON queue_roots(root);
CREATE INDEX IF NOT EXISTS idx_queue_roots_previous_root ON queue_roots(previous_root);
CREATE INDEX IF NOT EXISTS idx_queue_roots_commitment ON queue_roots(created_by_commitment);
CREATE INDEX IF NOT EXISTS idx_queue_roots_is_recent ON queue_roots(is_recent_root);
CREATE INDEX IF NOT EXISTS idx_queue_roots_created_at ON queue_roots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_roots_chain_id ON queue_roots(chain_id);

