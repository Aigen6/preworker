import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { PoolStatistics } from '../database/entities/pool-statistics.entity';
import { DepositVaultEvent } from '../database/entities/deposit-vault-event.entity';
import { BackendModule } from '../backend/backend.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PoolStatistics, DepositVaultEvent]),
    BackendModule,
    ConfigModule,
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
