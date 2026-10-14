import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetProductsDto } from './dto/get-products.dto';
import { Response } from 'express';

@ApiTags('Products (Sản phẩm)')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm có phân trang và sắp xếp' })
  async findAll(@Query() query: GetProductsDto, @Res() res: Response) {
    const dataString = await this.productsService.findAll(query);
    
    res.setHeader('Content-Type', 'application/json');
    return res.send(dataString);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const dataString = await this.productsService.findOne(id);
    res.setHeader('Content-Type', 'application/json');
    return res.send(dataString);
  }

  @Get('variants/:id')
  @ApiOperation({ summary: 'Lấy chi tiết một biến thể' })
  findOneVariant(@Param('id') id: string) {
    return this.productsService.findOneVariant(id);
  }

}
