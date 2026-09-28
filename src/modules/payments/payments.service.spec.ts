import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';
import { PAYMENT_PROVIDER } from './adapters/payment-provider.interface';
import { StateTransition } from '../orders/domain/state-transition';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;
  let paymentProvider: any;

  const mockPrismaService = {
    db: {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrismaService.db);
      }),
    },
  };

  const mockEventEmitter = { emit: jest.fn() };

  const mockPaymentProvider = {
    createPaymentIntent: jest.fn(),
    verifyWebhookEvent: jest.fn(),
  };

  const userId = 'user-1';
  const orderId = 'order-1';
  const mockOrder = { id: orderId, userId, totalAmount: 500000, status: OrderStatus.PENDING };
  const mockPayment = { id: 'payment-1', orderId, amount: 500000, status: PaymentStatus.PENDING };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PAYMENT_PROVIDER, useValue: mockPaymentProvider },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    paymentProvider = module.get(PAYMENT_PROVIDER);

    jest.clearAllMocks();

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    jest.spyOn(StateTransition, 'validateTransition').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // TEST SUITE: createPaymentIntent
  describe('createPaymentIntent', () => {
    it('Nên ném NotFoundException nếu đơn hàng không tồn tại', async () => {
      mockPrismaService.db.order.findUnique.mockResolvedValue(null);
      await expect(service.createPaymentIntent(userId, { orderId, method: PaymentMethod.COD }))
        .rejects.toThrow(NotFoundException);
    });

    it('Nên ném BadRequestException nếu truyền method không được hỗ trợ', async () => {
      mockPrismaService.db.order.findUnique.mockResolvedValue(mockOrder);
      await expect(service.createPaymentIntent(userId, { orderId, method: 'UNKNOWN' as any }))
        .rejects.toThrow(BadRequestException);
    });

    describe('Phương thức COD', () => {
      it('Nên tạo phiên thanh toán COD, cập nhật order và bắn sự kiện', async () => {
        mockPrismaService.db.order.findUnique.mockResolvedValue(mockOrder);
        mockPrismaService.db.payment.upsert.mockResolvedValue(mockPayment);

        const result = await service.createPaymentIntent(userId, { orderId, method: PaymentMethod.COD });

        expect(result).toEqual({ message: 'Đã ghi nhận phương thức COD', paymentId: mockPayment.id });
        expect(StateTransition.validateTransition).toHaveBeenCalledWith(OrderStatus.PENDING, OrderStatus.AWAITING_DELIVERY);
        expect(prisma.db.payment.upsert).toHaveBeenCalled();
        expect(prisma.db.order.update).toHaveBeenCalledWith({
          where: { id: orderId },
          data: { status: OrderStatus.AWAITING_DELIVERY },
        });
        expect(eventEmitter.emit).toHaveBeenCalledWith('paymentCod.created', expect.any(Object));
      });
    });

    describe('Phương thức STRIPE', () => {
      it('Nên ném lỗi nếu API Stripe gặp sự cố', async () => {
        mockPrismaService.db.order.findUnique.mockResolvedValue(mockOrder);
        mockPrismaService.db.payment.upsert.mockResolvedValue(mockPayment);
        mockPaymentProvider.createPaymentIntent.mockRejectedValue(new Error('Stripe Down'));

        await expect(service.createPaymentIntent(userId, { orderId, method: PaymentMethod.STRIPE }))
          .rejects.toThrow(BadRequestException);
      });

      it('Nên tạo phiên Stripe thành công và trả về clientSecret', async () => {
        mockPrismaService.db.order.findUnique.mockResolvedValue(mockOrder);
        mockPrismaService.db.payment.upsert.mockResolvedValue(mockPayment);
        mockPaymentProvider.createPaymentIntent.mockResolvedValue({ clientSecret: 'secret_abc123' });

        const result = await service.createPaymentIntent(userId, { orderId, method: PaymentMethod.STRIPE });

        expect(result).toEqual({ message: 'Tạo phiên thanh toán Stripe thành công', clientSecret: 'secret_abc123' });
        expect(paymentProvider.createPaymentIntent).toHaveBeenCalledWith(
          500000, 
          orderId, 
          { paymentId: mockPayment.id }
        );
      });
    });
  });

  // TEST SUITE: handleStripeWebhook
  describe('handleStripeWebhook', () => {
    const signature = 'stripe-signature';
    const payload = Buffer.from('payload');

    it('Nên ném BadRequestException nếu chữ ký Webhook không hợp lệ', async () => {
      mockPaymentProvider.verifyWebhookEvent.mockImplementation(() => { throw new Error('Invalid signature'); });

      await expect(service.handleStripeWebhook(signature, payload)).rejects.toThrow(BadRequestException);
    });

    it('Nên trả về {received: true} và bỏ qua nếu không có paymentId trong metadata', async () => {
      mockPaymentProvider.verifyWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { metadata: {} } }, // Thiếu paymentId
      });

      const result = await service.handleStripeWebhook(signature, payload);
      expect(result).toEqual({ received: true });
    });

    describe('Sự kiện payment_intent.payment_failed', () => {
      it('Nên cập nhật trạng thái payment thành FAILED', async () => {
        mockPaymentProvider.verifyWebhookEvent.mockReturnValue({
          type: 'payment_intent.payment_failed',
          data: { object: { metadata: { paymentId: 'payment-1' } } },
        });

        const result = await service.handleStripeWebhook(signature, payload);

        expect(result).toEqual({ received: true });
        expect(prisma.db.payment.update).toHaveBeenCalledWith({
          where: { id: 'payment-1' },
          data: { status: PaymentStatus.FAILED },
        });
      });
    });

    describe('Sự kiện payment_intent.succeeded', () => {
      const successEvent = {
        type: 'payment_intent.succeeded',
        data: {
          object: { 
            id: 'txn_123',
            amount: 500000, 
            currency: 'vnd', 
            metadata: { paymentId: 'payment-1' } 
          }
        },
      };

      it('Nên ném lỗi Error (Stripe Retry) nếu số tiền hoặc tiền tệ không khớp (Logic Data Integrity)', async () => {
        mockPaymentProvider.verifyWebhookEvent.mockReturnValue(successEvent);
        // DB trả về amount bị lệch (400k thay vì 500k)
        mockPrismaService.db.payment.findUnique.mockResolvedValue({ 
          ...mockPayment, 
          amount: 400000,
          order: mockOrder 
        });

        // Hàm handleStripeWebhook sẽ bọc mọi lỗi lại thành "Database Error..."
        await expect(service.handleStripeWebhook(signature, payload))
          .rejects.toThrow('Database Error, request Stripe to retry');
      });

      it('Nên bỏ qua và trả về {received: true} nếu Payment đã ở trạng thái SUCCESS (Idempotency)', async () => {
        mockPaymentProvider.verifyWebhookEvent.mockReturnValue(successEvent);
        mockPrismaService.db.payment.findUnique.mockResolvedValue({ 
          ...mockPayment, 
          status: PaymentStatus.SUCCESS,
          order: mockOrder 
        });

        const result = await service.handleStripeWebhook(signature, payload);
        expect(result).toEqual({ received: true });
        expect(prisma.db.payment.updateMany).not.toHaveBeenCalled();
      });

      it('Nên xử lý thành công: Cập nhật Payment, Order và bắn sự kiện Webhook', async () => {
        mockPaymentProvider.verifyWebhookEvent.mockReturnValue(successEvent);
        mockPrismaService.db.payment.findUnique.mockResolvedValue({ 
          ...mockPayment, 
          order: mockOrder 
        });
        mockPrismaService.db.payment.updateMany.mockResolvedValue({ count: 1 }); // Cập nhật thành công 1 record

        const result = await service.handleStripeWebhook(signature, payload);

        expect(result).toEqual({ received: true });
        
        // Check Transaction Payment Update
        expect(prisma.db.payment.updateMany).toHaveBeenCalledWith({
          where: { id: 'payment-1', status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.SUCCESS, transactionId: 'txn_123' },
        });

        // Check Transaction Order Update
        expect(prisma.db.order.update).toHaveBeenCalledWith({
          where: { id: orderId },
          data: { status: OrderStatus.PAID },
        });

        // Check Event emitted
        expect(eventEmitter.emit).toHaveBeenCalledWith('paymentStripe.created', expect.any(Object));
      });
    });
  });
});