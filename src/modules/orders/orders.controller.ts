import { Controller, Get, Post, Body, UseGuards, Param, Patch, UseInterceptors} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { ApiHeader } from '@nestjs/swagger';

@ApiTags('Orders (Đơn hàng)')
@Controller('orders')
@UseGuards(JwtAuthGuard) // Bắt buộc đăng nhập
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}
  @Post('checkout')
  @ApiHeader({
      name: 'x-idempotency-key',
      description: 'Mã định danh duy nhất để chống trùng lặp giao dịch (VD: uuid)',
      required: true,
    })
    @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Chốt đơn từ Giỏ hàng (Có thể kèm Voucher)' })
  createOrder(@CurrentUser() user: any, @Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(user.id, createOrderDto);
  }

  @Get('my-orders')
  @ApiOperation({ summary: 'Xem lịch sử đơn hàng của tôi' })
  getMyOrders(@CurrentUser() user: any) {
    return this.ordersService.getMyOrders(user.id);
  }

  @Patch(':id/cancel')
  @ApiHeader({
      name: 'x-idempotency-key',
      description: 'Mã định danh duy nhất để chống trùng lặp giao dịch (VD: uuid)',
      required: true,
    })
    @UseInterceptors(IdempotencyInterceptor)
  async cancelOrder(
    @Param('id') orderId: string, @CurrentUser() user: any
  ) {
    return this.ordersService.cancelOrder(user.id, orderId);
  }

}