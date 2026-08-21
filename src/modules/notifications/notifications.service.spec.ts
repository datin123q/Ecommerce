import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  // 1. TẠO CÁC BẢN SAO GIẢ MẠO (MOCKS)
  const mockPrismaService = {
    notification: {
      count: jest.fn(), // Tạo một hàm giả cho lệnh count
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
});