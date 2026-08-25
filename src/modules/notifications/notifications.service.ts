import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, @InjectQueue('notification-queue') private readonly notificationQueue: Queue,) {}

  // Lấy toàn bộ thông báo (mới nhất lên đầu)
  getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Đếm số thông báo CHƯA ĐỌC (để hiển thị số lên icon quả chuông)
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  // Đánh dấu 1 thông báo là đã đọc
  async markAsRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return { message: 'Đã đánh dấu đọc' };
  }

  // Đánh dấu TẤT CẢ là đã đọc
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Đã đánh dấu đọc tất cả' };
  }
  async pushNotificationToQueue(userId: string, content: string) {
    await this.notificationQueue.add(
      'create-notification-job',
      { userId, content },
      { attempts: 3, removeOnComplete: true }
    );
  }
  async createNotification(userId: string, content: string) {
    return this.prisma.notification.create({
      data: { userId, content, isRead: false },
    });
  }
}