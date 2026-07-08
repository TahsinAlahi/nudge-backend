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
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { UserRequest } from '@/common/decorators/current-user.decorator';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  async create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: UserRequest
  ) {
    return this.accountsService.create(dto, user.id);
  }

  @Get()
  async findAll(@CurrentUser() user: UserRequest) {
    return this.accountsService.findAll(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: UserRequest) {
    return this.accountsService.findOne(id, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: UserRequest
  ) {
    return this.accountsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: UserRequest) {
    await this.accountsService.remove(id, user.id);
  }
}
