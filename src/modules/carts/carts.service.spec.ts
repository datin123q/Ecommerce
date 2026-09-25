import { Test, TestingModule } from '@nestjs/testing';
import { CartsService } from './carts.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('CartsService', () => {
  let service: CartsService;
  let prisma: PrismaService;
  let cacheService: RedisCacheService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    db: {
      cart: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn(),
      },
      cartItem: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const userId = 'user-123';
  const mockCart = {
    id: 'cart-1',
    userId,
    cartItems: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisCacheService, useValue: mockCacheService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<CartsService>(CartsService);
    prisma = module.get<PrismaService>(PrismaService);
    cacheService = module.get<RedisCacheService>(RedisCacheService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  describe('getMyCart', () => {
    it('Nên trả về giỏ hàng từ Cache nếu cache tồn tại', async () => {
      mockCacheService.get.mockResolvedValue(mockCart);

      const result = await service.getMyCart(userId);

      expect(result).toEqual(mockCart);
      expect(cacheService.get).toHaveBeenCalledWith(`cart_${userId}_v`);
      expect(prisma.db.cart.findFirst).not.toHaveBeenCalled();
    });

    it('Nên lấy từ DB và lưu vào Cache nếu cache rỗng và giỏ hàng đã tồn tại', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.cart.findFirst.mockResolvedValue(mockCart);

      const result = await service.getMyCart(userId);

      expect(result).toEqual(mockCart);
      expect(prisma.db.cart.findFirst).toHaveBeenCalledWith({
        where: { userId },
        include: expect.any(Object),
      });
      expect(cacheService.set).toHaveBeenCalledWith(`cart_${userId}_v`, mockCart);
    });

    it('Nên tạo mới giỏ hàng trong DB nếu người dùng chưa có giỏ hàng', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.cart.findFirst.mockResolvedValue(null);
      mockPrismaService.db.cart.create.mockResolvedValue(mockCart);

      const result = await service.getMyCart(userId);

      expect(result).toEqual(mockCart);
      expect(prisma.db.cart.create).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledWith(`cart_${userId}_v`, mockCart);
    });
  });


  describe('addToCart', () => {
    const dto = { variantId: 'var-1', quantity: 2 };
    const mockVariant = {
      id: 'var-1',
      name: 'Size L',
      product: { name: 'Áo Thun' },
    };

    it('Nên ném NotFoundException nếu biến thể sản phẩm không tồn tại', async () => {
      mockPrismaService.db.productVariant.findUnique.mockResolvedValue(null);

      await expect(service.addToCart(userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Nên thêm sản phẩm vào giỏ, bắn sự kiện và xóa cache thành công', async () => {
      mockPrismaService.db.productVariant.findUnique.mockResolvedValue(mockVariant);
      mockCacheService.get.mockResolvedValue(mockCart); // Giả lập đã có giỏ hàng
      
      const mockCartItem = { id: 'item-1', cartId: 'cart-1', variantId: 'var-1', quantity: 2 };
      mockPrismaService.db.cartItem.upsert.mockResolvedValue(mockCartItem);

      const result = await service.addToCart(userId, dto);

      expect(result).toEqual(mockCartItem);
      expect(prisma.db.cartItem.upsert).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cartItem.created',
        expect.objectContaining({ userId }),
      );
      expect(cacheService.del).toHaveBeenCalledWith(`cart_${userId}_v`);
    });
  });

  describe('removeCartItem', () => {
    const cartItemId = 'item-1';
    const mockItem = {
      id: cartItemId,
      cartId: 'cart-1',
      variant: { name: 'Size L', product: { name: 'Áo Thun' } },
    };

    it('Nên ném NotFoundException nếu sản phẩm không có trong giỏ hàng', async () => {
      mockCacheService.get.mockResolvedValue(mockCart);
      mockPrismaService.db.cartItem.findFirst.mockResolvedValue(null);

      await expect(service.removeCartItem(userId, cartItemId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Nên xóa sản phẩm khỏi giỏ, bắn sự kiện và dọn sạch cache', async () => {
      mockCacheService.get.mockResolvedValue(mockCart);
      mockPrismaService.db.cartItem.findFirst.mockResolvedValue(mockItem);
      mockPrismaService.db.cartItem.delete.mockResolvedValue(mockItem);

      const result = await service.removeCartItem(userId, cartItemId);

      expect(result).toEqual(mockItem);
      expect(prisma.db.cartItem.delete).toHaveBeenCalledWith({ where: { id: cartItemId } });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cartItem.delete',
        expect.objectContaining({ userId }),
      );
      expect(cacheService.del).toHaveBeenCalledWith(`cart_${userId}_v`);
    });
  });


  describe('getCartForCheckout', () => {
    it('Nên ném BadRequestException nếu giỏ hàng trống', async () => {
      mockPrismaService.db.cart.findFirst.mockResolvedValue({
        ...mockCart,
        cartItems: [],
      });

      await expect(service.getCartForCheckout(userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Nên trả về giỏ hàng nếu chứa các sản phẩm hợp lệ', async () => {
      const nonEmptyCart = {
        ...mockCart,
        cartItems: [{ id: 'item-1', quantity: 1 }],
      };
      mockPrismaService.db.cart.findFirst.mockResolvedValue(nonEmptyCart);

      const result = await service.getCartForCheckout(userId);

      expect(result).toEqual(nonEmptyCart);
    });
  });
});