import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TransactionType, OrderStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { StateTransition } from './domain/state-transition';
import { PriceCalculation } from './domain/price-calculation';
import { InventoryAllocation } from './domain/inventory-allocation';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService, 
    private readonly eventEmitter: EventEmitter2
  ) {}
  
  async createOrder(userId: string, dto: CreateOrderDto) {
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: { cartItems: { include: { variant: { include: { product: true } } } } },
    });
    
    if (!cart || cart.cartItems.length === 0) {
      throw new BadRequestException('Giỏ hàng của bạn đang trống!');
    }

    const variantIds = cart.cartItems.map(item => item.variantId);
    const inventories = await this.prisma.inventory.findMany({
      where: { variantId: { in: variantIds } },
      orderBy: { quantity: 'desc' },
    });

    const voucher = dto.voucherCode 
      ? await this.prisma.voucher.findUnique({ where: { code: dto.voucherCode } })
      : undefined;
      
    if (dto.voucherCode && !voucher) {
      throw new NotFoundException('Mã giảm giá không tồn tại');
    }

    const orderItemsData = InventoryAllocation.allocate(cart.cartItems, inventories);
    const { totalAmount, appliedVoucherId, voucherLimit } = PriceCalculation.calculate(cart.cartItems, voucher);

    const order = await this.prisma.$transaction(async (prisma) => {
      // 3.1. Tạo Đơn hàng kèm OrderItems
      const newOrder = await prisma.order.create({
        data: {
          userId,
          totalAmount,
          orderItems: { create: orderItemsData }, 
        },
        include: { orderItems: true },
      });

      // 3.2. Trừ tồn kho từ orderItemsData
      const updateInventoryPromises = orderItemsData.map(item => 
        prisma.inventory.updateMany({
          where: { id: item.inventoryId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        })
      );
      const inventoryResults = await Promise.all(updateInventoryPromises);
      
      if (inventoryResults.some(res => res.count === 0)) {
        throw new BadRequestException('Lỗi tương tranh: Có sản phẩm trong giỏ vừa bị người khác mua hết!');
      }

      // 3.3. Ghi log giao dịch xuất kho
      const transactionLogs = orderItemsData.map(item => ({
        type: TransactionType.OUT, 
        quantity: item.quantity,
        inventoryId: item.inventoryId,
        userId: userId,
      }));

      await this.prisma.inventoryTransaction.createMany({data: transactionLogs});

      // 3.4. Xử lý Voucher 
      if (appliedVoucherId && voucherLimit) {
        const updateVoucher = await prisma.voucher.updateMany({
          where: { id: appliedVoucherId, count: { lt: voucherLimit } },
          data: { count: { increment: 1 } },
        });
        
        if (updateVoucher.count === 0) {
          throw new BadRequestException('Mã giảm giá vừa chạm mức giới hạn, vui lòng bỏ mã ra khỏi giỏ!');
        }

        await prisma.voucherUsage.create({
          data: { voucherId: appliedVoucherId, userId, orderId: newOrder.id },
        });
      }

      // 3.5. Xóa giỏ hàng
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      
      return newOrder;
    });

    this.eventEmitter.emit('order.created', {
      userId: order.userId,
      content: `Đơn hàng mã số ${order.id} đã được xác nhận`
    });

    return order;
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    StateTransition.validateTransition(order.status, newStatus);

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus }
    });
  }

  getMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { orderItems: { include: { variant: { include: { product: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Đơn hàng không tồn tại hoặc không thuộc quyền sở hữu của bạn');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn hàng ở trạng thái đang chờ xử lý (PENDING)');
    }

    const cancelledOrder = await this.prisma.$transaction(async (prisma) => {
      const validItems = order.orderItems.filter(item => item.inventoryId);
        // 3.1. Hoàn trả số lượng hàng vào kho (Chạy song song bằng Promise.all thay vì for...of)
      const updateInventoryPromises = validItems.map(item =>
        prisma.inventory.update({
          where: { id: item.inventoryId! }, // Đã filter null ở trên
          data: { quantity: { increment: item.quantity } },
        })
      );
      await Promise.all(updateInventoryPromises);
      // 3.2. Hoàn trả mã giảm giá
      const voucherUsage = await prisma.voucherUsage.findFirst({
        where: { orderId: order.id, userId: userId },
      });

      if (validItems.length > 0) {
        const inTransactionLogs = validItems.map(item => ({
          type: TransactionType.IN,
          quantity: item.quantity,
          inventoryId: item.inventoryId!,
          userId: userId,
        }));
        await prisma.inventoryTransaction.createMany({ data: inTransactionLogs });
      }
      //3.2 Hoàn trả mã giảm giá
      if (voucherUsage) {
        await prisma.voucher.update({
          where: { id: voucherUsage.voucherId, count: { gt: 0 } },
          data: { count: { decrement: 1 } },
        });

        await prisma.voucherUsage.delete({
          where: { id: voucherUsage.id },
        });
      }

      // 3.3. Cập nhật trạng thái
      return prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });
    });

    this.eventEmitter.emit('order.cancelled', {
      userId,
      orderId: cancelledOrder.id,
      content: `Đơn hàng mã số ${cancelledOrder.id} đã được hủy thành công`,
    });

    return {
      success: true,
      message: 'Hủy đơn hàng và hoàn trả tài nguyên thành công',
      data: cancelledOrder
    };
  }
}