import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  // --- DỮ LIỆU GIẢ ĐỊNH (MOCK DATA) ---
  const mockAdminId = 'admin-123';
  const mockUserId = 'user-123';
  const mockWarehouseId = 'wh-123';
  const mockVariantId = 'var-123';
  const mockInventoryId = 'inv-123';

  const mockWarehouse = {
    id: mockWarehouseId,
    name: 'Kho Hà Nội',
    address: '123 Cầu Giấy',
    inventories: [],
  };

  const mockVariant = {
    id: mockVariantId,
    name: 'Sản phẩm A',
  };

  const mockInventory = {
    id: mockInventoryId,
    warehouseId: mockWarehouseId,
    variantId: mockVariantId,
    quantity: 50,
  };

  // --- MOCK SERVICES ---
  const mockPrismaService = {
    warehouse: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    inventory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
    },
    inventoryTransaction: {
      create: jest.fn(),
    },
    // Giả lập transaction bằng cách gọi callback và truyền chính prisma mock vào
    $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrismaService)),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
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
  // WAREHOUSE OPERATIONS
  // ==========================================================
  describe('createWarehouse', () => {
    it('should create a warehouse and log the action', async () => {
      const dto = { name: 'Kho Hà Nội', address: '123 Cầu Giấy' };
      mockPrismaService.warehouse.create.mockResolvedValue(mockWarehouse);

      const result = await service.createWarehouse(dto, mockAdminId);

      expect(prisma.warehouse.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(mockWarehouse);
    });
  });

  describe('getWarehouses', () => {
    it('should return all warehouses', async () => {
      mockPrismaService.warehouse.findMany.mockResolvedValue([mockWarehouse]);
      const result = await service.getWarehouses();
      expect(prisma.warehouse.findMany).toHaveBeenCalled();
      expect(result).toEqual([mockWarehouse]);
    });
  });

  describe('getInventory', () => {
    it('should return all inventories', async () => {
      mockPrismaService.inventory.findMany.mockResolvedValue([mockInventory]);
      const result = await service.getInventory();
      expect(prisma.inventory.findMany).toHaveBeenCalled();
      expect(result).toEqual([mockInventory]);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if warehouse is not found', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.findOne(mockWarehouseId)).rejects.toThrow(NotFoundException);
    });

    it('should return warehouse if found', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      const result = await service.findOne(mockWarehouseId);
      expect(result).toEqual(mockWarehouse);
    });
  });

  describe('update', () => {
    it('should update warehouse and log action', async () => {
      const dto = { name: 'Kho Mới' };
      const updatedWarehouse = { ...mockWarehouse, ...dto };
      
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse); // for findOne
      mockPrismaService.warehouse.update.mockResolvedValue(updatedWarehouse);

      const result = await service.update(mockWarehouseId, dto, mockAdminId);

      expect(prisma.warehouse.update).toHaveBeenCalledWith({
        where: { id: mockWarehouseId },
        data: dto,
      });
      expect(result).toEqual(updatedWarehouse);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if any inventory in warehouse has quantity !== 0', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse); // for findOne
      mockPrismaService.inventory.findMany.mockResolvedValue([{ quantity: 10 }]); // Có hàng trong kho

      await expect(service.remove(mockWarehouseId, mockAdminId)).rejects.toThrow(
        new NotFoundException('Không thể xóa kho còn hàng'),
      );
      expect(prisma.warehouse.delete).not.toHaveBeenCalled();
    });

    it('should delete warehouse and log action if all inventories have quantity === 0', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse); 
      mockPrismaService.inventory.findMany.mockResolvedValue([{ quantity: 0 }]); // Kho rỗng
      mockPrismaService.warehouse.delete.mockResolvedValue(mockWarehouse);

      await service.remove(mockWarehouseId, mockAdminId);

      expect(prisma.warehouse.delete).toHaveBeenCalledWith({ where: { id: mockWarehouseId } });
    });
  });

  // ==========================================================
  // STOCK IN & STOCK OUT OPERATIONS
  // ==========================================================
  describe('stockIn', () => {
    const stockInDto = { warehouseId: mockWarehouseId, variantId: mockVariantId, quantity: 10 };

    it('should throw NotFoundException if warehouse not found', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.stockIn(mockUserId, stockInDto)).rejects.toThrow('Không tìm thấy kho hàng');
    });

    it('should throw NotFoundException if variant not found', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.productVariant.findUnique.mockResolvedValue(null);
      await expect(service.stockIn(mockUserId, stockInDto)).rejects.toThrow('Không tìm thấy biến thể sản phẩm');
    });

    it('should successfully stock in, log action, and record transaction (UPDATE existing)', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.productVariant.findUnique.mockResolvedValue(mockVariant);
      
      const existingInventory = { ...mockInventory, quantity: 20 };
      const newInventory = { ...mockInventory, quantity: 30 };
      
      // Mocks inside transaction
      mockPrismaService.inventory.findUnique.mockResolvedValue(existingInventory);
      mockPrismaService.inventory.upsert.mockResolvedValue(newInventory);
      mockPrismaService.inventoryTransaction.create.mockResolvedValue({ id: 'trans-123' });

      const result = await service.stockIn(mockUserId, stockInDto);

      expect(prisma.inventory.upsert).toHaveBeenCalledWith({
        where: { warehouseId_variantId: { warehouseId: mockWarehouseId, variantId: mockVariantId } },
        create: stockInDto,
        update: { quantity: { increment: stockInDto.quantity } },
      });


      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          type: TransactionType.IN,
          quantity: stockInDto.quantity,
          inventoryId: newInventory.id,
          userId: mockUserId,
        },
      });

      expect(result.newInventory).toEqual(newInventory);
    });
  });

  describe('stockOut', () => {
    const stockOutDto = { warehouseId: mockWarehouseId, variantId: mockVariantId, quantity: 10 };

    it('should throw NotFoundException if warehouse not found', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.stockOut(mockUserId, stockOutDto)).rejects.toThrow('Không tìm thấy kho hàng');
    });

    it('should throw NotFoundException if variant not found', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.productVariant.findUnique.mockResolvedValue(null);
      await expect(service.stockOut(mockUserId, stockOutDto)).rejects.toThrow('Không tìm thấy biến thể sản phẩm');
    });

    it('should throw NotFoundException if inventory quantity is insufficient', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.productVariant.findUnique.mockResolvedValue(mockVariant);
      
      const existingInventory = { ...mockInventory, quantity: 5 }; // Nhỏ hơn số lượng muốn xuất (10)
      mockPrismaService.inventory.findUnique.mockResolvedValue(existingInventory);

      await expect(service.stockOut(mockUserId, stockOutDto)).rejects.toThrow('Số lượng tồn kho không đủ');
      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
    });

    it('should successfully stock out, log action, and record transaction', async () => {
      mockPrismaService.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.productVariant.findUnique.mockResolvedValue(mockVariant);
      
      const existingInventory = { ...mockInventory, quantity: 50 };
      const newInventory = { ...mockInventory, quantity: 40 };
      
      mockPrismaService.inventory.findUnique.mockResolvedValue(existingInventory);
      mockPrismaService.inventory.upsert.mockResolvedValue(newInventory);
      mockPrismaService.inventoryTransaction.create.mockResolvedValue({ id: 'trans-123' });

      const result = await service.stockOut(mockUserId, stockOutDto);

      expect(prisma.inventory.upsert).toHaveBeenCalledWith({
        where: { warehouseId_variantId: { warehouseId: mockWarehouseId, variantId: mockVariantId } },
        create: stockOutDto,
        update: { quantity: { decrement: stockOutDto.quantity } },
      });


      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          type: TransactionType.OUT,
          quantity: stockOutDto.quantity,
          inventoryId: newInventory.id,
          userId: mockUserId,
        },
      });

      expect(result.newInventory).toEqual(newInventory);
    });
  });
});