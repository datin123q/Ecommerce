import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { StateTransition } from './domain/state-transition';
import { PriceCalculation } from './domain/price-calculation';
import { InventoryAllocation } from './domain/inventory-allocation';
import { RedisCacheService } from '../../redis/redisCache.service';
import { InventoryService } from '../inventory/inventory.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { CartsService } from '../carts/carts.service';


export type CartWithItems = Prisma.CartGetPayload<{
  include: { cartItems: { include: { variant: { include: { product: true } } } } }
}>;

export type AllocatedItem = {
  variantId: string;
  quantity: number;
  price: number;
  inventoryId: string;
};

export type PricingResult = {
  totalAmount: number;
  appliedVoucherId?: string;
  voucherLimit?: number;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
    private readonly inventoryService: InventoryService, 
    private readonly voucherService: VouchersService,
    private readonly cartsService: CartsService,
  ) {}

  //  PUBLIC METHODS
  async createOrder(userId: string, dto: CreateOrderDto) {
    const cart = await this.cartsService.getCartForCheckout(userId);    
    const variantIds = cart.cartItems.map(item => item.variantId);
    const inventories = await this.inventoryService.getInventoriesByVariantIds(variantIds);
    
    const voucher = dto.voucherCode 
      ? await this.voucherService.validateAndGetVoucher(dto.voucherCode) 
      : null;

    const allocatedItems: AllocatedItem[] = InventoryAllocation.allocate(cart.cartItems, inventories);
    const pricing: PricingResult = PriceCalculation.calculate(cart.cartItems, voucher);
    const itemsSnapshot = this.buildOrderItemsSnapshot(cart, allocatedItems);

    const order = await this.executeOrderTransaction(userId, cart.id, pricing, itemsSnapshot);

    this.postOrderCreation({ id: order.id, userId });

    return order;
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.validateAndGetOrderForCancel(userId, orderId);

    const cancelledOrder = await this.executeCancelTransaction(userId, order);

    this.postOrderCancellation({ id: cancelledOrder.id, userId: cancelledOrder.userId });

    return {
      success: true,
      message: 'Hủy đơn hàng và hoàn trả tài nguyên thành công',
      data: cancelledOrder
    };
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus) {
    const order = await this.prisma.db.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    StateTransition.validateTransition(order.status, newStatus);

    const updatedOrder = await this.prisma.db.order.update({
      where: { id: orderId },
      data: { status: newStatus }
    });

    this.eventEmitter.emit('order.statusUpdated', {
      userId: updatedOrder.userId,
      content: `Đơn hàng mã số ${orderId} của bạn đã được cập nhật sang trạng thái: ${newStatus}`
    });

    return updatedOrder;
  }

  getMyOrders(userId: string) {
    return this.prisma.db.order.findMany({
      where: { userId },
      include: { orderItems: true }, 
      orderBy: { createdAt: 'desc' },
    });
  }

  getOneOrder(orderId: string) {
    return this.prisma.db.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true }
    });
  }

  // PRIVATE METHODS
  private buildOrderItemsSnapshot(
    cart: CartWithItems, 
    allocatedItems: AllocatedItem[]
  ): Prisma.OrderItemCreateManyOrderInput[] {
    return allocatedItems.map(item => {
      const cartItem = cart.cartItems.find(c => c.variantId === item.variantId);
      if (!cartItem?.variant) {
        throw new BadRequestException('Một sản phẩm trong giỏ hàng không còn tồn tại.');
      }

      return {
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price,
        inventoryId: item.inventoryId,
        productName: `${cartItem.variant.product.name} - ${cartItem.variant.name}`,
        sku: cartItem.variant.sku,
      };
    });
  }

  private async executeOrderTransaction(
    userId: string, 
    cartId: string, 
    pricing: PricingResult, 
    items: Prisma.OrderItemCreateManyOrderInput[]
  ) {
    return this.prisma.db.$transaction(async (tx) => {
      // 1. Tạo vỏ đơn hàng
      const newOrder = await tx.order.create({
        data: {
          userId,
          totalAmount: pricing.totalAmount,
          orderItems: { create: items },
        },
        include: { orderItems: true },
      });

      // 2. Gọi service trừ kho & ghi sổ
      await this.inventoryService.deductStockAndLog(tx, items as AllocatedItem[], userId);

      // 3. Gọi service áp mã giảm giá
      if (pricing.appliedVoucherId) {
        await this.voucherService.applyVoucher(
          tx, 
          pricing.appliedVoucherId, 
          pricing.voucherLimit ?? 0, 
          userId, 
          newOrder.id
        );
      }

      // 4. Xóa giỏ hàng 
      await tx.cartItem.deleteMany({ where: { cartId } });

      return newOrder;
    });
  }

  private async validateAndGetOrderForCancel(userId: string, orderId: string) {
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId }, 
      include: { orderItems: true },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Đơn hàng không tồn tại hoặc không thuộc quyền sở hữu của bạn');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn hàng ở trạng thái đang chờ xử lý (PENDING)');
    }

    return order;
  }

  private async executeCancelTransaction(
    userId: string, 
    order: Prisma.OrderGetPayload<{ include: { orderItems: true } }>
  ) {
    return this.prisma.db.$transaction(async (tx) => {
      const validItems = order.orderItems
      .filter(item => item.inventoryId !== null)
      .map(item => ({
        inventoryId: item.inventoryId as string,
        quantity: item.quantity
      }))

      if (validItems.length !== order.orderItems.length) {
        this.logger.warn(`Phát hiện đơn hàng ${order.id} có sản phẩm không liên kết kho khi hủy!`);
      }

      if (validItems.length > 0) {
        // 1. Gọi service hoàn kho & ghi sổ
        await this.inventoryService.restoreStockAndLog(tx, validItems, userId);
      }

      // 2. Gọi service hoàn voucher (nếu có)
      await this.voucherService.restoreVoucher(tx, order.id, userId);

      // 3. Cập nhật trạng thái đơn hàng
      return tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });
    });
  }

  private postOrderCreation(order: { id: string, userId: string }) {
    this.eventEmitter.emit('order.created', {
      userId: order.userId,
      content: `Đơn hàng mã số ${order.id} đã được xác nhận`
    });
    
    // Xóa cache giỏ hàng
    const cacheKey = this.cartsService.getCacheKey(order.userId);
    this.cacheService.del(cacheKey).catch(err => 
      this.logger.error(`Lỗi xóa cache giỏ hàng: ${err.message}`)
    );
  }

  private postOrderCancellation(order: { id: string, userId: string }) {
    this.eventEmitter.emit('order.cancelled', {
      userId: order.userId,
      orderId: order.id,
      content: `Đơn hàng mã số ${order.id} đã được hủy thành công`,
    });
  }
}