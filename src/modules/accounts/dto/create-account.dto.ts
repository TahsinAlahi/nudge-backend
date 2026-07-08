import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { AccountType } from '@/generated/prisma/client';
import { Type } from 'class-transformer';

export class CreateAccountDto {
  @IsString()
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  balance?: number;
}
