import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PaymentStatus, PaymentMethod, OrderStatus } from '@prisma/client';
import { PAYMENT_PROVIDER } from './adapters/payment-provider.interface';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;
  
  // 1. CHUẨN BỊ BẢN GIẢ MẠO CHO ADAPTER
  let mockPaymentProvider: any;

  // Dữ liệu giả định (Mock Data)
  const mockUserId = 'user-123';
  const mockOrderId = 'order-123';
  const mockPaymentId = 'payment-123';

  const mockOrder = {
    id: mockOrderId,
    userId: mockUserId,
    totalAmount: 100000,
    status: OrderStatus.PENDING,
  };

  const mockPayment = {
    id: mockPaymentId,
    orderId: mockOrderId,
    amount: 100000,
    method: PaymentMethod.COD,
    status: PaymentStatus.PENDING,
    order: mockOrder,
  };

  beforeEach(async () => {
    // Định nghĩa hành vi của bản giả mạo
    mockPaymentProvider = {
      createPaymentIntent: jest.fn(),
      verifyWebhookEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PAYMENT_PROVIDER,
          useValue: mockPaymentProvider, 
        },
        {
          provide: PrismaService,
          useValue: {
            order: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            payment: {
              upsert: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (cb) => {
              return cb({
                order: { update: jest.fn() },
                payment: { findUnique: jest.fn(), update: jest.fn() },
              });
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // KHÔNG CÒN TEST CONFIG Ở ĐÂY NỮA VÌ NÓ THUỘC VỀ STRIPE ADAPTER

  describe('createPaymentIntent', () => {
    it('should throw NotFoundException if order is not found', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);

      await expect(
        service.createPaymentIntent(mockUserId, { orderId: mockOrderId, method: PaymentMethod.COD })
      ).rejects.toThrow(NotFoundException);
    });

    it('should process COD payment successfully', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);
      jest.spyOn(prisma.payment, 'upsert').mockResolvedValue(mockPayment as any);
      const transactionSpy = jest.spyOn(prisma, '$transaction');

      const result = await service.createPaymentIntent(mockUserId, { orderId: mockOrderId, method: PaymentMethod.COD });

      expect(prisma.payment.upsert).toHaveBeenCalled();
      expect(transactionSpy).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('paymentCod.created', expect.any(Object));
      expect(result).toEqual({ message: 'Đã ghi nhận phương thức COD', paymentId: mockPaymentId });
    });

    it('should process STRIPE payment successfully by calling adapter', async () => {
      const mockClientSecret = 'pi_123_secret_456';
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);
      jest.spyOn(prisma.payment, 'upsert').mockResolvedValue({ ...mockPayment, method: 'STRIPE' } as any);
      
      mockPaymentProvider.createPaymentIntent.mockResolvedValue({ clientSecret: mockClientSecret });

      const result = await service.createPaymentIntent(mockUserId, { orderId: mockOrderId, method: 'STRIPE' as PaymentMethod });

      expect(mockPaymentProvider.createPaymentIntent).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Tạo phiên thanh toán Stripe thành công',
        clientSecret: mockClientSecret,
      });
    });
  });

  describe('handleStripeWebhook', () => {
    const mockSignature = 'test_signature';
    const mockPayload = Buffer.from('test_payload');

    it('should throw Error if webhook signature verification fails in Adapter', async () => {
      mockPaymentProvider.verifyWebhookEvent.mockImplementation(() => {
        throw new BadRequestException('Webhook Error: Invalid signature');
      });

      await expect(
        service.handleStripeWebhook(mockSignature, mockPayload)
      ).rejects.toThrow(BadRequestException);
    });

    it('should return received: true and do nothing if no paymentId in metadata', async () => {
      mockPaymentProvider.verifyWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { metadata: {} } }, 
      });

      const result = await service.handleStripeWebhook(mockSignature, mockPayload);
      expect(result).toEqual({ received: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should handle payment_intent.succeeded successfully', async () => {
      const stripeEvent = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 100000,
            currency: 'vnd',
            metadata: { paymentId: mockPaymentId },
          },
        },
      };
      
      mockPaymentProvider.verifyWebhookEvent.mockReturnValue(stripeEvent);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const mockPrismaTransactionClient = {
          payment: {
            findUnique: jest.fn().mockResolvedValue(mockPayment),
            update: jest.fn().mockResolvedValue(mockPayment),
          },
          order: {
            update: jest.fn().mockResolvedValue(mockOrder),
          },
        };
        return cb(mockPrismaTransactionClient as any);
      });

      const result = await service.handleStripeWebhook(mockSignature, mockPayload);

      expect(result).toEqual({ received: true });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('paymentStripe.created', expect.any(Object));
    });
  });
});