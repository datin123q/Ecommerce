import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService, CartWithItems, AllocatedItem, PricingResult } from './orders.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { InventoryService } from '../inventory/inventory.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { CartsService } from '../carts/carts.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

// Import trực tiếp các Domain Class để Mock Static Method
import { InventoryAllocation } from './domain/inventory-allocation';
import { PriceCalculation } from './domain/price-calculation';
import { StateTransition } from './domain/state-transition';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;
  let cacheService: RedisCacheService;
  let inventoryService: InventoryService;
  let voucherService: VouchersService;
  let cartsService: CartsService;

  // 1. KHỞI TẠO CÁC MOCK OBJECTS
  const mockPrismaService = {
    db: {
      order: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      cartItem: {
        deleteMany: jest.fn(),
      },
      // Kỹ thuật Mock Prisma Transaction
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrismaService.db);
      }),
    },
  };

  const mockEventEmitter = { emit: jest.fn() };
  const mockCacheService = { del: jest.fn().mockResolvedValue(true) };
  
  const mockInventoryService = {
    getInventoriesByVariantIds: jest.fn(),
    deductStockAndLog: jest.fn(),
    restoreStockAndLog: jest.fn(),
  };

  const mockVouchersService = {
    validateAndGetVoucher: jest.fn(),
    applyVoucher: jest.fn(),
    restoreVoucher: jest.fn(),
  };

  const mockCartsService = {
    getCartForCheckout: jest.fn(),
    getCacheKey: jest.fn().mockReturnValue('cart_user-1_v'),
  };

  // Dữ liệu mẫu (Fixtures)
  const userId = 'user-1';
  const orderId = 'order-1';
  const mockCart: any = {
    id: 'cart-1',
    cartItems: [
      {
        variantId: 'var-1',
        variant: { sku: 'SKU-01', name: 'Size L', product: { name: 'Áo Thun' } },
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: RedisCacheService, useValue: mockCacheService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: VouchersService, useValue: mockVouchersService },
        { provide: CartsService, useValue: mockCartsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    cacheService = module.get<RedisCacheService>(RedisCacheService);
    inventoryService = module.get<InventoryService>(InventoryService);
    voucherService = module.get<VouchersService>(VouchersService);
    cartsService = module.get<CartsService>(CartsService);

    jest.clearAllMocks();

    // 2. MOCK CÁC STATIC METHODS TỪ LỚP DOMAIN
    jest.spyOn(InventoryAllocation, 'allocate').mockReturnValue([
      { variantId: 'var-1', quantity: 2, price: 100, inventoryId: 'inv-1' },
    ]);
    jest.spyOn(PriceCalculation, 'calculate').mockReturnValue({
      totalAmount: 200,
      appliedVoucherId: 'voucher-1',
      voucherLimit: 1,
    });
    jest.spyOn(StateTransition, 'validateTransition').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // TEST SUITE: createOrder
  // ===================================================================
  describe('createOrder', () => {
    const dto = { voucherCode: 'SALE10' };

    it('Nên thực thi giao dịch tạo đơn hàng, trừ kho, áp voucher, xóa giỏ và bắn sự kiện', async () => {
      // Chuẩn bị Mock dữ liệu trả về
      mockCartsService.getCartForCheckout.mockResolvedValue(mockCart);
      mockInventoryService.getInventoriesByVariantIds.mockResolvedValue([]);
      const mockVoucher = { id: 'voucher-1' };
      mockVouchersService.validateAndGetVoucher.mockResolvedValue(mockVoucher);
      
      const createdOrder = { id: orderId, userId };
      mockPrismaService.db.order.create.mockResolvedValue(createdOrder);

      // Thực thi
      const result = await service.createOrder(userId, dto);

      // Kiểm tra luồng dữ liệu (Data flow)
      expect(result).toEqual(createdOrder);
      expect(voucherService.validateAndGetVoucher).toHaveBeenCalledWith('SALE10');
      
      // Kiểm tra Transaction thực thi đúng các lệnh nội bộ
      expect(prisma.db.order.create).toHaveBeenCalled();
      expect(inventoryService.deductStockAndLog).toHaveBeenCalledWith(
        mockPrismaService.db, // tx mock
        expect.any(Array),
        userId
      );
      expect(voucherService.applyVoucher).toHaveBeenCalledWith(
        mockPrismaService.db, // tx mock
        'voucher-1',
        1, // voucherLimit
        userId,
        orderId
      );
      expect(prisma.db.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: mockCart.id } });

      // Kiểm tra Side-Effects (Events & Cache)
      expect(eventEmitter.emit).toHaveBeenCalledWith('order.created', expect.any(Object));
      expect(cacheService.del).toHaveBeenCalledWith('cart_user-1_v');
    });

    it('Nên ném BadRequestException khi buildOrderItemsSnapshot nếu sản phẩm trong giỏ bị lỗi', async () => {
      // Giả lập một lỗi logic: cartItem không có variant (bị xóa khỏi DB trước đó)
      const invalidCart = { id: 'cart-1', cartItems: [{ variantId: 'var-1', variant: null }] };
      mockCartsService.getCartForCheckout.mockResolvedValue(invalidCart);
      mockInventoryService.getInventoriesByVariantIds.mockResolvedValue([]);

      await expect(service.createOrder(userId, dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ===================================================================
  // TEST SUITE: cancelOrder
  // ===================================================================
  describe('cancelOrder', () => {
    const mockOrder: any = {
      id: orderId,
      userId,
      status: OrderStatus.PENDING,
      orderItems: [{ inventoryId: 'inv-1', quantity: 2 }],
    };

    it('Nên ném NotFoundException nếu đơn hàng không tồn tại hoặc sai userId', async () => {
      mockPrismaService.db.order.findUnique.mockResolvedValue(null);
      await expect(service.cancelOrder(userId, orderId)).rejects.toThrow(NotFoundException);
    });

    it('Nên ném BadRequestException nếu đơn hàng KHÔNG ở trạng thái PENDING', async () => {
      mockPrismaService.db.order.findUnique.mockResolvedValue({ ...mockOrder, status: OrderStatus.PROCESSING });
      await expect(service.cancelOrder(userId, orderId)).rejects.toThrow(BadRequestException);
    });

    it('Nên hủy đơn, hoàn kho, hoàn voucher và bắn sự kiện thành công', async () => {
      mockPrismaService.db.order.findUnique.mockResolvedValue(mockOrder);
      const cancelledOrder = { id: orderId, userId, status: OrderStatus.CANCELLED };
      mockPrismaService.db.order.update.mockResolvedValue(cancelledOrder);

      const result = await service.cancelOrder(userId, orderId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(cancelledOrder);

      // Kiểm tra Transaction phục hồi tài nguyên
      expect(inventoryService.restoreStockAndLog).toHaveBeenCalledWith(
        mockPrismaService.db,
        [{ inventoryId: 'inv-1', quantity: 2 }],
        userId
      );
      expect(voucherService.restoreVoucher).toHaveBeenCalledWith(mockPrismaService.db, orderId, userId);
      
      // Kiểm tra cập nhật DB và Event
      expect(prisma.db.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('order.cancelled', expect.any(Object));
    });
  });

  // ===================================================================
  // TEST SUITE: updateOrderStatus
  // ===================================================================
  describe('updateOrderStatus', () => {
    it('Nên ném NotFoundException nếu đơn hàng không tồn tại', async () => {
      mockPrismaService.db.order.findUnique.mockResolvedValue(null);
      await expect(service.updateOrderStatus(orderId, OrderStatus.DELIVERED)).rejects.toThrow(NotFoundException);
    });

    it('Nên xác thực State Transition, cập nhật trạng thái và bắn thông báo', async () => {
      const mockOrder = { id: orderId, userId, status: OrderStatus.SHIPPING };
      mockPrismaService.db.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.db.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.DELIVERED });

      const result = await service.updateOrderStatus(orderId, OrderStatus.DELIVERED);

      // Xác minh hàm static của Domain Logic đã được gọi để kiểm tra tính hợp lệ
      expect(StateTransition.validateTransition).toHaveBeenCalledWith(OrderStatus.SHIPPING, OrderStatus.DELIVERED);
      
      expect(result.status).toEqual(OrderStatus.DELIVERED);
      expect(prisma.db.order.update).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('order.statusUpdated', expect.any(Object));
    });
  });
});