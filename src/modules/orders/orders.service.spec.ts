import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  // --- DỮ LIỆU GIẢ ĐỊNH (MOCK DATA) ---
  const mockUserId = 'user-123';
  const mockOrderId = 'order-123';
  const mockVariantId = 'variant-1';
  const mockVoucherId = 'voucher-1';

  const mockCart = {
    id: 'cart-1',
    userId: mockUserId,
    cartItems: [
      {
        variantId: mockVariantId,
        quantity: 2,
        variant: {
          name: 'Áo thun',
          product: { price: 100000 },
        },
      },
    ],
  };

  const mockInventories = [
    { id: 'inv-1', variantId: mockVariantId, quantity: 1, warehouseId: 'wh-1' },
    { id: 'inv-2', variantId: mockVariantId, quantity: 5, warehouseId: 'wh-2' },
  ];

  const mockVoucher = {
    id: mockVoucherId,
    code: 'DISCOUNT50K',
    value: 50000,
    count: 0,
    limit: 100,
  };

  // Đối tượng dùng làm Transaction Client (giả lập các hàm Prisma gọi bên trong $transaction)
  const mockPrismaTransactionClient = {
    order: { create: jest.fn() },
    inventory: { updateMany: jest.fn() },
    inventoryTransaction: { create: jest.fn() },
    voucher: { updateMany: jest.fn() },
    voucherUsage: { create: jest.fn() },
    cartItem: { deleteMany: jest.fn() },
  };

  // --- MOCK SERVICES ---
  const mockPrismaService = {
    cart: { findFirst: jest.fn() },
    inventory: { findMany: jest.fn() },
    voucher: { findUnique: jest.fn() },
    order: { findMany: jest.fn() },
    // Giả lập transaction: Gọi ngay callback và truyền mockPrismaTransactionClient vào
    $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrismaTransactionClient)),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // GET MY ORDERS
  // ==========================================================
  describe('getMyOrders', () => {
    it('should return a list of orders for the user', async () => {
      const mockOrders = [{ id: mockOrderId, totalAmount: 200000 }];
      mockPrismaService.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.getMyOrders(mockUserId);

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockOrders);
    });
  });

  // ==========================================================
  // CREATE ORDER
  // ==========================================================
  describe('createOrder', () => {
    it('should throw BadRequestException if cart is empty or not found', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(null);
      await expect(service.createOrder(mockUserId, {})).rejects.toThrow('Giỏ hàng của bạn đang trống!');

      mockPrismaService.cart.findFirst.mockResolvedValue({ cartItems: [] });
      await expect(service.createOrder(mockUserId, {})).rejects.toThrow('Giỏ hàng của bạn đang trống!');
    });

    it('should throw BadRequestException if inventory is insufficient', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(mockCart);
      // Giả lập kho chỉ còn 1 cái, trong khi cart cần 2
      mockPrismaService.inventory.findMany.mockResolvedValue([{ ...mockInventories[0] }]); 

      await expect(service.createOrder(mockUserId, {})).rejects.toThrow(
        'Sản phẩm Áo thun không đủ tồn kho trên toàn hệ thống!'
      );
    });

    it('should throw NotFoundException if voucher is provided but not found', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(mockCart);
      mockPrismaService.inventory.findMany.mockResolvedValue(mockInventories); // Total 6 > 2
      mockPrismaService.voucher.findUnique.mockResolvedValue(null);

      await expect(service.createOrder(mockUserId, { voucherCode: 'INVALID' })).rejects.toThrow(
        'Mã giảm giá không tồn tại'
      );
    });

    it('should throw BadRequestException if voucher limit is reached', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(mockCart);
      mockPrismaService.inventory.findMany.mockResolvedValue(mockInventories);
      // Giả lập voucher đã dùng 100/100
      mockPrismaService.voucher.findUnique.mockResolvedValue({ ...mockVoucher, count: 100 }); 

      await expect(service.createOrder(mockUserId, { voucherCode: 'DISCOUNT50K' })).rejects.toThrow(
        'Mã giảm giá đã hết lượt sử dụng'
      );
    });

    describe('Transaction Process', () => {
      beforeEach(() => {
        mockPrismaService.cart.findFirst.mockResolvedValue(mockCart);
        mockPrismaService.inventory.findMany.mockResolvedValue([
          { id: 'inv-1', variantId: mockVariantId, quantity: 1 }, 
          { id: 'inv-2', variantId: mockVariantId, quantity: 5 }, 
        ]);
        
        // Mocks for successful transaction operations
        mockPrismaTransactionClient.order.create.mockResolvedValue({ id: mockOrderId, userId: mockUserId });
        mockPrismaTransactionClient.inventory.updateMany.mockResolvedValue({ count: 1 }); // Thành công
        mockPrismaTransactionClient.voucher.updateMany.mockResolvedValue({ count: 1 }); // Thành công
      });

      it('should create order successfully without voucher', async () => {
        const result = await service.createOrder(mockUserId, {});

        // 1. Transaction called
        expect(prisma.$transaction).toHaveBeenCalled();

        // 2. Order created with correct amount (2 items * 100k = 200k)
        expect(mockPrismaTransactionClient.order.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ totalAmount: 200000 }),
          })
        );

        // 3. Inventory deducted correctly (1 from inv-1, 1 from inv-2)
        expect(mockPrismaTransactionClient.inventory.updateMany).toHaveBeenCalledTimes(2);
        
        // 4. Cart cleared
        expect(mockPrismaTransactionClient.cartItem.deleteMany).toHaveBeenCalledWith({
          where: { cartId: mockCart.id },
        });

        // 5. Event emitted
        expect(eventEmitter.emit).toHaveBeenCalledWith('order.created', {
          userId: mockUserId,
          content: `Đơn hàng mã số ${mockOrderId} đã được xác nhận`,
        });

        expect(result).toEqual({ id: mockOrderId, userId: mockUserId });
      });

      it('should throw BadRequestException if inventory race condition happens (count === 0)', async () => {
        // Giả lập lệnh update kho bị fail (do lúc truy vấn thì có, lúc update bị người khác mua mất)
        mockPrismaTransactionClient.inventory.updateMany.mockResolvedValueOnce({ count: 0 });

        await expect(service.createOrder(mockUserId, {})).rejects.toThrow(
          'Lỗi tương tranh: Có sản phẩm trong giỏ vừa bị người khác mua hết!'
        );
      });

      it('should create order successfully with voucher', async () => {
        mockPrismaService.voucher.findUnique.mockResolvedValue(mockVoucher);
        
        await service.createOrder(mockUserId, { voucherCode: 'DISCOUNT50K' });

        // Amount should be 200k - 50k = 150k
        expect(mockPrismaTransactionClient.order.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ totalAmount: 150000 }),
          })
        );

        // Voucher usage tracked
        expect(mockPrismaTransactionClient.voucher.updateMany).toHaveBeenCalled();
        expect(mockPrismaTransactionClient.voucherUsage.create).toHaveBeenCalledWith({
          data: { voucherId: mockVoucherId, userId: mockUserId, orderId: mockOrderId },
        });
      });

      it('should throw BadRequestException if voucher race condition happens (count === 0)', async () => {
        mockPrismaService.voucher.findUnique.mockResolvedValue(mockVoucher);
        // Giả lập lệnh update voucher bị fail (do người khác vừa dùng slot cuối cùng)
        mockPrismaTransactionClient.voucher.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.createOrder(mockUserId, { voucherCode: 'DISCOUNT50K' })).rejects.toThrow(
          'Mã giảm giá vừa chạm mức giới hạn, vui lòng bỏ mã ra khỏi giỏ!'
        );
      });
    });
  });
});