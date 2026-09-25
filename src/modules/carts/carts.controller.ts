import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { CartsService } from './carts.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

@ApiTags('Carts (Giỏ hàng)')
@Controller('carts')
@UseGuards(JwtAuthGuard) 
@ApiBearerAuth()
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get('my-cart')
  @ApiOperation({ summary: 'Xem giỏ hàng của tôi(Phải đăng nhập)' })
  getMyCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartsService.getMyCart(user.id);
  }

  @Post('add')
  @ApiOperation({ summary: 'Thêm sản phẩm vào giỏ hàng(Phải đăng nhập)' })
  addToCart(@CurrentUser() user: AuthenticatedUser, @Body() addToCartDto: AddToCartDto) {
    return this.cartsService.addToCart(user.id, addToCartDto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Xóa một mặt hàng khỏi giỏ(Phải đăng nhập)' })
  removeCartItem(@CurrentUser() user: AuthenticatedUser, @Param('id') cartItemId: string) {
    return this.cartsService.removeCartItem(user.id, cartItemId);
  }
}