import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { Direction, Prisma, TransactionType } from '@/generated/prisma/client';

/**
 * @description Handles INCOME and EXPENSE transactions. Transfers are created
 * through the transfers module and their legs are immutable here.
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    account: true,
    category: true,
    transfer: true,
  };

  /**
   * Creates an INCOME or EXPENSE transaction and applies its balance effect
   * atomically within a database transaction.
   *
   * @param userId - The id of the authenticated user.
   * @param dto - The validated payload for the new transaction.
   * @returns The created transaction including its account, category, and transfer relation.
   * @throws {HttpException} 400 - When the type is TRANSFER; those go through the transfers endpoint.
   * @throws {HttpException} 404 - When the account is missing, soft-deleted, or not owned by the user.
   * @throws {HttpException} 404 - When the category is missing, soft-deleted, or neither the user's nor global.
   */
  async create(userId: string, dto: CreateTransactionDto) {
    if (dto.type === TransactionType.TRANSFER) {
      throw new HttpException(
        'Transfers are created through the transfers endpoint',
        HttpStatus.BAD_REQUEST
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findUnique({
        where: { id: dto.accountId, isDeleted: false, userId: userId },
      });
      if (!account) {
        throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
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

      const direction = this.directionForType(dto.type);

      const transaction = await tx.transaction.create({
        data: {
          accountId: dto.accountId,
          userId,
          categoryId: dto.categoryId,
          type: dto.type,
          direction,
          amount: dto.amount,
          note: dto.note,
          date: dto.date,
        },
        include: this.include,
      });

      await this.applyBalanceEffects(tx, transaction);

      return transaction;
    });
  }

  /**
   * Lists the user's non-deleted transactions with optional filters and
   * offset pagination.
   *
   * @param userId - The id of the authenticated user.
   * @param query - Filter (account/type/category/date range) and pagination (page/limit) options.
   * @returns An envelope with the transaction rows and pagination metadata.
   */
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

  /**
   * Fetches a single transaction owned by the user.
   *
   * @param userId - The id of the authenticated user.
   * @param id - The id of the transaction.
   * @returns The transaction including its account, category, and transfer relation.
   * @throws {HttpException} 404 - When the transaction is not found or not owned by the user.
   */
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

  /**
   * Updates an INCOME/EXPENSE transaction, reversing the old balance effect and
   * applying the new one atomically. Transfer legs are immutable here.
   *
   * @param userId - The id of the authenticated user.
   * @param id - The id of the transaction to update.
   * @param dto - The fields to change.
   * @returns The updated transaction including its account, category, and transfer relation.
   * @throws {HttpException} 400 - When the transaction is a transfer leg or the new type is TRANSFER.
   * @throws {HttpException} 404 - When the transaction, account, or category is not found or owned by the user.
   */
  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.transaction.findFirst({
        where: { id, userId, isDeleted: false },
      });
      if (!existing) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      // TODO: Moved the logics to transfer, will remove this checking later
      if (existing.transferId) {
        throw new HttpException(
          'Transfer legs cannot be updated; use the transfers endpoint',
          HttpStatus.BAD_REQUEST
        );
      }

      const newType = dto.type ?? existing.type;
      // TODO: Moved the logics to transfer, will remove this checking later
      if (newType === TransactionType.TRANSFER) {
        throw new HttpException(
          'Transfers are created through the transfers endpoint',
          HttpStatus.BAD_REQUEST
        );
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

      const newAmount =
        dto.amount !== undefined ? dto.amount : Number(existing.amount);
      const newAccountId = dto.accountId ?? existing.accountId;
      const newDirection =
        dto.type !== undefined
          ? this.directionForType(dto.type)
          : existing.direction;

      if (dto.accountId) {
        const account = await tx.account.findUnique({
          where: { id: dto.accountId, isDeleted: false, userId: userId },
        });
        if (!account) {
          throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
        }
      }

      const balanceFieldsChanged =
        dto.amount !== undefined ||
        dto.type !== undefined ||
        dto.accountId !== undefined;

      if (balanceFieldsChanged) {
        await this.reverseBalanceEffects(tx, existing);
        await this.applyBalanceEffects(tx, {
          direction: newDirection,
          amount: newAmount,
          accountId: newAccountId,
        });
      }

      return tx.transaction.update({
        where: { id },
        data: {
          ...(dto.accountId !== undefined && { accountId: dto.accountId }),
          ...(dto.type !== undefined && {
            type: dto.type,
            direction: newDirection,
          }),
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.note !== undefined && { note: dto.note }),
          ...(dto.date !== undefined && { date: dto.date }),
        },
        include: this.include,
      });
    });
  }

  /**
   * Soft-deletes a transaction, reversing its balance effect. Transfer legs are
   * immutable here.
   *
   * @param userId - The id of the authenticated user.
   * @param id - The id of the transaction to delete.
   * @returns The soft-deleted transaction (isDeleted true, deletedAt set).
   * @throws {HttpException} 400 - When the transaction is a transfer leg.
   * @throws {HttpException} 404 - When the transaction is not found or not owned by the user.
   */
  async remove(userId: string, id: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const transaction = await tx.transaction.findFirst({
        where: { id, userId, isDeleted: false },
      });
      if (!transaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      if (transaction.transferId) {
        throw new HttpException(
          'Transfer legs cannot be deleted; use the transfers endpoint',
          HttpStatus.BAD_REQUEST
        );
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

  /**
   * Maps a transaction type to the direction of money flow on its account.
   *
   * @param type - The transaction type (INCOME or EXPENSE).
   * @returns Direction.IN for INCOME, Direction.OUT for EXPENSE.
   */
  private directionForType(type: TransactionType): Direction {
    return type === TransactionType.INCOME ? Direction.IN : Direction.OUT;
  }

  /**
   * Undoes the balance effect of an existing transaction on its account: an IN
   * transaction is reversed with a decrement, an OUT one with an increment.
   *
   * @param tx - The Prisma transaction client to run the update on.
   * @param transaction - The transaction whose balance effect should be reversed.
   */
  private async reverseBalanceEffects(
    tx: Prisma.TransactionClient,
    transaction: {
      direction: Direction;
      amount: number | Prisma.Decimal;
      accountId: string;
    }
  ) {
    const amount = Number(transaction.amount);
    await tx.account.update({
      where: { id: transaction.accountId },
      data:
        // if direction is IN, then reversing means decrementing the balance
        transaction.direction === Direction.IN
          ? { balance: { decrement: amount } }
          : { balance: { increment: amount } },
    });
  }

  /**
   * Applies the balance effect of a transaction to its account: IN increments,
   * OUT decrements.
   *
   * @param tx - The Prisma transaction client to run the update on.
   * @param transaction - The transaction (direction, amount, accountId) whose balance effect to apply.
   */
  private async applyBalanceEffects(
    tx: Prisma.TransactionClient,
    transaction: {
      direction: Direction;
      amount: number | Prisma.Decimal;
      accountId: string;
    }
  ) {
    await tx.account.update({
      where: { id: transaction.accountId },
      data:
        transaction.direction === Direction.IN
          ? { balance: { increment: transaction.amount } }
          : { balance: { decrement: transaction.amount } },
    });
  }
}
