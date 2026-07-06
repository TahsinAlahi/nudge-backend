import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Typed wrapper around NestJS ConfigService.
 *
 * Provides strongly-typed getters for environment variables used across
 * the application. Uses getOrThrow so missing required variables fail fast
 * during bootstrap rather than producing cryptic runtime errors.
 */
@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  /**
   * The port the HTTP server listens on.
   *
   * @returns Port number, defaults to 3000 in configuration.ts.
   */
  get port(): number {
    return this.configService.getOrThrow('port');
  }

  /**
   * The current Node environment.
   *
   * @returns 'development', 'production', or 'test'.
   */
  get nodeEnv(): string {
    return this.configService.getOrThrow('nodeEnv');
  }

  /**
   * Whether the app is running in development mode.
   *
   * @returns true if nodeEnv is 'development'.
   */
  get isDevelopment(): boolean {
    return this.configService.getOrThrow('nodeEnv') === 'development';
  }

  /**
   * The JWT secret used to sign access tokens.
   *
   * @returns The value of JWT_SECRET from the environment.
   */
  get jwtAccessSecret(): string {
    return this.configService.getOrThrow('jwt.secret');
  }

  /**
   * The JWT secret used for refresh token operations.
   *
   * @returns The value of JWT_REFRESH_SECRET from the environment.
   */
  get jwtRefreshSecret(): string {
    return this.configService.getOrThrow('jwt.refreshSecret');
  }

  /**
   * The PostgreSQL connection string.
   *
   * @returns The DATABASE_URL value from the environment.
   */
  get dbUrl(): string {
    return this.configService.getOrThrow('database.url');
  }
}
