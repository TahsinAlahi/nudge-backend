import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TransactionType } from '@/generated/prisma/client';

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsOptional()
  @IsString()
  icon?: string;
}
