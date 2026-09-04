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

  // TẠO PHIÊN THANH TOÁN
  async createPaymentIntent(userId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId, userId: userId },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (order.status === OrderStatus.PAID || order.status === OrderStatus.AWAITING_DELIVERY) {
      throw new BadRequestException('Đơn hàng này đã được thanh toán hoặc đang được xử lý');
    }
    
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
      const payment = await this.prisma.$transaction(async (prisma) => {
        const newPayment = await prisma.payment.upsert({
          where: { orderId: order.id },
          update: { method: dto.method, status: PaymentStatus.PENDING },
          create: {
            orderId: order.id,
            amount: order.totalAmount,
            method: dto.method,
            status: PaymentStatus.PENDING,
          },
        });
        await prisma.order.update({ 
          where: { id: order.id },
          data: { status: OrderStatus.AWAITING_DELIVERY },
        });
        return newPayment;
      })
      this.eventEmitter.emit('paymentCod.created', {
        userId: userId,
        content: `Đơn hàng mã số ${payment.orderId} đã đặt thành công và đang chờ giao hàng.`
      });
      return { message: 'Đã ghi nhận phương thức COD', paymentId: payment.id };
    }

    //  STRIPE
    if (dto.method === PaymentMethod.STRIPE) { 
      const payment = await this.prisma.payment.upsert({
        where: { orderId: order.id },
        update: { method: dto.method, status: PaymentStatus.PENDING },
        create: {
          orderId: order.id,
          amount: order.totalAmount,
          method: dto.method,
          status: PaymentStatus.PENDING,
        },
      });
      try {
        const amountNum = Math.round(order.totalAmount);
        const result = await this.paymentProvider.createPaymentIntent(
          amountNum, 
          order.id, 
          { paymentId: payment.id }
        );
        return {
          message: 'Tạo phiên thanh toán Stripe thành công',
          clientSecret: result.clientSecret,
        };
      } catch (error) {
        this.logger.error(`Lỗi khi gọi Stripe API: ${error.message}`);
        throw new BadRequestException('Không thể khởi tạo cổng thanh toán lúc này');
      }
    }

    throw new BadRequestException('Phương thức thanh toán không hỗ trợ');
  }

  // XỬ LÝ WEBHOOK TỪ STRIPE
  async handleStripeWebhook(signature: string, payload: Buffer) {
    let event;
    try {
      event = this.paymentProvider.verifyWebhookEvent(payload, signature);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Webhook Error'); 
    }

    const data = event?.data?.object as any;
    const paymentId = data?.metadata?.paymentId;

    if (!paymentId) {
      this.logger.warn('Bỏ qua Webhook: Không tìm thấy paymentId trong metadata');
      return { received: true };
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as any;
        try {
          const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId},
            include: {order:true}
          });

          if(!payment){
            this.logger.error(`Không tìm thấy payment: ${paymentId}`);
            return {received: true};
          }

          if (payment.status === PaymentStatus.SUCCESS) {
            this.logger.log(`Payment ${paymentId} đã xử lý trước đó. Bỏ qua.`);
            return { received: true };
          }

          const paymentAmount = Number(payment.amount.toString());
          if (paymentAmount !== paymentIntent.amount || paymentIntent.currency.toLowerCase() !== 'vnd') {
            this.logger.error(`Lỗi logic tiền tệ: DB ${paymentAmount}, Stripe ${paymentIntent.amount}`);
            return { received: true }; // Lỗi business logic (bị hack sửa tiền), không ném exception
          }

          const isUpdated = await this.prisma.$transaction(async (prisma) => {
            const updatePaymentResult = await prisma.payment.updateMany({
              where: { id: paymentId, status: PaymentStatus.PENDING },
              data: {
                status: PaymentStatus.SUCCESS,
                transactionId: data.id,
              },
            });
            if (updatePaymentResult.count === 0) return false;

            await prisma.order.update({
              where: { id: payment.orderId },
              data: { status: OrderStatus.PAID },
            });

            return true;
          });

          if (isUpdated) {
            this.eventEmitter.emit('paymentStripe.created', {
              userId: payment.order.userId,
              content: `Đơn hàng đã được thanh toán thành công qua Stripe!`,
            });
          }

        } catch (error) {
          this.logger.error(`Lỗi DB khi xử lý webhook thành công: ${error.message}`);
          throw new Error('Database Error, request Stripe to retry');
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        this.logger.warn(`❌ Thanh toán thất bại cho Payment ID: ${paymentId}`);
        
        // Update Payment & Order Status (nếu cần thiết)
        await this.prisma.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.FAILED },
        });
        // Có thể thêm logic emit event thông báo cho user thanh toán thất bại
        break;
      }
    }

    return { received: true };
  }
}