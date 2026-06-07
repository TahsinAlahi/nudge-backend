import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get port(): number {
    return this.configService.getOrThrow('port');
  }

  get nodeEnv(): string {
    return this.configService.getOrThrow('nodeEnv');
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }
}
