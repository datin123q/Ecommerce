import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('Main E2E Flow - Đăng ký đến Thanh toán COD', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Biến lưu trữ xuyên suốt các bước
  let accessToken: string;
  let variantId: string;
  let warehouseId: string;
  const voucherCode = 'DISCOUNT50K';
  let orderId: string;

  const testUser = {
    email: 'flow_tester@example.com',
    password: 'Password123!',
    fullName: 'Flow Tester',
  };

  // Mock BullMQ Queue để không cần Redis khi chạy test
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getQueueToken('notification-queue'))
      .useValue(mockQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    
    // Đồng bộ Global Prefix và ValidationPipe y hệt file main.ts của bạn
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = app.get<PrismaService>(PrismaService);

    // =========================================================
    // DỌN DẸP & SEED DỮ LIỆU MẪU (Thứ tự ngược để tránh lỗi khóa ngoại)
    // =========================================================
    await prisma.voucherUsage.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.inventoryTransaction.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.voucher.deleteMany();
    await prisma.user.deleteMany({ where: { email: testUser.email } });

    // 1. Tạo Category & Product + Variant
    const category = await prisma.category.create({ data: { name: 'Điện Thoại E2E' } });
    const product = await prisma.product.create({
      data: {
        name: 'iPhone E2E Test',
        description: 'Test phone',
        price: 1000000, // 1,000,000 VND
        categoryId: category.id,
        variants: {
          create: [{ sku: 'IPHONE-E2E-01', name: 'iPhone 15', variant: '128GB' }],
        },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;

    // 2. Tạo Kho & Tồn kho (Nhập sẵn 10 cái)
    const warehouse = await prisma.warehouse.create({ data: { name: 'Kho E2E' } });
    warehouseId = warehouse.id;
    await prisma.inventory.create({
      data: { warehouseId, variantId, quantity: 10 },
    });

    // 3. Tạo Voucher giảm giá (Giảm 100,000 VND)
    await prisma.voucher.create({
      data: {
        code: voucherCode,
        value: 100000,
        limit: 10,
        count: 0,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================
  // BƯỚC 1: XÁC THỰC (ĐĂNG KÝ & ĐĂNG NHẬP)
  // ==========================================================
  it('1. Đăng ký tài khoản mới', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(testUser.email);
  });

  it('2. Đăng nhập lấy AccessToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    accessToken = res.body.accessToken;
  });

  // ==========================================================
  // BƯỚC 2: QUẢN LÝ GIỎ HÀNG
  // ==========================================================
  it('3. Thêm sản phẩm vào giỏ hàng', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/carts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ variantId, quantity: 2 }) // Mua 2 chiếc
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.quantity).toBe(2);
  });

  // ==========================================================
  // BƯỚC 3: ĐẶT HÀNG KÈM VOUCHER & KIỂM TRA TỒN KHO
  // ==========================================================
  it('4. Tiến hành đặt hàng (Áp dụng Voucher)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ voucherCode })
      .expect(201);

    orderId = res.body.id;
    expect(orderId).toBeDefined();

    // Tính toán tiền: (1,000,000 * 2 sản phẩm) - 100,000 voucher = 1,900,000 VND
    expect(res.body.totalAmount).toBe(1900000);

    // --- KIỂM TRA CHÉO DB DƯỚI NỀN ---
    // Tồn kho phải bị trừ 2 (Từ 10 xuống 8)
    const inventory = await prisma.inventory.findUnique({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(inventory?.quantity).toBe(8);

    // Giỏ hàng phải được dọn sạch hoàn toàn
    const cartItems = await prisma.cartItem.findMany({ where: { variantId } });
    expect(cartItems.length).toBe(0);

    // Lượt sử dụng Voucher phải tăng lên 1
    const voucher = await prisma.voucher.findUnique({ where: { code: voucherCode } });
    expect(voucher?.count).toBe(1);
  });

  // ==========================================================
  // BƯỚC 4: THANH TOÁN (COD)
  // ==========================================================
  it('5. Chọn phương thức thanh toán COD cho đơn hàng', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: orderId,
        method: 'COD',
      })
      .expect(201);

    expect(res.body.message).toBe('Đã ghi nhận phương thức COD');

    // Trạng thái Đơn hàng phải chuyển sang chờ giao hàng (`AWAITING_DELIVERY`)
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder?.status).toBe('AWAITING_DELIVERY');
  });
});