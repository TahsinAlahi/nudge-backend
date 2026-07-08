import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TransactionType } from '@/generated/prisma/client';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsString()
  icon?: string;
}
