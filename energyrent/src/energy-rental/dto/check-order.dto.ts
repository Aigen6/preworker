import { IsString } from 'class-validator';

export class CheckOrderDto {
  @IsString()
  provider: 'catfee' | 'gasstation' | 'tronfuel' | 'tronxenergy';

  @IsString()
  orderId: string;
}
