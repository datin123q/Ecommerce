import { Controller, Post, Body, UseGuards, Get, Patch, Param, Delete } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto'; // Thêm import này
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Inventory (Kho hàng)')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.WAREHOUSE_MANAGER, Role.ADMIN) // Đưa lên cấp Controller cho gọn
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // --- QUẢN LÝ KHO (WAREHOUSE) ---

  @Post('warehouses')
  @ApiOperation({ summary: 'Tạo kho hàng mới (Chỉ WAREHOUSE_MANAGER/ADMIN)' })
  createWarehouse(@Body() createWarehouseDto: CreateWarehouseDto, @CurrentUser() user: any) {
    return this.inventoryService.createWarehouse(createWarehouseDto, user.id);
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'Xem danh sách kho hàng' })
  getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  @Get('warehouses/:id')
  @ApiOperation({ summary: 'Xem chi tiết một kho và danh sách hàng' })
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch('warehouses/:id')
  @ApiOperation({ summary: 'Cập nhật thông tin kho' })
  update(@Param('id') id: string, @Body() updateWarehouseDto: UpdateWarehouseDto, @CurrentUser() user: any) {
    return this.inventoryService.update(id, updateWarehouseDto, user.id);
  }

  @Delete('warehouses/:id')
  @ApiOperation({ summary: 'Xóa kho' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.inventoryService.remove(id, user.id);
  }

  // --- NGHIỆP VỤ XUẤT NHẬP TỒN ---

  @Post('stock-in')
  @ApiOperation({ summary: 'Nhập hàng vào kho' })
  stockIn(@CurrentUser() user: any, @Body() stockInDto: StockInDto) {
    return this.inventoryService.stockIn(user.id, stockInDto);
  }

  @Post('stock-out')
  @ApiOperation({ summary: 'Xuất hàng khỏi kho' })
  // SỬA LỖI: Đổi StockInDto thành StockOutDto
  stockOut(@CurrentUser() user: any, @Body() stockOutDto: StockOutDto) {
    return this.inventoryService.stockOut(user.id, stockOutDto);
  }

  @Get('stocks')
  @ApiOperation({ summary: 'Xem danh sách tồn kho tổng hợp' })
  getInventories() {
    return this.inventoryService.getInventory();
  }
}