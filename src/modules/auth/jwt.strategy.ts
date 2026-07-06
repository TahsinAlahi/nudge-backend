import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiConfigService } from '../api-config/api-config.service';

/**
 * Passport strategy that validates requests by verifying a JWT access token
 * from the Authorization header (Bearer scheme).
 *
 * Delegates user look-up to AuthService.checkValidityOfUser to ensure the
 * account still exists and has not been soft-deleted.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    apiConfigService: ApiConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: apiConfigService.jwtAccessSecret,
    });
  }

  /**
   * Called by Passport after the JWT has been verified.
   * The returned user object is automatically attached to `request.user`.
   *
   * @param payload - Decoded JWT payload containing sub (user id) and email.
   * @returns The user object without the password field.
   * @throws {HttpException} 401 - If the user no longer exists or was soft-deleted.
   */
  async validate(payload: { sub: string; email: string }) {
    const user = await this.authService.checkValidityOfUser(payload.sub);

    if (!user) {
      throw new HttpException("User doesn't exist", HttpStatus.UNAUTHORIZED);
    }
    return user;
  }
}
