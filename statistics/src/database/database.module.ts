import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PoolStatistics } from './entities/pool-statistics.entity';
import { DepositVaultEvent } from './entities/deposit-vault-event.entity';
import { MatchingAnalysis } from './entities/matching-analysis.entity';
import { DepositInThisServer } from './entities/deposit-in-this-server.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const password = configService.get<string>('database.password');
        // 确保密码始终是字符串类型，如果未设置则使用空字符串
        const dbPassword = password !== undefined && password !== null ? String(password) : '';
        
        return {
          type: 'postgres',
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: dbPassword,
          database: configService.get<string>('database.database'),
          entities: [PoolStatistics, DepositVaultEvent, MatchingAnalysis, DepositInThisServer],
          synchronize: process.env.NODE_ENV !== 'production', // Auto-sync schema in dev
          logging: process.env.NODE_ENV === 'development',
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([PoolStatistics, DepositVaultEvent, MatchingAnalysis, DepositInThisServer]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
