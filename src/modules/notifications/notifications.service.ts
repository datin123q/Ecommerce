import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    @InjectQueue('notification-queue') private readonly notificationQueue: Queue
  ) {}
    
  // ==========================================================
  // 1. CÁC HÀM XỬ LÝ DỮ LIỆU BÌNH THƯỜNG (Dành cho Controller)
  // ==========================================================
  
  getUserNotifications(userId: string) {
    return this.prisma.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.db.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.prisma.db.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return { message: 'Đã đánh dấu đọc' };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Đã đánh dấu đọc tất cả' };
  }

  // Hàm này ĐƯỢC WORKER GỌI để ghi thực tế xuống Database
  async createNotification(userId: string, content: string) {
    // 1. Ghi xuống DB
    const newNoti = await this.prisma.db.notification.create({
      data: { userId, content, isRead: false },
    });

    // 2. Lấy số lượng thông báo chưa đọc mới nhất
    const count = await this.prisma.db.notification.count({
      where: { userId, isRead: false },
    });

    // 3. Bắn Realtime qua Socket cho Frontend 
    this.gateway.sendToUser(userId, 'new_notification', {
      notification: newNoti,
      unreadCount: count,
    });

    this.logger.log(`Đã tạo và bắn realtime thông báo cho User: ${userId}`);
    return newNoti;
  }
  // ==========================================================
  // 2. KẾT NỐI VỚI HÀNG ĐỢI (BULLMQ)
  // ==========================================================

  async pushNotificationToQueue(userId: string, content: string) {
    await this.notificationQueue.add(
      'create-notification-job',
      { userId, content },
      { 
        attempts: 3,
        removeOnComplete: true, 
      }
    );
  }
  // 3. LẮNG NGHE SỰ KIỆN TỪ HỆ THỐNG 

  @OnEvent('order.created')
  @OnEvent('cartItem.created')
  @OnEvent('cartItem.delete')
  @OnEvent('paymentCod.created')
  @OnEvent('paymentStripe.created')
  @OnEvent('profile.update')
  @OnEvent('role.update')
  async handleAllNotificationEvents(payload: { userId: string; content: string }) {
    try {
      await this.pushNotificationToQueue(payload.userId, payload.content);
    } catch (error) {
      this.logger.error(`Lỗi khi đẩy thông báo vào hàng đợi: ${error.message}`);
    }
  }
}