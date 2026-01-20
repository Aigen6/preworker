import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StatisticsService } from './statistics.service';

@Injectable()
export class StatisticsScheduler {
  private readonly logger = new Logger(StatisticsScheduler.name);

  constructor(private statisticsService: StatisticsService) {}

  /**
   * Run every hour at minute 0
   * Example: 00:00, 01:00, 02:00, etc.
   */
  @Cron('0 * * * *')
  async handleHourlyStatistics() {
    this.logger.log('🕐 Hourly statistics aggregation triggered');
    try {
      await this.statisticsService.aggregateHourlyStatistics();
    } catch (error) {
      this.logger.error(
        `❌ Error in hourly statistics aggregation: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Optional: Run immediately on startup for testing
   */
  // @Cron(CronExpression.EVERY_SECOND) // For testing only
  // async handleTest() {
  //   this.logger.log('🧪 Test aggregation');
  //   await this.handleHourlyStatistics();
  // }
}
