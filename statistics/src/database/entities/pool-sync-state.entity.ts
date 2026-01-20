import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 记录每个池的最后同步区块高度
 */
@Entity('pool_sync_state')
@Index(['poolChainId', 'poolContractAddress'], { unique: true })
export class PoolSyncState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pool_chain_id', type: 'integer' })
  poolChainId: number;

  @Column({ name: 'pool_contract_address', type: 'varchar', length: 42 })
  poolContractAddress: string;

  @Column({ name: 'pool_name', type: 'varchar', length: 255 })
  poolName: string;

  /**
   * 最后同步到的区块高度（不包含，下次从该区块开始）
   */
  @Column({ name: 'last_synced_block', type: 'bigint' })
  lastSyncedBlock: number;

  /**
   * 最后同步时间
   */
  @Column({ name: 'last_synced_at', type: 'timestamp' })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
