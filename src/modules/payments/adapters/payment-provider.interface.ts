export interface IPaymentProvider {
  createPaymentIntent(amount: number, orderId: string, metadata: any): Promise<{ clientSecret: string }>;
  verifyWebhookEvent(payload: Buffer, signature: string): any;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER'); 