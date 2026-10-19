import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client-core';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CategoriesService } from '../../categories/categories.service';
import { CreateCategoryDto } from '../../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../../categories/dto/update-category.dto';

interface AuthenticatedUser {
  id: string;
}

@ApiTags('Admin Categories')
@ApiBearerAuth()
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo danh mục mới.' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.categoriesService.create(dto, admin.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật danh mục.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.categoriesService.update(id, dto, admin.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa danh mục.' })
  remove(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.categoriesService.remove(id, admin.id);
  }
}
