import { PrismaService } from '@/prisma/prisma.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { User } from '@/generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  // TODO: register will return token so user can login at the same time
  async register(dto: RegisterDto) {
    const doesUserExist = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (doesUserExist) {
      throw new HttpException('Email is already in use', HttpStatus.CONFLICT);
    }

    const saltingRound = 10;
    const encryptedPassword = await bcrypt.hash(dto.password, saltingRound);
    return this.prisma.user.create({
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
  }

  async login(dto: LoginDto) {
    const user = await this.validateUserData(dto.email, dto.password);
    if (!user) {
      throw new HttpException('Invalid Credentials', HttpStatus.UNAUTHORIZED);
    }

    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.generateToken(payload),
    };
  }

  // for internal uses
  private async validateUserData(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      return user;
    }
    return null;
  }

  async validateUser(
    email: string,
    password: string
  ): Promise<null | Omit<User, 'password'>> {
    const user = await this.validateUserData(email, password);
    if (!user) return user;
    if (user.isDeleted) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  async checkValidityOfUser(
    id: string,
    email: string
  ): Promise<null | Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id, email } });
    if (!user || user.isDeleted) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  private generateToken(payload: object) {
    return this.jwtService.sign(payload);
  }
}
