import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { StockInDto } from './dto/stock-in.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Inventory (Kho hàng)')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('warehouses')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo kho hàng mới (Chỉ WAREHOUSE_MANAGER)' })
  createWarehouse(@Body() createWarehouseDto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(createWarehouseDto);
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'Xem danh sách kho hàng' })
  getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  @Post('stock-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nhập hàng vào kho (Chỉ WAREHOUSE_MANAGER)' })
  stockIn(@CurrentUser() user: any, @Body() stockInDto: StockInDto) {
    return this.inventoryService.stockIn(user.id, stockInDto);
  }

  @Get('inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách hàng mỗi kho(Chỉ WAREHOUSE_MANAGER)' })
  getInventories() {
    return this.inventoryService.getInventory();
  }
}