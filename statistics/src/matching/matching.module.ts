import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { MatchingAnalysis } from '../database/entities/matching-analysis.entity';
import { DepositVaultEvent } from '../database/entities/deposit-vault-event.entity';
import { BackendModule } from '../backend/backend.module';
import { DepositModule } from '../deposit/deposit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchingAnalysis, DepositVaultEvent]),
    BackendModule,
    DepositModule,
  ],
  providers: [MatchingService],
  controllers: [MatchingController],
  exports: [MatchingService],
})
export class MatchingModule {}
