import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 本机服务输入的 Deposit 记录实体
 * 用于记录通过前端 POST /api/deposit-in-this-server 提交的存款记录
 */
@Entity('deposit_in_this_server')
@Index(['chainId', 'checkbookId'], { unique: true })
@Index(['chainId', 'createdAt'])
export class DepositInThisServer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId: number;

  @Column({ name: 'checkbook_id', type: 'varchar', length: 255 })
  checkbookId: string; // Backend Checkbook ID

  @Column({ name: 'deposit_tx_hash', type: 'varchar', length: 66, nullable: true })
  depositTxHash?: string;

  @Column({ name: 'deposit_amount', type: 'varchar', length: 100, nullable: true })
  depositAmount?: string; // wei as string

  @Column({ name: 'token_address', type: 'varchar', length: 42, nullable: true })
  tokenAddress?: string;

  @Column({ name: 'user_address', type: 'varchar', length: 255, nullable: true })
  userAddress?: string; // Universal Address or EOA address

  @Column({ name: 'source', type: 'varchar', length: 50, default: 'frontend' })
  source: string; // 来源：frontend, api, etc.

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // 额外的元数据

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
