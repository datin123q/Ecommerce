import { Controller, Get, Query, UseGuards,  } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client-core';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Lấy các số liệu tổng quan trong khoảng thời gian.' })
  getOverview(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getOverview(query);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Lấy doanh thu theo từng khoảng thời gian' })
  getRevenue(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRevenue(query);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm bán chạy trong khoảng thời gian.' })
  getTopProducts(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getTopProducts(query);
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Lấy các đơn hàng mới nhất trên toàn cửa hàng.' })
  getRecentOrders(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRecentOrders(query);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Lấy danh sách tồn kho thấp.' })
  getLowStock(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getLowStock(query);
  }
}