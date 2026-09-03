import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;

  // --- DỮ LIỆU GIẢ ĐỊNH (MOCK DATA) ---
  const mockAdminId = 'admin-123';
  const mockCategoryId = 'category-123';
    let eventEmitter: EventEmitter2;

  const mockCategory = {
    id: mockCategoryId,
    name: 'Điện thoại',
    description: 'Danh mục điện thoại',
  };

  const createCategoryDto = {
    name: 'Điện thoại',
    description: 'Danh mục điện thoại',
  };

  const updateCategoryDto = {
    name: 'Laptop',
  };

  // --- MOCK SERVICES ---
  const mockPrismaService = {
    category: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
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
  // CREATE
  // ==========================================================
  describe('create', () => {
    it('should throw ConflictException if category name already exists', async () => {

      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory);

      await expect(service.create(createCategoryDto, mockAdminId)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { name: createCategoryDto.name },
      });
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('should create a new category and log the action', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null);
      mockPrismaService.category.create.mockResolvedValue(mockCategory);

      const result = await service.create(createCategoryDto, mockAdminId);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: createCategoryDto,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('category.created',{
        id: mockAdminId,
        action: 'CREATE',
        entity: 'Category',
        entityId: mockCategory.id,
        oldValue: null,
        newValue: mockCategory,
        tx: prisma, 
      });

      expect(result).toEqual(mockCategory);
    });
  });

  // ==========================================================
  // FIND ALL
  // ==========================================================
  describe('findAll', () => {
    it('should return all categories with products count', async () => {
      const mockCategories = [
        { ...mockCategory, _count: { products: 5 } },
        { id: 'cat-2', name: 'Phụ kiện', _count: { products: 10 } },
      ];
      mockPrismaService.category.findMany.mockResolvedValue(mockCategories);

      const result = await service.findAll();

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        include: {
          _count: {
            select: { products: true },
          },
        },
      });
      expect(result).toEqual(mockCategories);
    });
  });

  // ==========================================================
  // FIND ONE
  // ==========================================================
  describe('findOne', () => {
    it('should throw NotFoundException if category is not found', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne(mockCategoryId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return category if found', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory);

      const result = await service.findOne(mockCategoryId);

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: mockCategoryId },
      });
      expect(result).toEqual(mockCategory);
    });
  });

  // ==========================================================
  // UPDATE
  // ==========================================================
  describe('update', () => {
    it('should throw NotFoundException if category does not exist', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null);

      await expect(service.update(mockCategoryId, updateCategoryDto, mockAdminId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('should update category and log the action', async () => {
      const updatedCategory = { ...mockCategory, name: 'Laptop' };
      
      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory); 

      mockPrismaService.category.update.mockResolvedValue(updatedCategory);

      const result = await service.update(mockCategoryId, updateCategoryDto, mockAdminId);

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategoryId },
        data: updateCategoryDto,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('category.update',{
        id: mockAdminId,
        action: 'UPDATE',
        entity: 'Category',
        entityId: mockCategoryId,
        oldValue: mockCategory,
        newValue: updatedCategory,
        tx: prisma, 
      });

      expect(result).toEqual(updatedCategory);
    });
  });

  // ==========================================================
  // REMOVE
  // ==========================================================
  describe('remove', () => {
    it('should throw NotFoundException if category does not exist', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null);

      await expect(service.remove(mockCategoryId, mockAdminId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('should remove category and log the action', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory);
      mockPrismaService.category.delete.mockResolvedValue(mockCategory);

      const result = await service.remove(mockCategoryId, mockAdminId);

      expect(eventEmitter.emit).toHaveBeenCalledWith('category.delete',{
        id: mockAdminId,
        action: 'DELETE',
        entity: 'Category',
        entityId: mockCategoryId,
        oldValue: mockCategory,
        newValue: null,
        tx: prisma, 
      });
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: mockCategoryId },
      });

      expect(result).toEqual(mockCategory);
    });
  });
});