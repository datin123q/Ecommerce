import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';

describe('Order Flow & Validation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let accessToken: string;
  let variantId: string;
  let warehouseId: string;

  const testUser = {
    email: 'e2e_tester_full@example.com',
    password: 'Password123!',
    fullName: 'E2E Full Tester',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Dọn dẹp DB trước khi test
    await prisma.voucherUsage.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.inventoryTransaction.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany({ where: { email: testUser.email } });

    const category = await prisma.category.create({
      data: { name: 'Áo Nam E2E Full', description: 'Category' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Áo thun Full Test',
        description: 'Desc',
        price: 150000,
        categoryId: category.id,
        variants: {
          create: [{ sku: 'E2E-FULL-SKU', name: 'Đỏ', variant: 'Size M' }],
        },
      },
      include: { variants: true },
    });

    variantId = product.variants[0].id;

    const warehouse = await prisma.warehouse.create({
      data: { name: 'Kho E2E Full', location: 'HN' },
    });
    warehouseId = warehouse.id;

    await prisma.inventory.create({
      data: { warehouseId, variantId, quantity: 2 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Sad Paths & Validations', () => {
    it('/auth/register (POST) - Lỗi thiếu thông tin bắt buộc', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'invalid-email' }) 
        .expect(400); 
    });

    it('/auth/login (POST) - Lỗi đăng nhập sai mật khẩu', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: 'WrongPassword!' })
        .expect(401); 
    });

    it('/orders/checkout (POST) - Lỗi đặt hàng khi chưa đăng nhập (Chưa có Token)', async () => {
      await request(app.getHttpServer())
        .post('/orders/checkout')
        .send({})
        .expect(401);
    });
  });

  describe('Happy Path & Business Logic', () => {
    it('/auth/register (POST) - Đăng ký thành công', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('id');
    });

    it('/auth/login (POST) - Đăng nhập lấy token thành công', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      accessToken = res.body.accessToken;
    });

    it('/orders/checkout (POST) - Lỗi giỏ hàng trống khi đặt hàng', async () => {
      await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('/carts/add (POST) - Lỗi mua vượt quá tồn kho hệ thống', async () => {
      await request(app.getHttpServer())
        .post('/carts/add')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantId, quantity: 10 })
        .expect(201); 

      const res = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400); 

      expect(res.body.message).toContain('không đủ tồn kho');
    });

    it('/carts/add (POST) - Thêm lại số lượng hợp lệ và Đặt hàng thành công', async () => {
      await prisma.cartItem.updateMany({
        where: { variantId },
        data: { quantity: 2 },
      });

      const res = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.totalAmount).toBe(300000); 

      const inventory = await prisma.inventory.findUnique({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(inventory?.quantity).toBe(0);
    });
  });
});