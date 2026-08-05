import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  fromAccountId!: string;

  @IsString()
  toUserId!: string;

  @IsString()
  toAccountId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  memo?: string;

  @Type(() => Date)
  @IsDate()
  date!: Date;
}
