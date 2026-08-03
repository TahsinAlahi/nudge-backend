import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { Prisma, TransactionType } from '@/generated/prisma/client';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    account: true,
    fromAccount: true,
    category: true,
  };

  async create(userId: string, dto: CreateTransactionDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findUnique({
        where: { id: dto.accountId },
      });
      if (!account || account.isDeleted || account.userId !== userId) {
        throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
      }

      if (dto.type === TransactionType.TRANSFER) {
        if (!dto.fromAccountId) {
          throw new HttpException(
            'Source account is required for transfers',
            HttpStatus.BAD_REQUEST
          );
        }
        if (dto.fromAccountId === dto.accountId) {
          throw new HttpException(
            'Source and destination accounts must be different',
            HttpStatus.BAD_REQUEST
          );
        }
        const fromAccount = await tx.account.findUnique({
          where: { id: dto.fromAccountId },
        });
        if (
          !fromAccount ||
          fromAccount.isDeleted ||
          fromAccount.userId !== userId
        ) {
          throw new HttpException(
            'Source account not found',
            HttpStatus.NOT_FOUND
          );
        }
      }

      const category = await tx.category.findFirst({
        where: {
          id: dto.categoryId,
          isDeleted: false,
          OR: [{ userId }, { userId: null }],
        },
      });
      if (!category) {
        throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
      }

      const transaction = await tx.transaction.create({
        data: {
          accountId: dto.accountId,
          fromAccountId:
            dto.type === TransactionType.TRANSFER ? dto.fromAccountId : null,
          userId,
          categoryId: dto.categoryId,
          type: dto.type,
          amount: dto.amount,
          note: dto.note,
          date: dto.date,
        },
        include: this.include,
      });

      await this.applyBalanceEffects(
        tx,
        dto.type,
        dto.amount,
        dto.accountId,
        dto.fromAccountId
      );

      return transaction;
    });
  }

  async findAll(userId: string, query: TransactionQueryDto) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      isDeleted: false,
    };

    if (query.accountId) where.accountId = query.accountId;
    if (query.type) where.type = query.type;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = query.startDate;
      if (query.endDate) where.date.lte = query.endDate;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: this.include,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, isDeleted: false },
      include: this.include,
    });
    if (!transaction) {
      throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
    }
    return transaction;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.transaction.findFirst({
        where: { id, userId, isDeleted: false },
      });
      if (!existing) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      if (dto.categoryId) {
        const category = await tx.category.findFirst({
          where: {
            id: dto.categoryId,
            isDeleted: false,
            OR: [{ userId }, { userId: null }],
          },
        });
        if (!category) {
          throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
        }
      }

      const newType = dto.type ?? existing.type;
      const newAmount =
        dto.amount !== undefined ? dto.amount : Number(existing.amount);
      const newAccountId = dto.accountId ?? existing.accountId;

      let newFromAccountId: string | null;
      if (newType === TransactionType.TRANSFER) {
        newFromAccountId =
          dto.fromAccountId !== undefined
            ? dto.fromAccountId
            : existing.fromAccountId;
        if (!newFromAccountId) {
          throw new HttpException(
            'Source account is required for transfers',
            HttpStatus.BAD_REQUEST
          );
        }
        if (newFromAccountId === newAccountId) {
          throw new HttpException(
            'Source and destination accounts must be different',
            HttpStatus.BAD_REQUEST
          );
        }
        const fromAccount = await tx.account.findUnique({
          where: { id: newFromAccountId },
        });
        if (
          !fromAccount ||
          fromAccount.isDeleted ||
          fromAccount.userId !== userId
        ) {
          throw new HttpException(
            'Source account not found',
            HttpStatus.NOT_FOUND
          );
        }
      } else {
        newFromAccountId = null;
      }

      if (dto.accountId) {
        const account = await tx.account.findUnique({
          where: { id: dto.accountId },
        });
        if (!account || account.isDeleted || account.userId !== userId) {
          throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
        }
      }

      const balanceFieldsChanged =
        dto.amount !== undefined ||
        dto.type !== undefined ||
        dto.accountId !== undefined ||
        dto.fromAccountId !== undefined;

      if (balanceFieldsChanged) {
        await this.reverseBalanceEffects(tx, existing);
        await this.applyBalanceEffects(
          tx,
          newType,
          newAmount,
          newAccountId,
          newFromAccountId ?? undefined
        );
      }

      const updated = await tx.transaction.update({
        where: { id },
        data: {
          ...(dto.accountId !== undefined && { accountId: dto.accountId }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.note !== undefined && { note: dto.note }),
          ...(dto.date !== undefined && { date: dto.date }),
          ...(dto.fromAccountId !== undefined || dto.type !== undefined
            ? { fromAccountId: newFromAccountId }
            : {}),
        },
        include: this.include,
      });

      return updated;
    });
  }

  // TODO: Soft delete happens only when it's not a transfer
  private async remove(userId: string, id: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const transaction = await tx.transaction.findFirst({
        where: { id, userId, isDeleted: false },
      });
      if (!transaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      await this.reverseBalanceEffects(tx, transaction);

      return tx.transaction.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    });
  }

  private async reverseBalanceEffects(
    tx: Prisma.TransactionClient,
    transaction: {
      type: TransactionType;
      amount: number | Prisma.Decimal;
      accountId: string;
      fromAccountId: string | null;
    }
  ) {
    const amount = Number(transaction.amount);

    if (transaction.type === TransactionType.INCOME) {
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { decrement: amount } },
      });
    } else if (transaction.type === TransactionType.EXPENSE) {
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { increment: amount } },
      });
    } else if (
      transaction.type === TransactionType.TRANSFER &&
      transaction.fromAccountId
    ) {
      await tx.account.update({
        where: { id: transaction.fromAccountId },
        data: { balance: { increment: amount } },
      });
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { decrement: amount } },
      });
    }
  }

  private async applyBalanceEffects(
    tx: Prisma.TransactionClient,
    type: TransactionType,
    amount: number,
    accountId: string,
    fromAccountId?: string
  ) {
    if (type === TransactionType.INCOME) {
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: amount } },
      });
    } else if (type === TransactionType.EXPENSE) {
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { decrement: amount } },
      });
    } else if (type === TransactionType.TRANSFER && fromAccountId) {
      await tx.account.update({
        where: { id: fromAccountId },
        data: { balance: { decrement: amount } },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: amount } },
      });
    }
  }
}
