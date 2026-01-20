import { Injectable } from '@nestjs/common';
import { CatFeeService } from './providers/catfee.service';
import { GasStationService } from './providers/gasstation.service';
import { TronFuelService } from './providers/tronfuel.service';
import { TronXEnergyService } from './providers/tronxenergy.service';
import type { RentalEstimate, RentalOrder, RentalProvider } from './interfaces/rental.interface';

@Injectable()
export class EnergyRentalService {
  constructor(
    private readonly catFeeService: CatFeeService,
    private readonly gasStationService: GasStationService,
    private readonly tronFuelService: TronFuelService,
    private readonly tronXEnergyService: TronXEnergyService,
  ) {}

  /**
   * 获取服务提供商实例
   */
  private getProvider(provider: RentalProvider) {
    switch (provider) {
      case 'catfee':
        return this.catFeeService;
      case 'gasstation':
        return this.gasStationService;
      case 'tronfuel':
        return this.tronFuelService;
      case 'tronxenergy':
        return this.tronXEnergyService;
      default:
        throw new Error(`不支持的服务提供商: ${provider}`);
    }
  }

  /**
   * 估算租赁费用
   */
  async estimate(
    provider: RentalProvider,
    energyAmount: number,
    bandwidthAmount: number,
    duration?: string,
  ): Promise<RentalEstimate> {
    const providerService = this.getProvider(provider);
    return providerService.estimate(energyAmount, bandwidthAmount, duration);
  }

  /**
   * 创建租赁订单
   */
  async createOrder(
    provider: RentalProvider,
    receiverAddress: string,
    energyAmount: number,
    bandwidthAmount: number,
    duration?: string,
    useDirectPayment?: boolean,
  ): Promise<RentalOrder> {
    const providerService = this.getProvider(provider);
    // 只有 CatFee 支持 useDirectPayment 参数
    if (provider === 'catfee' && useDirectPayment) {
      return (providerService as any).createOrder(receiverAddress, energyAmount, bandwidthAmount, duration, useDirectPayment);
    }
    return providerService.createOrder(receiverAddress, energyAmount, bandwidthAmount, duration);
  }

  /**
   * 查询订单状态
   */
  async checkOrderStatus(provider: RentalProvider, orderId: string): Promise<RentalOrder> {
    const providerService = this.getProvider(provider);
    return providerService.checkOrderStatus(orderId);
  }
}
