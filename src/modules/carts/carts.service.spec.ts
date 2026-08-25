import { Test, TestingModule } from '@nestjs/testing';
import { CartsService } from './carts.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

describe('CartsService', () => {
  let service: CartsService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  // --- MOCK DATA ---
  const mockUserId = 'user-123';
  const mockCartId = 'cart-123';
  const mockVariantId = 'variant-123';
  const mockCartItemId = 'cart-item-123';

  const mockCart = {
    id: mockCartId,
    userId: mockUserId,
    cartItems: [],
  };

  const mockVariant = {
    id: mockVariantId,
    name: 'Áo thun đen size L',
    product: { id: 'prod-1', name: 'Áo thun' },
  };

  const mockCartItem = {
    id: mockCartItemId,
    cartId: mockCartId,
    variantId: mockVariantId,
    quantity: 2,
    variant: mockVariant,
  };

  // --- MOCK SERVICES ---
  const mockPrismaService = {
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
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<CartsService>(CartsService);
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
  // GET MY CART
  // ==========================================================
  describe('getMyCart', () => {
    it('should return existing cart if found', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(mockCart);

      const result = await service.getMyCart(mockUserId);

      expect(prisma.cart.findFirst).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        include: expect.any(Object),
      });
      expect(prisma.cart.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockCart);
    });

    it('should create and return a new cart if not found', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(null);
      const newCart = { ...mockCart, id: 'new-cart-123' };
      mockPrismaService.cart.create.mockResolvedValue(newCart);

      const result = await service.getMyCart(mockUserId);

      expect(prisma.cart.findFirst).toHaveBeenCalled();
      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { userId: mockUserId },
        include: expect.any(Object),
      });
      expect(result).toEqual(newCart);
    });
  });

  // ==========================================================
  // ADD TO CART
  // ==========================================================
  describe('addToCart', () => {
    const dto = { variantId: mockVariantId, quantity: 2 };

    it('should throw NotFoundException if variant does not exist', async () => {
      mockPrismaService.productVariant.findUnique.mockResolvedValue(null);

      await expect(service.addToCart(mockUserId, dto)).rejects.toThrow(NotFoundException);
      expect(prisma.productVariant.findUnique).toHaveBeenCalledWith({
        where: { id: dto.variantId },
        include: { product: true },
      });
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('should add item to cart and emit created event', async () => {
      mockPrismaService.productVariant.findUnique.mockResolvedValue(mockVariant);
      mockPrismaService.cart.findFirst.mockResolvedValue(mockCart); 
      mockPrismaService.cartItem.upsert.mockResolvedValue(mockCartItem);

      const result = await service.addToCart(mockUserId, dto);

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: {
          cartId_variantId: { cartId: mockCartId, variantId: mockVariantId },
        },
        update: { quantity: { increment: dto.quantity } },
        create: { cartId: mockCartId, variantId: mockVariantId, quantity: dto.quantity },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('cartItem.created', {
        userId: mockUserId,
        content: `Đã thêm ${mockVariant.name} x ${dto.quantity} vào giỏ hàng`,
      });

      expect(result).toEqual(mockCartItem);
    });
  });

  // ==========================================================
  // REMOVE CART ITEM
  // ==========================================================
  describe('removeCartItem', () => {
    it('should throw NotFoundException if cart item does not exist in user cart', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(mockCart);
      mockPrismaService.cartItem.findFirst.mockResolvedValue(null);

      await expect(service.removeCartItem(mockUserId, mockCartItemId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.cartItem.findFirst).toHaveBeenCalledWith({
        where: { id: mockCartItemId, cartId: mockCartId },
        include: { variant: true },
      });
      expect(prisma.cartItem.delete).not.toHaveBeenCalled();
    });

    it('should delete cart item and emit delete event if item exists', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue(mockCart);
      mockPrismaService.cartItem.findFirst.mockResolvedValue(mockCartItem);
      mockPrismaService.cartItem.delete.mockResolvedValue(mockCartItem);

      const result = await service.removeCartItem(mockUserId, mockCartItemId);

      expect(prisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: mockCartItemId },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('cartItem.delete', {
        userId: mockUserId,
        content: `Xóa ${mockCartItem.variant.name} khỏi giỏ hàng`,
      });
      expect(result).toEqual(mockCartItem);
    });
  });
});