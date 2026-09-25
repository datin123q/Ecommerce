import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsGateway } from './notifications.gateway';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsListener } from './notifications.listener';

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({name: 'notification-queue',}),],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, NotificationsListener],
  exports: [NotificationsService]
})
export class NotificationsModule {}