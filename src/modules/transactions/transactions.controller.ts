import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { UserRequest } from '@/common/decorators/current-user.decorator';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  async create(
    @CurrentUser() user: UserRequest,
    @Body() dto: CreateTransactionDto
  ) {
    return this.transactionsService.create(user.id, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: UserRequest,
    @Query() query: TransactionQueryDto
  ) {
    return this.transactionsService.findAll(user.id, query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: UserRequest) {
    return this.transactionsService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser() user: UserRequest
  ) {
    return this.transactionsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: UserRequest) {
    await this.transactionsService.remove(user.id, id);
  }
}
