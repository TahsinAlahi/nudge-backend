import { Global, Module } from '@nestjs/common';
import { ApiConfigService } from './api-config.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  providers: [ApiConfigService],
  imports: [ConfigModule],
  exports: [ApiConfigService],
})
export class ApiConfigModule {}
