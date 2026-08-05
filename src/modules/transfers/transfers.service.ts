import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  Direction,
  Prisma,
  TransactionType,
  TransferStatus,
} from '@/generated/prisma/client';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    legs: true,
  };

  async create(userId: string, dto: CreateTransferDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (dto.toUserId === userId) {
        throw new HttpException(
          'Cannot transfer to yourself',
          HttpStatus.BAD_REQUEST
        );
      }
      if (dto.fromAccountId === dto.toAccountId) {
        throw new HttpException(
          'Source and destination accounts must be different',
          HttpStatus.BAD_REQUEST
        );
      }

      const fromAccount = await tx.account.findUnique({
        where: { id: dto.fromAccountId, isDeleted: false, userId: userId },
      });
      if (!fromAccount || fromAccount.userId !== userId) {
        throw new HttpException(
          'Source account not found',
          HttpStatus.NOT_FOUND
        );
      }
      if (fromAccount.balance.lt(dto.amount)) {
        throw new HttpException('Insufficient funds', HttpStatus.BAD_REQUEST);
      }

      const toUser = await tx.user.findUnique({
        where: { id: dto.toUserId, isDeleted: false },
      });
      if (!toUser) {
        throw new HttpException('Recipient not found', HttpStatus.NOT_FOUND);
      }

      const toAccount = await tx.account.findUnique({
        where: { id: dto.toAccountId, userId: dto.toUserId, isDeleted: false },
      });
      if (!toAccount) {
        throw new HttpException(
          'Destination account not found',
          HttpStatus.NOT_FOUND
        );
      }

      const transfer = await tx.transfer.create({
        data: {
          fromUserId: userId,
          toUserId: dto.toUserId,
          memo: dto.memo,
          status: TransferStatus.COMPLETED, // by default
        },
      });

      await tx.transaction.createMany({
        data: [
          {
            accountId: dto.fromAccountId,
            userId,
            categoryId: null,
            transferId: transfer.id,
            type: TransactionType.TRANSFER,
            direction: Direction.OUT,
            amount: dto.amount,
            date: dto.date,
          },
          {
            accountId: dto.toAccountId,
            userId: dto.toUserId,
            categoryId: null,
            transferId: transfer.id,
            type: TransactionType.TRANSFER,
            direction: Direction.IN,
            amount: dto.amount,
            date: dto.date,
          },
        ],
      });

      await tx.account.update({
        where: { id: dto.fromAccountId },
        data: { balance: { decrement: dto.amount } },
      });
      await tx.account.update({
        where: { id: dto.toAccountId },
        data: { balance: { increment: dto.amount } },
      });

      return tx.transfer.findFirst({
        where: { id: transfer.id },
        include: this.include,
      });
    });
  }

  async findAll(userId: string) {
    return this.prisma.transfer.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const transfer = await this.prisma.transfer.findFirst({
      where: {
        id,
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      include: this.include,
    });
    if (!transfer) {
      throw new HttpException('Transfer not found', HttpStatus.NOT_FOUND);
    }
    return transfer;
  }

  /**
   * Placeholder for future transfer mutation logic (cancel/refund).
   * Transfers are immutable in the current MVP — revisit with the
   * PENDING/COMPLETED/FAILED status workflow and queues.
   */
  private async update() {}

  /**
   * Placeholder for future transfer removal (reverse balances + soft-delete legs).
   * Revisit with the status workflow and queues.
   */
  private async remove() {}
}
