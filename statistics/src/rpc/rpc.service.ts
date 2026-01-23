import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { DepositVaultABI } from './abis/deposit-vault.abi';
import { DeploymentConfigService } from '../config/deployment-config.service';

export interface PoolEvent {
  type: 'Deposited' | 'Claimed' | 'Recovered';
  blockNumber: number;
  transactionHash: string;
  depositor?: string;
  depositId?: string;
  token?: string;
  amount?: string;
  yieldToken?: string;
  yieldAmount?: string;
  intendedRecipient?: string;
  recipient?: string;
  timestamp: number;
}

export interface PoolConfig {
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  name: string;
}

@Injectable()
export class RpcService {
  private readonly logger = new Logger(RpcService.name);
  private providers: Map<number, ethers.JsonRpcProvider> = new Map();

  constructor(
    private configService: ConfigService,
    private deploymentConfigService: DeploymentConfigService,
  ) {}

  /**
   * Get provider for a specific chain
   */
  private getProvider(chainId: number): ethers.JsonRpcProvider {
    if (!this.providers.has(chainId)) {
      const pools = this.configService.get<PoolConfig[]>('pools');
      const pool = pools.find((p) => p.chainId === chainId);
      if (!pool) {
        throw new Error(`Pool not found for chain ID: ${chainId}`);
      }
      this.providers.set(chainId, new ethers.JsonRpcProvider(pool.rpcUrl));
    }
    return this.providers.get(chainId);
  }

  /**
   * Get current block number for a chain
   */
  async getCurrentBlockNumber(chainId: number): Promise<number> {
    const provider = this.getProvider(chainId);
    return await provider.getBlockNumber();
  }

  /**
   * Get events from a pool contract
   * @param pool Pool configuration
   * @param fromBlock Starting block (inclusive). If not provided, will use lastSyncedBlock from sync state
   * @param toBlock Ending block (inclusive). If not provided, will use currentBlock - 50
   * @param lastSyncedBlock Last synced block number (exclusive, events will start from this block)
   */
  async getPoolEvents(
    pool: PoolConfig,
    fromBlock?: number,
    toBlock?: number,
    lastSyncedBlock?: number,
  ): Promise<PoolEvent[]> {
    try {
      const provider = this.getProvider(pool.chainId);
      const contract = new ethers.Contract(
        pool.contractAddress,
        DepositVaultABI,
        provider,
      );

      const currentBlock = await provider.getBlockNumber();
      const SAFE_BLOCK_OFFSET = 50; // 安全区块偏移量，确保不查询太新的区块

      // 确定查询范围
      if (!fromBlock) {
        // 如果没有指定起始区块，使用上次同步的区块（如果存在）
        fromBlock = lastSyncedBlock !== undefined ? lastSyncedBlock : 0;
      }

      if (!toBlock) {
        // 结束区块必须是当前区块减去安全偏移量，确保不超过当前最新区块-50
        toBlock = Math.max(0, currentBlock - SAFE_BLOCK_OFFSET);
      } else {
        // 如果指定了结束区块，也要确保不超过安全范围
        toBlock = Math.min(toBlock, currentBlock - SAFE_BLOCK_OFFSET);
      }

      // 确保 fromBlock <= toBlock
      if (fromBlock > toBlock) {
        this.logger.warn(
          `No new blocks to sync for pool ${pool.name} (${pool.chainId}). Last synced: ${fromBlock}, Safe end: ${toBlock}`,
        );
        return [];
      }

      this.logger.log(
        `Fetching events from pool ${pool.name} (${pool.chainId}) blocks ${fromBlock} to ${toBlock} (current: ${currentBlock})`,
      );

      // Fetch all three event types
      const depositedFilter = contract.filters.Deposited();
      const claimedFilter = contract.filters.Claimed();
      const recoveredFilter = contract.filters.Recovered();

      const [depositedEvents, claimedEvents, recoveredEvents] =
        await Promise.all([
          contract.queryFilter(depositedFilter, fromBlock, toBlock),
          contract.queryFilter(claimedFilter, fromBlock, toBlock),
          contract.queryFilter(recoveredFilter, fromBlock, toBlock),
        ]);

      const events: PoolEvent[] = [];

      // Process Deposited events
      for (const event of depositedEvents) {
        // Type guard for EventLog
        if ('args' in event && event.args) {
          const eventLog = event as ethers.EventLog;
          const block = await provider.getBlock(event.blockNumber);
          events.push({
            type: 'Deposited',
            blockNumber: event.blockNumber,
            transactionHash: eventLog.transactionHash,
            depositor: eventLog.args.depositor,
            depositId: eventLog.args.depositId?.toString(),
            token: eventLog.args.token,
            amount: eventLog.args.amount?.toString(),
            yieldToken: eventLog.args.yieldToken,
            yieldAmount: eventLog.args.yieldAmount?.toString(),
            intendedRecipient: eventLog.args.intendedRecipient,
            timestamp: block?.timestamp || Date.now() / 1000,
          });
        }
      }

      // Process Claimed events
      for (const event of claimedEvents) {
        // Type guard for EventLog
        if ('args' in event && event.args) {
          const eventLog = event as ethers.EventLog;
          const block = await provider.getBlock(event.blockNumber);
          events.push({
            type: 'Claimed',
            blockNumber: event.blockNumber,
            transactionHash: eventLog.transactionHash,
            depositor: eventLog.args.depositor,
            depositId: eventLog.args.depositId?.toString(),
            recipient: eventLog.args.recipient,
            yieldToken: eventLog.args.yieldToken,
            amount: eventLog.args.amount?.toString(),
            timestamp: block?.timestamp || Date.now() / 1000,
          });
        }
      }

      // Process Recovered events
      for (const event of recoveredEvents) {
        // Type guard for EventLog
        if ('args' in event && event.args) {
          const eventLog = event as ethers.EventLog;
          const block = await provider.getBlock(event.blockNumber);
          events.push({
            type: 'Recovered',
            blockNumber: event.blockNumber,
            transactionHash: eventLog.transactionHash,
            depositor: eventLog.args.depositor,
            depositId: eventLog.args.depositId?.toString(),
            yieldToken: eventLog.args.yieldToken,
            amount: eventLog.args.amount?.toString(),
            timestamp: block?.timestamp || Date.now() / 1000,
          });
        }
      }

      this.logger.log(
        `Found ${events.length} events from pool ${pool.name} (${depositedEvents.length} Deposited, ${claimedEvents.length} Claimed, ${recoveredEvents.length} Recovered)`,
      );

      return events;
    } catch (error) {
      this.logger.error(
        `Error fetching events from pool ${pool.name}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }


  /**
   * Get all pools configuration
   * Priority: 1. Deployment files, 2. Environment variables
   */
  getPools(): PoolConfig[] {
    const autoLoad = this.configService.get<boolean>(
      'autoLoadPoolsFromDeployment',
      true,
    );

    if (autoLoad) {
      // Try to load from deployment files first
      const poolsFromDeployment =
        this.deploymentConfigService.loadPoolsFromDeployment();
      if (poolsFromDeployment.length > 0) {
        this.logger.log(
          `✅ 从部署文件加载了 ${poolsFromDeployment.length} 个池配置`,
        );
        return poolsFromDeployment;
      }
    }

    // Fallback to environment variables
    const envPools = this.configService.get<PoolConfig[]>('pools', []);
    this.logger.log(`使用环境变量配置的 ${envPools.length} 个池`);
    return envPools;
  }
}
