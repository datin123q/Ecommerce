import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus, PaymentMethod, OrderStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 1. TẠO URL THANH TOÁN
  async createPaymentUrl(userId: string, dto: CreatePaymentDto) {
    // Kiểm tra đơn hàng có phải của user này không
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId, userId: userId },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    // Tạo bản ghi Payment ở trạng thái PENDING
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

    // Nếu là COD, chốt luôn trạng thái đơn là "Chờ giao hàng"
    if (dto.method === PaymentMethod.COD) {
      await this.prisma.order.update({ 
            where: {id: payment.orderId},
            data: {
                status: OrderStatus.DELIVERED
            }
          })
      return { message: 'Đã ghi nhận phương thức COD', paymentId: payment.id };
    }

    if (dto.method === PaymentMethod.VNPAY) {
      const mockVnPayUrl = 
      `http://localhost:3000/api/v1/payments/webhook?paymentId=${payment.id}&status=00&transactionNo=12345`;
      return {
        message: 'Tạo URL thanh toán VNPay thành công',
        paymentUrl: mockVnPayUrl,
      };
    }

    throw new BadRequestException('Phương thức thanh toán không hỗ trợ');
  }

  // 2. XỬ LÝ WEBHOOK 
  async handleWebhook(payload: any) {
    this.logger.log('Nhận được IPN từ cổng thanh toán: ', payload);

    const { paymentId, status, transactionNo } = payload;

    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: {order:true} });
    if (!payment) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    if (status === '00') {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            transactionId: transactionNo,
          },
        });

        // cập nhật trạng thái đơn hàng (Order) 
        await prisma.order.update({ 
            where: {id: payment.orderId},
            data: {
                status: OrderStatus.PAID
            }
          })
          //cập nhật notificatin
        await this.prisma.notification.create({
          data: {
            userId: payment.order.userId,
            content: `Đơn hàng mã số ${payment.orderId} đã được thanh toán thành công`,
            isRead: false
          }
        })
      });

      this.logger.log(`Giao dịch ${paymentId} thanh toán THÀNH CÔNG.`);
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    // Nếu thất bại
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });

    this.logger.log(`Giao dịch ${paymentId} thanh toán THẤT BẠI.`);
    return { RspCode: '00', Message: 'Confirm Success' }; 
  }
}