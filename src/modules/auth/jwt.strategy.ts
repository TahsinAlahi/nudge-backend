import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiConfigService } from '../api-config/api-config.service';

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

  async validate(payload: { sub: string; email: string }) {
    const user = await this.authService.checkValidityOfUser(payload.sub);

    if (!user) {
      throw new HttpException("User doesn't exist", HttpStatus.UNAUTHORIZED);
    }
    return user;
  }
}
