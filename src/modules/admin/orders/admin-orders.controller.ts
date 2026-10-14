import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GetAllOrdersDto } from '../../orders/dto/all-orders.dto';
import { OrdersService } from '../../orders/orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@ApiTags('Admin Orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách đơn hàng toàn hệ thống, có lọc và phân trang.' })
  getAllOrders(@Query() query: GetAllOrdersDto) {
    return this.ordersService.getAllOrders(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một đơn hàng.' })
  @ApiParam({ name: 'id', description: 'UUID của đơn hàng' })
  getOrder(@Param('id', ParseUUIDPipe) orderId: string) {
    return this.ordersService.getOneOrder(orderId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái đơn hàng theo luồng trạng thái hợp lệ.' })
  @ApiParam({ name: 'id', description: 'UUID của đơn hàng' })
  updateStatus(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto.status);
  }
}
