import { Module, Global } from '@nestjs/common';
import { DeploymentConfigService } from './deployment-config.service';

@Global()
@Module({
  providers: [DeploymentConfigService],
  exports: [DeploymentConfigService],
})
export class ConfigModule {}
