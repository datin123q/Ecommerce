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
    if (!cart || cart.cartItems.length === 0) throw new BadRequestException('Giỏ hàng của bạn đang trống!');

    const variantIds = cart.cartItems.map(item => item.variantId);
    const inventories = await this.prisma.inventory.findMany({
      where: { variantId: { in: variantIds } },
      orderBy: { quantity: 'desc' },
    });

    const voucher = dto.voucherCode 
      ? await this.prisma.voucher.findUnique({ where: { code: dto.voucherCode } })
      : undefined;
    if (dto.voucherCode && !voucher) throw new NotFoundException('Mã giảm giá không tồn tại');
    const inventoryDeductions = InventoryAllocation.allocate(cart.cartItems, inventories);
    const { totalAmount, orderItemsData, appliedVoucherId, voucherLimit } = PriceCalculation.calculate(cart.cartItems, voucher);
    const order = await this.prisma.$transaction(async (prisma) => {
      
      // 3.1. Tạo Đơn hàng
      const newOrder = await prisma.order.create({
        data: {
          userId,
          totalAmount,
          orderItems: { create: orderItemsData },
        },
        include: { orderItems: true },
      });

      const updateInventoryPromises = inventoryDeductions.map(deduction => 
        prisma.inventory.updateMany({
          where: { id: deduction.inventoryId, quantity: { gte: deduction.quantity } },
          data: { quantity: { decrement: deduction.quantity } },
        })
      );
      const inventoryResults = await Promise.all(updateInventoryPromises);
      if (inventoryResults.some(res => res.count === 0)) {
        throw new BadRequestException('Lỗi tương tranh: Có sản phẩm trong giỏ vừa bị người khác mua hết!');
      }
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
      if (appliedVoucherId && voucherLimit) {
        const updateVoucher = await prisma.voucher.updateMany({
          where: { id: appliedVoucherId, count: { lt: voucherLimit } },
          data: { count: { increment: 1 } },
        });
        if (updateVoucher.count === 0) throw new BadRequestException('Mã giảm giá vừa chạm mức giới hạn, vui lòng bỏ mã ra khỏi giỏ!');

        await prisma.voucherUsage.create({
          data: { voucherId: appliedVoucherId, userId, orderId: newOrder.id },
        });
      }

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
    // 1. Kiểm tra đơn hàng có tồn tại và thuộc về user không
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Đơn hàng không tồn tại hoặc không thuộc quyền sở hữu của bạn');
    }

    // 2. Chỉ cho phép hủy khi trạng thái là PENDING
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn hàng ở trạng thái đang chờ xử lý (PENDING)');
    }

    // 3. Mở Transaction để xử lý hoàn tác
    const cancelledOrder = await this.prisma.$transaction(async (prisma) => {
      
      // 3.1. Hoàn trả số lượng hàng vào kho (Inventory)
      for (const item of order.orderItems) {
        // Ưu tiên hoàn trả vào lô hàng mới nhất của variant này
        const inventory = await prisma.inventory.findFirst({
          where: { variantId: item.variantId },
          orderBy: { updatedAt: 'desc' },
        });

        if (inventory) {
          // Cộng lại số lượng vào kho
          await prisma.inventory.update({
            where: { id: inventory.id },
            data: { quantity: { increment: item.quantity } },
          });

          // Ghi log giao dịch nhập lại kho
          await prisma.inventoryTransaction.create({
            data: {
              type: TransactionType.IN,
              quantity: item.quantity,
              inventoryId: inventory.id,
              userId: userId,
            },
          });
        }
      }

      // 3.2. Hoàn trả mã giảm giá
      const voucherUsage = await prisma.voucherUsage.findFirst({
        where: { orderId: order.id, userId: userId },
      });

      if (voucherUsage) {
        // Hoàn lại 1 lượt sử dụng voucher
        await prisma.voucher.update({
          where: { id: voucherUsage.voucherId },
          data: { count: { decrement: 1 } },
        });

        // Xóa log đã dùng voucher của đơn này để user có thể dùng lại
        await prisma.voucherUsage.delete({
          where: { id: voucherUsage.id },
        });
      }

      // 3.3. Cập nhật trạng thái đơn hàng thành CANCELLED (Thay vì xóa)
      return prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });
    });

    // 4. Emit event thông báo đơn hàng đã bị hủy
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