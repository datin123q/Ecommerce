import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product.dto';
import { UpdateProductVariantDto } from './dto/update-productVariant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Products (Sản phẩm)')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN) // Chỉ Admin mới được tạo sản phẩm
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo sản phẩm & Biến thể cùng lúc (Chỉ ADMIN)' })
  create(@Body() createProductDto: CreateProductDto, @CurrentUser() user: any) {
    return this.productsService.create(createProductDto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật sản phẩm (Chỉ ADMIN)' })
  updateProduct(
      @Param('id') id: string, 
      @Body() updateProductDto: UpdateProductDto,
      @CurrentUser() user: any 
    ) {
      return this.productsService.updateProduct(id, updateProductDto, user.id);
    }

  @Post(':id/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm một Biến thể (Variant) mới vào Sản phẩm đã có (Chỉ ADMIN)' })
  addVariant(
    @Param('id') productId: string,
    @Body() createVariantDto: CreateProductVariantDto,
    @CurrentUser() user: any
  ) {
    return this.productsService.addVariant(productId, createVariantDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả sản phẩm' })
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một sản phẩm' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa sản phẩm (Chỉ ADMIN)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.remove(id, user.id);
  }

  @Patch('variants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.WAREHOUSE_MANAGER) 
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật biến thể sản phẩm (Size, Màu, Giá, Kho...)' })
  updateVariant(
    @Param('id') id: string,
    @Body() updateProductVariantDto: UpdateProductVariantDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.updateVariant(id, updateProductVariantDto, user.id);
  }

  @Get('variants/:id')
  @ApiOperation({ summary: 'Lấy chi tiết một biến thể' })
  findOneVariant(@Param('id') id: string) {
    return this.productsService.findOneVariant(id);
  }

  // @Delete('variants/:id')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(Role.ADMIN)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Xóa biến thể (Chỉ ADMIN)' })
  // removeVariant(@Param('id') id: string, @CurrentUser() user: any) {
  //   return this.productsService.removeVariant(id, user.id);
  // }
}