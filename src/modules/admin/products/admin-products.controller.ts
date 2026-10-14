import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ProductsService } from '../../products/products.service';
import { CreateProductDto, CreateProductVariantDto } from '../../products/dto/create-product.dto';
import { UpdateProductDto } from '../../products/dto/update-product.dto';
import { UpdateProductVariantDto } from '../../products/dto/update-product-variant.dto';

interface AuthenticatedUser {
  id: string;
}

@ApiTags('Admin Products')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo sản phẩm và các biến thể.' })
  create(@Body() dto: CreateProductDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.productsService.create(dto, admin.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật sản phẩm.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.productsService.updateProduct(id, dto, admin.id);
  }

  @Post(':id/variants')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Thêm biến thể vào sản phẩm.' })
  addVariant(
    @Param('id') productId: string,
    @Body() dto: CreateProductVariantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.productsService.addVariant(productId, dto, admin.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa sản phẩm.' })
  remove(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.productsService.remove(id, admin.id);
  }

  @Patch('variants/:id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_MANAGER)
  @ApiOperation({ summary: 'Cập nhật biến thể sản phẩm.' })
  updateVariant(
    @Param('id') id: string,
    @Body() dto: UpdateProductVariantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.productsService.updateVariant(id, dto, admin.id);
  }
}
