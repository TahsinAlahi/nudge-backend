import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AccountType } from '@/generated/prisma/client';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsString()
  currency?: string;
}
