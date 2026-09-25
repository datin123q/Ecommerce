import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
  ) {}

  private getCacheKey(userId: string): string {
    return `noti_${userId}_v`;
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    await this.redisClient.del(this.getCacheKey(userId));
  }

  async getUserNotifications(userId: string) {
    const cacheKey = this.getCacheKey(userId);
    const cachedStr = await this.redisClient.get(cacheKey);
    
    if (cachedStr) {
      return JSON.parse(cachedStr);
    }

    const notifications = await this.prisma.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    await this.redisClient.set(cacheKey, JSON.stringify(notifications), 'PX', this.CACHE_TTL);
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
    await this.invalidateUserCache(userId); 
    return { message: 'Đã đánh dấu đọc' };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    await this.invalidateUserCache(userId); 
    return { message: 'Đã đánh dấu đọc tất cả' };
  }

  async createNotification(userId: string, content: string) {
    const newNoti = await this.prisma.db.notification.create({
      data: { userId, content, isRead: false },
    });

    const { unreadCount } = await this.getUnreadCount(userId); 

    this.gateway.sendToUser(userId, 'new_notification', {
      notification: newNoti,
      unreadCount,
    });

    await this.invalidateUserCache(userId);
    this.logger.log(`Đã tạo và bắn realtime thông báo cho User: ${userId}`);
    
    return newNoti;
  }

  async pushNotificationToQueue(userId: string, content: string) {
    await this.notificationQueue.add(
      'create-notification-job',
      { userId, content },
      { attempts: 3, removeOnComplete: true }
    );
  }
}