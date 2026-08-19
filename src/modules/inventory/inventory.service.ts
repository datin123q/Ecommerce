import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { StockInDto } from './dto/stock-in.dto';
import { TransactionType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // --- NGHIỆP VỤ KHO HÀNG (WAREHOUSE) ---
  createWarehouse(createWarehouseDto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: createWarehouseDto });
  }
  
  getWarehouses() {
    return this.prisma.warehouse.findMany();
  }

  getInventory(){
    return this.prisma.inventory.findMany();
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
      
      //  Cập nhật tồn kho (Upsert)
      const inventory = await prisma.inventory.upsert({
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
          inventoryId: inventory.id,
          userId, 
        },
      });

      return { inventory, transaction };
    });
  }
}