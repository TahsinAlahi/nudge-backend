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

  private removePasswordFromUser(user: User): Omit<User, 'password'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  async validateUser(
    email: string,
    password: string
  ): Promise<null | Omit<User, 'password'>> {
    const user = await this.validateUserData(email, password);
    if (!user) return user;
    if (user.isDeleted) return null;
    return this.removePasswordFromUser(user);
  }

  async checkValidityOfUser(
    id: string
  ): Promise<null | Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.isDeleted) return null;

    return this.removePasswordFromUser(user);
  }

  private generateToken(payload: JwtPayload) {
    return this.jwtService.sign(payload);
  }

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

  async profile({ id }: { id?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return this.removePasswordFromUser(user);
  }

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
