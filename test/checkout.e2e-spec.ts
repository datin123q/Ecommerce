import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { OrderStatus } from '@prisma/client';
import { useContainer } from 'class-validator';
describe('Hành trình Mua hàng - Checkout Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  
  let accessToken: string;
  let testVariantId: string;
  const testVoucherCode = 'E2E-SALE-50K';
  
  const testUser = {
    email: 'buyer-e2e@example.com',
    password: 'Password123!',
    fullName: 'Khách hàng E2E',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Bật ValidationPipe để DTO hoạt động như môi trường thật
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    useContainer(app.select(AppModule), {
      fallbackOnErrors: true,
    });
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Bơm dữ liệu nền: Danh mục, Sản phẩm, Kho hàng, Mã giảm giá
    const category = await prisma.db.category.create({ data: { name: 'Danh mục E2E' } });
    
    const product = await prisma.db.product.create({
      data: {
        name: 'Sản phẩm E2E Test',
        categoryId: category.id,
        description: 'Dùng cho E2E Testing',
        price: 100000,
        variants: {
          create: [{ sku: 'E2E-VAR-01', name: 'Màu Đỏ', variant: 'Red' }]
        }
      },
      include: { variants: true }
    });
    testVariantId = product.variants[0].id;

    const warehouse = await prisma.db.warehouse.create({ data: { name: 'Kho E2E', location: 'HN' } });
    
    // Bơm 10 sản phẩm vào kho
    await prisma.db.inventory.create({
      data: { warehouseId: warehouse.id, variantId: testVariantId, quantity: 10 }
    });

    // Tạo mã giảm giá có giới hạn (limit: 5)
    await prisma.db.voucher.create({
      data: { code: testVoucherCode, value: 50000, limit: 5, count: 0 }
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  // THỰC THI HÀNH TRÌNH KHÁCH HÀNG
  it('Bước 1: Khách hàng đăng ký và đăng nhập lấy Token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    accessToken = loginRes.body.data.accessToken;
    expect(accessToken).toBeDefined();
  });

  it('Bước 2: Khách hàng thêm 2 sản phẩm vào giỏ hàng', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/carts/add') 
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ variantId: testVariantId, quantity: 2 })
      .expect(201); 

    const cartRes = await request(app.getHttpServer())
      .get('/api/v1/carts/my-cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cartRes.body.cartItems.length).toBe(1);
    expect(cartRes.body.cartItems[0].quantity).toBe(2);
  });

  it('Bước 3: Thực hiện Đặt hàng (Checkout) có áp dụng Voucher', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ voucherCode: testVoucherCode }) 
      .expect(201);
    console.log('CART RESPONSE:', JSON.stringify(orderRes.body, null, 2));

    const orderId = orderRes.body.id;
    expect(orderId).toBeDefined();
    expect(orderRes.body.status).toBe(OrderStatus.PENDING);
  });

  // KIỂM CHỨNG TÍNH TOÀN VẸN CỦA DỮ LIỆU 
  it('Bước 4.1: Giỏ hàng phải được xóa sạch sau khi checkout', async () => {
    const cartRes = await request(app.getHttpServer())
      .get('/api/v1/carts/my-cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(cartRes.body.cartItems.length).toBe(0);
  });

  it('Bước 4.2: Tồn kho phải bị trừ đi đúng 2 sản phẩm', async () => {
    // Ban đầu set 10, mua 2, phải còn 8
    const inventory = await prisma.db.inventory.findFirst({
      where: { variantId: testVariantId }
    });

    expect(inventory?.quantity).toBe(8);
  });

  it('Bước 4.3: Số lượt sử dụng Voucher (count) phải tăng lên 1', async () => {
    const voucher = await prisma.db.voucher.findUnique({
      where: { code: testVoucherCode }
    });

    expect(voucher?.count).toBe(1);
  });

  it('Bước 4.4: Lịch sử sử dụng Voucher (VoucherUsage) phải được ghi lại', async () => {
    const usageHistory = await prisma.db.voucherUsage.findFirst({
      where: { voucher: { code: testVoucherCode } },
      include: { user: true }
    });

    expect(usageHistory).toBeDefined();
    expect(usageHistory?.user.email).toBe(testUser.email);
  });
});