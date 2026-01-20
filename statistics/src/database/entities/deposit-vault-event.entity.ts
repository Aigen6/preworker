import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * DepositVault 事件实体
 * 对应 Blockscanner 扫描并存储到数据库的事件
 */
@Entity('deposit_vault_events')
@Index(['chainId', 'contractAddress', 'blockNumber', 'logIndex'])
@Index(['chainId', 'eventType', 'blockTimestamp'])
export class DepositVaultEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId: number;

  @Column({ name: 'contract_address', type: 'varchar', length: 42 })
  contractAddress: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: 'Deposited' | 'Claimed' | 'Recovered';

  @Column({ name: 'block_number', type: 'bigint' })
  blockNumber: number;

  @Column({ name: 'transaction_hash', type: 'varchar', length: 66 })
  transactionHash: string;

  @Column({ name: 'log_index', type: 'integer' })
  logIndex: number;

  @Column({ name: 'block_timestamp', type: 'bigint' })
  blockTimestamp: number;

  // Deposited 事件字段
  @Column({ name: 'depositor', type: 'varchar', length: 42, nullable: true })
  depositor?: string;

  @Column({ name: 'deposit_id', type: 'bigint', nullable: true })
  depositId?: number;

  @Column({ name: 'token', type: 'varchar', length: 42, nullable: true })
  token?: string;

  @Column({ name: 'amount', type: 'varchar', length: 100, nullable: true })
  amount?: string;

  @Column({ name: 'yield_token', type: 'varchar', length: 42, nullable: true })
  yieldToken?: string;

  @Column({ name: 'yield_amount', type: 'varchar', length: 100, nullable: true })
  yieldAmount?: string;

  @Column({ name: 'intended_recipient', type: 'varchar', length: 42, nullable: true })
  intendedRecipient?: string;

  // Claimed/Recovered 事件字段
  @Column({ name: 'recipient', type: 'varchar', length: 42, nullable: true })
  recipient?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
