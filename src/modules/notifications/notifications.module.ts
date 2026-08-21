import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationProcessor } from './notifications.processor';
import { DatabaseModule } from '../../database/database.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({name: 'notification-queue',}),],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationProcessor],
  exports: [NotificationsService]
})
export class NotificationsModule {}