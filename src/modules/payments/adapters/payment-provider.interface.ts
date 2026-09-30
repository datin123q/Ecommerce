import type Stripe from 'stripe';

export interface IPaymentProvider {
  createPaymentIntent(
    amount: number,
    orderId: string,
    metadata: { paymentId: string },
    idempotencyKey: string,
  ): Promise<{ clientSecret: string; id: string }>;
  verifyWebhookEvent(payload: Buffer, signature: string): Stripe.Event;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
