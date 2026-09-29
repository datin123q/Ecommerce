import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { useContainer } from 'class-validator';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/tranform.interceptor';

import {
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
} from '@prisma/client';

import {
  PAYMENT_PROVIDER,
  IPaymentProvider,
} from './../src/modules/payments/adapters/payment-provider.interface';

describe('Hành trình Thanh toán Webhook - Payment Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let testUserId: string;
  let testOrderId: string;
  let testPaymentId: string;

  const testPaymentAmount = 200000;
  const mockStripeProvider: jest.Mocked<IPaymentProvider> = {
    createPaymentIntent: jest.fn(),
    verifyWebhookEvent: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PAYMENT_PROVIDER)
        .useValue(mockStripeProvider)
        .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');

    app.useGlobalInterceptors(
      new TransformInterceptor(),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    useContainer(
      app.select(AppModule),
      {
        fallbackOnErrors: true,
      },
    );

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    const user = await prisma.db.user.create({
      data: {
        email: 'webhook-user@example.com',
        password: 'hashed-password',
        fullName: 'Webhook E2E Tester',
      },
    });

    testUserId = user.id;

    const order = await prisma.db.order.create({
      data: {
        userId: testUserId,
        status: OrderStatus.PENDING,
        totalAmount: testPaymentAmount,
      },
    });

    testOrderId = order.id;

    const payment = await prisma.db.payment.create({
      data: {
        orderId: testOrderId,
        amount: testPaymentAmount,
        method: PaymentMethod.STRIPE,
        status: PaymentStatus.PENDING,
      },
    });

    testPaymentId = payment.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it(
    'Bước 1: API Webhook nhận tín hiệu Thành Công từ Stripe',
    async () => {
      mockStripeProvider.verifyWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',

        data: {
          object: {
            id: 'txn_stripe_success_123',
            amount: testPaymentAmount,
            currency: 'vnd',
            metadata: {
              paymentId: testPaymentId,
            },
          },
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook')
        .set('stripe-signature', 'fake-signature')
        .send({
          fake_payload: true,
        });

      console.log(
        '\n========== WEBHOOK RESPONSE ==========\n',
        JSON.stringify(response.body, null, 2),
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.received).toBe(true);
    },
  );

  it(
    'Bước 2.1: Trạng thái Order phải được tự động chuyển thành PAID',
    async () => {
      const order = await prisma.db.order.findUnique({
        where: {
          id: testOrderId,
        },
      });

      console.log(
        '\n========== ORDER AFTER WEBHOOK ==========\n',
        order,
      );

      expect(order).not.toBeNull();

      expect(order?.status).toBe(
        OrderStatus.PAID,
      );
    },
  );

  it(
    'Bước 2.2: Trạng thái Payment phải chuyển thành SUCCESS và lưu transactionId',
    async () => {
      const payment = await prisma.db.payment.findUnique({
        where: {
          id: testPaymentId,
        },
      });

      console.log(
        '\n========== PAYMENT AFTER WEBHOOK ==========\n',
        payment,
      );

      expect(payment).not.toBeNull();

      expect(payment?.status).toBe(
        PaymentStatus.SUCCESS,
      );

      expect(payment?.transactionId).toBe(
        'txn_stripe_success_123',
      );
    },
  );
});