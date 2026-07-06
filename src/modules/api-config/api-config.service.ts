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
    return this.configService.getOrThrow('nodeEnv') === 'development';
  }

  get jwtAccessSecret(): string {
    return this.configService.getOrThrow('jwt.secret');
  }

  get jwtRefreshSecret(): string {
    return this.configService.getOrThrow('jwt.refreshSecret');
  }

  get dbUrl(): string {
    return this.configService.getOrThrow('database.url');
  }
}
