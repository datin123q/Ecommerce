import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisCacheService } from '../../redis/redisCache.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;
  let cacheService: RedisCacheService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    db: {
      category: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      productVariant: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(mockPrismaService.db);
      }),
    },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPattern: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const adminId = 'admin-123';
  const mockCategory = {
    id: 'cat-1',
    name: 'Áo Thun Nam',
    description: 'Mô tả áo thun',
  };

  beforeEach(async () => {
    // Khởi tạo Module Test
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisCacheService, useValue: mockCacheService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get<PrismaService>(PrismaService);
    cacheService = module.get<RedisCacheService>(RedisCacheService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Xóa sạch lịch sử gọi hàm sau mỗi lần test
    jest.clearAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // TEST SUITE: CREATE CATEGORY
  describe('create', () => {
    const dto = { name: 'Áo Thun Nam', description: 'Mô tả' };

    it('Nên tạo danh mục thành công, bắn sự kiện và xóa cache', async () => {
      mockPrismaService.db.category.create.mockResolvedValue(mockCategory);

      const result = await service.create(dto, adminId);

      expect(result).toEqual(mockCategory);
      expect(prisma.db.category.create).toHaveBeenCalledWith({ data: dto });
      expect(eventEmitter.emit).toHaveBeenCalledWith('category.created', expect.any(Object));
      expect(cacheService.del).toHaveBeenCalledWith('categories_all');
    });

    it('Nên ném lỗi ConflictException nếu trùng tên (Lỗi P2002)', async () => {
      // Giả lập lỗi P2002 của Prisma
      const prismaError = new Prisma.PrismaClientKnownRequestError('Trùng tên', {
        code: 'P2002',
        clientVersion: 'v1',
      });
      mockPrismaService.db.category.create.mockRejectedValue(prismaError);

      await expect(service.create(dto, adminId)).rejects.toThrow(ConflictException);
    });
  });

  // TEST SUITE: FIND ALL
  describe('findAll', () => {
    it('Nên trả về dữ liệu từ Cache nếu Cache tồn tại (Không gọi DB)', async () => {
      mockCacheService.get.mockResolvedValue([mockCategory]);

      const result = await service.findAll();

      expect(result).toEqual([mockCategory]);
      expect(cacheService.get).toHaveBeenCalledWith('categories_all');
      expect(prisma.db.category.findMany).not.toHaveBeenCalled(); // Đảm bảo không chọc DB
    });

    it('Nên lấy từ DB nếu Cache rỗng, sau đó lưu lại vào Cache', async () => {
      mockCacheService.get.mockResolvedValue(null); 
      mockPrismaService.db.category.findMany.mockResolvedValue([mockCategory]);

      const result = await service.findAll();

      expect(result).toEqual([mockCategory]);
      expect(prisma.db.category.findMany).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledWith('categories_all', [mockCategory]);
    });
  });

  // TEST SUITE: FIND ONE
  describe('findOne', () => {
    it('Nên ném NotFoundException nếu danh mục không tồn tại', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.category.findUnique.mockResolvedValue(null); // DB không có

      await expect(service.findOne('cat-99')).rejects.toThrow(NotFoundException);
    });
  });

  // TEST SUITE: REMOVE CATEGORY (Luồng xóa phức tạp nhất)
  describe('remove', () => {
    it('Nên xóa danh mục và tất cả sản phẩm, bắn event và dọn sạch cache dây chuyền', async () => {
      // 1. Mock bước findOne (Tồn tại danh mục)
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.db.category.findUnique.mockResolvedValue(mockCategory);

      // 2. Mock bước tìm sản phẩm con thuộc danh mục đó
      const mockProducts = [{ id: 'prod-1' }, { id: 'prod-2' }];
      mockPrismaService.db.product.findMany.mockResolvedValue(mockProducts);

      // 3. Mock kết quả trả về của lệnh xóa
      mockPrismaService.db.category.delete.mockResolvedValue(mockCategory);

      // THỰC THI
      const result = await service.remove('cat-1', adminId);

      // KIỂM TRA
      expect(result).toEqual(mockCategory);
      
      // Đảm bảo Transaction xóa dây chuyền được gọi đúng
      expect(prisma.db.productVariant.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ['prod-1', 'prod-2'] } }
      });
      expect(prisma.db.product.deleteMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1' },
      });
      expect(prisma.db.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });

      // Kiểm tra Event Audit
      expect(eventEmitter.emit).toHaveBeenCalledWith('category.delete', expect.any(Object));

      // Kiểm tra XÓA CACHE CÓ LÂY SANG PRODUCT KHÔNG 
      expect(cacheService.del).toHaveBeenCalledWith(
        'categories_all', 
        'category_cat-1_v', 
        'products_key' 
      );
    });
  });
});