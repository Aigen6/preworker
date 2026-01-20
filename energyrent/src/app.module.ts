import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnergyRentalModule } from './energy-rental/energy-rental.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../.env'],
    }),
    // 业务模块
    EnergyRentalModule,
  ],
})
export class AppModule {}
