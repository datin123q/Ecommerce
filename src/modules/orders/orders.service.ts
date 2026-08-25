import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TransactionType } from '@prisma/client';
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService, private readonly notificationsService: NotificationsService,) {}
  
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

const variantIds = cart.cartItems.map(item => item.variantId);
    
    const inventories = await this.prisma.inventory.findMany({
      where: { variantId: { in: variantIds } },
      orderBy: { quantity: 'desc' },
    });

    const stockMap = new Map<string, number>();
    for (const inv of inventories) {
      const currentTotal = stockMap.get(inv.variantId) || 0;
      stockMap.set(inv.variantId, currentTotal + inv.quantity);
    }

    for (const item of cart.cartItems) {
      const totalAvailable = stockMap.get(item.variantId) || 0;
      if (totalAvailable < item.quantity) {
        throw new BadRequestException(`Sản phẩm ${item.variant.name} không đủ tồn kho trên toàn hệ thống!`);
      }
    }

    let totalAmount = 0;
    const orderItemsData: any[] = [];
    const inventoryDeductions: any[] = [];

    const mutableInventories = inventories.map(inv => ({ ...inv }));

    for (const item of cart.cartItems) {
      let remainingNeeded = item.quantity;
      for (const inv of mutableInventories) {
        if (inv.variantId === item.variantId && inv.quantity > 0) {
          const takeFromThisWarehouse = Math.min(inv.quantity, remainingNeeded);

          inventoryDeductions.push({
            inventoryId: inv.id,          
            quantity: takeFromThisWarehouse, 
          });

          inv.quantity -= takeFromThisWarehouse; 
          remainingNeeded -= takeFromThisWarehouse;

          if (remainingNeeded === 0) break; 
        }
      }

      const productPrice = item.variant.product.price;
      totalAmount += item.quantity * productPrice;

      orderItemsData.push({
        variantId: item.variantId,
        quantity: item.quantity,
        price: productPrice,
      });
    }

    //  VALIDATE VOUCHER
    let appliedVoucherId: string | null = null; 
    let voucherLimit = 0;
    if (dto.voucherCode) {
      const voucher = await this.prisma.voucher.findUnique({
        where: { code: dto.voucherCode },
      });

      if (!voucher) throw new NotFoundException('Mã giảm giá không tồn tại');
      if (voucher.count >= voucher.limit) {
        throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
      }

      let discount = voucher.value;
      if (discount > totalAmount) discount = totalAmount; 
      totalAmount -= discount;
      
      appliedVoucherId = voucher.id;
      voucherLimit = voucher.limit;
    }

    //  BEGIN TRANSACTION
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


    // Dùng updateMany để gài điều kiện gte 
    const updateInventoryPromises = inventoryDeductions.map(deduction => 
      prisma.inventory.updateMany({
        where: { 
          id: deduction.inventoryId,
          quantity: { gte: deduction.quantity } // CHỐT CHẶN RACE CONDITION
        },
        data: { quantity: { decrement: deduction.quantity } },
      })
    );

    const inventoryResults = await Promise.all(updateInventoryPromises);
    
    // Kiểm tra xem có lệnh update kho nào bị fail do thiếu hàng không
    const hasFailedInventory = inventoryResults.some(res => res.count === 0);
    if (hasFailedInventory) {
      throw new BadRequestException('Lỗi tương tranh: Có sản phẩm trong giỏ vừa bị người khác mua hết!');
    }
    // 4.3. Create Inventory Transactions (Song song)
    const logPromises = inventoryDeductions.map(deduction => 
      prisma.inventoryTransaction.create({
        data: {
          type: TransactionType.OUT, 
          quantity: deduction.quantity,
          inventoryId: deduction.inventoryId,
          userId: userId,
        },
      })
    );
    await Promise.all(logPromises);
      // 4.4. Register Voucher Usage
      if (appliedVoucherId) {
        const updateVoucher = await prisma.voucher.updateMany({
          where: { 
            id: appliedVoucherId,
            count: { lt: voucherLimit } // Đảm bảo chưa vượt quá giới hạn
          },
          data: { count: { increment: 1 } },
        });

        if (updateVoucher.count === 0) {
          throw new BadRequestException('Mã giảm giá vừa chạm mức giới hạn, vui lòng bỏ mã ra khỏi giỏ!');
        }

        await prisma.voucherUsage.create({
          data: { voucherId: appliedVoucherId, userId, orderId: newOrder.id },
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
    return this.notificationsService.pushNotificationToQueue(
      userId, 
      `Đơn hàng mã số ${orderId} đã được xác nhận`
    );
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