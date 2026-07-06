import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { UserRequest } from '@/common/decorators/current-user.decorator';

/**
 * REST controller for authentication-related endpoints.
 *
 * Routes: register, login, refresh, logout are annotated with `@Public()` and bypass
 * the global JwtAuthGuard. The profile route requires a valid JWT access token.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new user account and returns an access + refresh token pair.
   *
   * @param dto - Registration payload (name, email, password, avatar).
   * @returns The created user profile along with accessToken and refreshToken.
   */
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Authenticates an existing user with email and password.
   *
   * @param dto - Login credentials (email, password).
   * @returns An accessToken and a refreshToken.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Exchanges a valid refresh token for a new access + refresh token pair.
   * The old refresh token is revoked (rotation).
   *
   * @param dto - Object containing the refresh token to redeem.
   * @returns A new accessToken and refreshToken.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  /**
   * Revokes a refresh token so it can no longer be used.
   *
   * @param dto - Object containing the refresh token to revoke.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * Returns the currently authenticated user's profile.
   * The password field is stripped from the response.
   *
   * @param user - The authenticated user injected by the `@CurrentUser()` decorator.
   * @returns The user object without the password field.
   */
  @HttpCode(HttpStatus.OK)
  @Get('profile')
  async profile(@CurrentUser() user: UserRequest) {
    return this.authService.profile({
      id: user?.id,
    });
  }
}
