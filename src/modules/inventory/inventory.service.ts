import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { StockInDto } from './dto/stock-in.dto';
import { TransactionType } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  // --- NGHIỆP VỤ KHO HÀNG (WAREHOUSE) ---
  async createWarehouse(createWarehouseDto: CreateWarehouseDto, adminId: string) {
    const newWarehouse = await this.prisma.warehouse.create({ data: createWarehouseDto });
    await this.auditLogsService.logAction(
      adminId,
      'CREATE',
      'Warehouse',
      newWarehouse.id,
      null,
      newWarehouse
    );
    return newWarehouse;
  }
  
  async getWarehouses() {
    return this.prisma.warehouse.findMany();
  }

  async getInventory(){
    return this.prisma.inventory.findMany();
  }

  //sửa thông tin kho
  async update(id: string, updateWarehouseDto: UpdateWarehouseDto, adminId: string) {
    const oldWarehouse = await this.findOne(id); 
    const newWarehouse = await this.prisma.warehouse.update({
      where: { id },
      data: updateWarehouseDto,
    });
    await this.auditLogsService.logAction(
      adminId,
      'UPDATE',
      'Warehouse',
      id,
      oldWarehouse,
      newWarehouse
    );
    return newWarehouse;

  }

    async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
    });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho');
    return warehouse;
  }
  async remove(id: string, adminId:string) {
    const oldWarehouse = await this.findOne(id); 
    await this.auditLogsService.logAction(
      adminId,
      'DELETE',
      'Warehouse',
      id,
      oldWarehouse,
      null
    );
  }
  // --- NGHIỆP VỤ NHẬP KHO (STOCK IN) ---
  async stockIn(userId: string, stockInDto: StockInDto) {
    const { warehouseId, variantId, quantity } = stockInDto;

    // 1. Kiểm tra ID kho và ID biến thể gửi lên có thật không
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho hàng');

    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm');

    // 2. Tiến hành giao dịch (Transaction)
    return this.prisma.$transaction(async (prisma) => {
      const oldInventory = await prisma.inventory.findUnique({
      where: {
        warehouseId_variantId: { warehouseId, variantId },
      },
    });
      //  Cập nhật tồn kho (Upsert)
      const newInventory = await prisma.inventory.upsert({
        where: {
          warehouseId_variantId: { warehouseId, variantId },
        },
        create: { warehouseId, variantId, quantity },
        update: { quantity: { increment: quantity } }, // Cộng thêm số lượng
      });
      await this.auditLogsService.logAction(
        userId,
        oldInventory?'UPDATE' : 'CREATE',
        'Inventory',
        newInventory.id,
        oldInventory,
        newInventory
      );

      //  Lưu vào sổ nhật ký kho (Transaction History)
      const transaction = await prisma.inventoryTransaction.create({
        data: {
          type: TransactionType.IN,
          quantity,
          inventoryId: newInventory.id,
          userId, 
        },
      });

      return { newInventory, transaction };
    });
  }
}