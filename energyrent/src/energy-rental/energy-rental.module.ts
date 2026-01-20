import { Module } from '@nestjs/common';
import { EnergyRentalController } from './energy-rental.controller';
import { EnergyRentalService } from './energy-rental.service';
import { CatFeeService } from './providers/catfee.service';
import { GasStationService } from './providers/gasstation.service';
import { TronFuelService } from './providers/tronfuel.service';
import { TronXEnergyService } from './providers/tronxenergy.service';

@Module({
  controllers: [EnergyRentalController],
  providers: [
    EnergyRentalService,
    CatFeeService,
    GasStationService,
    TronFuelService,
    TronXEnergyService,
  ],
  exports: [EnergyRentalService],
})
export class EnergyRentalModule {}
