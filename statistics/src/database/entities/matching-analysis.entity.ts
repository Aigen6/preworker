import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 匹配分析结果实体
 * 用于存储预处理池和Backend数据的匹配关系
 */
@Entity('matching_analysis')
@Index(['analysisDate', 'chainId'])
@Index(['poolEventId', 'backendDepositId'])
@Index(['poolEventId', 'backendWithdrawId'])
export class MatchingAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 分析时间范围
  @Column({ name: 'analysis_date', type: 'date' })
  analysisDate: string; // YYYY-MM-DD

  @Column({ name: 'chain_id', type: 'integer' })
  chainId: number;

  // ============ 预处理池事件 ============
  @Column({ name: 'pool_event_id', type: 'uuid', nullable: true })
  poolEventId?: string; // DepositVaultEvent.id

  @Column({ name: 'pool_event_type', type: 'varchar', length: 50, nullable: true })
  poolEventType?: 'Deposited' | 'Claimed' | 'Recovered';

  @Column({ name: 'pool_event_tx_hash', type: 'varchar', length: 66, nullable: true })
  poolEventTxHash?: string;

  @Column({ name: 'pool_event_timestamp', type: 'bigint', nullable: true })
  poolEventTimestamp?: number;

  @Column({ name: 'pool_event_amount', type: 'varchar', length: 100, nullable: true })
  poolEventAmount?: string;

  @Column({ name: 'pool_event_recipient', type: 'varchar', length: 42, nullable: true })
  poolEventRecipient?: string; // Claimed/Recovered的接收地址

  // ============ Backend 存入 (Checkbook) ============
  @Column({ name: 'backend_deposit_id', type: 'varchar', length: 255, nullable: true })
  backendDepositId?: string; // Checkbook ID

  @Column({ name: 'backend_deposit_tx_hash', type: 'varchar', length: 66, nullable: true })
  backendDepositTxHash?: string;

  @Column({ name: 'backend_deposit_timestamp', type: 'bigint', nullable: true })
  backendDepositTimestamp?: number;

  @Column({ name: 'backend_deposit_amount', type: 'varchar', length: 100, nullable: true })
  backendDepositAmount?: string;

  @Column({ name: 'backend_deposit_chain_id', type: 'integer', nullable: true })
  backendDepositChainId?: number;

  // ============ Backend 提取 (Withdraw) ============
  @Column({ name: 'backend_withdraw_id', type: 'varchar', length: 255, nullable: true })
  backendWithdrawId?: string; // WithdrawRequest ID

  @Column({ name: 'backend_withdraw_tx_hash', type: 'varchar', length: 66, nullable: true })
  backendWithdrawTxHash?: string;

  @Column({ name: 'backend_withdraw_timestamp', type: 'bigint', nullable: true })
  backendWithdrawTimestamp?: number;

  @Column({ name: 'backend_withdraw_amount', type: 'varchar', length: 100, nullable: true })
  backendWithdrawAmount?: string;

  @Column({ name: 'backend_withdraw_execute_chain_id', type: 'integer', nullable: true })
  backendWithdrawExecuteChainId?: number; // executeChainId

  @Column({ name: 'backend_withdraw_payout_chain_id', type: 'integer', nullable: true })
  backendWithdrawPayoutChainId?: number; // payoutChainId

  // ============ 匹配结果 ============
  @Column({ name: 'match_type', type: 'varchar', length: 50 })
  matchType:
    | 'pool_deposit' // 预处理池存入
    | 'pool_withdraw' // 预处理池提取
    | 'backend_deposit' // 后端存入
    | 'backend_withdraw' // 后端提取
    | 'pool_to_backend_deposit' // 预处理池提取 → 后端存入（匹配）
    | 'backend_withdraw_cross_chain'; // 后端提取跨链（executeChainId != payoutChainId）

  @Column({ name: 'is_matched', type: 'boolean', default: false })
  isMatched: boolean; // 是否匹配成功

  @Column({ name: 'match_confidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  matchConfidence?: number; // 匹配置信度 (0-100)

  @Column({ name: 'match_reason', type: 'text', nullable: true })
  matchReason?: string; // 匹配原因说明

  @Column({ name: 'is_cross_chain', type: 'boolean', default: false })
  isCrossChain: boolean; // 是否跨链（用于后端提取）

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
