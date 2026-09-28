import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { getQueueToken } from '@nestjs/bullmq';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;
  let gateway: NotificationsGateway;
  let redisClient: any;
  let notificationQueue: any;

  // 1. KHỞI TẠO CÁC MOCK OBJECTS
  const mockPrismaService = {
    db: {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    },
  };

  const mockGateway = {
    sendToUser: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  // Mock ioredis client
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const userId = 'user-123';
  const mockNotification = {
    id: 'noti-1',
    userId,
    content: 'Bạn có đơn hàng mới',
    isRead: false,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsGateway, useValue: mockGateway },
        { provide: getQueueToken('notification-queue'), useValue: mockQueue },
        // Tiêm Mock Redis theo Custom Provider Token 'REDIS_CLIENT'
        { provide: 'REDIS_CLIENT', useValue: mockRedisClient },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    redisClient = module.get('REDIS_CLIENT');
    notificationQueue = module.get(getQueueToken('notification-queue'));

    jest.clearAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // TEST SUITE: getUserNotifications (Kiểm thử Caching)
  // ===================================================================
  describe('getUserNotifications', () => {
    it('Nên trả về dữ liệu từ Redis Cache nếu tồn tại', async () => {
      const cachedData = [mockNotification];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getUserNotifications(userId);

      // Lưu ý: JSON.parse sẽ biến đổi object Date thành chuỗi (string), 
      // nên dùng stringify -> parse để so sánh chính xác kiểu dữ liệu trả về
      expect(result).toEqual(JSON.parse(JSON.stringify(cachedData))); 
      expect(redisClient.get).toHaveBeenCalledWith(`noti_${userId}_v`);
      expect(prisma.db.notification.findMany).not.toHaveBeenCalled();
    });

    it('Nên lấy từ DB và lưu vào Redis nếu Cache rỗng (Cache Miss)', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrismaService.db.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.getUserNotifications(userId);

      expect(result).toEqual([mockNotification]);
      expect(prisma.db.notification.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      // Kiểm tra tham số TTL của Redis được set đúng: 'PX' (mili-giây) và 600000 (10 phút)
      expect(redisClient.set).toHaveBeenCalledWith(
        `noti_${userId}_v`,
        JSON.stringify([mockNotification]),
        'PX',
        600000, 
      );
    });
  });

  // ===================================================================
  // TEST SUITE: getUnreadCount
  // ===================================================================
  describe('getUnreadCount', () => {
    it('Nên đếm số thông báo chưa đọc từ database', async () => {
      mockPrismaService.db.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(userId);

      expect(result).toEqual({ unreadCount: 5 });
      expect(prisma.db.notification.count).toHaveBeenCalledWith({
        where: { userId, isRead: false },
      });
    });
  });

  // ===================================================================
  // TEST SUITE: markAsRead & markAllAsRead (Xử lý Cache Invalidation)
  // ===================================================================
  describe('markAsRead', () => {
    it('Nên cập nhật 1 thông báo thành đã đọc và xóa cache', async () => {
      const notiId = 'noti-1';
      mockPrismaService.db.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead(userId, notiId);

      expect(result).toEqual({ message: 'Đã đánh dấu đọc' });
      expect(prisma.db.notification.updateMany).toHaveBeenCalledWith({
        where: { id: notiId, userId },
        data: { isRead: true },
      });
      expect(redisClient.del).toHaveBeenCalledWith(`noti_${userId}_v`);
    });
  });

  describe('markAllAsRead', () => {
    it('Nên cập nhật tất cả thông báo thành đã đọc và xóa cache', async () => {
      mockPrismaService.db.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead(userId);

      expect(result).toEqual({ message: 'Đã đánh dấu đọc tất cả' });
      expect(prisma.db.notification.updateMany).toHaveBeenCalledWith({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
      expect(redisClient.del).toHaveBeenCalledWith(`noti_${userId}_v`);
    });
  });

  // ===================================================================
  // TEST SUITE: createNotification (Luồng Realtime)
  // ===================================================================
  describe('createNotification', () => {
    it('Nên tạo thông báo, đếm số lượng chưa đọc, bắn socket và xóa cache', async () => {
      const content = 'Đơn hàng đã được duyệt';
      
      // 1. Mock DB Create
      mockPrismaService.db.notification.create.mockResolvedValue(mockNotification);
      
      // 2. Kỹ thuật Spy hàm nội bộ: Chặn hàm getUnreadCount để ép trả về 3
      const getUnreadSpy = jest.spyOn(service, 'getUnreadCount').mockResolvedValue({ unreadCount: 3 });

      const result = await service.createNotification(userId, content);

      expect(result).toEqual(mockNotification);
      
      expect(prisma.db.notification.create).toHaveBeenCalledWith({
        data: { userId, content, isRead: false },
      });

      // Kiểm tra Gateway đã bắn sự kiện realtime cho đúng User chưa
      expect(gateway.sendToUser).toHaveBeenCalledWith(userId, 'new_notification', {
        notification: mockNotification,
        unreadCount: 3, // Dữ liệu lấy từ spy
      });

      // Đảm bảo cache đã bị xóa để user get list mới
      expect(redisClient.del).toHaveBeenCalledWith(`noti_${userId}_v`);

      // Dọn dẹp spy
      getUnreadSpy.mockRestore();
    });
  });

  // ===================================================================
  // TEST SUITE: pushNotificationToQueue (Hàng đợi)
  // ===================================================================
  describe('pushNotificationToQueue', () => {
    it('Nên đẩy job tạo thông báo vào BullMQ với số lần thử lại (attempts) là 3', async () => {
      const content = 'Xử lý bất đồng bộ';

      await service.pushNotificationToQueue(userId, content);

      expect(notificationQueue.add).toHaveBeenCalledWith(
        'create-notification-job',
        { userId, content },
        { attempts: 3, removeOnComplete: true },
      );
    });
  });
});