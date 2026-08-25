import { Controller, Post, Body, UseGuards, Get, Patch, Param ,Delete} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
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
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo kho hàng mới (Chỉ WAREHOUSE_MANAGER)' })
  createWarehouse(@Body() createWarehouseDto: CreateWarehouseDto, @CurrentUser() user: any) {
    return this.inventoryService.createWarehouse(createWarehouseDto, user.id);
  }

  @Get('warehouses')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách kho hàng  (Chỉ WAREHOUSE_MANAGER)' })
  getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin kho  (Chỉ WAREHOUSE_MANAGER)' })
  update(@Param('id') id: string, @Body() updateWarehouseDto: UpdateWarehouseDto, @CurrentUser() user: any) {
    return this.inventoryService.update(id, updateWarehouseDto, user.id);
  }
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách hàng một kho(Chỉ WAREHOUSE_MANAGER)' })
   findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  //  XÓA kho
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa kho  (Chỉ WAREHOUSE_MANAGER)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.inventoryService.remove(id, user.id);
  }
  @Post('stock-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nhập hàng vào kho (Chỉ WAREHOUSE_MANAGER)' })
  stockIn(@CurrentUser() user: any, @Body() stockInDto: StockInDto) {
    return this.inventoryService.stockIn(user.id, stockInDto);
  }

  @Post('stock-out')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xuất hàng (Chỉ WAREHOUSE_MANAGER)' })
  stockOut(@CurrentUser() user: any, @Body() stockInDto: StockInDto) {
    return this.inventoryService.stockOut(user.id, stockInDto);
  }

  @Get('inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách hàng mỗi kho(Chỉ WAREHOUSE_MANAGER)' })
  getInventories() {
    return this.inventoryService.getInventory();
  }
}