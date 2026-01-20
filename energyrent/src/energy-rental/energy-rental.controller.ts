import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { EnergyRentalService } from './energy-rental.service';
import { CatFeeService } from './providers/catfee.service';
import { EstimateRentalDto } from './dto/estimate-rental.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckOrderDto } from './dto/check-order.dto';

@Controller('api/energy-rental')
export class EnergyRentalController {
  constructor(
    private readonly energyRentalService: EnergyRentalService,
    private readonly catFeeService: CatFeeService,
  ) {}

  /**
   * 估算租赁费用
   * GET /api/energy-rental/estimate?provider=catfee&energyAmount=131000&bandwidthAmount=600&duration=1h
   */
  @Get('estimate')
  async estimate(@Query() dto: EstimateRentalDto) {
    return this.energyRentalService.estimate(
      dto.provider,
      dto.energyAmount,
      dto.bandwidthAmount,
      dto.duration,
    );
  }

  /**
   * 创建租赁订单
   * POST /api/energy-rental/order
   */
  @Post('order')
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.energyRentalService.createOrder(
      dto.provider,
      dto.receiverAddress,
      dto.energyAmount,
      dto.bandwidthAmount,
      dto.duration,
      dto.useDirectPayment, // 传递 useDirectPayment 参数
    );
  }

  /**
   * 查询订单状态
   * GET /api/energy-rental/order/:provider/:orderId
   */
  @Get('order/:provider/:orderId')
  async checkOrderStatus(
    @Param('provider') provider: string,
    @Param('orderId') orderId: string,
  ) {
    return this.energyRentalService.checkOrderStatus(
      provider as any,
      orderId,
    );
  }

  /**
   * 获取支付信息（用于直接支付）
   * GET /api/energy-rental/payment/:provider/:orderId
   */
  @Get('payment/:provider/:orderId')
  async getPaymentInfo(
    @Param('provider') provider: string,
    @Param('orderId') orderId: string,
  ) {
    try {
      const order = await this.energyRentalService.checkOrderStatus(
        provider as any,
        orderId,
      );

      // 检查支付信息是否可用
      // 注意：对于 CatFee API 模式（billing_type: "API"），paymentAddress 可能为空
      // 因为费用是从账户余额扣除的，不需要用户直接支付
      // 但 paymentAmount 应该总是有值（从 pay_amount_sun 提取）
      if (!order.paymentAmount || order.paymentAmount <= 0) {
        console.error('订单支付信息不可用:', {
          provider,
          orderId,
          hasPaymentAddress: !!order.paymentAddress,
          paymentAmount: order.paymentAmount,
          order: JSON.stringify(order, null, 2),
        });
        throw new Error(
          `订单支付信息不可用。` +
          `支付金额: ${order.paymentAmount || 0} TRX。` +
          `请稍后重试或联系客服。`
        );
      }

      // 如果是 CatFee API 模式且没有支付地址，说明是从账户余额扣除
      // 这种情况下，用户无法直接支付，需要特殊处理
      if (!order.paymentAddress && provider === 'catfee') {
        console.warn('⚠️  CatFee API 模式订单，支付地址为空（从账户余额扣除）:', {
          orderId,
          paymentAmount: order.paymentAmount,
        });
        
        // 对于 API 模式，费用已从账户余额扣除，订单可能已经完成或处理中
        // 返回一个特殊的响应，让前端知道这是 API 模式，不需要用户支付
        return {
          paymentAddress: '', // 空地址表示 API 模式
          paymentAmount: order.paymentAmount, // 显示费用（已从账户扣除）
          paymentAmountSun: Math.floor(order.paymentAmount * 1_000_000),
          paymentMemo: order.paymentMemo || orderId,
          orderId: order.orderId,
          provider: order.provider,
          isApiMode: true, // 标记为 API 模式
          message: '订单已创建，费用已从账户余额扣除，无需用户直接支付',
        };
      }

      return {
        paymentAddress: order.paymentAddress,
        paymentAmount: order.paymentAmount, // TRX
        paymentAmountSun: Math.floor(order.paymentAmount * 1_000_000), // SUN (1 TRX = 1,000,000 SUN)
        paymentMemo: order.paymentMemo || orderId,
        orderId: order.orderId,
        provider: order.provider,
      };
    } catch (error: any) {
      console.error('获取支付信息失败:', {
        provider,
        orderId,
        error: error.message,
        stack: error.stack,
      });
      // 重新抛出错误，让 NestJS 的异常过滤器处理
      throw error;
    }
  }

  /**
   * 提交支付哈希（用于 CatFee 一单一付模式）
   * POST /api/energy-rental/payment/:provider/:orderId/submit
   */
  @Post('payment/:provider/:orderId/submit')
  async submitPaymentHash(
    @Param('provider') provider: string,
    @Param('orderId') orderId: string,
    @Body() body: { paymentHash: string },
  ) {
    if (provider !== 'catfee') {
      throw new Error('只有 CatFee 支持提交支付哈希');
    }

    if (!body.paymentHash) {
      throw new Error('支付哈希不能为空');
    }

    const catFeeService = (this.energyRentalService as any).catFeeService;
    await catFeeService.submitPaymentHash(orderId, body.paymentHash);

    return {
      success: true,
      message: '支付哈希提交成功',
    };
  }
}
