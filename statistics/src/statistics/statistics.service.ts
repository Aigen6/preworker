import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { PoolStatistics } from '../database/entities/pool-statistics.entity';
import { DepositVaultEvent } from '../database/entities/deposit-vault-event.entity';
import { BackendApiService } from '../backend/backend-api.service';
import { BigNumber } from 'ethers';
import { DeploymentConfigService } from '../config/deployment-config.service';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  constructor(
    @InjectRepository(PoolStatistics)
    private poolStatsRepository: Repository<PoolStatistics>,
    @InjectRepository(DepositVaultEvent)
    private depositVaultEventRepository: Repository<DepositVaultEvent>,
    private backendApiService: BackendApiService,
    private deploymentConfigService: DeploymentConfigService,
  ) {}

  /**
   * Aggregate data from all pools and backend for the current hour
   */
  async aggregateHourlyStatistics(): Promise<void> {
    this.logger.log('Starting hourly statistics aggregation...');

    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hour = now.getHours();

    try {
      // Get all pools from deployment config
      const pools = this.deploymentConfigService.loadPoolsFromDeployment();
      if (pools.length === 0) {
        this.logger.warn('No pools found in deployment config');
        return;
      }

      // Get backend statistics for today
      const backendStats = await this.backendApiService.getTodayStats();

      // Calculate time range for current hour (UTC)
      const hourStart = new Date(now);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const hourStartTimestamp = Math.floor(hourStart.getTime() / 1000);
      const hourEndTimestamp = Math.floor(hourEnd.getTime() / 1000);

      // Process each pool
      for (const pool of pools) {
        if (!pool.contractAddress) {
          this.logger.warn(`Skipping pool ${pool.name} - no contract address`);
          continue;
        }

        try {
          // Get events from database for current hour
          const events = await this.getEventsFromDatabase(
            pool.chainId,
            pool.contractAddress,
            hourStartTimestamp,
            hourEndTimestamp,
          );

          this.logger.log(
            `Found ${events.length} events for pool ${pool.name} (${pool.chainId}) in hour ${hour}:00`,
          );

          // Aggregate pool events
          const poolStats = this.aggregatePoolEvents(events, pool, date, hour);

          // Get backend stats for this chain (if available)
          const backendStatsForChain = this.getBackendStatsForChain(
            pool.chainId,
            backendStats,
          );

          // Merge pool and backend statistics
          const mergedStats = this.mergeStatistics(
            poolStats,
            backendStatsForChain,
            pool,
            date,
            hour,
          );

          // Save or update statistics
          await this.saveStatistics(mergedStats);

          this.logger.log(
            `✅ Aggregated statistics for pool ${pool.name} (${pool.chainId})`,
          );
        } catch (error) {
          this.logger.error(
            `Error processing pool ${pool.name}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log('✅ Hourly statistics aggregation completed');
    } catch (error) {
      this.logger.error(
        `Error in hourly statistics aggregation: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get events from database for a specific time range
   */
  private async getEventsFromDatabase(
    chainId: number,
    contractAddress: string,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<DepositVaultEvent[]> {
    return await this.depositVaultEventRepository.find({
      where: {
        chainId,
        contractAddress: contractAddress.toLowerCase(),
        blockTimestamp: Between(startTimestamp, endTimestamp - 1), // endTimestamp is exclusive
      },
      order: {
        blockNumber: 'ASC',
        logIndex: 'ASC',
      },
    });
  }

  /**
   * Aggregate events from a pool
   */
  private aggregatePoolEvents(
    events: DepositVaultEvent[],
    pool: { chainId: number; contractAddress: string; name: string },
    date: string,
    hour: number,
  ): Partial<PoolStatistics> {
    let depositCount = 0;
    let totalDepositAmount = BigNumber.from(0);
    let claimCount = 0;
    let totalClaimAmount = BigNumber.from(0);
    let recoverCount = 0;
    let totalRecoverAmount = BigNumber.from(0);

    for (const event of events) {
      switch (event.eventType) {
        case 'Deposited':
          depositCount++;
          if (event.amount) {
            totalDepositAmount = totalDepositAmount.add(
              BigNumber.from(event.amount),
            );
          }
          break;
        case 'Claimed':
          claimCount++;
          if (event.amount) {
            totalClaimAmount = totalClaimAmount.add(
              BigNumber.from(event.amount),
            );
          }
          break;
        case 'Recovered':
          recoverCount++;
          if (event.amount) {
            totalRecoverAmount = totalRecoverAmount.add(
              BigNumber.from(event.amount),
            );
          }
          break;
      }
    }

    return {
      poolChainId: pool.chainId,
      poolContractAddress: pool.contractAddress,
      poolName: pool.name,
      date,
      hour,
      depositCount,
      totalDepositAmount: totalDepositAmount.toString(),
      claimCount,
      totalClaimAmount: totalClaimAmount.toString(),
      recoverCount,
      totalRecoverAmount: totalRecoverAmount.toString(),
    };
  }

  /**
   * Get backend statistics for a specific chain
   * Note: Backend stats are aggregated across all addresses, so we use them as-is
   */
  private getBackendStatsForChain(
    chainId: number,
    backendStats: {
      deposits: any[];
      withdraws: any[];
    },
  ): {
    depositCount: number;
    totalDepositAmount: string;
    withdrawCount: number;
    totalWithdrawAmount: string;
  } {
    // For now, we aggregate all backend stats regardless of chain
    // In the future, we might need to filter by chain if backend provides chain-specific stats
    const depositCount = backendStats.deposits.reduce(
      (sum, stat) => sum + (stat.deposit_count || 0),
      0,
    );
    const totalDepositAmount = backendStats.deposits.reduce(
      (sum, stat) => {
        const amount = BigNumber.from(stat.total_gross_amount || '0');
        return sum.add(amount);
      },
      BigNumber.from(0),
    );

    const withdrawCount = backendStats.withdraws.reduce(
      (sum, stat) => sum + (stat.withdraw_count || 0),
      0,
    );
    const totalWithdrawAmount = backendStats.withdraws.reduce(
      (sum, stat) => {
        const amount = BigNumber.from(stat.total_amount || '0');
        return sum.add(amount);
      },
      BigNumber.from(0),
    );

    return {
      depositCount,
      totalDepositAmount: totalDepositAmount.toString(),
      withdrawCount,
      totalWithdrawAmount: totalWithdrawAmount.toString(),
    };
  }

  /**
   * Merge pool and backend statistics
   */
  private mergeStatistics(
    poolStats: Partial<PoolStatistics>,
    backendStats: {
      depositCount: number;
      totalDepositAmount: string;
      withdrawCount: number;
      totalWithdrawAmount: string;
    },
    pool: { chainId: number; contractAddress: string; name: string },
    date: string,
    hour: number,
  ): PoolStatistics {
    const stats = new PoolStatistics();
    stats.poolChainId = pool.chainId;
    stats.poolContractAddress = pool.contractAddress;
    stats.poolName = pool.name;
    stats.date = date;
    stats.hour = hour;
    stats.depositCount = poolStats.depositCount || 0;
    stats.totalDepositAmount = poolStats.totalDepositAmount || '0';
    stats.claimCount = poolStats.claimCount || 0;
    stats.totalClaimAmount = poolStats.totalClaimAmount || '0';
    stats.recoverCount = poolStats.recoverCount || 0;
    stats.totalRecoverAmount = poolStats.totalRecoverAmount || '0';
    stats.backendDepositCount = backendStats.depositCount;
    stats.backendTotalDepositAmount = backendStats.totalDepositAmount;
    stats.backendWithdrawCount = backendStats.withdrawCount;
    stats.backendTotalWithdrawAmount = backendStats.totalWithdrawAmount;

    return stats;
  }

  /**
   * Save or update statistics
   */
  private async saveStatistics(stats: PoolStatistics): Promise<void> {
    const existing = await this.poolStatsRepository.findOne({
      where: {
        poolChainId: stats.poolChainId,
        date: stats.date,
        hour: stats.hour,
      },
    });

    if (existing) {
      // Update existing record
      Object.assign(existing, stats);
      await this.poolStatsRepository.save(existing);
      this.logger.log(
        `Updated statistics for pool ${stats.poolName} at ${stats.date} ${stats.hour}:00`,
      );
    } else {
      // Create new record
      await this.poolStatsRepository.save(stats);
      this.logger.log(
        `Created statistics for pool ${stats.poolName} at ${stats.date} ${stats.hour}:00`,
      );
    }
  }

  /**
   * Get statistics for a date range
   */
  async getStatistics(
    poolChainId?: number,
    startDate?: string,
    endDate?: string,
  ): Promise<PoolStatistics[]> {
    const query = this.poolStatsRepository.createQueryBuilder('stats');

    if (poolChainId) {
      query.where('stats.poolChainId = :poolChainId', { poolChainId });
    }

    if (startDate) {
      query.andWhere('stats.date >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('stats.date <= :endDate', { endDate });
    }

    query.orderBy('stats.date', 'DESC').addOrderBy('stats.hour', 'DESC');

    return query.getMany();
  }

}
