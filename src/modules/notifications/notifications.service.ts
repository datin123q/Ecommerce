import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsGateway } from './notifications.gateway';
import Redis from 'ioredis';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly CACHE_TTL = 600000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    @InjectQueue('notification-queue') private readonly notificationQueue: Queue,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) { }

  async getUserNotifications(userId: string) {
    const cacheKey = `noti_${userId}_v`;
    const cachedStr = await this.redisClient.get(cacheKey);
    if (cachedStr) {
      return JSON.parse(cachedStr);
    }

    const notifications = await this.prisma.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    await this.redisClient.set(
      cacheKey,
      JSON.stringify(notifications),
      'PX',
      this.CACHE_TTL
    );
    return notifications;
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

  async createNotification(userId: string, content: string) {
    const newNoti = await this.prisma.db.notification.create({
      data: { userId, content, isRead: false },
    });
    const count = await this.prisma.db.notification.count({
      where: { userId, isRead: false },
    });
    this.gateway.sendToUser(userId, 'new_notification', {
      notification: newNoti,
      unreadCount: count,
    });
    const cacheKey = `noti_${userId}_v`;
    await this.redisClient.del(cacheKey);

    this.logger.log(`Đã tạo và bắn realtime thông báo cho User: ${userId}`);
    return newNoti;
  }

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