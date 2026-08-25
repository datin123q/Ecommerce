import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
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
      newWarehouse,
      this.prisma,
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
      newWarehouse,
      this.prisma,
    );
    return newWarehouse;

  }

    async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {inventories: true}
    });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho');
    return warehouse;
  }
  async remove(id: string, adminId:string) {
    const oldWarehouse = await this.findOne(id); 
    const inventories = await this.prisma.inventory.findMany({
      where: {
        warehouseId: id,
      },
    });
    if(inventories){
      for(const inv of inventories){
        if(inv.quantity !== 0){
          throw new NotFoundException('Không thể xóa kho còn hàng');
        }
      }
      
    }
    await this.prisma.warehouse.delete({
      where: {id}
    })
    await this.auditLogsService.logAction(
      adminId,
      'DELETE',
      'Warehouse',
      id,
      oldWarehouse,
      null,
      this.prisma
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
        newInventory,
        prisma,
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

  async stockOut(userId: string, stockOutDto: StockOutDto) {
    const { warehouseId, variantId, quantity } = stockOutDto;

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
      if(oldInventory && oldInventory.quantity<stockOutDto.quantity){throw new NotFoundException('Số lượng tồn kho không đủ')} 
      //  Cập nhật tồn kho (Upsert)
      const newInventory = await prisma.inventory.upsert({
        where: {
          warehouseId_variantId: { warehouseId, variantId },
        },
        create: { warehouseId, variantId, quantity },
        update: { quantity: { decrement: quantity } }, // giảm số lượng
      });
      await this.auditLogsService.logAction(
        userId,
        oldInventory?'UPDATE' : 'CREATE',
        'Inventory',
        newInventory.id,
        oldInventory,
        newInventory,
        prisma,
      );

      //  Lưu vào sổ nhật ký kho (Transaction History)
      const transaction = await prisma.inventoryTransaction.create({
        data: {
          type: TransactionType.OUT,
          quantity,
          inventoryId: newInventory.id,
          userId, 
        },
      });

      return { newInventory, transaction };
    });
  }
}