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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { UserRequest } from '@/common/decorators/current-user.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: UserRequest
  ) {
    return this.categoriesService.create(dto, user.id);
  }

  @Get()
  async findAll(@CurrentUser() user: UserRequest) {
    return this.categoriesService.findAll(user.id);
  }

  @Get('income')
  async getIncomeCategories(@CurrentUser() user: UserRequest) {
    return this.categoriesService.getIncomeCategories(user.id);
  }

  @Get('expanse')
  async getExpenseCategories(@CurrentUser() user: UserRequest) {
    return this.categoriesService.getExpenseCategories(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: UserRequest) {
    return this.categoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: UserRequest
  ) {
    return this.categoriesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: UserRequest) {
    await this.categoriesService.remove(id, user.id);
  }
}
