import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetAllOrdersDto } from './dto/all-orders.dto';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client-core';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { StateTransition } from './domain/state-transition';
import { PriceCalculation } from './domain/price-calculation';
import { InventoryAllocation } from './domain/inventory-allocation';
import { RedisCacheService } from '../../redis/redisCache.service';
import { InventoryService } from '../inventory/inventory.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { CartsService } from '../carts/carts.service';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { RedisInventoryService } from '../inventory/redis-inventory.service';


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
    private readonly redisInventoryService: RedisInventoryService,
    @InjectQueue('order-queue') private readonly orderQueue: Queue,
  ) {}

  async getDashboardSummary(from: Date, to: Date) {
    const createdAt = { gte: from, lt: to };
    const [totalOrders, ordersByStatus, orderValue] = await Promise.all([
      this.prisma.db.order.count({ where: { createdAt } }),
      this.prisma.db.order.groupBy({
        by: ['status'],
        where: { createdAt },
        _count: { _all: true },
      }),
      this.prisma.db.order.aggregate({
        where: { createdAt, status: { not: OrderStatus.CANCELLED } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    return { totalOrders, ordersByStatus, orderValue };
  }

  getDashboardDateRange(fromValue?: string, toValue?: string) {
    const to = toValue ? new Date(toValue) : new Date();
    const from = fromValue
      ? new Date(fromValue)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException(
        '`from` phải nhỏ hơn `to` và cả hai phải là ngày hợp lệ.',
      );
    }

    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Khoảng thời gian tối đa là 366 ngày.');
    }

    return { from, to };
  }

  async getDashboardTopProducts(from: Date, to: Date, limit: number) {
    const groupedItems = await this.prisma.db.orderItem.groupBy({
      by: ['productName', 'sku', 'price'],
      where: {
        order: {
          is: {
            status: OrderStatus.PAID,
            createdAt: { gte: from, lt: to },
            payment: { is: { status: PaymentStatus.SUCCESS } },
          },
        },
      },
      _sum: { quantity: true },
    });

    const totals = new Map<string, {
      productName: string;
      sku: string;
      unitsSold: number;
      revenue: number;
    }>();
    for (const item of groupedItems) {
      const key = JSON.stringify([item.productName, item.sku]);
      const unitsSold = item._sum.quantity ?? 0;
      const total = totals.get(key) ?? {
        productName: item.productName,
        sku: item.sku,
        unitsSold: 0,
        revenue: 0,
      };
      total.unitsSold += unitsSold;
      total.revenue += unitsSold * item.price;
      totals.set(key, total);
    }

    return [...totals.values()]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, limit);
  }

  getDashboardRecentOrders(limit: number) {
    return this.prisma.db.order.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        user: { select: { id: true, email: true, fullName: true } },
        payment: { select: { status: true, method: true } },
        _count: { select: { orderItems: true } },
      },
    });
  }

  //  PUBLIC METHODS
  async createOrder(userId: string, dto: CreateOrderDto) {
    const cart = await this.cartsService.getCartForCheckout(userId);    
    const variantIds = cart.cartItems.map(item => item.variantId);
    
    const voucher = dto.voucherCode 
      ? await this.voucherService.validateAndGetVoucher(dto.voucherCode) 
      : null;
    const isFlashSale = await this.redisInventoryService.checkIfFlashSaleActive(variantIds);
    // === FLASH SALE 
    if (isFlashSale) {
      if (cart.cartItems.length !== 1) {
        throw new BadRequestException(
          'Đơn Flash Sale chỉ được chứa một sản phẩm.',
        );
      }
      const item = cart.cartItems[0];

      const inventories = await this.inventoryService.getInventoriesByVariantIds([item.variantId]);

      const allocatedItems = InventoryAllocation.allocate(cart.cartItems, inventories);

      const itemsSnapshot = this.buildOrderItemsSnapshot(cart, allocatedItems);

      const pricing = PriceCalculation.calculate(cart.cartItems, voucher);

      await this.redisInventoryService.executeDeduct(
        item.variantId,
        item.quantity,
      );
      try {
          await this.orderQueue.add(
            'process-flash-sale-db',
            {
              userId,
              cartId: cart.id,
              pricing,
              itemsSnapshot,
              flashReservation: {
                variantId: item.variantId,
                quantity: item.quantity,
              },
            },
            {
              removeOnComplete: true,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          );
        } catch (error) {
          await this.redisInventoryService.restoreStock(
            item.variantId,
            item.quantity,
          );
          throw error;
        }

        const cacheKey = this.cartsService.getCacheKey(userId);
        this.cacheService.del(cacheKey).catch((error) => {
          this.logger.error(`Không xóa được cart cache: ${error.message}`);
        });

        return {
          success: true,
          message: 'Đơn hàng đang được xử lý.',
          status: OrderStatus.PENDING,
        };
      }

    // === ĐƠN HÀNG BÌNH THƯỜNG ===
    const inventories = await this.inventoryService.getInventoriesByVariantIds(variantIds);
    
    const allocatedItems: AllocatedItem[] = InventoryAllocation.allocate(cart.cartItems, inventories);
    const pricing: PricingResult = PriceCalculation.calculate(cart.cartItems, voucher);
    const itemsSnapshot = this.buildOrderItemsSnapshot(cart, allocatedItems);

    const order = await this.executeOrderTransaction(userId, pricing, itemsSnapshot);

    await this.postOrderCreation({ id: order.id, userId }, cart.id);
 
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
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    StateTransition.validateTransition(order.status, newStatus);

    if (newStatus === OrderStatus.PAID) {
      const payment = await this.prisma.db.payment.findUnique({
        where: { orderId },
        select: { status: true },
      });
      if (payment?.status !== PaymentStatus.SUCCESS) {
        throw new BadRequestException(
          'Chỉ có thể chuyển đơn sang PAID khi thanh toán đã SUCCESS.',
        );
      }
    }

    if (newStatus === OrderStatus.CANCELLED) {
      const cancelledOrder = await this.executeCancelTransaction(
        order.userId,
        order,
      );
      this.postOrderCancellation({
        id: cancelledOrder.id,
        userId: cancelledOrder.userId,
      });
      return cancelledOrder;
    }

    const updated = await this.prisma.db.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: newStatus }
    });
    if (updated.count === 0) {
      throw new BadRequestException('Trạng thái đơn hàng vừa được thay đổi.');
    }

    const updatedOrder = await this.prisma.db.order.findUniqueOrThrow({
      where: { id: orderId },
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

  async getMyOrderById(userId: string, orderId: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId, userId },
      include: {
        orderItems: true,
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    return {
      ...order,
      paymentStatus: order.payment?.status,
    };
  }

  public buildOrderItemsSnapshot(
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

  async executeOrderTransaction(
    userId: string,  
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

      // 2. Gọi service trừ kho & ghi sổ
      await this.inventoryService.deductStockAndLog(tx, items as AllocatedItem[], userId);

      return newOrder;
    },{
      maxWait: 5000,
      timeout: 15000,
      }
    );
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

  public async executeCancelTransaction(
    userId: string, 
    order: Prisma.OrderGetPayload<{ include: { orderItems: true } }>
  ) {
    return this.prisma.db.$transaction(async (tx) => {
      const cancellation = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED },
      });
      if (cancellation.count === 0) {
        throw new BadRequestException('Trạng thái đơn hàng vừa được thay đổi.');
      }

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

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { orderItems: true },
      });
    });
  }

  public async postOrderCreation(order: { id: string, userId: string }, cartId: string) {
    this.eventEmitter.emit('order.created', {
      userId: order.userId,
      content: `Đơn hàng mã số ${order.id} đã được xác nhận`
    });
    
    // Xóa cache giỏ hàng
    const cacheKey = this.cartsService.getCacheKey(order.userId);
    this.cacheService.del(cacheKey).catch(err => 
      this.logger.error(`Lỗi xóa cache giỏ hàng: ${err.message}`)
    );

    await this.orderQueue.add(
      'cleanup-cart', 
      { 
        userId: order.userId, 
        orderId: order.id,
        cartId: cartId 
      }, 
      {
        removeOnComplete: true, 
        attempts: 3, 
        backoff: { type: 'exponential', delay: 2000 }
      }
    );
  }

  private postOrderCancellation(order: { id: string, userId: string }) {
    this.eventEmitter.emit('order.cancelled', {
      userId: order.userId,
      orderId: order.id,
      content: `Đơn hàng mã số ${order.id} đã được hủy thành công`,
    });
  }

  async startFlashSale(variantId: string, quantity: number): Promise<void> {
    const key = `inventory:variant:${variantId}`;
    const stock = await this.prisma.db.inventory.aggregate({
      where: { variantId },
      _sum: { quantity: true },
    });
    const availableStock = stock._sum.quantity ?? 0;

    if (availableStock < quantity) {
      throw new BadRequestException('Tồn kho không đủ để mở Flash Sale');
    }
    await this.cacheService.setNumber(key, quantity, 60 * 60 * 1000);
  }

  public async getAllOrders(query: GetAllOrdersDto){
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from >= to) {
      throw new BadRequestException('`from` phải nhỏ hơn `to`.');
    }

    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.email?.trim()
        ? {
            user: {
              is: {
                email: { contains: query.email.trim(), mode: 'insensitive' },
              },
            },
          }
        : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.masterClient.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, email: true, fullName: true } },
          payment: { select: { status: true, method: true } },
          _count: { select: { orderItems: true } },
        },
      }),
      this.prisma.masterClient.order.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getOneOrder(orderId: string) {
    const order = await this.prisma.masterClient.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        payment: true,
        orderItems: true,
        voucherUsages: { include: { voucher: true } },
      },
    });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');
    return order;
  }
}
