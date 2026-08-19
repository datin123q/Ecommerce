import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client'; 

@ApiTags('Categories (Danh mục)')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  //  TẠO DANH MỤC 
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard) 
  @Roles(Role.ADMIN)                   
  @ApiBearerAuth()                    
  @ApiOperation({ summary: 'Tạo danh mục mới (Chỉ ADMIN)' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  // XEM DANH MỤC 
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách danh mục (Ai cũng xem được)' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một danh mục' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  // SỬA DANH MỤC 
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật danh mục (Chỉ ADMIN)' })
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  //  XÓA DANH MỤC
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa danh mục (Chỉ ADMIN)' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}