import { Module } from '@nestjs/common';
import { BackendApiService } from './backend-api.service';

@Module({
  providers: [BackendApiService],
  exports: [BackendApiService],
})
export class BackendModule {}
