import { Test, TestingModule } from '@nestjs/testing';
import { VouchersService } from './vouchers.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('VouchersService', () => {
  let service: VouchersService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  // --- DỮ LIỆU GIẢ ĐỊNH (MOCK DATA) ---
  const mockAdminId = 'admin-123';
  const mockVoucherId = 'voucher-123';
  const mockVoucherCode = 'DISCOUNT50K';

  const mockVoucher = {
    id: mockVoucherId,
    code: mockVoucherCode,
    value: 50000,
    count: 0,
    limit: 100,
  };

  const createVoucherDto = {
    code: mockVoucherCode,
    value: 50000,
    limit: 100,
  };

  const updateVoucherDto = {
    limit: 200,
    value: 60000,
  };

  // --- MOCK SERVICES ---
  const mockPrismaService = {
    voucher: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // CREATE VOUCHER
  // ==========================================================
  describe('create', () => {
    it('should throw ConflictException if voucher code already exists', async () => {
      mockPrismaService.voucher.findUnique.mockResolvedValue(mockVoucher);

      await expect(service.create(createVoucherDto, mockAdminId)).rejects.toThrow(
        new ConflictException('Mã voucher này đã tồn tại!')
      );
      expect(prisma.voucher.findUnique).toHaveBeenCalledWith({ where: { code: createVoucherDto.code } });
      expect(prisma.voucher.create).not.toHaveBeenCalled();
    });

    it('should create voucher, emit event and return the voucher', async () => {
      mockPrismaService.voucher.findUnique.mockResolvedValue(null);
      mockPrismaService.voucher.create.mockResolvedValue(mockVoucher);

      const result = await service.create(createVoucherDto, mockAdminId);

      expect(prisma.voucher.create).toHaveBeenCalledWith({ data: createVoucherDto });
      
      expect(eventEmitter.emit).toHaveBeenCalledWith('voucher.created', {
        id: mockAdminId,
        action: 'CREATE',
        entity: 'Voucher',
        entityId: mockVoucher.id,
        oldValue: null,
        newValue: mockVoucher,
        tx: prisma, // Service truyền vào this.prisma
      });

      expect(result).toEqual(mockVoucher);
    });
  });

  // ==========================================================
  // FIND ALL VOUCHERS
  // ==========================================================
  describe('findAll', () => {
    it('should return all vouchers ordered by createdAt desc', async () => {
      const mockVouchers = [mockVoucher];
      mockPrismaService.voucher.findMany.mockResolvedValue(mockVouchers);

      const result = await service.findAll();

      expect(prisma.voucher.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
      expect(result).toEqual(mockVouchers);
    });
  });

  // ==========================================================
  // CHECK VOUCHER
  // ==========================================================
  describe('checkVoucher', () => {
    const orderTotal = 200000;

    it('should throw NotFoundException if voucher not found', async () => {
      mockPrismaService.voucher.findUnique.mockResolvedValue(null);

      await expect(service.checkVoucher('INVALID_CODE', orderTotal)).rejects.toThrow(
        new NotFoundException('Mã giảm giá không hợp lệ hoặc không tồn tại')
      );
    });

    it('should throw BadRequestException if voucher limit is reached', async () => {
      const exhaustedVoucher = { ...mockVoucher, count: 100, limit: 100 };
      mockPrismaService.voucher.findUnique.mockResolvedValue(exhaustedVoucher);

      await expect(service.checkVoucher(mockVoucherCode, orderTotal)).rejects.toThrow(
        new BadRequestException('Mã giảm giá đã hết lượt sử dụng')
      );
    });

    it('should return voucher info if valid', async () => {
      mockPrismaService.voucher.findUnique.mockResolvedValue(mockVoucher);

      const result = await service.checkVoucher(mockVoucherCode, orderTotal);

      expect(result).toEqual({
        voucherId: mockVoucher.id,
        code: mockVoucher.code,
        discountAmount: mockVoucher.value, // discountAmount = voucher.value
      });
    });
  });

  // ==========================================================
  // UPDATE VOUCHER
  // ==========================================================
  describe('updateVoucher', () => {
    it('should throw NotFoundException if voucher does not exist', async () => {
      mockPrismaService.voucher.findUnique.mockResolvedValue(null);

      await expect(service.updateVoucher(mockVoucherId, updateVoucherDto, mockAdminId)).rejects.toThrow(
        new NotFoundException(`Không tìm thấy voucher với id ${mockVoucherId}`)
      );
      expect(prisma.voucher.update).not.toHaveBeenCalled();
    });

    it('should update voucher, emit update event and return updated data', async () => {
      const updatedVoucher = { ...mockVoucher, ...updateVoucherDto };
      mockPrismaService.voucher.findUnique.mockResolvedValue(mockVoucher);
      mockPrismaService.voucher.update.mockResolvedValue(updatedVoucher);

      const result = await service.updateVoucher(mockVoucherId, updateVoucherDto, mockAdminId);

      expect(prisma.voucher.update).toHaveBeenCalledWith({
        where: { id: mockVoucherId },
        data: updateVoucherDto,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('voucher.update', {
        id: mockAdminId,
        action: 'UPDATE',
        entity: 'Voucher',
        entityId: mockVoucherId,
        oldValue: mockVoucher,
        newValue: updatedVoucher,
        tx: prisma,
      });

      expect(result).toEqual(updatedVoucher);
    });
  });

  // ==========================================================
  // REMOVE VOUCHER
  // ==========================================================
  describe('remove', () => {
    it('should throw NotFoundException if voucher does not exist', async () => {
      mockPrismaService.voucher.findUnique.mockResolvedValue(null);

      await expect(service.remove(mockVoucherId, mockAdminId)).rejects.toThrow(
        new NotFoundException(`Không tìm thấy voucher với id ${mockVoucherId}`)
      );
      expect(prisma.voucher.update).not.toHaveBeenCalled();
    });

    it('should soft delete voucher (set count=0, limit=0) and emit delete event', async () => {
      const removedVoucher = { ...mockVoucher, count: 0, limit: 0 };
      mockPrismaService.voucher.findUnique.mockResolvedValue(mockVoucher);
      mockPrismaService.voucher.update.mockResolvedValue(removedVoucher);

      const result = await service.remove(mockVoucherId, mockAdminId);

      // Vì là soft delete, test expect gọi update thay vì delete
      expect(prisma.voucher.update).toHaveBeenCalledWith({
        where: { id: mockVoucherId },
        data: { limit: 0, count: 0 },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('voucher.delete', {
        id: mockAdminId,
        action: 'DELETE',
        entity: 'Voucher',
        entityId: mockVoucherId,
        oldValue: mockVoucher,
        newValue: removedVoucher, // newValue là trạng thái sau khi set limit/count về 0
        tx: prisma,
      });

      expect(result).toEqual(removedVoucher);
    });
  });
});