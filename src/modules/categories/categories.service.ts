import { PrismaService } from '@/prisma/prisma.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Prisma } from '@/generated/prisma/client';

const categorySelect = {
  id: true,
  name: true,
  type: true,
  icon: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto, userId: string) {
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          type: dto.type,
          icon: dto.icon,
          userId,
        },
        select: categorySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new HttpException(
          'Category with this name already exists',
          HttpStatus.CONFLICT
        );
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    return this.prisma.category.findMany({
      where: {
        isDeleted: false,
        OR: [{ userId }, { userId: null }],
      },
      select: categorySelect,
    });
  }

  async findOne(id: string, userId: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        isDeleted: false,
        OR: [{ userId }, { userId: null }],
      },
      select: categorySelect,
    });

    if (!category) {
      throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
    }
    return category;
  }

  async update(id: string, userId: string, dto: UpdateCategoryDto) {
    await this.verifyOwnership(id, userId);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto,
        select: categorySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new HttpException(
          'Category with this name already exists',
          HttpStatus.CONFLICT
        );
      }
      throw error;
    }
  }

  async remove(id: string, userId: string) {
    await this.verifyOwnership(id, userId);
    await this.prisma.category.update({
      where: { id, userId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  private async verifyOwnership(id: string, userId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, isDeleted: false },
      select: { userId: true },
    });

    if (!category) {
      throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
    }

    if (category.userId === null) {
      throw new HttpException(
        'This is a global category',
        HttpStatus.FORBIDDEN
      );
    }

    if (category.userId !== userId) {
      throw new HttpException(
        'You do not own this category',
        HttpStatus.FORBIDDEN
      );
    }
  }

  async getIncomeCategories(userId: string) {
    return await this.prisma.category.findMany({
      where: {
        type: 'INCOME',
        isDeleted: false,
        OR: [{ userId }, { userId: null }],
      },
      select: categorySelect,
    });
  }

  async getExpenseCategories(userId: string) {
    return await this.prisma.category.findMany({
      where: {
        type: 'EXPENSE',
        isDeleted: false,
        OR: [{ userId }, { userId: null }],
      },
      select: categorySelect,
    });
  }
}
