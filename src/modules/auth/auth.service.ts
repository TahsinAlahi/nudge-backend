import { PrismaService } from '@/prisma/prisma.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { User } from '@/generated/prisma/client';
import * as crypto from 'node:crypto';

export type JwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  /**
   * Looks up a user by email and verifies the password with bcrypt.
   * Only returns non-deleted users.
   *
   * @param email   - The user's email address.
   * @param password - The raw password to compare against the stored hash.
   * @returns The full User object (including password) if found and valid, otherwise null.
   */
  private async validateUserData(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, isDeleted: false },
    });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      return user;
    }
    return null;
  }

  /**
   * Strips the password field from a User object for safe serialization.
   *
   * @param user - The full User object retrieved from the database.
   * @returns The user object with the password property omitted.
   */
  private removePasswordFromUser(user: User): Omit<User, 'password'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  /**
   * Validates email + password. Used by the Passport LocalStrategy.
   *
   * @param email    - The user's email address.
   * @param password - The raw password to verify.
   * @returns The user object without the password, or null if credentials are invalid or the user is soft-deleted.
   */
  async validateUser(
    email: string,
    password: string
  ): Promise<null | Omit<User, 'password'>> {
    const user = await this.validateUserData(email, password);
    if (!user) return user;
    if (user.isDeleted) return null;
    return this.removePasswordFromUser(user);
  }

  /**
   * Verifies a user still exists and is not deleted.
   * Invoked by JwtStrategy on every authenticated request.
   *
   * @param id - The user's UUID.
   * @returns The user object without the password, or null if the user was removed or soft-deleted.
   */
  async checkValidityOfUser(
    id: string
  ): Promise<null | Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.isDeleted) return null;

    return this.removePasswordFromUser(user);
  }

  /**
   * Signs a JWT access token. Expiry is configured via JwtModule.registerAsync in the module.
   *
   * @param payload - The claims to embed in the token (sub, email).
   * @returns A signed JWT string.
   */
  private generateToken(payload: JwtPayload) {
    return this.jwtService.sign(payload);
  }

  /**
   * Generates an opaque refresh token: random bytes → hex string, hashed with SHA-256 before storage.
   * Only the hash is persisted so a database leak does not expose usable tokens.
   *
   * @param payload - Contains the user id (`sub`) for the token owner.
   * @returns The raw (unhashed) token string to return to the client.
   */
  private async generateRefreshToken(payload: JwtPayload) {
    const token = crypto.randomBytes(40).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        token: hashedToken,
        userId: payload.sub,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return token;
  }

  /**
   * Creates a new user account and issues a token pair.
   * The bcrypt hash is computed before the transaction to keep the database lock brief.
   *
   * @param dto - Registration data (name, email, password, avatar).
   * @returns The created user, an access token, and a refresh token.
   * @throws {HttpException} 409 - If the email is already registered.
   */
  async register(dto: RegisterDto) {
    const saltRounds = 10;
    const encryptedPassword = await bcrypt.hash(dto.password, saltRounds);

    const result = await this.prisma.$transaction(async (tx) => {
      const doesUserExist = await tx.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });

      if (doesUserExist) {
        throw new HttpException('Email is already in use', HttpStatus.CONFLICT);
      }

      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: encryptedPassword,
          avatar: dto.avatar,
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          createdAt: true,
        },
      });

      const payload: JwtPayload = { sub: user.id, email: user.email };
      const accessToken = this.generateToken(payload);

      const token = crypto.randomBytes(40).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      await tx.refreshToken.create({
        data: {
          token: hashedToken,
          userId: payload.sub,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return { user, accessToken, refreshToken: token };
    });

    return result;
  }

  /**
   * Authenticates a user with email and password.
   *
   * @param dto - Login credentials (email, password).
   * @returns An access token and a refresh token.
   * @throws {HttpException} 401 - If the email or password is incorrect.
   */
  async login(dto: LoginDto) {
    const user = await this.validateUserData(dto.email, dto.password);
    if (!user) {
      throw new HttpException('Invalid Credentials', HttpStatus.UNAUTHORIZED);
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: this.generateToken(payload),
      refreshToken: await this.generateRefreshToken(payload),
    };
  }

  /**
   * Returns the authenticated user's profile with the password stripped.
   *
   * @param param0 - Object containing the user's id.
   * @returns The user object without the password field.
   * @throws {HttpException} 404 - If the user was deleted since the token was issued.
   */
  async profile({ id }: { id?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return this.removePasswordFromUser(user);
  }

  /**
   * Validates a refresh token, revokes it (rotation), and issues a new token pair.
   * The delete and create run inside a Prisma transaction so a failure between them
   * does not permanently orphan the session.
   *
   * @param refreshToken - The raw (unhashed) refresh token from the client.
   * @returns A new access token and refresh token.
   * @throws {HttpException} 401 - If the token is expired or not found.
   * @throws {HttpException} 404 - If the linked user account was deleted.
   */
  async refreshAccessToken(refreshToken: string) {
    const hashedRefreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const sessionToken = await this.prisma.refreshToken.findFirst({
      where: {
        token: hashedRefreshToken,
        expiresAt: { gt: new Date() },
      },
    });

    if (!sessionToken) {
      throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: sessionToken.userId, isDeleted: false },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.generateToken(payload);

    const newToken = crypto.randomBytes(40).toString('hex');
    const hashedNewToken = crypto
      .createHash('sha256')
      .update(newToken)
      .digest('hex');

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: sessionToken.id } });
      await tx.refreshToken.create({
        data: {
          token: hashedNewToken,
          userId: payload.sub,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    return {
      accessToken,
      refreshToken: newToken,
    };
  }

  /**
   * Revokes a refresh token so it can no longer be used.
   * Uses deleteMany which is idempotent — succeeds even if the token was already revoked.
   *
   * @param refreshToken - The raw (unhashed) refresh token to revoke.
   */
  async logout(refreshToken: string) {
    const hashedRefreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await this.prisma.refreshToken.deleteMany({
      where: { token: hashedRefreshToken },
    });
  }
}
