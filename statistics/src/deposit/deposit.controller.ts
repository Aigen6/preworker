import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { DepositService, CreateDepositInThisServerDto } from './deposit.service';

@Controller('api')
export class DepositController {
  constructor(private depositService: DepositService) {}

  /**
   * POST /api/deposit-in-this-server
   * 前端调用此接口记录本机服务输入的deposit
   */
  @Post('deposit-in-this-server')
  async createDepositInThisServer(
    @Body() dto: CreateDepositInThisServerDto,
  ) {
    try {
      const deposit = await this.depositService.createDepositInThisServer(dto);
      return {
        success: true,
        data: deposit,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /api/deposit-in-this-server
   * 查询本机服务输入的deposit列表
   */
  @Get('deposit-in-this-server')
  async getDepositsInThisServer(
    @Query('chainId') chainId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const chainIdNum = chainId ? parseInt(chainId, 10) : undefined;
    const deposits = await this.depositService.getDepositsInThisServer(
      chainIdNum,
      startDate,
      endDate,
    );
    return {
      success: true,
      data: deposits,
    };
  }
}
