import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { IPaymentProvider } from './payment-provider.interface';

@Injectable()
export class StripeAdapter implements IPaymentProvider {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(private configService: ConfigService) {
    this.stripe = new Stripe(this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-07-29.dahlia' as any,
    });
    this.webhookSecret = this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }

  async createPaymentIntent(amount: number, orderId: string, metadata: any) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'vnd',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { orderId, ...metadata },
    });
    if (!paymentIntent.client_secret) {
      throw new InternalServerErrorException('Lỗi hệ thống: Stripe không trả về client_secret');
    }

    return { clientSecret: paymentIntent.client_secret };
  }

  verifyWebhookEvent(payload: Buffer, signature: string) {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }
}