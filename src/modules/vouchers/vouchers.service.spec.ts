import { Test, TestingModule } from '@nestjs/testing';
import { VouchersService } from './vouchers.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('VouchersService', () => {
  let service: VouchersService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  // 1. MOCK OBJECTS
  const mockPrismaService = {
    db: {
      voucher: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      voucherUsage: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    },
  };

  const mockEventEmitter = { emit: jest.fn() };

  // Dữ liệu mẫu
  const adminId = 'admin-123';
  const voucherId = 'voucher-1';
  const mockVoucher = { id: voucherId, code: 'TET2024', limit: 100, count: 50, value: 50000 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<VouchersService>(VouchersService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // TEST SUITE: create & findAll
  // ===================================================================
  describe('create', () => {
    const dto = { code: 'TET2024', limit: 100, value: 50000 } as any;

    it('Nên ném ConflictException nếu mã Code đã tồn tại', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(mockVoucher);
      await expect(service.create(dto, adminId)).rejects.toThrow(ConflictException);
    });

    it('Nên tạo mới Voucher thành công và bắn Audit Event', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(null);
      mockPrismaService.db.voucher.create.mockResolvedValue(mockVoucher);

      const result = await service.create(dto, adminId);

      expect(result).toEqual(mockVoucher);
      expect(prisma.db.voucher.create).toHaveBeenCalledWith({ data: dto });
      expect(eventEmitter.emit).toHaveBeenCalledWith('voucher.created', expect.any(Object));
    });
  });

  describe('findAll', () => {
    it('Nên trả về danh sách voucher', async () => {
      mockPrismaService.db.voucher.findMany.mockResolvedValue([mockVoucher]);
      const result = await service.findAll();
      expect(result).toEqual([mockVoucher]);
      expect(prisma.db.voucher.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    });
  });

  // ===================================================================
  // TEST SUITE: updateVoucher & remove
  // ===================================================================
  describe('updateVoucher', () => {
    it('Nên ném NotFoundException nếu voucher không tồn tại', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(null);
      await expect(service.updateVoucher(voucherId, { limit: 10 }, adminId)).rejects.toThrow(NotFoundException);
    });

    it('Nên cập nhật voucher và bắn sự kiện', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(mockVoucher);
      const updatedVoucher = { ...mockVoucher, limit: 150 };
      mockPrismaService.db.voucher.update.mockResolvedValue(updatedVoucher);

      const result = await service.updateVoucher(voucherId, { limit: 150, value: 50000 }, adminId);

      expect(result).toEqual(updatedVoucher);
      expect(prisma.db.voucher.update).toHaveBeenCalledWith({
        where: { id: voucherId },
        data: { limit: 150, value: 50000 },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('voucher.update', expect.any(Object));
    });
  });

  describe('remove (Soft delete bằng limit: 0)', () => {
    it('Nên ném NotFoundException nếu voucher không tồn tại', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(null);
      await expect(service.remove(voucherId, adminId)).rejects.toThrow(NotFoundException);
    });

    it('Nên vô hiệu hóa voucher (limit = 0) và bắn sự kiện', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(mockVoucher);
      mockPrismaService.db.voucher.update.mockResolvedValue({ ...mockVoucher, limit: 0 });

      await service.remove(voucherId, adminId);

      expect(prisma.db.voucher.update).toHaveBeenCalledWith({
        where: { id: voucherId },
        data: { limit: 0 },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('voucher.delete', expect.any(Object));
    });
  });

  // ===================================================================
  // TEST SUITE: validateAndGetVoucher
  // ===================================================================
  describe('validateAndGetVoucher', () => {
    it('Nên ném NotFoundException nếu mã giảm giá không tồn tại', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(null);
      await expect(service.validateAndGetVoucher('WRONG')).rejects.toThrow(NotFoundException);
    });

    it('Nên ném BadRequestException nếu mã giảm giá hết lượt (count >= limit)', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue({ ...mockVoucher, count: 100, limit: 100 });
      await expect(service.validateAndGetVoucher('TET2024')).rejects.toThrow(BadRequestException);
    });

    it('Nên trả về voucher nếu hợp lệ', async () => {
      mockPrismaService.db.voucher.findUnique.mockResolvedValue(mockVoucher); // limit 100, count 50
      const result = await service.validateAndGetVoucher('TET2024');
      expect(result).toEqual(mockVoucher);
    });
  });

  // ===================================================================
  // TEST SUITE: Giao dịch áp mã (Transaction: applyVoucher & restoreVoucher)
  // ===================================================================
  describe('Transaction Methods (apply / restore)', () => {
    const tx = mockPrismaService.db as any; // Tận dụng PrismaService giả làm TransactionClient
    const userId = 'user-1';
    const orderId = 'order-1';

    describe('applyVoucher', () => {
      it('Nên ném BadRequestException nếu Race Condition xảy ra (chạm limit trong lúc update)', async () => {
        // Mô phỏng hàm updateMany trả về count: 0 (nghĩa là where { count < limit } không khớp)
        mockPrismaService.db.voucher.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.applyVoucher(tx, voucherId, 100, userId, orderId)).rejects.toThrow(BadRequestException);
      });

      it('Nên tăng count và tạo VoucherUsage lịch sử', async () => {
        mockPrismaService.db.voucher.updateMany.mockResolvedValue({ count: 1 });

        await service.applyVoucher(tx, voucherId, 100, userId, orderId);

        expect(tx.voucher.updateMany).toHaveBeenCalledWith({
          where: { id: voucherId, count: { lt: 100 } },
          data: { count: { increment: 1 } },
        });
        expect(tx.voucherUsage.create).toHaveBeenCalledWith({
          data: { voucherId, userId, orderId },
        });
      });
    });

    describe('restoreVoucher', () => {
      it('Nên bỏ qua (return) nếu không tìm thấy VoucherUsage', async () => {
        mockPrismaService.db.voucherUsage.findFirst.mockResolvedValue(null);

        await service.restoreVoucher(tx, orderId, userId);

        expect(tx.voucher.update).not.toHaveBeenCalled();
        expect(tx.voucherUsage.delete).not.toHaveBeenCalled();
      });

      it('Nên giảm count và xóa lịch sử VoucherUsage', async () => {
        const usageId = 'usage-1';
        mockPrismaService.db.voucherUsage.findFirst.mockResolvedValue({ id: usageId, voucherId });

        await service.restoreVoucher(tx, orderId, userId);

        expect(tx.voucher.update).toHaveBeenCalledWith({
          where: { id: voucherId },
          data: { count: { decrement: 1 } },
        });
        expect(tx.voucherUsage.delete).toHaveBeenCalledWith({
          where: { id: usageId },
        });
      });
    });
  });
});