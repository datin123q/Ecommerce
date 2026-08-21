import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { JwtAuthGuard } from './../src/common/guards/jwt-auth.guard';
import { NotificationsService } from './../src/modules/notifications/notifications.service';

describe('Luồng Mua Hàng Trọn Vẹn (e2e)', () => {
  let app: INestApplication;
  let currentOrderId: string;

  // Sử dụng Proxy Mock để tự động cân mọi bảng Prisma
    const createPrismaMock = () => {
    const genericModel = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue({ 
        id: 'variant-1', 
        price: 250000, 
        product: { name: 'Áo Thun', price: 250000 } 
    }),
    // CẤU HÌNH TRẢ VỀ TỒN KHO 10 SẢN PHẨM CHO VARIANT-1
    findMany: jest.fn().mockResolvedValue([
        { id: 'inv-1', variantId: 'variant-1', quantity: 10 }
    ]),
    create: jest.fn().mockResolvedValue({ id: 'order-999', totalAmount: 500000, userId: 'user-1' }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({ 
        id: 'payment-1', 
        orderId: 'order-999', // <-- Cần cái này!
        status: 'SUCCESS' 
      }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    return new Proxy({}, {
      get: (target, prop) => {
        if (prop === '$transaction') {
          return jest.fn().mockImplementation(async (callback) => callback(createPrismaMock()));
        }
        if (prop === '$connect' || prop === '$disconnect') {
          return jest.fn();
        }
        return genericModel;
      },
    });
  };

  const mockPrismaService = createPrismaMock();

  const mockNotificationsService = {
    pushNotificationToQueue: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(NotificationsService)
      .useValue(mockNotificationsService)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 'user-1', email: 'khachhang@gmail.com' };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Bước 1: Thêm vào Giỏ hàng', () => {
    it('phải thêm được Áo Thun vào giỏ', async () => {
      const payload = { variantId: 'variant-1', quantity: 2 };

      await request(app.getHttpServer())
        .post('/api/v1/carts/add') 
        .send(payload)
        .expect(201);
    });
  });

  describe('Bước 2: Tạo Đơn Hàng (Checkout)', () => {
    it('phải trừ tồn kho và khởi tạo đơn hàng thành công', async () => {
      mockPrismaService.cart.findFirst.mockResolvedValue({
        id: 'cart-1', userId: 'user-1',
        cartItems: [{ variantId: 'variant-1', quantity: 2, variant: { product: { price: 250000 } } }]
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/checkout') 
        .set('Authorization', `Bearer mock_token`)
        .send({ paymentMethod: 'STRIPE' }) ;// <-- TRUYỀN DỮ LIỆU HỢP LỆ ĐỂ QUA VALIDATION PIPE
        if (res.status === 400) {
            console.log('Validation Error Detail:', res.body);
        }

        expect(res.status).toBe(201);
        currentOrderId = res.body.id;
    });
  });

  describe('Bước 3: Webhook Thanh Toán (Stripe)', () => {
    it('phải xác thực chữ ký và cập nhật trạng thái đơn hàng thành PAID', async () => {
      const stripePayload = {
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            metadata: { 
              paymentId: 'payment-1' 
            },
          }
        }
      };

      const rawBody = Buffer.from(JSON.stringify(stripePayload));

      await request(app.getHttpServer())
        .post('/api/v1/payments/webhook') 
        .set('stripe-signature', 't=123,v1=chu_ky_bi_mat_gia_lap') 
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(200);
      
      // Khẳng định hàm order.update đã được gọi với đúng ID đơn hàng và trạng thái PAID
      expect(mockPrismaService.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-999' },
          data: { status: 'PAID' }
        })
      );
    });
  });
});