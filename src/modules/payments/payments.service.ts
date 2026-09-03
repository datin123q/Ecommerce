import { Injectable,Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus, PaymentMethod, OrderStatus} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StateTransition } from '../orders/domain/state-transition';
import { PAYMENT_PROVIDER, type IPaymentProvider } from './adapters/payment-provider.interface';
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider;
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ==========================================================
  // TẠO PHIÊN THANH TOÁN
  // ==========================================================
  async createPaymentIntent(userId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId, userId: userId },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    StateTransition.validateTransition(order.status, OrderStatus.PAID || OrderStatus.AWAITING_DELIVERY);

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
        StateTransition.validateTransition(order.status, OrderStatus.AWAITING_DELIVERY);
        await prisma.order.update({ 
          where: { id: payment.orderId },
          data: { status: OrderStatus.AWAITING_DELIVERY },
        });
      });
      this.eventEmitter.emit('paymentCod.created', {
        userId: userId,
        content: `Đơn hàng mã số ${payment.orderId} đã đặt thành công và đang chờ giao hàng.`
      });
      return { message: 'Đã ghi nhận phương thức COD', paymentId: payment.id };
    }

    //  STRIPE
    if (dto.method === 'STRIPE' as PaymentMethod) { 
      const result = await this.paymentProvider.createPaymentIntent(order.totalAmount, order.id, { paymentId: payment.id });
    return {
        message: 'Tạo phiên thanh toán Stripe thành công',
        clientSecret: result.clientSecret,
      };
    }

    throw new BadRequestException('Phương thức thanh toán không hỗ trợ');
  }

  // XỬ LÝ WEBHOOK TỪ STRIPE
  async handleStripeWebhook(signature: string, payload: Buffer) {

    const event = this.paymentProvider.verifyWebhookEvent(payload, signature);
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
          StateTransition.validateTransition(payment.order.status, OrderStatus.PAID);
          await prisma.order.update({ 
            where: { id: payment.orderId },
            data: { status: 'PAID' } 
          });
          isPaymentJustCompleted = true;
          targetUserId = payment.order.userId;
        });
        if(isPaymentJustCompleted && targetUserId){
          try {
            this.eventEmitter.emit('paymentStripe.created', {
              userId: targetUserId,
              content: `Đơn hàng đã được thanh toán thành công qua Stripe!`
            });
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