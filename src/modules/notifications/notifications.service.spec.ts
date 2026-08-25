import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;
  let queue: any; 

  // 1. TẠO CÁC BẢN SAO GIẢ MẠO (MOCKS)
  const mockPrismaService = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(), 
    },
  };

  const mockQueue = {
    add: jest.fn(), 
  };

  beforeEach(async () => {
    // 2. KHỞI TẠO MODULE TEST 
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        // Ép NestJS dùng đồ giả thay vì đồ thật
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getQueueToken('notification-queue'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    queue = module.get(getQueueToken('notification-queue'));
  });

  // 3. XÓA SẠCH LỊCH SỬ GỌI HÀM GIẢ SAU MỖI BÀI TEST
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================
  // BẮT ĐẦU TEST CÁC HÀM CÓ SẴN TRONG MẪU
  // ==========================================================
  describe('getUnreadCount', () => {
    it('phải trả về đúng số lượng thông báo chưa đọc', async () => {
      const fakeUserId = 'user-123';
      mockPrismaService.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(fakeUserId);

      expect(result).toEqual({ unreadCount: 5 });
      expect(prisma.notification.count).toHaveBeenCalledTimes(1);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: fakeUserId, isRead: false },
      });
    });
  });

  describe('markAsRead', () => {
    it('Nên gọi prisma updateMany với đúng tham số và trả về thông báo thành công', async () => {
      const fakeUserId = 'user-123';
      const fakeNotificationId = 'notif-456';
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead(fakeUserId, fakeNotificationId);

      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { id: fakeNotificationId, userId: fakeUserId },
        data: { isRead: true },
      });
      expect(result).toEqual({ message: 'Đã đánh dấu đọc' });
    });

    it('Nên ném ra lỗi (throw error) nếu Prisma gặp vấn đề', async () => {
      const fakeUserId = 'user-123';
      const fakeNotificationId = 'notif-456';
      const dbError = new Error('Database connection lost');

      mockPrismaService.notification.updateMany.mockRejectedValue(dbError);

      await expect(service.markAsRead(fakeUserId, fakeNotificationId))
        .rejects
        .toThrow('Database connection lost');
    });
  });

  describe('markAllAsRead', () => {
    it('Nên gọi prisma updateMany với đúng tham số và trả về thông báo thành công', async () => {
      const fakeUserId = 'user-123';
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAllAsRead(fakeUserId);

      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: fakeUserId, isRead: false },
        data: { isRead: true },
      });
      expect(result).toEqual({ message: 'Đã đánh dấu đọc tất cả' });
    });

    it('Nên ném ra lỗi (throw error) nếu Prisma gặp vấn đề', async () => {
      const fakeUserId = 'user-123';
      const dbError = new Error('Database connection lost');

      mockPrismaService.notification.updateMany.mockRejectedValue(dbError);

      await expect(service.markAllAsRead(fakeUserId))
        .rejects
        .toThrow('Database connection lost');
    });
  });

  // ==========================================================
  // TEST CÁC HÀM MỚI BỔ SUNG
  // ==========================================================
  describe('getUserNotifications', () => {
    it('phải trả về danh sách thông báo được sắp xếp mới nhất lên đầu', async () => {
      const fakeUserId = 'user-123';
      const fakeNotifications = [
        { id: '1', content: 'Test 1' },
        { id: '2', content: 'Test 2' },
      ];
      mockPrismaService.notification.findMany.mockResolvedValue(fakeNotifications);

      const result = await service.getUserNotifications(fakeUserId);

      expect(result).toEqual(fakeNotifications);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: fakeUserId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('pushNotificationToQueue', () => {
    it('phải gọi hàm add của queue với đúng tên job, payload và options', async () => {
      const fakeUserId = 'user-123';
      const fakeContent = 'Bạn có đơn hàng mới';

      await service.pushNotificationToQueue(fakeUserId, fakeContent);

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        'create-notification-job',
        { userId: fakeUserId, content: fakeContent },
        { attempts: 3, removeOnComplete: true }
      );
    });
  });

  describe('createNotification', () => {
    it('phải tạo một thông báo mới với trạng thái isRead = false', async () => {
      const fakeUserId = 'user-123';
      const fakeContent = 'Thông báo test';
      const expectedResult = { id: 'new-id', userId: fakeUserId, content: fakeContent, isRead: false };
      
      mockPrismaService.notification.create.mockResolvedValue(expectedResult);

      const result = await service.createNotification(fakeUserId, fakeContent);

      expect(result).toEqual(expectedResult);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: fakeUserId, content: fakeContent, isRead: false },
      });
    });
  });

  // ==========================================================
  // TEST CÁC EVENT HANDLERS (Do logic giống hệt nhau nên gom lại)
  // ==========================================================
  describe('Event Handlers', () => {
    const fakePayload = { userId: 'user-123', content: 'Nội dung event' };
    const expectedDbCall = {
      data: { userId: fakePayload.userId, content: fakePayload.content, isRead: false },
    };

    it('handleOrderCreatedEvent nên tạo thông báo', async () => {
      await service.handleOrderCreatedEvent(fakePayload);
      expect(prisma.notification.create).toHaveBeenCalledWith(expectedDbCall);
    });

    it('handleCartItemCreatedEvent nên tạo thông báo', async () => {
      await service.handleCartItemCreatedEvent(fakePayload);
      expect(prisma.notification.create).toHaveBeenCalledWith(expectedDbCall);
    });

    it('handleCartItemDeleteEvent nên tạo thông báo', async () => {
      await service.handleCartItemDeleteEvent(fakePayload);
      expect(prisma.notification.create).toHaveBeenCalledWith(expectedDbCall);
    });

    it('handlepaymentCodCreatedEvent nên tạo thông báo', async () => {
      await service.handlepaymentCodCreatedEvent(fakePayload);
      expect(prisma.notification.create).toHaveBeenCalledWith(expectedDbCall);
    });

    it('handlepaymentStripeCreatedEvent nên tạo thông báo', async () => {
      await service.handlepaymentStripeCreatedEvent(fakePayload);
      expect(prisma.notification.create).toHaveBeenCalledWith(expectedDbCall);
    });

    it('handleProfileUpdateEvent nên tạo thông báo', async () => {
      await service.handleProfileUpdateEvent(fakePayload);
      expect(prisma.notification.create).toHaveBeenCalledWith(expectedDbCall);
    });

    it('handleRoleUpdateEvent nên tạo thông báo', async () => {
      await service.handleRoleUpdateEvent(fakePayload);
      expect(prisma.notification.create).toHaveBeenCalledWith(expectedDbCall);
    });
  });
});