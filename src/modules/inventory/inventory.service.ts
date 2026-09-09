import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { TransactionType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly eventEmitter: EventEmitter2) {}

  // --- NGHIỆP VỤ KHO HÀNG (WAREHOUSE) ---
  async createWarehouse(createWarehouseDto: CreateWarehouseDto, adminId: string) {
    const newWarehouse = await this.prisma.db.warehouse.create({ data: createWarehouseDto });
    this.eventEmitter.emit('warehouse.created', {
      id: adminId,
      action: 'CREATE',
      entity: 'Warehouse',
      entityId: newWarehouse.id,
      oldValue: null,        
      newValue: newWarehouse,   
    });
    return newWarehouse;
  }
  
  async getWarehouses() {
    return this.prisma.db.warehouse.findMany();
  }

  async getInventory(){
    return this.prisma.db.inventory.findMany();
  }

  //sửa thông tin kho
  async update(id: string, updateWarehouseDto: UpdateWarehouseDto, adminId: string) {
    const oldWarehouse = await this.prisma.db.warehouse.findUnique({ where: { id } }); 
    const newWarehouse = await this.prisma.db.warehouse.update({
      where: { id },
      data: updateWarehouseDto,
    });
    this.eventEmitter.emit('warehouse.update', {
      id: adminId,
      action: 'UPDATE',
      entity: 'Warehouse',
      entityId: id,
      oldValue: oldWarehouse,        
      newValue: newWarehouse,   
    });
    return newWarehouse;

  }

    async findOne(id: string) {
    const warehouse = await this.prisma.db.warehouse.findUnique({
      where: { id },
      include: {inventories: true}
    });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho');
    return warehouse;
  }
    async remove(id: string, adminId: string) {
      const oldWarehouse = await this.prisma.db.warehouse.findUnique({ where: { id } }); 
      if (!oldWarehouse) throw new NotFoundException('Không tìm thấy kho');
      const stockCount = await this.prisma.db.inventory.count({
        where: { 
          warehouseId: id,
          quantity: { gt: 0 } 
        }
      });

      if (stockCount > 0) {
        throw new BadRequestException('Không thể xóa kho khi vẫn còn hàng bên trong'); // Lỗi 400 đúng nghĩa hơn 404
      }

      await this.prisma.db.warehouse.delete({ where: { id } });

      this.eventEmitter.emit('warehouse.deleted', { // Đổi tên event chuẩn
        actorId: adminId,
        action: 'DELETE', // Sửa lỗi copy-paste từ CREATE -> DELETE
        entity: 'Warehouse',
        entityId: id,
        oldValue: oldWarehouse,        
        newValue: null,  
      });
    }
  // --- NGHIỆP VỤ NHẬP KHO (STOCK IN) ---
  async stockIn(userId: string, stockInDto: StockInDto) {
    const { warehouseId, variantId, quantity } = stockInDto;
    // 1. Kiểm tra ID kho và ID biến thể gửi lên có thật không
    const warehouse = await this.prisma.db.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho hàng');

    const variant = await this.prisma.db.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm');

    // 2. Tiến hành giao dịch (Transaction)
    const result = await this.prisma.db.$transaction(async (prisma) => {
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
      //  Lưu vào sổ nhật ký kho (Transaction History)
      const transaction = await prisma.inventoryTransaction.create({
        data: {
          type: TransactionType.IN,
          quantity,
          inventoryId: newInventory.id,
          userId, 
        },
      });

      return {oldInventory, newInventory, transaction };
    });

    this.eventEmitter.emit('inventory.stockIn', {
      actorId: userId,
      action: result.oldInventory ? 'UPDATE' : 'CREATE',
      entity: 'Inventory',
      entityId: result.newInventory.id,
      oldValue: result.oldInventory,        
      newValue: result.newInventory,  
    });
    return { newInventory: result.newInventory, transaction: result.transaction };
  }

  async stockOut(userId: string, stockOutDto: StockOutDto) {
    const { warehouseId, variantId, quantity } = stockOutDto;

    // 1. Kiểm tra ID kho và ID biến thể gửi lên có thật không
    const warehouse = await this.prisma.db.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho hàng');

    const variant = await this.prisma.db.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
    
    // 2. Tiến hành giao dịch (Transaction)
    return this.prisma.db.$transaction(async (prisma) => {
      const oldInventory = await prisma.inventory.findUnique({
      where: {
        warehouseId_variantId: { warehouseId, variantId },
      },
      });
      if(oldInventory && oldInventory.quantity<stockOutDto.quantity){throw new NotFoundException('Số lượng tồn kho không đủ')} 
      if (!oldInventory || oldInventory.quantity < quantity) {
        throw new BadRequestException(`Số lượng tồn kho không đủ (Hiện có: ${oldInventory?.quantity || 0})`);
      }
      //  Cập nhật tồn kho (Upsert)
      const newInventory = await prisma.inventory.update({
        where: {
          warehouseId_variantId: { warehouseId, variantId },
        },
        data: { quantity: { decrement: quantity } },
      });

      //  Lưu vào sổ nhật ký kho (Transaction History)
      const transaction = await prisma.inventoryTransaction.create({
        data: {
          type: TransactionType.OUT,
          quantity,
          inventoryId: newInventory.id,
          userId, 
        },
      });

      this.eventEmitter.emit('inventory.stockOut', {
        id: userId,
        action: oldInventory?'UPDATE' : 'CREATE',
        entity: 'Inventory',
        entityId: newInventory.id,
        oldValue: oldInventory,        
        newValue: newInventory,   
      });

      return { newInventory, transaction };
    });
  }
}