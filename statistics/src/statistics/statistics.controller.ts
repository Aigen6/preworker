import { Controller, Get, Query } from '@nestjs/common';
import { StatisticsService } from './statistics.service';

@Controller('statistics')
export class StatisticsController {
  constructor(private statisticsService: StatisticsService) {}

  @Get('pools')
  async getPoolStatistics(
    @Query('chainId') chainId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const chainIdNum = chainId ? parseInt(chainId, 10) : undefined;
    return this.statisticsService.getStatistics(chainIdNum, startDate, endDate);
  }
}
