import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { NotificationsGateway } from './notifications.gateway';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsListener } from './notifications.listener';
import { NotificationProcessor } from '../../processor/notifications.processor';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    BullModule.registerQueue({ name: 'notification-queue' }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsListener,
    NotificationProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
