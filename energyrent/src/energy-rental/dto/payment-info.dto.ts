import { IsString, IsNumber } from 'class-validator';

export class PaymentInfoDto {
  @IsString()
  paymentAddress: string;

  @IsNumber()
  paymentAmount: number; // TRX

  @IsNumber()
  paymentAmountSun: number; // SUN (1 TRX = 1,000,000 SUN)

  @IsString()
  paymentMemo: string;

  @IsString()
  orderId: string;

  @IsString()
  provider: string;
}
