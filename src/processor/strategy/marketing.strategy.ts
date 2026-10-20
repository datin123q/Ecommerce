import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { RedisCacheService } from '../../redis/redisCache.service';
import { BaseEmailPayload } from '../interface/email-strategy.interface';
import { BaseEmailStrategy } from '../interface/base-email.strategy';

export interface MarketingPayload extends BaseEmailPayload {
  email: string;
  fullName: string;
  userId: string;
  products: [];
}

@Injectable()
export class MarketingStrategy extends BaseEmailStrategy<MarketingPayload> {
  constructor(
    mailerService: MailerService,
    private readonly cacheService: RedisCacheService,
  ) {
    super(mailerService);
  }

  async send(payload: MarketingPayload): Promise<void> {
    const campaignId = new Date().toISOString().slice(0, 10);
    const sentKey = `marketing:sent:${campaignId}:${payload.userId}`;

    if (await this.cacheService.getRaw(sentKey)) return;

    await this.mailerService.sendMail({
      to: payload.email,
      subject: '[E-Commerce] 🔥 Đừng bỏ lỡ bộ sưu tập mới tuần này!',
      html: this.renderTemplate('marketing', {
        email: payload.email,
        fullName: payload.fullName,
        userId: payload.userId,
        products: payload.products,
      }),
    });

    const marked = await this.cacheService.setNX(
      sentKey,
      '1',
      24 * 60 * 60,
    );

    if (!marked && !(await this.cacheService.getRaw(sentKey))) {
      throw new Error('Chiến dịch đã thực hiện!');
    }
  }
}