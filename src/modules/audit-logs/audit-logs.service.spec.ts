import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../../database/prisma.service';
import { Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prisma: PrismaService;
  
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const mockPrismaService = {
    db: {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
    prisma = module.get<PrismaService>(PrismaService);

    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    jest.clearAllMocks();
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // TEST SUITE: logAction
  // ===================================================================
  describe('logAction', () => {
    const userId = 'user-123';
    const action = 'CREATE' as AuditAction;
    const entity = 'Product';
    const entityId = 'prod-1';

    it('Nên tạo audit log thành công bằng Prisma mặc định khi không có transaction', async () => {
      const oldValues = { price: 100 };
      const newValues = { price: 200 };
      
      mockPrismaService.db.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.logAction(userId, action, entity, entityId, oldValues, newValues);

      expect(prisma.db.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId,
          action,
          entity,
          entityId,
          oldValues: JSON.parse(JSON.stringify(oldValues)),
          newValues: JSON.parse(JSON.stringify(newValues)),
        },
      });
    });

    it('Nên set oldValues và newValues thành null nếu không được truyền vào', async () => {
      await service.logAction(userId, action, entity, entityId);

      expect(prisma.db.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValues: null,
          newValues: null,
        }),
      });
    });

    it('Nên sử dụng Transaction Client (tx) nếu được cung cấp thay vì this.prisma.db', async () => {
      const mockTx = {
        auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-tx' }) },
      };

      await service.logAction(userId, action, entity, entityId, undefined, undefined, mockTx as any);

      expect(mockTx.auditLog.create).toHaveBeenCalled();
      expect(prisma.db.auditLog.create).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // TEST SUITE: getLogs
  // ===================================================================
  describe('getLogs', () => {
    it('Nên trả về danh sách logs kèm theo thông tin người dùng và sắp xếp mới nhất', async () => {
      const mockLogs = [{ id: 'log-1', entity: 'Product' }];
      mockPrismaService.db.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getLogs();

      expect(result).toEqual(mockLogs);
      expect(prisma.db.auditLog.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true, role: true },
          },
        },
      });
    });
  });

  // ===================================================================
  // TEST SUITE: handleEvent
  // ===================================================================
  describe('handleEvent', () => {
    let logActionSpy: jest.SpyInstance;

    beforeEach(() => {
      logActionSpy = jest.spyOn(service, 'logAction').mockResolvedValue(undefined as any);
    });

    it('Nên ưu tiên dùng actorId làm userId và gọi logAction', async () => {
      const payload = {
        actorId: 'admin-1',
        userId: 'user-2', 
        action: 'UPDATE' as AuditAction,
        entity: 'Category',
        entityId: 'cat-1',
      };

      await service.handleEvent(payload);

      expect(logActionSpy).toHaveBeenCalledWith(
        'admin-1', 
        payload.action,
        payload.entity,
        payload.entityId,
        undefined,
        undefined,
      );
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('Nên fallback sang dùng userId nếu actorId không tồn tại', async () => {
      const payload = {
        userId: 'user-2',
        action: 'DELETE' as AuditAction,
        entity: 'Product',
        entityId: 'prod-1',
      };

      await service.handleEvent(payload);

      expect(logActionSpy).toHaveBeenCalledWith(
        'user-2', 
        payload.action,
        payload.entity,
        payload.entityId,
        undefined,
        undefined,
      );
    });

    it('Nên ghi log cảnh báo (warn) và thoát sớm nếu không có cả actorId và userId', async () => {
      const payload = {
        action: 'CREATE' as AuditAction,
        entity: 'Variant',
        entityId: 'var-1',
      };

      await service.handleEvent(payload);

      expect(logActionSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `[AuditLog] Bỏ qua ghi log do không có ID người thực hiện: Variant`,
      );
    });

    it('Nên bắt lỗi (catch) và ghi log lỗi (error) nếu hàm logAction thất bại', async () => {
      const payload = {
        actorId: 'user-1',
        action: 'CREATE' as AuditAction,
        entity: 'Warehouse',
        entityId: 'wh-1',
      };

      const errorMessage = 'Lỗi kết nối cơ sở dữ liệu';
      logActionSpy.mockRejectedValue(new Error(errorMessage)); // Ép hàm ném lỗi

      await service.handleEvent(payload);

      expect(logActionSpy).toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `[AuditLog] Lỗi khi ghi log cho Warehouse: ${errorMessage}`,
      );
    });

    it('Nên xử lý lỗi không xác định (Unknown error) nếu ngoại lệ ném ra không phải là Error Object', async () => {
      const payload = {
        actorId: 'user-1',
        action: 'CREATE' as AuditAction,
        entity: 'Inventory',
        entityId: 'inv-1',
      };

      logActionSpy.mockRejectedValue('Một lỗi lạ lùng nào đó không rõ type');

      await service.handleEvent(payload);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `[AuditLog] Lỗi khi ghi log cho Inventory: Unknown error`,
      );
    });
  });
});