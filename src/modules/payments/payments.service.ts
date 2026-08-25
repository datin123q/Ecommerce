import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus, PaymentMethod, OrderStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import Stripe from 'stripe';
import { tryCatch } from 'bullmq';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    // 1. Lấy Key an toàn từ ConfigService
    const stripeSecret = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('THIẾU BIẾN MÔI TRƯỜNG: STRIPE_SECRET_KEY chưa được cấu hình!');
    }

    // 2. Khởi tạo Stripe
    this.stripe = new Stripe(stripeSecret, {
      apiVersion: '2026-07-29.dahlia', 
    });
  }

  // ==========================================================
  // TẠO PHIÊN THANH TOÁN
  // ==========================================================
  async createPaymentIntent(userId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId, userId: userId },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    const payment = await this.prisma.payment.upsert({
      where: { orderId: order.id },
      update: { method: dto.method, status: PaymentStatus.PENDING },
      create: {
        orderId: order.id,
        amount: order.totalAmount,
        method: dto.method,
        status: PaymentStatus.PENDING,
      },
      include: { order: true }
    });

    //  COD
    if (dto.method === PaymentMethod.COD) {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.order.update({ 
          where: { id: payment.orderId },
          data: { status: OrderStatus.AWAITING_DELIVERY },
        });

        await this.notificationsService.pushNotificationToQueue(
          userId, 
          `Đơn hàng mã số ${payment.orderId} đã đặt thành công và đang chờ giao hàng.`
        );
      });
      return { message: 'Đã ghi nhận phương thức COD', paymentId: payment.id };
    }

    //  STRIPE
    if (dto.method === 'STRIPE' as PaymentMethod) { 
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: order.totalAmount, 
        currency: 'vnd',
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never', // Cấm các phương thức yêu cầu chuyển hướng
        },
        metadata: {
          orderId: order.id,
          paymentId: payment.id,
        },
      });

      return {
        message: 'Tạo phiên thanh toán Stripe thành công',
        clientSecret: paymentIntent.client_secret,
      };
    }

    throw new BadRequestException('Phương thức thanh toán không hỗ trợ');
  }

  // XỬ LÝ WEBHOOK TỪ STRIPE
async handleStripeWebhook(signature: string, payload: Buffer) {
    let event: Stripe.Event; 
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('Thiếu STRIPE_WEBHOOK_SECRET');
    }

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error(`⚠️ Xác thực Webhook thất bại: ${err.message}`);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    const data = event?.data?.object as any;
    const paymentId = data?.metadata?.paymentId;

    if (!paymentId) {
      this.logger.warn('Bỏ qua Webhook: Không tìm thấy paymentId trong metadata');
      return { received: true };
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as any;
        const stripeEventId = event.id;
        let isPaymentJustCompleted = false;
        let targetUserId: string | null = null;
        await this.prisma.$transaction(async (prisma) => {
          const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { order: true }
          })
          if(!payment){
            this.logger.error(`Không tìm thấy ${paymentId}`);
            return;
          }
          if(payment.status !== 'PENDING'){
            this.logger.error(`Payment ${payment.id} đã ở trạng thái ${payment.status}`);
            return;
          }
          if(payment.amount !== paymentIntent.amount || paymentIntent.currency.toLowerCase() !== 'vnd'){
            this.logger.error(`Só lượng hoặc đơn vị tiền tệ không khớp!!!`);
            throw new Error('Só lượng hoặc đơn vị tiền tệ không khớp!!!');
          }
          await prisma.payment.update({
            where: { id: paymentId },
            data: {
              status: 'SUCCESS', 
              transactionId: data.id,
            },
            include: { order: true }
          });

          await prisma.order.update({ 
            where: { id: payment.orderId },
            data: { status: 'PAID' } 
          });
          isPaymentJustCompleted = true;
          targetUserId = payment.order.userId;
        });
        if(isPaymentJustCompleted && targetUserId){
          try {
            await this.notificationsService.pushNotificationToQueue(
              targetUserId, 
              `Đơn hàng đã được thanh toán thành công qua Stripe!`
            );
          } catch (queueError){
            this.logger.error(`Bỏ lỡ thông báo!! `);
          }
        }
        break;

      case 'payment_intent.payment_failed':
        this.logger.warn(`❌ Thanh toán thất bại cho Payment ID: ${paymentId}`);
        await this.prisma.payment.update({
          where: { id: paymentId },
          data: { status: 'FAILED' },
        });
        break;
    }

    return { received: true };
  }
}