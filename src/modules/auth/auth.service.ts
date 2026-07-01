import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async register(dto: RegisterDto) {
    const saltingRound = 10;
    const encryptedPassword = await bcrypt.hash(dto.password, saltingRound);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: encryptedPassword,
        avatar: dto.avatar,
      },
    });
  }
}
