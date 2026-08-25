import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;
  let auditLogsService: AuditLogsService;

  // --- DỮ LIỆU GIẢ ĐỊNH (MOCK DATA) ---
  const mockAdminId = 'admin-123';
  const mockProductId = 'prod-123';
  const mockVariantId = 'var-123';

  const mockProduct = {
    id: mockProductId,
    name: 'Áo thun',
    description: 'Áo thun cotton',
    categoryId: 'cat-1',
    price: 100000,
  };

  const mockVariant = {
    id: mockVariantId,
    productId: mockProductId,
    sku: 'SKU-001',
    name: 'Áo thun đen',
    variant: 'Màu Đen - Size L',
  };

  const createProductDto: any = {
    name: 'Áo thun',
    description: 'Áo thun cotton',
    categoryId: 'cat-1',
    price: 100000,
    variants: [
      { sku: 'SKU-001', name: 'Áo thun đen', variant: 'Đen' },
    ],
  };

  // --- MOCK SERVICES ---
  const mockPrismaService = {
    product: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    productVariant: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockAuditLogsService = {
    logAction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get<PrismaService>(PrismaService);
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // CREATE PRODUCT
  // ==========================================================
  describe('create', () => {
    it('should create a product successfully and log the action', async () => {
      mockPrismaService.product.create.mockResolvedValue(mockProduct);

      const result = await service.create(createProductDto, mockAdminId);

      // Tách variants ra khỏi dto
      const { variants, ...productData } = createProductDto;

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          ...productData,
          variants: { create: variants },
        },
        include: { category: true, variants: true },
      });

      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        mockAdminId,
        'CREATE',
        'Product',
        mockProduct.id,
        null,
        mockProduct,
        prisma,
      );
      expect(result).toEqual(mockProduct);
    });

    it('should throw ConflictException if SKU already exists (Prisma Error P2002)', async () => {
      mockPrismaService.product.create.mockRejectedValue({ code: 'P2002' }); // Lỗi trùng SKU của Prisma

      await expect(service.create(createProductDto, mockAdminId)).rejects.toThrow(
        new ConflictException('Mã SKU của biến thể đã tồn tại, vui lòng kiểm tra lại!')
      );
    });

    it('should throw original error if not P2002', async () => {
      const someError = new Error('Database Error');
      mockPrismaService.product.create.mockRejectedValue(someError);

      await expect(service.create(createProductDto, mockAdminId)).rejects.toThrow(someError);
    });
  });

  // ==========================================================
  // UPDATE PRODUCT
  // ==========================================================
  describe('updateProduct', () => {
    const updateDto = { name: 'Áo khoác', description: 'Áo ấm' };

    it('should throw NotFoundException if product not found', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.updateProduct(mockProductId, updateDto, mockAdminId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should update product successfully and log action', async () => {
      const updatedProduct = { ...mockProduct, ...updateDto };
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct); // FindOne trả về
      mockPrismaService.product.update.mockResolvedValue(updatedProduct); // Cập nhật trả về

      const result = await service.updateProduct(mockProductId, updateDto, mockAdminId);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: mockProductId },
        data: updateDto,
      });

      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        mockAdminId,
        'UPDATE',
        'Product',
        mockProductId,
        mockProduct, // Dữ liệu cũ
        updatedProduct, // Dữ liệu mới
        prisma,
      );
      expect(result).toEqual(updatedProduct);
    });
  });

  // ==========================================================
  // ADD VARIANT
  // ==========================================================
  describe('addVariant', () => {
    const variantDto = { sku: 'SKU-002', name: 'Áo trắng', variant: 'Trắng' };

    it('should throw NotFoundException if root product does not exist', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.addVariant(mockProductId, variantDto as any, mockAdminId)).rejects.toThrow(
        new NotFoundException('Không tìm thấy sản phẩm gốc để thêm biến thể')
      );
    });

    it('should create variant successfully and log action', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.productVariant.create.mockResolvedValue(mockVariant);

      const result = await service.addVariant(mockProductId, variantDto as any, mockAdminId);

      expect(prisma.productVariant.create).toHaveBeenCalledWith({
        data: {
          sku: variantDto.sku,
          name: variantDto.name,
          variant: variantDto.variant,
          productId: mockProductId,
        },
      });

      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        mockAdminId,
        'CREATE',
        'Product', // Ghi chú: Dựa theo code của bạn thì ở đây log tên Entity là 'Product'
        mockVariant.id,
        null,
        mockVariant,
        prisma,
      );
      expect(result).toEqual(mockVariant);
    });

    it('should throw ConflictException if SKU already exists (Prisma Error P2002)', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.productVariant.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.addVariant(mockProductId, variantDto as any, mockAdminId)).rejects.toThrow(
        new ConflictException('Mã SKU của biến thể này đã tồn tại!')
      );
    });
  });

  // ==========================================================
  // UPDATE VARIANT
  // ==========================================================
  describe('updateVariant', () => {
    const updateDto = { sku: 'SKU-999', name: 'Đỏ', variant: 'Màu Đỏ' };

    it('should throw NotFoundException if variant not found', async () => {
      mockPrismaService.productVariant.findUnique.mockResolvedValue(null);

      await expect(service.updateVariant(mockVariantId, updateDto as any, mockAdminId)).rejects.toThrow(
        new NotFoundException(`Không tìm thấy biến thể với ID: ${mockVariantId}`)
      );
    });

    it('should update variant and log action', async () => {
      const updatedVariant = { ...mockVariant, ...updateDto };
      mockPrismaService.productVariant.findUnique.mockResolvedValue(mockVariant);
      mockPrismaService.productVariant.update.mockResolvedValue(updatedVariant);

      const result = await service.updateVariant(mockVariantId, updateDto as any, mockAdminId);

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: mockVariantId },
        data: updateDto,
      });

      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        mockAdminId,
        'UPDATE',
        'ProductVariant',
        mockVariantId,
        mockVariant,
        updatedVariant,
        prisma,
      );
      expect(result).toEqual(updatedVariant);
    });
  });

  // ==========================================================
  // FIND METHODS
  // ==========================================================
  describe('findAll', () => {
    it('should return all products', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);
      const result = await service.findAll();
      expect(prisma.product.findMany).toHaveBeenCalledWith({ include: { category: true, variants: true } });
      expect(result).toEqual([mockProduct]);
    });
  });

  describe('findOne & findOneVariant', () => {
    it('findOne should return product if found', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      const result = await service.findOne(mockProductId);
      expect(result).toEqual(mockProduct);
    });

    it('findOne should throw NotFoundException if not found', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);
      await expect(service.findOne(mockProductId)).rejects.toThrow(NotFoundException);
    });

    it('findOneVariant should return variant if found', async () => {
      mockPrismaService.productVariant.findUnique.mockResolvedValue(mockVariant);
      const result = await service.findOneVariant(mockVariantId);
      expect(result).toEqual(mockVariant);
    });

    it('findOneVariant should throw NotFoundException if not found', async () => {
      mockPrismaService.productVariant.findUnique.mockResolvedValue(null);
      await expect(service.findOneVariant(mockVariantId)).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // REMOVE METHODS
  // ==========================================================
  describe('remove', () => {
    it('should throw NotFoundException if product to remove does not exist', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);
      await expect(service.remove(mockProductId, mockAdminId)).rejects.toThrow(NotFoundException);
    });

    it('should remove product and log action', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.product.delete.mockResolvedValue(mockProduct);

      const result = await service.remove(mockProductId, mockAdminId);

      expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: mockProductId } });
      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        mockAdminId,
        'DELETE',
        'Product',
        mockProductId,
        mockProduct,
        null,
        prisma,
      );
      expect(result).toEqual(mockProduct);
    });
  });

  describe('removeVariant', () => {
    it('should throw NotFoundException if variant to remove does not exist', async () => {
      mockPrismaService.productVariant.findUnique.mockResolvedValue(null);
      await expect(service.removeVariant(mockVariantId, mockAdminId)).rejects.toThrow(NotFoundException);
    });

    it('should remove variant and log action', async () => {
      mockPrismaService.productVariant.findUnique.mockResolvedValue(mockVariant);
      mockPrismaService.productVariant.delete.mockResolvedValue(mockVariant);

      const result = await service.removeVariant(mockVariantId, mockAdminId);

      expect(prisma.productVariant.delete).toHaveBeenCalledWith({ where: { id: mockVariantId } });
      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        mockAdminId,
        'DELETE',
        'Product', // Ghi chú: Dựa theo code của bạn thì ở đây log tên Entity là 'Product'
        mockVariantId,
        mockVariant,
        null,
        prisma,
      );
      expect(result).toEqual(mockVariant);
    });
  });
});