import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { describe } from 'node:test';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  // 1. TẠO CÁC BẢN SAO GIẢ MẠO (MOCKS)
  const mockPrismaService = {
    notification: {
      count: jest.fn(), // Tạo một hàm giả cho lệnh count
      updateMany: jest.fn(),
    },
  };

  const mockQueue = {
    add: jest.fn(), // Tạo một hàm giả cho lệnh đẩy Queue
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

    service = module.get(NotificationsService);
    prisma = module.get(PrismaService);
  });

  // 3. XÓA SẠCH LỊCH SỬ GỌI HÀM GIẢ SAU MỖI BÀI TEST
  afterEach(() => {
    jest.clearAllMocks();
  });

  //  BẮT ĐẦU TEST 

  describe('getUnreadCount', () => {
    it('phải trả về đúng số lượng thông báo chưa đọc', async () => {
      // BƯỚC A: Setup kịch bản (Giả sử DB trả về có 5 thông báo)
      const fakeUserId = 'user-123';
      mockPrismaService.notification.count.mockResolvedValue(5);

      // BƯỚC B: Chạy hàm cần test
      const result = await service.getUnreadCount(fakeUserId);

      // BƯỚC C: Khẳng định kết quả (Expectations)
      // 1. Kết quả trả về phải là { unreadCount: 5 }
      expect(result).toEqual({ unreadCount: 5 });
      
      // 2. Prisma phải được gọi đúng 1 lần với điều kiện (where) chính xác
      expect(prisma.notification.count).toHaveBeenCalledTimes(1);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: fakeUserId, isRead: false },
      });
    });
  });

  describe('markAsRead', () => {
    it('Nên gọi prisma updateMany với đúng tham số và trả về thông báo thành công', async () => {
      // Arrange - Chuẩn bị dữ liệu
      const fakeUserId = 'user-123';
      const fakeNotificationId = 'notif-456';
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 1 });

      // Act - Gọi hàm cần test
      const result = await service.markAsRead(fakeUserId, fakeNotificationId);

      // Assert - Kiểm tra kết quả
      // Kiểm tra xem hàm updateMany có được gọi với đúng tham số không
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { id: fakeNotificationId, userId: fakeUserId },
        data: { isRead: true },
      });

      // Kiểm tra kết quả trả về của hàm markAsRead có đúng như kỳ vọng không
      expect(result).toEqual({ message: 'Đã đánh dấu đọc' });
    });

    it('Nên ném ra lỗi (throw error) nếu Prisma gặp vấn đề (VD: mất kết nối DB)', async () => {
      // Arrange
      const fakeUserId = 'user-123';
      const fakeNotificationId = 'notif-456';
      const dbError = new Error('Database connection lost');

      // Giả lập lỗi từ Prisma
      mockPrismaService.notification.updateMany.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.markAsRead(fakeUserId, fakeNotificationId))
        .rejects
        .toThrow('Database connection lost');
    });
  });
  describe('markAllRead', () => {
    it('Nên gọi prisma updateMany với đúng tham số và trả về thông báo thành công', async () => {
      // Arrange - Chuẩn bị dữ liệu
      const fakeUserId = 'user-123';
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 1 });

      // Act - Gọi hàm cần test
      const result = await service.markAllAsRead(fakeUserId);

      // Assert - Kiểm tra kết quả
      // Kiểm tra xem hàm updateMany có được gọi với đúng tham số không
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: fakeUserId , isRead: false},
        data: { isRead: true },
      });

      // Kiểm tra kết quả trả về của hàm markAsRead có đúng như kỳ vọng không
      expect(result).toEqual({ message: 'Đã đánh dấu đọc tất cả' });
    });

    it('Nên ném ra lỗi (throw error) nếu Prisma gặp vấn đề (VD: mất kết nối DB)', async () => {
      // Arrange
      const fakeUserId = 'user-123';
      const fakeNotificationId = 'notif-456';
      const dbError = new Error('Database connection lost');

      // Giả lập lỗi từ Prisma
      mockPrismaService.notification.updateMany.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.markAllAsRead(fakeUserId))
        .rejects
        .toThrow('Database connection lost');
    });
  });
});