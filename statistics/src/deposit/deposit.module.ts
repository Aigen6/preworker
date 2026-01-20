import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { DepositInThisServer } from '../database/entities/deposit-in-this-server.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DepositInThisServer])],
  providers: [DepositService],
  controllers: [DepositController],
  exports: [DepositService],
})
export class DepositModule {}
