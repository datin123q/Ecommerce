import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

import { CreatePaymentDto } from './dto/create-payment.dto';

import type Stripe from 'stripe';
import {
  PaymentStatus,
  PaymentMethod,
  OrderStatus,
  Order,
  Payment,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { StateTransition } from '../orders/domain/state-transition';

import {
  PAYMENT_PROVIDER,
  type IPaymentProvider,
} from './adapters/payment-provider.interface';

type StripeEventData = Stripe.PaymentIntent;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,

    private readonly eventEmitter: EventEmitter2,

    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
  ) {}

  async createPaymentIntent(
    userId: string,
    dto: CreatePaymentDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Thiếu x-idempotency-key');
    }
    const order = await this.prisma.db.order.findUnique({
      where: {
        id: dto.orderId,
        userId,
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    switch (dto.method) {
      case PaymentMethod.COD:
        return this.processCODPayment(userId, order, dto.method);

      case PaymentMethod.STRIPE:
        return this.processStripePayment(order, dto.method, idempotencyKey);

      default:
        throw new BadRequestException('Phương thức thanh toán không hỗ trợ');
    }
  }

  async handleStripeWebhook(signature: string, payload: Buffer) {
    const event = this.verifyWebhookSignature(signature, payload);

    const data = event.data?.object as StripeEventData;

    const paymentId = data?.metadata?.paymentId;

    if (!paymentId) {
      this.logger.warn(
        'Bỏ qua Webhook: Không tìm thấy paymentId trong metadata',
      );
      return { received: true };
    }

    if (event.type === 'payment_intent.succeeded') {
      await this.handlePaymentSucceeded(paymentId, data);
    } else if (event.type === 'payment_intent.payment_failed') {
      await this.handlePaymentFailed(paymentId);
    }

    return {
      received: true,
    };
  }

  private async processCODPayment(
    userId: string,
    order: Order,
    method: PaymentMethod,
  ) {
    StateTransition.validateTransition(
      order.status,
      OrderStatus.AWAITING_DELIVERY,
    );

    const payment = await this.prisma.db.$transaction(async (tx) => {
      const newPayment = await this.upsertPaymentRecord(
        order.id,
        order.totalAmount,
        method,
        tx,
      );

      await tx.order.update({
        where: {
          id: order.id,
        },

        data: {
          status: OrderStatus.AWAITING_DELIVERY,
        },
      });

      return newPayment;
    });

    this.emitPaymentEvent(
      'paymentCod.created',
      userId,
      `Đơn hàng mã số ${payment.orderId} đã đặt thành công và đang chờ giao hàng.`,
    );

    return {
      message: 'Đã ghi nhận phương thức COD',
      paymentId: payment.id,
    };
  }

  private async processStripePayment(
    order: Order,
    method: PaymentMethod,
    idempotencyKey: string,
  ) {
    const payment = await this.upsertPaymentRecord(
      order.id,
      order.totalAmount,
      method,
    );

    const amountNum = Number(order.totalAmount);

    try {
      const result = await this.paymentProvider.createPaymentIntent(
        amountNum,
        order.id,
        {
          paymentId: payment.id,
        },
        idempotencyKey,
      );

      return {
        message: 'Tạo phiên thanh toán Stripe thành công',

        clientSecret: result.clientSecret,
      };
    } catch (error) {
      this.logger.error(
        `Lỗi khi gọi Stripe API: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new BadRequestException(
        'Không thể khởi tạo cổng thanh toán lúc này',
      );
    }
  }

  private async handlePaymentSucceeded(
    paymentId: string,
    paymentIntent: StripeEventData,
  ) {
    try {
      const payment = await this.prisma.db.payment.findUnique({
        where: {
          id: paymentId,
        },

        include: {
          order: true,
        },
      });

      if (!payment) {
        this.logger.error(`Không tìm thấy payment: ${paymentId}`);

        return;
      }

      if (payment.status === PaymentStatus.SUCCESS) {
        this.logger.log(`Payment ${paymentId} đã SUCCESS. Bỏ qua webhook.`);
        return;
      }

      this.validatePaymentIntegrity(payment, paymentIntent);

      StateTransition.validateTransition(
        payment.order.status,
        OrderStatus.PAID,
      );

      const isUpdated = await this.executeSuccessPaymentTransaction(
        paymentId,
        payment.orderId,
        paymentIntent.id,
      );

      if (!isUpdated) {
        return;
      }

      this.emitPaymentEvent(
        'paymentStripe.created',
        payment.order.userId,
        `Đơn hàng đã được thanh toán thành công qua Stripe!`,
      );
    } catch (error) {
      this.logger.error(
        `Lỗi DB khi xử lý webhook thành công: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new Error('Database Error, request Stripe to retry');
    }
  }

  private async handlePaymentFailed(paymentId: string) {
    this.logger.warn(`Thanh toán thất bại cho Payment ID: ${paymentId}`);

    const result = await this.prisma.db.payment.updateMany({
      where: {
        id: paymentId,

        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.FAILED,
      },
    });

    if (result.count === 0) {
      this.logger.log(
        `Payment ${paymentId} không ở trạng thái PENDING. Không cập nhật FAILED.`,
      );
    }
  }

  private verifyWebhookSignature(signature: string, payload: Buffer) {
    try {
      return this.paymentProvider.verifyWebhookEvent(payload, signature);
    } catch (error) {
      this.logger.error(
        `Webhook signature verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Webhook Error');
    }
  }

  private validatePaymentIntegrity(
    dbPayment: Payment & { order: Order },
    stripeIntent: StripeEventData,
  ) {
    const paymentAmount = Number(dbPayment.amount.toString());
    const stripeAmount = stripeIntent.amount;
    const currency = stripeIntent.currency.toLowerCase();

    if (paymentAmount !== stripeAmount || currency !== 'vnd') {
      this.logger.error(
        `Lỗi logic tiền tệ: DB ${paymentAmount}, Stripe ${stripeAmount}, currency ${currency}`,
      );

      throw new Error('Data integrity mismatch');
    }
  }

  private upsertPaymentRecord(
    orderId: string,
    amount: number,
    method: PaymentMethod,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma.db;

    return db.payment.upsert({
      where: {
        orderId,
      },
      update: {
        method,
        status: PaymentStatus.PENDING,
      },
      create: {
        orderId,
        amount,
        method,
        status: PaymentStatus.PENDING,
      },
    });
  }

  private executeSuccessPaymentTransaction(
    paymentId: string,
    orderId: string,
    transactionId: string,
  ) {
    return this.prisma.db.$transaction(async (tx) => {
      const updatePaymentResult = await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.SUCCESS,
          transactionId,
        },
      });

      if (updatePaymentResult.count === 0) {
        return false;
      }

      await tx.order.update({
        where: {
          id: orderId,
        },

        data: {
          status: OrderStatus.PAID,
        },
      });

      return true;
    });
  }

  private emitPaymentEvent(eventName: string, userId: string, content: string) {
    this.eventEmitter.emit(eventName, {
      userId,
      content,
    });
  }
}
