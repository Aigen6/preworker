import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('pool_statistics')
@Index(['poolChainId', 'date'], { unique: true })
export class PoolStatistics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pool_chain_id', type: 'integer' })
  poolChainId: number;

  @Column({ name: 'pool_contract_address', type: 'varchar', length: 42 })
  poolContractAddress: string;

  @Column({ name: 'pool_name', type: 'varchar', length: 255 })
  poolName: string;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  @Column({ name: 'hour', type: 'integer' })
  hour: number; // 0-23

  // Deposited events
  @Column({ name: 'deposit_count', type: 'integer', default: 0 })
  depositCount: number;

  @Column({ name: 'total_deposit_amount', type: 'varchar', length: 100 })
  totalDepositAmount: string; // wei as string

  // Claimed events
  @Column({ name: 'claim_count', type: 'integer', default: 0 })
  claimCount: number;

  @Column({ name: 'total_claim_amount', type: 'varchar', length: 100 })
  totalClaimAmount: string; // wei as string

  // Recovered events
  @Column({ name: 'recover_count', type: 'integer', default: 0 })
  recoverCount: number;

  @Column({ name: 'total_recover_amount', type: 'varchar', length: 100 })
  totalRecoverAmount: string; // wei as string

  // Backend statistics (from API)
  @Column({ name: 'backend_deposit_count', type: 'integer', default: 0 })
  backendDepositCount: number;

  @Column({ name: 'backend_total_deposit_amount', type: 'varchar', length: 100 })
  backendTotalDepositAmount: string; // wei as string

  @Column({ name: 'backend_withdraw_count', type: 'integer', default: 0 })
  backendWithdrawCount: number;

  @Column({ name: 'backend_total_withdraw_amount', type: 'varchar', length: 100 })
  backendTotalWithdrawAmount: string; // wei as string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
