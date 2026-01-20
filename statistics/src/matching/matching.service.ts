import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { DepositVaultEvent } from '../database/entities/deposit-vault-event.entity';
import { MatchingAnalysis } from '../database/entities/matching-analysis.entity';
import { BackendApiService } from '../backend/backend-api.service';
import { DepositService } from '../deposit/deposit.service';
import { BigNumber } from 'ethers';

/**
 * 匹配分析结果接口
 */
export interface MatchingResult {
  // 1. 预处理池进入的数据
  poolDeposits: DepositVaultEvent[];
  // 2. 预处理池提取的数据
  poolWithdraws: DepositVaultEvent[];
  // 3. 后端存入的数据（区分本机和非本机）
  backendDeposits: any[];
  backendDepositsInThisServer: any[]; // 本机服务输入的
  backendDepositsNotInThisServer: any[]; // 非本机服务输入的（链上查询到的，但本机没有记录）
  // 4. 后端提取的数据
  backendWithdraws: any[];
  // 5. 匹配关系：哪些后端存入是从预处理池提取的
  poolToBackendDepositMatches: Array<{
    poolEvent: DepositVaultEvent;
    backendDeposit: any;
    confidence: number;
    reason: string;
    isInThisServer: boolean; // 是否本机服务输入的
  }>;
  // 6. 跨链提取：哪些后端提取是跨链的
  crossChainWithdraws: Array<{
    withdraw: any;
    executeChainId: number;
    payoutChainId: number;
  }>;
  // 未匹配的数据
  unmatchedPoolWithdraws: DepositVaultEvent[];
  unmatchedBackendDeposits: any[];
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectRepository(DepositVaultEvent)
    private depositVaultEventRepository: Repository<DepositVaultEvent>,
    @InjectRepository(MatchingAnalysis)
    private matchingAnalysisRepository: Repository<MatchingAnalysis>,
    private backendApiService: BackendApiService,
    private depositService: DepositService,
  ) {}

  /**
   * 执行匹配分析
   * @param startDate 开始日期 (YYYY-MM-DD)
   * @param endDate 结束日期 (YYYY-MM-DD)
   * @param chainId 可选的链ID过滤
   */
  async analyzeMatching(
    startDate: string,
    endDate: string,
    chainId?: number,
  ): Promise<MatchingResult> {
    this.logger.log(
      `开始匹配分析: ${startDate} 到 ${endDate}${chainId ? ` (链ID: ${chainId})` : ''}`,
    );

    // 转换日期为时间戳
    const startTimestamp = Math.floor(
      new Date(startDate + 'T00:00:00Z').getTime() / 1000,
    );
    const endTimestamp = Math.floor(
      new Date(endDate + 'T23:59:59Z').getTime() / 1000,
    );

    // 1. 获取预处理池存入事件
    const poolDeposits = await this.getPoolDeposits(
      startTimestamp,
      endTimestamp,
      chainId,
    );

    // 2. 获取预处理池提取事件（Claimed + Recovered）
    const poolWithdraws = await this.getPoolWithdraws(
      startTimestamp,
      endTimestamp,
      chainId,
    );

    // 3. 获取后端存入数据
    const backendDeposits = await this.backendApiService.getCheckbookList(
      startDate,
      endDate,
      chainId,
    );

    // 3.1 区分本机和非本机服务输入的checkbook
    const depositsInThisServerSet = await this.depositService.batchCheckDepositsInThisServer(
      backendDeposits.map((d) => ({
        chainId: d.slip44ChainId || d.slip44_chain_id || d.chainId || chainId || 0,
        checkbookId: d.id,
      })),
    );

    const backendDepositsInThisServer: any[] = [];
    const backendDepositsNotInThisServer: any[] = [];

    for (const deposit of backendDeposits) {
      const depositChainId = deposit.slip44ChainId || deposit.slip44_chain_id || deposit.chainId || chainId || 0;
      const key = `${depositChainId}:${deposit.id}`;
      if (depositsInThisServerSet.has(key)) {
        backendDepositsInThisServer.push(deposit);
      } else {
        backendDepositsNotInThisServer.push(deposit);
      }
    }

    // 4. 获取后端提取数据
    const backendWithdraws = await this.backendApiService.getWithdrawList(
      startDate,
      endDate,
      chainId,
    );

    // 5. 匹配：预处理池提取 → 后端存入
    const poolToBackendDepositMatches = await this.matchPoolWithdrawToBackendDeposit(
      poolWithdraws,
      backendDeposits,
    );

    // 6. 识别跨链提取
    const crossChainWithdraws = this.identifyCrossChainWithdraws(
      backendWithdraws,
    );

    // 找出未匹配的数据
    const matchedPoolEventIds = new Set(
      poolToBackendDepositMatches.map((m) => m.poolEvent.id),
    );
    const unmatchedPoolWithdraws = poolWithdraws.filter(
      (w) => !matchedPoolEventIds.has(w.id),
    );

    const matchedBackendDepositIds = new Set(
      poolToBackendDepositMatches.map((m) => m.backendDeposit.id),
    );
    const unmatchedBackendDeposits = backendDeposits.filter(
      (d) => !matchedBackendDepositIds.has(d.id),
    );

    const result: MatchingResult = {
      poolDeposits,
      poolWithdraws,
      backendDeposits,
      backendDepositsInThisServer,
      backendDepositsNotInThisServer,
      backendWithdraws,
      poolToBackendDepositMatches,
      crossChainWithdraws,
      unmatchedPoolWithdraws,
      unmatchedBackendDeposits,
    };

    // 保存匹配结果到数据库
    await this.saveMatchingResults(result, startDate, endDate, chainId);

    this.logger.log(
      `匹配分析完成: 预处理池存入${poolDeposits.length}条, 预处理池提取${poolWithdraws.length}条, 后端存入${backendDeposits.length}条(本机${backendDepositsInThisServer.length}条, 非本机${backendDepositsNotInThisServer.length}条), 后端提取${backendWithdraws.length}条, 匹配${poolToBackendDepositMatches.length}条, 跨链${crossChainWithdraws.length}条`,
    );

    return result;
  }

  /**
   * 获取预处理池存入事件
   */
  private async getPoolDeposits(
    startTimestamp: number,
    endTimestamp: number,
    chainId?: number,
  ): Promise<DepositVaultEvent[]> {
    const where: any = {
      eventType: 'Deposited',
      blockTimestamp: Between(startTimestamp, endTimestamp),
    };
    if (chainId) {
      where.chainId = chainId;
    }

    return await this.depositVaultEventRepository.find({
      where,
      order: { blockTimestamp: 'ASC' },
    });
  }

  /**
   * 获取预处理池提取事件（Claimed + Recovered）
   */
  private async getPoolWithdraws(
    startTimestamp: number,
    endTimestamp: number,
    chainId?: number,
  ): Promise<DepositVaultEvent[]> {
    const where: any = {
      eventType: In(['Claimed', 'Recovered']),
      blockTimestamp: Between(startTimestamp, endTimestamp),
    };
    if (chainId) {
      where.chainId = chainId;
    }

    return await this.depositVaultEventRepository.find({
      where,
      order: { blockTimestamp: 'ASC' },
    });
  }

  /**
   * 匹配预处理池提取到后端存入
   * 匹配策略：
   * 1. 金额匹配（允许小误差）
   * 2. 时间匹配（预处理池提取时间 <= 后端存入时间，且时间差在合理范围内）
   * 3. 地址匹配（如果可用）
   */
  private async matchPoolWithdrawToBackendDeposit(
    poolWithdraws: DepositVaultEvent[],
    backendDeposits: any[],
  ): Promise<Array<{
    poolEvent: DepositVaultEvent;
    backendDeposit: any;
    confidence: number;
    reason: string;
    isInThisServer: boolean;
  }>> {
    const matches: Array<{
      poolEvent: DepositVaultEvent;
      backendDeposit: any;
      confidence: number;
      reason: string;
      isInThisServer: boolean;
    }> = [];

    // 批量检查所有backendDeposits是否在本机服务中有记录
    const depositsInThisServerSet = await this.depositService.batchCheckDepositsInThisServer(
      backendDeposits.map((d) => ({
        chainId: d.slip44ChainId || d.slip44_chain_id || d.chainId || 0,
        checkbookId: d.id,
      })),
    );

    const AMOUNT_TOLERANCE = BigNumber.from('1000000000000000'); // 0.001 ETH/BSC (允许小误差)
    const TIME_TOLERANCE = 3600 * 24; // 24小时内的匹配

    for (const poolEvent of poolWithdraws) {
      if (!poolEvent.amount) continue;

      const poolAmount = BigNumber.from(poolEvent.amount);
      const poolTimestamp = poolEvent.blockTimestamp;

      let bestMatch: {
        backendDeposit: any;
        confidence: number;
        reason: string;
      } | null = null;

      for (const backendDeposit of backendDeposits) {
        // 获取后端存入金额（可能是grossAmount或allocatableAmount）
        const backendAmountStr =
          backendDeposit.grossAmount ||
          backendDeposit.allocatableAmount ||
          backendDeposit.depositAmount ||
          '0';
        const backendAmount = BigNumber.from(backendAmountStr);

        // 获取后端存入时间戳
        const backendTimestamp =
          backendDeposit.createdAt ||
          backendDeposit.depositBlockNumber ||
          0;
        // 如果是日期字符串，转换为时间戳
        let backendTimestampNum: number;
        if (typeof backendTimestamp === 'string') {
          backendTimestampNum = Math.floor(
            new Date(backendTimestamp).getTime() / 1000,
          );
        } else {
          backendTimestampNum = backendTimestamp;
        }

        // 金额匹配检查
        const amountDiff = poolAmount.sub(backendAmount).abs();
        if (amountDiff.gt(AMOUNT_TOLERANCE)) {
          continue; // 金额差异太大
        }

        // 时间匹配检查
        // 预处理池提取应该在后端存入之前或相近时间
        const timeDiff = backendTimestampNum - poolTimestamp;
        if (timeDiff < 0 || timeDiff > TIME_TOLERANCE) {
          continue; // 时间不匹配
        }

        // 计算匹配置信度
        let confidence = 100;
        const amountMatchRatio = amountDiff.mul(100).div(poolAmount).toNumber();
        confidence -= amountMatchRatio; // 金额差异越小，置信度越高

        const timeMatchRatio = (timeDiff / TIME_TOLERANCE) * 100;
        confidence -= timeMatchRatio; // 时间差异越小，置信度越高

        // 地址匹配（如果可用）
        if (
          poolEvent.recipient &&
          backendDeposit.owner &&
          poolEvent.recipient.toLowerCase() ===
            backendDeposit.owner.toLowerCase()
        ) {
          confidence += 20; // 地址匹配增加置信度
        }

        confidence = Math.max(0, Math.min(100, confidence));

        if (!bestMatch || confidence > bestMatch.confidence) {
          const reasons: string[] = [];
          if (amountDiff.eq(0)) {
            reasons.push('金额完全匹配');
          } else {
            reasons.push(`金额差异: ${amountDiff.toString()}`);
          }
          if (timeDiff < 60) {
            reasons.push('时间差小于1分钟');
          } else if (timeDiff < 3600) {
            reasons.push('时间差小于1小时');
          } else {
            reasons.push(`时间差: ${Math.floor(timeDiff / 3600)}小时`);
          }
          if (
            poolEvent.recipient &&
            backendDeposit.owner &&
            poolEvent.recipient.toLowerCase() ===
              backendDeposit.owner.toLowerCase()
          ) {
            reasons.push('地址匹配');
          }

          bestMatch = {
            backendDeposit,
            confidence,
            reason: reasons.join(', '),
          };
        }
      }

      if (bestMatch && bestMatch.confidence >= 50) {
        // 检查是否在本机服务中有记录
        const depositChainId = bestMatch.backendDeposit.slip44ChainId || 
          bestMatch.backendDeposit.slip44_chain_id || 
          bestMatch.backendDeposit.chainId || 0;
        const key = `${depositChainId}:${bestMatch.backendDeposit.id}`;
        const isInThisServer = depositsInThisServerSet.has(key);

        // 置信度 >= 50% 才认为是有效匹配
        matches.push({
          poolEvent,
          backendDeposit: bestMatch.backendDeposit,
          confidence: bestMatch.confidence,
          reason: bestMatch.reason,
          isInThisServer,
        });
      }
    }

    return matches;
  }

  /**
   * 识别跨链提取
   * 如果 executeChainId != payoutChainId，则为跨链提取
   */
  private identifyCrossChainWithdraws(backendWithdraws: any[]): Array<{
    withdraw: any;
    executeChainId: number;
    payoutChainId: number;
  }> {
    const crossChainWithdraws: Array<{
      withdraw: any;
      executeChainId: number;
      payoutChainId: number;
    }> = [];

    for (const withdraw of backendWithdraws) {
      const executeChainId =
        withdraw.executeChainId ||
        withdraw.execute_chain_id ||
        withdraw.chainId;
      const payoutChainId =
        withdraw.payoutChainId ||
        withdraw.payout_chain_id ||
        withdraw.targetChainId ||
        withdraw.target_chain_id;

      if (
        executeChainId &&
        payoutChainId &&
        executeChainId !== payoutChainId
      ) {
        crossChainWithdraws.push({
          withdraw,
          executeChainId: Number(executeChainId),
          payoutChainId: Number(payoutChainId),
        });
      }
    }

    return crossChainWithdraws;
  }

  /**
   * 保存匹配结果到数据库
   */
  private async saveMatchingResults(
    result: MatchingResult,
    startDate: string,
    endDate: string,
    chainId?: number,
  ): Promise<void> {
    const analyses: MatchingAnalysis[] = [];

    // 保存预处理池存入
    for (const deposit of result.poolDeposits) {
      const analysis = new MatchingAnalysis();
      analysis.analysisDate = startDate;
      analysis.chainId = deposit.chainId;
      analysis.poolEventId = deposit.id;
      analysis.poolEventType = 'Deposited';
      analysis.poolEventTxHash = deposit.transactionHash;
      analysis.poolEventTimestamp = deposit.blockTimestamp;
      analysis.poolEventAmount = deposit.amount;
      analysis.matchType = 'pool_deposit';
      analysis.isMatched = false;
      analysis.isCrossChain = false;
      analyses.push(analysis);
    }

    // 保存预处理池提取
    for (const withdraw of result.poolWithdraws) {
      const analysis = new MatchingAnalysis();
      analysis.analysisDate = startDate;
      analysis.chainId = withdraw.chainId;
      analysis.poolEventId = withdraw.id;
      analysis.poolEventType = withdraw.eventType;
      analysis.poolEventTxHash = withdraw.transactionHash;
      analysis.poolEventTimestamp = withdraw.blockTimestamp;
      analysis.poolEventAmount = withdraw.amount;
      analysis.poolEventRecipient = withdraw.recipient;
      analysis.matchType = 'pool_withdraw';
      analysis.isMatched = false;
      analysis.isCrossChain = false;
      analyses.push(analysis);
    }

    // 保存匹配关系
    for (const match of result.poolToBackendDepositMatches) {
      const analysis = new MatchingAnalysis();
      analysis.analysisDate = startDate;
      analysis.chainId = match.poolEvent.chainId;
      analysis.poolEventId = match.poolEvent.id;
      analysis.poolEventType = match.poolEvent.eventType;
      analysis.poolEventTxHash = match.poolEvent.transactionHash;
      analysis.poolEventTimestamp = match.poolEvent.blockTimestamp;
      analysis.poolEventAmount = match.poolEvent.amount;
      analysis.poolEventRecipient = match.poolEvent.recipient;
      analysis.backendDepositId = match.backendDeposit.id;
      analysis.backendDepositTxHash =
        match.backendDeposit.depositTxHash ||
        match.backendDeposit.deposit_tx_hash;
      analysis.backendDepositTimestamp =
        match.backendDeposit.createdAt ||
        match.backendDeposit.created_at ||
        0;
      analysis.backendDepositAmount =
        match.backendDeposit.grossAmount ||
        match.backendDeposit.allocatableAmount ||
        match.backendDeposit.depositAmount;
      analysis.backendDepositChainId =
        match.backendDeposit.slip44ChainId ||
        match.backendDeposit.slip44_chain_id ||
        match.backendDeposit.chainId;
      analysis.matchType = 'pool_to_backend_deposit';
      analysis.isMatched = true;
      analysis.matchConfidence = match.confidence;
      analysis.matchReason = match.reason + (match.isInThisServer ? ' (本机服务输入)' : ' (非本机服务输入)');
      analysis.isCrossChain = false;
      analyses.push(analysis);
    }

    // 保存跨链提取
    for (const crossChain of result.crossChainWithdraws) {
      const analysis = new MatchingAnalysis();
      analysis.analysisDate = startDate;
      analysis.chainId = crossChain.executeChainId;
      analysis.backendWithdrawId = crossChain.withdraw.id;
      analysis.backendWithdrawTxHash =
        crossChain.withdraw.payoutTxHash ||
        crossChain.withdraw.payout_tx_hash;
      analysis.backendWithdrawTimestamp =
        crossChain.withdraw.payoutCompletedAt ||
        crossChain.withdraw.payout_completed_at ||
        0;
      analysis.backendWithdrawAmount = crossChain.withdraw.amount;
      analysis.backendWithdrawExecuteChainId = crossChain.executeChainId;
      analysis.backendWithdrawPayoutChainId = crossChain.payoutChainId;
      analysis.matchType = 'backend_withdraw_cross_chain';
      analysis.isMatched = false;
      analysis.isCrossChain = true;
      analyses.push(analysis);
    }

    // 批量保存
    if (analyses.length > 0) {
      await this.matchingAnalysisRepository.save(analyses);
      this.logger.log(`已保存 ${analyses.length} 条匹配分析结果`);
    }
  }

  /**
   * 查询匹配分析结果
   */
  async getMatchingResults(
    startDate?: string,
    endDate?: string,
    chainId?: number,
    matchType?: string,
  ): Promise<MatchingAnalysis[]> {
    const query = this.matchingAnalysisRepository.createQueryBuilder('analysis');

    if (startDate) {
      query.andWhere('analysis.analysisDate >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('analysis.analysisDate <= :endDate', { endDate });
    }
    if (chainId) {
      query.andWhere('analysis.chainId = :chainId', { chainId });
    }
    if (matchType) {
      query.andWhere('analysis.matchType = :matchType', { matchType });
    }

    query.orderBy('analysis.analysisDate', 'DESC').addOrderBy('analysis.createdAt', 'DESC');

    return query.getMany();
  }
}
