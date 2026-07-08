import { PrismaService } from '@/prisma/prisma.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

const accountSelect = {
  id: true,
  userId: true,
  name: true,
  type: true,
  currency: true,
  balance: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAccount: CreateAccountDto, userId: string) {
    return this.prisma.account.create({
      data: {
        name: createAccount.name,
        type: createAccount.type,
        currency: createAccount.currency,
        balance: createAccount.balance ?? 0,
        userId,
      },
      select: accountSelect,
    });
  }

  async findAll(userId: string) {
    return this.prisma.account.findMany({
      where: { userId, isDeleted: false },
      select: accountSelect,
    });
  }

  async findOne(id: string, userId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, userId, isDeleted: false },
      select: accountSelect,
    });

    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }
    return account;
  }

  async update(id: string, userId: string, updateAccount: UpdateAccountDto) {
    await this.findOne(id, userId);

    return this.prisma.account.update({
      where: { id },
      data: updateAccount,
      select: accountSelect,
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    return this.prisma.account.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  async netWorth(userId: string) {
    const netWorth = await this.prisma.account.aggregate({
      where: { userId, isDeleted: false },
      _sum: { balance: true },
    });

    return { netWorth: netWorth._sum.balance ?? 0 };
  }
}
