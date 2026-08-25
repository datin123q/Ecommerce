import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PaymentStatus, PaymentMethod, OrderStatus } from '@prisma/client';
import Stripe from 'stripe';

// Mock thư viện Stripe
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
  let configService: ConfigService;
  let eventEmitter: EventEmitter2;
  let stripeMock: any;

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
    // Tạo bản Mock cho các Service dependencies
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
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
            // Giả lập $transaction bằng cách gọi callback ngay lập tức
            $transaction: jest.fn().mockImplementation(async (cb) => {
              return cb({
                order: { update: jest.fn() },
                payment: { findUnique: jest.fn(), update: jest.fn() },
              });
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
              if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_123';
              return null;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    
    // Lấy instance của Stripe mock
    stripeMock = (service as any).stripe;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should throw Error if STRIPE_SECRET_KEY is missing', () => {
      jest.spyOn(configService, 'get').mockReturnValueOnce(null);
      
      expect(() => {
        new PaymentsService(prisma, configService, eventEmitter);
      }).toThrow('THIẾU BIẾN MÔI TRƯỜNG: STRIPE_SECRET_KEY chưa được cấu hình!');
    });
  });

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

    it('should process STRIPE payment successfully', async () => {
      const mockClientSecret = 'pi_123_secret_456';
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);
      jest.spyOn(prisma.payment, 'upsert').mockResolvedValue({ ...mockPayment, method: 'STRIPE' } as any);
      
      stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: mockClientSecret });

      const result = await service.createPaymentIntent(mockUserId, { orderId: mockOrderId, method: 'STRIPE' as PaymentMethod });

      expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({
        amount: mockOrder.totalAmount,
        currency: 'vnd',
      }));
      expect(result).toEqual({
        message: 'Tạo phiên thanh toán Stripe thành công',
        clientSecret: mockClientSecret,
      });
    });

    it('should throw BadRequestException for unsupported payment method', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);
      jest.spyOn(prisma.payment, 'upsert').mockResolvedValue(mockPayment as any);

      await expect(
        service.createPaymentIntent(mockUserId, { orderId: mockOrderId, method: 'UNKNOWN' as any })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleStripeWebhook', () => {
    const mockSignature = 'test_signature';
    const mockPayload = Buffer.from('test_payload');

    it('should throw Error if STRIPE_WEBHOOK_SECRET is missing', async () => {
      jest.spyOn(configService, 'get').mockReturnValueOnce(null);

      await expect(
        service.handleStripeWebhook(mockSignature, mockPayload)
      ).rejects.toThrow('Thiếu STRIPE_WEBHOOK_SECRET');
    });

    it('should throw BadRequestException if webhook signature verification fails', async () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        service.handleStripeWebhook(mockSignature, mockPayload)
      ).rejects.toThrow(BadRequestException);
    });

    it('should return received: true and do nothing if no paymentId in metadata', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
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
      
      stripeMock.webhooks.constructEvent.mockReturnValue(stripeEvent);

      // Cần chỉnh sửa mock của transaction đặc biệt cho case này vì logic nằm trong transaction callback
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

    it('should throw Error in transaction if amount or currency mismatches in succeeded event', async () => {
      const stripeEvent = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            amount: 50000, // Khác với 100000 ở DB
            currency: 'usd', // Khác VND
            metadata: { paymentId: mockPaymentId },
          },
        },
      };
      stripeMock.webhooks.constructEvent.mockReturnValue(stripeEvent);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const mockPrismaTransactionClient = {
          payment: {
            findUnique: jest.fn().mockResolvedValue(mockPayment),
          },
        };
        return cb(mockPrismaTransactionClient as any);
      });

      await expect(
        service.handleStripeWebhook(mockSignature, mockPayload)
      ).rejects.toThrow('Só lượng hoặc đơn vị tiền tệ không khớp!!!');
    });

    it('should update payment status to FAILED on payment_intent.payment_failed', async () => {
      const stripeEvent = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            metadata: { paymentId: mockPaymentId },
          },
        },
      };
      stripeMock.webhooks.constructEvent.mockReturnValue(stripeEvent);

      await service.handleStripeWebhook(mockSignature, mockPayload);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        data: { status: 'FAILED' },
      });
    });
  });
});