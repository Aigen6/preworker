import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EstimateRentalDto {
  @IsString()
  provider: 'catfee' | 'gasstation' | 'tronfuel' | 'tronxenergy';

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
}
