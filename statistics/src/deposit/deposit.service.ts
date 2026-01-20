import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositInThisServer } from '../database/entities/deposit-in-this-server.entity';

export interface CreateDepositInThisServerDto {
  chainId: number;
  checkbookId: string;
  depositTxHash?: string;
  depositAmount?: string;
  tokenAddress?: string;
  userAddress?: string;
  source?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    @InjectRepository(DepositInThisServer)
    private depositInThisServerRepository: Repository<DepositInThisServer>,
  ) {}

  /**
   * 创建本机服务输入的deposit记录
   */
  async createDepositInThisServer(
    dto: CreateDepositInThisServerDto,
  ): Promise<DepositInThisServer> {
    // 检查是否已存在
    const existing = await this.depositInThisServerRepository.findOne({
      where: {
        chainId: dto.chainId,
        checkbookId: dto.checkbookId,
      },
    });

    if (existing) {
      this.logger.log(
        `Deposit记录已存在: chainId=${dto.chainId}, checkbookId=${dto.checkbookId}`,
      );
      return existing;
    }

    const deposit = this.depositInThisServerRepository.create({
      chainId: dto.chainId,
      checkbookId: dto.checkbookId,
      depositTxHash: dto.depositTxHash,
      depositAmount: dto.depositAmount,
      tokenAddress: dto.tokenAddress,
      userAddress: dto.userAddress,
      source: dto.source || 'frontend',
      metadata: dto.metadata,
    });

    const saved = await this.depositInThisServerRepository.save(deposit);
    this.logger.log(
      `✅ 已创建本机服务输入的deposit记录: chainId=${dto.chainId}, checkbookId=${dto.checkbookId}`,
    );

    return saved;
  }

  /**
   * 检查checkbook是否在本机服务中有记录
   */
  async isDepositInThisServer(
    chainId: number,
    checkbookId: string,
  ): Promise<boolean> {
    const count = await this.depositInThisServerRepository.count({
      where: {
        chainId,
        checkbookId,
      },
    });
    return count > 0;
  }

  /**
   * 批量检查checkbook是否在本机服务中有记录
   */
  async batchCheckDepositsInThisServer(
    checkbooks: Array<{ chainId: number; checkbookId: string }>,
  ): Promise<Set<string>> {
    if (checkbooks.length === 0) {
      return new Set();
    }

    const results = await this.depositInThisServerRepository
      .createQueryBuilder('deposit')
      .select(['deposit.chainId', 'deposit.checkbookId'])
      .where(
        checkbooks
          .map(
            (_, index) =>
              `(deposit.chainId = :chainId${index} AND deposit.checkbookId = :checkbookId${index})`,
          )
          .join(' OR '),
        checkbooks.reduce((acc, item, index) => {
          acc[`chainId${index}`] = item.chainId;
          acc[`checkbookId${index}`] = item.checkbookId;
          return acc;
        }, {} as Record<string, any>),
      )
      .getMany();

    return new Set(
      results.map((r) => `${r.chainId}:${r.checkbookId}`),
    );
  }

  /**
   * 获取本机服务输入的deposit列表
   */
  async getDepositsInThisServer(
    chainId?: number,
    startDate?: string,
    endDate?: string,
  ): Promise<DepositInThisServer[]> {
    const query = this.depositInThisServerRepository.createQueryBuilder(
      'deposit',
    );

    if (chainId) {
      query.andWhere('deposit.chainId = :chainId', { chainId });
    }

    if (startDate) {
      query.andWhere('deposit.createdAt >= :startDate', {
        startDate: new Date(startDate + 'T00:00:00Z'),
      });
    }

    if (endDate) {
      query.andWhere('deposit.createdAt <= :endDate', {
        endDate: new Date(endDate + 'T23:59:59Z'),
      });
    }

    query.orderBy('deposit.createdAt', 'DESC');

    return query.getMany();
  }
}
