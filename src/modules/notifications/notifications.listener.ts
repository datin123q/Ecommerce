import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent('order.created')
  @OnEvent('cartItem.created')
  @OnEvent('cartItem.delete')
  @OnEvent('paymentCod.created')
  @OnEvent('paymentStripe.created')
  @OnEvent('profile.update')
  @OnEvent('role.update')
  async handleAllNotificationEvents(payload: { userId: string; content: string }) {
    try {
      await this.notificationsService.pushNotificationToQueue(payload.userId, payload.content);
    } catch (error) {
      this.logger.error(`Lỗi khi đẩy thông báo vào hàng đợi: ${error.message}`);
    }
  }
}