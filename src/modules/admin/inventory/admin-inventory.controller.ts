import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client-core';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { InventoryService } from '../../inventory/inventory.service';
import { CreateWarehouseDto } from '../../inventory/dto/create-warehouse.dto';
import { GetInventoriesDto } from '../../inventory/dto/get-inventories.dto';
import { StockInDto } from '../../inventory/dto/stock-in.dto';
import { StockOutDto } from '../../inventory/dto/stock-out.dto';
import { UpdateWarehouseDto } from '../../inventory/dto/update-warehouse.dto';

interface AuthenticatedUser {
  id: string;
}

@ApiTags('Admin Inventory')
@ApiBearerAuth()
@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE_MANAGER)
export class AdminInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('warehouses')
  @ApiOperation({ summary: 'Tạo kho hàng.' })
  createWarehouse(@Body() dto: CreateWarehouseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.createWarehouse(dto, user.id);
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'Xem danh sách kho.' })
  getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  @Get('warehouses/:id')
  @ApiOperation({ summary: 'Xem chi tiết kho và hàng trong kho.' })
  getWarehouse(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch('warehouses/:id')
  @ApiOperation({ summary: 'Cập nhật kho.' })
  updateWarehouse(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.update(id, dto, user.id);
  }

  @Delete('warehouses/:id')
  @ApiOperation({ summary: 'Xóa kho.' })
  removeWarehouse(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.remove(id, user.id);
  }

  @Post('stock-in')
  @ApiOperation({ summary: 'Nhập hàng vào kho.' })
  stockIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: StockInDto) {
    return this.inventoryService.stockIn(user.id, dto);
  }

  @Post('stock-out')
  @ApiOperation({ summary: 'Xuất hàng khỏi kho.' })
  stockOut(@CurrentUser() user: AuthenticatedUser, @Body() dto: StockOutDto) {
    return this.inventoryService.stockOut(user.id, dto);
  }

  @Get('stocks')
  @ApiOperation({ summary: 'Xem tồn kho có phân trang.' })
  async getInventories(@Query() query: GetInventoriesDto, @Res() response: Response) {
    const data = await this.inventoryService.getInventory(query);
    response.setHeader('Content-Type', 'application/json');
    return response.send(data);
  }
}
