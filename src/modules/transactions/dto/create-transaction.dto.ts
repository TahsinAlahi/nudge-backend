import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TransactionType } from '@/generated/prisma/client';

export class CreateTransactionDto {
  @IsString()
  accountId!: string;

  @IsOptional()
  @IsString()
  fromAccountId?: string;

  @IsString()
  categoryId!: string;

  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @Type(() => Date)
  @IsDate()
  date!: Date;
}
