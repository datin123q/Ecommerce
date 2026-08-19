import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Orders (Đơn hàng)')
@Controller('orders')
@UseGuards(JwtAuthGuard) // Bắt buộc đăng nhập
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Chốt đơn từ Giỏ hàng (Có thể kèm Voucher)' })
  createOrder(@CurrentUser() user: any, @Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(user.id, createOrderDto);
  }

  @Get('my-orders')
  @ApiOperation({ summary: 'Xem lịch sử đơn hàng của tôi' })
  getMyOrders(@CurrentUser() user: any) {
    return this.ordersService.getMyOrders(user.id);
  }
}