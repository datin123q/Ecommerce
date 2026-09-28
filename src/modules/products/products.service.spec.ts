import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;
  let cacheService: RedisCacheService;

  // 1. MOCK OBJECTS
  const mockPrismaService = {
    db: {
      product: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      productVariant: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
      },
      // Kỹ thuật Mock Transaction
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrismaService.db);
      }),
    },
  };

  const mockEventEmitter = { emit: jest.fn() };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPattern: jest.fn(),
  };

  // 2. DỮ LIỆU MẪU (FIXTURES)
  const adminId = 'admin-123';
  const mockProduct = {
    id: 'prod-1',
    name: 'Áo Thun',
    categoryId: 'cat-1',
    description: 'Áo thun cotton',
  };
  const mockVariant = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'SKU-01',
    name: 'Size L',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: RedisCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    cacheService = module.get<RedisCacheService>(RedisCacheService);

    jest.clearAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // TEST SUITE: CREATE (Tạo sản phẩm)
  // ===================================================================
  describe('create', () => {
    const dto = { name: 'Áo', description: 'Mô tả', categoryId: 'cat-1', variants: [] };

    it('Nên ném ConflictException nếu SKU biến thể bị trùng (Lỗi Prisma P2002)', async () => {
      const prismaError = new Error('Prisma Error') as any;
      prismaError.code = 'P2002'; // Giả lập lỗi Unique Constraint của Prisma
      mockPrismaService.db.product.create.mockRejectedValue(prismaError);

      await expect(service.create(dto as any, adminId)).rejects.toThrow(ConflictException);
    });

    it('Nên tạo sản phẩm, bắn event và xóa cache list', async () => {
      mockPrismaService.db.product.create.mockResolvedValue(mockProduct);

      const result = await service.create(dto as any, adminId);

      expect(result).toEqual(mockProduct);
      expect(prisma.db.product.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.created', expect.any(Object));
      
      // Kiểm tra logic Invalidate Cache
      expect(cacheService.delByPattern).toHaveBeenCalledWith('products:page=*');
      expect(cacheService.del).toHaveBeenCalledWith(
        'products_key',
        `product_${mockProduct.id}_v`,
        `category_${mockProduct.categoryId}_v`
      );
    });
  });

  // ===================================================================
  // TEST SUITE: UPDATE & REMOVE PRODUCT
  // ===================================================================
  describe('updateProduct', () => {
    const dto = { name: 'Áo Mới' };

    it('Nên ném NotFoundException nếu không tìm thấy sản phẩm (thông qua findOne)', async () => {
      // Hàm update gọi this.findOne(), nên ta mock logic của cache và db về null
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.product.findUnique.mockResolvedValue(null);

      await expect(service.updateProduct('prod-99', dto as any, adminId)).rejects.toThrow(NotFoundException);
    });

    it('Nên cập nhật sản phẩm thành công', async () => {
      mockCacheService.get.mockResolvedValue(mockProduct); // Bỏ qua DB call của findOne
      mockPrismaService.db.product.update.mockResolvedValue({ ...mockProduct, ...dto });

      const result = await service.updateProduct(mockProduct.id, dto as any, adminId);

      expect(result.name).toEqual('Áo Mới');
      expect(prisma.db.product.update).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.update', expect.any(Object));
    });
  });

  describe('remove', () => {
    it('Nên xóa sản phẩm cùng các biến thể trong Transaction', async () => {
      mockCacheService.get.mockResolvedValue(mockProduct); // Mock for findOne
      mockPrismaService.db.product.delete.mockResolvedValue(mockProduct);

      await service.remove(mockProduct.id, adminId);

      expect(prisma.db.productVariant.deleteMany).toHaveBeenCalledWith({ where: { productId: mockProduct.id } });
      expect(prisma.db.product.delete).toHaveBeenCalledWith({ where: { id: mockProduct.id } });
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.deleted', expect.any(Object));
    });
  });

  // ===================================================================
  // TEST SUITE: VARIANT OPERATIONS (Thêm, Sửa, Xóa biến thể)
  // ===================================================================
  describe('addVariant', () => {
    const variantDto = { sku: 'SKU-02', name: 'Size M', variant: 'M' };

    it('Nên ném NotFoundException nếu sản phẩm gốc không tồn tại', async () => {
      mockPrismaService.db.product.findUnique.mockResolvedValue(null);
      await expect(service.addVariant('prod-99', variantDto, adminId)).rejects.toThrow(NotFoundException);
    });

    it('Nên ném ConflictException nếu SKU bị trùng (P2002)', async () => {
      mockPrismaService.db.product.findUnique.mockResolvedValue(mockProduct);
      const prismaError = new Error() as any;
      prismaError.code = 'P2002';
      mockPrismaService.db.productVariant.create.mockRejectedValue(prismaError);

      await expect(service.addVariant(mockProduct.id, variantDto, adminId)).rejects.toThrow(ConflictException);
    });

    it('Nên thêm biến thể thành công và dọn cache', async () => {
      mockPrismaService.db.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.db.productVariant.create.mockResolvedValue(mockVariant);

      const result = await service.addVariant(mockProduct.id, variantDto, adminId);

      expect(result).toEqual(mockVariant);
      expect(eventEmitter.emit).toHaveBeenCalledWith('variant.created', expect.any(Object));
      expect(cacheService.del).toHaveBeenCalledWith(
        'products_key',
        `product_${mockProduct.id}_v`,
        `variant_${mockVariant.id}_v` // Cache categoryId không có vì thêm variant không update category
      );
    });
  });

  // ===================================================================
  // TEST SUITE: QUERIES (Tìm kiếm, Phân trang và Caching)
  // ===================================================================
  describe('findAll', () => {
    const query = { page: 2, limit: 10, sortBy: 'name', sortOrder: 'asc' as const };
    const expectedCacheKey = 'products:page=2:limit=10:sortBy=name:sortOrder=asc';

    it('Nên trả về dữ liệu trực tiếp từ Cache nếu có (Cache Hit)', async () => {
      const cachedResult = { data: [mockProduct], meta: { page: 2 } };
      mockCacheService.get.mockResolvedValue(cachedResult);

      const result = await service.findAll(query);

      expect(result).toEqual(cachedResult);
      expect(cacheService.get).toHaveBeenCalledWith(expectedCacheKey);
      expect(prisma.db.product.findMany).not.toHaveBeenCalled(); // Đảm bảo DB không bị gọi
    });

    it('Nên query DB, tính toán phân trang và lưu vào Cache nếu Cache rỗng (Cache Miss)', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.product.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.db.product.count.mockResolvedValue(25); // Tổng 25 sản phẩm

      const result = await service.findAll(query);

      // Xác minh tham số tính toán phân trang gửi xuống DB (skip, take)
      expect(prisma.db.product.findMany).toHaveBeenCalledWith({
        skip: 10, // (page 2 - 1) * limit 10
        take: 10,
        include: { variants: true },
        orderBy: { name: 'asc' },
      });

      // Xác minh tính toán Meta-data trả về
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3, // ceil(25 / 10)
        hasNextPage: true, // 2 < 3
        hasPreviousPage: true, // 2 > 1
      });

      // Xác minh lưu Cache
      expect(cacheService.set).toHaveBeenCalledWith(expectedCacheKey, result);
    });
  });

  describe('findOne', () => {
    it('Nên ném NotFoundException nếu DB không có dữ liệu', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('prod-99')).rejects.toThrow(NotFoundException);
    });

    it('Nên lưu vào cache và trả về dữ liệu khi tìm thấy', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findOne(mockProduct.id);

      expect(result).toEqual(mockProduct);
      expect(cacheService.set).toHaveBeenCalledWith(`product_${mockProduct.id}_v`, mockProduct);
    });
  });
});