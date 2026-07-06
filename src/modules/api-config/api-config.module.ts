import { Global, Module } from '@nestjs/common';
import { ApiConfigService } from './api-config.service';
import { ConfigModule } from '@nestjs/config';

/**
 * Global module that provides ApiConfigService throughout the application.
 *
 * Marked `@Global()` so individual modules do not need to re-import it.
 * Re-exports ConfigModule so downstream modules can access ConfigService
 * directly if needed.
 */
@Global()
@Module({
  providers: [ApiConfigService],
  imports: [ConfigModule],
  exports: [ApiConfigService],
})
export class ApiConfigModule {}
