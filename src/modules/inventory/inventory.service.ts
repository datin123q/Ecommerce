import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { TransactionType, Prisma, Inventory } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

export type DeductItem = {
  inventoryId: string;
  quantity: number;
};

export type RestoreItem = {
  inventoryId: string;
  quantity: number;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService, 
    private readonly eventEmitter: EventEmitter2
  ) {}
  
  async createWarehouse(createWarehouseDto: CreateWarehouseDto, adminId: string) {
    const newWarehouse = await this.prisma.db.warehouse.create({ data: createWarehouseDto });
    
    this.postAuditEvent('warehouse.created', adminId, 'CREATE', 'Warehouse', newWarehouse.id, null, newWarehouse);
    return newWarehouse;
  }
  
  getWarehouses() {
    return this.prisma.db.warehouse.findMany();
  }

  getInventory(){
    return this.prisma.db.inventory.findMany();
  }

  async update(id: string, updateWarehouseDto: UpdateWarehouseDto, adminId: string) {
    const oldWarehouse = await this.prisma.db.warehouse.findUnique({ where: { id } }); 
    if (!oldWarehouse) throw new NotFoundException('Không tìm thấy kho');

    const newWarehouse = await this.prisma.db.warehouse.update({
      where: { id },
      data: updateWarehouseDto,
    });

    this.postAuditEvent('warehouse.update', adminId, 'UPDATE', 'Warehouse', id, oldWarehouse, newWarehouse);
    return newWarehouse;
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.db.warehouse.findUnique({
      where: { id },
      include: { inventories: true }
    });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho');
    return warehouse;
  }
  
  async remove(id: string, adminId: string) {
    const oldWarehouse = await this.findOne(id);
    
    const stockCount = await this.prisma.db.inventory.count({
      where: { warehouseId: id, quantity: { gt: 0 } }
    });

    if (stockCount > 0) {
      throw new BadRequestException('Không thể xóa kho khi vẫn còn hàng bên trong');
    }

    await this.prisma.db.warehouse.delete({ where: { id } });

    this.postAuditEvent('warehouse.deleted', adminId, 'DELETE', 'Warehouse', id, oldWarehouse, null);
  }

  async getInventoriesByVariantIds(variantIds: string[]) {
    return this.prisma.db.inventory.findMany({
      where: { variantId: { in: variantIds } }, 
      orderBy: { quantity: 'desc' },
    });
  }
  
  async stockIn(userId: string, stockInDto: StockInDto) {
    await this.validateWarehouseAndVariant(stockInDto.warehouseId, stockInDto.variantId);

    const result = await this.executeStockInTransaction(userId, stockInDto);

    const action = result.oldInventory ? 'UPDATE' : 'CREATE';
    this.postAuditEvent('inventory.stockIn', userId, action, 'Inventory', result.newInventory.id, result.oldInventory, result.newInventory);

    return { newInventory: result.newInventory, transaction: result.transaction };
  }

  async stockOut(userId: string, stockOutDto: StockOutDto) {

    await this.validateWarehouseAndVariant(stockOutDto.warehouseId, stockOutDto.variantId);

    const result = await this.executeStockOutTransaction(userId, stockOutDto);

    this.postAuditEvent('inventory.stockOut', userId, 'UPDATE', 'Inventory', result.newInventory.id, result.oldInventory, result.newInventory);

    return result.newInventory;
  }
  
  async deductStockAndLog(
    tx: Prisma.TransactionClient, 
    items: DeductItem[], 
    userId: string
  ) {
    if (items.length === 0) return [];

    const updatePromises = items.map(item =>
      tx.inventory.update({
        where: { id: item.inventoryId },
        data: { quantity: { decrement: item.quantity } },
      })
    );
    const updatedInventories = await Promise.all(updatePromises);

    const transactionLogs = items.map(item => ({
      type: TransactionType.OUT,
      quantity: item.quantity,
      inventoryId: item.inventoryId,
      userId,
    }));
    
    await tx.inventoryTransaction.createMany({ data: transactionLogs });

    return updatedInventories;
  }

  async restoreStockAndLog(
    tx: Prisma.TransactionClient, 
    items: RestoreItem[], 
    userId: string
  ) {
    if (items.length === 0) return;

    const updatePromises = items.map(item =>
      tx.inventory.update({
        where: { id: item.inventoryId }, 
        data: { quantity: { increment: item.quantity } },
      })
    );
    await Promise.all(updatePromises);

    const logs = items.map(item => ({
      type: TransactionType.IN,
      quantity: item.quantity,
      inventoryId: item.inventoryId,
      userId,
    }));
    
    await tx.inventoryTransaction.createMany({ data: logs });
  }

  private async validateWarehouseAndVariant(warehouseId: string, variantId: string) {
    const [warehouse, variant] = await Promise.all([
      this.prisma.db.warehouse.findUnique({ where: { id: warehouseId } }),
      this.prisma.db.productVariant.findUnique({ where: { id: variantId } })
    ]);

    if (!warehouse) throw new NotFoundException('Không tìm thấy kho hàng');
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
  }

  private async executeStockInTransaction(userId: string, dto: StockInDto) {
    return this.prisma.db.$transaction(async (tx) => {
      const oldInventory = await tx.inventory.findUnique({
        where: { warehouseId_variantId: { warehouseId: dto.warehouseId, variantId: dto.variantId } },
      });
      
      const newInventory = await tx.inventory.upsert({
        where: { warehouseId_variantId: { warehouseId: dto.warehouseId, variantId: dto.variantId } },
        create: { warehouseId: dto.warehouseId, variantId: dto.variantId, quantity: dto.quantity },
        update: { quantity: { increment: dto.quantity } }, 
      });
      
      const transaction = await tx.inventoryTransaction.create({
        data: {
          type: TransactionType.IN,
          quantity: dto.quantity,
          inventoryId: newInventory.id,
          userId, 
        },
      });

      return { oldInventory, newInventory, transaction };
    });
  }

  private async executeStockOutTransaction(userId: string, dto: StockOutDto) {
    return this.prisma.db.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { warehouseId_variantId: { warehouseId: dto.warehouseId, variantId: dto.variantId } },
      });

      if (!inventory || inventory.quantity < dto.quantity) {
        throw new BadRequestException(`Số lượng tồn kho không đủ (Hiện có: ${inventory?.quantity || 0})`);
      }

      const itemsToDeduct = [{ inventoryId: inventory.id, quantity: dto.quantity }];
      const updatedInventories = await this.deductStockAndLog(tx, itemsToDeduct, userId);

      return { oldInventory: inventory, newInventory: updatedInventories[0] };
    });
  }

  private postAuditEvent(
    eventName: string, 
    actorId: string, 
    action: string, 
    entity: string, 
    entityId: string, 
    oldValue: unknown, 
    newValue: unknown,
  ) {
    this.eventEmitter.emit(eventName, {         
      actorId,
      action,
      entity,
      entityId,
      oldValue,        
      newValue,   
    });
  }
}