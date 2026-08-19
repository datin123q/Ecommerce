import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TransactionType } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    // 1. VALIDATE CART 
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: { 
        cartItems: { 
          include: { 
            variant: { 
              include: { product: true } 
            } 
          } 
        } 
      },
    });

    if (!cart || cart.cartItems.length === 0) {
      throw new BadRequestException('Giỏ hàng của bạn đang trống!');
    }

    // CHECK INVENTORY & CALCULATE PRICE
    let totalAmount = 0;
    const orderItemsData: any[] = [];
    const inventoryDeductions: any[] = [];

    for (const item of cart.cartItems) {
      const availableInventory = await this.prisma.inventory.findFirst({
        where: {
          variantId: item.variantId,
          quantity: { gte: item.quantity }, 
        },
      });

      if (!availableInventory) {
        throw new BadRequestException(
          `Sản phẩm ${item.variant.name} không đủ tồn kho!`
        );
      }

      inventoryDeductions.push({
        inventoryId: availableInventory.id,
        quantity: item.quantity,
      });

      const productPrice = item.variant.product.price;
      
      totalAmount += item.quantity * productPrice;
      
      orderItemsData.push({
        variantId: item.variantId,
        quantity: item.quantity,
        price: productPrice,
      });
    }

    // 3. VALIDATE VOUCHER
    let appliedVoucherId: string | null = null; 
    
    if (dto.voucherCode) {
      const voucher = await this.prisma.voucher.findUnique({
        where: { code: dto.voucherCode },
      });

      if (!voucher) throw new NotFoundException('Mã giảm giá không tồn tại');
      if (voucher.count >= voucher.limit) {
        throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
      }

      let discount = voucher.value;
      if (discount > totalAmount) discount = totalAmount; // Chống âm tiền
      totalAmount -= discount;
      
      appliedVoucherId = voucher.id;
    }

    // 4. BEGIN TRANSACTION
    const order = await this.prisma.$transaction(async (prisma) => {
      
      // 4.1. Create Order & Order Items
      const newOrder = await prisma.order.create({
        data: {
          userId,
          totalAmount,
          orderItems: { create: orderItemsData },
        },
        include: { orderItems: true },
      });

      // 4.2. Deduct Inventory & Create Inventory Transactions
      for (const deduction of inventoryDeductions) {
        await prisma.inventory.update({
          where: { id: deduction.inventoryId },
          data: { quantity: { decrement: deduction.quantity } },
        });

        await prisma.inventoryTransaction.create({
          data: {
            type: TransactionType.OUT,
            quantity: deduction.quantity,
            inventoryId: deduction.inventoryId,
            userId: userId,
          },
        });
      }

      // 4.3. Register Voucher Usage
      if (appliedVoucherId) {
        await prisma.voucherUsage.create({
          data: { voucherId: appliedVoucherId, userId, orderId: newOrder.id },
        });

        await prisma.voucher.update({
          where: { id: appliedVoucherId },
          data: { count: { increment: 1 } },
        });
      }

      // 4.4. Clear Cart
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return newOrder; // COMMIT
    });

    // 5. PUSH BACKGROUND JOBS
    this.pushBackgroundJobs(order.id, userId);

    // 6. RETURN ORDER
    return order;
  }

  private pushBackgroundJobs(orderId: string, userId: string) {
    setImmediate(async () => {
      try {
        this.logger.log(`[Job] Đang xử lý các tác vụ ngầm cho đơn hàng ${orderId}...`)
        this.logger.log(`[Job] Hoàn thành background jobs cho đơn ${orderId}.`);
      } catch (error: any) {
        this.logger.error(`[Job Error] Lỗi khi chạy background jobs: ${error.message}`);
      }
    });
  }

  // Xem lịch sử đơn hàng
  getMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        orderItems: { include: { variant: { include: { product: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}