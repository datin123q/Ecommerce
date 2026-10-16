import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetProductsDto } from './dto/get-products.dto';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

@ApiTags('Products (Sản phẩm)')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm có phân trang và sắp xếp' })
  findAll(@Query() query: GetProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('count')
  @ApiOperation({ summary: 'Đếm sản phẩm đang hoạt động' })
  countActive() {
    return this.productsService.countActive();
  }

  @Post()
  @ApiOperation({ summary: 'Tạo sản phẩm và các biến thể' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật sản phẩm' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.updateProduct(id, dto);
  }

  @Post(':id/variants')
  @ApiOperation({ summary: 'Thêm biến thể vào sản phẩm' })
  addVariant(@Param('id') id: string, @Body() dto: CreateProductVariantDto) {
    return this.productsService.addVariant(id, dto);
  }

  @Patch('variants/:id')
  @ApiOperation({ summary: 'Cập nhật biến thể sản phẩm' })
  updateVariant(@Param('id') id: string, @Body() dto: UpdateProductVariantDto) {
    return this.productsService.updateVariant(id, dto);
  }

  @Delete('variants/:id')
  @ApiOperation({ summary: 'Xóa biến thể sản phẩm' })
  removeVariant(@Param('id') id: string) {
    return this.productsService.removeVariant(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa sản phẩm và các biến thể' })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Get('variants/:id')
  @ApiOperation({ summary: 'Lấy chi tiết một biến thể' })
  findOneVariant(@Param('id') id: string) {
    return this.productsService.findOneVariant(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết sản phẩm và các biến thể' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
