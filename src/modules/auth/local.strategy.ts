import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Passport strategy that authenticates users with email and password.
 *
 * Not currently wired into the auth flow (login in AuthService handles
 * credentials directly). Available for use with Passport's local strategy
 * chain if needed in the future.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  /**
   * Validates the user's email and password against the database.
   *
   * @param email    - The user's email address.
   * @param password - The raw password to verify.
   * @returns The user object without the password field.
   * @throws {HttpException} 401 - If the credentials are invalid or the user is deleted.
   */
  async validate(email: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
    return user;
  }
}
