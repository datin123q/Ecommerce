import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  // 1. KHỞI TẠO CÁC MOCK OBJECTS
  const mockPrismaService = {
    db: {
      warehouse: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      inventory: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      inventoryTransaction: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn(),
      },
      // Kỹ thuật Mock Prisma Transaction
      $transaction: jest.fn().mockImplementation(async (callback) => {
        // Trực tiếp truyền db mock vào callback thay cho tx thực
        return callback(mockPrismaService.db); 
      }),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const adminId = 'admin-123';
  const mockWarehouse = { id: 'wh-1', name: 'Kho Hà Nội' };
  const mockVariant = { id: 'var-1', name: 'Sản phẩm A' };

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

    jest.clearAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // TEST SUITE: createWarehouse & update
  // ===================================================================
  describe('createWarehouse', () => {
    it('Nên tạo kho thành công và bắn sự kiện audit', async () => {
      const dto = { name: 'Kho Hà Nội', location: 'HN' };
      mockPrismaService.db.warehouse.create.mockResolvedValue(mockWarehouse);

      const result = await service.createWarehouse(dto as any, adminId);

      expect(result).toEqual(mockWarehouse);
      expect(prisma.db.warehouse.create).toHaveBeenCalledWith({ data: dto });
      expect(eventEmitter.emit).toHaveBeenCalledWith('warehouse.created', expect.objectContaining({
        actorId: adminId,
        action: 'CREATE',
        entityId: mockWarehouse.id,
      }));
    });
  });

  describe('update', () => {
    it('Nên ném NotFoundException nếu kho không tồn tại', async () => {
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.update('wh-99', {}, adminId)).rejects.toThrow(NotFoundException);
    });

    it('Nên cập nhật kho và bắn sự kiện audit', async () => {
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.db.warehouse.update.mockResolvedValue({ ...mockWarehouse, name: 'Kho Mới' });

      await service.update(mockWarehouse.id, { name: 'Kho Mới' }, adminId);

      expect(prisma.db.warehouse.update).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('warehouse.update', expect.objectContaining({
        action: 'UPDATE',
      }));
    });
  });

  // ===================================================================
  // TEST SUITE: remove (Logic xóa kho)
  // ===================================================================
  describe('remove', () => {
    it('Nên ném NotFoundException nếu kho không tồn tại', async () => {
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.remove('wh-99', adminId)).rejects.toThrow(NotFoundException);
    });

    it('Nên ném BadRequestException nếu kho vẫn còn hàng hóa (> 0)', async () => {
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      // Giả lập kho đang có 5 sản phẩm
      mockPrismaService.db.inventory.count.mockResolvedValue(5); 

      await expect(service.remove(mockWarehouse.id, adminId)).rejects.toThrow(BadRequestException);
    });

    it('Nên xóa kho thành công nếu kho trống và bắn sự kiện', async () => {
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      // Giả lập kho trống
      mockPrismaService.db.inventory.count.mockResolvedValue(0); 

      await service.remove(mockWarehouse.id, adminId);

      expect(prisma.db.warehouse.delete).toHaveBeenCalledWith({ where: { id: mockWarehouse.id } });
      expect(eventEmitter.emit).toHaveBeenCalledWith('warehouse.deleted', expect.any(Object));
    });
  });

  // ===================================================================
  // TEST SUITE: stockIn (Nhập kho)
  // ===================================================================
  describe('stockIn', () => {
    const dto = { warehouseId: 'wh-1', variantId: 'var-1', quantity: 10 };

    it('Nên ném NotFoundException nếu Kho hoặc Biến thể không tồn tại', async () => {
      // Promise.all trong code: mock warehouse null, variant tồn tại
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(null);
      mockPrismaService.db.productVariant.findUnique.mockResolvedValue(mockVariant);

      await expect(service.stockIn(adminId, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('Nên thực thi Transaction nhập kho và bắn sự kiện', async () => {
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.db.productVariant.findUnique.mockResolvedValue(mockVariant);
      
      const mockNewInventory = { id: 'inv-1', quantity: 10 };
      const mockTxLog = { id: 'tx-1' };
      
      // Setup Mock cho các hàm bên trong Transaction
      mockPrismaService.db.inventory.findUnique.mockResolvedValue(null); // Chưa từng nhập (Create)
      mockPrismaService.db.inventory.upsert.mockResolvedValue(mockNewInventory);
      mockPrismaService.db.inventoryTransaction.create.mockResolvedValue(mockTxLog);

      const result = await service.stockIn(adminId, dto as any);

      expect(result.newInventory).toEqual(mockNewInventory);
      expect(prisma.db.inventory.upsert).toHaveBeenCalled();
      expect(prisma.db.inventoryTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: TransactionType.IN, quantity: 10 }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('inventory.stockIn', expect.any(Object));
    });
  });

  // ===================================================================
  // TEST SUITE: stockOut (Xuất kho)
  // ===================================================================
  describe('stockOut', () => {
    const dto = { warehouseId: 'wh-1', variantId: 'var-1', quantity: 5 };

    beforeEach(() => {
      mockPrismaService.db.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrismaService.db.productVariant.findUnique.mockResolvedValue(mockVariant);
    });

    it('Nên ném BadRequestException nếu số lượng tồn kho không đủ', async () => {
      // Tồn kho chỉ có 2, nhưng đòi xuất 5
      mockPrismaService.db.inventory.findUnique.mockResolvedValue({ id: 'inv-1', quantity: 2 });

      await expect(service.stockOut(adminId, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('Nên từ chối nếu tồn kho bị giảm sau lần đọc ban đầu', async () => {
      mockPrismaService.db.inventory.findUnique
        .mockResolvedValueOnce({ id: 'inv-1', quantity: 10 })
        .mockResolvedValueOnce({ id: 'inv-1', quantity: 2 });
      mockPrismaService.db.inventory.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.stockOut(adminId, dto as any)).rejects.toThrow(BadRequestException);
      expect(prisma.db.inventoryTransaction.createMany).not.toHaveBeenCalled();
    });
    it('Nên ném BadRequestException nếu sản phẩm chưa từng có trong kho', async () => {
      mockPrismaService.db.inventory.findUnique.mockResolvedValue(null);

      await expect(service.stockOut(adminId, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('Nên thực thi trừ tồn kho, lưu log transaction và bắn sự kiện', async () => {
      const existingInventory = { id: 'inv-1', quantity: 10 };
      const updatedInventory = { id: 'inv-1', quantity: 5 };
      mockPrismaService.db.inventory.findUnique
        .mockResolvedValueOnce(existingInventory)
        .mockResolvedValueOnce(updatedInventory);
      mockPrismaService.db.inventory.updateMany.mockResolvedValue({ count: 1 });

      await service.stockOut(adminId, dto as any);

      // Điều kiện tồn kho và phép trừ phải nằm trong cùng một câu lệnh cập nhật.
      expect(prisma.db.inventory.updateMany).toHaveBeenCalledWith({
        where: { id: existingInventory.id, quantity: { gte: dto.quantity } },
        data: { quantity: { decrement: dto.quantity } },
      });

      // Hàm deductStockAndLog phải tạo lịch sử giao dịch (Transaction OUT)
      expect(prisma.db.inventoryTransaction.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ type: TransactionType.OUT, quantity: dto.quantity }),
        ],
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('inventory.stockOut', expect.any(Object));
    });
  });

  // ===================================================================
  // TEST SUITE: Phân tích helpers trực tiếp (deduct / restore)
  // ===================================================================
  describe('deductStockAndLog & restoreStockAndLog', () => {
    it('Nên return sớm nếu mảng items truyền vào rỗng', async () => {
      const deductResult = await service.deductStockAndLog(mockPrismaService.db as any, [], adminId);
      expect(deductResult).toEqual([]);
      expect(prisma.db.inventory.update).not.toHaveBeenCalled();

      await service.restoreStockAndLog(mockPrismaService.db as any, [], adminId);
      expect(prisma.db.inventoryTransaction.createMany).not.toHaveBeenCalled();
    });
  });
});