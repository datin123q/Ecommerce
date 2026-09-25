/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from '../modules/notifications/notifications.service';

@Processor('notification-queue')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`[Worker] Bắt đầu xử lý Job: ${job.name}`);

    switch (job.name) {
      case 'create-notification-job': 
        try {
          await this.notificationsService.createNotification(
            job.data.userId, 
            job.data.content,
          );
          this.logger.log(`[Worker] Đã lưu thông báo cho User ${job.data.userId}`);
        } catch (error) {
          this.logger.error(`[Worker]  Lỗi khi lưu thông báo: ${error.message}`);
          throw error; 
        }
        break;

      default:
        this.logger.warn(`[Worker]  Bỏ qua Job vì không nhận diện được tên: ${job.name}`);
    }
  }
}