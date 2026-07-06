import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiConfigService } from '../api-config/api-config.service';

/**
 * AuthModule wires up JWT-based authentication with refresh token support.
 *
 * - PassportModule is configured with 'jwt' as the default strategy.
 * - JwtModule is registered asynchronously using ApiConfigService so secrets
 *   come from validated environment variables.
 * - JwtStrategy and JwtAuthGuard are exported so the global APP_GUARD in
 *   AppModule can consume them.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (apiConfigService: ApiConfigService) => ({
        secret: apiConfigService.jwtAccessSecret,
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ApiConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [JwtStrategy, JwtAuthGuard, PassportModule],
})
export class AuthModule {}
