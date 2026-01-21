-- Create multisig_proposals table
CREATE TABLE IF NOT EXISTS multisig_proposals (
    id BIGSERIAL PRIMARY KEY,
    proposal_id VARCHAR(66) NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL,
    type VARCHAR(20) NOT NULL,
    request_id VARCHAR(66),
    event_tx_hash VARCHAR(66),
    target VARCHAR(66) NOT NULL,
    value VARCHAR(78) NOT NULL,
    data TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    proposer VARCHAR(66) NOT NULL,
    signature_count INTEGER DEFAULT 0,
    required_signatures INTEGER NOT NULL,
    rejection_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline TIMESTAMP,
    executed_at TIMESTAMP,
    expired_at TIMESTAMP,
    execute_tx_hash VARCHAR(66),
    execute_block_number BIGINT,
    success BOOLEAN,
    return_data TEXT,
    error_reason TEXT,
    multisig_address VARCHAR(66) NOT NULL,
    metadata JSONB,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_multisig_proposals_chain_id ON multisig_proposals(chain_id);
CREATE INDEX idx_multisig_proposals_type ON multisig_proposals(type);
CREATE INDEX idx_multisig_proposals_status ON multisig_proposals(status);
CREATE INDEX idx_multisig_proposals_request_id ON multisig_proposals(request_id);
CREATE INDEX idx_multisig_proposals_event_tx_hash ON multisig_proposals(event_tx_hash);
CREATE INDEX idx_multisig_proposals_execute_tx_hash ON multisig_proposals(execute_tx_hash);
CREATE INDEX idx_multisig_proposals_multisig_address ON multisig_proposals(multisig_address);
CREATE INDEX idx_multisig_proposals_created_at ON multisig_proposals(created_at DESC);

-- Create multisig_proposal_signatures table
CREATE TABLE IF NOT EXISTS multisig_proposal_signatures (
    id BIGSERIAL PRIMARY KEY,
    proposal_id VARCHAR(66) NOT NULL,
    signer VARCHAR(66) NOT NULL,
    chain_id BIGINT NOT NULL,
    tx_hash VARCHAR(66),
    block_number BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proposal_id, signer)
);

-- Create indexes
CREATE INDEX idx_multisig_signatures_proposal_id ON multisig_proposal_signatures(proposal_id);
CREATE INDEX idx_multisig_signatures_signer ON multisig_proposal_signatures(signer);
CREATE INDEX idx_multisig_signatures_chain_id ON multisig_proposal_signatures(chain_id);
CREATE INDEX idx_multisig_signatures_tx_hash ON multisig_proposal_signatures(tx_hash);

-- Create multisig_executions table
CREATE TABLE IF NOT EXISTS multisig_executions (
    id BIGSERIAL PRIMARY KEY,
    proposal_id VARCHAR(66) NOT NULL,
    chain_id BIGINT NOT NULL,
    execute_tx_hash VARCHAR(66) NOT NULL UNIQUE,
    execute_block_number BIGINT NOT NULL,
    success BOOLEAN NOT NULL,
    return_data TEXT,
    error_reason TEXT,
    gas_used VARCHAR(78),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_multisig_executions_proposal_id ON multisig_executions(proposal_id);
CREATE INDEX idx_multisig_executions_chain_id ON multisig_executions(chain_id);
CREATE INDEX idx_multisig_executions_created_at ON multisig_executions(created_at DESC);
















