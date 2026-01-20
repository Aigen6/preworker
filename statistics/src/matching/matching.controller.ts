import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
  constructor(private matchingService: MatchingService) {}

  /**
   * 执行匹配分析
   * GET /matching/analyze?startDate=2024-01-01&endDate=2024-01-31&chainId=56
   */
  @Get('analyze')
  async analyze(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('chainId') chainId?: string,
  ) {
    if (!startDate || !endDate) {
      return {
        success: false,
        error: 'startDate and endDate are required (YYYY-MM-DD)',
      };
    }

    const chainIdNum = chainId ? parseInt(chainId, 10) : undefined;
    return await this.matchingService.analyzeMatching(
      startDate,
      endDate,
      chainIdNum,
    );
  }

  /**
   * 查询匹配分析结果
   * GET /matching/results?startDate=2024-01-01&endDate=2024-01-31&chainId=56&matchType=pool_to_backend_deposit
   */
  @Get('results')
  async getResults(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('chainId') chainId?: string,
    @Query('matchType') matchType?: string,
  ) {
    const chainIdNum = chainId ? parseInt(chainId, 10) : undefined;
    return await this.matchingService.getMatchingResults(
      startDate,
      endDate,
      chainIdNum,
      matchType,
    );
  }

  /**
   * 获取匹配分析摘要
   * GET /matching/summary?startDate=2024-01-01&endDate=2024-01-31&chainId=56
   */
  @Get('summary')
  async getSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('chainId') chainId?: string,
  ) {
    if (!startDate || !endDate) {
      return {
        success: false,
        error: 'startDate and endDate are required (YYYY-MM-DD)',
      };
    }

    const chainIdNum = chainId ? parseInt(chainId, 10) : undefined;
    const result = await this.matchingService.analyzeMatching(
      startDate,
      endDate,
      chainIdNum,
    );

    return {
      success: true,
      summary: {
        poolDepositsCount: result.poolDeposits.length,
        poolWithdrawsCount: result.poolWithdraws.length,
        backendDepositsCount: result.backendDeposits.length,
        backendDepositsInThisServerCount: result.backendDepositsInThisServer.length,
        backendDepositsNotInThisServerCount: result.backendDepositsNotInThisServer.length,
        backendWithdrawsCount: result.backendWithdraws.length,
        matchedCount: result.poolToBackendDepositMatches.length,
        crossChainWithdrawsCount: result.crossChainWithdraws.length,
        unmatchedPoolWithdrawsCount: result.unmatchedPoolWithdraws.length,
        unmatchedBackendDepositsCount: result.unmatchedBackendDeposits.length,
      },
      details: {
        poolToBackendDepositMatches: result.poolToBackendDepositMatches.map(
          (m) => ({
            poolEventId: m.poolEvent.id,
            poolEventTxHash: m.poolEvent.transactionHash,
            poolEventAmount: m.poolEvent.amount,
            backendDepositId: m.backendDeposit.id,
            backendDepositAmount:
              m.backendDeposit.grossAmount ||
              m.backendDeposit.allocatableAmount,
            confidence: m.confidence,
            reason: m.reason,
            isInThisServer: m.isInThisServer,
          }),
        ),
        crossChainWithdraws: result.crossChainWithdraws.map((c) => ({
          withdrawId: c.withdraw.id,
          executeChainId: c.executeChainId,
          payoutChainId: c.payoutChainId,
          amount: c.withdraw.amount,
        })),
      },
    };
  }
}
