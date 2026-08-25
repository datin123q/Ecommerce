import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentStatus, PaymentMethod, OrderStatus } from '@prisma/client';
import Stripe from 'stripe';

// 1. MOCK THƯ VIỆN STRIPE
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let config: ConfigService;
  let notifications: NotificationsService;
  let stripeMock: any;

  // 1. TẠO MOCK CONFIG LÀ MỘT HÀM JS BÌNH THƯỜNG (KHÔNG DÙNG JEST.FN)
  // Việc này đảm bảo hàm get() luôn trả về đúng giá trị khi compile() chạy
    const mockConfigService = {
    get: jest.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
        if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_123';
        return null;
    }),
    };

  // 2. MOCK PRISMA VÀ NOTIFICATION
  const mockPrismaService = {
    order: { findUnique: jest.fn(), update: jest.fn() },
    payment: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn().mockImplementation(async (cb) => await cb(mockPrismaService)),
  };

  const mockNotificationsService = {
    pushNotificationToQueue: jest.fn(),
  };

 beforeEach(async () => {
  // Đặt lại giá trị trả về mặc định trước khi compile/chạy test
  mockConfigService.get.mockImplementation((key: string) => {
    if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
    if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_123';
    return null;
  });

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: PrismaService, useValue: mockPrismaService },
      { provide: ConfigService, useValue: mockConfigService },
      { provide: NotificationsService, useValue: mockNotificationsService },
    ],
  }).compile();

  service = module.get<PaymentsService>(PaymentsService);
  prisma = module.get<PrismaService>(PrismaService);
  config = module.get<ConfigService>(ConfigService);
  notifications = module.get<NotificationsService>(NotificationsService);
  
  stripeMock = (service as any).stripe;
});

  // ==========================================================
  // TEST: createPaymentIntent
  // ==========================================================
  describe('createPaymentIntent', () => {
    const userId = 'user-1';
    const dto = { orderId: 'order-1', method: PaymentMethod.COD };
    
    it('nên throw NotFoundException nếu không tìm thấy order', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(null);
      await expect(service.createPaymentIntent(userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('nên xử lý phương thức COD thành công', async () => {
      const mockOrder = { id: 'order-1', totalAmount: 100000 };
      const mockPayment = { id: 'pay-1', orderId: 'order-1' };

      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.payment.upsert.mockResolvedValue(mockPayment);

      const result = await service.createPaymentIntent(userId, dto);

      expect(mockPrismaService.payment.upsert).toHaveBeenCalled();
      expect(mockPrismaService.order.update).toHaveBeenCalledWith({
        where: { id: mockPayment.orderId },
        data: { status: OrderStatus.AWAITING_DELIVERY },
      });
      expect(mockNotificationsService.pushNotificationToQueue).toHaveBeenCalledWith(
        userId,
        expect.stringContaining('đã đặt thành công')
      );
      expect(result).toEqual({ message: 'Đã ghi nhận phương thức COD', paymentId: 'pay-1' });
    });

    it('nên xử lý phương thức STRIPE thành công', async () => {
      const mockOrder = { id: 'order-1', totalAmount: 100000 };
      const mockPayment = { id: 'pay-1' };
      
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.payment.upsert.mockResolvedValue(mockPayment);
      stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: 'secret_123' });

      const result = await service.createPaymentIntent(userId, { ...dto, method: 'STRIPE' as PaymentMethod });

      expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100000,
          currency: 'vnd',
          metadata: { orderId: 'order-1', paymentId: 'pay-1' }
        })
      );
      expect(result).toEqual({ message: 'Tạo phiên thanh toán Stripe thành công', clientSecret: 'secret_123' });
    });
  });

  // ==========================================================
  // TEST: handleStripeWebhook
  // ==========================================================
  describe('handleStripeWebhook', () => {
    const mockSignature = 'test-signature';
    const mockPayload = Buffer.from('test-payload');

    it('nên throw lỗi nếu thiếu webhook secret', async () => {
      mockConfigService.get.mockReturnValue(null); // Giả lập mất secret
      await expect(service.handleStripeWebhook(mockSignature, mockPayload))
        .rejects.toThrow('Thiếu STRIPE_WEBHOOK_SECRET');
    });

    it('nên throw BadRequestException nếu xác thực Stripe thất bại', async () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      await expect(service.handleStripeWebhook(mockSignature, mockPayload))
        .rejects.toThrow(BadRequestException);
    });

    it('nên bỏ qua và trả về 200 nếu metadata không có paymentId', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { metadata: {} } } // Không có paymentId
      });

      const result = await service.handleStripeWebhook(mockSignature, mockPayload);
      expect(result).toEqual({ received: true });
      expect(mockPrismaService.payment.findUnique).not.toHaveBeenCalled();
    });

    it('nên xử lý payment_intent.succeeded thành công', async () => {
      const paymentId = 'pay-1';
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 50000,
            currency: 'vnd',
            metadata: { paymentId }
          }
        }
      });

      // Giả lập payment đang ở trạng thái PENDING và thông tin khớp nhau
      mockPrismaService.payment.findUnique.mockResolvedValue({
        id: paymentId,
        status: 'PENDING',
        amount: 50000,
        orderId: 'order-1',
        order: { userId: 'user-1' }
      });

      const result = await service.handleStripeWebhook(mockSignature, mockPayload);

      expect(mockPrismaService.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: { status: 'SUCCESS', transactionId: 'pi_123' },
        include: { order: true }
      });
      expect(mockPrismaService.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: 'PAID' }
      });
      expect(mockNotificationsService.pushNotificationToQueue).toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('nên throw lỗi nếu số lượng hoặc tiền tệ không khớp (Chống gian lận)', async () => {
      const paymentId = 'pay-1';
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            amount: 100, // Kẻ gian đổi số tiền thành 100đ
            currency: 'vnd',
            metadata: { paymentId }
          }
        }
      });

      mockPrismaService.payment.findUnique.mockResolvedValue({
        id: paymentId,
        status: 'PENDING',
        amount: 500000, // Giá thật trong DB là 500.000đ
      });

      await expect(service.handleStripeWebhook(mockSignature, mockPayload))
        .rejects.toThrow('Só lượng hoặc đơn vị tiền tệ không khớp!!!');
    });

    it('nên cập nhật trạng thái FAILED khi payment_intent.payment_failed', async () => {
      const paymentId = 'pay-1';
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: {
          object: { metadata: { paymentId } }
        }
      });

      await service.handleStripeWebhook(mockSignature, mockPayload);

      expect(mockPrismaService.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: { status: 'FAILED' }
      });
    });
  });
});