import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  @Get()
  async check() {
    try {
      // 检查数据库连接
      const isConnected = this.connection.isConnected;
      if (!isConnected) {
        throw new HttpException(
          {
            status: 'error',
            timestamp: new Date().toISOString(),
            service: 'statistics',
            database: 'disconnected',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // 执行简单的数据库查询以验证连接
      await this.connection.query('SELECT 1');

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'statistics',
        database: 'connected',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          timestamp: new Date().toISOString(),
          service: 'statistics',
          database: 'error',
          error: error.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
