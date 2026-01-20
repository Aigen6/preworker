import { IsString, IsNumber, IsOptional, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderDto {
  @IsString()
  provider: 'catfee' | 'gasstation' | 'tronfuel' | 'tronxenergy';

  @IsString()
  receiverAddress: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  energyAmount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bandwidthAmount: number;

  @IsOptional()
  @IsString()
  duration?: string; // '10m', '1h', '24h'

  @IsOptional()
  @IsBoolean()
  useDirectPayment?: boolean; // 可选：是否使用"一单一付"模式（/v1/mate/open/transaction），强制用户直接支付
}
