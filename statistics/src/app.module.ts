import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { StatisticsModule } from './statistics/statistics.module';
import { MatchingModule } from './matching/matching.module';
import { DepositModule } from './deposit/deposit.module';
import { HealthModule } from './health/health.module';
import { StatisticsScheduler } from './statistics/statistics.scheduler';
import { ConfigModule } from './config/config.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // Configuration
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../.env'],
    }),
    // Deployment config service
    ConfigModule,
    // Schedule for cron jobs
    ScheduleModule.forRoot(),
    // Database
    DatabaseModule,
    // Business modules
    StatisticsModule,
    MatchingModule,
    DepositModule,
    HealthModule,
  ],
  providers: [StatisticsScheduler],
})
export class AppModule {}
